"""Provider adapter tests. No network — we just check parsing."""
from app.providers.apimart import APIMartProvider, TASK_STATUS_MAP


def _p() -> APIMartProvider:
    return APIMartProvider(base_url="https://example.test/v1", api_key="fake")


# ---------------- extract_task_id ----------------

def test_extract_task_id_wrapped_video_shape():
    body = {"code": 200, "data": [{"status": "submitted", "task_id": "task_abc"}]}
    assert _p().extract_task_id(body) == "task_abc"


def test_extract_task_id_wrapped_with_id_only():
    body = {"data": [{"id": "task_xyz"}]}
    assert _p().extract_task_id(body) == "task_xyz"


def test_extract_task_id_flat_shape():
    assert _p().extract_task_id({"task_id": "task_42"}) == "task_42"
    assert _p().extract_task_id({"id": "task_99"}) == "task_99"


def test_extract_task_id_missing():
    assert _p().extract_task_id({}) is None
    assert _p().extract_task_id({"foo": "bar"}) is None
    assert _p().extract_task_id({"data": []}) is None


def test_extract_task_id_handles_non_dict_list_payload():
    assert _p().extract_task_id([]) is None


# ---------------- status mapping ----------------

def test_task_status_map_covers_apimart_vocab():
    for upstream in ["pending", "processing", "completed", "failed", "cancelled"]:
        assert upstream in TASK_STATUS_MAP


def test_task_status_map_collapses_to_our_vocab():
    ours = set(TASK_STATUS_MAP.values())
    assert ours <= {"queued", "running", "succeeded", "failed"}


def test_task_status_cancelled_is_failed():
    assert TASK_STATUS_MAP["cancelled"] == "failed"
