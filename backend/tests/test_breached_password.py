"""Breached password service — load static file, lowercase, O(1) check."""
from app.services import breached_password_service as svc


def test_known_top10_passwords_flagged():
    assert svc.is_breached("123456") is True
    assert svc.is_breached("password") is True
    assert svc.is_breached("qwerty") is True


def test_unique_random_passphrase_not_flagged():
    assert svc.is_breached("correct-horse-battery-staple-z9q") is False


def test_check_is_case_insensitive():
    assert svc.is_breached("PASSWORD") is True
    assert svc.is_breached("Password") is True


def test_load_count_is_around_10k():
    assert 9900 <= len(svc._BREACHED_SET) <= 10100
