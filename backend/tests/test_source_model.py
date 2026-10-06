"""GET /api/source-model and app.vocab.source_model (static source-document registries)."""
import json

import pytest

from app import vocab
from app.config import APP_DIR, settings


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    """settings.options_path inside an empty temp folder: no source/ registries yet."""
    monkeypatch.setattr(settings, "options_path", tmp_path / "options.json")
    vocab.reload()
    yield tmp_path
    vocab.reload()


def _write(folder, name, data):
    folder.mkdir(exist_ok=True)
    (folder / name).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    vocab.reload()


REGISTRY = {
    "meta": {"title": {"en": "Getting to know my child", "ar": "التعرّف على طفلي", "he": "להכיר את הילד שלי"}},
    "sections": [{"id": "PQ-SEC-01", "key": "intro", "order": 1, "label": {"en": "A", "ar": "أ", "he": "א"}}],
    "items": [{"id": "PQ-INTRO-05", "section": "intro", "order": 1, "kind": "keys", "storage": "PP.who.describe_words",
               "sensitivity": "none", "ai_policy": "never", "pdf": "R2§A",
               "label": {"en": "Describe", "ar": "صف", "he": "תארו"}, "source_he": "לתאר את הילד ב־3–5 מילים"}],
}


def test_requires_authentication(client, data_dir):
    r = client.get("/api/source-model")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_missing_registries_are_empty(teacher_client, parent_client, data_dir):
    for c in (teacher_client, parent_client):
        r = c.get("/api/source-model")
        assert r.status_code == 200
        assert r.json() == {"parent_questionnaire": {}, "observation_model": {}}
        assert "private" in r.headers["cache-control"]


def test_registries_are_served_as_written(teacher_client, data_dir):
    _write(data_dir / "source", "parent_questionnaire.json", REGISTRY)
    r = teacher_client.get("/api/source-model")
    assert r.status_code == 200
    assert r.json() == {"parent_questionnaire": REGISTRY, "observation_model": {}}
    assert vocab.source_registry("parent_questionnaire") == REGISTRY
    assert vocab.source_registry("observation_model") == {}
    _write(data_dir / "source", "observation_model.json", {"meta": {}, "sections": [], "items": []})
    assert teacher_client.get("/api/source-model").json()["observation_model"] == {"meta": {}, "sections": [],
                                                                                  "items": []}


def test_real_registries_are_valid_json_objects(teacher_client, monkeypatch):
    """Whatever registries exist in app/data/source (wave 2 adds them) load and keep their names."""
    monkeypatch.setattr(settings, "options_path", APP_DIR / "data" / "options.json")
    vocab.reload()
    try:
        r = teacher_client.get("/api/source-model")
        assert r.status_code == 200
        body = r.json()
        assert {"parent_questionnaire", "observation_model"} <= set(body)
        assert all(isinstance(v, dict) for v in body.values())
        for path in sorted((APP_DIR / "data" / "source").glob("*.json")):
            assert body[path.stem] == json.loads(path.read_text(encoding="utf-8"))
    finally:
        vocab.reload()
