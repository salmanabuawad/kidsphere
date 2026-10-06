"""Legacy projection of the parent questionnaire (COVERAGE-MATRIX §3.3.2).

The questionnaire keys (``who.interests_pq``, ``emotions.frustration_pq``,
``separation.morning``, …) are canonical. The older, lossy keys of the 0001 wizard
(``who.interests``, ``emotions.frustration_reactions``, ``emotions.morning_separation``,
…) are recomputed from them on every save, so the merged profile lists, baselines,
the FocusPicker and the AI context keep working unchanged.

The rules and key maps live in the registry
(``app/data/source/parent_questionnaire.json``, ``items[].maps_to``), never in code:

    map_list         selected keys → legacy keys (list); "other" text → {custom} (items lists)
    map_single       one key → one legacy key
    union_keys       text_keys answers → union into a legacy items list (several sources)
    strongest        several reactions → the strongest one, in the given order
    flag             a degree answer → add/remove one legacy key
    levels           Independent / Needs help (+ a little / a lot) → the support scale
    sensitivity_keys sensitivity keys → environment.items (keys only)
    non_empty_areas  the Q38 boxes that have text → priority category keys
    copy_selected    selected keys copied as they are
    copy_text        a text copied as it is
    union_languages  home-language keys → children.additional_languages (union, never removes)

**A rule runs only when its canonical answer changed in this save.** Legacy values
from the earlier form therefore stay until the family (or staff) answers that
question again; nothing is guessed backwards from the lossy keys (§3.4 step 4).
Lists change by difference (what was removed from the answer is removed from the
legacy list, what was added is added), so earlier-form entries that the new answer
does not touch are kept.

    project(before, after, section) -> list[str]
        ``before``/``after`` are the perspective's ``sections`` dicts before and after
        the save of ``section`` (``after`` is changed in place). Returns the language
        keys to union into ``children.additional_languages``.
"""
import copy

from app import vocab
from app.schemas.profile import ident

REGISTRY = "parent_questionnaire"


def _rules() -> list[dict]:
    """[{section, field, maps_to}] for every registry item with a projection rule."""
    out = []
    for item in vocab.source_registry(REGISTRY).get("items") or []:
        rule = item.get("maps_to")
        storage = item.get("storage") or ""
        if not rule or not storage.startswith("PP."):
            continue
        section, _, field = storage[3:].partition(".")
        out.append({"section": section, "field": field, "maps_to": rule})
    return out


def _get(sections: dict, path: str):
    cur = sections
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _target(sections: dict, path: str) -> tuple[dict, str]:
    """The (section dict, field) a legacy path points to; the section is created when absent."""
    section, _, field = path.partition(".")
    if not isinstance(sections.get(section), dict):
        sections[section] = {}
    return sections[section], field


def _selected(answer) -> list[str]:
    if isinstance(answer, dict):
        return [k for k in answer.get("selected") or [] if isinstance(k, str)]
    return []


def _keys(answer) -> list[str]:
    if isinstance(answer, dict):
        return [k for k in answer.get("keys") or [] if isinstance(k, str)]
    return []


def _text(value) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _ordered_union(groups) -> list[str]:
    out = []
    for group in groups:
        for k in group:
            if k not in out:
                out.append(k)
    return out


# --------------------------------------------------------------------------- list helpers


def _as_items(raw) -> list:
    return list(raw) if isinstance(raw, list) else []


def _remove_keys(items: list, keys: set[str], shape: str) -> list:
    if shape == "keys":
        return [k for k in items if k not in keys]
    return [i for i in items if not (isinstance(i, dict) and i.get("key") in keys) and not (isinstance(i, str) and i in keys)]


def _add_keys(items: list, keys: list[str], shape: str) -> list:
    present = {ident(i) for i in items}
    for k in keys:
        if ("k", k) in present:
            continue
        items.append(k if shape == "keys" else {"key": k})
        present.add(("k", k))
    return items


def _replace_custom(items: list, old: str | None, new: str | None) -> list:
    if old:
        gone = ("c", old[:120].strip().casefold())
        items = [i for i in items if ident(i) != gone]
    if new:
        text = new[:120].strip()
        if ("c", text.casefold()) not in {ident(i) for i in items}:
            items.append({"custom": text})
    return items


# --------------------------------------------------------------------------- rules


def _map_list(rule: dict, before, after, sections: dict) -> None:
    old_sel, new_sel = _selected(before), _selected(after)
    old_other = _text(before.get("other")) if isinstance(before, dict) else None
    new_other = _text(after.get("other")) if isinstance(after, dict) else None
    if old_sel == new_sel and old_other == new_other:
        return
    mapping = rule.get("keys") or {}
    shape = rule.get("shape", "items")
    target, field = _target(sections, rule["target"])
    kept = {t for k in new_sel for t in mapping.get(k, [])}
    removed = {t for k in old_sel if k not in new_sel for t in mapping.get(k, [])} - kept
    added = [t for k in new_sel if k not in old_sel for t in mapping.get(k, [])]
    items = _remove_keys(_as_items(target.get(field)), removed, shape)
    items = _add_keys(items, added, shape)
    if rule.get("other") == "custom" and old_other != new_other:
        items = _replace_custom(items, old_other, new_other)
    target[field] = items


def _map_single(rule: dict, before, after, sections: dict) -> None:
    if before == after:
        return
    target, field = _target(sections, rule["target"])
    value = (rule.get("keys") or {}).get(after) if isinstance(after, str) else None
    if value:
        target[field] = value
    else:
        target.pop(field, None)


def _union_keys(rule: dict, before, after, sections: dict, others: list) -> None:
    old_keys, new_keys = _keys(before), _keys(after)
    if old_keys == new_keys:
        return
    still = {k for other in others for k in _keys(other)} | set(new_keys)
    removed = {k for k in old_keys if k not in still}
    added = [k for k in new_keys if k not in old_keys]
    target, field = _target(sections, rule["target"])
    items = _remove_keys(_as_items(target.get(field)), removed, "items")
    target[field] = _add_keys(items, added, "items")


def _strongest(rule: dict, before, after, sections: dict) -> None:
    old_sel, new_sel = _selected(before), _selected(after)
    if old_sel == new_sel:
        return
    target, field = _target(sections, rule["target"])
    for key in rule.get("order") or []:
        if key in new_sel:
            target[field] = rule["keys"][key]
            return
    target.pop(field, None)


def _flag(rule: dict, before, after, sections: dict) -> None:
    if before == after:
        return
    when = set(rule.get("when") or [])
    old_on, new_on = before in when, after in when
    if old_on == new_on:
        return
    target, field = _target(sections, rule["target"])
    keys = _as_items(target.get(field))
    key = rule["key"]
    target[field] = _add_keys(keys, [key], "keys") if new_on else _remove_keys(keys, {key}, "keys")


def _levels(rule: dict, before_section: dict, after_section: dict, sections: dict, field: str) -> None:
    old_levels = before_section.get(field) if isinstance(before_section.get(field), dict) else {}
    new_levels = after_section.get(field) if isinstance(after_section.get(field), dict) else {}
    old_amount = before_section.get("help_amount") if isinstance(before_section.get("help_amount"), dict) else {}
    new_amount = after_section.get("help_amount") if isinstance(after_section.get("help_amount"), dict) else {}
    target, tfield = _target(sections, rule["target"])
    levels = dict(target.get(tfield) or {}) if isinstance(target.get(tfield), dict) else {}
    changed = False
    for area in sorted(set(old_levels) | set(new_levels) | set(old_amount) | set(new_amount)):
        old = (old_levels.get(area), old_amount.get(area))
        new = (new_levels.get(area), new_amount.get(area))
        if old == new:
            continue
        changed = True
        level, amount = new
        if level is None:
            levels.pop(area, None)
        elif level == "needs_help" and amount in (rule.get("amount") or {}):
            levels[area] = rule["amount"][amount]
        elif level == "needs_help" and levels.get(area) in (rule.get("keep") or []):
            pass  # an earlier "significant support" stays when no amount is given
        else:
            levels[area] = (rule.get("keys") or {}).get(level, levels.get(area))
    if changed:
        target[tfield] = levels


def _sensitivity_keys(rule: dict, before, after, sections: dict) -> None:
    old_keys, new_keys = _keys(before), _keys(after)
    if old_keys == new_keys:
        return
    target, field = _target(sections, rule["target"])
    items = _as_items(target.get(field))
    removed = {k for k in old_keys if k not in new_keys}
    out = []
    for it in items:
        if isinstance(it, dict) and it.get("key") in removed and not it.get("what_happens") and not it.get("what_helps"):
            continue  # only the bare key came from the questionnaire; what was written about it stays
        out.append(it)
    present = {ident(i) for i in out}
    for k in new_keys:
        if k not in old_keys and ("k", k) not in present:
            out.append({"key": k, "what_helps": []})
    target[field] = out


def _filled_areas(answer, mapping: dict) -> list[str]:
    if not isinstance(answer, dict):
        return []
    out = []
    for area, key in mapping.items():
        box = answer.get(area)
        if isinstance(box, dict) and (_text(box.get("text")) or _text(box.get("area"))):
            out.append(key)
    return out


def _non_empty_areas(rule: dict, before, after, sections: dict) -> None:
    mapping = rule.get("keys") or {}
    old, new = _filled_areas(before, mapping), _filled_areas(after, mapping)
    if old == new:
        return
    target, field = _target(sections, rule["target"])
    keys = _remove_keys(_as_items(target.get(field)), {k for k in old if k not in new}, "keys")
    target[field] = _add_keys(keys, [k for k in new if k not in old], "keys")


def _copy_selected(rule: dict, before, after, sections: dict) -> None:
    old_sel, new_sel = _selected(before), _selected(after)
    if old_sel == new_sel:
        return
    target, field = _target(sections, rule["target"])
    target[field] = list(new_sel)


def _copy_text(rule: dict, before, after, sections: dict) -> None:
    if _text(before) == _text(after):
        return
    target, field = _target(sections, rule["target"])
    if _text(after):
        target[field] = after
    else:
        target.pop(field, None)


def _languages(after) -> list[str]:
    if not isinstance(after, dict) or after.get("value") == "no":
        return []
    return [k for k in after.get("languages") or [] if isinstance(k, str)]


SIMPLE = {
    "map_list": _map_list,
    "map_single": _map_single,
    "strongest": _strongest,
    "flag": _flag,
    "sensitivity_keys": _sensitivity_keys,
    "non_empty_areas": _non_empty_areas,
    "copy_selected": _copy_selected,
    "copy_text": _copy_text,
}


def project(before: dict, after: dict, section: str) -> list[str]:
    """Recompute the legacy keys fed by ``section`` (see the module docstring)."""
    before_section = before.get(section) if isinstance(before.get(section), dict) else {}
    after_section = after.get(section) if isinstance(after.get(section), dict) else {}
    rules = _rules()
    languages: list[str] = []
    for r in rules:
        if r["section"] != section:
            continue
        rule = r["maps_to"]
        kind = rule.get("rule")
        old = copy.deepcopy(_get(before_section, r["field"]))
        new = _get(after_section, r["field"])
        if kind == "union_keys":
            # Other questions that feed the same legacy list (e.g. Q14 and Q35 → transition_helps).
            others = [_get(after, f"{o['section']}.{o['field']}") for o in rules
                      if o["maps_to"].get("target") == rule["target"] and o is not r]
            _union_keys(rule, old, new, after, others)
        elif kind == "levels":
            _levels(rule, before_section, after_section, after, r["field"])
        elif kind == "union_languages":
            languages = _ordered_union([languages, _languages(new)])
        elif kind in SIMPLE:
            SIMPLE[kind](rule, old, new, after)
    return languages
