"""tiktoken-based pessimistic estimator. Pure-function, no DB/Redis needed."""
from __future__ import annotations

from app.services.token_estimator import count_message_tokens, estimate_chat_usage


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
