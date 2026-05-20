"""Default model catalogue — pure-function assertions on seed.py constants.
No DB needed; these check the catalogue shape directly."""
from decimal import Decimal

from app.seed import DEFAULT_MODELS, DISABLE_ON_BOOT, RETARGET_ON_BOOT


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
    assert (m["claude-sonnet-4.6"]["input_price"], m["claude-sonnet-4.6"]["output_price"]) == (
        Decimal("3.0"),
        Decimal("15.0"),
    )


def test_new_chat_models_cache_prices():
    m = _by_name(DEFAULT_MODELS)
    # OpenAI / Gemini: no separate cache-write fee, only a cache-read price.
    assert m["gpt-5.5"]["cache_write_price"] is None
    assert m["gpt-5.5"]["cache_read_price"] == Decimal("0.50")
    assert m["gemini-3.1-pro"]["cache_write_price"] is None
    assert m["gemini-3.1-pro"]["cache_read_price"] == Decimal("0.20")
    assert m["gemini-3.5-flash"]["cache_write_price"] is None
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


def test_chat_upstream_models_match_apimart_ids():
    """upstream_model must be APIMart's exact model id (verified against
    GET /v1/models). It differs from public_name — APIMart hyphenates Anthropic
    version numbers and suffixes Gemini 3.1 Pro with -preview. Do not assume
    public_name == upstream_model."""
    m = _by_name(DEFAULT_MODELS)
    assert m["gpt-5.5"]["upstream_model"] == "gpt-5.5"
    assert m["claude-opus-4.7"]["upstream_model"] == "claude-opus-4-7"
    assert m["claude-sonnet-4.6"]["upstream_model"] == "claude-sonnet-4-6"
    assert m["gemini-3.1-pro"]["upstream_model"] == "gemini-3.1-pro-preview"
    assert m["gemini-3.5-flash"]["upstream_model"] == "gemini-3.5-flash"


def test_video_display_and_upstream_names_match_spec():
    m = _by_name(DEFAULT_MODELS)
    assert m["veo3.1-fast"]["display_name"] == "veo3.1"
    assert m["veo3.1-fast"]["upstream_model"] == "veo3.1-fast"
    assert m["grok-imagine-1.0-video-apimart"]["display_name"] == "grok-imagine"
    assert (
        m["grok-imagine-1.0-video-apimart"]["upstream_model"]
        == "grok-imagine-1.0-video-apimart"
    )


def test_all_price_fields_are_decimal():
    """CLAUDE.md invariant #1: money is always Decimal, never float/int.
    Decimal("5") == 5 is True in Python, so value assertions alone would not
    catch a bare int/float slipping into a price field — this pins the type."""
    money_keys = {
        "input_price",
        "output_price",
        "cache_write_price",
        "cache_read_price",
        "image_price",
        "video_second_price",
        "generation_price",
    }
    for s in DEFAULT_MODELS:
        for k in money_keys & s.keys():
            if s[k] is not None:
                assert isinstance(s[k], Decimal), f"{s['public_name']}.{k} is {type(s[k])}"


def test_retarget_on_boot_corrects_legacy_upstream():
    """Existing prod rows seeded with a wrong APIMart upstream_model get
    corrected on boot. claude-sonnet-4.6 was seeded with the dotted id;
    APIMart's actual id is the hyphenated claude-sonnet-4-6."""
    assert RETARGET_ON_BOOT == {"claude-sonnet-4.6": "claude-sonnet-4-6"}
    # every retarget target must match the catalogue's own upstream_model
    m = _by_name(DEFAULT_MODELS)
    for public_name, upstream in RETARGET_ON_BOOT.items():
        if public_name in m:
            assert m[public_name]["upstream_model"] == upstream


def test_model_statuses_match_spec():
    """Only the grok-imagine *image* row is seeded disabled. Every other
    catalogue model omits the `status` key, defaulting to active — this guards
    against a regression that flips grok-imagine active or seeds a new model
    disabled by accident."""
    m = _by_name(DEFAULT_MODELS)
    assert m["grok-imagine"].get("status") == "disabled"
    for name, spec in m.items():
        if name != "grok-imagine":
            assert "status" not in spec, f"{name} unexpectedly sets a status key"
