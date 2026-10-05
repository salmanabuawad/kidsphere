import hashlib
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import security
from app.config import settings
from app.db import get_db
from app.main import app, create_app
from app.models import AuditLog, UserSession
from app.security import DUMMY_HASH, hash_password, verify_password
from app.sessions import COOKIE_NAME, utcnow
from tests.conftest import TEST_PASSWORD

# Generated with bcryptjs 3.0.3 (the legacy app's library), cost 12.
BCRYPTJS_PASSWORD = "Legacy-pass-2024"
BCRYPTJS_HASH = "$2b$12$APqcFcRCXUXpjWk/34ZyNekxwDz.BhOZXBgwKje9MCKDdtCRZ1asO"
ARABIC_PASSWORD = "كلمة السر الطويلة جدا للمعلمة في روضة الأطفال الجميلة ١٢٣"  # 105 UTF-8 bytes
ARABIC_BCRYPTJS_HASH = "$2b$12$BQcGcBvxPcYihMX1bYgs4eXf03uJCNW/QhDxnhh8wM1B2Mu5xKN3u"


def login(client, identifier, password=TEST_PASSWORD):
    return client.post("/api/auth/login", json={"identifier": identifier, "password": password})


# --- passwords -----------------------------------------------------------------

def test_bcryptjs_hashes_verify():
    assert len(BCRYPTJS_HASH) == 60
    assert verify_password(BCRYPTJS_PASSWORD, BCRYPTJS_HASH)
    # $2a$ hashes (older bcryptjs) are the same algorithm for these inputs.
    assert verify_password(BCRYPTJS_PASSWORD, "$2a$" + BCRYPTJS_HASH[4:])
    assert not verify_password("wrong-password", BCRYPTJS_HASH)


def test_long_arabic_password_matches_bcryptjs_truncation():
    assert len(ARABIC_PASSWORD.encode("utf-8")) > 100
    assert verify_password(ARABIC_PASSWORD, ARABIC_BCRYPTJS_HASH)
    own = hash_password(ARABIC_PASSWORD, rounds=4)
    assert verify_password(ARABIC_PASSWORD, own)
    assert not verify_password(ARABIC_PASSWORD[:10], own)


def test_new_hashes_use_cost_12_and_garbage_hashes_fail_closed():
    h = hash_password("another-password")
    assert h.startswith("$2b$12$") and len(h) == 60
    assert not verify_password("x", "not-a-hash")
    assert not verify_password("x", "")


def test_dummy_hash_is_a_real_cost_12_hash():
    assert security.is_bcrypt_hash(DUMMY_HASH)
    assert DUMMY_HASH.startswith("$2b$12$")


# --- login / logout --------------------------------------------------------------

def test_login_sets_http_only_lax_cookie_and_stores_only_the_hash(client, teacher, db):
    r = login(client, "teacher@test.local")
    assert r.status_code == 200
    assert r.json() == {"user": {"id": str(teacher.id), "name": "Teacher", "email": "teacher@test.local",
                                 "role": "teacher", "language": "en"}}
    cookie = r.headers["set-cookie"]
    assert cookie.startswith(f"{COOKIE_NAME}=")
    lowered = cookie.lower()
    assert "httponly" in lowered and "samesite=lax" in lowered and "path=/" in lowered
    token = r.cookies[COOKIE_NAME]
    rows = db.scalars(select(UserSession).where(UserSession.user_id == teacher.id)).all()
    assert len(rows) == 1
    assert rows[0].token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert rows[0].token_hash != token
    assert client.get("/api/me").json()["user"]["id"] == str(teacher.id)
    db.refresh(teacher)
    assert teacher.last_login_at is not None
    assert db.scalars(select(AuditLog.action)).all() == ["auth.login"]


def test_cookie_is_secure_when_configured(client, teacher, monkeypatch):
    monkeypatch.setattr(settings, "cookie_secure", True)
    r = login(client, "teacher@test.local")
    assert "secure" in r.headers["set-cookie"].lower()


def test_login_with_username_is_case_insensitive(client, make_user):
    make_user("admin", email="admin")
    r = login(client, "  ADMIN ")
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "admin"


def test_imported_bcryptjs_hash_logs_in(client, make_user, db):
    user = make_user("admin", email="legacy-admin")
    user.password_hash = BCRYPTJS_HASH
    db.commit()
    assert login(client, "legacy-admin", BCRYPTJS_PASSWORD).status_code == 200


def test_bad_credentials_are_generic_401(client, teacher, make_user, db):
    make_user("teacher", email="inactive@test.local", is_active=False)
    wrong = login(client, "teacher@test.local", "wrong-password")
    unknown = login(client, "nobody@test.local")
    inactive = login(client, "inactive@test.local")
    for r in (wrong, unknown, inactive):
        assert r.status_code == 401
        assert r.json()["error"]["code"] == "INVALID_CREDENTIALS"
        assert COOKIE_NAME not in r.cookies
    assert wrong.json() == unknown.json() == inactive.json()
    assert db.scalars(select(AuditLog.action)).all() == ["auth.login_failed"] * 3


def test_unknown_identifier_still_runs_bcrypt_against_dummy_hash(client, monkeypatch):
    seen = []

    def spy(password, password_hash):
        seen.append(password_hash)
        return verify_password(password, password_hash)

    monkeypatch.setattr("app.routers.auth.verify_password", spy)
    assert login(client, "ghost@test.local").status_code == 401
    assert seen == [DUMMY_HASH]


def test_login_validation(client):
    r = client.post("/api/auth/login", json={"identifier": "teacher@test.local", "password": "x", "role": "admin"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "VALIDATION"
    assert [d["path"] for d in r.json()["error"]["details"]] == ["role"]
    r = client.post("/api/auth/login", json={"identifier": "bad identifier!", "password": "x"})
    assert r.status_code == 400


def test_logout_deletes_session_and_clears_cookie(client, teacher, db):
    login(client, "teacher@test.local")
    r = client.post("/api/auth/logout")
    assert r.status_code == 204
    assert "max-age=0" in r.headers["set-cookie"].lower()
    assert db.scalars(select(UserSession)).all() == []
    client.cookies.clear()
    assert client.get("/api/me").status_code == 401


def test_logout_without_session_is_204(client):
    assert client.post("/api/auth/logout").status_code == 204


def test_deactivated_user_is_rejected_on_next_request(client_for, teacher, db):
    c = client_for(teacher)
    assert c.get("/api/me").status_code == 200
    teacher.is_active = False
    db.commit()
    r = c.get("/api/me")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_expired_session_is_rejected(client_for, teacher, db):
    c = client_for(teacher)
    session = db.scalars(select(UserSession)).one()
    session.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()
    assert c.get("/api/me").status_code == 401


def test_unknown_cookie_is_401(client):
    client.cookies.set(COOKIE_NAME, "forged-token")
    r = client.get("/api/me")
    assert r.status_code == 401
    assert r.json() == {"error": {"code": "UNAUTHENTICATED", "message": "Please sign in.", "details": None}}


# --- /me -----------------------------------------------------------------------

def test_me_requires_login(client):
    assert client.get("/api/me").status_code == 401


def test_update_me(teacher_client, teacher, db):
    r = teacher_client.put("/api/me", json={"name": "  Rana  ", "language": "he"})
    assert r.status_code == 200
    assert r.json()["user"]["name"] == "Rana"
    assert r.json()["user"]["language"] == "he"
    db.refresh(teacher)
    assert (teacher.name, teacher.language) == ("Rana", "he")
    entry = db.scalars(select(AuditLog)).one()
    assert entry.action == "user.update" and entry.meta == {"fields": ["language", "name"]}


def test_update_me_rejects_unknown_fields_and_bad_language(teacher_client):
    r = teacher_client.put("/api/me", json={"role": "admin"})
    assert r.status_code == 400
    body = r.json()["error"]
    assert body["code"] == "VALIDATION"
    assert [d["path"] for d in body["details"]] == ["role"]
    assert teacher_client.put("/api/me", json={"language": "fr"}).status_code == 400
    assert teacher_client.get("/api/me").json()["user"]["role"] == "teacher"


def test_change_password_revokes_other_sessions(client_for, teacher, db):
    current = client_for(teacher)
    other = client_for(teacher)
    r = current.post("/api/me/password", json={"current_password": TEST_PASSWORD, "new_password": "brand-new-pass"})
    assert r.status_code == 204
    assert current.get("/api/me").status_code == 200
    assert other.get("/api/me").status_code == 401
    anon = TestClient(app)
    assert login(anon, "teacher@test.local", "brand-new-pass").status_code == 200
    assert login(anon, "teacher@test.local", TEST_PASSWORD).status_code == 401


def test_change_password_checks_current_and_length(teacher_client):
    r = teacher_client.post("/api/me/password", json={"current_password": "wrong", "new_password": "brand-new-pass"})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "VALIDATION"
    r = teacher_client.post("/api/me/password", json={"current_password": TEST_PASSWORD, "new_password": "short"})
    assert r.status_code == 400
    assert r.json()["error"]["details"][0]["path"] == "new_password"


# --- request handling ------------------------------------------------------------

def test_foreign_origin_is_rejected_on_mutations(client, teacher):
    r = client.post("/api/auth/login", json={"identifier": "teacher@test.local", "password": TEST_PASSWORD},
                    headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"
    ok = client.post("/api/auth/login", json={"identifier": "teacher@test.local", "password": TEST_PASSWORD},
                     headers={"Origin": "http://testserver"})
    assert ok.status_code == 200
    # Safe methods are not checked.
    assert client.get("/api/me", headers={"Origin": "https://evil.example"}).status_code == 200


def test_unhandled_exception_returns_internal_without_traceback():
    test_app = create_app()

    @test_app.get("/api/boom")
    def boom():
        raise RuntimeError("secret stack detail")

    r = TestClient(test_app, raise_server_exceptions=False).get("/api/boom")
    assert r.status_code == 500
    assert r.json() == {"error": {"code": "INTERNAL", "message": "Something went wrong.", "details": None}}
    assert "secret" not in r.text and "Traceback" not in r.text


def test_unknown_route_uses_envelope(client):
    r = client.get("/api/does-not-exist")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


# --- health and options ------------------------------------------------------------

def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "db": "ok"}


def test_health_degraded_when_db_down(client):
    class DownSession:
        def execute(self, *args, **kwargs):
            raise ConnectionError("db down")

    app.dependency_overrides[get_db] = lambda: DownSession()
    try:
        r = client.get("/api/health")
    finally:
        app.dependency_overrides.pop(get_db, None)
    assert r.status_code == 503
    assert r.json()["status"] == "degraded"


def test_options_requires_login(client, sample_options):
    assert client.get("/api/options").status_code == 401


def test_options_returns_lists(teacher_client, sample_options):
    r = teacher_client.get("/api/options")
    assert r.status_code == 200
    lists = r.json()["lists"]
    assert [i["key"] for i in lists["strengths"]] == ["imagination", "building", "vocabulary"]
    assert lists["interests"][1]["label"] == {"en": "Animals", "ar": "الحيوانات", "he": "בעלי חיים"}
    assert "banned_terms" not in r.json()


@pytest.mark.skipif(not settings.options_path.exists(), reason="app/data/options.json not written yet (WP-04)")
def test_options_serves_the_real_catalog(teacher_client):
    from app import vocab

    vocab.reload()
    r = teacher_client.get("/api/options")
    assert r.status_code == 200
    assert isinstance(r.json()["lists"], dict) and r.json()["lists"]
