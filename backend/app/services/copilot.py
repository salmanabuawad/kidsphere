"""Parent Copilot: practical, age-appropriate ideas for everyday parenting moments, from a curated
guidance base (``app/data/guidance/guidance.json``), never from general model knowledge alone.

    POST /api/copilot/ask {child_id, question? | topic?, language?}

Flow (controlled retrieval, no open chat):
1. **Safety first.** The question is checked against fixed safety phrases (harm, abuse, emergencies)
   in en/ar/he. A match returns the fixed safety answer (emergency and welfare numbers, talk to the
   kindergarten); nothing is generated and no AI is called.
2. **Retrieval.** The question is matched to one curated article by its keywords (or ``topic`` picks
   an article directly). No match returns the list of topics to choose from.
3. **Optional personalisation, local AI only.** When the effective AI mode is "local" (the model runs
   on our own server), the article is rewritten for this question: the model gets the article text,
   the child's age in years and the question with every known name masked ([child], [friend],
   [adult]), and must use only the article. Output is validated and safety-checked; on any problem
   the curated article is returned as it is. Claude or any external provider is never used here.
   ``see_professional`` is always the curated text.
4. Suggested content: activities already shared with the parent for this child, of the kinds the
   article recommends.

Nothing is stored except an audit row (``copilot.ask``: kind, article key, source, language), never
the question text. Parents and staff in scope of the child may ask; a child never uses this.
"""
import json
import re
import unicodedata
from datetime import date
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import access
from app.ai import AIError, find_unsafe_text
from app.ai import local_provider
from app.ai.context import CHILD_TOKEN, first_name, name_masker
from app.ai.gather import adult_names, classmate_names
from app.audit import audit
from app.errors import AppError
from app.models import Child, GeneratedContent, User
from app.services.content import PARENT_STATUSES
from app.services.settings import effective_ai

GUIDANCE_FILE = Path(__file__).resolve().parents[1] / "data" / "guidance" / "guidance.json"
LANGS = ("en", "ar", "he")
MAX_QUESTION = 500
_MARKS = re.compile(r"[ً-ٰٟ֑-ׇ]")  # Arabic harakat, Hebrew niqqud
_TOKEN = re.compile(r"[\w']+", re.UNICODE)


class CopilotAnswer(BaseModel):
    """What the local model may rewrite (never the safety part or see_professional)."""
    model_config = ConfigDict(extra="forbid")

    explanation: str = Field(min_length=1, max_length=700)
    steps: list[str] = Field(min_length=2, max_length=5)
    say: list[str] = Field(min_length=1, max_length=3)
    activity: str = Field(min_length=1, max_length=500)


SYSTEM_PROMPT = """You help parents of young children (ages 3-6) with everyday parenting moments.
Rules:
- Use ONLY the guidance article you are given. Do not add facts, medical advice, therapy, medication or anything not in the article.
- Never diagnose, label the child or name any condition. Never use scores or percentages. Never blame the parent or the child.
- Warm, short, practical sentences in plain words a parent understands without professional knowledge.
- The child is {child}; other children are [friend]; adults are [adult]. Keep these tokens; never invent names.
- Write every field in the requested language.
- Return only the JSON object: explanation (2-4 sentences adapted to the parent's situation), steps (2-5 concrete steps), say (1-3 short sentences the parent can say to the child), activity (one short shared activity).""".replace(
    "{child}", CHILD_TOKEN)


@lru_cache(maxsize=1)
def guidance() -> dict:
    return json.loads(GUIDANCE_FILE.read_text(encoding="utf-8"))


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "").lower()
    return _MARKS.sub("", text).replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")


def _matches(text: str, tokens: set[str], keyword: str) -> bool:
    k = _norm(keyword)
    if " " in k or not k.isascii() and len(k) >= 3:
        return k in text  # phrases, and Arabic/Hebrew stems (prefixes attach to words)
    return k in tokens


def _hits(text: str, keywords: dict) -> int:
    tokens = set(_TOKEN.findall(text))
    return sum(1 for lang in LANGS for k in keywords.get(lang, []) if _matches(text, tokens, k))


def is_safety_concern(question: str) -> bool:
    return _hits(_norm(question), guidance()["safety"]["keywords"]) > 0


def match_article(question: str) -> dict | None:
    text = _norm(question)
    best, best_score = None, 0
    for article in guidance()["articles"]:
        score = _hits(text, article["keywords"])
        if score > best_score:
            best, best_score = article, score
    return best


def _t(entry: dict, lang: str):
    return entry.get(lang) or entry.get("en")


def article_answer(article: dict, lang: str) -> dict:
    return {key: _t(article[key], lang) for key in ("title", "explanation", "steps", "say", "activity", "see_professional")}


def topics(lang: str) -> list[dict]:
    return [{"key": a["key"], "title": _t(a["title"], lang)} for a in guidance()["articles"]]


def _age_years(child: Child) -> int | None:
    if not child.birth_date:
        return None
    today = date.today()
    return today.year - child.birth_date.year - ((today.month, today.day) < (child.birth_date.month, child.birth_date.day))


def _personalise(db: Session, child: Child, article: dict, question: str, lang: str, *, post=None) -> dict | None:
    """The article adapted to the question by the LOCAL model, or None (then the article is used)."""
    cfg = effective_ai(db)
    if cfg.mode != "local":
        return None
    mask = name_masker([child.name, child.preferred_name or "", first_name(child)], classmate_names(db, child),
                       adult_names(db, child))
    payload = {
        "language": lang,
        "child_age_years": _age_years(child),
        "parent_question": mask(question)[:MAX_QUESTION],
        "guidance_article": {k: _t(article[k], lang) for k in ("title", "explanation", "steps", "say", "activity")},
    }
    try:
        data = local_provider.call_local("copilot", SYSTEM_PROMPT, json.dumps(payload, ensure_ascii=False),
                                         CopilotAnswer, config=cfg, post=post)
        answer = CopilotAnswer.model_validate(data)
    except (AIError, ValidationError):
        return None
    texts = [answer.explanation, answer.activity, *answer.steps, *answer.say]
    if find_unsafe_text(texts, child_facing=True, ai=True):
        return None
    name = first_name(child)
    restore = (lambda s: s.replace(CHILD_TOKEN, name)) if name else (lambda s: s)
    out = answer.model_dump()
    return {k: [restore(x) for x in v] if isinstance(v, list) else restore(v) for k, v in out.items()}


def _suggested(db: Session, user: User, child: Child, kinds: list[str]) -> list[dict]:
    stmt = select(GeneratedContent).where(GeneratedContent.child_id == child.id, GeneratedContent.deleted_at.is_(None),
                                          GeneratedContent.status.in_(PARENT_STATUSES),
                                          GeneratedContent.content_type.in_(kinds))
    if not access.is_staff(user):
        stmt = stmt.where(GeneratedContent.shared_with_parent.is_(True))
    rows = db.scalars(stmt.order_by(GeneratedContent.approved_at.desc().nulls_last()).limit(3)).all()
    return [{"id": str(c.id), "title": c.title, "content_type": c.content_type} for c in rows]


def ask(db: Session, user: User, child_id, question: str | None, topic: str | None, language: str | None,
        *, post=None) -> dict:
    child = access.get_child_or_404(db, user, child_id)
    lang = language if language in LANGS else (user.language if user.language in LANGS else "en")
    question = (question or "").strip()
    if not question and not topic:
        raise AppError("VALIDATION", details=[{"path": "question", "message": "Write a question or choose a topic."}])
    if len(question) > MAX_QUESTION:
        raise AppError("VALIDATION", details=[{"path": "question", "message": f"At most {MAX_QUESTION} characters."}])

    if question and is_safety_concern(question):
        s = guidance()["safety"]["answer"]
        out = {"kind": "safety", "article_key": None, "source": "guidance",
               "answer": {"title": _t(s["title"], lang), "explanation": _t(s["explanation"], lang),
                          "steps": _t(s["steps"], lang), "say": [], "activity": None, "see_professional": None},
               "topics": [], "suggested_content": []}
    else:
        article = next((a for a in guidance()["articles"] if a["key"] == topic), None) if topic else None
        if topic and article is None:
            raise AppError("VALIDATION", details=[{"path": "topic", "message": "Unknown topic."}])
        article = article or match_article(question)
        if article is None:
            out = {"kind": "no_match", "article_key": None, "source": "guidance", "answer": None,
                   "topics": topics(lang), "suggested_content": []}
        else:
            answer = article_answer(article, lang)
            personal = _personalise(db, child, article, question, lang, post=post) if question else None
            if personal:
                answer.update(personal)
            out = {"kind": "guidance", "article_key": article["key"], "source": "local_ai" if personal else "guidance",
                   "answer": answer, "topics": topics(lang),
                   "suggested_content": _suggested(db, user, child, article.get("content_types", []))}
    audit(db, user, "copilot.ask", "child", child.id, child_id=child.id, kind=out["kind"],
          article=out["article_key"], source=out["source"], language=lang, by_topic=bool(topic and not question))
    db.commit()
    return out
