import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.middleware import BodySizeLimitMiddleware


def test_body_under_limit_passes():
    # Use /healthz to avoid auth — body is read by the middleware before routing.
    client = TestClient(app)
    resp = client.post("/healthz", content=b"x" * (1024 * 1024))  # 1 MiB
    # /healthz won't accept POST (405), but the middleware must not have blocked it (not 413).
    assert resp.status_code != 413


def test_body_over_limit_returns_413():
    client = TestClient(app)
    resp = client.post("/healthz", content=b"x" * (5 * 1024 * 1024))  # 5 MiB
    assert resp.status_code == 413
    assert "request body too large" in resp.text.lower()


@pytest.mark.asyncio
async def test_content_length_header_over_limit_short_circuits():
    """Direct ASGI invocation: when Content-Length says > max_bytes, the
    middleware must 413 BEFORE the receive callable is exhausted."""
    receive_called = False

    async def receive():
        nonlocal receive_called
        receive_called = True
        return {"type": "http.request", "body": b"", "more_body": False}

    sent = []

    async def send(message):
        sent.append(message)

    async def downstream(scope, receive, send):
        raise AssertionError("downstream must not be called when Content-Length exceeds cap")

    mw = BodySizeLimitMiddleware(downstream, max_bytes=100)
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/",
        "headers": [(b"content-length", b"1000")],
    }
    await mw(scope, receive, send)

    # Find the response start
    starts = [m for m in sent if m["type"] == "http.response.start"]
    assert starts, "middleware did not send a response start"
    assert starts[0]["status"] == 413
    assert not receive_called, "middleware should not have read the body"
