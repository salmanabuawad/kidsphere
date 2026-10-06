"""The report model: plain dicts that the Jinja templates render.

A builder returns ``{"title", "sections": [section, ...]}``; the service adds
``meta`` (child, dates, language). A section is::

    {"key", "title", "source": tag | None, "status": {"key", "label"} | None,
     "intro": str | None, "blocks": [block, ...], "break_before": bool}

Blocks (``type`` picks the template in templates/_blocks/):

    qa        {"items": [{"q", "a": answer, "source": tag | None, "heading": bool}]}
    table     {"columns": [str], "rows": [row], "widths": [str] | None, "kind": str}
              row = {"cells": [answer, ...]} | {"sub": str} | {"detail": [{"k", "v": answer}]}
    para      {"text", "muted": bool}
    chips     {"items": [{"text", "tone", "tag": tag | None}]}
    callout   {"title", "text", "source": tag | None}
    kv        {"items": [{"k", "v"}]}
    entries   {"items": [{"title", "meta", "answer": answer, "source": tag | None, "parts": [{"k", "v": answer}]}]}
    timeline  {"groups": [{"title", "items": [{"date", "type", "title", "answer": answer, "source": tag | None}]}]}
    list      {"items": [str], "ordered": bool}

An answer is ``{"chips": [{"text", "tone"}], "lines": [str], "marker": str | None}``
(``marker`` is the muted "Not answered" / "Not observed yet"). A source tag is
``{"kind": parent_said|teacher_observed|teacher_approved|ai_suggested, "text"}``.
Free text from users is always rendered with ``dir="auto"`` and autoescaped.
"""

LEVEL_TONES = {
    "independent": "leaf",
    "some_support": "sky",
    "significant_support": "sun",
    "not_observed": "muted",
}

SOURCE_TONES = {
    "parent_said": "sky",
    "teacher_observed": "leaf",
    "teacher_approved": "navy",
    "ai_suggested": "sun",
}


def answer(chips=None, lines=None, marker=None) -> dict:
    return {"chips": list(chips or []), "lines": [x for x in (lines or []) if x], "marker": marker}


def text_answer(text, marker=None) -> dict:
    if isinstance(text, str) and text.strip():
        return answer(lines=[text.strip()])
    return answer(marker=marker)


def chip(text: str, tone: str = "neutral") -> dict:
    return {"text": text, "tone": tone}


def has_content(a: dict) -> bool:
    return bool(a["chips"] or a["lines"])


def section(key: str, title: str, blocks: list, source=None, status=None, intro=None, break_before=False) -> dict:
    return {"key": key, "title": title, "blocks": [b for b in blocks if b], "source": source, "status": status,
            "intro": intro, "break_before": break_before}


def qa(items: list) -> dict | None:
    return {"type": "qa", "items": items} if items else None


def qa_item(question: str, a: dict, source=None, heading: bool = False) -> dict:
    return {"q": question, "a": a, "source": source, "heading": heading}


def table(columns: list, rows: list, kind: str = "table", widths=None) -> dict | None:
    if not rows:
        return None
    return {"type": "table", "columns": columns, "rows": rows, "kind": kind, "widths": widths}


def row(cells: list) -> dict:
    return {"cells": cells}


def sub_row(text: str) -> dict:
    return {"sub": text}


def detail_row(parts: list) -> dict | None:
    parts = [p for p in parts if has_content(p["v"])]
    return {"detail": parts} if parts else None


def heading(text: str, status=None) -> dict | None:
    return {"type": "heading", "text": text, "status": status} if text else None


def para(text: str, muted: bool = False) -> dict | None:
    return {"type": "para", "text": text, "muted": muted} if text else None


def chips(items: list) -> dict | None:
    return {"type": "chips", "items": items} if items else None


def callout(title: str, text: str, source=None) -> dict | None:
    return {"type": "callout", "title": title, "text": text, "source": source} if text else None


def kv(items: list) -> dict | None:
    items = [i for i in items if i and i.get("v")]
    return {"type": "kv", "items": items} if items else None


def entries(items: list) -> dict | None:
    return {"type": "entries", "items": items} if items else None


def timeline(groups: list) -> dict | None:
    return {"type": "timeline", "groups": groups} if groups else None


def bullet_list(items: list, ordered: bool = False) -> dict | None:
    items = [i for i in items if i]
    return {"type": "list", "items": items, "ordered": ordered} if items else None


def tag(kind: str, text: str) -> dict:
    return {"kind": kind, "text": text, "tone": SOURCE_TONES.get(kind, "neutral")}


def lead(label: str) -> str:
    """A label that introduces a value ("With whom?" -> "With whom:"), never "?:" or "؟:"."""
    return (label or "").rstrip(" ?؟:") + ":"
