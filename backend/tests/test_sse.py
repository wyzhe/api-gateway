"""Shared SSE line parser — pure-function tests."""
from app.providers._sse import parse_sse_line


def test_empty_line_is_chunk_boundary():
    c = parse_sse_line("")
    assert c.raw_line == b"\n"
    assert c.parsed is None


def test_comment_line_forwarded_unparsed():
    c = parse_sse_line(": keep-alive")
    assert c.raw_line == b": keep-alive\n"
    assert c.parsed is None


def test_data_line_parsed():
    c = parse_sse_line('data: {"a": 1}')
    assert c.raw_line == b'data: {"a": 1}\n'
    assert c.parsed == {"a": 1}


def test_done_sentinel_forwarded_unparsed():
    c = parse_sse_line("data: [DONE]")
    assert c.raw_line == b"data: [DONE]\n"
    assert c.parsed is None


def test_malformed_json_forwarded_unparsed():
    c = parse_sse_line("data: {not json}")
    assert c.raw_line == b"data: {not json}\n"
    assert c.parsed is None
