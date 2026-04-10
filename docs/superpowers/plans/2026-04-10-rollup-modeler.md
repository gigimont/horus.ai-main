# Roll-up Modeler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full Roll-up Modeler module — scenario CRUD, split-panel editor, live financial model, Claude-powered EBITDA estimation + sequencing + IC memo, and PDF export.

**Architecture:** New FastAPI router (`routers/rollup.py`) + service (`services/rollup_service.py`) backed by two new Supabase tables. Frontend is three pages (`/rollup`, `/rollup/[id]`, `/rollup/compare`) sharing a `useScenario` hook with client-side financial computation and optimistic updates.

**Tech Stack:** FastAPI, Supabase (Python client), ReportLab (PDF), Next.js App Router, React, @dnd-kit/core + @dnd-kit/sortable (already installed), shadcn/ui, Tailwind CSS, TypeScript.

---

## File Map

**Create:**
- `supabase/migrations/009_rollup_scenarios.sql`
- `apps/api/services/rollup_service.py`
- `apps/api/routers/rollup.py`
- `apps/web/app/(dashboard)/rollup/page.tsx`
- `apps/web/app/(dashboard)/rollup/[id]/page.tsx`
- `apps/web/app/(dashboard)/rollup/[id]/lib/computeFinancials.ts`
- `apps/web/app/(dashboard)/rollup/[id]/hooks/useScenario.ts`
- `apps/web/app/(dashboard)/rollup/[id]/components/AssumptionInputs.tsx`
- `apps/web/app/(dashboard)/rollup/[id]/components/TargetRow.tsx`
- `apps/web/app/(dashboard)/rollup/[id]/components/LeftPanel.tsx`
- `apps/web/app/(dashboard)/rollup/[id]/components/FinancialSummary.tsx`
- `apps/web/app/(dashboard)/rollup/[id]/components/AcquisitionTimeline.tsx`
- `apps/web/app/(dashboard)/rollup/[id]/components/SynergyMap.tsx`
- `apps/web/app/(dashboard)/rollup/[id]/components/IcMemo.tsx`
- `apps/web/app/(dashboard)/rollup/[id]/components/RightPanel.tsx`
- `apps/web/app/(dashboard)/rollup/compare/page.tsx`

**Modify:**
- `apps/api/main.py` — register rollup router
- `apps/web/lib/api/client.ts` — add RollupScenario types + api.rollup methods
- `apps/web/components/layout/Sidebar.tsx` — add Roll-up nav item
- `apps/web/app/(dashboard)/clusters/page.tsx` — add "Build roll-up →" button

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/009_rollup_scenarios.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/009_rollup_scenarios.sql

create table if not exists rollup_scenarios (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null,
  description   text,
  status        text not null default 'draft',
  created_by    uuid references users(id),
  updated_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists rollup_scenario_targets (
  id                    uuid primary key default gen_random_uuid(),
  scenario_id           uuid not null references rollup_scenarios(id) on delete cascade,
  target_id             uuid not null references targets(id) on delete cascade,
  sequence_order        int not null default 0,
  entry_multiple        numeric(5,2) not null default 6.0,
  ebitda_margin_pct     numeric(5,2),
  ebitda_margin_source  text not null default 'ai',
  synergy_pct           numeric(5,2) not null default 15.0,
  revenue_uplift_pct    numeric(5,2) not null default 0.0,
  debt_pct              numeric(5,2) not null default 50.0,
  integration_cost_eur  bigint not null default 0,
  hold_period_years     int not null default 5,
  notes                 text,
  created_at            timestamptz not null default now(),
  constraint rollup_scenario_targets_scenario_target_unique unique (scenario_id, target_id)
);

create index if not exists rollup_scenario_targets_scenario_order_idx
  on rollup_scenario_targets (scenario_id, sequence_order);

-- RLS
alter table rollup_scenarios enable row level security;
alter table rollup_scenario_targets enable row level security;

create policy "tenant_isolation_rollup_scenarios"
  on rollup_scenarios for all
  using (tenant_id = (
    select tenant_id from users where id = auth.uid()
  ));

create policy "tenant_isolation_rollup_scenario_targets"
  on rollup_scenario_targets for all
  using (scenario_id in (
    select id from rollup_scenarios
    where tenant_id = (select tenant_id from users where id = auth.uid())
  ));
```

- [ ] **Step 2: Run migration in Supabase SQL Editor**

Copy the SQL above and run it in the Supabase dashboard SQL Editor.
Verify with:
```sql
select table_name from information_schema.tables
where table_name in ('rollup_scenarios', 'rollup_scenario_targets');
```
Expected: 2 rows.

- [ ] **Step 3: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git add supabase/migrations/009_rollup_scenarios.sql
git commit -m "feat: add rollup_scenarios and rollup_scenario_targets tables"
```

---

## Task 2: Rollup Service

**Files:**
- Create: `apps/api/services/rollup_service.py`

- [ ] **Step 1: Create the service file**

```python
# apps/api/services/rollup_service.py
import json
import logging
from services.claude_service import client

logger = logging.getLogger(__name__)


def compute_financials(targets: list[dict]) -> dict:
    """
    Pure computation — no DB, no Claude.
    targets: list of rollup_scenario_targets rows each with a 'targets' join
    containing revenue_eur.
    Returns dict with 'targets' (per-target breakdown) and 'combined' (aggregates).
    """
    per_target = []
    for t in targets:
        revenue = (t.get("targets") or {}).get("revenue_eur") or 0
        margin = (t.get("ebitda_margin_pct") or 0) / 100
        ebitda = revenue * margin
        entry_cost = ebitda * (t.get("entry_multiple") or 6.0)
        debt = entry_cost * (t.get("debt_pct") or 50.0) / 100
        equity_in = entry_cost - debt
        synergy_value = ebitda * (t.get("synergy_pct") or 0) / 100
        revenue_uplift = revenue * (t.get("revenue_uplift_pct") or 0) / 100
        per_target.append({
            "target_id": t["target_id"],
            "name": (t.get("targets") or {}).get("name", ""),
            "sequence_order": t.get("sequence_order", 0),
            "revenue_eur": revenue,
            "ebitda": round(ebitda),
            "entry_cost": round(entry_cost),
            "debt": round(debt),
            "equity_in": round(equity_in),
            "synergy_value": round(synergy_value),
            "revenue_uplift": round(revenue_uplift),
        })

    total_revenue = sum(t["revenue_eur"] for t in per_target)
    total_ebitda_pre = sum(t["ebitda"] for t in per_target)
    total_synergy = sum(t["synergy_value"] for t in per_target)
    total_uplift = sum(t["revenue_uplift"] for t in per_target)
    proforma_ebitda = total_ebitda_pre + total_synergy
    proforma_revenue = total_revenue + total_uplift
    total_entry_cost = sum(t["entry_cost"] for t in per_target)
    total_integration = sum((t.get("integration_cost_eur") or 0) for t in targets)
    total_equity_in = sum(t["equity_in"] for t in per_target)
    total_debt = sum(t["debt"] for t in per_target)
    multiples = [t.get("entry_multiple") or 6.0 for t in targets]
    avg_multiple = sum(multiples) / len(multiples) if multiples else 6.0
    exit_value = proforma_ebitda * avg_multiple
    equity_return = (
        (exit_value - total_debt - total_integration) / total_equity_in - 1
        if total_equity_in > 0 else 0
    )

    return {
        "targets": per_target,
        "combined": {
            "total_revenue": total_revenue,
            "total_ebitda_pre_synergy": total_ebitda_pre,
            "total_synergy_value": total_synergy,
            "total_revenue_uplift": total_uplift,
            "proforma_ebitda": round(proforma_ebitda),
            "proforma_revenue": round(proforma_revenue),
            "total_entry_cost": round(total_entry_cost),
            "total_integration_cost": total_integration,
            "total_equity_in": round(total_equity_in),
            "total_debt": round(total_debt),
            "avg_entry_multiple": round(avg_multiple, 2),
            "exit_value": round(exit_value),
            "equity_return_pct": round(equity_return, 4),
        }
    }


async def estimate_ebitda_margin(target: dict) -> float:
    """
    Ask Claude to estimate EBITDA margin (%) for a single target.
    Returns a float like 18.5 (meaning 18.5%).
    """
    scores = (target.get("target_scores") or [{}])[0]
    signals = scores.get("key_signals") or []
    prompt = f"""Estimate the EBITDA margin as a percentage of revenue for this European SME acquisition target.

Company profile:
- Industry: {target.get('industry_label', 'unknown')} ({target.get('industry_code', 'n/a')})
- Country: {target.get('country', 'unknown')}
- Annual revenue: {f"EUR {target['revenue_eur']:,}" if target.get('revenue_eur') else 'unknown'}
- Employees: {target.get('employee_count', 'unknown')}
- Founded: {target.get('founded_year', 'unknown')}
- Financial score: {scores.get('financial_score', 'N/A')}/10
- Key signals: {', '.join(signals) if signals else 'none'}

Return ONLY a single float between 0.0 and 50.0 representing the EBITDA margin percentage.
No explanation, no units, just the number. Example: 14.5"""

    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=16,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = msg.content[0].text.strip()
    return round(float(raw), 1)


async def suggest_sequence(targets: list[dict]) -> list[dict]:
    """
    Ask Claude to recommend acquisition order.
    targets: rollup_scenario_targets rows with 'targets' join.
    Returns list of {target_id, suggested_order, rationale}.
    """
    summaries = []
    for i, t in enumerate(targets):
        tgt = t.get("targets") or {}
        scores = (tgt.get("target_scores") or [{}])[0]
        summaries.append(
            f"{i+1}. {tgt.get('name','?')} | transition={scores.get('transition_score','?')} "
            f"| entry_cost=EUR {round((tgt.get('revenue_eur',0) or 0) * (t.get('ebitda_margin_pct',15)/100) * t.get('entry_multiple',6)):,} "
            f"| integration_cost=EUR {t.get('integration_cost_eur',0):,} "
            f"| id={t['target_id']}"
        )

    prompt = f"""You are advising a Search Fund operator on the optimal acquisition sequence for a roll-up.

Targets to sequence:
{chr(10).join(summaries)}

Recommend the optimal acquisition order considering: owner transition urgency (transition score), 
capital requirements (entry cost), integration complexity (integration cost), and strategic sequencing 
(build platform before bolt-ons).

Respond ONLY as a JSON array, no markdown:
[{{"target_id": "<uuid>", "suggested_order": 0, "rationale": "<one sentence>"}}, ...]

suggested_order is 0-indexed. Include all {len(targets)} targets."""

    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = msg.content[0].text.strip().replace("```json", "").replace("```", "").strip()
    return json.loads(raw)


async def generate_memo(scenario: dict, financials: dict) -> str:
    """
    Generate a full IC memo as plain text with 7 sections.
    scenario: rollup_scenarios row with rollup_scenario_targets + targets joins.
    financials: output of compute_financials().
    """
    targets = scenario.get("rollup_scenario_targets") or []
    c = financials["combined"]

    target_summaries = []
    for t in sorted(targets, key=lambda x: x.get("sequence_order", 0)):
        tgt = t.get("targets") or {}
        scores = (tgt.get("target_scores") or [{}])[0]
        target_summaries.append(
            f"- {tgt.get('name','?')} | {tgt.get('industry_label','?')} | {tgt.get('country','?')} "
            f"| Revenue EUR {(tgt.get('revenue_eur') or 0):,} | Employees {tgt.get('employee_count','?')} "
            f"| Overall score {scores.get('overall_score','?')}/10 "
            f"| Entry multiple {t.get('entry_multiple',6)}x | Synergy {t.get('synergy_pct',15)}%"
        )

    fin_summary = f"""Combined portfolio metrics:
- Total revenue: EUR {c['total_revenue']:,}
- Pro-forma EBITDA (post-synergy): EUR {c['proforma_ebitda']:,}
- Total entry cost: EUR {c['total_entry_cost']:,}
- Total equity invested: EUR {c['total_equity_in']:,}
- Total synergy value: EUR {c['total_synergy_value']:,}
- Equity return estimate: {c['equity_return_pct']*100:.1f}%
- Exit value (at {c['avg_entry_multiple']}x): EUR {c['exit_value']:,}"""

    prompt = f"""Write a professional investment committee memo for this Search Fund roll-up strategy.

Scenario: {scenario['name']}
{f"Description: {scenario['description']}" if scenario.get('description') else ""}

Targets ({len(targets)} companies, in acquisition order):
{chr(10).join(target_summaries)}

{fin_summary}

Write exactly these 7 sections with these headings:
1. Executive Summary
2. Target Portfolio
3. Acquisition Sequence & Rationale
4. Financial Overview
5. Synergy Analysis
6. Risk Factors
7. Recommendation

Be analytical, concise, and professional. Write for a sophisticated M&A/PE audience.
Use the financial figures provided. Do not invent figures not given."""

    msg = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}]
    )
    return msg.content[0].text
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/services/rollup_service.py
git commit -m "feat: rollup service — compute_financials, estimate_ebitda_margin, suggest_sequence, generate_memo"
```

---

## Task 3: Rollup Router

**Files:**
- Create: `apps/api/routers/rollup.py`

- [ ] **Step 1: Create the router**

```python
# apps/api/routers/rollup.py
from fastapi import APIRouter, Depends, HTTPException, Response
from dependencies import get_db, get_tenant_id
from supabase import Client
from pydantic import BaseModel
from typing import Optional
import logging, io
from services.rollup_service import compute_financials, estimate_ebitda_margin, suggest_sequence, generate_memo
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.enums import TA_CENTER

router = APIRouter()
logger = logging.getLogger(__name__)

TARGET_JOIN = "*, targets(id, name, country, city, industry_label, industry_code, revenue_eur, employee_count, founded_year, owner_age_estimate, target_scores(overall_score, transition_score, value_score, market_score, financial_score, rationale, key_signals))"


class ScenarioCreate(BaseModel):
    name: str
    description: Optional[str] = None

class ScenarioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class TargetAdd(BaseModel):
    target_id: str

class AssumptionUpdate(BaseModel):
    entry_multiple: Optional[float] = None
    ebitda_margin_pct: Optional[float] = None
    ebitda_margin_source: Optional[str] = None
    synergy_pct: Optional[float] = None
    revenue_uplift_pct: Optional[float] = None
    debt_pct: Optional[float] = None
    integration_cost_eur: Optional[int] = None
    hold_period_years: Optional[int] = None
    notes: Optional[str] = None

class ReorderItem(BaseModel):
    target_id: str
    sequence_order: int

class ReorderPayload(BaseModel):
    order: list[ReorderItem]


def _get_scenario(db, scenario_id, tenant_id):
    res = db.table("rollup_scenarios").select(
        f"*, rollup_scenario_targets({TARGET_JOIN})"
    ).eq("id", scenario_id).eq("tenant_id", tenant_id).single().execute()
    if not res.data:
        raise HTTPException(404, "Scenario not found")
    # Sort targets by sequence_order
    if res.data.get("rollup_scenario_targets"):
        res.data["rollup_scenario_targets"].sort(key=lambda t: t.get("sequence_order", 0))
    return res.data


# --- Scenario CRUD ---

@router.get("/")
async def list_scenarios(
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    res = db.table("rollup_scenarios").select(
        "*, rollup_scenario_targets(id)"
    ).eq("tenant_id", tenant_id).order("updated_at", desc=True).execute()
    scenarios = res.data or []
    for s in scenarios:
        s["target_count"] = len(s.pop("rollup_scenario_targets", []) or [])
    return {"data": scenarios}


@router.post("/", status_code=201)
async def create_scenario(
    payload: ScenarioCreate,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    res = db.table("rollup_scenarios").insert({
        "tenant_id": tenant_id,
        "name": payload.name,
        "description": payload.description,
        "status": "draft",
    }).execute()
    return res.data[0]


@router.get("/{scenario_id}")
async def get_scenario(
    scenario_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    return _get_scenario(db, scenario_id, tenant_id)


@router.patch("/{scenario_id}")
async def update_scenario(
    scenario_id: str,
    payload: ScenarioUpdate,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "No fields to update")
    data["updated_at"] = "now()"
    res = db.table("rollup_scenarios").update(data).eq(
        "id", scenario_id).eq("tenant_id", tenant_id).execute()
    if not res.data:
        raise HTTPException(404, "Scenario not found")
    return res.data[0]


@router.delete("/{scenario_id}", status_code=204)
async def delete_scenario(
    scenario_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    db.table("rollup_scenarios").delete().eq(
        "id", scenario_id).eq("tenant_id", tenant_id).execute()
    return None


@router.post("/{scenario_id}/duplicate", status_code=201)
async def duplicate_scenario(
    scenario_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    original = _get_scenario(db, scenario_id, tenant_id)
    new_res = db.table("rollup_scenarios").insert({
        "tenant_id": tenant_id,
        "name": f"{original['name']} (copy)",
        "description": original.get("description"),
        "status": "draft",
    }).execute()
    new_id = new_res.data[0]["id"]
    targets = original.get("rollup_scenario_targets") or []
    if targets:
        rows = [{
            "scenario_id": new_id,
            "target_id": t["target_id"],
            "sequence_order": t["sequence_order"],
            "entry_multiple": t["entry_multiple"],
            "ebitda_margin_pct": t["ebitda_margin_pct"],
            "ebitda_margin_source": t["ebitda_margin_source"],
            "synergy_pct": t["synergy_pct"],
            "revenue_uplift_pct": t["revenue_uplift_pct"],
            "debt_pct": t["debt_pct"],
            "integration_cost_eur": t["integration_cost_eur"],
            "hold_period_years": t["hold_period_years"],
        } for t in targets]
        db.table("rollup_scenario_targets").insert(rows).execute()
    return new_res.data[0]


# --- Targets ---

@router.post("/{scenario_id}/targets", status_code=201)
async def add_target(
    scenario_id: str,
    payload: TargetAdd,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    # Verify scenario belongs to tenant
    _get_scenario(db, scenario_id, tenant_id)
    # Get current count for sequence_order
    count_res = db.table("rollup_scenario_targets").select(
        "id", count="exact"
    ).eq("scenario_id", scenario_id).execute()
    seq = count_res.count or 0
    # Insert with defaults
    ins = db.table("rollup_scenario_targets").insert({
        "scenario_id": scenario_id,
        "target_id": payload.target_id,
        "sequence_order": seq,
    }).execute()
    row_id = ins.data[0]["id"]
    # Estimate EBITDA margin via Claude
    try:
        tgt_res = db.table("targets").select(
            "*, target_scores(financial_score, key_signals)"
        ).eq("id", payload.target_id).single().execute()
        if tgt_res.data:
            margin = await estimate_ebitda_margin(tgt_res.data)
            db.table("rollup_scenario_targets").update({
                "ebitda_margin_pct": margin,
                "ebitda_margin_source": "ai",
            }).eq("id", row_id).execute()
    except Exception as e:
        logger.warning(f"EBITDA estimation failed for {payload.target_id}: {e}")
    return _get_scenario(db, scenario_id, tenant_id)


@router.patch("/{scenario_id}/targets/{target_id}")
async def update_target_assumptions(
    scenario_id: str,
    target_id: str,
    payload: AssumptionUpdate,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    _get_scenario(db, scenario_id, tenant_id)
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(400, "No fields to update")
    res = db.table("rollup_scenario_targets").update(data).eq(
        "scenario_id", scenario_id).eq("target_id", target_id).execute()
    if not res.data:
        raise HTTPException(404, "Target not in scenario")
    return res.data[0]


@router.delete("/{scenario_id}/targets/{target_id}", status_code=204)
async def remove_target(
    scenario_id: str,
    target_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    _get_scenario(db, scenario_id, tenant_id)
    db.table("rollup_scenario_targets").delete().eq(
        "scenario_id", scenario_id).eq("target_id", target_id).execute()
    return None


@router.post("/{scenario_id}/reorder")
async def reorder_targets(
    scenario_id: str,
    payload: ReorderPayload,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    _get_scenario(db, scenario_id, tenant_id)
    for item in payload.order:
        db.table("rollup_scenario_targets").update({
            "sequence_order": item.sequence_order
        }).eq("scenario_id", scenario_id).eq("target_id", item.target_id).execute()
    return {"ok": True}


# --- AI & Financials ---

@router.get("/{scenario_id}/financials")
async def get_financials(
    scenario_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    scenario = _get_scenario(db, scenario_id, tenant_id)
    targets = scenario.get("rollup_scenario_targets") or []
    return compute_financials(targets)


@router.post("/{scenario_id}/estimate-ebitda/{target_id}")
async def estimate_ebitda_endpoint(
    scenario_id: str,
    target_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    _get_scenario(db, scenario_id, tenant_id)
    tgt_res = db.table("targets").select(
        "*, target_scores(financial_score, key_signals)"
    ).eq("id", target_id).single().execute()
    if not tgt_res.data:
        raise HTTPException(404, "Target not found")
    margin = await estimate_ebitda_margin(tgt_res.data)
    db.table("rollup_scenario_targets").update({
        "ebitda_margin_pct": margin,
        "ebitda_margin_source": "ai",
    }).eq("scenario_id", scenario_id).eq("target_id", target_id).execute()
    return {"ebitda_margin_pct": margin, "ebitda_margin_source": "ai"}


@router.post("/{scenario_id}/sequence")
async def sequence_targets(
    scenario_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    scenario = _get_scenario(db, scenario_id, tenant_id)
    targets = scenario.get("rollup_scenario_targets") or []
    if not targets:
        return {"suggestions": []}
    suggestions = await suggest_sequence(targets)
    return {"suggestions": suggestions}


@router.post("/{scenario_id}/memo")
async def generate_memo_endpoint(
    scenario_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    scenario = _get_scenario(db, scenario_id, tenant_id)
    targets = scenario.get("rollup_scenario_targets") or []
    financials = compute_financials(targets)
    memo_text = await generate_memo(scenario, financials)
    return {"memo": memo_text}


@router.get("/{scenario_id}/memo/pdf")
async def memo_pdf(
    scenario_id: str,
    tenant_id: str = Depends(get_tenant_id),
    db: Client = Depends(get_db)
):
    scenario = _get_scenario(db, scenario_id, tenant_id)
    targets = scenario.get("rollup_scenario_targets") or []
    financials = compute_financials(targets)
    memo_text = await generate_memo(scenario, financials)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('t', fontSize=18, fontName='Helvetica-Bold',
        spaceAfter=4, textColor=colors.HexColor('#1e293b'))
    subtitle_style = ParagraphStyle('s', fontSize=11, fontName='Helvetica',
        textColor=colors.HexColor('#64748b'), spaceAfter=16)
    section_style = ParagraphStyle('sec', fontSize=11, fontName='Helvetica-Bold',
        spaceBefore=14, spaceAfter=6, textColor=colors.HexColor('#1e293b'))
    body_style = ParagraphStyle('b', fontSize=10, fontName='Helvetica',
        leading=15, textColor=colors.HexColor('#334155'))
    footer_style = ParagraphStyle('f', fontSize=8, textColor=colors.HexColor('#94a3b8'),
        alignment=TA_CENTER)

    story = []
    story.append(Paragraph(scenario["name"], title_style))
    story.append(Paragraph(f"Roll-up Investment Thesis · {len(targets)} target companies", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e2e8f0')))
    story.append(Spacer(1, 12))

    for line in memo_text.split('\n'):
        line = line.strip()
        if not line:
            story.append(Spacer(1, 4))
        elif any(line.startswith(f"{i}.") for i in range(1, 8)) or line.endswith(':'):
            story.append(Paragraph(line, section_style))
        elif line.startswith('•') or line.startswith('-'):
            story.append(Paragraph(f"• {line.lstrip('•- ')}", body_style))
        else:
            story.append(Paragraph(line, body_style))

    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#e2e8f0')))
    story.append(Spacer(1, 6))
    story.append(Paragraph("Generated by Horus AI · Confidential · For internal use only", footer_style))

    doc.build(story)
    buffer.seek(0)
    filename = f"rollup-memo-{scenario['name'].lower().replace(' ', '-')[:40]}.pdf"
    return Response(
        content=buffer.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/routers/rollup.py
git commit -m "feat: rollup router — 15 endpoints for scenario CRUD, targets, financials, AI, PDF"
```

---

## Task 4: Register Router + Deploy API

**Files:**
- Modify: `apps/api/main.py`

- [ ] **Step 1: Add rollup import and router registration**

In `apps/api/main.py`, add after the existing imports:
```python
from routers import targets, scoring, clusters, chat, exports, pipeline, billing, rollup
```

Add after `app.include_router(pipeline.router, ...)`:
```python
app.include_router(rollup.router, prefix="/rollup", tags=["rollup"])
```

- [ ] **Step 2: Deploy to Fly.io**

```bash
cd /Users/callmepio/Desktop/horus-main/apps/api
~/.fly/bin/flyctl deploy
```

Expected: deployment succeeds. Verify:
```bash
curl https://searchfund-api.fly.dev/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 3: Commit**

```bash
cd /Users/callmepio/Desktop/horus-main
git add apps/api/main.py
git commit -m "feat: register rollup router in FastAPI app"
```

---

## Task 5: API Client Types + Methods

**Files:**
- Modify: `apps/web/lib/api/client.ts`

- [ ] **Step 1: Add types and rollup API methods**

Add these interfaces after the `Cluster` interface (around line 149):

```typescript
export interface RollupScenario {
  id: string
  tenant_id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'archived'
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  target_count?: number
  rollup_scenario_targets?: RollupScenarioTarget[]
}

export interface RollupScenarioTarget {
  id: string
  scenario_id: string
  target_id: string
  sequence_order: number
  entry_multiple: number
  ebitda_margin_pct: number | null
  ebitda_margin_source: 'ai' | 'manual'
  synergy_pct: number
  revenue_uplift_pct: number
  debt_pct: number
  integration_cost_eur: number
  hold_period_years: number
  notes: string | null
  targets?: {
    id: string
    name: string
    country: string | null
    city: string | null
    industry_label: string | null
    industry_code: string | null
    revenue_eur: number | null
    employee_count: number | null
    founded_year: number | null
    owner_age_estimate: number | null
    target_scores: { overall_score: number; transition_score: number; financial_score: number; key_signals: string[]; rationale: string }[]
  } | null
}

export interface TargetFinancials {
  target_id: string
  name: string
  sequence_order: number
  revenue_eur: number
  ebitda: number
  entry_cost: number
  debt: number
  equity_in: number
  synergy_value: number
  revenue_uplift: number
}

export interface CombinedFinancials {
  total_revenue: number
  total_ebitda_pre_synergy: number
  total_synergy_value: number
  total_revenue_uplift: number
  proforma_ebitda: number
  proforma_revenue: number
  total_entry_cost: number
  total_integration_cost: number
  total_equity_in: number
  total_debt: number
  avg_entry_multiple: number
  exit_value: number
  equity_return_pct: number
}

export interface RollupFinancials {
  targets: TargetFinancials[]
  combined: CombinedFinancials
}
```

Add the `rollup` section inside the `api` object (after `clusters:`):

```typescript
  rollup: {
    list: () =>
      apiFetch<{ data: RollupScenario[] }>('/rollup/'),
    create: (name: string, description?: string) =>
      apiFetch<RollupScenario>('/rollup/', {
        method: 'POST',
        body: JSON.stringify({ name, description }),
      }),
    get: (id: string) =>
      apiFetch<RollupScenario>(`/rollup/${id}`),
    update: (id: string, data: { name?: string; description?: string; status?: string }) =>
      apiFetch<RollupScenario>(`/rollup/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/rollup/${id}`, { method: 'DELETE' }),
    duplicate: (id: string) =>
      apiFetch<RollupScenario>(`/rollup/${id}/duplicate`, { method: 'POST' }),
    addTarget: (scenarioId: string, targetId: string) =>
      apiFetch<RollupScenario>(`/rollup/${scenarioId}/targets`, {
        method: 'POST',
        body: JSON.stringify({ target_id: targetId }),
      }),
    updateTarget: (scenarioId: string, targetId: string, data: Partial<RollupScenarioTarget>) =>
      apiFetch<RollupScenarioTarget>(`/rollup/${scenarioId}/targets/${targetId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    removeTarget: (scenarioId: string, targetId: string) =>
      apiFetch<void>(`/rollup/${scenarioId}/targets/${targetId}`, { method: 'DELETE' }),
    reorder: (scenarioId: string, order: { target_id: string; sequence_order: number }[]) =>
      apiFetch<{ ok: boolean }>(`/rollup/${scenarioId}/reorder`, {
        method: 'POST',
        body: JSON.stringify({ order }),
      }),
    financials: (id: string) =>
      apiFetch<RollupFinancials>(`/rollup/${id}/financials`),
    estimateEbitda: (scenarioId: string, targetId: string) =>
      apiFetch<{ ebitda_margin_pct: number; ebitda_margin_source: string }>(
        `/rollup/${scenarioId}/estimate-ebitda/${targetId}`,
        { method: 'POST' }
      ),
    sequence: (id: string) =>
      apiFetch<{ suggestions: { target_id: string; suggested_order: number; rationale: string }[] }>(
        `/rollup/${id}/sequence`,
        { method: 'POST' }
      ),
    memo: (id: string) =>
      apiFetch<{ memo: string }>(`/rollup/${id}/memo`, { method: 'POST' }),
    memoPdfUrl: (id: string) => `${API_URL}/rollup/${id}/memo/pdf`,
  },
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/api/client.ts
git commit -m "feat: add RollupScenario types and api.rollup methods to client"
```

---

## Task 6: Sidebar + Clusters Button

**Files:**
- Modify: `apps/web/components/layout/Sidebar.tsx`
- Modify: `apps/web/app/(dashboard)/clusters/page.tsx`

- [ ] **Step 1: Add Roll-up to sidebar nav**

In `apps/web/components/layout/Sidebar.tsx`, find the `nav` array and add the Roll-up entry between Clusters and Pipeline:

```typescript
import { LayoutDashboard, Search, Kanban, Settings, Network, TrendingUp } from 'lucide-react'

const nav = [
  { href: '/dashboard',   label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/discovery',   label: 'Discovery',  icon: Search },
  { href: '/clusters',    label: 'Clusters',   icon: Network },
  { href: '/rollup',      label: 'Roll-up',    icon: TrendingUp },
  { href: '/pipeline',    label: 'Pipeline',   icon: Kanban },
  { href: '/settings',    label: 'Settings',   icon: Settings },
]
```

- [ ] **Step 2: Add "Build roll-up →" button to Clusters page**

In `apps/web/app/(dashboard)/clusters/page.tsx`, add `Link` import and update the header buttons:

```tsx
import Link from 'next/link'
```

Replace the existing button div in the header:
```tsx
<div className="flex items-center gap-2">
  <Link
    href="/rollup"
    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-input bg-background text-xs font-medium hover:bg-accent transition-colors"
  >
    Build roll-up →
  </Link>
  <Button size="sm" variant="outline" className="gap-2" onClick={handleRefresh} disabled={refreshing}>
    {refreshing
      ? <><Loader2 className="h-4 w-4 animate-spin" /> Clustering…</>
      : <><RefreshCw className="h-4 w-4" /> Refresh clusters</>}
  </Button>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/layout/Sidebar.tsx apps/web/app/\(dashboard\)/clusters/page.tsx
git commit -m "feat: add Roll-up nav item to sidebar and Build roll-up button on Clusters page"
```

---

## Task 7: Scenario List Page

**Files:**
- Create: `apps/web/app/(dashboard)/rollup/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// apps/web/app/(dashboard)/rollup/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, RollupScenario } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Copy, GitCompare, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

function fmt(n: number) {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`
  return `€${n}`
}

export default function RollupPage() {
  const router = useRouter()
  const [scenarios, setScenarios] = useState<RollupScenario[]>([])
  const [loading, setLoading] = useState(true)
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.rollup.list().then(r => { setScenarios(r.data); setLoading(false) })
  }, [])

  const handleCreate = async () => {
    const name = `Roll-up scenario ${new Date().toLocaleDateString('en-GB')}`
    const s = await api.rollup.create(name)
    router.push(`/rollup/${s.id}`)
  }

  const handleDuplicate = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    const s = await api.rollup.duplicate(id)
    toast.success('Scenario duplicated')
    setScenarios(prev => [s, ...prev])
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    if (!confirm('Delete this scenario?')) return
    await api.rollup.delete(id)
    setScenarios(prev => prev.filter(s => s.id !== id))
    toast.success('Scenario deleted')
  }

  const toggleCompare = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    setCompareSet(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else {
        if (next.size >= 2) { toast.error('Select exactly 2 scenarios to compare'); return prev }
        next.add(id)
      }
      return next
    })
  }

  const handleCompare = () => {
    const [a, b] = [...compareSet]
    router.push(`/rollup/compare?a=${a}&b=${b}`)
  }

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    active: 'bg-emerald-50 text-emerald-700',
    archived: 'bg-amber-50 text-amber-700',
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Roll-up Modeler</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {loading ? 'Loading…' : `${scenarios.length} scenario${scenarios.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {compareSet.size === 2 && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCompare}>
              <GitCompare className="h-3.5 w-3.5" />
              Compare
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={handleCreate}>
            <Plus className="h-3.5 w-3.5" />
            New scenario
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading scenarios…</p>
      ) : scenarios.length === 0 ? (
        <div className="border rounded-sm p-12 text-center text-sm text-muted-foreground">
          <TrendingUp className="h-8 w-8 mx-auto mb-3 opacity-20" />
          <p className="font-medium mb-1">No roll-up scenarios yet</p>
          <p className="mb-4">Model a portfolio acquisition strategy across multiple targets.</p>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Create first scenario
          </Button>
        </div>
      ) : (
        <div className="border rounded-sm divide-y">
          {scenarios.map(s => (
            <Link
              key={s.id}
              href={`/rollup/${s.id}`}
              className={cn(
                'flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors group',
                compareSet.has(s.id) && 'bg-blue-50/50'
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full', STATUS_COLORS[s.status] ?? STATUS_COLORS.draft)}>
                    {s.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.target_count ?? 0} target{(s.target_count ?? 0) !== 1 ? 's' : ''}
                  {' · '}Last edited {new Date(s.updated_at).toLocaleDateString('en-GB')}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className={cn(
                    'p-1.5 rounded text-xs border transition-colors',
                    compareSet.has(s.id)
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'border-input hover:bg-accent text-muted-foreground'
                  )}
                  onClick={e => toggleCompare(s.id, e)}
                  title="Select for comparison"
                >
                  <GitCompare className="h-3.5 w-3.5" />
                </button>
                <button
                  className="p-1.5 rounded border border-input hover:bg-accent text-muted-foreground transition-colors"
                  onClick={e => handleDuplicate(s.id, e)}
                  title="Duplicate"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  className="p-1.5 rounded border border-input hover:text-destructive text-muted-foreground transition-colors"
                  onClick={e => handleDelete(s.id, e)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(dashboard\)/rollup/page.tsx
git commit -m "feat: rollup scenario list page with create, duplicate, delete, compare selection"
```

---

## Task 8: computeFinancials Utility + useScenario Hook

**Files:**
- Create: `apps/web/app/(dashboard)/rollup/[id]/lib/computeFinancials.ts`
- Create: `apps/web/app/(dashboard)/rollup/[id]/hooks/useScenario.ts`

- [ ] **Step 1: Create computeFinancials utility**

```typescript
// apps/web/app/(dashboard)/rollup/[id]/lib/computeFinancials.ts
import { RollupScenarioTarget, RollupFinancials } from '@/lib/api/client'

export function computeFinancials(targets: RollupScenarioTarget[]): RollupFinancials {
  const perTarget = targets.map(t => {
    const revenue = t.targets?.revenue_eur ?? 0
    const margin = (t.ebitda_margin_pct ?? 0) / 100
    const ebitda = revenue * margin
    const entry_cost = ebitda * t.entry_multiple
    const debt = entry_cost * t.debt_pct / 100
    const equity_in = entry_cost - debt
    const synergy_value = ebitda * t.synergy_pct / 100
    const revenue_uplift = revenue * t.revenue_uplift_pct / 100
    return {
      target_id: t.target_id,
      name: t.targets?.name ?? '',
      sequence_order: t.sequence_order,
      revenue_eur: revenue,
      ebitda: Math.round(ebitda),
      entry_cost: Math.round(entry_cost),
      debt: Math.round(debt),
      equity_in: Math.round(equity_in),
      synergy_value: Math.round(synergy_value),
      revenue_uplift: Math.round(revenue_uplift),
    }
  })

  const total_revenue = perTarget.reduce((s, t) => s + t.revenue_eur, 0)
  const total_ebitda_pre_synergy = perTarget.reduce((s, t) => s + t.ebitda, 0)
  const total_synergy_value = perTarget.reduce((s, t) => s + t.synergy_value, 0)
  const total_revenue_uplift = perTarget.reduce((s, t) => s + t.revenue_uplift, 0)
  const proforma_ebitda = total_ebitda_pre_synergy + total_synergy_value
  const proforma_revenue = total_revenue + total_revenue_uplift
  const total_entry_cost = perTarget.reduce((s, t) => s + t.entry_cost, 0)
  const total_integration_cost = targets.reduce((s, t) => s + (t.integration_cost_eur ?? 0), 0)
  const total_equity_in = perTarget.reduce((s, t) => s + t.equity_in, 0)
  const total_debt = perTarget.reduce((s, t) => s + t.debt, 0)
  const avg_entry_multiple = targets.length > 0
    ? targets.reduce((s, t) => s + t.entry_multiple, 0) / targets.length
    : 0
  const exit_value = proforma_ebitda * avg_entry_multiple
  const equity_return_pct = total_equity_in > 0
    ? (exit_value - total_debt - total_integration_cost) / total_equity_in - 1
    : 0

  return {
    targets: perTarget,
    combined: {
      total_revenue,
      total_ebitda_pre_synergy,
      total_synergy_value,
      total_revenue_uplift,
      proforma_ebitda: Math.round(proforma_ebitda),
      proforma_revenue: Math.round(proforma_revenue),
      total_entry_cost: Math.round(total_entry_cost),
      total_integration_cost,
      total_equity_in: Math.round(total_equity_in),
      total_debt: Math.round(total_debt),
      avg_entry_multiple: Math.round(avg_entry_multiple * 100) / 100,
      exit_value: Math.round(exit_value),
      equity_return_pct: Math.round(equity_return_pct * 10000) / 10000,
    }
  }
}
```

- [ ] **Step 2: Create useScenario hook**

```typescript
// apps/web/app/(dashboard)/rollup/[id]/hooks/useScenario.ts
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { api, RollupScenario, RollupScenarioTarget, RollupFinancials } from '@/lib/api/client'
import { computeFinancials } from '../lib/computeFinancials'
import { arrayMove } from '@dnd-kit/sortable'

export function useScenario(id: string) {
  const [scenario, setScenario] = useState<RollupScenario | null>(null)
  const [targets, setTargets] = useState<RollupScenarioTarget[]>([])
  const [financials, setFinancials] = useState<RollupFinancials | null>(null)
  const [loading, setLoading] = useState(true)
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const refresh = useCallback(async () => {
    const s = await api.rollup.get(id)
    setScenario(s)
    const t = s.rollup_scenario_targets ?? []
    const sorted = [...t].sort((a, b) => a.sequence_order - b.sequence_order)
    setTargets(sorted)
    setFinancials(computeFinancials(sorted))
  }, [id])

  useEffect(() => {
    setLoading(true)
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const addTarget = useCallback(async (targetId: string) => {
    // API estimates EBITDA and returns updated scenario
    const s = await api.rollup.addTarget(id, targetId)
    const t = s.rollup_scenario_targets ?? []
    const sorted = [...t].sort((a, b) => a.sequence_order - b.sequence_order)
    setTargets(sorted)
    setFinancials(computeFinancials(sorted))
  }, [id])

  const removeTarget = useCallback(async (targetId: string) => {
    setTargets(prev => {
      const next = prev.filter(t => t.target_id !== targetId)
      setFinancials(computeFinancials(next))
      return next
    })
    await api.rollup.removeTarget(id, targetId)
  }, [id])

  const updateAssumption = useCallback((targetId: string, field: keyof RollupScenarioTarget, value: number | string) => {
    setTargets(prev => {
      const next = prev.map(t =>
        t.target_id === targetId
          ? { ...t, [field]: value, ...(field === 'ebitda_margin_pct' ? { ebitda_margin_source: 'manual' } : {}) }
          : t
      )
      setFinancials(computeFinancials(next))
      return next
    })
    // Debounce API call per target
    const key = `${targetId}-${field}`
    clearTimeout(debounceRefs.current[key])
    debounceRefs.current[key] = setTimeout(() => {
      const payload: Record<string, unknown> = { [field]: value }
      if (field === 'ebitda_margin_pct') payload.ebitda_margin_source = 'manual'
      api.rollup.updateTarget(id, targetId, payload as Partial<RollupScenarioTarget>)
    }, 500)
  }, [id])

  const reorder = useCallback(async (activeId: string, overId: string) => {
    setTargets(prev => {
      const oldIndex = prev.findIndex(t => t.target_id === activeId)
      const newIndex = prev.findIndex(t => t.target_id === overId)
      if (oldIndex === -1 || newIndex === -1) return prev
      const next = arrayMove(prev, oldIndex, newIndex).map((t, i) => ({ ...t, sequence_order: i }))
      setFinancials(computeFinancials(next))
      // Fire API in background
      api.rollup.reorder(id, next.map(t => ({ target_id: t.target_id, sequence_order: t.sequence_order })))
      return next
    })
  }, [id])

  const applySequenceSuggestion = useCallback(async () => {
    const res = await api.rollup.sequence(id)
    const suggestions = res.suggestions
    setTargets(prev => {
      const map = new Map(suggestions.map(s => [s.target_id, s.suggested_order]))
      const next = [...prev]
        .map(t => ({ ...t, sequence_order: map.get(t.target_id) ?? t.sequence_order }))
        .sort((a, b) => a.sequence_order - b.sequence_order)
      setFinancials(computeFinancials(next))
      api.rollup.reorder(id, next.map(t => ({ target_id: t.target_id, sequence_order: t.sequence_order })))
      return next
    })
    return suggestions
  }, [id])

  return {
    scenario,
    targets,
    financials,
    loading,
    addTarget,
    removeTarget,
    updateAssumption,
    reorder,
    applySequenceSuggestion,
    refresh,
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/rollup/
git commit -m "feat: computeFinancials utility and useScenario hook with optimistic updates"
```

---

## Task 9: AssumptionInputs + TargetRow Components

**Files:**
- Create: `apps/web/app/(dashboard)/rollup/[id]/components/AssumptionInputs.tsx`
- Create: `apps/web/app/(dashboard)/rollup/[id]/components/TargetRow.tsx`

- [ ] **Step 1: Create AssumptionInputs**

```tsx
// apps/web/app/(dashboard)/rollup/[id]/components/AssumptionInputs.tsx
'use client'
import { RollupScenarioTarget } from '@/lib/api/client'

interface Props {
  target: RollupScenarioTarget
  onChange: (field: keyof RollupScenarioTarget, value: number) => void
}

function NumInput({ label, value, onChange, min, max, step, suffix }: {
  label: string; value: number | null; onChange: (v: number) => void
  min?: number; max?: number; step?: number; suffix?: string
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-0.5">{label}</label>
      <div className="relative">
        <input
          type="number"
          className="h-7 w-full rounded-sm border border-input bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
          value={value ?? ''}
          min={min}
          max={max}
          step={step ?? 0.1}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

export default function AssumptionInputs({ target, onChange }: Props) {
  const isAiMargin = target.ebitda_margin_source === 'ai'

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 pb-1">
      <div>
        <label className="text-xs block mb-0.5">
          <span className="text-muted-foreground">EBITDA margin </span>
          <span className={`text-xs px-1 py-0.5 rounded ${isAiMargin ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
            {isAiMargin ? 'AI est.' : 'manual'}
          </span>
        </label>
        <div className="relative">
          <input
            type="number"
            className="h-7 w-full rounded-sm border border-input bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            value={target.ebitda_margin_pct ?? ''}
            min={0} max={50} step={0.5}
            onChange={e => onChange('ebitda_margin_pct', parseFloat(e.target.value) || 0)}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
        </div>
      </div>
      <NumInput label="Entry multiple" value={target.entry_multiple} onChange={v => onChange('entry_multiple', v)} min={2} max={20} step={0.5} suffix="x" />
      <NumInput label="Cost synergy" value={target.synergy_pct} onChange={v => onChange('synergy_pct', v)} min={0} max={50} step={1} suffix="%" />
      <NumInput label="Revenue uplift" value={target.revenue_uplift_pct} onChange={v => onChange('revenue_uplift_pct', v)} min={0} max={50} step={1} suffix="%" />
      <NumInput label="Debt financing" value={target.debt_pct} onChange={v => onChange('debt_pct', v)} min={0} max={90} step={5} suffix="%" />
      <NumInput label="Integration cost" value={target.integration_cost_eur / 1000} onChange={v => onChange('integration_cost_eur', Math.round(v * 1000))} min={0} step={10} suffix="K€" />
    </div>
  )
}
```

- [ ] **Step 2: Create TargetRow**

```tsx
// apps/web/app/(dashboard)/rollup/[id]/components/TargetRow.tsx
'use client'
import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { RollupScenarioTarget } from '@/lib/api/client'
import ScoreBadge from '@/components/shared/ScoreBadge'
import AssumptionInputs from './AssumptionInputs'
import { GripVertical, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  target: RollupScenarioTarget
  index: number
  onChange: (field: keyof RollupScenarioTarget, value: number) => void
  onRemove: () => void
}

export default function TargetRow({ target, index, onChange, onRemove }: Props) {
  const [expanded, setExpanded] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: target.target_id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const t = target.targets
  const score = t?.target_scores?.[0]?.overall_score

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'border rounded-sm bg-card select-none',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      <div className="flex items-center gap-2 px-2 py-2">
        <span className="text-xs font-mono text-muted-foreground w-4 shrink-0">{index + 1}</span>
        <button
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{t?.name ?? 'Unknown'}</p>
          <p className="text-xs text-muted-foreground truncate">
            {[t?.city, t?.country].filter(Boolean).join(', ')}
            {t?.industry_label ? ` · ${t.industry_label}` : ''}
          </p>
        </div>
        <ScoreBadge score={score} size="sm" />
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <button
          className="text-muted-foreground hover:text-destructive transition-colors"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-2 border-t">
          <AssumptionInputs target={target} onChange={onChange} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/rollup/\[id\]/components/
git commit -m "feat: AssumptionInputs and TargetRow components"
```

---

## Task 10: LeftPanel Component

**Files:**
- Create: `apps/web/app/(dashboard)/rollup/[id]/components/LeftPanel.tsx`

- [ ] **Step 1: Create LeftPanel**

```tsx
// apps/web/app/(dashboard)/rollup/[id]/components/LeftPanel.tsx
'use client'
import { useState, useEffect } from 'react'
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { api, RollupScenarioTarget, Target } from '@/lib/api/client'
import TargetRow from './TargetRow'
import { Search, Wand2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  targets: RollupScenarioTarget[]
  scenarioId: string
  onAddTarget: (targetId: string) => Promise<void>
  onRemoveTarget: (targetId: string) => Promise<void>
  onUpdateAssumption: (targetId: string, field: keyof RollupScenarioTarget, value: number) => void
  onReorder: (activeId: string, overId: string) => Promise<void>
  onApplySequence: () => Promise<unknown>
}

export default function LeftPanel({
  targets, scenarioId, onAddTarget, onRemoveTarget, onUpdateAssumption, onReorder, onApplySequence
}: Props) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Target[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [sequencing, setSequencing] = useState(false)

  const inScenario = new Set(targets.map(t => t.target_id))

  const totalRevenue = targets.reduce((s, t) => s + (t.targets?.revenue_eur ?? 0), 0)

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.targets.list({ search })
        setResults((res.data || []).filter(t => !inScenario.has(t.id)))
      } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const handleAdd = async (targetId: string) => {
    setAdding(targetId)
    try {
      await onAddTarget(targetId)
      setSearch('')
      setResults([])
      toast.success('Target added — EBITDA margin estimated')
    } catch {
      toast.error('Failed to add target')
    } finally {
      setAdding(null)
    }
  }

  const handleSequence = async () => {
    if (targets.length < 2) { toast.error('Need at least 2 targets to sequence'); return }
    setSequencing(true)
    try {
      await onApplySequence()
      toast.success('Sequence applied')
    } catch {
      toast.error('Sequencing failed')
    } finally {
      setSequencing(false)
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      onReorder(active.id as string, over.id as string)
    }
  }

  function fmtRevenue(n: number) {
    if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`
    return `€${n}`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            className="h-8 w-full pl-8 pr-3 rounded-sm border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Search targets to add…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {searching && <p className="text-xs text-muted-foreground">Searching…</p>}

        {results.length > 0 && (
          <div className="border rounded-sm divide-y max-h-48 overflow-y-auto">
            {results.map(t => (
              <div key={t.id} className="flex items-center justify-between px-2 py-1.5 hover:bg-muted/30">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[t.city, t.country].filter(Boolean).join(', ')}
                  </p>
                </div>
                <button
                  className={cn(
                    'shrink-0 text-xs px-2 py-1 rounded-sm border border-input hover:bg-accent transition-colors ml-2',
                    adding === t.id && 'opacity-50 pointer-events-none'
                  )}
                  onClick={() => handleAdd(t.id)}
                >
                  {adding === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                </button>
              </div>
            ))}
          </div>
        )}

        {search && !searching && results.length === 0 && (
          <p className="text-xs text-muted-foreground">No targets found</p>
        )}
      </div>

      {/* Target list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {targets.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Search above to add targets to this scenario
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={targets.map(t => t.target_id)} strategy={verticalListSortingStrategy}>
              {targets.map((t, i) => (
                <TargetRow
                  key={t.target_id}
                  target={t}
                  index={i}
                  onChange={(field, value) => onUpdateAssumption(t.target_id, field, value)}
                  onRemove={() => onRemoveTarget(t.target_id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t space-y-2">
        {targets.length >= 2 && (
          <button
            className="w-full flex items-center justify-center gap-1.5 h-7 text-xs border border-input rounded-sm hover:bg-accent transition-colors"
            onClick={handleSequence}
            disabled={sequencing}
          >
            {sequencing
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Sequencing…</>
              : <><Wand2 className="h-3 w-3" /> AI suggest sequence</>}
          </button>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{targets.length} target{targets.length !== 1 ? 's' : ''}</span>
          <span className="font-medium text-foreground">{fmtRevenue(totalRevenue)} combined rev.</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(dashboard\)/rollup/\[id\]/components/LeftPanel.tsx
git commit -m "feat: LeftPanel with target search, dnd-kit sortable sequence, AI sequence button"
```

---

## Task 11: Right Panel Components

**Files:**
- Create: `apps/web/app/(dashboard)/rollup/[id]/components/FinancialSummary.tsx`
- Create: `apps/web/app/(dashboard)/rollup/[id]/components/AcquisitionTimeline.tsx`
- Create: `apps/web/app/(dashboard)/rollup/[id]/components/SynergyMap.tsx`
- Create: `apps/web/app/(dashboard)/rollup/[id]/components/IcMemo.tsx`

- [ ] **Step 1: Create FinancialSummary**

```tsx
// apps/web/app/(dashboard)/rollup/[id]/components/FinancialSummary.tsx
'use client'
import { RollupFinancials } from '@/lib/api/client'

interface Props { financials: RollupFinancials }

function fmt(n: number, prefix = '€') {
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}K`
  return `${prefix}${n}`
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded-sm p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

export default function FinancialSummary({ financials }: Props) {
  const c = financials.combined
  const returnPct = c.equity_return_pct * 100

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Combined financials
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <KPI label="Pro-forma revenue" value={fmt(c.proforma_revenue)} sub={`Pre-synergy ${fmt(c.total_revenue)}`} />
        <KPI label="Pro-forma EBITDA" value={fmt(c.proforma_ebitda)} sub={`Synergies ${fmt(c.total_synergy_value)}`} />
        <KPI label="Total entry cost" value={fmt(c.total_entry_cost)} sub={`Avg ${c.avg_entry_multiple}x EV/EBITDA`} />
        <KPI label="Equity return est." value={`${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(0)}%`}
          sub={`Exit ${fmt(c.exit_value)} · Equity in ${fmt(c.total_equity_in)}`} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="border rounded-sm px-3 py-2">
          <p className="text-muted-foreground">Total debt</p>
          <p className="font-medium tabular-nums mt-0.5">{fmt(c.total_debt)}</p>
        </div>
        <div className="border rounded-sm px-3 py-2">
          <p className="text-muted-foreground">Integration cost</p>
          <p className="font-medium tabular-nums mt-0.5">{fmt(c.total_integration_cost)}</p>
        </div>
        <div className="border rounded-sm px-3 py-2">
          <p className="text-muted-foreground">Revenue uplift</p>
          <p className="font-medium tabular-nums mt-0.5">{fmt(c.total_revenue_uplift)}</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create AcquisitionTimeline**

```tsx
// apps/web/app/(dashboard)/rollup/[id]/components/AcquisitionTimeline.tsx
'use client'
import { RollupScenarioTarget } from '@/lib/api/client'

interface Props { targets: RollupScenarioTarget[] }

export default function AcquisitionTimeline({ targets }: Props) {
  if (targets.length === 0) return null
  const sorted = [...targets].sort((a, b) => a.sequence_order - b.sequence_order)

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Acquisition sequence
      </h3>
      <div className="relative">
        {/* Connecting line */}
        <div className="absolute top-4 left-4 right-4 h-px bg-border" />
        <div className="flex gap-0 overflow-x-auto pb-1">
          {sorted.map((t, i) => {
            const name = t.targets?.name ?? 'Unknown'
            const score = t.targets?.target_scores?.[0]?.overall_score
            return (
              <div key={t.target_id} className="flex flex-col items-center min-w-0 flex-1 relative">
                <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold z-10 shrink-0">
                  {i + 1}
                </div>
                <p className="text-xs font-medium text-center mt-1.5 px-1 truncate w-full">{name}</p>
                {score != null && (
                  <p className="text-xs text-muted-foreground">{score.toFixed(1)}</p>
                )}
                <p className="text-xs text-muted-foreground">{t.hold_period_years}yr hold</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create SynergyMap**

```tsx
// apps/web/app/(dashboard)/rollup/[id]/components/SynergyMap.tsx
'use client'
import { RollupFinancials } from '@/lib/api/client'

interface Props { financials: RollupFinancials }

function fmt(n: number) {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`
  return `€${n}`
}

export default function SynergyMap({ financials }: Props) {
  if (financials.targets.length === 0) return null
  const sorted = [...financials.targets].sort((a, b) => a.sequence_order - b.sequence_order)
  const maxEbitda = Math.max(...sorted.map(t => t.ebitda), 1)

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Synergy contribution
      </h3>
      <div className="space-y-2">
        {sorted.map((t, i) => (
          <div key={t.target_id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium truncate">{t.name}</span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-2">
                <span>EBITDA {fmt(t.ebitda)}</span>
                <span className="text-emerald-600">+{fmt(t.synergy_value)} synergy</span>
              </div>
            </div>
            <div className="flex h-3 gap-0.5 rounded overflow-hidden">
              <div
                className="bg-slate-700 transition-all"
                style={{ width: `${(t.ebitda / maxEbitda) * 75}%`, minWidth: t.ebitda > 0 ? 4 : 0 }}
                title={`EBITDA: ${fmt(t.ebitda)}`}
              />
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${(t.synergy_value / maxEbitda) * 75}%`, minWidth: t.synergy_value > 0 ? 2 : 0 }}
                title={`Synergy: ${fmt(t.synergy_value)}`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-slate-700 inline-block" /> EBITDA</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-emerald-500 inline-block" /> Synergy</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create IcMemo**

```tsx
// apps/web/app/(dashboard)/rollup/[id]/components/IcMemo.tsx
'use client'
import { useState } from 'react'
import { api } from '@/lib/api/client'
import { FileText, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props { scenarioId: string; scenarioName: string }

export default function IcMemo({ scenarioId, scenarioName }: Props) {
  const [memo, setMemo] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await api.rollup.memo(scenarioId)
      setMemo(res.memo)
    } catch {
      toast.error('Memo generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          IC Memo
        </h3>
        <div className="flex items-center gap-2">
          {memo && (
            <a
              href={api.rollup.memoPdfUrl(scenarioId)}
              download
              className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs border border-input rounded-sm hover:bg-accent transition-colors"
            >
              <Download className="h-3 w-3" />
              PDF
            </a>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs bg-foreground text-background rounded-sm hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {generating
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
              : <><FileText className="h-3 w-3" /> {memo ? 'Regenerate' : 'Generate memo'}</>}
          </button>
        </div>
      </div>

      {memo ? (
        <div className="border rounded-sm p-4 bg-card text-xs leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto font-mono">
          {memo}
        </div>
      ) : (
        <div className="border rounded-sm p-8 text-center text-xs text-muted-foreground">
          <FileText className="h-6 w-6 mx-auto mb-2 opacity-30" />
          <p>Generate an investment committee memo for this roll-up strategy.</p>
          <p className="mt-1 opacity-70">Takes ~30–60s · Uses Claude AI</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(dashboard\)/rollup/\[id\]/components/
git commit -m "feat: FinancialSummary, AcquisitionTimeline, SynergyMap, IcMemo components"
```

---

## Task 12: RightPanel + Editor Page + Compare Page

**Files:**
- Create: `apps/web/app/(dashboard)/rollup/[id]/components/RightPanel.tsx`
- Create: `apps/web/app/(dashboard)/rollup/[id]/page.tsx`
- Create: `apps/web/app/(dashboard)/rollup/compare/page.tsx`

- [ ] **Step 1: Create RightPanel**

```tsx
// apps/web/app/(dashboard)/rollup/[id]/components/RightPanel.tsx
'use client'
import { RollupFinancials, RollupScenarioTarget } from '@/lib/api/client'
import FinancialSummary from './FinancialSummary'
import AcquisitionTimeline from './AcquisitionTimeline'
import SynergyMap from './SynergyMap'
import IcMemo from './IcMemo'

interface Props {
  scenarioId: string
  scenarioName: string
  targets: RollupScenarioTarget[]
  financials: RollupFinancials | null
}

export default function RightPanel({ scenarioId, scenarioName, targets, financials }: Props) {
  if (targets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Add targets from the left panel to see financial projections
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6">
      {financials && <FinancialSummary financials={financials} />}
      <div className="border-t pt-6">
        <AcquisitionTimeline targets={targets} />
      </div>
      {financials && (
        <div className="border-t pt-6">
          <SynergyMap financials={financials} />
        </div>
      )}
      <div className="border-t pt-6">
        <IcMemo scenarioId={scenarioId} scenarioName={scenarioName} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create split-panel editor page**

```tsx
// apps/web/app/(dashboard)/rollup/[id]/page.tsx
'use client'
import { use, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api/client'
import { useScenario } from './hooks/useScenario'
import LeftPanel from './components/LeftPanel'
import RightPanel from './components/RightPanel'
import { ArrowLeft, Pencil, Check } from 'lucide-react'
import { toast } from 'sonner'

export default function RollupEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { scenario, targets, financials, loading, addTarget, removeTarget, updateAssumption, reorder, applySequenceSuggestion } = useScenario(id)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')

  const startEditName = () => {
    setNameValue(scenario?.name ?? '')
    setEditingName(true)
  }

  const saveName = async () => {
    if (!nameValue.trim()) return
    await api.rollup.update(id, { name: nameValue.trim() })
    setEditingName(false)
    toast.success('Scenario renamed')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)] text-sm text-muted-foreground">
        Loading scenario…
      </div>
    )
  }

  if (!scenario) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)] text-sm text-muted-foreground">
        Scenario not found. <Link href="/rollup" className="ml-1 text-primary hover:underline">Back to scenarios</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] -m-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-12 border-b shrink-0 bg-background">
        <Link href="/rollup" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              className="h-7 px-2 text-sm font-medium border rounded-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
              autoFocus
            />
            <button onClick={saveName} className="text-emerald-600 hover:text-emerald-700">
              <Check className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 group">
            <h1 className="text-sm font-semibold">{scenario.name}</h1>
            <button onClick={startEditName} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{targets.length} targets</span>
      </div>

      {/* Split panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: fixed 380px */}
        <div className="w-[380px] shrink-0 border-r overflow-hidden flex flex-col">
          <LeftPanel
            targets={targets}
            scenarioId={id}
            onAddTarget={addTarget}
            onRemoveTarget={removeTarget}
            onUpdateAssumption={updateAssumption}
            onReorder={reorder}
            onApplySequence={applySequenceSuggestion}
          />
        </div>

        {/* Right: scrollable */}
        <div className="flex-1 overflow-y-auto">
          <RightPanel
            scenarioId={id}
            scenarioName={scenario.name}
            targets={targets}
            financials={financials}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create compare page**

```tsx
// apps/web/app/(dashboard)/rollup/compare/page.tsx
'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api, RollupScenario, RollupFinancials } from '@/lib/api/client'
import FinancialSummary from '../[id]/components/FinancialSummary'
import SynergyMap from '../[id]/components/SynergyMap'
import AcquisitionTimeline from '../[id]/components/AcquisitionTimeline'
import { ArrowLeft } from 'lucide-react'

function CompareColumn({ scenarioId }: { scenarioId: string }) {
  const [scenario, setScenario] = useState<RollupScenario | null>(null)
  const [financials, setFinancials] = useState<RollupFinancials | null>(null)

  useEffect(() => {
    Promise.all([api.rollup.get(scenarioId), api.rollup.financials(scenarioId)]).then(([s, f]) => {
      setScenario(s)
      setFinancials(f)
    })
  }, [scenarioId])

  if (!scenario || !financials) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
  }

  const targets = scenario.rollup_scenario_targets ?? []

  return (
    <div className="flex-1 min-w-0 border-r last:border-r-0 overflow-y-auto">
      <div className="px-6 py-4 border-b bg-muted/20">
        <h2 className="text-sm font-semibold">{scenario.name}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{targets.length} targets</p>
      </div>
      <div className="p-6 space-y-8">
        <FinancialSummary financials={financials} />
        <div className="border-t pt-6">
          <AcquisitionTimeline targets={targets} />
        </div>
        <div className="border-t pt-6">
          <SynergyMap financials={financials} />
        </div>
      </div>
    </div>
  )
}

function CompareContent() {
  const params = useSearchParams()
  const a = params.get('a')
  const b = params.get('b')

  if (!a || !b) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Select two scenarios from the{' '}
        <Link href="/rollup" className="mx-1 text-primary hover:underline">scenario list</Link>
        to compare.
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <CompareColumn scenarioId={a} />
      <CompareColumn scenarioId={b} />
    </div>
  )
}

export default function ComparePage() {
  return (
    <div className="flex flex-col h-[calc(100vh-56px)] -m-6">
      <div className="flex items-center gap-3 px-6 h-12 border-b shrink-0 bg-background">
        <Link href="/rollup" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-sm font-semibold">Scenario comparison</h1>
      </div>
      <Suspense fallback={<div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">Loading…</div>}>
        <CompareContent />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/rollup/
git commit -m "feat: RightPanel, split-panel editor page, compare page"
```

---

## Task 13: Push to Vercel

- [ ] **Step 1: Push all commits**

```bash
cd /Users/callmepio/Desktop/horus-main
git log --oneline -8  # verify all commits are present
git push origin main
```

- [ ] **Step 2: Verify deployment**

Wait ~2 minutes for Vercel to build. Then:
1. Navigate to `/rollup` — should see empty state with "Create first scenario"
2. Click "New scenario" — should navigate to `/rollup/<id>`
3. Add a target from search — should show EBITDA margin estimated (takes ~3s)
4. Expand the target row → adjust assumptions → right panel should update live
5. "AI suggest sequence" button → sequence updates
6. "Generate memo" → IC memo appears in ~30–60s
7. "PDF" button → downloads PDF
8. Back to `/rollup` → compare two scenarios

---

## Self-Review Notes

- `RollupScenarioTarget.targets` join must include `revenue_eur` — present in the router's `TARGET_JOIN` constant ✓
- `computeFinancials` on client matches `compute_financials` on server — same formula, same field names ✓
- `useScenario.reorder` uses `arrayMove` from `@dnd-kit/sortable` — already imported in the hook ✓
- `AssumptionInputs` onChange passes `keyof RollupScenarioTarget` — `updateAssumption` accepts this type ✓
- `LeftPanel` filters search results to exclude already-in-scenario targets using `inScenario` Set — computed inside the component on each render ✓
- `memoPdfUrl` constructs the URL client-side using `API_URL` (no auth header) — the PDF endpoint uses `Depends(get_tenant_id)` which in production requires auth. The `<a href=...>` download will fail in production unless the auth header is attached. **Fix:** In `IcMemo.tsx`, replace the `<a href>` with a `fetch` + `blob` download:

```tsx
// Replace the PDF anchor in IcMemo.tsx with:
const handlePdfDownload = async () => {
  const supabase = (await import('@/lib/supabase/client')).createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(api.rollup.memoPdfUrl(scenarioId), {
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  })
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `rollup-memo-${scenarioName.toLowerCase().replace(/\s+/g, '-')}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
```

Replace the `<a>` anchor with:
```tsx
<button onClick={handlePdfDownload} className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs border border-input rounded-sm hover:bg-accent transition-colors">
  <Download className="h-3 w-3" />
  PDF
</button>
```

Update Task 11 Step 4 to include this version of IcMemo. The corrected full IcMemo.tsx:

```tsx
// apps/web/app/(dashboard)/rollup/[id]/components/IcMemo.tsx
'use client'
import { useState } from 'react'
import { api } from '@/lib/api/client'
import { FileText, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface Props { scenarioId: string; scenarioName: string }

export default function IcMemo({ scenarioId, scenarioName }: Props) {
  const [memo, setMemo] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await api.rollup.memo(scenarioId)
      setMemo(res.memo)
    } catch {
      toast.error('Memo generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const handlePdfDownload = async () => {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(api.rollup.memoPdfUrl(scenarioId), {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      })
      if (!res.ok) { toast.error('PDF generation failed'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rollup-memo-${scenarioName.toLowerCase().replace(/\s+/g, '-').slice(0, 40)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('PDF download failed')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          IC Memo
        </h3>
        <div className="flex items-center gap-2">
          {memo && (
            <button
              onClick={handlePdfDownload}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs border border-input rounded-sm hover:bg-accent transition-colors"
            >
              <Download className="h-3 w-3" />
              PDF
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs bg-foreground text-background rounded-sm hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {generating
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
              : <><FileText className="h-3 w-3" /> {memo ? 'Regenerate' : 'Generate memo'}</>}
          </button>
        </div>
      </div>

      {memo ? (
        <div className="border rounded-sm p-4 bg-card text-xs leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto font-mono">
          {memo}
        </div>
      ) : (
        <div className="border rounded-sm p-8 text-center text-xs text-muted-foreground">
          <FileText className="h-6 w-6 mx-auto mb-2 opacity-30" />
          <p>Generate an investment committee memo for this roll-up strategy.</p>
          <p className="mt-1 opacity-70">Takes ~30–60s · Uses Claude AI</p>
        </div>
      )}
    </div>
  )
}
```
