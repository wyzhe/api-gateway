"""NIST 800-63B § 5.1.1.2 compliant policy."""
from app.services import password_policy_service as policy


def test_accepts_long_passphrase_without_special_chars():
    assert policy.validate_password("correct horse battery staple", email="x@y.com") is None


def test_rejects_too_short():
    assert policy.validate_password("short1234567", email="x@y.com") is None  # 12 chars
    err = policy.validate_password("short", email="x@y.com")
    assert err == "too_short"


def test_rejects_too_long():
    err = policy.validate_password("a" * 200, email="x@y.com")
    assert err == "too_long"


def test_rejects_breached_password():
    # "masterbating" is in the SecLists top-10k breach list and is 12 chars.
    err = policy.validate_password("masterbating", email="x@y.com")
    assert err == "breached"


def test_accepts_passphrase_when_not_breached():
    assert policy.validate_password("my-strong-passphrase-XJ7q", email="x@y.com") is None


def test_rejects_password_containing_email_local_part():
    err = policy.validate_password("Alice12345678", email="alice@example.com")
    assert err == "contains_email"


def test_short_email_local_part_does_not_match():
    err = policy.validate_password("ab1234567890", email="ab@example.com")
    assert err is None


def test_does_not_enforce_character_class_rules():
    assert policy.validate_password("longenough123", email="x@y.com") is None
    assert policy.validate_password("longenoughpassword", email="x@y.com") is None
