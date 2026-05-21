"""Pure-function tests for gateway_service log-payload helpers. No DB needed."""
from app.services.gateway_service import _payloads_for_log


def test_text_logs_persist_no_payloads():
    """Text request logs drop both payloads: prompt/answer text is the
    dominant request_logs bloat source and has no billing/audit value."""
    req, resp = _payloads_for_log(
        "text",
        {"model": "claude-sonnet-4.6", "messages": [{"role": "user", "content": "hi"}]},
        {"choices": [{"message": {"content": "hello"}}]},
    )
    assert req is None
    assert resp is None


def test_text_failure_payloads_also_dropped():
    """persist_failure can pass request_payload=None on early failures; the
    text branch must handle that without raising."""
    req, resp = _payloads_for_log("text", None, None)
    assert req is None
    assert resp is None


def test_image_logs_keep_payloads():
    """Image/video logs keep payloads — task_service backfills cost params
    (n, duration) from the stored request payload."""
    req, resp = _payloads_for_log(
        "image",
        {"model": "gpt-image-2", "prompt": "a cat", "n": 2},
        {"task_id": "task_1"},
    )
    assert req == {"model": "gpt-image-2", "prompt": "a cat", "n": 2}
    assert resp == {"task_id": "task_1"}


def test_video_logs_keep_payloads():
    req, resp = _payloads_for_log(
        "video",
        {"model": "veo3", "prompt": "a wave", "duration": 4},
        {"task_id": "task_2"},
    )
    assert req == {"model": "veo3", "prompt": "a wave", "duration": 4}
    assert resp == {"task_id": "task_2"}


def test_non_dict_response_is_not_persisted():
    """A non-dict/list response body (e.g. a raw string) is stored as None."""
    _req, resp = _payloads_for_log("image", {"prompt": "x"}, "raw string body")
    assert resp is None


def test_image_request_payload_is_redacted():
    """The non-text path runs redact() — secret-bearing keys must not survive
    into a stored request payload (project invariant: no secrets in logs)."""
    req, _resp = _payloads_for_log(
        "image",
        {"model": "gpt-image-2", "api_key": "sk-secret-value"},
        {"task_id": "task_1"},
    )
    assert req["api_key"] == "***redacted***"
    assert req["model"] == "gpt-image-2"
