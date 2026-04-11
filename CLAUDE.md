# Horus AI — Claude Code Context

## Project overview

B2B SaaS platform for Search Fund operators. AI-powered SME acquisition target discovery, scoring, clustering, roll-up modeling, and deal pipeline management. Institutional design language (Palantir-grade).

## Repository structure

```
searchfund-platform/
├── apps/
│   ├── web/          Next.js 16 frontend (Vercel)
│   └── api/          FastAPI backend (Fly.io)
└── supabase/         Migrations + seed data
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Python 3.12, FastAPI, Pydantic v2 |
| Database | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth + custom JWT claims with tenant_id |
| AI | Anthropic Claude API (claude-sonnet-4-20250514) |
| Drag and drop | @dnd-kit/core + @dnd-kit/sortable (already installed — never add a second DnD library) |
| Deployment | Vercel (frontend) + Fly.io (backend) |

## Live URLs

- Frontend: https://horus-ai-main.vercel.app
- Backend: https://searchfund-api.fly.dev
- Supabase project: ymtxkrhejxzsubhhrpxi

## Running locally

```bash
# Terminal 1 — FastAPI backend
cd apps/api
source .venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 — Next.js frontend
cd apps/web
pnpm dev

# Health check
curl http://localhost:8000/health
```

## Deploying

```bash
# Backend
cd apps/api && fly deploy

# Frontend — push to GitHub, Vercel auto-deploys
git add . && git commit -m "..." && git push
```

## Database

- 10 migrations applied (001–010)
- All tables have RLS enabled using `get_tenant_id()` helper function
- Tenant isolation is enforced at DB layer, not just app layer
- pgvector enabled — `embedding vector(1536)` on targets table
- Never hard-delete targets — use `deleted_at` soft delete pattern

### Key tables
- `tenants` — one per Search Fund operator team
- `users` — linked to Supabase Auth, has tenant_id
- `targets` — SME acquisition targets with lat/lng/embedding
- `target_scores` — Claude-generated scores (transition/value/market/financial)
- `clusters` — AI-named target clusters
- `pipeline_entries` — kanban deal tracking
- `rollup_scenarios` + `rollup_scenario_targets` — roll-up modeler

## Multi-tenancy

Every request is scoped to a tenant. The FastAPI `get_tenant_id()` dependency extracts tenant_id from the Supabase JWT. In development, falls back to demo tenant UUID if no token present. In production, always requires a valid JWT.

Demo tenant UUID: `00000000-0000-0000-0000-000000000001`
Production tenant UUID (Giuseppe): `b430624d-4a8c-4fe4-858c-fb7233ec43c2`

## Auth pattern

- Supabase Auth handles login/signup
- Custom JWT hook (`custom_access_token_hook`) injects tenant_id into every JWT
- Frontend passes `Authorization: Bearer <token>` on every API call via `apiFetch` in `lib/api/client.ts`
- Server components fetch auth via `lib/supabase/server.ts` (cookie-based)
- Client components use `lib/supabase/client.ts` (browser-based)

## Frontend conventions

- All pages under `app/(dashboard)/` are protected routes
- All pages under `app/(auth)/` are public
- Middleware is in `proxy.ts` (Next.js 16 renamed middleware.ts)
- Use `'use client'` only when needed — prefer server components
- Toast notifications via `sonner` — never use `alert()` or `confirm()`
- Two-step confirm for destructive actions (no browser dialogs)
- Score badges: green ≥7.5, amber 5–7.5, red <5
- All numeric data: `font-mono tabular-nums`
- Border radius: `rounded-sm` everywhere (institutional feel — never `rounded-lg`)
- No shadows, no gradients

## Backend conventions

- All routers in `apps/api/routers/` registered in `main.py`
- All AI logic in `apps/api/services/`
- Claude API calls always use `claude-sonnet-4-20250514`
- Always parse JSON from Claude with `.replace("```json","").replace("```","").strip()`
- Background tasks use FastAPI `BackgroundTasks` — for long operations use synchronous endpoints (Fly.io free tier sleeps mid-task)
- Soft delete pattern: filter with `.is_("deleted_at", "null")` on all target queries

## AI features

| Feature | Location | Notes |
|---|---|---|
| SME scoring | `services/scoring_service.py` | 4 dimensions, weighted average, Claude validates |
| EBITDA estimation | `services/rollup_service.py` | Per target when added to scenario |
| Cluster naming | `services/clustering_service.py` | Claude names each cluster |
| Sequence recommendation | `services/rollup_service.py` | Optimal acquisition order |
| IC memo generation | `services/rollup_service.py` | 7-section structured memo |
| Semantic embeddings | `services/embedding_service.py` | 48-dim → 1536-dim, stored in pgvector |
| Geocoding | `services/geocoding_service.py` | Mapbox Geocoding API |
| Copilot chat | `routers/chat.py` | SSE streaming, target-contextualised |
| PDF reports | `routers/exports.py` | ReportLab, per-target and roll-up memo |

## Environment variables

### Frontend (`apps/web/.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_MAPBOX_TOKEN
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
```

### Backend (`apps/api/.env`)
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
ANTHROPIC_API_KEY
MAPBOX_TOKEN
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
ENVIRONMENT=development
```

## Key decisions (never revert these)

- **pnpm workspaces** — single repo, no Turborepo
- **Soft deletes** — never hard-delete targets
- **Score versioning** — `model_version` column on `target_scores`
- **JWT tenant injection** — tenant_id in JWT via Supabase hook, not app-level
- **Client-side financial calculation** — roll-up financials computed client-side for live preview, server-side for persistence
- **No second DnD library** — @dnd-kit only, already installed
- **Synchronous embed/geocode endpoints** — not background tasks (Fly.io free tier sleeps)
- **Monochrome logo** — white brackets on dark background, never add color accents to the mark

## Current navigation structure

```
/dashboard      — overview stats
/discovery      — target list (table + map view)
/discovery/[id] — target detail (scores, rationale, similar, chat)
/clusters       — AI-named target clusters
/rollup         — roll-up scenario list
/rollup/[id]    — split-panel roll-up modeler
/rollup/compare — side-by-side scenario comparison
/pipeline       — deal kanban (Watchlist → Contacted → NDA → LOI → Closed)
/settings       — account + billing
/login          — auth
/signup         — auth
/onboarding     — fund name setup (post-signup)
```

## Known issues / backlog

- Pires Metalurgia Lda fails to embed consistently (transient API timeout — benign)
- Stripe price IDs not configured (billing UI exists, checkout disabled until go-live)
- Map coordinate dictionary covers major EU cities only — full geocoding via API for new imports
- IC memo date format bug — shows wrong month (cosmetic, low priority)
- No automated test suite yet

## What NOT to do

- Never install a second drag-and-drop library
- Never use `alert()` or `confirm()` — use sonner toasts and inline confirm states
- Never hard-delete targets — always soft delete
- Never add `rounded-lg` or larger — institutional design uses `rounded-sm`
- Never add shadows or gradients
- Never modify existing migrations — always create a new numbered migration file
- Never bypass RLS by using service role key in frontend code
- Never store the Supabase service role key in frontend env vars
