# Scenario Engine Design

## Goal
Let Search Fund operators run economic/strategic "what-if" scenarios against individual targets or targets within a roll-up, using Claude to analyze impact on acquisition scores and timing. Results persist with a snapshot of scores at run-time so historical comparisons are possible.

## Architecture

### Scenario types
- `macro_shock` — broad economic disruption (recession, rate spike, inflation)
- `industry_shift` — sector-specific change (regulation, disruption, consolidation)
- `succession_trigger` — owner-related event (health, retirement urgency, family pressure)

### Data model — `scenario_results` table (migration 011)

```
id                    uuid PK
tenant_id             uuid → tenants (RLS via get_tenant_id())
target_id             uuid → targets ON DELETE CASCADE
rollup_scenario_id    uuid → rollup_scenarios ON DELETE SET NULL  (nullable)
scenario_type         text  CHECK IN ('macro_shock','industry_shift','succession_trigger')
severity              int   CHECK 1..10
description           text  NOT NULL
score_before          jsonb -- {overall, transition, value, market, financial, scored_at}
score_deltas          jsonb -- {overall_delta, transition_delta, value_delta, market_delta, financial_delta}
implications          text[] -- exactly 3 bullets
acquisition_window_effect text NOT NULL
model_version         text  NOT NULL DEFAULT 'v1'
run_at                timestamptz NOT NULL DEFAULT now()
```

`score_before.scored_at` comes from the `scored_at` field on the target's latest `target_scores` row — no schema change, populated in `scenario_service.py`.

RLS: `tenant_id = get_tenant_id()`. Hard deletes allowed.

### Backend

**`apps/api/services/scenario_service.py`**

Single async function:
```python
async def run_scenario(target: dict, scenario_type: str, severity: int, description: str) -> dict
```
- `target` dict includes current scores row (`target_scores[0]`)
- Claude prompt: target profile + current 4 scores + scenario params → structured JSON
- Returns `{score_deltas, implications, acquisition_window_effect}`
- JSON parse: find `{` … `}` bounds (same pattern as `suggest_sequence`)
- `overall_delta` = weighted average: transition×0.35 + value×0.30 + market×0.20 + financial×0.15

**`apps/api/routers/scenarios.py`**

3 endpoints, all authenticated via `get_tenant_id()`:
- `POST /scenarios/run` — run + save → return full result row
- `GET /scenarios/target/{target_id}` — history desc by run_at (limit 20)
- `DELETE /scenarios/{result_id}` — hard delete (tenant-scoped)

Registered in `apps/api/main.py`.

### Frontend

**`apps/web/app/(dashboard)/discovery/[id]/components/ScenarioPanel.tsx`**
- `'use client'`
- Props: `targetId: string`, `currentScores: ScoreSnapshot`, `rollupScenarioId?: string`
- State: `idle | running | done | error`
- Form: type select (3 options), severity slider 1–10 with label, description textarea
- On submit: `api.scenarios.run(...)` → loading spinner → results inline
- Results: 4 delta cards (green if positive, red if negative, slate if zero), implications list, window effect
- History section: collapsible, shows past runs with date + scenario type + severity
- Error state: inline error message, retry button

**Entry point 1 — target detail page** `apps/web/app/(dashboard)/discovery/[id]/page.tsx`
Add "Scenario Analysis" card section at bottom. Server component passes `targetId` + current score snapshot as props.

**Entry point 2 — roll-up editor** `apps/web/app/(dashboard)/rollup/[id]/components/TargetRow.tsx`
"⚡ Scenario" button in each expanded target row. Renders `<ScenarioPanel>` inline below assumption inputs, passes `rollupScenarioId`.

### API client additions — `apps/web/lib/api/client.ts`

New interface `ScenarioResult` + `api.scenarios`:
- `run(targetId, params, rollupScenarioId?)` → `POST /scenarios/run`
- `forTarget(targetId)` → `GET /scenarios/target/{targetId}`
- `delete(resultId)` → `DELETE /scenarios/{resultId}`

## Out of scope
- Bulk "run scenario across all roll-up targets" simultaneously
- Scenario comparison view
- Scenario templates / saved presets
