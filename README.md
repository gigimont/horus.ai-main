# Horus AI

B2B SaaS platform for Search Fund operators. AI-powered SME acquisition target discovery, scoring, clustering, roll-up modeling, and deal pipeline management.

**Live:** https://horus-ai-main.vercel.app · API: https://searchfund-api.fly.dev

---

## What it does

Search Fund operators use Horus to find, score, and sequence SME acquisition targets across Europe. The platform covers the full acquisition workflow — from initial discovery to IC memo.

| Module | Description |
|---|---|
| **Discovery** | Target list with table + map view. Filter by industry, country, revenue, score. |
| **AI Scoring** | Claude evaluates each target on 4 dimensions: transition readiness, value upside, market attractiveness, financial profile. |
| **Target Detail** | Scores, rationale, similar targets (pgvector semantic search), inline AI copilot chat. |
| **Clusters** | AI-named target clusters built from embedding similarity. "Build roll-up →" sends a cluster directly to the modeler. |
| **Roll-up Modeler** | Split-panel editor: drag-and-drop acquisition sequence, live financial model, AI EBITDA estimation, IC memo generation, PDF export, side-by-side scenario comparison. |
| **Pipeline** | Kanban deal tracker — Watchlist → Contacted → NDA → LOI → Closed. |
| **Settings** | Account management + Stripe billing (Pro / Enterprise). |

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Python 3.12, FastAPI, Pydantic v2 |
| Database | Supabase (PostgreSQL + pgvector + RLS) |
| Auth | Supabase Auth — custom JWT claims inject `tenant_id` |
| AI | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| Drag and drop | @dnd-kit/core + @dnd-kit/sortable |
| PDF | ReportLab |
| Deployment | Vercel (frontend) + Fly.io (backend) |

---

## Run locally

```bash
# Backend (Terminal 1)
cd apps/api
source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Frontend (Terminal 2)
cd apps/web
pnpm dev

# Health check
curl http://localhost:8000/health
# → {"status":"ok"}
```

Frontend: http://localhost:3000 · API docs: http://localhost:8000/docs

### Environment variables

`apps/api/.env`:
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
ANTHROPIC_API_KEY=
MAPBOX_TOKEN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
ENVIRONMENT=development
```

`apps/web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MAPBOX_TOKEN=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

---

## Tests

```bash
# TypeScript — vitest (run from repo root)
pnpm test

# Python — pytest (run from repo root)
apps/api/.venv/bin/python -m pytest tests/ -v
```

Current coverage: **36 tests** across 3 files.

| File | Tests | Covers |
|---|---|---|
| `tests/rollup/computeFinancials.test.ts` | 14 | TypeScript `computeFinancials()` — EBITDA, entry cost, debt/equity, synergies, equity return, zero guards |
| `tests/rollup/test_rollup_service.py` | 14 | Python `compute_financials()` — same cases, proves both implementations agree |
| `tests/rollup/test_rollup_api.py` | 8 | FastAPI `/rollup` endpoints — list, create, get, 404, delete, financials, E2E flow |

---

## Deploy

```bash
# Backend
cd apps/api && fly deploy

# Frontend — push to GitHub, Vercel auto-deploys
git push
```

---

## Repository structure

```
apps/
├── web/                    Next.js 16 frontend
│   ├── app/(dashboard)/    Protected routes
│   │   ├── discovery/      Target list + map + detail
│   │   ├── clusters/       AI cluster analysis
│   │   ├── rollup/         Roll-up modeler
│   │   └── pipeline/       Deal kanban
│   ├── components/         Shared UI components
│   └── lib/api/client.ts   Typed API client
└── api/                    FastAPI backend
    ├── routers/            One file per domain (targets, rollup, pipeline…)
    ├── services/           All AI logic (scoring, clustering, roll-up, embeddings…)
    └── dependencies.py     get_db, get_tenant_id FastAPI dependencies
supabase/
└── migrations/             010 migrations applied, RLS on every table
tests/
└── rollup/                 Roll-up modeler test suite
```

---

## Key decisions

- **Multi-tenancy via JWT** — `get_tenant_id()` reads `tenant_id` from the Supabase JWT claim. All RLS policies use this helper. Never bypassed.
- **Soft deletes** — targets use `deleted_at`, never hard-deleted.
- **Client-side financial model** — roll-up financials computed in TypeScript for live preview; Python `compute_financials()` used for API responses and PDF generation. Both implementations are tested to produce identical results.
- **Synchronous AI endpoints** — EBITDA estimation, scoring, and geocoding run synchronously. Background tasks are killed by Fly.io's free-tier sleep.
- **`proxy.ts` not `middleware.ts`** — Next.js 16 renamed the middleware entry point.
- **@dnd-kit only** — never install a second drag-and-drop library.
- **No `rounded-lg`, no shadows, no gradients** — institutional design language throughout.
- **Git commits** — use `git write-tree → git commit-tree → git update-ref` (regular `git commit` hangs due to git-lfs hooks in this repo).

---

## Tenant IDs

| Tenant | UUID |
|---|---|
| Demo (dev fallback) | `00000000-0000-0000-0000-000000000001` |
| Production (Giuseppe) | `b430624d-4a8c-4fe4-858c-fb7233ec43c2` |
