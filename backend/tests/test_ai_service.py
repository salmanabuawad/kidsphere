"""Service flow with a fake Claude client: accept, fall back, evidence rule. No network."""
import json
import logging
import socket
from datetime import date, datetime, timezone
from types import SimpleNamespace

import anthropic
import pytest

from app.ai import claude_provider, template_provider
from app.ai.context import build_context
from app.ai.prompts import SYSTEM_PROMPT
from app.ai.service import generate, suggest_understanding, suggest_understanding_result
from app.config import settings

try:  # anthropic 1.x uses httpx2; fall back for older SDKs
    import httpx2 as httpx_mod
except ImportError:  # pragma: no cover
    import httpx as httpx_mod

TODAY = date(2026, 10, 5)
CHILD = {"name": "Adam Haddad", "birth_date": date(2022, 8, 5), "gender": "boy", "parent_contact": "050-1"}
PROFILE = {
    "strengths": [{"key": "imagination"}, {"key": "building"}],
    "interests": [{"key": "cars_transportation"}, {"key": "animals"}],
    "what_helps": [{"key": "adult_mediation"}],
}
FOCUS = {"id": "f-1", "category": "social", "suggestion_key": "joining_group_play", "title": "Joining group play"}


class FakeClaude:
    """Stands in for anthropic.Anthropic: queue responses (dict/str/Exception), record requests."""

    def __init__(self, *responses, stop_reason="end_turn"):
        self.responses = list(responses)
        self.stop_reason = stop_reason
        self.calls: list[dict] = []
        self.messages = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        text = item if isinstance(item, str) else json.dumps(item, ensure_ascii=False)
        stop = self.stop_reason
        return SimpleNamespace(
            stop_reason=stop,
            content=[] if stop == "refusal" else [SimpleNamespace(type="text", text=text)],
            usage=SimpleNamespace(input_tokens=100, output_tokens=200),
            model=kwargs.get("model"),
        )


@pytest.fixture(autouse=True)
def _offline(monkeypatch):
    """No key, no real client, no sockets."""
    monkeypatch.setattr(settings, "anthropic_api_key", "")

    def no_client():
        raise AssertionError("a real Anthropic client must not be created in tests")

    monkeypatch.setattr(claude_provider, "make_client", no_client)

    def no_connect(*args, **kwargs):
        raise AssertionError("network access in tests")

    monkeypatch.setattr(socket.socket, "connect", no_connect)


def ctx_for(kind="story", mode="growth_support", template=None, lang="en", **kw):
    growth = mode == "growth_support"
    return build_context(child=CHILD, profile=PROFILE, mode=mode, content_type=kind, language=lang,
                         focus=FOCUS if growth else None, target_strength=None if growth else "building",
                         template=template, classmate_names=["Noa"], today=TODAY, **kw)


def valid_output(kind, ctx, template=None):
    data = template_provider.generate(kind, ctx, template)
    if kind == "pack":
        data["story"]["title"] = "From Claude"
    else:
        data["title"] = "From Claude"
    return data


@pytest.mark.parametrize("kind,template", [
    ("story", None), ("real_world_activity", None), ("video", None), ("pack", "sequence"),
    ("digital_game", "story_builder"), ("digital_game", "categorize"),
])
def test_valid_claude_output_is_accepted(kind, template):
    ctx = ctx_for(kind, template=template)
    fake = FakeClaude(valid_output(kind, ctx, template))
    result = generate(kind, ctx, client=fake)
    assert result.provider == "claude" and result.is_template is False and result.fallback_reason is None
    assert result.model == settings.anthropic_model
    assert result.title == "From Claude"
    assert len(fake.calls) == 1


def test_captured_request_shape():
    ctx = ctx_for("digital_game", template="match_pairs")
    fake = FakeClaude(valid_output("digital_game", ctx, "match_pairs"))
    generate("digital_game", ctx, client=fake)
    req = fake.calls[0]
    assert req["model"] == settings.anthropic_model == "claude-opus-5-5"
    assert req["max_tokens"] == 16000
    assert req["system"] == SYSTEM_PROMPT
    assert req["output_config"]["effort"] == settings.ai_effort == "medium"
    fmt = req["output_config"]["format"]
    assert fmt["type"] == "json_schema" and fmt["schema"]["additionalProperties"] is False
    assert "template" in fmt["schema"]["properties"]
    for absent in ("thinking", "temperature", "top_p", "betas", "fallbacks"):
        assert absent not in req
    prompt = req["messages"][0]["content"]
    assert req["messages"][0]["role"] == "user"
    assert "Haddad" not in prompt and "050-1" not in prompt and "2022" not in prompt
    assert "Growth Support" in prompt and "match_pairs" in prompt


def test_model_env_override_is_honoured(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_model", "claude-test-model")
    ctx = ctx_for()
    fake = FakeClaude(valid_output("story", ctx))
    result = generate("story", ctx, client=fake)
    assert fake.calls[0]["model"] == "claude-test-model" and result.model == "claude-test-model"


def test_key_set_uses_the_configured_client(monkeypatch):
    ctx = ctx_for()
    fake = FakeClaude(valid_output("story", ctx))
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")
    monkeypatch.setattr(claude_provider, "make_client", lambda: fake)
    assert generate("story", ctx).provider == "claude"


def test_no_key_never_calls_claude():
    result = generate("story", ctx_for())
    assert result.provider == "template" and result.fallback_reason is None


def _request():
    return httpx_mod.Request("POST", "https://api.anthropic.com/v1/messages")


def _status_error(cls, status):
    return cls("boom", response=httpx_mod.Response(status, request=_request()), body=None)


@pytest.mark.parametrize("response,stop_reason,reason", [
    ({"title": "only a title"}, "end_turn", "AI_INVALID_OUTPUT"),
    ("this is not json", "end_turn", "AI_INVALID_OUTPUT"),
    ("[1, 2]", "end_turn", "AI_INVALID_OUTPUT"),
    (None, "refusal", "AI_REFUSAL"),
    (None, "max_tokens", "AI_MAX_TOKENS"),
])
def test_invalid_output_falls_back_to_template(response, stop_reason, reason):
    ctx = ctx_for()
    fake = FakeClaude(response if response is not None else valid_output("story", ctx), stop_reason=stop_reason)
    result = generate("story", ctx, client=fake)
    assert result.provider == "template" and result.is_template is True
    assert result.fallback_reason == reason
    assert len(fake.calls) == 1  # no repair round-trip


@pytest.mark.parametrize("field,value", [
    ("teacher_note", "This may be a sign of autism."),
    ("story", ["Adam has a weakness.", "The end."]),
    ("questions", ["Visit www.example.com", "How many points did you get?"]),
])
def test_unsafe_output_falls_back(field, value):
    ctx = ctx_for()
    data = valid_output("story", ctx)
    data[field] = value
    result = generate("story", ctx, client=FakeClaude(data))
    assert result.provider == "template" and result.fallback_reason == "AI_UNSAFE_OUTPUT"


def test_wrong_game_template_falls_back():
    ctx = ctx_for("digital_game", template="sequence")
    data = valid_output("digital_game", ctx_for("digital_game", template="match_pairs"), "match_pairs")
    result = generate("digital_game", ctx, client=FakeClaude(data))
    assert result.provider == "template" and result.content["template"] == "sequence"
    assert result.fallback_reason == "AI_INVALID_OUTPUT"


@pytest.mark.parametrize("error,reason", [
    (lambda: anthropic.APITimeoutError(request=_request()), "AI_TIMEOUT"),
    (lambda: anthropic.APIConnectionError(request=_request()), "AI_UNAVAILABLE"),
    (lambda: _status_error(anthropic.RateLimitError, 429), "AI_UNAVAILABLE"),
    (lambda: _status_error(anthropic.InternalServerError, 500), "AI_UNAVAILABLE"),
    (lambda: _status_error(anthropic.BadRequestError, 400), "AI_UNAVAILABLE"),
    (lambda: RuntimeError("unexpected"), "AI_UNAVAILABLE"),
])
def test_errors_fall_back_with_reason(error, reason):
    result = generate("real_world_activity", ctx_for("real_world_activity"), client=FakeClaude(error()))
    assert result.provider == "template" and result.fallback_reason == reason


def test_log_line_has_no_prompt_text(caplog):
    ctx = ctx_for()
    with caplog.at_level(logging.INFO, logger="app.ai"):
        generate("story", ctx, client=FakeClaude(valid_output("story", ctx)))
    text = caplog.text
    assert "op=story" in text and "duration_ms=" in text and "ok=True" in text and "output_tokens" in text
    assert "Adam" not in text and "Joining group play" not in text


# --------------------------------------------------------------------------- understanding

BASE_AT = datetime(2026, 9, 1, tzinfo=timezone.utc)


def obs(i, focus="f-1", level="some_support", day=10):
    return {"id": f"o{i}", "focus_area_id": focus, "support_level": level, "context": "free_play",
            "observed_at": datetime(2026, 9, day, tzinfo=timezone.utc),
            "observation": f"Adam built with Noa ({i})"}


def u_ctx():
    return build_context(child=CHILD, profile=PROFILE, mode=None, content_type="understanding", language="en",
                         today=TODAY)


def claude_understanding(focus_status="improving", baseline_status="supported", ids=("o1",)):
    return {
        "summary": "Adam appears to be becoming more independent in initiating shared play.",
        "strengths": [{"key": "building", "label": "Building"}, {"key": "made_up", "label": "Kindness"}],
        "interests": [{"key": "cars_transportation", "label": "Cars"}],
        "what_helps": [{"key": "adult_mediation", "label": "Adult guidance"}],
        "areas_for_support": ["Starting shared play"],
        "adaptations": "Start with one friend.",
        "next_steps": "Keep inviting one friend.",
        "baseline_validation": [{"list": "strengths", "key": "building", "label": "Building",
                                 "status": baseline_status, "note": "Seen in play.", "observation_ids": list(ids)}],
        "focus_review": [{"focus_area_id": "f-1", "status": focus_status, "note": "Initiates more often."},
                         {"focus_area_id": "unknown", "status": "improving", "note": "x"}],
    }


FOCUS_AREAS = [{"id": "f-1", "category": "social", "title": "Joining group play"},
               {"id": "f-2", "category": "emotional", "title": "Calming down"}]
BASELINE = [{"list": "strengths", "key": "building", "label": "Building"}]


def test_understanding_template_with_one_observation():
    s = suggest_understanding(u_ctx(), [obs(1)], FOCUS_AREAS, BASELINE)
    assert {r.status for r in s.focus_review} == {"needs_more_observation"}
    assert s.baseline_validation[0].status == "needs_more_observation"


def test_claude_certainty_is_downgraded_with_one_observation():
    fake = FakeClaude(claude_understanding())
    result = suggest_understanding_result(u_ctx(), [obs(1)], FOCUS_AREAS, BASELINE, client=fake,
                                          classmate_names=["Noa"])
    s = result.suggestion
    assert result.provider == "claude" and result.is_template is False
    assert [(r.focus_area_id, r.status) for r in s.focus_review] == [
        ("f-1", "needs_more_observation"), ("f-2", "needs_more_observation")]
    assert s.baseline_validation[0].status == "needs_more_observation"
    assert s.strengths[1].key is None and s.strengths[1].custom == "Kindness"
    prompt = fake.calls[0]["messages"][0]["content"]
    assert "Noa" not in prompt and "[friend]" in prompt and "Haddad" not in prompt


def test_claude_status_kept_with_three_linked_observations():
    observations = [obs(1), obs(2), obs(3)]
    fake = FakeClaude(claude_understanding(ids=("o1", "o2", "o3", "o99")))
    s = suggest_understanding(u_ctx(), observations, FOCUS_AREAS, BASELINE, client=fake)
    assert s.focus_review[0].status == "improving"
    assert s.baseline_validation[0].status == "supported"
    assert s.baseline_validation[0].observation_ids == ["o1", "o2", "o3"]


def test_observations_before_the_baseline_do_not_count():
    observations = [obs(1, day=1), obs(2, day=2), obs(3, day=20)]
    observations[0]["observed_at"] = datetime(2026, 8, 1, tzinfo=timezone.utc)
    observations[1]["observed_at"] = datetime(2026, 8, 2, tzinfo=timezone.utc)
    fake = FakeClaude(claude_understanding(ids=("o1", "o2", "o3")))
    s = suggest_understanding(u_ctx(), observations, FOCUS_AREAS, BASELINE, client=fake, baseline_at=BASE_AT)
    assert s.focus_review[0].status == "needs_more_observation"
    assert s.baseline_validation[0].status == "needs_more_observation"


def test_unsafe_understanding_falls_back_to_template():
    data = claude_understanding()
    data["summary"] = "Adam may have a developmental delay."
    result = suggest_understanding_result(u_ctx(), [obs(1)], FOCUS_AREAS, BASELINE, client=FakeClaude(data))
    assert result.provider == "template" and result.fallback_reason == "AI_UNSAFE_OUTPUT"
    assert "delay" not in result.suggestion.summary


def test_understanding_timeout_falls_back():
    fake = FakeClaude(anthropic.APITimeoutError(request=_request()))
    result = suggest_understanding_result(u_ctx(), [obs(1)], FOCUS_AREAS, BASELINE, client=fake)
    assert result.is_template and result.fallback_reason == "AI_TIMEOUT"
