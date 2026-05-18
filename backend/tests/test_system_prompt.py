from app.services.system_prompt import assemble_openai_messages, assemble_anthropic_system


def test_openai_passthrough_when_no_gateway_system():
    user_msgs = [
        {"role": "system", "content": "you are a pirate"},
        {"role": "user", "content": "hello"},
    ]
    out = assemble_openai_messages(user_msgs, gateway_system=None)
    assert out == user_msgs


def test_openai_prepends_gateway_system_and_separates_user_system():
    user_msgs = [
        {"role": "system", "content": "you are a pirate"},
        {"role": "user", "content": "hello"},
    ]
    out = assemble_openai_messages(user_msgs, gateway_system="GATEWAY: no PII")
    assert len(out) == 3
    assert out[0]["role"] == "system"
    assert out[0]["content"] == "GATEWAY: no PII"
    assert out[1]["role"] == "system"
    assert "USER SYSTEM PROMPT BELOW" in out[1]["content"]
    assert "you are a pirate" in out[1]["content"]
    assert out[2]["role"] == "user"
    assert out[2]["content"] == "hello"


def test_openai_no_user_system_no_separator():
    user_msgs = [{"role": "user", "content": "hi"}]
    out = assemble_openai_messages(user_msgs, gateway_system="GATEWAY: rule")
    assert len(out) == 2
    assert out[0]["content"] == "GATEWAY: rule"
    assert out[1] == {"role": "user", "content": "hi"}


def test_anthropic_passthrough_when_no_gateway_system():
    assert assemble_anthropic_system(user_system="be brief", gateway_system=None) == "be brief"
    assert assemble_anthropic_system(user_system=None, gateway_system=None) is None


def test_anthropic_concatenates_with_marker():
    out = assemble_anthropic_system(user_system="be brief", gateway_system="GATEWAY: no PII")
    assert out.startswith("GATEWAY: no PII")
    assert "USER SYSTEM PROMPT BELOW" in out
    assert "be brief" in out
    assert out.index("GATEWAY: no PII") < out.index("be brief")


def test_anthropic_only_gateway_system():
    out = assemble_anthropic_system(user_system=None, gateway_system="GATEWAY: rule")
    assert out == "GATEWAY: rule"


def test_openai_empty_messages_with_gateway_system():
    out = assemble_openai_messages([], gateway_system="GATEWAY: only-rule")
    assert out == [{"role": "system", "content": "GATEWAY: only-rule"}]


def test_openai_multiple_user_system_messages_joined():
    user_msgs = [
        {"role": "system", "content": "rule A"},
        {"role": "system", "content": "rule B"},
        {"role": "user", "content": "hi"},
    ]
    out = assemble_openai_messages(user_msgs, gateway_system="GATEWAY: top")
    assert len(out) == 3
    assert out[0] == {"role": "system", "content": "GATEWAY: top"}
    assert out[1]["role"] == "system"
    # both user system blocks present, in order, joined with blank line
    content = out[1]["content"]
    assert "rule A" in content
    assert "rule B" in content
    assert content.index("rule A") < content.index("rule B")
    assert "\n\nrule B" in content or "rule A\n\nrule B" in content
    assert out[2] == {"role": "user", "content": "hi"}
