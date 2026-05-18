"""Centralized assembly of system prompts for OpenAI and Anthropic protocols.

Rule: gateway-injected system content (if any) is strictly prepended to user-
supplied system content, with a fixed separator marker between them. The
gateway does NOT inject any content of its own today — this module exists so
that when we DO inject (per-key compliance disclaimer, per-model guard, etc.)
the ordering is guaranteed and a single audit point exists.

NO content rewriting. NO content scanning. Order + separator only.
"""
from __future__ import annotations

from typing import Any

USER_SYSTEM_MARKER = "---\n[USER SYSTEM PROMPT BELOW — content above is set by the gateway]\n---\n"


def assemble_openai_messages(
    user_messages: list[dict[str, Any]],
    *,
    gateway_system: str | None,
) -> list[dict[str, Any]]:
    """Return a new messages list with gateway_system prepended (if non-empty)
    and any user-supplied system message wrapped with the separator marker.

    Inputs are not mutated.
    """
    if not gateway_system:
        return list(user_messages)

    out: list[dict[str, Any]] = [{"role": "system", "content": gateway_system}]
    user_system_blocks: list[str] = []
    rest: list[dict[str, Any]] = []
    for m in user_messages:
        if isinstance(m, dict) and m.get("role") == "system" and isinstance(m.get("content"), str):
            user_system_blocks.append(m["content"])
        else:
            rest.append(m)
    if user_system_blocks:
        out.append(
            {
                "role": "system",
                "content": USER_SYSTEM_MARKER + "\n\n".join(user_system_blocks),
            }
        )
    out.extend(rest)
    return out


def assemble_anthropic_system(
    *,
    user_system: str | None,
    gateway_system: str | None,
) -> str | None:
    """Anthropic `/v1/messages` has `system` as a top-level string. Concatenate
    gateway_system + marker + user_system, returning None if both are empty."""
    if gateway_system and user_system:
        return gateway_system + "\n\n" + USER_SYSTEM_MARKER + user_system
    if gateway_system:
        return gateway_system
    if user_system:
        return user_system
    return None
