# Relay — LLM API Gateway (MVP)

A self-hosted OpenAI-compatible gateway that fronts upstream LLM providers (currently APIMart), with per-user API keys, balance-based billing, request logs, and an admin console.

- **Backend**: FastAPI + SQLAlchemy + Alembic + PostgreSQL
- **Frontend**: Vite + React + TypeScript + Tailwind v4 + shadcn-style primitives + React Router
- **Upstream**: APIMart only (provider adapter layer makes it pluggable later)
- **Surfaces**: dashboard JWT at `/api/*`, OpenAI-compatible gateway at `/v1/*` (Bearer `lgw_…`)

---

## Quick start (local, no Docker)

### Prerequisites
- Python ≥ 3.11
- Node.js ≥ 20
- PostgreSQL ≥ 14 running locally (or use Docker — see below)

### 1) Database
Choose ONE of:

**A. Local Homebrew Postgres (default `.env.example`):**
```bash
brew services start postgresql@15
createdb llm_gateway
```
Then in `.env`:
```
DATABASE_URL=postgresql+psycopg://<your-mac-user>@localhost:5432/llm_gateway
```

**B. Docker Compose Postgres:**
```bash
docker compose up -d
```
Then in `.env`:
```
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/llm_gateway
```

### 2) Redis
Required for rate limiting, the monthly-cap pre-reservation, and the arq worker queue.

```bash
brew install redis
brew services start redis        # or: redis-server
```

### 3) Backend (API)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```
Backend listens on `http://localhost:8000`. On first boot it seeds:
- Admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`. If `ADMIN_PASSWORD` is blank, a random password is generated and printed to the startup logs (capture it).
- APIMart provider row
- Default models (text/image/video)

### 4) Backend worker (arq)
A separate process handles async-task finalization and Prometheus gauge refresh. Don't skip it: without the worker, image/video tasks only finalize when the client polls.

```bash
cd backend
source .venv/bin/activate
arq app.worker.WorkerSettings
```

### 5) Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`. Default login: `admin@example.com` / `admin123` (or the random password printed by the backend on first boot).

---

## Cheat sheet — start / stop everything

One-time install:

```bash
brew install postgresql@15 redis        # if not already installed
createdb llm_gateway                    # once, after postgres is running
cd backend && python3 -m venv .venv && .venv/bin/pip install -e .
cd frontend && npm install
```

Start (run each long-running process in its own terminal):

```bash
# 1. infra
brew services start postgresql@15
brew services start redis

# 2. apply migrations (run after model changes; safe to re-run)
cd backend && .venv/bin/alembic upgrade head

# 3. backend API           → http://localhost:8000
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

# 4. arq worker            (separate terminal)
cd backend && .venv/bin/arq app.worker.WorkerSettings

# 5. frontend dev server   → http://localhost:5173   (separate terminal)
cd frontend && npm run dev
```

Health check:

```bash
curl http://localhost:8000/healthz                   # liveness
curl http://localhost:8000/readyz                    # checks db + redis
redis-cli ping                                       # → PONG
```

Stop:

```bash
# foreground processes (uvicorn / arq / vite): Ctrl-C in each terminal

# infra
brew services stop redis
brew services stop postgresql@15
```

---

## Configuration (`.env`)

```env
ENV=development                           # development | production | test
DATABASE_URL=postgresql+psycopg://...@localhost:5432/llm_gateway
REDIS_URL=redis://localhost:6379/0
APIMART_API_KEY=sk-...                    # required — get from https://apimart.ai
APIMART_BASE_URL=https://api.apimart.ai/v1
JWT_SECRET=<run: python -c "import secrets; print(secrets.token_urlsafe(48))">
JWT_ACCESS_TTL_MINUTES=15
JWT_REFRESH_TTL_DAYS=30
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=                            # leave blank in prod to auto-generate
CORS_ORIGINS=http://localhost:5173
RATE_LIMIT_LOGIN_PER_15M=10
RATE_LIMIT_REFRESH_PER_HOUR=60
RATE_LIMIT_GATEWAY_RPM=60
WORKER_TASK_SCAN_INTERVAL_SECONDS=30

# OAuth (optional; configure to enable Google/GitHub login)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
OAUTH_BACKEND_BASE_URL=http://localhost:8000
OAUTH_FRONTEND_BASE_URL=http://localhost:5173

# Anti-abuse defaults (override only if needed)
SIGNUP_PER_IP_PER_DAY=10
API_KEY_PER_USER_PER_DAY=5
```

In `ENV=production`, weak `JWT_SECRET` values (length < 32, or known placeholders like "change-me") cause the app to refuse to start.

The Vite dev server proxies `/api/*` and `/v1/*` to `http://localhost:8000`, so no extra CORS config is needed for local dev.

### Observability

- `GET /healthz` → liveness (process is up).
- `GET /readyz` → readiness (DB and Redis reachable). Use this for k8s readiness gates.
- `GET /metrics` → Prometheus exposition (request counters, latency histograms, MTD cost, low-balance gauge).
- Structured JSON logs to stdout. Every log line carries a `request_id` matching the `X-Request-ID` response header.

---

## End-to-end smoke test (8 flows)

1. **Admin init** — log in as `admin@example.com`, you land on `/dashboard` with the admin sidebar toggle.
2. **Create user + recharge** — Admin → Users → New user (alice@example.com / alice123, initial $10) → Recharge +$5. Open the History icon to see the ledger.
3. **API key** — Sign in as alice → API Keys → Create key, set a monthly spend cap. **Full key shown once**, copy it.
4. **Chat** — Playground → Chat tab → paste the key → pick `gpt-4o` → Run. Output streams, log appears under Usage / Logs, balance drops.
5. **Logs detail** — Dashboard "Recent activity" row OR Usage / Logs row → drawer shows raw request, raw response, cost.
6. **Image** — Playground → Image tab → `gpt-image-2` → Run. Polls APIMart task, image appears, `$0.04` debited. Generations page shows the asset with download link.
7. **Video** — Playground → Video tab → `veo3` → Run. Polls until task succeeds (1–3 min), video plays.
8. **Monthly limit** — Admin or owner: edit a key's monthly limit below current usage. Next call returns HTTP 429 with `"API key monthly limit reached"`.

Admin extras: Admin → Models → **Ping** (uses a tiny bit of credit) to verify upstream is reachable for a given model.

---

## Architecture in one screen

```
frontend (Vite + React + Tailwind v4)
   │  JWT to /api/*    │  lgw_xxx to /v1/*
   ▼                   ▼
        backend (FastAPI)
   /api/auth /api/keys /api/models /api/billing /api/logs /api/dashboard /api/admin/*
   /v1/models /v1/chat/completions /v1/messages
   /v1/images/generations /v1/videos/generations /v1/tasks/{id}
                  │
                  ▼
           providers/apimart.py   ← single source of truth for APIMart endpoints,
                                     response unwrapping, status mapping
                  │
                  ▼
            APIMart (https://api.apimart.ai/v1)
```

Key design rules:
- All money is `Decimal` end-to-end. DB columns are `Numeric(18,8)`. Pricing parameters used to bill a request are snapshotted into `request_log.unit_price_snapshot_json` so historical cost stays explainable.
- Debit + request_log are written in the **same DB transaction** (`SELECT … FOR UPDATE` on the user row). Task finalization (`task_service.finalize_task`) locks the `VideoTask` row before re-reading the log and debiting — so concurrent client polls + worker can't double-charge.
- Failed requests never debit. Stream chats that complete without an upstream `usage` payload are billed via a pessimistic tiktoken-based estimate (`usage_source="estimated"`) and reconciled by the worker if upstream back-fills later.
- Every `/v1/*` call goes through `gateway_service.preauthorize_spend(...)` which (a) checks the user has positive balance, (b) reserves a pessimistic upper-bound against the monthly cap via Redis (released down to actual cost when the call resolves).
- Image/video are **async on APIMart**: gateway returns `task_id`; clients can either poll `/v1/tasks/{task_id}` or wait for the arq worker to finalize. Both paths share the same locked finalize.
- Admin mutations (recharge, user disable, model price change, …) write an `audit_logs` row in the same transaction as the change.
- Stream `chat/completions` forces `stream_options.include_usage=true` so the final SSE chunk carries usage for billing.
- Provider details (paths, request envelope, status vocab) are isolated in `backend/app/providers/apimart.py`. Adding a second provider = subclass `BaseProvider`.
- Admin can ping any model: `POST /api/admin/models/{id}/healthcheck` issues a minimal upstream call (1-token chat for text models; submit-only for image/video) and reports `{ok, latency_ms, error}`. Costs a tiny bit of credit — don't spam.

---

## Repo layout

```
llm-api-gateway/
├─ backend/
│  ├─ app/
│  │  ├─ main.py              # FastAPI app + lifespan seed
│  │  ├─ config.py            # env-based settings
│  │  ├─ database.py
│  │  ├─ security.py          # bcrypt + JWT + API key gen
│  │  ├─ deps.py              # auth dependencies
│  │  ├─ enums.py             # canonical str enums (UserRole, RequestType...)
│  │  ├─ seed.py              # admin + APIMart + default models (rename/disable maps)
│  │  ├─ models/              # SQLAlchemy
│  │  ├─ schemas/             # Pydantic
│  │  ├─ services/            # billing, cost, gateway (incl. require_can_spend,
│  │  │                       #   mtd_cost_for_api_key(s), submit_async_task)
│  │  ├─ providers/           # base + apimart adapter (single shared httpx client)
│  │  ├─ utils/               # time helpers (today_utc / month_start_utc)
│  │  └─ api/                 # auth, keys, models, billing, logs,
│  │                          # dashboard, admin (incl. /healthcheck), gateway (/v1/*)
│  ├─ tests/                  # pytest: cost, apimart parsing, security,
│  │                          #         auth flow, gateway paths (41 tests)
│  └─ alembic/                # migrations
├─ frontend/
│  ├─ src/
│  │  ├─ App.tsx              # routes (React.lazy)
│  │  ├─ lib/                 # api, auth, utils, types, hooks
│  │  ├─ components/ui/       # button, card, dialog, sheet, tabs, table,
│  │  │                       #   select, switch, badge, form-field, code-block
│  │  ├─ components/          # shell, provider-tag, type-badge, kpi-tile,
│  │  │                       #   log-detail-drawer (shared by 3 pages)
│  │  └─ pages/               # dashboard, api-keys, usage-logs, playground,
│  │                          # models, billing, generations, docs, admin/*
│  └─ vite.config.ts          # proxies /api and /v1 to :8000
├─ docker-compose.yml         # optional Postgres only
├─ .env.example
└─ README.md
```

## Tests

```bash
cd backend
.venv/bin/pytest          # 41 tests; integration tests auto-skip if Postgres is unreachable
```

Coverage: cost calculation, APIMart task_id parsing, password hashing + JWT roundtrip + API key generation, login/me/key CRUD/admin-required, `/v1/*` auth boundary + 402 balance gate + 429 monthly-limit gate + 404 unknown task.

---

## Not in MVP (intentionally)

Public registration, online payments, multi-tenant workspaces, auto-fallback, intelligent routing, multiple real upstream providers, invoices, webhooks, K8s, message queues.

See `CLAUDE.md` for the agent-onboarding notes that explain the design tradeoffs.

---

## OAuth (optional)

To enable Google / GitHub login:

### Google

1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID → Web application
3. Authorized redirect URIs:
   - dev: `http://localhost:8000/api/auth/oauth/google/callback`
   - prod: `https://api.YOUR-DOMAIN/api/auth/oauth/google/callback`
4. Copy Client ID / Secret to env

### GitHub

1. Settings → Developer settings → OAuth Apps → New OAuth App
2. Authorization callback URL: same as above (GitHub version)
3. Copy Client ID / generate Client Secret to env

Frontend and backend **must be same site** (share registrable domain, e.g. `app.example.com` and `api.example.com`). Cross-site deployment requires SameSite=None + CSRF token (not implemented).
