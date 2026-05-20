"""Default model catalogue — pure-function assertions on seed.py constants.
No DB needed; these check the catalogue shape directly."""
from decimal import Decimal

from app.seed import DEFAULT_MODELS, DISABLE_ON_BOOT


def _by_name(specs):
    return {s["public_name"]: s for s in specs}


def test_text_models_are_the_expected_set():
    text = {s["public_name"] for s in DEFAULT_MODELS if s["type"] == "text"}
    assert text == {
        "gpt-5.5",
        "claude-opus-4.7",
        "claude-sonnet-4.6",
        "gemini-3.1-pro",
        "gemini-3.5-flash",
    }


def test_retired_text_models_are_gone():
    names = {s["public_name"] for s in DEFAULT_MODELS}
    for retired in ("gpt-5", "gpt-4o", "gemini-2.0-flash"):
        assert retired not in names


def test_video_models_are_the_expected_set():
    video = {s["public_name"] for s in DEFAULT_MODELS if s["type"] == "video"}
    assert video == {"veo3.1-fast", "grok-imagine-1.0-video-apimart"}


def test_retired_video_models_are_gone():
    names = {s["public_name"] for s in DEFAULT_MODELS}
    for retired in ("veo3", "veo3.1", "grok-imagine-video"):
        assert retired not in names


def test_image_models_unchanged():
    image = {s["public_name"] for s in DEFAULT_MODELS if s["type"] == "image"}
    assert image == {"gpt-image-2", "nano-banana", "nano-banana-pro", "grok-imagine"}


def test_disable_on_boot_lists_retired_models():
    assert DISABLE_ON_BOOT == {
        "sora2",
        "gpt-5",
        "gpt-4o",
        "gemini-2.0-flash",
        "veo3",
        "veo3.1",
    }


def test_new_chat_models_use_official_prices():
    m = _by_name(DEFAULT_MODELS)
    assert (m["gpt-5.5"]["input_price"], m["gpt-5.5"]["output_price"]) == (
        Decimal("5.0"),
        Decimal("30.0"),
    )
    assert (m["claude-opus-4.7"]["input_price"], m["claude-opus-4.7"]["output_price"]) == (
        Decimal("5.0"),
        Decimal("25.0"),
    )
    assert (m["gemini-3.1-pro"]["input_price"], m["gemini-3.1-pro"]["output_price"]) == (
        Decimal("2.0"),
        Decimal("12.0"),
    )
    assert (m["gemini-3.5-flash"]["input_price"], m["gemini-3.5-flash"]["output_price"]) == (
        Decimal("1.5"),
        Decimal("9.0"),
    )


def test_new_chat_models_cache_prices():
    m = _by_name(DEFAULT_MODELS)
    # OpenAI / Gemini: no separate cache-write fee, only a cache-read price.
    assert m["gpt-5.5"]["cache_write_price"] is None
    assert m["gpt-5.5"]["cache_read_price"] == Decimal("0.50")
    assert m["gemini-3.1-pro"]["cache_read_price"] == Decimal("0.20")
    assert m["gemini-3.5-flash"]["cache_read_price"] == Decimal("0.15")
    # Anthropic: write = 1.25x input, read = 0.1x input.
    assert m["claude-opus-4.7"]["cache_write_price"] == Decimal("6.25")
    assert m["claude-opus-4.7"]["cache_read_price"] == Decimal("0.50")


def test_video_models_use_official_per_second_prices():
    m = _by_name(DEFAULT_MODELS)
    assert m["veo3.1-fast"]["pricing_mode"] == "per_second"
    assert m["veo3.1-fast"]["video_second_price"] == Decimal("0.15")
    assert m["grok-imagine-1.0-video-apimart"]["pricing_mode"] == "per_second"
    assert m["grok-imagine-1.0-video-apimart"]["video_second_price"] == Decimal("0.05")


def test_chat_public_name_equals_upstream_model():
    for s in DEFAULT_MODELS:
        if s["type"] == "text":
            assert s["public_name"] == s["upstream_model"]


def test_video_display_and_upstream_names_match_spec():
    m = _by_name(DEFAULT_MODELS)
    assert m["veo3.1-fast"]["display_name"] == "veo3.1"
    assert m["veo3.1-fast"]["upstream_model"] == "veo3.1-fast"
    assert m["grok-imagine-1.0-video-apimart"]["display_name"] == "grok-imagine"
    assert (
        m["grok-imagine-1.0-video-apimart"]["upstream_model"]
        == "grok-imagine-1.0-video-apimart"
    )
