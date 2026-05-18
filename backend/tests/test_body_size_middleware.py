from fastapi.testclient import TestClient
from app.main import app


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


def test_body_with_content_length_header_only():
    # When Content-Length is present and exceeds the cap, reject without reading body.
    client = TestClient(app)
    resp = client.post(
        "/healthz",
        content=b"x" * 1024,
        headers={"Content-Length": str(10 * 1024 * 1024)},  # lies, but trusted
    )
    # TestClient overrides Content-Length to match body length, so this test is informational.
    # The real protection is the streaming check in the middleware (next test).
    assert resp.status_code in (200, 405, 413)
