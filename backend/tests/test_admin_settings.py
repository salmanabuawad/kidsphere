"""Admin settings (GET/PUT /api/admin/settings, POST /api/admin/settings/ai/test) and
GET /api/admin/system: admin-only access, the write-only API key, key precedence and the
template mode, the connection test with a fake client, migration 0003, the system shape."""
import json
import logging
from types import SimpleNamespace

import anthropic
import pytest
from alembic import command
from sqlalchemy import inspect, select, text

from app.ai import claude_provider
from app.ai.service import generate
from app.config import settings
from app.db import engine
from app.models import AppSetting, AuditLog
from app.services import settings as app_settings
from tests.conftest import alembic_config
from tests.test_ai_service import FakeClaude, _status_error, ctx_for, valid_output

SAVED_KEY = "sk-ant-api03-saved-key-ABCD1234"
ENV_KEY = "sk-ant-api03-env-key-ZZZZ9999"


def put(client, section, body):
    return client.put(f"/api/admin/settings/{section}", json=body)


def audits(db, action="settings.update"):
    db.expire_all()
    return list(db.scalars(select(AuditLog).where(AuditLog.action == action).order_by(AuditLog.id)))


# --------------------------------------------------------------------------- access


@pytest.mark.parametrize("who", ["teacher_client", "parent_client"])
@pytest.mark.parametrize("method,url,body", [
    ("get", "/api/admin/settings", None),
    ("put", "/api/admin/settings/general", {"organization_name": "X"}),
    ("put", "/api/admin/settings/ai", {"provider_mode": "template"}),
    ("post", "/api/admin/settings/ai/test", None),
    ("get", "/api/admin/system", None),
])
def test_non_admins_get_403(request, who, method, url, body):
    client = request.getfixturevalue(who)
    r = client.request(method.upper(), url, json=body)
    assert r.status_code == 403, r.text
    assert r.json()["error"]["code"] == "FORBIDDEN"


def test_anonymous_gets_401(client):
    assert client.get("/api/admin/settings").status_code == 401
    assert client.get("/api/admin/system").status_code == 401


# --------------------------------------------------------------------------- defaults and updates


def test_defaults(admin_client, monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    r = admin_client.get("/api/admin/settings")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["general"] == {"organization_name": "KidSphere", "default_ui_language": settings.default_locale,
                               "default_content_language": "child"}
    assert data["ai"] == {"provider_mode": "claude", "model": settings.anthropic_model, "effort": settings.ai_effort,
                          "key_set": False, "key_last4": None, "env_key_set": False, "effective_mode": "template"}
    assert data["reports"] == {"header_title": "KidSphere", "footer_note": None}


def test_update_general_and_reports_with_audit(admin_client, admin, db):
    r = put(admin_client, "general", {"organization_name": "  Olive KG Network ", "default_ui_language": "he",
                                       "default_content_language": "en"})
    assert r.status_code == 200, r.text
    assert r.json()["general"] == {"organization_name": "Olive KG Network", "default_ui_language": "he",
                                   "default_content_language": "en"}
    r = put(admin_client, "reports", {"header_title": "Olive KG", "footer_note": "Prepared for the team."})
    assert r.json()["reports"] == {"header_title": "Olive KG", "footer_note": "Prepared for the team."}
    # A partial update keeps the other fields.
    r = put(admin_client, "reports", {"footer_note": ""})
    assert r.json()["reports"] == {"header_title": "Olive KG", "footer_note": None}

    rows = audits(db)
    assert [(a.meta["section"], a.meta["fields"]) for a in rows] == [
        ("general", ["default_content_language", "default_ui_language", "organization_name"]),
        ("reports", ["footer_note", "header_title"]),
        ("reports", ["footer_note"]),
    ]
    assert all(a.actor_id == admin.id for a in rows)
    assert all("Olive" not in json.dumps(a.meta) for a in rows)  # names only, never values
    row = db.get(AppSetting, "general")
    assert row.updated_by == admin.id


def test_unchanged_values_write_nothing(admin_client, db):
    put(admin_client, "general", {"organization_name": "A"})
    put(admin_client, "general", {"organization_name": "A"})
    assert len(audits(db)) == 1


@pytest.mark.parametrize("section,body", [
    ("general", {"organization_name": "x" * 121}),
    ("general", {"default_ui_language": "fr"}),
    ("general", {"default_content_language": "de"}),
    ("general", {"unknown": 1}),
    ("ai", {"provider_mode": "gpt"}),
    ("ai", {"effort": "max"}),
    ("ai", {"model": "not a model"}),
    ("reports", {"footer_note": "x" * 301}),
    ("reports", {"header_title": ""}),
])
def test_validation(admin_client, section, body):
    r = put(admin_client, section, body)
    assert r.status_code == 400, r.text
    assert r.json()["error"]["code"] == "VALIDATION"


def test_unknown_section_is_400(admin_client):
    r = put(admin_client, "secrets", {"a": 1})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "VALIDATION"


# --------------------------------------------------------------------------- the write-only key


def test_key_is_never_returned_logged_or_audited(admin_client, db, caplog):
    with caplog.at_level(logging.INFO):
        r = put(admin_client, "ai", {"anthropic_api_key": SAVED_KEY, "provider_mode": "claude",
                                     "model": "claude-sonnet-5-5", "effort": "low"})
        assert r.status_code == 200, r.text
        assert SAVED_KEY not in r.text
        assert r.json()["ai"]["key_set"] is True and r.json()["ai"]["key_last4"] == "1234"
        assert r.json()["ai"]["effective_mode"] == "claude"
        got = admin_client.get("/api/admin/settings")
        system = admin_client.get("/api/admin/system")
    for text_ in (got.text, system.text, caplog.text):
        assert SAVED_KEY not in text_ and "saved-key" not in text_
    assert got.json()["ai"]["key_last4"] == "1234"
    rows = audits(db)
    assert rows[-1].meta == {"section": "ai", "fields": ["anthropic_api_key", "effort", "model", "provider_mode"]}
    assert all("saved-key" not in json.dumps(a.meta) for a in db.scalars(select(AuditLog)))
    # Stored server-side only.
    db.expire_all()
    assert db.get(AppSetting, "ai").value["api_key"] == SAVED_KEY


def test_invalid_key_is_rejected_without_echo(admin_client):
    bad = "not-a-real-key-123456789"
    r = put(admin_client, "ai", {"anthropic_api_key": bad})
    assert r.status_code == 400
    assert bad not in r.text
    assert r.json()["error"]["details"][0]["path"] == "anthropic_api_key"


def test_clear_key(admin_client, db):
    put(admin_client, "ai", {"anthropic_api_key": SAVED_KEY})
    r = put(admin_client, "ai", {"clear": True})
    assert r.status_code == 200
    assert r.json()["ai"]["key_set"] is False and r.json()["ai"]["key_last4"] is None
    db.expire_all()
    assert "api_key" not in db.get(AppSetting, "ai").value
    assert audits(db)[-1].meta == {"section": "ai", "fields": ["anthropic_api_key"]}


# --------------------------------------------------------------------------- precedence and mode


def test_saved_key_overrides_env(admin_client, db, monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", ENV_KEY)
    eff = app_settings.effective_ai()
    assert eff.api_key == ENV_KEY and eff.key_source == "env" and eff.mode == "claude"
    put(admin_client, "ai", {"anthropic_api_key": SAVED_KEY})
    eff = app_settings.effective_ai()
    assert eff.api_key == SAVED_KEY and eff.key_source == "settings"
    assert SAVED_KEY not in repr(eff)
    assert claude_provider.make_client().api_key == SAVED_KEY
    put(admin_client, "ai", {"clear": True})
    assert app_settings.effective_ai().api_key == ENV_KEY


def test_settings_model_and_effort_reach_the_request(admin_client, monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    put(admin_client, "ai", {"anthropic_api_key": SAVED_KEY, "model": "claude-sonnet-5-5", "effort": "high"})
    ctx = ctx_for()
    fake = FakeClaude(valid_output("story", ctx))
    monkeypatch.setattr(claude_provider, "make_client", lambda: fake)
    result = generate("story", ctx)
    assert result.provider == "claude" and result.model == "claude-sonnet-5-5"
    assert fake.calls[0]["model"] == "claude-sonnet-5-5"
    assert fake.calls[0]["output_config"]["effort"] == "high"


def test_template_mode_wins_over_any_key(admin_client, monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", ENV_KEY)
    put(admin_client, "ai", {"anthropic_api_key": SAVED_KEY, "provider_mode": "template"})
    assert app_settings.effective_ai().mode == "template"

    def no_client(*a, **k):
        raise AssertionError("no client in template mode")

    monkeypatch.setattr(claude_provider, "make_client", no_client)
    ctx = ctx_for()
    fake = FakeClaude(valid_output("story", ctx))
    result = generate("story", ctx, client=fake)
    assert result.provider == "template" and result.fallback_reason is None
    assert fake.calls == []
    r = admin_client.get("/api/admin/settings")
    assert r.json()["ai"]["effective_mode"] == "template"


def test_invalid_stored_values_fall_back_to_defaults(db):
    db.add(AppSetting(key="ai", value={"provider_mode": "bogus", "effort": "low"}))
    db.add(AppSetting(key="general", value={"organization_name": "", "default_content_language": "he"}))
    db.commit()
    assert app_settings.effective_ai().provider_mode == "claude"
    assert app_settings.effective_ai().effort == "low"
    g = app_settings.general(db)
    assert g.organization_name == "KidSphere" and g.default_content_language == "he"


# --------------------------------------------------------------------------- connection test


class FakeTestClient:
    def __init__(self, error=None):
        self.error = error
        self.calls = []
        self.messages = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="ok")])


def test_connection_test_without_any_key(admin_client, monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    r = admin_client.post("/api/admin/settings/ai/test")
    assert r.status_code == 200
    assert r.json() == {"ok": False, "model": settings.anthropic_model, "error_code": "AI_NO_KEY"}


def test_connection_test_makes_one_minimal_call(admin_client, db, monkeypatch, child):
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    put(admin_client, "ai", {"anthropic_api_key": SAVED_KEY, "model": "claude-opus-5-5", "provider_mode": "template"})
    fake = FakeTestClient()
    keys = []
    monkeypatch.setattr(claude_provider, "make_client", lambda api_key=None: keys.append(api_key) or fake)
    r = admin_client.post("/api/admin/settings/ai/test")
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "model": "claude-opus-5-5", "error_code": None}
    assert keys == [SAVED_KEY] and len(fake.calls) == 1
    call = fake.calls[0]
    assert call["model"] == "claude-opus-5-5" and call["max_tokens"] <= 256
    sent = json.dumps(call)
    assert child.name not in sent and "system" not in call  # never child data
    assert audits(db, "settings.ai_test")[-1].meta == {"ok": True, "error_code": None}


@pytest.mark.parametrize("error,code", [
    (lambda: _status_error(anthropic.AuthenticationError, 401), "AI_AUTH"),
    (lambda: _status_error(anthropic.NotFoundError, 404), "AI_MODEL_NOT_FOUND"),
    (lambda: _status_error(anthropic.RateLimitError, 429), "AI_UNAVAILABLE"),
])
def test_connection_test_maps_errors(admin_client, monkeypatch, error, code):
    monkeypatch.setattr(settings, "anthropic_api_key", ENV_KEY)
    monkeypatch.setattr(claude_provider, "make_client", lambda api_key=None: FakeTestClient(error()))
    r = admin_client.post("/api/admin/settings/ai/test")
    assert r.json()["ok"] is False and r.json()["error_code"] == code
    assert ENV_KEY not in r.text


# --------------------------------------------------------------------------- system, users, content, reports


def test_system_shape(admin_client, admin, teacher, klass, child, monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    monkeypatch.setattr(settings, "app_version", "abc1234")
    r = admin_client.get("/api/admin/system")
    assert r.status_code == 200, r.text
    data = r.json()
    assert set(data) == {"app_version", "alembic_revision", "last_backup_at", "ai", "counts"}
    assert data["app_version"] == "abc1234"
    assert data["alembic_revision"] == "0005"
    assert data["last_backup_at"] is None or isinstance(data["last_backup_at"], str)
    assert data["ai"] == {"effective_mode": "template", "provider_mode": "claude", "model": settings.anthropic_model,
                          "key_source": None}
    assert data["counts"]["users"] >= 3 and data["counts"]["classes"] == 1 and data["counts"]["children"] == 1


def test_version_unknown_without_env_or_file(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "app_version", "")
    monkeypatch.setattr(app_settings, "VERSION_FILE", tmp_path / "VERSION")
    assert app_settings.app_version() == "unknown"
    (tmp_path / "VERSION").write_text("deadbee\n")
    assert app_settings.app_version() == "deadbee"


def test_new_users_get_the_default_ui_language(admin_client, db):
    put(admin_client, "general", {"default_ui_language": "he"})
    r = admin_client.post("/api/users", json={"name": "New", "email": "new-user", "role": "teacher",
                                              "password": "long-enough-1"})
    assert r.status_code == 201, r.text
    assert r.json()["user"]["language"] == "he"
    r = admin_client.post("/api/users", json={"name": "Other", "email": "other-user", "role": "teacher",
                                              "language": "en", "password": "long-enough-1"})
    assert r.json()["user"]["language"] == "en"


def test_default_content_language(admin_client, teacher_client, child, db, monkeypatch):
    from app.models import ChildProfile

    monkeypatch.setattr(settings, "anthropic_api_key", "")
    monkeypatch.setattr(settings, "video_provider", "none")
    profile = db.scalar(select(ChildProfile).where(ChildProfile.child_id == child.id))
    profile.strengths = [{"key": "building", "sources": ["teacher"]}]
    db.commit()
    body = {"mode": "strength_builder", "content_type": "story", "target_strength": "building"}
    r = teacher_client.post(f"/api/children/{child.id}/content/generate", json=body)
    assert r.status_code == 201, r.text
    assert r.json()["content"]["language"] == child.main_language == "ar"  # "child" = the child's main language
    put(admin_client, "general", {"default_content_language": "he"})
    r = teacher_client.post(f"/api/children/{child.id}/content/generate", json=body)
    assert r.status_code == 201, r.text
    assert r.json()["content"]["language"] == "he"
    r = teacher_client.post(f"/api/children/{child.id}/content/generate", json={**body, "language": "en"})
    assert r.json()["content"]["language"] == "en"  # an explicit choice still wins


def test_report_header_uses_the_settings(db, admin_client):
    from app.reports.render import environment

    put(admin_client, "general", {"organization_name": "Olive Network"})
    put(admin_client, "reports", {"header_title": "Olive KG", "footer_note": "For the team only."})
    from app.reports.service import org_meta

    org = org_meta(db)
    assert org == {"name": "Olive Network", "header_title": "Olive KG", "footer_note": "For the team only."}
    meta = {"title": "T", "child": {"name": "Adam", "age": "4", "kindergarten": "K"}, "report_date": "1.1.2026",
            "prepared_by": "R", "org": org}
    labels = {"report_label": "Report", "child": "c", "age": "a", "kindergarten": "k", "report_date": "d",
              "prepared_by": "p", "period": "x", "disclaimer": "DISCLAIMER"}
    header = environment().get_template("_header.html").render(meta=meta, t=labels)
    footer = environment().get_template("_footer.html").render(meta=meta, t=labels)
    assert "Olive KG" in header and "Olive Network" in header and 'class="sphere"' not in header
    assert "For the team only." in footer and "DISCLAIMER" in footer
    default = environment().get_template("_header.html").render(meta={**meta, "org": None}, t=labels)
    assert 'class="sphere"' in default
    footer = environment().get_template("_footer.html").render(meta={**meta, "org": None}, t=labels)
    assert "DISCLAIMER" in footer  # the disclaimer is always printed


# --------------------------------------------------------------------------- migration 0003


def test_migration_0003_up_and_down():
    try:
        command.downgrade(alembic_config(), "0002")
        engine.dispose()
        assert "app_settings" not in inspect(engine).get_table_names()
    finally:
        command.upgrade(alembic_config(), "head")
        engine.dispose()
    insp = inspect(engine)
    assert "app_settings" in insp.get_table_names()
    cols = {c["name"]: c for c in insp.get_columns("app_settings")}
    assert set(cols) == {"key", "value", "updated_by", "updated_at"}
    assert cols["value"]["nullable"] is False and cols["updated_by"]["nullable"] is True
    with engine.connect() as conn:
        assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar() == "0005"
