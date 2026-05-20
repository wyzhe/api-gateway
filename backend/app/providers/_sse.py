"""Shared SSE line parsing for OpenAI / Anthropic-style streaming responses.

Both APIMart and DeepSeek forward upstream SSE byte-faithfully and only parse
`data:` lines for usage extraction. This module is the single home for that
line-level parsing.
"""
from __future__ import annotations

import json

from .base import ProviderStreamChunk


def parse_sse_line(raw_line: str) -> ProviderStreamChunk:
    """Turn one decoded SSE line into a ProviderStreamChunk.

    - empty line       -> chunk boundary (b"\\n")
    - comment (`:`) line -> forwarded verbatim, not parsed
    - `data: {...}` line -> forwarded verbatim, parsed when valid JSON
      (the `[DONE]` sentinel is forwarded but not parsed)
    """
    if raw_line == "":
        return ProviderStreamChunk(raw_line=b"\n", parsed=None)
    if raw_line.startswith(":"):
        return ProviderStreamChunk(raw_line=(raw_line + "\n").encode(), parsed=None)
    parsed = None
    if raw_line.startswith("data: "):
        data_str = raw_line[6:]
        if data_str != "[DONE]":
            try:
                parsed = json.loads(data_str)
            except Exception:
                parsed = None
    return ProviderStreamChunk(raw_line=(raw_line + "\n").encode(), parsed=parsed)
