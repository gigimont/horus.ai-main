# Scenario Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Scenario Engine that lets Search Fund operators run economic/strategic what-if scenarios against SME acquisition targets, with Claude analyzing score impacts and results persisted for historical comparison.

**Architecture:** `scenario_results` DB table (migration 011) → `scenario_service.py` (Claude call, weighted delta math) → `scenarios.py` router (3 endpoints) → registered in `main.py` → `ScenarioResult` interface + `api.scenarios` in `client.ts` → `ScenarioPanel.tsx` client component → wired into discovery target detail page and rollup TargetRow.

**Tech Stack:** FastAPI + Supabase PostgreSQL (RLS via `get_tenant_id()`) + Anthropic `claude-sonnet-4-20250514` + Next.js 16 App Router + TypeScript + shadcn/ui

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/011_scenario_results.sql` | DB table + RLS |
| Create | `apps/api/services/scenario_service.py` | Claude call, delta math |
| Create | `apps/api/routers/scenarios.py` | 3 HTTP endpoints |
| Modify | `apps/api/main.py` | Register router |
| Create | `tests/scenarios/conftest.py` | pytest fixtures |
| Create | `tests/scenarios/test_scenario_service.py` | Service unit tests |
| Create | `tests/scenarios/test_scenario_api.py` | API integration tests |
| Modify | `apps/web/lib/api/client.ts` | `ScenarioResult` interface + `api.scenarios` |
| Create | `apps/web/app/(dashboard)/discovery/[id]/components/ScenarioPanel.tsx` | Client component |
| Modify | `apps/web/app/(dashboard)/discovery/[id]/page.tsx` | Entry point 1 |
| Modify | `apps/web/app/(dashboard)/rollup/[id]/components/TargetRow.tsx` | Entry point 2 |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/011_scenario_results.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/011_scenario_results.sql
create table if not exists scenario_results (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references tenants(id),
  target_id               uuid not null references targets(id) on delete cascade,
  rollup_scenario_id      uuid references rollup_scenarios(id) on delete set null,
  scenario_type           text not null check (scenario_type in ('macro_shock','industry_shift','succession_trigger')),
  severity                int not null check (severity between 1 and 10),
  description             text not null,
  score_before            jsonb not null,
  score_deltas            jsonb not null,
  implications            text[] not null,
  acquisition_window_effect text not null,
  model_version           text not null default 'v1',
  run_at                  timestamptz not null default now()
);

alter table scenario_results enable row level security;

create policy "tenant isolation" on scenario_results
  using (tenant_id = get_tenant_id());
```

- [ ] **Step 2: Push migration to Supabase**

```bash
cd /Users/callmepio/Desktop/horus-main
npx supabase db push
```

Expected: migration applies without error, `scenario_results` table appears in Supabase dashboard.

- [ ] **Step 3: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git write-tree
# note the tree SHA, then:
git commit-tree <tree-sha> -p $(git rev-parse HEAD) -m "feat: migration 011 — scenario_results table"
git update-ref HEAD <new-commit-sha>
```

---

## Task 2: scenario_service.py (TDD)

**Files:**
- Create: `apps/api/services/scenario_service.py`
- Create: `tests/scenarios/conftest.py`
- Create: `tests/scenarios/test_scenario_service.py`

- [ ] **Step 1: Create conftest**

```python
# tests/scenarios/conftest.py
import os
import sys

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.dGVzdA",
)
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../apps/api")))

import pytest
from unittest.mock import MagicMock
from httpx import AsyncClient, ASGITransport

TENANT_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture
async def scenarios_client():
    """Async HTTP client for scenarios routes with mocked DB and tenant."""
    from main import app
    from dependencies import get_db, get_tenant_id

    mock_db = MagicMock()
    app.dependency_overrides[get_tenant_id] = lambda: TENANT_ID
    app.dependency_overrides[get_db] = lambda: mock_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac, mock_db

    app.dependency_overrides.clear()
```

- [ ] **Step 2: Write failing tests for scenario_service**

```python
# tests/scenarios/test_scenario_service.py
import pytest
import json
from unittest.mock import patch, MagicMock


@pytest.fixture
def sample_target():
    return {
        "id": "target-1",
        "name": "Acme Plumbing GmbH",
        "country": "DE",
        "industry_label": "Plumbing Services",
        "revenue_eur": 2_000_000,
        "employee_count": 25,
        "owner_age_estimate": 62,
        "target_scores": [{
            "transition_score": 7.0,
            "value_score": 6.0,
            "market_score": 5.0,
            "financial_score": 4.0,
            "overall_score": 5.9,
            "scored_at": "2026-01-01T00:00:00Z",
        }],
    }


def _mock_claude(deltas: dict, implications=None, window="Window shifts."):
    payload = {
        "transition_delta": deltas.get("transition", 0),
        "value_delta":      deltas.get("value", 0),
        "market_delta":     deltas.get("market", 0),
        "financial_delta":  deltas.get("financial", 0),
        "implications": implications or ["Point A.", "Point B.", "Point C."],
        "acquisition_window_effect": window,
    }
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text=json.dumps(payload))]
    return mock_msg


@pytest.mark.asyncio
async def test_run_scenario_returns_expected_keys(sample_target):
    with patch("services.scenario_service.client") as mock_client:
        mock_client.messages.create.return_value = _mock_claude({"transition": 2, "value": -1})
        from services.scenario_service import run_scenario
        result = await run_scenario(sample_target, "macro_shock", 7, "Rate spike")

    assert "score_deltas" in result
    assert "implications" in result
    assert "acquisition_window_effect" in result


@pytest.mark.asyncio
async def test_run_scenario_deltas_match_claude_output(sample_target):
    with patch("services.scenario_service.client") as mock_client:
        mock_client.messages.create.return_value = _mock_claude(
            {"transition": 2, "value": -1, "market": 0, "financial": -3}
        )
        from services.scenario_service import run_scenario
        result = await run_scenario(sample_target, "macro_shock", 7, "Rate spike")

    d = result["score_deltas"]
    assert d["transition_delta"] == 2
    assert d["value_delta"] == -1
    assert d["market_delta"] == 0
    assert d["financial_delta"] == -3


@pytest.mark.asyncio
async def test_overall_delta_weighted_average(sample_target):
    # transition_delta=4 × 0.35 = 1.4, rest 0 → overall = 1.4
    with patch("services.scenario_service.client") as mock_client:
        mock_client.messages.create.return_value = _mock_claude({"transition": 4})
        from services.scenario_service import run_scenario
        result = await run_scenario(sample_target, "succession_trigger", 5, "Owner health scare")

    assert result["score_deltas"]["overall_delta"] == pytest.approx(1.4, rel=1e-3)


@pytest.mark.asyncio
async def test_overall_delta_all_dimensions(sample_target):
    # transition=2×0.35 + value=-2×0.30 + market=1×0.20 + financial=-1×0.15
    # = 0.70 - 0.60 + 0.20 - 0.15 = 0.15
    with patch("services.scenario_service.client") as mock_client:
        mock_client.messages.create.return_value = _mock_claude(
            {"transition": 2, "value": -2, "market": 1, "financial": -1}
        )
        from services.scenario_service import run_scenario
        result = await run_scenario(sample_target, "industry_shift", 3, "New regulation")

    assert result["score_deltas"]["overall_delta"] == pytest.approx(0.15, rel=1e-3)


@pytest.mark.asyncio
async def test_implications_has_three_items(sample_target):
    with patch("services.scenario_service.client") as mock_client:
        mock_client.messages.create.return_value = _mock_claude({}, implications=["A", "B", "C"])
        from services.scenario_service import run_scenario
        result = await run_scenario(sample_target, "macro_shock", 5, "Recession")

    assert len(result["implications"]) == 3


@pytest.mark.asyncio
async def test_raises_on_no_json(sample_target):
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text="Sorry, I cannot help with that.")]
    with patch("services.scenario_service.client") as mock_client:
        mock_client.messages.create.return_value = mock_msg
        from services.scenario_service import run_scenario
        with pytest.raises(ValueError, match="no JSON"):
            await run_scenario(sample_target, "macro_shock", 5, "Test")
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/callmepio/Desktop/horus-main
apps/api/.venv/bin/python -m pytest tests/scenarios/test_scenario_service.py -v
```

Expected: `ModuleNotFoundError: No module named 'services.scenario_service'`

- [ ] **Step 4: Implement scenario_service.py**

```python
# apps/api/services/scenario_service.py
import json
import logging
from services.claude_service import client

logger = logging.getLogger(__name__)


async def run_scenario(target: dict, scenario_type: str, severity: int, description: str) -> dict:
    """
    Ask Claude to analyze the impact of a scenario on a target.
    target: dict with target fields + target_scores[0] row.
    Returns {score_deltas, implications, acquisition_window_effect}.
    """
    scores = (target.get("target_scores") or [{}])[0]

    prompt = f"""You are advising a Search Fund operator analyzing SME acquisition targets.

Target: {target.get('name', 'Unknown')}
Country: {target.get('country', '?')} | Industry: {target.get('industry_label', '?')}
Revenue: EUR {(target.get('revenue_eur') or 0):,} | Employees: {target.get('employee_count', '?')}
Owner age estimate: {target.get('owner_age_estimate', '?')}

Current scores (0–10):
- Transition readiness: {scores.get('transition_score', '?')}
- Value potential: {scores.get('value_score', '?')}
- Market attractiveness: {scores.get('market_score', '?')}
- Financial profile: {scores.get('financial_score', '?')}

Scenario type: {scenario_type} | Severity: {severity}/10
Description: {description}

Scenario types:
- macro_shock: broad economic disruption (recession, rate spike, inflation)
- industry_shift: sector-specific change (regulation, disruption, consolidation)
- succession_trigger: owner-related event (health, retirement urgency, family pressure)

Analyze how this scenario affects this acquisition target. Respond ONLY as JSON, no markdown:
{{
  "transition_delta": <integer -10 to 10>,
  "value_delta": <integer -10 to 10>,
  "market_delta": <integer -10 to 10>,
  "financial_delta": <integer -10 to 10>,
  "implications": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
  "acquisition_window_effect": "<one sentence on urgency/timing impact>"
}}

Deltas are additive to current scores. Negative = worsening, positive = improving. implications must be exactly 3 strings."""

    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = msg.content[0].text.strip()

    start = raw.find('{')
    end = raw.rfind('}')
    if start == -1 or end == -1:
        logger.warning(f"Claude scenario response had no JSON: {raw[:100]}")
        raise ValueError("Claude returned no JSON")

    parsed = json.loads(raw[start:end + 1])

    t_delta = parsed["transition_delta"]
    v_delta = parsed["value_delta"]
    m_delta = parsed["market_delta"]
    f_delta = parsed["financial_delta"]

    overall_delta = round(
        t_delta * 0.35 + v_delta * 0.30 + m_delta * 0.20 + f_delta * 0.15,
        2
    )

    return {
        "score_deltas": {
            "overall_delta": overall_delta,
            "transition_delta": t_delta,
            "value_delta": v_delta,
            "market_delta": m_delta,
            "financial_delta": f_delta,
        },
        "implications": parsed["implications"],
        "acquisition_window_effect": parsed["acquisition_window_effect"],
    }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
apps/api/.venv/bin/python -m pytest tests/scenarios/test_scenario_service.py -v
```

Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git write-tree
git commit-tree <tree-sha> -p $(git rev-parse HEAD) -m "feat: scenario_service — Claude scenario analysis with weighted delta math"
git update-ref HEAD <new-commit-sha>
```

---

## Task 3: scenarios.py router (TDD)

**Files:**
- Create: `apps/api/routers/scenarios.py`
- Create: `tests/scenarios/test_scenario_api.py`

- [ ] **Step 1: Write failing API tests**

```python
# tests/scenarios/test_scenario_api.py
import pytest
from unittest.mock import MagicMock, patch, AsyncMock

TENANT_ID = "00000000-0000-0000-0000-000000000001"


def _target():
    return {
        "id": "target-1",
        "tenant_id": TENANT_ID,
        "name": "Acme Plumbing GmbH",
        "country": "DE",
        "industry_label": "Plumbing",
        "revenue_eur": 2_000_000,
        "employee_count": 25,
        "owner_age_estimate": 62,
        "target_scores": [{
            "overall_score": 5.9,
            "transition_score": 7.0,
            "value_score": 6.0,
            "market_score": 5.0,
            "financial_score": 4.0,
            "scored_at": "2026-01-01T00:00:00Z",
        }],
    }


def _result_row():
    return {
        "id": "result-1",
        "tenant_id": TENANT_ID,
        "target_id": "target-1",
        "rollup_scenario_id": None,
        "scenario_type": "macro_shock",
        "severity": 7,
        "description": "Rate spike",
        "score_before": {
            "overall_score": 5.9,
            "transition_score": 7.0,
            "value_score": 6.0,
            "market_score": 5.0,
            "financial_score": 4.0,
            "scored_at": "2026-01-01T00:00:00Z",
        },
        "score_deltas": {
            "overall_delta": -0.5,
            "transition_delta": 0,
            "value_delta": -1,
            "market_delta": -1,
            "financial_delta": -2,
        },
        "implications": ["A", "B", "C"],
        "acquisition_window_effect": "Window shortens.",
        "model_version": "v1",
        "run_at": "2026-01-02T00:00:00Z",
    }


def _mock_db_for_run(mock_db):
    """Set up mock DB for POST /scenarios/run: target fetch + result insert."""
    def table_side_effect(table_name):
        m = MagicMock()
        if table_name == "targets":
            m.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = _target()
        elif table_name == "scenario_results":
            m.insert.return_value.execute.return_value.data = [_result_row()]
        return m
    mock_db.table.side_effect = table_side_effect


# ─── POST /scenarios/run ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_run_scenario_returns_201(scenarios_client):
    client, mock_db = scenarios_client
    _mock_db_for_run(mock_db)

    service_result = {
        "score_deltas": {
            "overall_delta": -0.5,
            "transition_delta": 0,
            "value_delta": -1,
            "market_delta": -1,
            "financial_delta": -2,
        },
        "implications": ["A", "B", "C"],
        "acquisition_window_effect": "Window shortens.",
    }

    with patch("routers.scenarios.run_scenario", new_callable=AsyncMock, return_value=service_result):
        response = await client.post("/scenarios/run", json={
            "target_id": "target-1",
            "scenario_type": "macro_shock",
            "severity": 7,
            "description": "Rate spike",
        })

    assert response.status_code == 201
    body = response.json()
    assert body["scenario_type"] == "macro_shock"
    assert body["severity"] == 7
    assert body["implications"] == ["A", "B", "C"]


@pytest.mark.asyncio
async def test_run_scenario_returns_404_when_target_not_found(scenarios_client):
    client, mock_db = scenarios_client

    def table_side_effect(table_name):
        m = MagicMock()
        if table_name == "targets":
            m.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = None
        return m
    mock_db.table.side_effect = table_side_effect

    response = await client.post("/scenarios/run", json={
        "target_id": "no-such-target",
        "scenario_type": "macro_shock",
        "severity": 5,
        "description": "Test",
    })

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_run_scenario_returns_400_for_invalid_type(scenarios_client):
    client, mock_db = scenarios_client

    response = await client.post("/scenarios/run", json={
        "target_id": "target-1",
        "scenario_type": "bad_type",
        "severity": 5,
        "description": "Test",
    })

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_run_scenario_returns_400_for_invalid_severity(scenarios_client):
    client, mock_db = scenarios_client

    response = await client.post("/scenarios/run", json={
        "target_id": "target-1",
        "scenario_type": "macro_shock",
        "severity": 11,
        "description": "Test",
    })

    assert response.status_code == 400


# ─── GET /scenarios/target/{id} ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_scenario_results_returns_200(scenarios_client):
    client, mock_db = scenarios_client

    res = MagicMock()
    res.data = [_result_row()]
    mock_db.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = res

    response = await client.get("/scenarios/target/target-1")
    assert response.status_code == 200
    body = response.json()
    assert len(body["data"]) == 1
    assert body["data"][0]["scenario_type"] == "macro_shock"


# ─── DELETE /scenarios/{id} ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_scenario_result_returns_204(scenarios_client):
    client, mock_db = scenarios_client

    response = await client.delete("/scenarios/result-1")
    assert response.status_code == 204
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/callmepio/Desktop/horus-main
apps/api/.venv/bin/python -m pytest tests/scenarios/test_scenario_api.py -v
```

Expected: `ImportError` or 404 from FastAPI (router not registered yet).

- [ ] **Step 3: Implement scenarios.py router**

```python
# apps/api/routers/scenarios.py
from fastapi import APIRouter, Depends, HTTPException
from dependencies import get_db, get_tenant_id
from supabase import Client
from pydantic import BaseModel
from typing import Optional
import logging
from services.scenario_service import run_scenario

router = APIRouter()
logger = logging.getLogger(__name__)

VALID_TYPES = {"macro_shock", "industry_shift", "succession_trigger"}


class ScenarioRunRequest(BaseModel):
    target_id: str
    scenario_type: str
    severity: int
    description: str
    rollup_scenario_id: Optional[str] = None


@router.post("/run", status_code=201)
async def run_scenario_endpoint(
    body: ScenarioRunRequest,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    if body.scenario_type not in VALID_TYPES:
        raise HTTPException(400, f"scenario_type must be one of {sorted(VALID_TYPES)}")
    if not 1 <= body.severity <= 10:
        raise HTTPException(400, "severity must be between 1 and 10")

    target_res = db.table("targets").select(
        "*, target_scores(overall_score, transition_score, value_score, market_score, financial_score, scored_at)"
    ).eq("id", body.target_id).eq("tenant_id", tenant_id).single().execute()
    if not target_res.data:
        raise HTTPException(404, "Target not found")
    target = target_res.data

    result = await run_scenario(target, body.scenario_type, body.severity, body.description)

    scores = (target.get("target_scores") or [{}])[0]
    score_before = {
        "overall_score":    scores.get("overall_score"),
        "transition_score": scores.get("transition_score"),
        "value_score":      scores.get("value_score"),
        "market_score":     scores.get("market_score"),
        "financial_score":  scores.get("financial_score"),
        "scored_at":        scores.get("scored_at"),
    }

    record = {
        "tenant_id":                tenant_id,
        "target_id":                body.target_id,
        "rollup_scenario_id":       body.rollup_scenario_id,
        "scenario_type":            body.scenario_type,
        "severity":                 body.severity,
        "description":              body.description,
        "score_before":             score_before,
        "score_deltas":             result["score_deltas"],
        "implications":             result["implications"],
        "acquisition_window_effect": result["acquisition_window_effect"],
        "model_version":            "v1",
    }

    save_res = db.table("scenario_results").insert(record).execute()
    if not save_res.data:
        raise HTTPException(500, "Failed to save scenario result")

    logger.info(f"Scenario {body.scenario_type} run for target {body.target_id}")
    return save_res.data[0]


@router.get("/target/{target_id}")
async def list_scenario_results(
    target_id: str,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    res = db.table("scenario_results").select("*").eq(
        "target_id", target_id
    ).eq("tenant_id", tenant_id).order("run_at", desc=True).limit(20).execute()
    return {"data": res.data or []}


@router.delete("/{result_id}", status_code=204)
async def delete_scenario_result(
    result_id: str,
    db: Client = Depends(get_db),
    tenant_id: str = Depends(get_tenant_id),
):
    db.table("scenario_results").delete().eq(
        "id", result_id
    ).eq("tenant_id", tenant_id).execute()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
apps/api/.venv/bin/python -m pytest tests/scenarios/test_scenario_api.py -v
```

Expected: 6 tests PASS. (Tests still fail until Task 4 registers the router — skip ahead if needed and return.)

- [ ] **Step 5: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git write-tree
git commit-tree <tree-sha> -p $(git rev-parse HEAD) -m "feat: scenarios router — POST /run, GET /target/{id}, DELETE /{id}"
git update-ref HEAD <new-commit-sha>
```

---

## Task 4: Register Router + Deploy

**Files:**
- Modify: `apps/api/main.py`

- [ ] **Step 1: Add scenarios to main.py**

In `apps/api/main.py`, change line 3:

Old:
```python
from routers import targets, scoring, clusters, chat, exports, pipeline, billing, rollup
```

New:
```python
from routers import targets, scoring, clusters, chat, exports, pipeline, billing, rollup, scenarios
```

After line 28 (`app.include_router(rollup.router, ...)`), add:
```python
app.include_router(scenarios.router, prefix="/scenarios", tags=["scenarios"])
```

- [ ] **Step 2: Run all scenario tests**

```bash
apps/api/.venv/bin/python -m pytest tests/scenarios/ -v
```

Expected: all tests PASS.

- [ ] **Step 3: Verify API docs show /scenarios routes**

```bash
cd apps/api && source .venv/bin/activate && uvicorn main:app --port 8001 &
curl http://localhost:8001/openapi.json | python3 -c "import sys,json; paths=json.load(sys.stdin)['paths']; [print(p) for p in paths if '/scenarios' in p]"
kill %1
```

Expected: `/scenarios/run`, `/scenarios/target/{target_id}`, `/scenarios/{result_id}` appear.

- [ ] **Step 4: Deploy to Fly.io**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/api
~/.fly/bin/flyctl deploy
```

- [ ] **Step 5: Smoke-test production**

```bash
curl https://searchfund-api.fly.dev/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 6: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git write-tree
git commit-tree <tree-sha> -p $(git rev-parse HEAD) -m "feat: register scenarios router in main.py"
git update-ref HEAD <new-commit-sha>
git push
```

---

## Task 5: API Client — ScenarioResult Interface + api.scenarios

**Files:**
- Modify: `apps/web/lib/api/client.ts`

- [ ] **Step 1: Add ScenarioResult interface**

After the `RollupFinancials` interface (around line 300), add:

```typescript
export interface ScoreDeltas {
  overall_delta: number
  transition_delta: number
  value_delta: number
  market_delta: number
  financial_delta: number
}

export interface ScenarioResult {
  id: string
  tenant_id: string
  target_id: string
  rollup_scenario_id: string | null
  scenario_type: 'macro_shock' | 'industry_shift' | 'succession_trigger'
  severity: number
  description: string
  score_before: {
    overall_score: number | null
    transition_score: number | null
    value_score: number | null
    market_score: number | null
    financial_score: number | null
    scored_at: string | null
  }
  score_deltas: ScoreDeltas
  implications: string[]
  acquisition_window_effect: string
  model_version: string
  run_at: string
}
```

- [ ] **Step 2: Add api.scenarios methods**

In the `export const api = {` object, after `rollup: { ... },` (before the closing `}`), add:

```typescript
  scenarios: {
    run: (
      targetId: string,
      params: { scenario_type: string; severity: number; description: string },
      rollupScenarioId?: string
    ) =>
      apiFetch<ScenarioResult>('/scenarios/run', {
        method: 'POST',
        body: JSON.stringify({
          target_id: targetId,
          ...params,
          ...(rollupScenarioId ? { rollup_scenario_id: rollupScenarioId } : {}),
        }),
      }),
    forTarget: (targetId: string) =>
      apiFetch<{ data: ScenarioResult[] }>(`/scenarios/target/${targetId}`),
    delete: (resultId: string) =>
      apiFetch<void>(`/scenarios/${resultId}`, { method: 'DELETE' }),
  },
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/web
npx tsc --noEmit
```

Expected: no errors related to scenario types.

- [ ] **Step 4: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git write-tree
git commit-tree <tree-sha> -p $(git rev-parse HEAD) -m "feat: ScenarioResult interface + api.scenarios client"
git update-ref HEAD <new-commit-sha>
```

---

## Task 6: ScenarioPanel Component

**Files:**
- Create: `apps/web/app/(dashboard)/discovery/[id]/components/ScenarioPanel.tsx`

- [ ] **Step 1: Create ScenarioPanel.tsx**

```tsx
// apps/web/app/(dashboard)/discovery/[id]/components/ScenarioPanel.tsx
'use client'
import { useState } from 'react'
import { api, ScenarioResult } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  targetId: string
  currentScores: {
    overall_score: number | null
    transition_score: number | null
    value_score: number | null
    market_score: number | null
    financial_score: number | null
    scored_at: string | null
  }
  rollupScenarioId?: string
}

type State = 'idle' | 'running' | 'done' | 'error'

const SCENARIO_TYPES = [
  { value: 'macro_shock',         label: 'Macro shock' },
  { value: 'industry_shift',      label: 'Industry shift' },
  { value: 'succession_trigger',  label: 'Succession trigger' },
] as const

function DeltaCard({ label, delta }: { label: string; delta: number }) {
  return (
    <div className={cn(
      'p-2 border rounded-sm text-center',
      delta > 0 ? 'border-green-200 bg-green-50' :
      delta < 0 ? 'border-red-200 bg-red-50' :
                  'border-slate-200 bg-slate-50'
    )}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn(
        'text-sm font-semibold tabular-nums',
        delta > 0 ? 'text-green-700' :
        delta < 0 ? 'text-red-700' :
                    'text-slate-500'
      )}>
        {delta > 0 ? '+' : ''}{delta}
      </div>
    </div>
  )
}

export default function ScenarioPanel({ targetId, rollupScenarioId }: Props) {
  const [state, setState]             = useState<State>('idle')
  const [scenarioType, setScenarioType] = useState('macro_shock')
  const [severity, setSeverity]       = useState(5)
  const [description, setDescription] = useState('')
  const [result, setResult]           = useState<ScenarioResult | null>(null)
  const [error, setError]             = useState('')
  const [history, setHistory]         = useState<ScenarioResult[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('running')
    setError('')
    try {
      const res = await api.scenarios.run(
        targetId,
        { scenario_type: scenarioType, severity, description },
        rollupScenarioId
      )
      setResult(res)
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setState('error')
    }
  }

  async function toggleHistory() {
    if (historyLoaded) { setHistoryOpen(v => !v); return }
    try {
      const res = await api.scenarios.forTarget(targetId)
      setHistory(res.data)
      setHistoryLoaded(true)
      setHistoryOpen(true)
    } catch {}
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="space-y-2">
        <select
          className="w-full text-xs border rounded-sm px-2 py-1.5 bg-background"
          value={scenarioType}
          onChange={e => setScenarioType(e.target.value)}
          disabled={state === 'running'}
        >
          {SCENARIO_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Severity</span><span className="tabular-nums">{severity}/10</span>
          </div>
          <input
            type="range" min={1} max={10} value={severity}
            onChange={e => setSeverity(Number(e.target.value))}
            className="w-full"
            disabled={state === 'running'}
          />
        </div>

        <textarea
          className="w-full text-xs border rounded-sm px-2 py-1.5 bg-background resize-none"
          rows={2}
          placeholder="Describe the scenario…"
          value={description}
          onChange={e => setDescription(e.target.value)}
          disabled={state === 'running'}
          required
        />

        <Button
          type="submit"
          size="sm"
          className="w-full text-xs"
          disabled={state === 'running' || !description.trim()}
        >
          {state === 'running' ? 'Analyzing…' : 'Run scenario'}
        </Button>
      </form>

      {state === 'error' && (
        <div className="text-xs text-destructive">
          {error}
          <button className="ml-2 underline" onClick={() => setState('idle')}>Retry</button>
        </div>
      )}

      {state === 'done' && result && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-1.5">
            <DeltaCard label="Transition" delta={result.score_deltas.transition_delta} />
            <DeltaCard label="Value"      delta={result.score_deltas.value_delta} />
            <DeltaCard label="Market"     delta={result.score_deltas.market_delta} />
            <DeltaCard label="Financial"  delta={result.score_deltas.financial_delta} />
          </div>
          <div className="space-y-1">
            {result.implications.map((imp, i) => (
              <p key={i} className="text-xs text-muted-foreground">• {imp}</p>
            ))}
          </div>
          <p className="text-xs italic text-muted-foreground border-t pt-2">
            {result.acquisition_window_effect}
          </p>
        </div>
      )}

      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground underline"
        onClick={toggleHistory}
      >
        {historyOpen ? 'Hide history' : 'Show history'}
      </button>

      {historyOpen && (
        <div className="space-y-1">
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No previous runs.</p>
          ) : (
            <div className="divide-y">
              {history.map(h => (
                <div key={h.id} className="py-1 text-xs text-muted-foreground">
                  <span>{new Date(h.run_at).toLocaleDateString()}</span>
                  {' · '}{h.scenario_type.replace('_', ' ')}
                  {' · severity '}{h.severity}
                  {' · overall '}
                  <span className={h.score_deltas.overall_delta >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {h.score_deltas.overall_delta >= 0 ? '+' : ''}{h.score_deltas.overall_delta}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/web
npx tsc --noEmit
```

Expected: no errors in ScenarioPanel.tsx.

- [ ] **Step 3: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git write-tree
git commit-tree <tree-sha> -p $(git rev-parse HEAD) -m "feat: ScenarioPanel client component"
git update-ref HEAD <new-commit-sha>
```

---

## Task 7: Entry Point 1 — Target Detail Page

**Files:**
- Modify: `apps/web/app/(dashboard)/discovery/[id]/page.tsx`

- [ ] **Step 1: Add ScenarioPanel import**

At the top of `page.tsx`, after the existing component imports (after line 9 `import AddToPipelineButton`), add:

```tsx
import ScenarioPanel from './components/ScenarioPanel'
```

- [ ] **Step 2: Add Scenario Analysis card**

After the closing `</Card>` of the "Similar targets" section (around line 187), still inside `<div className="lg:col-span-2 space-y-6">`, add:

```tsx
          <Card>
            <CardHeader><CardTitle className="text-sm">Scenario analysis</CardTitle></CardHeader>
            <CardContent>
              <ScenarioPanel
                targetId={id}
                currentScores={{
                  overall_score:    score?.overall_score    ?? null,
                  transition_score: score?.transition_score ?? null,
                  value_score:      score?.value_score      ?? null,
                  market_score:     score?.market_score     ?? null,
                  financial_score:  score?.financial_score  ?? null,
                  scored_at:        score?.scored_at        ?? null,
                }}
              />
            </CardContent>
          </Card>
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Visual smoke-test (optional)**

Start dev server (`pnpm dev` in apps/web), navigate to `/discovery/<any-target-id>`. Verify "Scenario analysis" card appears below "Similar targets".

- [ ] **Step 5: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git write-tree
git commit-tree <tree-sha> -p $(git rev-parse HEAD) -m "feat: add ScenarioPanel to target detail page"
git update-ref HEAD <new-commit-sha>
```

---

## Task 8: Entry Point 2 — Rollup TargetRow

**Files:**
- Modify: `apps/web/app/(dashboard)/rollup/[id]/components/TargetRow.tsx`

- [ ] **Step 1: Add import + extend Props**

At the top of `TargetRow.tsx`, after the existing imports, add:

```tsx
import ScenarioPanel from '@/app/(dashboard)/discovery/[id]/components/ScenarioPanel'
```

Change the `interface Props` to add `rollupScenarioId`:

Old:
```tsx
interface Props {
  target: RollupScenarioTarget
  index: number
  onChange: (field: keyof RollupScenarioTarget, value: number) => void
  onRemove: () => void
}
```

New:
```tsx
interface Props {
  target: RollupScenarioTarget
  index: number
  rollupScenarioId: string
  onChange: (field: keyof RollupScenarioTarget, value: number) => void
  onRemove: () => void
}
```

Update the destructuring in the function signature:

Old:
```tsx
export default function TargetRow({ target, index, onChange, onRemove }: Props) {
```

New:
```tsx
export default function TargetRow({ target, index, rollupScenarioId, onChange, onRemove }: Props) {
```

- [ ] **Step 2: Add ScenarioPanel toggle state + render**

After `const [expanded, setExpanded] = useState(false)`, add:

```tsx
  const [scenarioOpen, setScenarioOpen] = useState(false)
```

Replace the `{expanded && ...}` block (lines 73–77):

Old:
```tsx
      {expanded && (
        <div className="px-3 pb-2 border-t">
          <AssumptionInputs target={target} onChange={onChange} />
        </div>
      )}
```

New:
```tsx
      {expanded && (
        <div className="px-3 pb-3 border-t space-y-3">
          <AssumptionInputs target={target} onChange={onChange} />
          <div className="border-t pt-2">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => setScenarioOpen(v => !v)}
            >
              ⚡ {scenarioOpen ? 'Hide scenario analysis' : 'Scenario analysis'}
            </button>
            {scenarioOpen && (
              <div className="mt-2">
                <ScenarioPanel
                  targetId={target.target_id}
                  rollupScenarioId={rollupScenarioId}
                  currentScores={{
                    overall_score:    target.targets?.target_scores?.[0]?.overall_score    ?? null,
                    transition_score: target.targets?.target_scores?.[0]?.transition_score ?? null,
                    value_score:      null,
                    market_score:     null,
                    financial_score:  target.targets?.target_scores?.[0]?.financial_score  ?? null,
                    scored_at:        null,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 3: Find and update TargetRow usage to pass rollupScenarioId**

Find where `<TargetRow` is rendered (likely `apps/web/app/(dashboard)/rollup/[id]/components/LeftPanel.tsx` or the main rollup page):

```bash
grep -r "TargetRow" /Users/callmepio/Desktop/horus-main/apps/web --include="*.tsx" -l
```

In that file, add `rollupScenarioId={scenarioId}` (or whatever the rollup scenario ID variable is called) to each `<TargetRow` usage. The scenario ID is available from the URL params or the loaded rollup scenario data — check the parent component for how it's accessed.

- [ ] **Step 4: Type-check**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/web
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit + push**

```bash
cd /Users/callmepio/Desktop/horus-main
git write-tree
git commit-tree <tree-sha> -p $(git rev-parse HEAD) -m "feat: add ScenarioPanel to rollup TargetRow"
git update-ref HEAD <new-commit-sha>
git push
```

---

## Self-Review Checklist

Spec requirements vs tasks:

| Spec item | Covered by |
|-----------|-----------|
| `scenario_results` table with all columns | Task 1 |
| `score_before.scored_at` from target_scores row | Task 3 Step 3 (router populates from `scores.get("scored_at")`) |
| `overall_delta` = transition×0.35 + value×0.30 + market×0.20 + financial×0.15 | Task 2 Step 4 |
| `implications` exactly 3 bullets | Task 2 Step 4 (prompt) + Step 2 test |
| POST `/scenarios/run` | Task 3 |
| GET `/scenarios/target/{id}` | Task 3 |
| DELETE `/scenarios/{id}` | Task 3 |
| RLS via `get_tenant_id()` | Task 1 (migration policy) + Task 3 (all endpoints use `tenant_id`) |
| `ScenarioPanel` props: `targetId`, `currentScores`, `rollupScenarioId?` | Task 6 |
| Form: type select, severity slider 1–10, description textarea | Task 6 |
| 4 delta cards (green/red/slate) | Task 6 |
| Implications list | Task 6 |
| Window effect | Task 6 |
| History: collapsible, date + type + severity | Task 6 |
| Error state + retry | Task 6 |
| Entry point 1: discovery/[id]/page.tsx | Task 7 |
| Entry point 2: rollup TargetRow "⚡ Scenario" toggle | Task 8 |
| `api.scenarios.run/forTarget/delete` | Task 5 |
| `ScenarioResult` TypeScript interface | Task 5 |
