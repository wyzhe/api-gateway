"""tiktoken-based pessimistic estimator. Pure-function, no DB/Redis needed."""
from __future__ import annotations

from app.services.token_estimator import (
    count_message_tokens,
    count_text_tokens,
    estimate_chat_usage,
)


def test_count_text_tokens_counts_actual_text():
    n = count_text_tokens("Hello, this is a short streamed reply.", "gpt-4o")
    assert n > 0
    # A short blob lands well under any max_tokens ceiling — that's the whole
    # point of counting the streamed text instead of billing the ceiling.
    assert n < 50


def test_count_text_tokens_empty_is_zero():
    assert count_text_tokens("", "gpt-4o") == 0
    assert count_text_tokens(None, "gpt-4o") == 0  # type: ignore[arg-type]


def test_count_text_tokens_scales_with_length():
    short = count_text_tokens("one two three", "claude-sonnet-4.6")
    long = count_text_tokens("one two three " * 100, "claude-sonnet-4.6")
    assert long > short * 50


def test_count_message_tokens_text_only():
    msgs = [
        {"role": "user", "content": "Hello, world!"},
        {"role": "assistant", "content": "Hi back."},
    ]
    n = count_message_tokens(msgs, "gpt-4o")
    assert n > 0
    # Two short messages should land in single digits to low teens.
    assert n < 50


def test_count_message_tokens_multimodal_text_blocks():
    msgs = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "What is in this image?"},
                {"type": "image_url", "image_url": {"url": "https://example.com/x.png"}},
            ],
        }
    ]
    # text block contributes; image is conservatively ignored on prompt side.
    n = count_message_tokens(msgs, "gpt-5")
    assert n > 0


def test_estimate_chat_usage_uses_max_tokens_as_completion_ceiling():
    payload = {"messages": [{"role": "user", "content": "hi"}], "max_tokens": 256}
    prompt, completion, total = estimate_chat_usage(payload, "gpt-4o")
    assert completion == 256
    assert total == prompt + completion


def test_estimate_chat_usage_defaults_when_max_tokens_missing():
    payload = {"messages": [{"role": "user", "content": "hi"}]}
    prompt, completion, total = estimate_chat_usage(payload, "gpt-4o", default_max_tokens=2048)
    assert completion == 2048
    assert total == prompt + completion
