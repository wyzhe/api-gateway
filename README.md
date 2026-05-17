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

### 2) Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```
Backend listens on `http://localhost:8000`. On first boot it seeds:
- Admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`
- APIMart provider row
- 12 default models (text/image/video)

### 3) Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`. Default login: `admin@example.com` / `admin123`.

---

## Configuration (`.env`)

```env
DATABASE_URL=postgresql+psycopg://...@localhost:5432/llm_gateway
APIMART_API_KEY=sk-...                    # required — get from https://apimart.ai
APIMART_BASE_URL=https://api.apimart.ai/v1
JWT_SECRET=change-me                      # change before any non-local use
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123                   # change before any non-local use
CORS_ORIGINS=http://localhost:5173        # comma-separated list
```

The Vite dev server proxies `/api/*` and `/v1/*` to `http://localhost:8000`, so no extra CORS config is needed for local dev.

---

## End-to-end smoke test (7 flows)

1. **Admin init** — log in as `admin@example.com`, you land on `/dashboard` with the admin sidebar toggle.
2. **Create user + recharge** — Admin → Users → New user (alice@example.com / alice123, initial $10) → Recharge +$5.
3. **API key** — Sign in as alice → API Keys → Create key. **Full key shown once**, copy it.
4. **Chat** — Playground → Chat tab → paste the key → pick `gpt-4o` → Run. Output streams, log appears under Usage / Logs, balance drops.
5. **Logs detail** — Usage / Logs → click a row → drawer shows raw request, raw response, cost.
6. **Image** — Playground → Image tab → `gpt-image-2` → Run. Polls APIMart task, image appears, `$0.04` debited.
7. **Video** — Playground → Video tab → `sora2` → Run. Polls until task succeeds (1–3 min), video plays.

---

## Architecture in one screen

```
frontend (Vite + React + Tailwind v4)
   │  JWT to /api/*    │  lgw_xxx to /v1/*
   ▼                   ▼
        backend (FastAPI)
   /api/auth /api/keys /api/models /api/billing /api/logs /api/dashboard /api/admin/*
   /v1/models /v1/chat/completions /v1/images/generations /v1/videos/generations /v1/tasks/{id}
                  │
                  ▼
           providers/apimart.py   ← single source of truth for APIMart endpoints,
                                     response unwrapping, status mapping
                  │
                  ▼
            APIMart (https://api.apimart.ai/v1)
```

Key design rules:
- All money is `Decimal` end-to-end. DB columns are `Numeric(18,8)`.
- Debit + request_log are written in the **same DB transaction** (`SELECT … FOR UPDATE` on the user row).
- Failed requests never debit.
- Image/video are **async on APIMart**: gateway returns `task_id`; user polls `/v1/tasks/{task_id}`. The polling endpoint lazily refreshes from APIMart and finalizes cost on success.
- Stream `chat/completions` forces `stream_options.include_usage=true` so the final SSE chunk carries usage for billing.
- Provider details (paths, request envelope, status vocab) are isolated in `backend/app/providers/apimart.py`. Adding a second provider = subclass `BaseProvider`.

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
│  │  ├─ seed.py              # admin + APIMart + 12 default models
│  │  ├─ models/              # SQLAlchemy
│  │  ├─ schemas/             # Pydantic
│  │  ├─ services/            # billing, cost, gateway
│  │  ├─ providers/           # base + apimart adapter
│  │  └─ api/                 # auth, keys, models, billing, logs,
│  │                          # dashboard, admin, gateway (/v1/*)
│  └─ alembic/                # migrations
├─ frontend/
│  ├─ src/
│  │  ├─ App.tsx              # routes
│  │  ├─ lib/{api,auth,utils} # fetch + JWT + helpers
│  │  ├─ components/ui/       # button, card, dialog, sheet, tabs, table…
│  │  ├─ components/          # shell, provider-tag, type-badge, kpi-tile
│  │  └─ pages/               # dashboard, api-keys, usage-logs, playground,
│  │                          # models, billing, generations, docs, admin/*
│  └─ vite.config.ts          # proxies /api and /v1 to :8000
├─ docker-compose.yml         # optional Postgres only
├─ project/                   # original design prototype (HTML/JSX, reference only)
├─ .env.example
└─ README.md
```

---

## Not in MVP (intentionally)

Public registration, online payments, multi-tenant workspaces, auto-fallback, intelligent routing, multiple real upstream providers, invoices, webhooks, K8s, message queues.

See `CLAUDE.md` for the agent-onboarding notes that explain the design tradeoffs.
