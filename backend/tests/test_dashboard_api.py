"""Integration test for GET /api/dashboard. Skips if Postgres is unreachable."""


def test_dashboard_returns_30_day_daily_usage(client, jwt):
    r = client.get("/api/dashboard", headers={"Authorization": f"Bearer {jwt}"})
    assert r.status_code == 200
    body = r.json()

    assert "daily_usage" in body
    assert len(body["daily_usage"]) == 30

    first = body["daily_usage"][0]
    for key in (
        "date",
        "text_cost",
        "image_cost",
        "video_cost",
        "text_requests",
        "image_requests",
        "video_requests",
    ):
        assert key in first

    dates = [e["date"] for e in body["daily_usage"]]
    assert dates == sorted(dates)          # ascending
    assert len(set(dates)) == 30           # no duplicates / gaps
