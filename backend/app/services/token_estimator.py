"""tiktoken-based token counting for the gateway.

Two distinct jobs (cl100k_base by default; o200k_base for newer GPT-5/GPT-4o
families):

- `estimate_chat_usage` / `estimate_anthropic_messages_usage` — pre-call
  *upper bound* (prompt count + `max_tokens` ceiling). Feeds the monthly-cap
  spend reservation only; never the final bill.
- `count_text_tokens` — counts a finished text blob. The streaming billing
  fallback uses it on the *actual relayed output* when upstream omits `usage`,
  so the bill reflects what was generated, not the `max_tokens` ceiling.
"""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

import tiktoken

# Models that ship o200k_base instead of cl100k_base. Add as needed.
_O200K_PREFIXES = ("gpt-4o", "gpt-4.1", "gpt-5", "o1", "o3", "o4")


def _encoder_for_model(public_or_upstream_name: str) -> tiktoken.Encoding:
    name = (public_or_upstream_name or "").lower()
    if any(name.startswith(p) for p in _O200K_PREFIXES):
        return _get_encoding("o200k_base")
    return _get_encoding("cl100k_base")


@lru_cache(maxsize=4)
def _get_encoding(name: str) -> tiktoken.Encoding:
    return tiktoken.get_encoding(name)


def count_message_tokens(messages: list[dict[str, Any]], model_name: str) -> int:
    """Approximation that matches OpenAI's documented overhead (~4 tokens per
    message + a couple for the role/name + 2 priming tokens). Good enough for a
    pessimistic upper bound."""
    enc = _encoder_for_model(model_name)
    total = 0
    for msg in messages or []:
        total += 4
        for k, v in msg.items():
            if k == "name":
                total += 1
            if isinstance(v, str):
                total += len(enc.encode(v))
            elif isinstance(v, list):
                # Multimodal content blocks: count any string fields. Image/audio
                # token costs are model-specific — we conservatively skip them
                # for the prompt-side estimate (still upward-biased on output).
                for block in v:
                    if isinstance(block, dict):
                        text = block.get("text")
                        if isinstance(text, str):
                            total += len(enc.encode(text))
            else:
                total += len(enc.encode(json.dumps(v, ensure_ascii=False)))
    total += 2  # priming
    return total


def count_text_tokens(text: str, model_name: str) -> int:
    """Token count of a single text blob with the model-appropriate encoding.

    Used by the streaming fallback: when upstream omits `usage`, the gateway
    has still relayed every output delta, so it joins them and counts here for
    an accurate completion-token figure (rather than the `max_tokens` ceiling).
    """
    if not text:
        return 0
    return len(_encoder_for_model(model_name).encode(text))


def estimate_chat_usage(
    payload: dict[str, Any],
    model_name: str,
    default_max_tokens: int = 4096,
) -> tuple[int, int, int]:
    """Returns (prompt_tokens, completion_tokens_upper_bound, total_tokens)."""
    messages = payload.get("messages") or []
    prompt = count_message_tokens(messages, model_name)
    completion = (
        int(payload.get("max_tokens") or payload.get("max_completion_tokens") or default_max_tokens)
    )
    if completion <= 0:
        completion = default_max_tokens
    return prompt, completion, prompt + completion


def estimate_anthropic_messages_usage(
    payload: dict[str, Any],
    model_name: str,
    default_max_tokens: int = 4096,
) -> tuple[int, int, int]:
    """Pessimistic input/output token estimate for /v1/messages.

    Differences from OpenAI chat: `system` is a top-level string/list, not a
    message; tools live in `tools`. We count the system content + messages +
    serialized tool definitions on the prompt side, and use `max_tokens` (or
    default) as the upper bound for the completion.

    Anthropic doesn't publish their tokenizer; cl100k_base is an over-estimate
    against most empirical mappings (Anthropic's tokenizer is generally more
    aggressive on common English words), which is the right side to err on for
    a billing safety bound.
    """
    msgs: list[dict[str, Any]] = []

    system = payload.get("system")
    if isinstance(system, str) and system:
        msgs.append({"role": "system", "content": system})
    elif isinstance(system, list):
        for blk in system:
            if isinstance(blk, dict) and isinstance(blk.get("text"), str):
                msgs.append({"role": "system", "content": blk["text"]})

    for m in payload.get("messages") or []:
        if isinstance(m, dict):
            msgs.append(m)

    tools = payload.get("tools")
    if isinstance(tools, list) and tools:
        # Tool definitions count toward prompt. Serialize and pass through the
        # tokenizer rather than counting structurally.
        msgs.append({"role": "system", "content": json.dumps(tools, ensure_ascii=False)})

    prompt = count_message_tokens(msgs, model_name)
    completion = int(payload.get("max_tokens") or default_max_tokens)
    if completion <= 0:
        completion = default_max_tokens
    return prompt, completion, prompt + completion
