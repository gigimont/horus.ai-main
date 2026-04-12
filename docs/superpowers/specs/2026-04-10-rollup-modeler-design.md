# Roll-up Modeler — Design Spec
**Date:** 2026-04-10  
**Status:** Approved  
**Platform:** Horus AI — Search Fund operator SaaS (Next.js + FastAPI + Supabase)

---

## 1. Overview

The Roll-up Modeler is the third core module of Horus AI. It allows Search Fund operators to select multiple SME targets, model them as a combined acquisition strategy, estimate synergies and financial returns, sequence deals optimally, and generate an investment committee memo — all within a persistent, multi-scenario workspace.

**Scope:** Synergy model with basic financial aggregation (B). Full LBO with IRR/MOIC waterfall is a follow-on spec.

---

## 2. User Stories

- Operator selects targets from discovery, pipeline, or clusters and groups them into a named roll-up scenario
- Operator sees combined revenue, EBITDA, entry cost, synergy value, and equity return estimate — updating live as they adjust assumptions
- Claude suggests an acquisition sequence with reasoning; operator can drag to reorder
- Claude pre-fills EBITDA margin estimates per target; operator can override manually
- Operator generates an IC memo (in-app preview + PDF download) for the full roll-up thesis
- Operator saves multiple scenarios (e.g. "Northern Europe HVAC" vs "Italian Manufacturing"), compares them side-by-side

---

## 3. Navigation & Entry Points

- **Primary:** New sidebar item `Roll-up` (between Clusters and Pipeline) linking to `/rollup`
- **Secondary:** "Build roll-up →" button on the Clusters page linking to `/rollup/new`
- **URL structure:**
  - `/rollup` — scenario list
  - `/rollup/[id]` — split-panel editor
  - `/rollup/compare?a=<id>&b=<id>` — side-by-side comparison (read-only)

---

## 4. Data Model

### New table: `rollup_scenarios`
```sql
id            uuid primary key default gen_random_uuid()
tenant_id     uuid not null references tenants(id)
name          text not null
description   text
status        text not null default 'draft'  -- 'draft' | 'active' | 'archived'
created_by    uuid references users(id)
updated_by    uuid references users(id)
created_at    timestamptz default now()
updated_at    timestamptz default now()
```

### New table: `rollup_scenario_targets`
```sql
id                    uuid primary key default gen_random_uuid()
scenario_id           uuid not null references rollup_scenarios(id) on delete cascade
target_id             uuid not null references targets(id)
sequence_order        int not null default 0
-- Financial assumptions
entry_multiple        numeric(5,2) default 6.0   -- EV/EBITDA multiple
ebitda_margin_pct     numeric(5,2)               -- % of revenue
ebitda_margin_source  text default 'ai'          -- 'ai' | 'manual'
synergy_pct           numeric(5,2) default 15.0  -- % cost savings on target EBITDA
revenue_uplift_pct    numeric(5,2) default 0.0   -- % revenue uplift post-acquisition
debt_pct              numeric(5,2) default 50.0  -- % of entry cost financed with debt
integration_cost_eur  bigint default 0
hold_period_years     int default 5
notes                 text
created_at            timestamptz default now()
unique(scenario_id, target_id)
```

### Scenario-level financial outputs (computed, not stored)
All financial outputs are computed on-the-fly from the scenario targets + assumptions. No denormalised financial columns on the scenario row — keeps the source of truth clean.

---

## 5. Financial Model

All calculations are pure functions of the assumption inputs. Computed server-side at `/rollup/{id}/financials` and client-side for live preview.

**Per target:**
- `ebitda = revenue_eur * ebitda_margin_pct / 100`
- `entry_cost = ebitda * entry_multiple`
- `debt = entry_cost * debt_pct / 100`
- `equity_in = entry_cost - debt`
- `synergy_value = ebitda * synergy_pct / 100`
- `revenue_uplift = revenue_eur * revenue_uplift_pct / 100`

**Combined:**
- `total_revenue = Σ revenue_eur`
- `total_ebitda_pre_synergy = Σ ebitda`
- `total_synergy_value = Σ synergy_value`
- `total_revenue_uplift = Σ revenue_uplift`
- `proforma_ebitda = total_ebitda_pre_synergy + total_synergy_value`
- `proforma_revenue = total_revenue + total_revenue_uplift`
- `total_entry_cost = Σ entry_cost`
- `total_integration_cost = Σ integration_cost_eur`
- `total_equity_in = Σ equity_in`
- `total_debt = Σ debt`
- `exit_value = proforma_ebitda * avg(entry_multiples)` *(same multiple as entry — conservative)*
- `equity_return_pct = (exit_value - total_debt - total_integration_cost) / total_equity_in - 1`

**EBITDA margin estimation (Claude):**
When a target is added to a scenario, one Claude API call estimates EBITDA margin using: `industry_code`, `industry_label`, `revenue_eur`, `employee_count`, `financial_score`, `value_score`, `key_signals`. Result cached as `ebitda_margin_pct` with `ebitda_margin_source = 'ai'`. If operator edits the field, source flips to `'manual'`.

---

## 6. Acquisition Sequencing

Claude recommends an initial sequence when targets are first assembled (or on explicit "Re-sequence" button click). The prompt includes each target's `transition_score`, `entry_cost`, `integration_cost_eur`, and `sequence_order`. Claude returns an ordered list with a one-sentence rationale per target. Operator can drag to override — drag updates `sequence_order` fields via PATCH.

Sequence recommendation endpoint: `POST /rollup/{id}/sequence` — returns `[{target_id, suggested_order, rationale}]`.

---

## 7. API Endpoints

New router: `apps/api/routers/rollup.py`, mounted at `/rollup`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rollup/` | List all scenarios for tenant |
| POST | `/rollup/` | Create new scenario |
| GET | `/rollup/{id}` | Get scenario with targets + assumptions |
| PATCH | `/rollup/{id}` | Update scenario name/description |
| DELETE | `/rollup/{id}` | Delete scenario |
| POST | `/rollup/{id}/duplicate` | Clone scenario with new name |
| POST | `/rollup/{id}/targets` | Add target to scenario |
| PATCH | `/rollup/{id}/targets/{target_id}` | Update target assumptions |
| DELETE | `/rollup/{id}/targets/{target_id}` | Remove target from scenario |
| POST | `/rollup/{id}/reorder` | Update sequence_order for all targets |
| GET | `/rollup/{id}/financials` | Compute + return combined financial model |
| POST | `/rollup/{id}/estimate-ebitda/{target_id}` | Claude estimates EBITDA margin |
| POST | `/rollup/{id}/sequence` | Claude recommends acquisition sequence |
| POST | `/rollup/{id}/memo` | Generate IC memo (synchronous, returns full text) |
| GET | `/rollup/{id}/memo/pdf` | Download IC memo as PDF |

New service: `apps/api/services/rollup_service.py`
- `estimate_ebitda_margin(target: dict) -> float` — Claude call
- `suggest_sequence(targets: list[dict]) -> list[dict]` — Claude call
- `generate_memo(scenario: dict, financials: dict) -> str` — Claude call
- `compute_financials(targets: list[dict]) -> dict` — pure math, no Claude

---

## 8. Frontend Architecture

### Pages

**`/rollup` — Scenario List (`page.tsx`, client component)**
- Table of scenarios: name, target count, combined revenue, last edited, created by
- Actions per row: Open, Duplicate, Delete
- "Compare" — checkbox-select two scenarios → navigates to `/rollup/compare?a=x&b=y`
- "New scenario" button → POST /rollup/ → navigate to `/rollup/[id]`
- Empty state with CTA

**`/rollup/[id]` — Split-Panel Editor**
- Layout: fixed left panel (380px) + scrollable right panel, full viewport height
- No page-level data fetching — client-side, polling or optimistic updates

**`/rollup/compare` — Comparison View (`page.tsx`, client component)**
- Reads `?a=<id>&b=<id>` from query params; calls `GET /rollup/{id}/financials` for both scenario IDs in parallel
- Two `/rollup/[id]` right-panel financial summaries rendered side-by-side
- Read-only, no editing

### Components under `/rollup/[id]/components/`

| Component | Responsibility |
|-----------|---------------|
| `LeftPanel.tsx` | Target search/add, draggable sequence list (uses `@dnd-kit/core` + `@dnd-kit/sortable` — already installed), summary bar |
| `TargetRow.tsx` | Single target in sequence — drag handle, name, assumption inputs, remove |
| `AssumptionInputs.tsx` | Entry multiple, EBITDA margin (with AI/manual label), synergy %, revenue uplift %, debt %, integration cost, hold period |
| `RightPanel.tsx` | Orchestrates right side — financials + timeline + synergy map + memo |
| `FinancialSummary.tsx` | KPI cards: combined revenue, proforma EBITDA, total entry cost, synergy value, equity return |
| `AcquisitionTimeline.tsx` | Horizontal timeline showing deal sequence with estimated gap months |
| `SynergyMap.tsx` | Bar/table showing per-target contribution to combined EBITDA and synergy pool |
| `IcMemo.tsx` | Generate button, memo text display, PDF download link |

### State management
All scenario state lives in a single `useScenario(id)` hook that:
- Fetches scenario on mount
- Exposes optimistic update functions (add target, update assumption, reorder)
- Debounces assumption changes (500ms) before PATCHing to API
- Recomputes financials client-side immediately (no API round-trip for live preview)
- Syncs full financials from API on mount and after sequence changes

---

## 9. IC Memo Structure

Claude generates a structured narrative with these sections:
1. **Executive Summary** — roll-up thesis in 2-3 sentences
2. **Target Portfolio** — table of targets with key metrics
3. **Acquisition Sequence & Rationale** — why this order
4. **Financial Overview** — combined revenue, EBITDA, entry cost, synergy value, equity return estimate
5. **Synergy Analysis** — cost and revenue synergies by target
6. **Risk Factors** — 3-5 key risks with mitigants
7. **Recommendation** — go/no-go with conditions

Stored transiently — not persisted to DB. Generated fresh on each click. PDF uses the existing `exports.py` PDF generation pattern.

---

## 10. Database Migration

File: `supabase/migrations/009_rollup_scenarios.sql`
- Creates `rollup_scenarios` and `rollup_scenario_targets` tables
- RLS policies: tenant isolation (same pattern as `targets` table)
- Index on `rollup_scenario_targets(scenario_id, sequence_order)`

---

## 11. What's Out of Scope (Follow-on)

- Full LBO model (IRR/MOIC, debt schedule, hold-period cash flows)
- Scenario sharing / export to external collaborators
- Version history / undo
- Integration with live financial data sources
- Real-time collaborative editing

---

## 12. Success Criteria

- Operator can create a roll-up scenario with 3+ targets in under 5 minutes
- Financial outputs update without page reload as assumptions change
- Claude EBITDA estimate available within 3s of adding a target
- IC memo generates in under 60s for a 5-target scenario
- Scenario persists across sessions and is visible to all tenant users
- PDF memo downloadable and formatted consistently with existing reports
