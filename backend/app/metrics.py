"""Prometheus metrics. Mounted at /metrics by main.py."""
from __future__ import annotations

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

# --- Gateway counters ---
gateway_requests_total = Counter(
    "gateway_requests_total",
    "Total /v1/* requests by type, model, and outcome.",
    labelnames=("type", "model", "status"),
)

gateway_cost_usd_total = Counter(
    "gateway_cost_usd_total",
    "Total USD cost charged through the gateway, by type and model.",
    labelnames=("type", "model"),
)

gateway_latency_ms = Histogram(
    "gateway_latency_ms",
    "End-to-end gateway request latency in milliseconds.",
    labelnames=("type", "model"),
    buckets=(50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000, 120000, 300000),
)

upstream_latency_ms = Histogram(
    "upstream_latency_ms",
    "Upstream provider call latency in milliseconds.",
    labelnames=("provider", "operation"),
    buckets=(50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000, 120000, 300000),
)

# --- Auth ---
auth_logins_total = Counter(
    "auth_logins_total",
    "Login attempts by outcome.",
    labelnames=("outcome",),  # ok | bad_creds | disabled | rate_limited
)

# --- Async tasks ---
task_finalizations_total = Counter(
    "task_finalizations_total",
    "Task finalization events by source and outcome.",
    labelnames=("source", "outcome"),  # source: client_poll|worker, outcome: succeeded|failed|noop|conflict
)

# --- Pricing source distribution (track how often we estimate vs. read usage) ---
pricing_source_total = Counter(
    "pricing_source_total",
    "Cost calculation pricing source distribution.",
    labelnames=("source",),  # upstream | estimated | missing
)

# --- Gauges refreshed by the worker ---
users_with_low_balance = Gauge(
    "users_with_low_balance",
    "Number of users whose balance is <= the warning threshold.",
)

# --- OAuth ---
auth_oauth_total = Counter(
    "auth_oauth_total",
    "OAuth flow outcomes",
    labelnames=("provider", "outcome"),
)

auth_oauth_latency_ms = Histogram(
    "auth_oauth_latency_ms",
    "OAuth callback total latency in ms",
    labelnames=("provider",),
    buckets=(50, 100, 200, 500, 1000, 2000, 5000),
)

auth_signup_rate_limited_total = Counter(
    "auth_signup_rate_limited_total",
    "Signup attempts blocked by IP rate limit",
)


auth_password_changes_total = Counter(
    "auth_password_changes_total",
    "Self-service password set/change",
    labelnames=("kind",),  # set | changed
)


def render_metrics() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
