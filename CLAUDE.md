# CLAUDE.md — agent onboarding for the Relay LLM Gateway repo

You're working on a self-hosted OpenAI-compatible API gateway. Read this whole file before changing code; the design choices below are deliberate and unwinding them silently will break things.

## What this is, what it isn't

- **Is**: a thin gateway in front of APIMart that adds (a) per-user API keys, (b) `Decimal`-precise balance-based billing, (c) request logs with full payloads, (d) a small React dashboard + admin console. MVP — meant for the author's small group of testers.
- **Isn't**: a chat product, a managed offering, a multi-tenant SaaS, or a serious public-facing service. There is no signup, no payments, no rate limiting, no workspaces. Don't add them speculatively.

## Stack and where to look first

| Layer | Tech | Entry point |
|---|---|---|
| Backend | FastAPI 0.136, SQLAlchemy 2, Alembic, psycopg 3, httpx | `backend/app/main.py` |
| DB | PostgreSQL 15+ | `backend/alembic/versions/` |
| Auth | bcrypt + python-jose JWT (no refresh tokens) | `backend/app/security.py`, `deps.py` |
| Upstream | APIMart only (docs.apimart.ai) | `backend/app/providers/apimart.py` |
| Frontend | Vite + React + TS + Tailwind v4 + hand-rolled shadcn-style primitives | `frontend/src/App.tsx` |

When you need to change anything that talks to APIMart, **the only file that should know APIMart-specific paths or response shapes is `backend/app/providers/apimart.py`**. If you find yourself reading `data[0].task_id` outside that file you're doing it wrong — add a method to the adapter instead.

## Critical invariants — do not break

1. **Money is `Decimal`. Always.** Never use `float` for `cost`, `balance`, `amount`. All DB columns are `Numeric(18,8)`. Pydantic schemas declare `Decimal`. Cost math lives in `app/services/cost_service.py` and uses `Decimal` arithmetic. Adding a `float()` cast anywhere in the billing path is a regression.

2. **Debit and request_log are in the same DB transaction**, with the user row locked via `SELECT … FOR UPDATE` first. See `app/services/billing_service.py` (`_lock_user`) and `app/services/gateway_service.py` (`persist_success`). Don't move the debit out of the transaction or skip the lock.

3. **Failed requests never debit.** Persist `status="failed"` with `cost=0`. The only exception is when a previously-queued async task transitions to `succeeded` via `/v1/tasks/{id}` polling — that's where the debit happens for image/video.

4. **Plain-text API keys never touch the DB.** Generation in `app/security.py` returns `(full_key, prefix, sha256_hash)`. The full key is returned exactly once on creation. Lookups go via `sha256(presented_key)` → `key_hash`.

5. **The `/api/*` endpoints take a JWT. The `/v1/*` endpoints take a user API key (`lgw_…`).** They are *different* auth modes. `deps.get_current_user` and `deps.get_api_key_user` enforce this.

6. **Don't hardcode model lists in the frontend.** The catalog comes from `GET /api/models` (user side) and `GET /api/admin/models` (admin). Pricing, visibility, public-vs-upstream-name mapping all live in the `models` table. Admin can edit at runtime.

## How APIMart actually behaves (this informed the schema)

Pulled from docs.apimart.ai (verified May 2026):

| Endpoint | Sync/Async | Notes |
|---|---|---|
| `POST /v1/chat/completions` | Sync + SSE | OpenAI-compatible. We force `stream_options.include_usage=true` so the final stream chunk carries `usage` for billing. |
| `POST /v1/images/generations` | **Async** | Returns `task_id`; not OpenAI-compatible. Image and video share the same task system. |
| `POST /v1/videos/generations` | **Async** | Wrapped `{code:200, data:[{task_id, status:"submitted"}]}` — adapter unwraps. |
| `GET /v1/tasks/{task_id}` | Sync | Status vocab: `pending|processing|completed|failed|cancelled` — adapter maps to our internal `queued|running|succeeded|failed`. Assets at `result.images[].url` or `result.videos[].url`. |

Because image is async, our `/v1/images/generations` returns `task_id` too (we chose to expose async upward; we didn't fake sync with a long-poll). Clients must poll `/v1/tasks/{task_id}`.

## Frontend conventions

- All shadcn-style primitives are hand-written under `src/components/ui/`. No `shadcn/ui` CLI was used because it requires interactive prompts. New primitives go there too.
- Dark theme is the only theme. Tokens live in `src/index.css` under `:root` and are exported into Tailwind via `@theme inline`.
- The original prototype is preserved under `project/` for reference. **Do not delete it** — it documents the designer's intent.
- API calls go through `src/lib/api.ts`. JWT is auto-attached for `/api/*`. `gateway()` and `gatewayStream()` are for `/v1/*` with a user API key.
- `RequireAuth` / `RequireAdmin` wrap routes that need login or admin role.

## Where the seams are if you need to extend

| Want to | Touch |
|---|---|
| Add a second upstream provider | New subclass of `BaseProvider` in `app/providers/`; switch in `gateway_service.build_provider()`; add `Provider` row via Admin → Providers |
| Add a new endpoint (e.g. `/v1/embeddings`) | Add method on `BaseProvider` + `APIMartProvider`; add route in `app/api/gateway.py`; add cost rule in `cost_service.py` if needed |
| Change billing rules | `app/services/cost_service.py`. Don't touch billing inside endpoints. |
| Add a new model | Either: edit `seed.py` for first-boot defaults, OR `POST /api/admin/models` at runtime. |
| Add a UI page | New file in `frontend/src/pages/`, register in `frontend/src/App.tsx`, add sidebar entry in `frontend/src/components/shell.tsx`. |

## Things I tried and explicitly chose against (so you don't reintroduce them)

- **passlib for password hashing** — passlib 1.7.4 is incompatible with bcrypt ≥ 5. I use `bcrypt` directly. Don't add passlib back.
- **Hiding the image async-ness behind a long-poll sync API** — would tie up a server worker for 30–60s per image and break under load. Image returns `task_id`, period.
- **shadcn CLI init** — needs an interactive prompt and pulls a lot of files we'd then edit anyway. The UI primitives are hand-written for that reason.
- **Auto fallback / intelligent routing across providers** — explicit non-goal for MVP per spec.
- **A worker queue for video task polling** — we lazily poll on `GET /v1/tasks/{id}`. Fine for MVP. If you ever add real users, swap to a background worker before users notice.

## Open issues to be aware of

- `nano-banana` returned `model_not_found` from APIMart during our smoke test even though docs list it. May be intermittent on APIMart's side. `gpt-image-2` works reliably.
- `grok-imagine` and `grok-imagine-video` are seeded with `status='disabled'` because APIMart docs don't currently list them. Flip them on via Admin → Models if you confirm support.
- The frontend Playground stores the user's API key in `localStorage` for convenience. Fine for an MVP among friends; revisit before any wider distribution.
- Token expiry is 7 days, no refresh token. Wider rollout = add refresh.

## Running things

- Tests: there's no test suite yet. The seven verification flows in `README.md` are the canonical smoke test.
- Database migrations: `cd backend && alembic upgrade head`. New migrations: edit models, then `alembic revision --autogenerate -m "msg"`.
- Frontend build: `cd frontend && npm run build` (does `tsc -b` first; type errors will fail the build).
- Backend lint: `ruff check backend/` (not wired into CI yet).

If you're confused about why something is the way it is, check the commit history before assuming it's a bug — most quirks here are deliberate tradeoffs for the "small, simple, correct" MVP target.
