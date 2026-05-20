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
