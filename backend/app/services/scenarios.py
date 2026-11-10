"""Situations to build content around: Event -> Interpretation -> Emotion -> Response (the Hebrew
AFRT model, simplified for ages 3-6). Ready ones live in ``app/data/scenarios.json`` with the goals
(focus suggestion keys) they fit; a teacher can also write her own.

    GET /api/scenarios  (staff) -> {feelings: [{key, emoji, label}], scenarios: [{key, goals, feeling, title,
                                    event, interpretation, response}]}   (texts as {en, ar, he})

``resolve(body, language)`` turns a request (``ScenarioIn``) into the texts the AI context gets, in
the content language: a ready scenario's texts, or the teacher's own words. The feeling always
comes from the list (its "felt" phrase, e.g. "angry" / "بالغضب" / "כעס").
"""
import json
from functools import lru_cache
from pathlib import Path

from app import access
from app.errors import AppError
from app.models import User

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "scenarios.json"


@lru_cache(maxsize=1)
def data() -> dict:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def list_scenarios(user: User) -> dict:
    if not access.is_staff(user):
        raise AppError("NOT_FOUND")
    d = data()
    return {"feelings": [{k: f[k] for k in ("key", "emoji", "label")} for f in d["feelings"]],
            "scenarios": d["scenarios"]}


def _invalid(path: str, message: str) -> AppError:
    return AppError("VALIDATION", details=[{"path": f"scenario.{path}", "message": message}])


def _t(entry: dict, lang: str) -> str:
    return entry.get(lang) or entry.get("en") or ""


def resolve(body, language: str) -> dict | None:
    if body is None:
        return None
    feelings = {f["key"]: f for f in data()["feelings"]}
    if body.key:
        s = next((x for x in data()["scenarios"] if x["key"] == body.key), None)
        if s is None:
            raise _invalid("key", "Unknown situation.")
        f = feelings[s["feeling"]]
        return {"key": s["key"], "event": _t(s["event"], language), "interpretation": _t(s["interpretation"], language),
                "feeling": _t(f["felt"], language), "feeling_key": f["key"], "response": _t(s["response"], language)}
    if not body.event:
        raise _invalid("event", "Write what happened.")
    if not body.response:
        raise _invalid("response", "Write what the child can say or do.")
    if not body.feeling or body.feeling not in feelings:
        raise _invalid("feeling", "Choose a feeling.")
    f = feelings[body.feeling]
    return {"key": None, "event": body.event, "interpretation": body.interpretation,
            "feeling": _t(f["felt"], language), "feeling_key": f["key"], "response": body.response}
