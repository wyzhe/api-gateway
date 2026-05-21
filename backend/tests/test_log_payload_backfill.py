"""Guards the text-log payload backfill predicate used by migration
e5f6a7b8c9d0: it must clear text logs only, never image/video. Needs Postgres."""
from decimal import Decimal

from sqlalchemy import text as sql_text


def test_backfill_clears_text_log_payloads_only(db_session, test_user):
    from app.models import RequestLog

    text_log = RequestLog(
        user_id=test_user.id,
        request_type="text",
        status="success",
        cost=Decimal("0"),
        request_payload_json={"messages": [{"role": "user", "content": "hi"}]},
        response_payload_json={"choices": [{"message": {"content": "yo"}}]},
    )
    image_log = RequestLog(
        user_id=test_user.id,
        request_type="image",
        status="success",
        cost=Decimal("0"),
        request_payload_json={"prompt": "a cat", "n": 2},
        response_payload_json={"task_id": "task_1"},
    )
    db_session.add_all([text_log, image_log])
    db_session.commit()

    # Same predicate as migration e5f6a7b8c9d0, scoped to this test user so it
    # does not disturb other rows in the shared test database.
    db_session.execute(
        sql_text(
            """
            UPDATE request_logs
            SET request_payload_json = NULL, response_payload_json = NULL
            WHERE user_id = :uid
              AND request_type = 'text'
              AND (request_payload_json IS NOT NULL
                   OR response_payload_json IS NOT NULL)
            """
        ),
        {"uid": test_user.id},
    )
    db_session.commit()
    db_session.refresh(text_log)
    db_session.refresh(image_log)

    assert text_log.request_payload_json is None
    assert text_log.response_payload_json is None
    assert image_log.request_payload_json == {"prompt": "a cat", "n": 2}
    assert image_log.response_payload_json == {"task_id": "task_1"}
