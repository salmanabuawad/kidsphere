"""AI engines (0006): contracts, configuration, the orchestrator (not configured, retries,
fallback, validation, safety, moderation, cost limits, credentials), privacy of the child
context, the mock provider for every engine, pipelines, the API and the admin view."""
import json
import os
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import inspect, select, text, update
from sqlalchemy.exc import DBAPIError

from app.ai.engines import ENGINE_KEYS, ENGINES, EngineRequest, LanguageSpec, engines, orchestrator, providers, run
from app.ai.engines.contracts import ProviderBinary, ProviderResponse, Usage
from app.ai.engines.interfaces import ProviderAdapter, ProviderError
from app.config import settings
from app.db import engine as db_engine
from app.models import AiAsset, AiEngineConfig, AiPromptTemplate, AiRequest, AiRequestEvent, AuditLog
from tests.conftest import alembic_config

ALL_KINDS = frozenset({"structured", "text", "image", "video", "audio", "transcript", "embedding"})
STORY = {"title": "A lion", "pages": [{"text": "The lion builds."}, {"text": "Everyone smiles."}], "questions": []}


@pytest.fixture(autouse=True)
def _clean_ai_env(monkeypatch):
    for key in list(os.environ):
        if key.startswith("AI_") and key != "AI_EFFORT" and key != "AI_TIMEOUT_SECONDS":
            monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(settings, "ai_mock_mode", False)


@pytest.fixture
def mock_mode(monkeypatch):
    monkeypatch.setattr(settings, "ai_mock_mode", True)


class Scripted:
    """A test adapter: answers from a queue (dict output, ProviderResponse or exception)."""

    def __init__(self, name, *answers, needs_secret=False):
        self.name = name
        self.output_kinds = ALL_KINDS
        self.answers = list(answers)
        self.needs_secret = needs_secret
        self.calls = []

    def invoke(self, call, secret):
        self.calls.append((call, secret))
        a = self.answers.pop(0)
        if isinstance(a, Exception):
            raise a
        return a if isinstance(a, ProviderResponse) else ProviderResponse(output=a, model="scripted-1")

    def poll(self, job_id, call, secret):
        return self.invoke(call, secret)


@pytest.fixture
def adapter(monkeypatch):
    def add(name, *answers, **kw):
        a = Scripted(name, *answers, **kw)
        monkeypatch.setitem(providers.ADAPTERS, name, a)
        return a

    return add


def configure(db, engine, **fields):
    row = db.get(AiEngineConfig, engine) or AiEngineConfig(engine=engine)
    for k, v in fields.items():
        setattr(row, k, v)
    db.add(row)
    db.commit()


def story_req(**over):
    base = {"engine": "story", "task": "generate", "input": {"goal": "Asking for help", "topic": "a lion"}}
    return EngineRequest(**{**base, **over})


# --------------------------------------------------------------------------- catalog / contracts


def test_catalog_has_the_21_engines_and_no_vendor_names():
    assert len(ENGINE_KEYS) == 21
    assert set(ENGINE_KEYS) == {
        "reasoning", "child_understanding", "observation_analysis", "recommendation", "content_generation", "story",
        "character", "image_generation", "video_animator", "voice", "speech_recognition", "music", "sound_effects",
        "vision", "embedding", "classification", "translation", "safety_moderation", "personalization",
        "progress_analysis", "orchestration"}
    for spec in ENGINES.values():
        spec.input_model.model_validate(spec.sample)
        assert spec.output_model is not None and spec.tasks
    root = Path(__file__).resolve().parents[1] / "app" / "ai" / "engines"
    core = "".join((root / f).read_text(encoding="utf-8").lower()
                   for f in ("catalog.py", "contracts.py", "interfaces.py", "orchestrator.py", "config.py",
                             "validation.py", "pipelines.py", "facade.py"))
    for vendor in ("openai", "anthropic", "claude", "gemini", "elevenlabs", "runway", "toonbee", "hugging"):
        assert vendor not in core, vendor


def test_language_spec_derives_direction_and_locale():
    assert LanguageSpec(language="he").direction == "rtl"
    assert LanguageSpec(language="ar").direction == "rtl"
    assert LanguageSpec(language="en").direction == "ltr"
    assert LanguageSpec(language="fr", locale="fr-CA").locale == "fr-CA"


# --------------------------------------------------------------------------- not configured / config


def test_unconfigured_engine_returns_engine_not_configured_and_is_traced(db, teacher):
    result = run(db, teacher, story_req())
    db.commit()
    assert result.success is False and result.status == "not_configured" and result.output is None
    assert result.error.code == "ENGINE_NOT_CONFIGURED" and result.provider is None
    row = db.get(AiRequest, result.request_id)
    assert row.status == "not_configured" and row.error_code == "ENGINE_NOT_CONFIGURED"
    assert row.input["input"]["goal"] == "Asking for help" and len(row.input_hash) == 64


def test_environment_configures_an_engine_and_can_switch_it_off(db, teacher, monkeypatch):
    monkeypatch.setenv("AI_STORY_PROVIDER", "mock")
    monkeypatch.setenv("AI_STORY_MODEL", "mock-story-2")
    result = run(db, teacher, story_req())
    assert result.success and result.provider == "mock" and result.model == "mock-story-2"
    monkeypatch.setenv("AI_STORY_ENABLED", "false")
    assert run(db, teacher, story_req()).error.code == "ENGINE_DISABLED"


def test_admin_override_beats_the_environment(db, teacher, monkeypatch, adapter):
    monkeypatch.setenv("AI_STORY_PROVIDER", "mock")
    adapter("other", STORY)
    configure(db, "story", provider="other")
    result = run(db, teacher, story_req())
    assert result.provider == "other" and result.success


def test_unknown_provider_input_and_task_are_clean_results(db, teacher, mock_mode):
    configure(db, "story", provider="nobody")
    assert run(db, teacher, story_req()).error.code == "PROVIDER_NOT_AVAILABLE"
    bad = run(db, teacher, story_req(input={"topic": "no goal"}))
    assert bad.status == "rejected" and bad.error.code == "INVALID_INPUT" and bad.validation.issues
    assert run(db, teacher, story_req(task="paint")).error.code == "UNSUPPORTED_TASK"
    assert run(db, teacher, EngineRequest(engine="telepathy", task="x")).error.code == "UNKNOWN_ENGINE"


# --------------------------------------------------------------------------- mock provider: every engine


@pytest.mark.parametrize("key", ENGINE_KEYS)
def test_mock_provider_follows_every_engine_contract(db, teacher, mock_mode, key, _upload_dir):
    spec = ENGINES[key]
    result = run(db, teacher, EngineRequest(engine=key, task=spec.tasks[0], input=spec.sample))
    db.commit()
    if spec.long_running:
        assert result.status == "pending" and result.provider == "mock"
        row = db.get(AiRequest, result.request_id)
        result = orchestrator.poll(db, teacher, row)
        db.commit()
    assert result.success, (key, result.error, result.validation)
    assert result.provider == "mock" and result.model == "mock-1"
    spec.output_model.model_validate(result.output)
    assert result.validation.schema_ok and result.validation.safety_ok
    if spec.output_kind in ("image", "audio", "video"):
        assert result.assets and all(a.url.startswith("/api/ai/assets/") for a in result.assets)
        stored = db.scalars(select(AiAsset).where(AiAsset.request_id == result.request_id)).all()
        assert all((_upload_dir / s.path).is_file() for s in stored)


def test_mock_answers_in_the_requested_language(db, teacher, mock_mode):
    result = run(db, teacher, story_req(language=LanguageSpec(language="he")))
    assert "היה היה פעם" in result.output["pages"][0]["text"]
    row = db.get(AiRequest, result.request_id)
    assert row.language == "he" and row.input["language"]["direction"] == "rtl"


# --------------------------------------------------------------------------- failures, retries, fallback


def test_retryable_failures_retry_then_fall_back(db, teacher, adapter):
    flaky = adapter("flaky", ProviderError("PROVIDER_TIMEOUT", retryable=True), ProviderError("PROVIDER_TIMEOUT", retryable=True))
    adapter("backup", STORY)
    configure(db, "story", provider="flaky", max_retries=1, fallback_provider="backup", fallback_model="b-1")
    result = run(db, teacher, story_req())
    db.commit()
    assert result.success and result.fallback_used and result.provider == "backup" and result.model == "scripted-1"
    assert len(flaky.calls) == 2
    kinds = [e.kind for e in db.scalars(select(AiRequestEvent).where(AiRequestEvent.request_id == result.request_id)
                                        .order_by(AiRequestEvent.id))]
    assert kinds == ["started", "attempt", "provider_error", "attempt", "provider_error", "fallback", "attempt", "succeeded"]


def test_permanent_failure_is_reported_never_faked(db, teacher, adapter):
    adapter("broken", ProviderError("PROVIDER_ERROR", "bad request", retryable=False))
    adapter("backup", STORY)
    configure(db, "story", provider="broken", max_retries=3, fallback_provider="backup")
    result = run(db, teacher, story_req())
    assert result.success is False and result.status == "failed" and result.output is None
    assert result.error.code == "PROVIDER_ERROR" and result.error.retryable is False and not result.fallback_used
    assert db.get(AiRequest, result.request_id).attempts == 1


def test_an_adapter_crash_never_takes_kidsphere_down(db, teacher, adapter):
    adapter("buggy", RuntimeError("boom"), RuntimeError("boom"))
    configure(db, "story", provider="buggy", max_retries=1)
    result = run(db, teacher, story_req())
    assert result.status == "failed" and result.error.code == "PROVIDER_ERROR" and result.error.retryable


# --------------------------------------------------------------------------- validation, safety, moderation


def test_output_that_breaks_the_contract_is_not_shown(db, teacher, adapter):
    adapter("sloppy", {"title": "x", "pages": []})
    configure(db, "story", provider="sloppy")
    result = run(db, teacher, story_req())
    assert result.error.code == "INVALID_OUTPUT" and result.output is None
    assert any(i.startswith("schema:") for i in result.validation.issues)


def test_unsafe_output_is_refused_and_html_is_sanitized(db, teacher, adapter):
    adapter("clinical", {**STORY, "pages": [{"text": "A diagnosis of the lion."}, {"text": "The end."}]})
    configure(db, "story", provider="clinical")
    bad = run(db, teacher, story_req())
    assert bad.error.code == "UNSAFE_OUTPUT" and bad.output is None

    adapter("html", {**STORY, "title": "<b>A lion</b><script>x</script>"})
    configure(db, "story", provider="html")
    ok = run(db, teacher, story_req())
    assert ok.success and ok.output["title"] == "A lionx" and ok.validation.sanitized


def test_child_facing_output_goes_through_the_moderation_engine(db, teacher, adapter):
    adapter("teller", STORY, STORY)
    adapter("guard", {"allowed": True, "issues": []}, {"allowed": False, "issues": ["too scary"]})
    configure(db, "story", provider="teller")
    configure(db, "safety_moderation", provider="guard")
    ok = run(db, teacher, story_req())
    assert ok.success and ok.validation.moderated_by_engine
    no = run(db, teacher, story_req())
    assert no.error.code == "MODERATION_REJECTED" and no.output is None
    child_reqs = db.scalars(select(AiRequest).where(AiRequest.engine == "safety_moderation")).all()
    assert len(child_reqs) == 2 and all(r.parent_request_id for r in child_reqs)


# --------------------------------------------------------------------------- cost, credentials, templates


def test_daily_cost_limit(db, teacher, adapter):
    adapter("paid", ProviderResponse(output=STORY, usage=Usage(input_units=100, output_units=100, unit="tokens")))
    configure(db, "story", provider="paid", unit_cost=0.01, daily_cost_limit=1.5)
    first = run(db, teacher, story_req())
    db.commit()
    assert first.success and first.usage.cost_estimate == pytest.approx(2.0)
    assert run(db, teacher, story_req()).error.code == "COST_LIMIT_REACHED"


def test_credentials_are_read_by_reference_and_never_stored(db, teacher, admin_client, adapter, monkeypatch):
    secure = adapter("secure", STORY, STORY, needs_secret=True)
    configure(db, "story", provider="secure", credentials_ref="AI_CRED_STORY")
    assert run(db, teacher, story_req()).error.code == "CREDENTIALS_MISSING"
    monkeypatch.setenv("AI_CRED_STORY", "top-secret-value-123")
    result = run(db, teacher, story_req())
    db.commit()
    assert result.success and secure.calls[-1][1] == "top-secret-value-123"
    dump = json.dumps([r.input | {"o": r.output} for r in db.scalars(select(AiRequest))], default=str)
    listing = admin_client.get("/api/admin/ai/engines").text
    assert "top-secret-value-123" not in dump and "top-secret-value-123" not in listing
    story = next(e for e in admin_client.get("/api/admin/ai/engines").json()["engines"] if e["engine"] == "story")
    assert story["config"]["credentials_ref"] == "AI_CRED_STORY" and story["config"]["credentials_set"] is True
    # An engine can never be pointed at another server secret.
    assert admin_client.put("/api/admin/ai/engines/story", json={"credentials_ref": "DATABASE_URL"}).status_code == 400


def test_the_active_prompt_template_is_passed_and_traced(db, teacher, adapter):
    teller = adapter("teller", STORY)
    configure(db, "story", provider="teller")
    t1 = AiPromptTemplate(engine="story", task="generate", language="ar", version=1, body="Old", active=True)
    t2 = AiPromptTemplate(engine="story", task="generate", language="ar", version=2, body="Write gently.", active=True)
    db.add_all([t1, t2])
    db.commit()
    result = run(db, teacher, story_req())
    assert teller.calls[0][0].instructions == "Write gently."
    assert db.get(AiRequest, result.request_id).template_id == t2.id


# --------------------------------------------------------------------------- privacy


def test_the_child_context_is_pseudonymous(db, teacher_client, child, adapter, make_observation):
    teller = adapter("teller", STORY)
    configure(db, "story", provider="teller")
    child.preferred_name = "Adam"
    db.commit()
    r = teacher_client.post("/api/ai/run", json={"engine": "story", "task": "generate", "child_id": str(child.id),
                                                 "input": {"goal": "Asking for help"}})
    assert r.status_code == 200 and r.json()["success"], r.text
    call = teller.calls[0][0]
    sent = json.dumps(call.model_dump(mode="json"), ensure_ascii=False)
    for secret in (str(child.id), child.name, "Adam", child.birth_date.isoformat()):
        assert secret not in sent
    assert call.context["child"] == "[child]" and call.context["child_ref"].startswith("c-")
    row = db.get(AiRequest, r.json()["request_id"])
    assert row.child_id == child.id and row.context_version
    stored = json.dumps(row.input, ensure_ascii=False)
    assert "Adam" not in stored and str(child.id) not in stored


# --------------------------------------------------------------------------- API and access


def test_api_access_rules(db, teacher_client, parent_client, other_teacher_client, admin_client, client, child, mock_mode):
    body = {"engine": "image_generation", "task": "generate", "child_id": str(child.id),
            "input": {"prompt": "A lion and blocks"}}
    assert client.post("/api/ai/run", json=body).status_code == 401
    assert parent_client.post("/api/ai/run", json=body).status_code == 403
    assert other_teacher_client.post("/api/ai/run", json=body).status_code == 404
    r = teacher_client.post("/api/ai/run", json=body)
    assert r.status_code == 200 and r.json()["success"]
    rid, asset = r.json()["request_id"], r.json()["assets"][0]
    assert teacher_client.get(f"/api/ai/requests/{rid}").json()["status"] == "succeeded"
    assert other_teacher_client.get(f"/api/ai/requests/{rid}").status_code == 404
    got = teacher_client.get(asset["url"])
    assert got.status_code == 200 and got.headers["content-type"] == "image/png"
    assert got.headers["cache-control"] == "private, no-store"
    assert other_teacher_client.get(asset["url"]).status_code == 404
    assert parent_client.get(asset["url"]).status_code == 404
    for path in ("/api/admin/ai/engines", "/api/admin/ai/requests"):
        assert teacher_client.get(path).status_code == 403
    avail = teacher_client.get("/api/ai/engines").json()["engines"]
    assert len(avail) == 21 and all(e["available"] for e in avail)


def test_admin_view_update_and_test(db, admin_client, admin):
    data = admin_client.get("/api/admin/ai/engines").json()
    assert len(data["engines"]) == 21 and data["providers"] == ["mock"] and data["mock_mode"] is False
    video = next(e for e in data["engines"] if e["engine"] == "video_animator")
    assert video["status"] == "not_configured" and video["config"]["provider"] is None and video["long_running"]

    r = admin_client.post("/api/admin/ai/engines/video_animator/test")
    assert r.json()["error"]["code"] == "ENGINE_NOT_CONFIGURED"

    r = admin_client.put("/api/admin/ai/engines/recommendation", json={"provider": "mock", "model": "m-2",
                                                                      "timeout_seconds": 30, "daily_cost_limit": 5})
    assert r.status_code == 200, r.text
    rec = r.json()["engine"]
    assert rec["status"] == "mock" and rec["config"]["model"] == "m-2" and rec["config"]["source"] == "database"
    test = admin_client.post("/api/admin/ai/engines/recommendation/test").json()
    assert test["success"] and test["provider"] == "mock"
    after = next(e for e in admin_client.get("/api/admin/ai/engines").json()["engines"] if e["engine"] == "recommendation")
    assert after["usage_30d"]["succeeded"] == 1 and after["last_success_at"]

    assert admin_client.put("/api/admin/ai/engines/recommendation", json={"model": None}).json()["engine"]["config"]["model"] is None
    assert admin_client.put("/api/admin/ai/engines/recommendation", json={"endpoint": "http://plain"}).status_code == 400
    assert admin_client.put("/api/admin/ai/engines/telepathy", json={"enabled": True}).status_code == 404
    audit_rows = db.scalars(select(AuditLog).where(AuditLog.action == "ai_engine.update")).all()
    assert audit_rows and all(set(a.meta) == {"engine", "fields"} for a in audit_rows)
    reqs = admin_client.get("/api/admin/ai/requests?engine=recommendation").json()["requests"]
    assert reqs and "input" not in reqs[0] and "output" not in reqs[0]

    # A failed request shows as the engine's last error.
    admin_client.put("/api/admin/ai/engines/story", json={"provider": "mock"})
    db.add(AiRequest(engine="story", task="generate", status="failed", language="en", input_hash="x",
                     error_code="PROVIDER_ERROR"))
    db.commit()
    story = next(e for e in admin_client.get("/api/admin/ai/engines").json()["engines"] if e["engine"] == "story")
    assert story["last_error"]["code"] == "PROVIDER_ERROR"


# --------------------------------------------------------------------------- pipelines and facade


def test_activity_pipeline_chains_engines_for_teacher_review(teacher_client, child, mock_mode, db):
    r = teacher_client.post("/api/ai/pipelines/activity_for_goal", json={"child_id": str(child.id),
                                                                        "input": {"goal": "Taking turns"}})
    data = r.json()
    assert r.status_code == 200 and data["status"] == "succeeded", data
    assert [s["engine"] for s in data["steps"]] == ["recommendation", "content_generation"]
    rows = db.scalars(select(AiRequest).where(AiRequest.pipeline_id == data["pipeline_id"])).all()
    steps = [r for r in rows if r.engine != "safety_moderation"]  # moderation reviews ride along
    assert len(steps) == 2 and all(r.child_id == child.id for r in steps)
    assert teacher_client.post("/api/ai/pipelines/nothing", json={}).status_code == 404


def test_cartoon_pipeline_waits_for_the_video(teacher_client, child, mock_mode):
    data = teacher_client.post("/api/ai/pipelines/personalized_cartoon", json={
        "child_id": str(child.id), "input": {"goal": "Asking for help", "topic": "a lion", "characters": ["lion"]}}).json()
    engines_run = [s["engine"] for s in data["steps"]]
    assert engines_run[0] == "story" and "character" in engines_run and "image_generation" in engines_run
    assert "video_animator" in engines_run and engines_run[-1] == "voice"
    assert data["status"] == "pending"
    video = next(s for s in data["steps"] if s["engine"] == "video_animator")
    done = teacher_client.get(f"/api/ai/requests/{video['request_id']}").json()
    assert done["status"] == "succeeded" and done["assets"][0]["mime"] == "application/json"


def test_pipeline_stops_cleanly_when_an_engine_is_not_configured(teacher_client):
    data = teacher_client.post("/api/ai/pipelines/activity_for_goal", json={"input": {"goal": "Taking turns"}}).json()
    assert data["status"] == "not_configured" and len(data["steps"]) == 1
    assert data["steps"][0]["error"]["code"] == "ENGINE_NOT_CONFIGURED"


def test_facade_implements_the_engine_interfaces(db, teacher, mock_mode):
    ai = engines(db, teacher)
    assert ai.story.generate_story("Asking for help", topic="a lion").success
    assert ai.translation.translate("Well done!", "ar").output["language"] == "ar"
    assert ai.embedding.embed(["blocks", "cars"]).output["dimensions"] == 16
    assert ai.classification.classify(["Shared the blocks."], "observation_domains").output["results"][0]["labels"] == ["social"]
    assert isinstance(providers.ADAPTERS["mock"], ProviderAdapter)


# --------------------------------------------------------------------------- database


def test_execution_log_is_append_only(db, teacher, mock_mode):
    result = run(db, teacher, story_req())
    db.commit()
    with pytest.raises(DBAPIError, match="append-only"):
        db.execute(update(AiRequestEvent).where(AiRequestEvent.request_id == result.request_id).values(kind="x"))
    db.rollback()
    db.execute(text("DELETE FROM ai_requests WHERE id = :id"), {"id": result.request_id})
    db.commit()
    assert db.scalar(select(AiRequestEvent.id).where(AiRequestEvent.request_id == result.request_id)) is None


def test_migration_0006_up_and_down():
    try:
        command.downgrade(alembic_config(), "0005")
        db_engine.dispose()
        insp = inspect(db_engine)
        assert not {"ai_requests", "ai_engine_configs", "ai_assets"} & set(insp.get_table_names())
        assert "ai_request_id" not in {c["name"] for c in insp.get_columns("generated_content")}
    finally:
        command.upgrade(alembic_config(), "head")
        db_engine.dispose()
    insp = inspect(db_engine)
    assert {"ai_requests", "ai_request_events", "ai_engine_configs", "ai_assets", "ai_prompt_templates",
            "ai_characters"} <= set(insp.get_table_names())
    assert "ai_request_id" in {c["name"] for c in insp.get_columns("generated_content")}
    assert not {c["name"] for c in insp.get_columns("ai_engine_configs")} & {"api_key", "secret", "credentials"}
