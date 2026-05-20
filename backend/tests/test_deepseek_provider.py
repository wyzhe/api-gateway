"""DeepSeek provider adapter — no network, URL/header/parsing checks only."""
from app.providers.deepseek import DeepSeekProvider, PATH_CHAT, PATH_MESSAGES


def _p() -> DeepSeekProvider:
    return DeepSeekProvider(base_url="https://api.deepseek.com", api_key="fake")


def test_name_is_deepseek():
    assert DeepSeekProvider.name == "deepseek"


def test_chat_url():
    assert _p()._url(PATH_CHAT) == "https://api.deepseek.com/chat/completions"


def test_messages_url_uses_anthropic_path():
    assert _p()._url(PATH_MESSAGES) == "https://api.deepseek.com/anthropic/v1/messages"


def test_base_url_trailing_slash_stripped():
    p = DeepSeekProvider(base_url="https://api.deepseek.com/", api_key="k")
    assert p._url(PATH_CHAT) == "https://api.deepseek.com/chat/completions"


def test_chat_headers_use_bearer():
    h = _p()._chat_headers()
    assert h["Authorization"] == "Bearer fake"


def test_messages_headers_use_x_api_key():
    h = _p()._messages_headers()
    assert h["x-api-key"] == "fake"
    assert "anthropic-version" in h
    assert "Authorization" not in h


def test_image_generation_not_implemented():
    import asyncio

    try:
        asyncio.run(_p().image_generation({}))
        raise AssertionError("expected NotImplementedError")
    except NotImplementedError:
        pass


def test_build_provider_dispatches_deepseek(monkeypatch):
    from types import SimpleNamespace

    from app.providers import DeepSeekProvider
    from app.services import gateway_service

    monkeypatch.setattr(gateway_service.settings, "deepseek_api_key", "fake-key")
    prov = SimpleNamespace(name="deepseek", base_url="https://api.deepseek.com")
    built = gateway_service.build_provider(prov)
    assert isinstance(built, DeepSeekProvider)


def test_build_provider_deepseek_missing_key_raises_500(monkeypatch):
    from types import SimpleNamespace

    from fastapi import HTTPException

    from app.services import gateway_service

    monkeypatch.setattr(gateway_service.settings, "deepseek_api_key", "")
    prov = SimpleNamespace(name="deepseek", base_url="https://api.deepseek.com")
    try:
        gateway_service.build_provider(prov)
        raise AssertionError("expected HTTPException")
    except HTTPException as e:
        assert e.status_code == 500


def test_build_provider_unknown_raises_501():
    from types import SimpleNamespace

    from fastapi import HTTPException

    from app.services import gateway_service

    prov = SimpleNamespace(name="nope", base_url="x")
    try:
        gateway_service.build_provider(prov)
        raise AssertionError("expected HTTPException")
    except HTTPException as e:
        assert e.status_code == 501


def test_extract_cache_tokens_reads_deepseek_field():
    from app.api.gateway import _extract_cache_tokens

    cached, creation = _extract_cache_tokens({"prompt_cache_hit_tokens": 320})
    assert cached == 320
    assert creation == 0


def test_extract_cache_tokens_openai_shape_still_works():
    from app.api.gateway import _extract_cache_tokens

    cached, creation = _extract_cache_tokens({"prompt_tokens_details": {"cached_tokens": 11}})
    assert cached == 11
    assert creation == 0
