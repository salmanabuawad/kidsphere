"""Parent Copilot: safety first, curated guidance, local-AI personalisation only."""
import json

import pytest
from sqlalchemy import select

from app.ai import find_unsafe_text, local_provider
from app.models import AuditLog
from app.services import copilot
from tests.test_local_ai import fake_post, local_mode  # noqa: F401  (fixtures)


def ask(client, child, expect=200, **body):
    r = client.post("/api/copilot/ask", json={"child_id": str(child.id), **body})
    assert r.status_code == expect, r.text
    return r.json()


def test_guidance_base_is_complete_and_gentle():
    g = copilot.guidance()
    assert len(g["articles"]) >= 6
    for a in g["articles"]:
        for key in ("title", "explanation", "steps", "say", "activity", "see_professional", "keywords"):
            assert set(a[key]) == {"en", "ar", "he"}, (a["key"], key)
        texts = [a[k][lang] for k in ("title", "explanation", "activity", "see_professional") for lang in ("en", "ar", "he")]
        texts += [s for k in ("steps", "say") for lang in ("en", "ar", "he") for s in a[k][lang]]
        assert find_unsafe_text(texts, child_facing=True) == [], a["key"]
    assert set(g["safety"]["answer"]["steps"]) == {"en", "ar", "he"}


@pytest.mark.parametrize("question,key", [
    ("My child becomes angry when I say no", "angry_when_no"),
    ("He refuses to share his toys with his sister", "refuses_to_share"),
    ("She is afraid of sleeping alone in the dark", "afraid_sleeping_alone"),
    ("He cries every morning at the kindergarten goodbye", "crying_at_separation"),
    ("She gets frustrated and gives up when a puzzle is difficult", "frustrated_when_difficult"),
    ("ابني يغضب ويصرخ عندما أقول لا", "angry_when_no"),
    ("הילדה בוכה בפרידה בבוקר בגן", "crying_at_separation"),
])
def test_questions_match_curated_articles(parent_client, child, question, key):
    out = ask(parent_client, child, question=question)
    assert out["kind"] == "guidance" and out["article_key"] == key and out["source"] == "guidance"
    assert out["answer"]["steps"] and out["answer"]["say"] and out["answer"]["see_professional"]


@pytest.mark.parametrize("question", [
    "Someone touched her private parts", "He has bruises and says his uncle hits him", "My son wants to die",
    "ابني لديه كدمات", "הילד אומר שמכים אותו בבית ויש לו חבורות",
])
def test_safety_concerns_get_the_fixed_answer(parent_client, child, question, monkeypatch, db):
    def boom(*a, **k):
        raise AssertionError("no AI call for a safety concern")
    monkeypatch.setattr(local_provider, "_post", boom)
    out = ask(parent_client, child, question=question)
    assert out["kind"] == "safety" and out["answer"]["steps"] and "100" in " ".join(out["answer"]["steps"]) or \
        "100" in json.dumps(out, ensure_ascii=False)
    (row,) = db.scalars(select(AuditLog).where(AuditLog.action == "copilot.ask")).all()
    assert row.meta["kind"] == "safety" and question not in json.dumps(row.meta, ensure_ascii=False)


def test_no_match_offers_topics_and_topic_picks_an_article(parent_client, child):
    out = ask(parent_client, child, question="What colour should we paint the kitchen?")
    assert out["kind"] == "no_match" and len(out["topics"]) >= 6
    out = ask(parent_client, child, topic="naming_feelings", language="he")
    assert out["article_key"] == "naming_feelings" and out["answer"]["title"] == "לעזור לילד לדבר על רגשות"
    ask(parent_client, child, expect=400, topic="nope")
    ask(parent_client, child, expect=400)


def test_access(other_parent_client, other_teacher_client, teacher_client, child):
    ask(other_parent_client, child, expect=404, topic="naming_feelings")
    ask(other_teacher_client, child, expect=404, topic="naming_feelings")
    assert ask(teacher_client, child, topic="naming_feelings")["kind"] == "guidance"


def test_local_ai_personalises_with_masked_names(local_mode, parent_client, child, monkeypatch, parent):  # noqa: F811
    answer = {"explanation": "When [child] hears no, big feelings come. Stay close.",
              "steps": ["Stay calm.", "Name the feeling."], "say": ["I see you are angry."],
              "activity": "Play angry teddy together."}
    post, calls = fake_post(answer)
    monkeypatch.setattr(local_provider, "_post", post)
    out = ask(parent_client, child, question=f"Adam gets angry when {parent.name} says no")
    assert out["source"] == "local_ai" and out["answer"]["explanation"].startswith("When Adam hears no")
    assert out["answer"]["see_professional"]  # always the curated text
    sent = json.dumps(calls[0]["payload"], ensure_ascii=False)
    assert "Adam" not in sent and parent.name not in sent and "[child]" in sent


def test_bad_local_answers_fall_back_to_the_article(local_mode, parent_client, child, monkeypatch):  # noqa: F811
    post, _ = fake_post({"explanation": "This may be a disorder.", "steps": ["a", "b"], "say": ["c"], "activity": "d"})
    monkeypatch.setattr(local_provider, "_post", post)
    out = ask(parent_client, child, question="My child becomes angry when I say no")
    assert out["source"] == "guidance" and "disorder" not in json.dumps(out)


def test_claude_is_never_used(admin_client, parent_client, child, monkeypatch):
    from app.ai import claude_provider

    def boom(*a, **k):
        raise AssertionError("Claude must not get parent questions")
    monkeypatch.setattr(claude_provider, "call_claude", boom)
    monkeypatch.setattr("app.config.settings.anthropic_api_key", "sk-ant-test-key-123456")
    out = ask(parent_client, child, question="My child becomes angry when I say no")
    assert out["source"] == "guidance"


def test_topics_list(parent_client):
    topics = parent_client.get("/api/copilot/topics", params={"language": "ar"}).json()["topics"]
    assert len(topics) >= 6 and topics[0]["title"] == "عندما يغضب طفلكم من كلمة «لا»"
