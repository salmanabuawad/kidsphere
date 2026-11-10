"""Local AI provider (OpenAI-compatible server: Ollama, vLLM, llama.cpp).

The HTTP call is replaced by a fake ``local_provider._post``; nothing leaves the test.
"""
import json

import pytest

from app.ai import local_provider
from app.config import settings
from tests.test_content import _no_key, adam  # noqa: F401  (fixtures)

URL = "http://127.0.0.1:11434/v1"
MODEL = "qwen2.5:14b"

STORY = {
    "title": "[child] and the Little Red Car",
    "goal": "Supports joining shared play through cars.",
    "story": ["[child] loved the little red car.", "One day [child] asked: Can we build this together?",
              "They built a long road and smiled."],
    "questions": ["What did [child] say?", "How did the friends feel?", "What would you build?"],
    "teacher_note": "Read slowly and pause at the phrase.",
    "illustrations": ["🚗", "🧱", "😊"],
}


@pytest.fixture
def local_mode(admin_client):
    r = admin_client.put("/api/admin/settings/ai", json={"provider_mode": "local", "local_base_url": URL,
                                                         "local_model": MODEL})
    assert r.status_code == 200, r.text
    assert r.json()["ai"]["effective_mode"] == "local"
    return r.json()["ai"]


def generate(client, child, focus, kind="story"):
    """In local mode the request becomes a job (202) that the TestClient runs after the response."""
    r = client.post(f"/api/children/{child.id}/content/generate",
                    json={"mode": "growth_support", "content_type": kind, "focus_area_id": str(focus.id)})
    assert r.status_code == 202, r.text
    job = client.get(f"/api/generation-jobs/{r.json()['job']['id']}").json()["job"]
    assert job["status"] == "done", job
    content = client.get(f"/api/content/{job['result']['content_ids'][0]}").json()["content"]
    return {"content": content, "fallback_reason": job["result"]["fallback_reason"]}


def fake_post(answer=None, raise_exc=None, finish="stop"):
    calls = []

    def post(url, payload, headers, timeout):
        calls.append({"url": url, "payload": payload, "headers": headers, "timeout": timeout})
        if raise_exc is not None:
            raise raise_exc
        content = answer if isinstance(answer, str) else json.dumps(answer)
        return {"choices": [{"message": {"content": content}, "finish_reason": finish}]}

    return post, calls


def test_settings_show_the_local_server(local_mode, admin_client):
    assert local_mode["local_base_url"] == URL and local_mode["local_model"] == MODEL
    system = admin_client.get("/api/admin/system").json()["ai"]
    assert system["effective_mode"] == "local" and system["model"] == MODEL


def test_settings_reject_bad_values(admin_client):
    bad = admin_client.put("/api/admin/settings/ai", json={"local_base_url": "ftp://x"})
    assert bad.status_code == 400
    bad = admin_client.put("/api/admin/settings/ai", json={"local_model": "bad model name"})
    assert bad.status_code == 400


def test_local_mode_without_a_server_uses_templates(admin_client, monkeypatch):
    monkeypatch.setattr(settings, "local_ai_base_url", "")
    monkeypatch.setattr(settings, "local_ai_model", "")
    r = admin_client.put("/api/admin/settings/ai", json={"provider_mode": "local"})
    assert r.json()["ai"]["effective_mode"] == "template"


def test_story_from_the_local_model(local_mode, teacher_client, adam, monkeypatch):  # noqa: F811
    child, focus = adam
    post, calls = fake_post(STORY)
    monkeypatch.setattr(local_provider, "_post", post)
    c = generate(teacher_client, child, focus, kind="story")["content"]
    assert c["ai_provider"] == "local" and c["ai_model"] == MODEL and c["is_template"] is False
    assert c["content"]["title"] == "Adam and the Little Red Car"  # the name is put back on our side
    (call,) = calls
    assert call["url"] == URL + "/chat/completions"
    assert call["payload"]["model"] == MODEL
    assert call["payload"]["response_format"]["type"] == "json_schema"
    sent = json.dumps(call["payload"], ensure_ascii=False)
    assert "Adam" not in sent and "[child]" in sent and "2022-08-05" not in sent
    assert call["timeout"] == settings.local_ai_timeout_seconds


@pytest.mark.parametrize("answer,raise_exc,finish,reason", [
    ("not json at all", None, "stop", "AI_INVALID_OUTPUT"),
    ({"title": "Only a title"}, None, "stop", "AI_INVALID_OUTPUT"),
    ({**STORY, "teacher_note": "This child has a disorder."}, None, "stop", "AI_UNSAFE_OUTPUT"),
    (STORY, None, "length", "AI_MAX_TOKENS"),
    (None, OSError("connection refused"), "stop", "AI_UNAVAILABLE"),
    (None, TimeoutError(), "stop", "AI_TIMEOUT"),
])
def test_local_problems_fall_back_to_templates(local_mode, teacher_client, adam, monkeypatch, answer, raise_exc,  # noqa: F811
                                               finish, reason):
    child, focus = adam
    post, _ = fake_post(answer, raise_exc, finish)
    monkeypatch.setattr(local_provider, "_post", post)
    out = generate(teacher_client, child, focus, kind="story")
    assert out["content"]["ai_provider"] == "template" and out["fallback_reason"] == reason


def test_fenced_json_is_accepted(local_mode, teacher_client, adam, monkeypatch):  # noqa: F811
    child, focus = adam
    post, _ = fake_post("```json\n" + json.dumps(STORY) + "\n```")
    monkeypatch.setattr(local_provider, "_post", post)
    assert generate(teacher_client, child, focus, kind="story")["content"]["ai_provider"] == "local"


def test_connection_test_uses_the_local_server(local_mode, admin_client, monkeypatch):
    post, calls = fake_post({"ok": True})
    monkeypatch.setattr(local_provider, "_post", post)
    r = admin_client.post("/api/admin/settings/ai/test")
    assert r.json() == {"ok": True, "model": MODEL, "error_code": None}
    assert "child" not in json.dumps(calls[0]["payload"]).lower()

    post, _ = fake_post(raise_exc=OSError("down"))
    monkeypatch.setattr(local_provider, "_post", post)
    assert admin_client.post("/api/admin/settings/ai/test").json()["error_code"] == "AI_UNAVAILABLE"
