# CLAUDE.md — agent onboarding for the Relay LLM Gateway repo

You're working on a self-hosted OpenAI-compatible API gateway in active production-prep development. Read this whole file before changing code; the design choices below are deliberate and unwinding them silently will break correctness, billing, or security.

> **Posture**: This project is no longer MVP. It's being hardened for real usage. Treat every decision in this file as a production constraint, not a "good enough for friends" tradeoff. If you see a `# TODO` or a note like "acceptable for now," that's a known-defect to fix, not a license to skip a hard problem.

## What this is, what it isn't

- **Is**: an OpenAI-compatible gateway in front of upstream LLM providers (currently APIMart) that adds (a) per-user API keys, (b) `Decimal`-precise balance-based billing with monthly caps, (c) full request logs, (d) async task lifecycle (image/video), (e) a React dashboard + admin console, (f) Redis-backed rate limiting, (g) an arq worker for async task finalization.
- **Isn't**: a chat product, a managed offering, a multi-tenant SaaS, or a hosted public service. No online payments, no per-org workspaces. Self-serve sign-up via Google / GitHub OAuth is now supported (open registration, default balance 0); admin manual provisioning still works as before.

## Stack and where to look first

| Layer | Tech | Entry point |
|---|---|---|
| Backend API | FastAPI 0.115+, SQLAlchemy 2, Alembic, psycopg 3, httpx | `backend/app/main.py` |
| Background worker | arq (Redis queue) | `backend/app/worker.py` |
| DB | PostgreSQL 15+ | `backend/alembic/versions/` |
| Cache / queue / rate limit | Redis 7+ | `backend/app/redis.py` |
| Auth | bcrypt + python-jose JWT (access + refresh) | `backend/app/security.py`, `deps.py` |
| Token counting | tiktoken (cl100k_base / o200k_base) | `backend/app/services/token_estimator.py` |
| Upstream | APIMart only (docs.apimart.ai); pluggable via `BaseProvider` | `backend/app/providers/apimart.py` |
| Observability | structlog (JSON), `prometheus-client` `/metrics` | `backend/app/logging_config.py`, `backend/app/metrics.py` |
| Frontend | Vite + React 19 + TS + Tailwind v4 + hand-rolled shadcn-style primitives | `frontend/src/App.tsx` |

When you need to change anything that talks to APIMart, **the only file that should know APIMart-specific paths or response shapes is `backend/app/providers/apimart.py`**. If you find yourself reading `data[0].task_id` outside that file you're doing it wrong — add a method to the adapter instead.

## Critical invariants — do not break

1. **Money is `Decimal`. Always.** Never use `float` for `cost`, `balance`, `amount`, or anything that flows into them. All DB columns are `Numeric(18,8)`. Pydantic schemas declare `Decimal`. Cost math lives in `app/services/cost_service.py` and uses `Decimal` arithmetic. Any `float()` cast in the billing path is a regression. Upstream values that arrive as floats (e.g. video `duration`) must be wrapped as `Decimal(str(value))` immediately — never raw `Decimal(float_value)`.

2. **Debit and request_log are in the same DB transaction**, with the user row locked via `SELECT … FOR UPDATE` first (`app/services/billing_service.py`). Also: any code path that *finalizes* an existing log (e.g. async task completion) **must lock both the user row and the `VideoTask` row** before deciding whether to debit. See `_finalize_task` in `app/services/task_service.py`. Concurrent finalization (e.g. client polling + worker running at the same time) must produce exactly one debit.

3. **Failed requests never debit.** Persist `status="failed"` with `cost=0`. Async task transitions from `running → succeeded` do debit, but only inside the locked finalization path. Async task transitions from `running → failed` never debit; if a debit was somehow already taken (shouldn't be possible by construction), it must be refunded via `billing_service.refund()`.

4. **Plain-text API keys never touch the DB.** Generation in `app/security.py` returns `(full_key, prefix, sha256_hash)`. The full key is returned exactly once on creation. Lookups go via `sha256(presented_key)` → `key_hash`. Bearer key format is enforced (`sk-…`) before the DB lookup.

5. **The `/api/*` endpoints take a JWT. The `/v1/*` endpoints take a user API key (`sk-…`).** These are distinct auth modes with distinct dependencies. `deps.get_current_user` (JWT) and `deps.get_api_key_user` (API key) enforce this. JWTs have an access/refresh pair — only refresh tokens hit the DB (revocable). Access tokens are short-lived (15 min default) and not revocable mid-window.

6. **Don't hardcode model lists in the frontend.** The catalog comes from `GET /api/models` (user side) and `GET /api/admin/models` (admin). Pricing, visibility, public-vs-upstream-name mapping all live in the `models` table.

7. **Every `/v1/*` call goes through the spend gate** in `gateway_service.preauthorize_spend(db, user, api_key, expected_cost)`. The gate now does two things: (a) `require_balance` (402 if `balance <= 0`); (b) `require_within_monthly_limit` with **pre-reservation** of an upper-bound estimate against the monthly cap. The reservation lives in Redis with a short TTL and is reconciled against actual cost at debit time. Don't bypass it on a new gateway route — the cap is the only thing standing between a leaked key and a billing surprise.

8. **Shared TS types live in `frontend/src/lib/types.ts`.** Pages should `import type { Model, ApiKey, LogSummary, ... }` from there, not redeclare. Same for the shared `LogDetailDrawer` in `components/log-detail-drawer.tsx`.

9. **Pricing is historized via snapshot.** When a request is logged, the model's current pricing parameters are captured into `request_log.unit_price_snapshot_json`. Cost recomputes, audits, and future "why did this cost X?" investigations read the snapshot, not the live `models` row. If you change pricing, *do not* backfill old logs.

10. **Mutating admin actions write audit log rows.** Every admin endpoint that changes user state (recharge, adjust, disable, role-change, key revoke on behalf, model price/status edits, provider edits) writes a row into `audit_logs` in the same transaction as the change. Read-only admin endpoints don't.

11. **Structured logs carry `request_id`.** A middleware assigns one per inbound request (or honors `X-Request-ID`) and puts it on a contextvar that structlog reads. Don't log via `print` or `logging.info(...)` without going through the configured logger.

12. **No secret values in logs.** API keys, full JWTs, bcrypt hashes, raw `Authorization` headers must never appear in request/response payloads written to `request_logs.request_payload_json`. The gateway scrubs these on ingress. Adding a new field that might carry one means adding it to the scrub list.

13. **OAuth 自动账号合并要求 verified email**:在 `OAuthLinkingService` 路径里,合并到已存在 User 必须满足 `User.email_verified_at IS NOT NULL`,否则抛 `OAuthEmailConflict`。这是对 [Account Pre-hijacking](https://www.usenix.org/conference/usenixsecurity22/presentation/sudhodanan) 攻击的核心防护,不要绕过。

14. **OAuth signup IP 限流不能绕**:`/api/auth/oauth/*/callback` 的 signup 分支必须先过 `signup_ip_count` 计数器(默认 10/IP/day)。`/api/keys` 必须先过 `api_key_quota` 计数器(默认 5/user/day)。这是开放注册的反滥用基线,绕过会让 DB / Redis 在被扫的时候撑爆。

## How APIMart actually behaves (this informed the schema)

Pulled from docs.apimart.ai (verified May 2026):

| Endpoint | Sync/Async | Notes |
|---|---|---|
| `POST /v1/chat/completions` | Sync + SSE | OpenAI-compatible. We force `stream_options.include_usage=true` so the final stream chunk carries `usage` for billing. |
| `POST /v1/messages` | Sync + SSE | Anthropic Messages API. Usage is delivered across `message_start` (`input_tokens`) and `message_delta` (`output_tokens`); we accumulate both. |
| `POST /v1/images/generations` | **Async** | Returns `task_id`. Image and video share the same task system. |
| `POST /v1/videos/generations` | **Async** | Wrapped `{code:200, data:[{task_id, status:"submitted"}]}` — adapter unwraps. |
| `GET /v1/tasks/{task_id}` | Sync | Status vocab: `pending|processing|completed|failed|cancelled` — adapter maps to our internal `queued|running|succeeded|failed`. Assets at `result.images[].url` or `result.videos[].url`. |

Because image is async, our `/v1/images/generations` returns `task_id` too (we chose to expose async upward; we don't fake sync). Clients can either poll `GET /v1/tasks/{task_id}` or let our arq worker finalize the task autonomously (it does). Polling and worker both go through the **same locked finalize path** so they never double-charge.

## Two chat protocols: OpenAI Chat Completions and Anthropic Messages

The gateway exposes both:

- `POST /v1/chat/completions` — OpenAI-compatible. Use for clients written against the OpenAI SDK.
- `POST /v1/messages` — Anthropic-compatible. Use for Claude Code, Cursor, and anything written against Anthropic's SDK.

Both go through the same plumbing: `gateway_service.resolve_for_request()` → `preauthorize_spend()` → upstream call → `persist_success()` / `persist_failure()` → debit + snapshot. The only differences are the request/response schema and where the usage block lives. Token-pricing is the same `models` table — we don't have separate Anthropic pricing rows.

When choosing a model name in `/v1/messages`, you still send our public_name (e.g. `claude-sonnet-4.6`). The adapter rewrites it to the upstream alias on the wire and rewrites it back on the response.

**Routing decision is explicit, not automatic.** We do NOT translate between protocols — if a client hits `/v1/chat/completions` with a model that only the Anthropic endpoint supports, that's a 400/422 case, not a silent format conversion. Cross-provider fallback is explicitly out of scope (see "Things to NOT reintroduce").

## Multi-provider session stickiness (hook)

`services/provider_selector.py` is the seam where future per-session provider selection lives. Today there's only one upstream (APIMart), so `pick_provider(model)` just returns the model's `provider_id`. The `session_key` argument is wired through `resolve_for_request()` from the API key id (`session_key_for_request(api_key) → "k{id}"`).

When a second provider lands:
1. Implement its `BaseProvider` subclass.
2. Switch in `gateway_service.build_provider()`.
3. Decide whether multiple `models` rows with the same `public_name` should be allowed (probably no — one public name per provider).
4. The sticky map in Redis (`sticky:{session_key}:{model_id} → provider_id`) is already being read and written; just point it at meaningful provider choices.

Do NOT add cross-provider fallback. If upstream is down, surface the error.

## Streaming chat & usage estimation

We force `stream_options.include_usage=true` so APIMart's last OpenAI SSE chunk carries `usage`. The Anthropic Messages API delivers usage incrementally (`message_start` has `input_tokens`; `message_delta` updates `output_tokens`) — we accumulate the last seen values.

If either protocol's usage block is missing, we **fall back to a pessimistic estimate**:

- OpenAI: `estimate_chat_usage()` — tiktoken count of messages + `max_tokens` ceiling.
- Anthropic: `estimate_anthropic_messages_usage()` — same tokenizer (over-estimate is acceptable for billing), plus the `system` field + tool definitions in the prompt count.
- Mark the log with `usage_source="estimated"` and `pricing_estimated=true` in `error_message`.

This guarantees no free service. The estimate is intentionally an upper bound: if actual usage arrives later (e.g. APIMart back-fills), the worker can call `billing_service.adjust_log_cost()` and refund the difference.

## Rate limiting

- `fastapi-limiter` (Redis-backed) is mounted in `main.py`.
- `/api/auth/login`: 10 attempts / 15 min per IP.
- `/api/auth/refresh`: 60 per hour per IP.
- `/v1/*`: 60 RPM per API key (configurable per key via `api_keys.rate_limit_rpm`).
- Admin endpoints: not rate-limited (admins are trusted; abuse there is a different problem).

Rate limit decisions are visible in `X-RateLimit-*` headers and emit metrics.

## Background worker (arq)

`backend/app/worker.py` defines arq jobs. Run with:

```bash
arq app.worker.WorkerSettings
```

Jobs:
- `finalize_task(task_id)`: locked finalize for one task. Idempotent — safe to enqueue many times.
- `scan_pending_tasks()`: cron every 30s. Enqueues `finalize_task` for non-terminal tasks older than 15s.
- `reconcile_stream_usage(log_id)`: stub for the post-hoc usage clawback described above.

A failed worker job is retried with exponential backoff. Worker job exceptions are logged via the same structlog pipeline.

## Observability

- **Logs**: structlog JSON to stdout. `request_id` is on every log line during a request. Logged events for `/v1/*` include `model`, `cost`, `latency_ms`, `upstream_status`, `pricing_source` (`upstream|estimated|missing`).
- **Metrics**: `prometheus-client` on `/metrics`. Counters: `gateway_requests_total{type, model, status}`, `gateway_cost_usd_total{type, model}`. Histograms: `gateway_latency_ms{type, model}`, `upstream_latency_ms{provider}`. Gauges: `users_with_low_balance` (refreshed by worker every minute).
- **Healthchecks**: `/healthz` (process is up) and `/readyz` (DB + Redis reachable). `/readyz` returns 503 if either is down — useful for k8s readiness gates.

## Frontend conventions

- **Visual design — read `DESIGN.md` before any UI change.** Tokens, components, do/don't, layout rules, and the "what mistakes are easy to make in this codebase" list all live there. When the code and `DESIGN.md` disagree, the code is wrong; fix the code, don't retro-edit the doc. If you're adding a new visual primitive, document it under `## Components` in `DESIGN.md` in the same change.
- All shadcn-style primitives are hand-written under `src/components/ui/`. No `shadcn/ui` CLI was used because it requires interactive prompts. New primitives go there too.
- Dark theme is the only theme. Tokens live in `src/index.css` under `:root` and are exported into Tailwind via `@theme inline`.
- API calls go through `src/lib/api.ts`. JWT access token is auto-attached for `/api/*`. The client transparently refreshes on 401 if a refresh token is present. `gateway()` and `gatewayStream()` are for `/v1/*` with a user API key.
- `RequireAuth` / `RequireAdmin` wrap routes that need login or admin role.
- **Playground**: the user's API key for the playground is held in **`sessionStorage`** (NOT `localStorage`), and the server emits a strict `Content-Security-Policy` that blocks third-party scripts/inline scripts. This is still imperfect (a same-origin XSS would defeat it) — if Playground users complain about the key clearing on tab close, fix the underlying XSS surface, don't move back to `localStorage`.
- TS strictness: `strict: true`, `noImplicitAny: true`. New code must not introduce `any`. Use `unknown` and narrow.
- **OAuth 一次性 exchange cookie 是唯一被允许的 HttpOnly cookie**。callback 后到 exchange 之间用 `oauth_exchange` cookie 传一次性 code,60s TTL,`Path=/api/auth/oauth/exchange`,`SameSite=Strict`。除此之外项目其它 token 仍走「JSON 返回 + 前端持有」模式,不要不假思索地把别的会话状态也搬到 cookie。

## Where the seams are if you need to extend

| Want to | Touch |
|---|---|
| Add a second upstream provider | New subclass of `BaseProvider` in `app/providers/`; switch in `gateway_service.build_provider()`; add `Provider` row via Admin → Providers |
| Add a new endpoint (e.g. `/v1/embeddings`) | Add method on `BaseProvider` + `APIMartProvider`; add route in `app/api/gateway.py`; add cost rule in `cost_service.py`; pre-reserve in `preauthorize_spend()` if it costs more than chat |
| Add a new chat protocol (e.g. Google Gen AI) | New methods on `BaseProvider`, mirror the `/v1/messages` plumbing in `app/api/gateway.py`, share the same model rows and pricing. Don't translate between protocols at the gateway layer. |
| Change billing rules | `app/services/cost_service.py`. Don't touch billing inside endpoints. |
| Add a new model | Either: edit `seed.py` for first-boot defaults, OR `POST /api/admin/models` at runtime. Existing logs keep their old pricing via the snapshot — no migration needed. |
| Add a UI page | New file in `frontend/src/pages/`, register in `frontend/src/App.tsx`, add sidebar entry in `frontend/src/components/shell.tsx`. |
| Add a background job | New function in `app/worker.py`; register in `WorkerSettings.functions` or `cron_jobs` |
| Add an audit-logged admin action | Wrap the mutation in `audit_log.record(db, actor=admin, action=..., target_type=..., target_id=..., before=..., after=...)` inside the same transaction. |
| Add a new OAuth provider | New entry in `OAUTH_PROVIDERS` dict in `oauth_providers.py` + env vars + Authlib registration |
| Change abuse-mitigation thresholds | `SIGNUP_PER_IP_PER_DAY` / `API_KEY_PER_USER_PER_DAY` env vars; default values are deliberately strict |

## Running things

- Backend dev: `cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000`
- Worker dev: `cd backend && .venv/bin/arq app.worker.WorkerSettings`
- Tests: `cd backend && .venv/bin/pytest` — pure-function tests run anywhere; integration tests need Postgres + Redis (auto-skip if either is unreachable). New routes should grow `tests/test_gateway_paths.py`; concurrency tests live in `tests/test_concurrency.py`.
- Database migrations: `cd backend && alembic upgrade head`. New migrations: edit models, then `alembic revision --autogenerate -m "msg"` and read the diff before committing.
- Frontend build: `cd frontend && npm run build` (does `tsc -b` first; type errors will fail the build).
- Backend lint: `ruff check backend/` (not wired into CI yet — see "Known gaps" below).

## Configuration & startup safety

- `JWT_SECRET` has no default in non-test environments. The Settings model rejects missing/short/weak values at startup. Same for `ADMIN_PASSWORD`. If you see "JWT_SECRET must be at least 32 chars and not a known weak value" — set a real one, don't paper over it.
- `REDIS_URL` is required. The app fails to start if Redis is unreachable at startup.
- `CORS_ORIGINS` is a strict allowlist. Wildcards are not honored in production mode (`ENV=production`).
- OAuth 端配置:`GOOGLE_OAUTH_CLIENT_ID/_SECRET`、`GITHUB_OAUTH_CLIENT_ID/_SECRET`、`OAUTH_BACKEND_BASE_URL`、`OAUTH_FRONTEND_BASE_URL`。生产环境校验:配了 `*_client_id` 必须有 `*_client_secret`;url 必须 https;backend / frontend url 必须同站(eTLD+1 相同),否则 `SameSite=Strict` cookie 会失效。`SIGNUP_PER_IP_PER_DAY`(默认 10)和 `API_KEY_PER_USER_PER_DAY`(默认 5)必须 >= 1。

## Known gaps / deferred items (not "won't fix" — "next")

- Audit log retention: rows are kept forever. A retention policy (e.g. archive to S3 after N days) is not implemented.
- The arq worker runs in the same Redis namespace as `fastapi-limiter`. If scale demands it, separate them.
- No CI yet. `ruff check`, `pytest`, `tsc -b`, `npm run build` should be wired to GitHub Actions before the next deploy bump.
- No graceful shutdown for in-flight streaming responses. SIGTERM cancels them mid-flight; the partial log is written.
- Refresh tokens are stored opaque in DB; they don't support family-level reuse detection yet (single-token revocation only).

## Things to NOT reintroduce

- **passlib** — incompatible with bcrypt ≥ 5. Use `bcrypt` directly.
- **shadcn CLI init** — needs an interactive prompt and pulls files we'd then edit anyway.
- **Auto fallback / intelligent routing across providers** — out of scope; build it explicitly when there's a real second provider.
- **Hiding async image/video behind a long-poll sync API** — ties up workers, breaks under load. Clients poll `/v1/tasks/{id}` or wait for the worker to finalize.
- **`localStorage` for the playground API key** — `sessionStorage` + CSP is the floor. Moving back invites credential theft via XSS.
- **`float` anywhere in the money path.**
- **Auto-link OAuth identity to any existing User by email alone** — 必须用 `email_verified_at IS NOT NULL` 做 gate。详见 `docs/superpowers/specs/2026-05-19-oauth-login-design.md` § 6.1 Case 2 和 Account Pre-hijacking 引用。

If you're confused about why something is the way it is, check the commit history before assuming it's a bug. Most quirks here are deliberate constraints for "small, simple, correct, production-ready" — emphasis added.
