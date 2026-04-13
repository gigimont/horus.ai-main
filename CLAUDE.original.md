# Horus AI — Claude Code Context

## What this is
B2B SaaS for Search Fund operators. SME acquisition target discovery, AI scoring, clustering, roll-up modeling, deal pipeline. Stack: Next.js 16 + FastAPI + Supabase + Claude API.

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
- `@dnd-kit` only — never install a second drag-and-drop library
- Synchronous endpoints for embed/geocode — background tasks get killed by Fly.io free tier sleep
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
