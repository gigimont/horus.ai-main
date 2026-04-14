# Network Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an interactive force-directed graph page (`/network`) that visualises relationship edges between targets within a roll-up scenario.

**Architecture:** Supabase `network_edges` table stores AI-identified pairwise relationships. FastAPI `network_service.py` uses Claude + itertools.combinations to batch-analyse target pairs. A D3 force simulation (client-only, SSR-safe) renders draggable nodes + typed edges. Edge type filters, strength slider, and stats panel round out the UI.

**Tech Stack:** FastAPI + Supabase PostgreSQL + Anthropic Claude (`claude-sonnet-4-20250514`) + Next.js 16 App Router + D3 v7 + shadcn/ui + Tailwind CSS + lucide-react + sonner

---

## Schema note

The spec references `rollup_strategies` — that table does **not exist**. The actual table is `rollup_scenarios`. All code must use:
- Table: `rollup_scenarios`
- FK column name in `network_edges`: `scenario_id`
- RLS: always `get_tenant_id()`, never `current_setting()`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/012_network_edges.sql` | `network_edges` table + RLS + indexes |
| Create | `apps/api/services/network_service.py` | AI pairwise analysis via Claude |
| Create | `apps/api/routers/network.py` | 4 REST endpoints |
| Modify | `apps/api/main.py` | Register network router |
| Create | `tests/network/conftest.py` | Shared fixtures for network tests |
| Create | `tests/network/test_network_service.py` | 5 unit tests |
| Create | `tests/network/test_network_api.py` | 5 API tests |
| Modify | `apps/web/lib/api/client.ts` | `NetworkEdge`, `NetworkStats` interfaces + `api.network` methods |
| Create | `apps/web/app/(dashboard)/network/page.tsx` | Strategy selector + lazy-loaded graph |
| Create | `apps/web/app/(dashboard)/network/components/NetworkGraph.tsx` | D3 force-directed graph (client-only) |
| Modify | `apps/web/components/layout/Sidebar.tsx` | Add `/network` nav item with `Share2` icon |

---

## Task 1: Migration — `network_edges` table

**Files:**
- Create: `supabase/migrations/012_network_edges.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/012_network_edges.sql
create table if not exists network_edges (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  scenario_id       uuid not null references rollup_scenarios(id) on delete cascade,
  source_target_id  uuid not null references targets(id),
  dest_target_id    uuid not null references targets(id),
  edge_type         text not null check (edge_type in (
                      'supply_chain', 'geographic', 'industry',
                      'customer_overlap', 'vendor_overlap'
                    )),
  strength          float not null default 0.5 check (strength >= 0 and strength <= 1),
  description       text,
  metadata          jsonb default '{}',
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table network_edges enable row level security;

create policy "tenant_isolation" on network_edges
  for all using (tenant_id = get_tenant_id());

create index idx_network_edges_scenario on network_edges(scenario_id);
create index idx_network_edges_source   on network_edges(source_target_id);
create index idx_network_edges_dest     on network_edges(dest_target_id);

create unique index idx_network_edges_unique
  on network_edges(scenario_id, source_target_id, dest_target_id, edge_type);
```

- [ ] **Step 2: Push to Supabase**

Run from repo root:
```bash
npx supabase db push
```
Expected: migration applied without error.

- [ ] **Step 3: Commit**

```bash
TREE=$(git write-tree)
PARENT=$(git rev-parse HEAD)
COMMIT=$(echo "feat: add network_edges migration" | git commit-tree $TREE -p $PARENT)
git update-ref refs/heads/main $COMMIT
git push
```

---

## Task 2: `network_service.py` + tests

**Files:**
- Create: `apps/api/services/network_service.py`
- Create: `tests/network/conftest.py`
- Create: `tests/network/test_network_service.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/network/conftest.py
import pytest
import os

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

TARGET_A = {
    "id": "aaaaaaaa-0000-0000-0000-000000000001",
    "name": "Stahl GmbH",
    "industry": "Metal fabrication",
    "city": "Stuttgart",
    "country": "Germany",
    "description": "Precision steel parts for automotive OEMs",
    "employee_count": 120,
    "revenue_eur": 8000000,
}

TARGET_B = {
    "id": "bbbbbbbb-0000-0000-0000-000000000002",
    "name": "Metall AG",
    "industry": "Metal fabrication",
    "city": "Munich",
    "country": "Germany",
    "description": "Stamped metal components for automotive",
    "employee_count": 90,
    "revenue_eur": 6000000,
}

TARGET_C = {
    "id": "cccccccc-0000-0000-0000-000000000003",
    "name": "Kunststoff KG",
    "industry": "Plastics",
    "city": "Frankfurt",
    "country": "Germany",
    "description": "Injection moulded plastic housings",
    "employee_count": 60,
    "revenue_eur": 4000000,
}
```

```python
# tests/network/test_network_service.py
import pytest
from unittest.mock import patch, MagicMock
from services.network_service import analyse_network


MOCK_RESPONSE = [
    {
        "pair_index": 0,
        "edges": [
            {
                "edge_type": "supply_chain",
                "strength": 0.8,
                "description": "Both supply automotive OEMs in southern Germany"
            },
            {
                "edge_type": "geographic",
                "strength": 0.6,
                "description": "Both located in Baden-Württemberg / Bavaria corridor"
            }
        ]
    },
    {
        "pair_index": 1,
        "edges": []
    },
    {
        "pair_index": 2,
        "edges": [
            {
                "edge_type": "industry",
                "strength": 0.4,
                "description": "Adjacent manufacturing sectors"
            }
        ]
    }
]


def make_mock_client(response_json):
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text=__import__('json').dumps(response_json))]
    mock_client = MagicMock()
    mock_client.messages.create.return_value = mock_msg
    return mock_client


@pytest.fixture
def targets(request):
    from conftest import TARGET_A, TARGET_B, TARGET_C
    return [TARGET_A, TARGET_B, TARGET_C]


@pytest.mark.asyncio
async def test_returns_edges_for_related_pairs(targets):
    with patch("services.network_service.client", make_mock_client(MOCK_RESPONSE)):
        edges = await analyse_network(targets, "Automotive Roll-up")
    assert len(edges) == 3  # 2 from pair 0 + 0 from pair 1 + 1 from pair 2


@pytest.mark.asyncio
async def test_edge_fields_present(targets):
    with patch("services.network_service.client", make_mock_client(MOCK_RESPONSE)):
        edges = await analyse_network(targets, "Test")
    for edge in edges:
        assert "source_target_id" in edge
        assert "dest_target_id" in edge
        assert "edge_type" in edge
        assert "strength" in edge
        assert "description" in edge


@pytest.mark.asyncio
async def test_source_dest_ids_come_from_targets(targets):
    with patch("services.network_service.client", make_mock_client(MOCK_RESPONSE)):
        edges = await analyse_network(targets, "Test")
    supply_chain_edge = next(e for e in edges if e["edge_type"] == "supply_chain")
    assert supply_chain_edge["source_target_id"] == targets[0]["id"]
    assert supply_chain_edge["dest_target_id"] == targets[1]["id"]


@pytest.mark.asyncio
async def test_fewer_than_two_targets_returns_empty():
    edges = await analyse_network([{"id": "x", "name": "Solo"}], "Test")
    assert edges == []


@pytest.mark.asyncio
async def test_empty_pairs_not_included(targets):
    with patch("services.network_service.client", make_mock_client(MOCK_RESPONSE)):
        edges = await analyse_network(targets, "Test")
    # pair_index 1 (A vs C) has no edges — none should appear for that pair
    # A-C pair: source=A, dest=C
    a_c_edges = [
        e for e in edges
        if e["source_target_id"] == targets[0]["id"]
        and e["dest_target_id"] == targets[2]["id"]
    ]
    assert len(a_c_edges) == 0
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && python -m pytest tests/network/test_network_service.py -v 2>&1 | head -30
```
Expected: ImportError or ModuleNotFoundError (service doesn't exist yet).

- [ ] **Step 3: Implement `network_service.py`**

```python
# apps/api/services/network_service.py
"""
Network edge discovery service.
Analyses pairwise relationships between targets in a roll-up scenario using Claude.
"""
import itertools
import json
import logging
from anthropic import Anthropic

client = Anthropic()
logger = logging.getLogger(__name__)

NETWORK_SYSTEM_PROMPT = """You are an M&A network analyst specialising in SME supply chain mapping.

Given two SME targets, identify ALL meaningful business relationships between them.
Consider: shared customers/vendors, geographic proximity, industry supply chain position,
complementary capabilities, overlapping markets, and consolidation synergies.

For each relationship found, return:
- edge_type: one of "supply_chain", "geographic", "industry", "customer_overlap", "vendor_overlap"
- strength: 0.0 to 1.0 (how strong/certain this connection is)
- description: 1-2 sentence explanation

If no meaningful relationship exists between a pair, return an empty array for that pair.
Be specific and analytical — do not invent connections not supported by the data.

Respond ONLY with valid JSON. No preamble, no markdown."""


async def analyse_network(targets: list[dict], scenario_name: str) -> list[dict]:
    """
    Analyse all unique target pairs and return edges found.
    Returns list of edge dicts with source_target_id, dest_target_id, edge_type, strength, description.
    """
    if len(targets) < 2:
        return []

    pairs = list(itertools.combinations(targets, 2))
    all_edges: list[dict] = []
    batch_size = 10

    for batch_start in range(0, len(pairs), batch_size):
        batch = pairs[batch_start : batch_start + batch_size]

        pair_descriptions = []
        for idx, (t1, t2) in enumerate(batch):
            pair_descriptions.append({
                "pair_index": idx,
                "target_a": {
                    "id": t1["id"],
                    "name": t1["name"],
                    "industry": t1.get("industry") or t1.get("industry_label", "unknown"),
                    "city": t1.get("city", "unknown"),
                    "country": t1.get("country", "unknown"),
                    "description": t1.get("description", ""),
                    "employee_count": t1.get("employee_count"),
                    "revenue_eur": t1.get("revenue_eur"),
                },
                "target_b": {
                    "id": t2["id"],
                    "name": t2["name"],
                    "industry": t2.get("industry") or t2.get("industry_label", "unknown"),
                    "city": t2.get("city", "unknown"),
                    "country": t2.get("country", "unknown"),
                    "description": t2.get("description", ""),
                    "employee_count": t2.get("employee_count"),
                    "revenue_eur": t2.get("revenue_eur"),
                },
            })

        user_prompt = (
            f'Strategy: "{scenario_name}"\n\n'
            f"Analyse these target pairs and identify business relationships:\n\n"
            f"{json.dumps(pair_descriptions, indent=2)}\n\n"
            "Return a JSON array with one entry per pair:\n"
            '[{"pair_index": 0, "edges": [{"edge_type": "supply_chain", "strength": 0.7, "description": "..."}]}, ...]\n\n'
            "Include a pair_index entry for every pair, even if edges is empty."
        )

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            system=NETWORK_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        raw = response.content[0].text.strip()
        result: list[dict] = json.loads(raw)

        for item in result:
            pair_idx = item["pair_index"]
            t1, t2 = batch[pair_idx]
            for edge in item.get("edges", []):
                all_edges.append({
                    "source_target_id": t1["id"],
                    "dest_target_id": t2["id"],
                    "edge_type": edge["edge_type"],
                    "strength": float(edge["strength"]),
                    "description": edge.get("description", ""),
                })

    return all_edges
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd apps/api && python -m pytest tests/network/test_network_service.py -v
```
Expected: 5 tests PASSED.

- [ ] **Step 5: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
TREE=$(git write-tree)
PARENT=$(git rev-parse HEAD)
COMMIT=$(echo "feat: network_service — AI pairwise edge analysis" | git commit-tree $TREE -p $PARENT)
git update-ref refs/heads/main $COMMIT
git push
```

---

## Task 3: `routers/network.py` + API tests

**Files:**
- Create: `apps/api/routers/network.py`
- Create: `tests/network/test_network_api.py`

- [ ] **Step 1: Write the failing API tests**

```python
# tests/network/test_network_api.py
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

TENANT_ID = "00000000-0000-0000-0000-000000000001"
SCENARIO_ID = "11111111-0000-0000-0000-000000000001"
TARGET_ID_A = "aaaaaaaa-0000-0000-0000-000000000001"
TARGET_ID_B = "bbbbbbbb-0000-0000-0000-000000000002"


def make_app():
    import os
    os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
    os.environ.setdefault("SUPABASE_KEY", "test-key")
    os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
    from main import app
    return app


def make_db_mock(scenario_data=None, targets_data=None, edges_data=None):
    db = MagicMock()

    def table_side_effect(name):
        t = MagicMock()
        t.select.return_value = t
        t.eq.return_value = t
        t.insert.return_value = t
        t.delete.return_value = t
        t.single.return_value = t

        if name == "rollup_scenarios":
            t.execute.return_value = MagicMock(
                data=scenario_data or {"id": SCENARIO_ID, "name": "Test Scenario", "tenant_id": TENANT_ID}
            )
        elif name == "rollup_scenario_targets":
            t.execute.return_value = MagicMock(
                data=targets_data or [
                    {"targets": {"id": TARGET_ID_A, "name": "Stahl GmbH", "industry_label": "Metal"}},
                    {"targets": {"id": TARGET_ID_B, "name": "Metall AG", "industry_label": "Metal"}},
                ]
            )
        elif name == "network_edges":
            t.execute.return_value = MagicMock(
                data=edges_data or [
                    {
                        "id": "edge-1",
                        "scenario_id": SCENARIO_ID,
                        "source_target_id": TARGET_ID_A,
                        "dest_target_id": TARGET_ID_B,
                        "edge_type": "supply_chain",
                        "strength": 0.8,
                        "description": "Both supply automotive OEMs",
                        "metadata": {},
                    }
                ]
            )
        return t

    db.table.side_effect = table_side_effect
    return db


@pytest.fixture
def client():
    app = make_app()
    with patch("dependencies.get_db") as mock_get_db, \
         patch("dependencies.get_tenant_id") as mock_get_tenant:
        mock_get_tenant.return_value = TENANT_ID
        mock_get_db.return_value = make_db_mock()
        with TestClient(app) as c:
            yield c, mock_get_db


def test_analyse_returns_201(client):
    c, mock_get_db = client
    mock_get_db.return_value = make_db_mock()
    with patch("routers.network.analyse_network", new_callable=AsyncMock) as mock_analyse:
        mock_analyse.return_value = [
            {
                "source_target_id": TARGET_ID_A,
                "dest_target_id": TARGET_ID_B,
                "edge_type": "supply_chain",
                "strength": 0.8,
                "description": "Connected",
            }
        ]
        res = c.post(f"/network/analyse/{SCENARIO_ID}")
    assert res.status_code == 201
    data = res.json()
    assert data["edges_created"] == 1
    assert data["target_count"] == 2


def test_analyse_404_unknown_scenario(client):
    c, mock_get_db = client
    db = make_db_mock(scenario_data=None)
    db.table("rollup_scenarios").execute.return_value = MagicMock(data=None)
    mock_get_db.return_value = db
    res = c.post(f"/network/analyse/nonexistent-id")
    assert res.status_code == 404


def test_get_network_returns_nodes_and_edges(client):
    c, _ = client
    res = c.get(f"/network/{SCENARIO_ID}")
    assert res.status_code == 200
    data = res.json()
    assert "nodes" in data
    assert "edges" in data


def test_get_stats_returns_metrics(client):
    c, _ = client
    res = c.get(f"/network/{SCENARIO_ID}/stats")
    assert res.status_code == 200
    data = res.json()
    assert "total_edges" in data
    assert "avg_strength" in data
    assert "edge_type_distribution" in data


def test_delete_network_returns_204(client):
    c, _ = client
    res = c.delete(f"/network/{SCENARIO_ID}")
    assert res.status_code == 204
```

- [ ] **Step 2: Confirm tests fail**

```bash
cd apps/api && python -m pytest tests/network/test_network_api.py -v 2>&1 | head -30
```
Expected: ImportError or 404 (router not registered yet).

- [ ] **Step 3: Implement `routers/network.py`**

```python
# apps/api/routers/network.py
import logging
from fastapi import APIRouter, Depends, HTTPException
from supabase import Client
from dependencies import get_db, get_tenant_id
from services.network_service import analyse_network

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/analyse/{scenario_id}", status_code=201)
async def analyse_scenario_network(
    scenario_id: str,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    """AI-analyse all target pairs in a scenario and upsert network_edges."""
    # Verify scenario exists and belongs to tenant
    scenario_res = (
        db.table("rollup_scenarios")
        .select("id, name")
        .eq("id", scenario_id)
        .eq("tenant_id", tenant_id)
        .single()
        .execute()
    )
    if not scenario_res.data:
        raise HTTPException(404, "Scenario not found")
    scenario_name = scenario_res.data["name"]

    # Fetch all targets for this scenario
    targets_res = (
        db.table("rollup_scenario_targets")
        .select("targets(id, name, industry_label, city, country, description, employee_count, revenue_eur)")
        .eq("scenario_id", scenario_id)
        .execute()
    )
    targets = [row["targets"] for row in (targets_res.data or []) if row.get("targets")]

    # Run AI analysis
    edges = await analyse_network(targets, scenario_name)

    # Clear existing edges for this scenario then insert new ones
    db.table("network_edges").delete().eq("scenario_id", scenario_id).eq("tenant_id", tenant_id).execute()

    if edges:
        rows = [
            {
                "tenant_id": tenant_id,
                "scenario_id": scenario_id,
                **edge,
            }
            for edge in edges
        ]
        db.table("network_edges").insert(rows).execute()

    return {"edges_created": len(edges), "target_count": len(targets)}


@router.get("/{scenario_id}")
async def get_network(
    scenario_id: str,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    """Return all nodes and edges for a scenario network."""
    # Nodes: targets in this scenario
    targets_res = (
        db.table("rollup_scenario_targets")
        .select(
            "targets(id, name, industry_label, city, country, revenue_eur, "
            "target_scores(overall_score))"
        )
        .eq("scenario_id", scenario_id)
        .execute()
    )
    nodes = [row["targets"] for row in (targets_res.data or []) if row.get("targets")]

    # Edges
    edges_res = (
        db.table("network_edges")
        .select("*")
        .eq("scenario_id", scenario_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    edges = edges_res.data or []

    return {"nodes": nodes, "edges": edges}


@router.get("/{scenario_id}/stats")
async def get_network_stats(
    scenario_id: str,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    """Return network metrics for a scenario."""
    edges_res = (
        db.table("network_edges")
        .select("*")
        .eq("scenario_id", scenario_id)
        .eq("tenant_id", tenant_id)
        .execute()
    )
    edges = edges_res.data or []

    if not edges:
        return {
            "total_edges": 0,
            "avg_strength": 0.0,
            "edge_type_distribution": {},
            "most_connected": None,
            "isolated_targets": [],
        }

    avg_strength = sum(e["strength"] for e in edges) / len(edges)

    distribution: dict[str, int] = {}
    for e in edges:
        distribution[e["edge_type"]] = distribution.get(e["edge_type"], 0) + 1

    connection_count: dict[str, int] = {}
    for e in edges:
        connection_count[e["source_target_id"]] = connection_count.get(e["source_target_id"], 0) + 1
        connection_count[e["dest_target_id"]] = connection_count.get(e["dest_target_id"], 0) + 1

    most_connected_id = max(connection_count, key=lambda k: connection_count[k])

    # Get name of most connected target
    target_res = (
        db.table("rollup_scenario_targets")
        .select("targets(id, name)")
        .eq("scenario_id", scenario_id)
        .execute()
    )
    target_name_map = {
        row["targets"]["id"]: row["targets"]["name"]
        for row in (target_res.data or [])
        if row.get("targets")
    }

    # Targets with zero edges
    connected_ids = set(connection_count.keys())
    all_ids = set(target_name_map.keys())
    isolated = list(all_ids - connected_ids)

    return {
        "total_edges": len(edges),
        "avg_strength": round(avg_strength, 3),
        "edge_type_distribution": distribution,
        "most_connected": {
            "target_id": most_connected_id,
            "name": target_name_map.get(most_connected_id, "Unknown"),
            "edge_count": connection_count[most_connected_id],
        },
        "isolated_targets": isolated,
    }


@router.delete("/{scenario_id}", status_code=204)
async def clear_network(
    scenario_id: str,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    """Delete all edges for a scenario."""
    db.table("network_edges").delete().eq("scenario_id", scenario_id).eq("tenant_id", tenant_id).execute()
```

- [ ] **Step 4: Run tests — confirm pass**

```bash
cd apps/api && python -m pytest tests/network/ -v
```
Expected: all 10 tests PASSED.

- [ ] **Step 5: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
TREE=$(git write-tree)
PARENT=$(git rev-parse HEAD)
COMMIT=$(echo "feat: network router — 4 endpoints for edge analysis + retrieval" | git commit-tree $TREE -p $PARENT)
git update-ref refs/heads/main $COMMIT
git push
```

---

## Task 4: Register router in `main.py` + deploy to Fly.io

**Files:**
- Modify: `apps/api/main.py`

- [ ] **Step 1: Add network router import + registration**

Current line 3:
```python
from routers import targets, scoring, clusters, chat, exports, pipeline, billing, rollup, scenarios
```
New line 3:
```python
from routers import targets, scoring, clusters, chat, exports, pipeline, billing, rollup, scenarios, network
```

After line 29 (`app.include_router(scenarios.router ...)`), add:
```python
app.include_router(network.router, prefix="/network", tags=["network"])
```

- [ ] **Step 2: Confirm local server starts**

```bash
cd apps/api && python -c "from main import app; print('OK')"
```
Expected: prints `OK` with no import errors.

- [ ] **Step 3: Deploy to Fly.io**

```bash
cd apps/api && ~/.fly/bin/flyctl deploy 2>&1 | tail -20
```
Expected: `v... deployed successfully`

- [ ] **Step 4: Confirm health**

```bash
curl https://searchfund-api.fly.dev/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 5: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
TREE=$(git write-tree)
PARENT=$(git rev-parse HEAD)
COMMIT=$(echo "feat: register network router in main.py" | git commit-tree $TREE -p $PARENT)
git update-ref refs/heads/main $COMMIT
git push
```

---

## Task 5: Install D3 + TypeScript interfaces + API client

**Files:**
- Modify: `apps/web/lib/api/client.ts`

- [ ] **Step 1: Install D3**

```bash
cd apps/web && pnpm add d3 @types/d3
```
Expected: packages added to `package.json`.

- [ ] **Step 2: Add TypeScript interfaces to `client.ts`**

After the `ScenarioResult` interface (line ~353 in the current file), add:

```typescript
export interface NetworkEdge {
  id: string
  scenario_id: string
  source_target_id: string
  dest_target_id: string
  edge_type: 'supply_chain' | 'geographic' | 'industry' | 'customer_overlap' | 'vendor_overlap'
  strength: number
  description: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface NetworkStats {
  total_edges: number
  avg_strength: number
  edge_type_distribution: Record<string, number>
  most_connected: { target_id: string; name: string; edge_count: number } | null
  isolated_targets: string[]
}

export interface NetworkGraph {
  nodes: Target[]
  edges: NetworkEdge[]
}
```

- [ ] **Step 3: Add `api.network` methods to the `api` object**

After the `scenarios` block (before the closing `}` of the `api` export), add:

```typescript
  network: {
    analyse: (scenarioId: string) =>
      apiFetch<{ edges_created: number; target_count: number }>(
        `/network/analyse/${scenarioId}`,
        { method: 'POST' }
      ),
    get: (scenarioId: string) =>
      apiFetch<NetworkGraph>(`/network/${scenarioId}`),
    stats: (scenarioId: string) =>
      apiFetch<NetworkStats>(`/network/${scenarioId}/stats`),
    clear: (scenarioId: string) =>
      apiFetch<void>(`/network/${scenarioId}`, { method: 'DELETE' }),
  },
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
TREE=$(git write-tree)
PARENT=$(git rev-parse HEAD)
COMMIT=$(echo "feat: network API client + TypeScript interfaces + D3 dependency" | git commit-tree $TREE -p $PARENT)
git update-ref refs/heads/main $COMMIT
git push
```

---

## Task 6: `/network` page + `NetworkGraph` component

**Files:**
- Create: `apps/web/app/(dashboard)/network/page.tsx`
- Create: `apps/web/app/(dashboard)/network/components/NetworkGraph.tsx`

### Design constraints (from CLAUDE.md + ui-ux-pro-max)
- `rounded-sm` everywhere, never `rounded-lg` or larger
- No shadows, no gradients
- No `alert()` / `confirm()` — use sonner toasts
- Palantir-grade institutional aesthetic: `bg-background`, `border`, `text-foreground`
- Edge type colors: supply_chain=blue-500, geographic=green-500, industry=purple-500, customer_overlap=orange-500, vendor_overlap=teal-500
- Node colors by score: ≥7 → green-500, 4-7 → amber-500, <4 → red-500, no score → slate-400
- All interactive elements min 44×44px touch target

- [ ] **Step 1: Create `NetworkGraph.tsx` (client-only D3 component)**

```tsx
// apps/web/app/(dashboard)/network/components/NetworkGraph.tsx
'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { NetworkEdge, Target } from '@/lib/api/client'
import { useRouter } from 'next/navigation'

const EDGE_COLORS: Record<string, string> = {
  supply_chain:     '#3b82f6', // blue-500
  geographic:       '#22c55e', // green-500
  industry:         '#a855f7', // purple-500
  customer_overlap: '#f97316', // orange-500
  vendor_overlap:   '#14b8a6', // teal-500
}

function nodeColor(score: number | undefined): string {
  if (score === undefined || score === null) return '#94a3b8' // slate-400
  if (score >= 7) return '#22c55e'  // green-500
  if (score >= 4) return '#f59e0b'  // amber-500
  return '#ef4444'                   // red-500
}

function nodeRadius(revenue: number | null | undefined): number {
  if (!revenue) return 18
  return Math.max(14, Math.min(32, 12 + Math.sqrt(revenue / 1_000_000) * 2))
}

interface Props {
  nodes: Target[]
  edges: NetworkEdge[]
  activeEdgeTypes: Set<string>
  minStrength: number
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  name: string
  score?: number
  revenue: number | null | undefined
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  edge_type: string
  strength: number
  description: string
  id: string
}

export default function NetworkGraph({ nodes, edges, activeEdgeTypes, minStrength }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    const container = svgRef.current.parentElement!
    const width = container.clientWidth || 800
    const height = container.clientHeight || 600

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('width', width).attr('height', height)

    const visibleEdges = edges.filter(
      e => activeEdgeTypes.has(e.edge_type) && e.strength >= minStrength
    )

    const simNodes: SimNode[] = nodes.map(n => ({
      id: n.id,
      name: n.name,
      score: n.target_scores?.[0]?.overall_score,
      revenue: n.revenue_eur,
    }))

    const nodeById = new Map(simNodes.map(n => [n.id, n]))

    const simLinks: SimLink[] = visibleEdges
      .filter(e => nodeById.has(e.source_target_id) && nodeById.has(e.dest_target_id))
      .map(e => ({
        source: e.source_target_id,
        target: e.dest_target_id,
        edge_type: e.edge_type,
        strength: e.strength,
        description: e.description,
        id: e.id,
      }))

    const g = svg.append('g')

    // Zoom + pan
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 3])
        .on('zoom', (event) => g.attr('transform', event.transform))
    )

    const simulation = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks)
        .id(d => d.id)
        .distance(d => 120 - d.strength * 60)
        .strength(d => d.strength * 0.4)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide<SimNode>().radius(d => nodeRadius(d.revenue) + 8))

    // Tooltip
    const tooltip = d3.select('body')
      .selectAll<HTMLDivElement, unknown>('.network-tooltip')
      .data([null])
      .join('div')
      .attr('class', 'network-tooltip')
      .style('position', 'fixed')
      .style('pointer-events', 'none')
      .style('background', '#0f172a')
      .style('border', '1px solid #1e293b')
      .style('color', '#f1f5f9')
      .style('padding', '8px 12px')
      .style('border-radius', '2px')
      .style('font-size', '12px')
      .style('max-width', '220px')
      .style('z-index', '9999')
      .style('opacity', 0)

    // Links
    const link = g.append('g').selectAll<SVGLineElement, SimLink>('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', d => EDGE_COLORS[d.edge_type] ?? '#64748b')
      .attr('stroke-width', d => Math.max(1, d.strength * 3))
      .attr('stroke-dasharray', d => d.strength < 0.3 ? '4 3' : null)
      .attr('stroke-opacity', 0.7)
      .style('cursor', 'pointer')
      .on('mouseover', (event, d) => {
        tooltip
          .style('opacity', 1)
          .html(`<strong>${d.edge_type.replace(/_/g, ' ')}</strong><br/>Strength: ${d.strength.toFixed(2)}<br/>${d.description}`)
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', `${event.clientX + 14}px`)
          .style('top', `${event.clientY - 10}px`)
      })
      .on('mouseout', () => tooltip.style('opacity', 0))

    // Nodes
    const node = g.append('g').selectAll<SVGGElement, SimNode>('g')
      .data(simNodes)
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null; d.fy = null
          })
      )
      .on('click', (_, d) => router.push(`/discovery/${d.id}`))
      .on('mouseover', (event, d) => {
        tooltip
          .style('opacity', 1)
          .html(`<strong>${d.name}</strong><br/>Score: ${d.score !== undefined ? d.score.toFixed(1) : 'N/A'}`)
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', `${event.clientX + 14}px`)
          .style('top', `${event.clientY - 10}px`)
      })
      .on('mouseout', () => tooltip.style('opacity', 0))

    node.append('circle')
      .attr('r', d => nodeRadius(d.revenue))
      .attr('fill', d => nodeColor(d.score))
      .attr('fill-opacity', 0.9)
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 2)

    node.append('text')
      .text(d => d.name.length > 14 ? d.name.slice(0, 13) + '…' : d.name)
      .attr('text-anchor', 'middle')
      .attr('dy', d => nodeRadius(d.revenue) + 13)
      .attr('font-size', 11)
      .attr('fill', '#cbd5e1')
      .attr('pointer-events', 'none')

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as SimNode).x ?? 0)
        .attr('y1', d => (d.source as SimNode).y ?? 0)
        .attr('x2', d => (d.target as SimNode).x ?? 0)
        .attr('y2', d => (d.target as SimNode).y ?? 0)
      node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => {
      simulation.stop()
      d3.select('body').selectAll('.network-tooltip').remove()
    }
  }, [nodes, edges, activeEdgeTypes, minStrength, router])

  return <svg ref={svgRef} className="w-full h-full" />
}
```

- [ ] **Step 2: Create `page.tsx`**

```tsx
// apps/web/app/(dashboard)/network/page.tsx
'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState, useCallback } from 'react'
import { api, NetworkEdge, NetworkGraph, NetworkStats, RollupScenario } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import Link from 'next/link'

const NetworkGraphComponent = dynamic(
  () => import('./components/NetworkGraph'),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading graph…</div> }
)

const EDGE_TYPE_LABELS: Record<string, string> = {
  supply_chain:     'Supply Chain',
  geographic:       'Geographic',
  industry:         'Industry',
  customer_overlap: 'Customer Overlap',
  vendor_overlap:   'Vendor Overlap',
}

const EDGE_TYPE_COLORS: Record<string, string> = {
  supply_chain:     'bg-blue-500',
  geographic:       'bg-green-500',
  industry:         'bg-purple-500',
  customer_overlap: 'bg-orange-500',
  vendor_overlap:   'bg-teal-500',
}

type PageState = 'idle' | 'analysing' | 'loaded' | 'error'

export default function NetworkPage() {
  const [scenarios, setScenarios] = useState<RollupScenario[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [network, setNetwork] = useState<NetworkGraph | null>(null)
  const [stats, setStats] = useState<NetworkStats | null>(null)
  const [state, setState] = useState<PageState>('idle')
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<string>>(
    new Set(Object.keys(EDGE_TYPE_LABELS))
  )
  const [minStrength, setMinStrength] = useState(0)

  useEffect(() => {
    api.rollup.list().then(r => setScenarios(r.data)).catch(() => {})
  }, [])

  const loadNetwork = useCallback(async (scenarioId: string) => {
    try {
      const [graph, s] = await Promise.all([
        api.network.get(scenarioId),
        api.network.stats(scenarioId),
      ])
      setNetwork(graph)
      setStats(s)
      setState(graph.edges.length > 0 ? 'loaded' : 'idle')
    } catch {
      setState('error')
    }
  }, [])

  const handleScenarioChange = (id: string) => {
    setSelectedId(id)
    setNetwork(null)
    setStats(null)
    setState('idle')
    if (id) loadNetwork(id)
  }

  const handleAnalyse = async () => {
    if (!selectedId) return
    setState('analysing')
    try {
      const result = await api.network.analyse(selectedId)
      toast.success(`Found ${result.edges_created} connections across ${result.target_count} targets`)
      await loadNetwork(selectedId)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Analysis failed'
      toast.error(msg)
      setState('error')
    }
  }

  const handleReanalyse = async () => {
    if (!selectedId) return
    toast('Re-analysing will clear existing connections. Proceeding…', { duration: 2000 })
    setState('analysing')
    try {
      await api.network.clear(selectedId)
      const result = await api.network.analyse(selectedId)
      toast.success(`Updated: ${result.edges_created} connections found`)
      await loadNetwork(selectedId)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Re-analysis failed'
      toast.error(msg)
      setState('idle')
    }
  }

  const toggleEdgeType = (type: string) => {
    setActiveEdgeTypes(prev => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  const hasEdges = network && network.edges.length > 0
  const noScenarios = scenarios.length === 0

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-6 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Network Builder</h1>
          <p className="text-sm text-muted-foreground">Visualise relationship edges across roll-up targets</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Scenario selector */}
          <select
            className="h-9 rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            value={selectedId}
            onChange={e => handleScenarioChange(e.target.value)}
          >
            <option value="">Select scenario…</option>
            {scenarios.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {selectedId && !hasEdges && state !== 'analysing' && (
            <Button size="sm" onClick={handleAnalyse} disabled={state === 'analysing'}>
              Analyse network
            </Button>
          )}
          {selectedId && hasEdges && (
            <Button size="sm" variant="outline" onClick={handleReanalyse} disabled={state === 'analysing'}>
              Re-analyse
            </Button>
          )}
          {state === 'analysing' && (
            <span className="text-sm text-muted-foreground animate-pulse">Analysing…</span>
          )}
        </div>
      </div>

      {/* Filters row */}
      {hasEdges && (
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs text-muted-foreground">Edge types:</span>
          {Object.entries(EDGE_TYPE_LABELS).map(([type, label]) => (
            <button
              key={type}
              onClick={() => toggleEdgeType(type)}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-sm border transition-opacity ${
                activeEdgeTypes.has(type) ? 'opacity-100' : 'opacity-40'
              } border-input hover:border-foreground/40`}
            >
              <span className={`w-2 h-2 rounded-full ${EDGE_TYPE_COLORS[type]}`} />
              {label}
            </button>
          ))}

          <div className="flex items-center gap-2 ml-4">
            <span className="text-xs text-muted-foreground">Min strength:</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={minStrength}
              onChange={e => setMinStrength(parseFloat(e.target.value))}
              className="w-28 h-1 accent-foreground"
            />
            <span className="text-xs text-muted-foreground w-8">{minStrength.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Graph canvas */}
        <div className="flex-1 border border-border rounded-sm bg-[#0a0f1a] relative overflow-hidden">
          {/* Empty states */}
          {noScenarios && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">No roll-up scenarios yet.</p>
              <Link href="/rollup">
                <Button size="sm" variant="outline">Create a roll-up scenario</Button>
              </Link>
            </div>
          )}
          {!noScenarios && !selectedId && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Select a scenario to begin.</p>
            </div>
          )}
          {selectedId && !hasEdges && state === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <p className="text-sm text-muted-foreground">No connections analysed yet.</p>
              <p className="text-xs text-muted-foreground">Click "Analyse network" to discover relationships.</p>
            </div>
          )}
          {selectedId && !hasEdges && state === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-destructive">Analysis failed. Check backend logs.</p>
            </div>
          )}
          {hasEdges && network && (
            <NetworkGraphComponent
              nodes={network.nodes}
              edges={network.edges}
              activeEdgeTypes={activeEdgeTypes}
              minStrength={minStrength}
            />
          )}
        </div>

        {/* Stats sidebar */}
        {stats && (
          <div className="w-64 shrink-0 border border-border rounded-sm p-4 flex flex-col gap-4 overflow-y-auto">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Network stats</p>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Connections</span>
                  <span className="font-medium">{stats.total_edges}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Avg strength</span>
                  <span className="font-medium">{stats.avg_strength.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">By type</p>
              <div className="space-y-1.5">
                {Object.entries(stats.edge_type_distribution).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${EDGE_TYPE_COLORS[type] ?? 'bg-slate-400'}`} />
                      <span className="text-xs text-muted-foreground">{EDGE_TYPE_LABELS[type] ?? type}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs h-4 px-1.5">{count}</Badge>
                  </div>
                ))}
              </div>
            </div>

            {stats.most_connected && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Most connected</p>
                <Link
                  href={`/discovery/${stats.most_connected.target_id}`}
                  className="text-sm font-medium text-foreground hover:underline"
                >
                  {stats.most_connected.name}
                </Link>
                <p className="text-xs text-muted-foreground">{stats.most_connected.edge_count} edges</p>
              </div>
            )}

            {stats.isolated_targets.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Isolated targets</p>
                <p className="text-xs text-amber-500">{stats.isolated_targets.length} target(s) with no connections</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
TREE=$(git write-tree)
PARENT=$(git rev-parse HEAD)
COMMIT=$(echo "feat: network page + force-directed D3 graph component" | git commit-tree $TREE -p $PARENT)
git update-ref refs/heads/main $COMMIT
git push
```

---

## Task 7: Sidebar navigation update

**Files:**
- Modify: `apps/web/components/layout/Sidebar.tsx`

- [ ] **Step 1: Read the file first to confirm current state**

Read `apps/web/components/layout/Sidebar.tsx` and confirm the current `nav` array and imports.

- [ ] **Step 2: Add `Share2` to the lucide-react import**

Current import line:
```tsx
import { LayoutDashboard, Search, Kanban, Settings, Network, TrendingUp } from 'lucide-react'
```
New import line:
```tsx
import { LayoutDashboard, Search, Kanban, Settings, Network, TrendingUp, Share2 } from 'lucide-react'
```

- [ ] **Step 3: Add the network nav entry**

In the `nav` array, after the Roll-up entry and before Pipeline:
```tsx
  { href: '/network',    label: 'Network',    icon: Share2 },
```

Full updated nav array:
```tsx
const nav = [
  { href: '/dashboard',   label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/discovery',   label: 'Discovery',  icon: Search },
  { href: '/clusters',    label: 'Clusters',   icon: Network },
  { href: '/rollup',      label: 'Roll-up',    icon: TrendingUp },
  { href: '/network',     label: 'Network',    icon: Share2 },
  { href: '/pipeline',    label: 'Pipeline',   icon: Kanban },
  { href: '/settings',    label: 'Settings',   icon: Settings },
]
```

- [ ] **Step 4: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
TREE=$(git write-tree)
PARENT=$(git rev-parse HEAD)
COMMIT=$(echo "feat: add Network nav item to sidebar (Share2 icon)" | git commit-tree $TREE -p $PARENT)
git update-ref refs/heads/main $COMMIT
git push
```

---

## Task 8: Full `pnpm build` verification + final push

**Files:** none (verification only)

- [ ] **Step 1: Full TypeScript build**

```bash
cd apps/web && pnpm build 2>&1 | tail -30
```
Expected: `✓ Compiled successfully` with zero TypeScript errors.

- [ ] **Step 2: Fix any TypeScript errors before proceeding**

If errors appear, fix them. Common issues:
- D3 types: use `as SimNode` casts where needed
- Missing `export` keyword on interfaces
- `d3.zoom` generic type parameter

- [ ] **Step 3: Final git push**

```bash
cd /Users/callmepio/Desktop/horus-main
TREE=$(git write-tree)
PARENT=$(git rev-parse HEAD)
COMMIT=$(echo "chore: verify build + final Network Builder push" | git commit-tree $TREE -p $PARENT)
git update-ref refs/heads/main $COMMIT
git push
```
