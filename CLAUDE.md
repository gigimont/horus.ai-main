# Horus AI — Claude Code Context

## What this is
B2B SaaS for Search Fund operators. SME acquisition discovery, AI scoring, clustering, roll-up modeling, deal pipeline. Stack: Next.js 16 + FastAPI + Supabase + Claude API.

## Run locally
```bash
# Terminal 1
cd apps/api && source .venv/bin/activate && uvicorn main:app --reload --port 8000
# Terminal 2
cd apps/web && pnpm dev
```

## Deploy
```bash
cd apps/api && fly deploy                          # backend
git push                                           # frontend — Vercel auto-deploys
```

## Run tests
```bash
pnpm test                                          # TypeScript (vitest)
cd apps/api && pytest tests/ -v                    # Python (pytest)
```

## Live URLs
- Frontend: https://horus-ai-main.vercel.app
- Backend: https://searchfund-api.fly.dev
- Supabase: ymtxkrhejxzsubhhrpxi

## Non-obvious decisions — never revert

- `proxy.ts` not `middleware.ts` — Next.js 16 renamed it
- Soft delete only — never hard-delete targets (`deleted_at` pattern)
- `@dnd-kit` only — never install second drag-and-drop lib
- Synchronous endpoints for embed/geocode — background tasks killed by Fly.io free tier sleep
- All RLS uses `get_tenant_id()` helper — never bypass with service role key in frontend
- New migrations only — never modify existing migration files
- `rounded-sm` everywhere — institutional design, never `rounded-lg` or larger
- No shadows, no gradients, no `alert()`, no `confirm()`
- Claude model: always `claude-sonnet-4-20250514`

## Tenant IDs
- Demo: `00000000-0000-0000-0000-000000000001`
- Production (Giuseppe): `b430624d-4a8c-4fe4-858c-fb7233ec43c2`

## Known issues (do not fix unless asked)
- Pires Metalurgia Lda embedding fails transiently — benign
- IC memo shows wrong month in date — cosmetic
- Stripe price IDs empty — intentional until go-live

---

## Project structure reference

### Backend (`apps/api/`)
- `main.py` — FastAPI app entry point; registers all routers, CORS config
- `config.py` — Pydantic settings (SUPABASE_URL, ANTHROPIC_API_KEY, STRIPE keys, MAPBOX_TOKEN)
- `dependencies.py` — `get_db()` (Supabase client), `get_tenant_id()` (JWT claim extraction)
- `db/supabase.py` — shared Supabase client singleton

**Routers (`routers/`):**
- `targets.py` — CRUD, bulk CSV import, geocode, embed, similar targets
- `scoring.py` — batch AI scoring, status polling
- `clusters.py` — list clusters, refresh (AI rebuild), status
- `chat.py` — streaming copilot chat (SSE)
- `exports.py` — CSV export, PDF target report
- `pipeline.py` — kanban deal pipeline CRUD
- `billing.py` — Stripe webhook, subscription management
- `rollup.py` — roll-up modeler: scenarios CRUD, targets, reorder, financials, EBITDA estimate, sequence, IC memo + PDF
- `scenarios.py` — what-if scenario engine: run, list history, delete
- `network.py` — network edges: analyse (AI pairwise), get graph, stats, clear

**Services (`services/`):**
- `claude_service.py` — Anthropic client singleton + target scoring prompts (4-dimension JSON)
- `scoring_service.py` — orchestrates scoring: fetch target → Claude → upsert target_scores
- `clustering_service.py` — AI cluster building using pgvector embeddings + Claude labeling
- `embedding_service.py` — batch pgvector embedding via Claude
- `geocoding_service.py` — Mapbox geocoding for target lat/lng
- `rollup_service.py` — `compute_financials()`, `estimate_ebitda_margin()`, `suggest_sequence()`, `generate_memo()`
- `scenario_service.py` — `run_scenario()`: Claude what-if analysis → weighted score deltas
- `network_service.py` — `analyse_network()`: Claude pairwise target analysis → edge list (itertools.combinations, batch=10)

### Frontend (`apps/web/`)

**Auth routes (`app/(auth)/`):**
- `login/page.tsx` — email/password login
- `signup/page.tsx` — new account registration
- `onboarding/page.tsx` — post-signup onboarding flow

**Dashboard routes (`app/(dashboard)/`):**
- `dashboard/page.tsx` — home dashboard
- `discovery/page.tsx` — target list (table + map toggle), filters, score-all button
- `discovery/[id]/page.tsx` — target detail: scores, AI analysis, similar targets, scenario panel, copilot chat
- `clusters/page.tsx` — AI cluster view, "Build roll-up →" action
- `rollup/page.tsx` — list of roll-up scenarios
- `rollup/[id]/page.tsx` — roll-up modeler: split-panel drag-and-drop editor + live financials
- `rollup/compare/page.tsx` — side-by-side scenario comparison
- `network/page.tsx` — force-directed D3 graph: scenario selector, edge type filters, strength slider, stats panel
- `network/components/NetworkGraph.tsx` — D3 force simulation (client-only, SSR-safe via dynamic import); draggable nodes, zoom/pan, tooltips
- `pipeline/page.tsx` — kanban deal tracker (Watchlist → Contacted → NDA → LOI → Closed)
- `settings/page.tsx` — account management, Stripe billing

**Components (`app/(dashboard)/discovery/components/`):**
`AddToPipelineButton`, `CopilotChat`, `FilterPanel`, `ImportButton`, `MapView`, `ScoreAllButton`, `ScoreGauge`, `TargetTable`

**Components (`app/(dashboard)/discovery/[id]/components/`):**
`ScenarioPanel` — what-if scenario form + delta cards + history

**Components (`app/(dashboard)/rollup/[id]/components/`):**
`LeftPanel` (drag-and-drop target list), `RightPanel` (financials + timeline + memo), `TargetRow` (sortable row + assumptions + scenario toggle), `AssumptionInputs`, `FinancialSummary`, `AcquisitionTimeline`, `SynergyMap`, `IcMemo`

**Rollup client-side logic:**
- `rollup/[id]/hooks/useScenario.ts` — scenario state management
- `rollup/[id]/lib/computeFinancials.ts` — pure TS financial model (mirrors Python)

**Shared components (`components/`):**
- `shared/ScoreBadge.tsx` — score pill badge
- `shared/LogoMark.tsx` — logo
- `shared/ErrorBoundary.tsx` — error boundary
- `ui/` — shadcn/ui primitives (button, badge, card, input, etc.)

**Lib (`lib/`):**
- `api/client.ts` — typed API client (`api.targets`, `api.rollup`, `api.scenarios`, `api.network`, etc.) + all TypeScript interfaces (incl. `NetworkEdge`, `NetworkStats`, `NetworkGraph`)
- `supabase/client.ts` — browser Supabase client
- `supabase/server.ts` — server-side Supabase client (for server components)
- `utils.ts` — `cn()` classname helper

### Supabase (`supabase/migrations/`)
- `001_initial_schema.sql` — tenants, targets, users base schema
- `002_rls_policies.sql` — row-level security policies
- `003_scores_unique_constraint.sql` — target_scores unique on (target_id, model_version)
- `004_pipeline_rls.sql` — pipeline_items RLS
- `005_accent_insensitive_search.sql` — unaccented text search index
- `006_auth_hooks.sql` — Supabase auth hook to inject tenant_id into JWT
- `007_stripe_customer.sql` — stripe_customers table
- `008_target_coordinates.sql` — lat/lng columns + PostGIS index on targets
- `009_rollup_scenarios.sql` — rollup_scenarios + rollup_scenario_targets tables
- `010_rollup_rls_fix.sql` — RLS fix for rollup tables
- `011_scenario_results.sql` — scenario_results table (what-if engine)
- `012_network_edges.sql` — network_edges table: scenario_id FK → rollup_scenarios, source/dest target FKs, edge_type enum, strength float, RLS via get_tenant_id()

**Key tables:** `tenants`, `targets`, `target_scores`, `pipeline_items`, `clusters`, `cluster_members`, `rollup_scenarios`, `rollup_scenario_targets`, `scenario_results`, `stripe_customers`, `network_edges`

### Infrastructure
- Frontend: Vercel (auto-deploys on `git push` to main)
- Backend: Fly.io (`searchfund-api.fly.dev`) — deploy with `cd apps/api && fly deploy`
- DB: Supabase hosted PostgreSQL (`ymtxkrhejxzsubhhrpxi.supabase.co`)
- Git: `git write-tree → git commit-tree → git update-ref` (no regular `git commit` — git-lfs hooks hang). **Always `git add <files>` before `write-tree`** — write-tree snapshots the index only, not the working tree.

---

## Design skill

The `ui-ux-pro-max-skill` is installed for UI/UX sessions. When a session involves visual/design changes, read its SKILL.md before making any frontend modifications.
Location: `~/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.5.0/.claude/skills/ui-ux-pro-max/SKILL.md`