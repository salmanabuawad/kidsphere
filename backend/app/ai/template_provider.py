"""Deterministic, offline content generator (PLAN-ADJUSTMENTS A4).

    generate(kind, ctx, template=None) -> dict          (raw output, validated by service.py)
    suggest_understanding(ctx, observations, focus_areas, baseline_items) -> dict
    functional_summary(ctx, observations, focus_areas) -> dict   (FunctionalSummaryDraft)
    pick_template(ctx) -> str                           (game template when none was chosen)
    frame_text(key, ctx, **vars) -> str                 (one understanding frame, e.g. "fr_few")

Content is built from the phrase tables in templates/*.json:
- themes.json: one slot table per theme. growth_support picks the theme by the
  focus category (with per-suggestion phrase overrides, e.g. taking_turns),
  strength_builder by the target strength.
- heroes.json: an interest-based character (car, builder, lion, ...) with
  things to build, pairs and groups for the games.
- frames.json: generic sentence frames shared by every theme.
Slots: {name}, {hero}/{Hero}/{HeroTitle}, {thing}, {phrase}, {interest},
{strength}, {focus}, {helper}, {people}, ... ``ctx.variant`` rotates the hero (when the
child has several interests), the story opening and the order of choices.
People of the child's life (``ctx.cast``) appear by their placeholder only
(``{grandfather}``; the client shows the name and photo): one more story / video
paragraph ("cast_line") and, in story_builder, a "Who comes along?" step.
Hebrew slash forms (יכול/ה) follow ``ctx.gender`` when set; Arabic uses the
``ar_f`` variant for a girl where a line addresses the child.
"""
import json
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path

from app import vocab
from app.ai.context import AIContext
from app.ai.domains import for_focus

TEMPLATE_MODEL = "kidsphere-template-1"
_DIR = Path(__file__).resolve().parent / "templates"


@lru_cache(maxsize=None)
def _data(name: str) -> dict:
    return json.loads((_DIR / f"{name}.json").read_text(encoding="utf-8"))


# --------------------------------------------------------------------------- text helpers

_HE_FINAL = {"ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ"}
_HE_SPECIAL = {
    "את/ה": ("אתה", "את"),
    "בעצמו/ה": ("בעצמו", "בעצמה"),
    "עשה/תה": ("עשה", "עשתה"),
    "ניסה/תה": ("ניסה", "ניסתה"),
    "ענה/תה": ("ענה", "ענתה"),
    "שינה/תה": ("שינה", "שינתה"),
    "נהנה/תה": ("נהנה", "נהנתה"),
}
_HE_SLASH = re.compile(r"([א-ת]+)/([א-ת]{1,3})")


def he_gender(text: str, gender: str | None) -> str:
    """Resolve Hebrew slash forms (יכול/ה) for a known gender; leave them otherwise."""
    if gender not in ("boy", "girl"):
        return text
    girl = gender == "girl"
    for slashed, (m, f) in _HE_SPECIAL.items():
        text = text.replace(slashed, f if girl else m)

    def rep(mo):
        base, suffix = mo.group(1), mo.group(2)
        if not girl:
            return base
        if base[-1] in _HE_FINAL:
            base = base[:-1] + _HE_FINAL[base[-1]]
        return base + suffix

    return _HE_SLASH.sub(rep, text)


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:] if s else s


def _rotate(items: list, k: int) -> list:
    if not items:
        return items
    k %= len(items)
    return items[k:] + items[:k]


class _Kit:
    """Everything one generation needs: context, theme, hero and filled slot values."""

    def __init__(self, ctx: AIContext):
        self.ctx = ctx
        self.lang = ctx.language
        self.gender = ctx.gender
        self.v = ctx.variant or 0
        self.frames = _data("frames")
        themes = _data("themes")
        heroes = _data("heroes")
        self.growth = ctx.mode != "strength_builder"
        self.theme_key = theme_key(ctx)
        theme = dict(themes["themes"][self.theme_key])
        if self.growth and ctx.focus and ctx.focus.suggestion_key in themes["suggestions"]:
            theme.update(themes["suggestions"][ctx.focus.suggestion_key])
        self.theme = theme
        self.hero_key, interest_label = _pick_hero(ctx, heroes)
        self.heroes = heroes
        self.hero = heroes["heroes"][self.hero_key]

        t = self.t
        hero_name = t(self.hero["name"])
        thing = t(self.hero["thing"])
        material = t(self.hero["material"])
        en = self.lang == "en"
        if self.growth:
            strength = ctx.strengths[0].label if ctx.strengths else t(self.frames["default_strength"])
        else:
            strength = (ctx.target_strength.label if ctx.target_strength else None) or (
                ctx.strengths[0].label if ctx.strengths else t(self.frames["default_strength"]))
        helper_key = next((h.key for h in ctx.what_helps if h.key in self.frames["helpers"]), "default")
        self.vars = {
            "name": ctx.name,
            "hero": hero_name,
            "Hero": _cap(hero_name) if en else hero_name,
            "HeroTitle": self.hero["title"]["en"] if en else hero_name,
            "hero_en": self.hero["name"]["en"],
            "emoji": self.hero["emoji"],
            "love": t(self.hero["love"]),
            "thing": thing,
            "Thing": thing.title() if en else thing,
            "material": material,
            "material_lc": (material[:1].lower() + material[1:]) if en else material,
            "placing": t(self.hero["placing"]),
            "group": t(self.hero["group"]),
            "interest": interest_label or t(self.frames["default_interest"]),
            "strength": strength,
            "focus": (ctx.focus.title if ctx.focus and ctx.focus.title else t(self.frames["default_focus"])),
            "helper": ctx.what_helps[0].label if ctx.what_helps else "",
        }
        self.cast = list(ctx.cast)
        self.vars["people"] = self.people()
        self.vars["phrase"] = self.say(theme["phrase"])
        self.vars["goal_child"] = self.say(theme["goal_child"])
        self.vars["helper_line"] = self.say(self.frames["helpers"][helper_key])

    def t(self, entry) -> str:
        if isinstance(entry, str):
            return entry
        if self.lang == "ar" and self.gender == "girl" and entry.get("ar_f"):
            return entry["ar_f"]
        return entry.get(self.lang) or entry["en"]

    def say(self, entry, **extra) -> str:
        values = {**self.vars, **extra} if extra else self.vars
        text = re.sub(r"\{(\w+)\}", lambda m: str(values.get(m.group(1), m.group(0))), self.t(entry))
        return he_gender(text, self.gender) if self.lang == "he" else text

    def choice(self, entry, **extra) -> dict:
        return {"label": self.say(entry, **extra), "emoji": entry.get("emoji")}

    def people(self) -> str:
        """The cast placeholders as one phrase: "{grandfather}", "{grandfather} and {mother}", ..."""
        tokens = [c.token for c in self.cast]
        if len(tokens) < 2:
            return "".join(tokens)
        return self.t(self.frames["cast_comma"]).join(tokens[:-1]) + self.t(self.frames["cast_and"]) + tokens[-1]


def relation_icon(relation: str) -> str:
    item = vocab.item("person_relations", relation) or {}
    return item.get("icon") or "💛"


# --------------------------------------------------------------------------- selection


def theme_key(ctx: AIContext) -> str:
    themes = _data("themes")
    if ctx.mode == "strength_builder":
        key = ctx.target_strength.key if ctx.target_strength and ctx.target_strength.key else None
        key = key or next((s.key for s in ctx.strengths if s.key), None)
        return themes["strength_theme"].get(key or "", "creativity")
    category = ctx.focus.category if ctx.focus else "other"
    return themes["category_theme"].get(category, "social")


def _pick_hero(ctx: AIContext, heroes: dict) -> tuple[str, str | None]:
    excluded = {heroes["avoid"][a] for a in ctx.avoid if a in heroes["avoid"]}
    candidates: list[tuple[str, str]] = []
    for item in ctx.interests:
        key = heroes["by_interest"].get(item.key or "")
        if key and key not in excluded and key not in [c[0] for c in candidates]:
            candidates.append((key, item.label))
    if not candidates:
        default = next(h for h in [heroes["default"], *heroes["order"]] if h not in excluded)
        candidates = [(default, ctx.interests[0].label if ctx.interests else None)]
    return candidates[(ctx.variant or 0) % len(candidates)]


def pick_template(ctx: AIContext) -> str:
    themes = _data("themes")
    key = theme_key(ctx)
    table = themes["game_growth"] if ctx.mode != "strength_builder" else themes["game_strength"]
    return table.get(key, "multiple_choice")


def _other_heroes(kit: _Kit, n: int) -> list[str]:
    order = [h for h in kit.heroes["order"] if h != kit.hero_key]
    return _rotate(order, kit.v)[:n]


def _other_phrases(kit: _Kit, n: int) -> list[str]:
    themes = _data("themes")["themes"]
    keys = sorted(themes)
    start = keys.index(kit.theme_key) + 1
    out: list[str] = []
    for k in keys[start:] + keys[:start]:
        phrase = kit.say(themes[k]["phrase"])
        if phrase != kit.vars["phrase"] and phrase not in out:
            out.append(phrase)
        if len(out) == n:
            break
    return out


# --------------------------------------------------------------------------- builders


def _story_parts(kit: _Kit) -> list[str]:
    f, th = kit.frames, kit.theme
    action = kit.say(th["action"])
    if kit.growth:
        action = f"{action} {kit.vars['helper_line']}"
        close = kit.say(f["close_growth"])
    else:
        close = kit.say(th.get("praise") or f["praise_default"])
    parts = [
        kit.say(f["story_open"][kit.v % len(f["story_open"])]),
        kit.say(th["situation"]),
        action,
        kit.say(th["ending"]),
        close,
    ]
    if kit.cast:
        parts.insert(1, kit.say(f["cast_line"]))
    return parts


def _pictures(kit: _Kit) -> list[str]:
    """One emoji per story paragraph / video scene (the cast line gets the first person's icon)."""
    pictures = [kit.hero["emoji"], kit.theme["sequence"][0]["emoji"], "💬", "🌟", "😊"]
    if kit.cast:
        pictures.insert(1, relation_icon(kit.cast[0].relation))
    return pictures


def _goal(kit: _Kit) -> str:
    return kit.say(kit.frames["goal_growth" if kit.growth else "goal_strength"])


def story(kit: _Kit) -> dict:
    f, th = kit.frames, kit.theme
    return {
        "title": kit.say(th["story_title"]),
        "goal": _goal(kit),
        "story": _story_parts(kit),
        "questions": [
            kit.say(f["q_say"] if kit.growth else f["q_do"]),
            kit.say(f["q_feel"]),
            kit.say(th["question"]),
        ],
        "teacher_note": kit.say(f["note_growth" if kit.growth else "note_strength"]),
        "illustrations": _pictures(kit),
    }


def activity(kit: _Kit) -> dict:
    f, th = kit.frames, kit.theme
    materials: list[str] = []
    for m in [kit.vars["material"], *[kit.say(x) for x in th["materials"]]]:
        if m.lower() not in [x.lower() for x in materials]:
            materials.append(m)
    adaptation = kit.say(th["adaptation"])
    if kit.vars["helper"]:
        adaptation = f"{adaptation} {kit.say(f['adapt_helper'])}"
    return {
        "title": kit.say(th["activity_title"]),
        "goal": _goal(kit),
        "duration_minutes": th["duration"],
        "materials": materials,
        "instructions": [kit.say(s) for s in th["steps"]] + [kit.say(f["activity_close"])],
        "what_to_observe": [kit.say(o) for o in th["observe"]] + [kit.say(f["observe_support"])],
        "adaptation": adaptation,
    }


def _round(question: str, choices: list[dict], answer_label: str | None, explanation: str, v: int) -> dict:
    choices = _rotate(choices, v)
    answer = next((i for i, c in enumerate(choices) if c["label"] == answer_label), None) if answer_label else None
    return {"question": question, "choices": choices, "correct_or_preferred_answer": answer, "explanation": explanation}


def _item(kit: _Kit, hero_key: str, index: int, side: int = 0) -> dict:
    entry = kit.heroes["heroes"][hero_key]["pairs"][index % 3][side]
    return kit.choice(entry)


def game(kit: _Kit, template: str) -> dict:
    f, th, v = kit.frames, kit.theme, kit.v
    out: dict = {
        "template": template,
        "title": kit.say(f["game_titles"][template]),
        "intro": kit.say(f["game_intros"][template]),
    }
    if template == "multiple_choice":
        phrase = kit.vars["phrase"]
        emojis = f["mc_choice_emojis"]
        c1 = [{"label": p, "emoji": emojis[i]} for i, p in enumerate([phrase, *_other_phrases(kit, 2)])]
        mine = _item(kit, kit.hero_key, v)
        c2 = [mine] + [_item(kit, h, v) for h in _other_heroes(kit, 2)]
        out["rounds"] = [
            _round(kit.say(f["mc_q1"]), c1, phrase, kit.say(f["mc_e1"]), v + 1),
            _round(kit.say(f["mc_q2"]), c2, mine["label"],
                   kit.say(f["mc_e2"], item=mine["label"], emoji=mine["emoji"]), v + 2),
        ]
    elif template == "emotion_choice":
        feelings = [kit.choice(x) for x in f["feelings"]]
        happy = feelings[0]["label"]
        out["rounds"] = [
            _round(f"{kit.say(th['situation'])} {kit.say(f['emo_ask1'])}", feelings, None, kit.say(f["emo_e1"]), v),
            _round(f"{kit.say(th['ending'])} {kit.say(f['emo_ask2'])}", feelings, happy, kit.say(f["emo_e2"]), v + 1),
        ]
    elif template == "what_happens_next":
        good = kit.choice(f["whn_good"])
        tidy = kit.choice(f["whn_q2_good"])
        out["rounds"] = [
            _round(f"{kit.say(th['situation'])} {kit.say(f['whn_ask'])}",
                   [good] + [kit.choice(a) for a in f["whn_alts"]], good["label"], kit.say(th["ending"]), v + 1),
            _round(kit.say(f["whn_q2"]), [tidy, kit.choice(f["whn_q2_alt"])], tidy["label"], kit.say(f["whn_e2"]), v),
        ]
    elif template == "match_pairs":
        pairs = [{"left": _item(kit, kit.hero_key, i, 0), "right": _item(kit, kit.hero_key, i, 1)} for i in range(3)]
        other = _other_heroes(kit, 1)[0]
        pairs.append({"left": _item(kit, other, v, 0), "right": _item(kit, other, v, 1)})
        out["pairs"] = _rotate(pairs, v)
    elif template == "sequence":
        out["items"] = [kit.choice(x) for x in th["sequence"]]
    elif template == "categorize":
        other = _other_heroes(kit, 1)[0]
        groups = [(kit.hero_key, kit.hero), (other, kit.heroes["heroes"][other])]
        out["categories"] = [{"key": k, "label": kit.t(h["group"]), "emoji": h["emoji"]} for k, h in groups]
        items = []
        for i in range(3):
            for k, _ in groups:
                items.append({**_item(kit, k, i), "category": k})
        out["items"] = _rotate(items, v)
    elif template == "story_builder":
        out["steps"] = [
            {"prompt": kit.say(step["prompt"]), "choices": _rotate([kit.choice(c) for c in step["choices"]], v)}
            for step in f["story_builder"]
        ]
        if kit.cast:
            # "Who comes along?": the chosen people (their photos on the cards), plus the hero for one person.
            choices = [{"label": c.token, "emoji": relation_icon(c.relation)} for c in kit.cast]
            if len(choices) < 2:
                choices.append({"label": kit.vars["Hero"], "emoji": kit.hero["emoji"]})
            out["steps"].insert(1, {"prompt": kit.say(f["story_builder_cast"]), "choices": choices})
        out["closing_prompt"] = kit.say(f["story_builder_closing"])
    else:
        raise ValueError(f"unknown game template {template!r}")
    return out


def video(kit: _Kit) -> dict:
    f = kit.frames
    parts = _story_parts(kit)
    pictures = _pictures(kit)
    scenes = []
    for i, narration in enumerate(parts, start=1):
        scenes.append({
            "description": kit.say(f["video_scene"], n=i),
            "narration": narration,
            "visual_prompt": kit.say(f["video_visual"], n=i, beat=f["video_beats"][(i - 1) % len(f["video_beats"])]),
            "emoji": pictures[(i - 1) % len(pictures)],
        })
    return {
        "title": kit.say(kit.theme["story_title"]),
        "learning_goal": _goal(kit),
        "script": " ".join(parts),
        "scenes": scenes,
        "duration_seconds": 60,
    }


def pack(kit: _Kit, template: str) -> dict:
    return {
        "story": story(kit),
        "activity": activity(kit),
        "game": game(kit, template),
        "discussion_prompts": [kit.say(d) for d in kit.frames["discussion"]],
        "video": video(kit) if kit.ctx.include_video else None,
    }


def generate(kind: str, ctx: AIContext, template: str | None = None) -> dict:
    kit = _Kit(ctx)
    if kind == "story":
        return story(kit)
    if kind == "real_world_activity":
        return activity(kit)
    if kind == "digital_game":
        return game(kit, template or ctx.template or pick_template(ctx))
    if kind == "video":
        return video(kit)
    if kind == "pack":
        return pack(kit, template or ctx.template or pick_template(ctx))
    raise ValueError(f"unknown kind {kind!r}")


# --------------------------------------------------------------------------- understanding

_SUPPORT_RANK = {"independent": 0, "some_support": 1, "significant_support": 2}


def frame_text(key: str, ctx: AIContext, **values) -> str:
    kit_vars = {"name": ctx.name, **{k: str(v) for k, v in values.items()}}
    entry = _data("frames")["understanding"][key]
    text = entry.get(ctx.language) or entry["en"]
    text = re.sub(r"\{(\w+)\}", lambda m: kit_vars.get(m.group(1), m.group(0)), text)
    return he_gender(text, ctx.gender) if ctx.language == "he" else text


def _profile_items(items) -> list[dict]:
    out = []
    for it in items:
        if it.key:
            out.append({"key": it.key, "custom": None, "label": it.label, "note": None})
        else:
            out.append({"key": None, "custom": it.label[:120], "label": it.label, "note": None})
    return out


def _less_support(observations: list[dict]) -> bool:
    ranks = [_SUPPORT_RANK[o["support_level"]] for o in observations if o.get("support_level") in _SUPPORT_RANK]
    if len(ranks) < 2:
        return False
    half = len(ranks) // 2
    early, late = ranks[:half], ranks[half:]
    return sum(late) / len(late) < sum(early) / len(early)


def _sep(ctx: AIContext) -> str:
    return "، " if ctx.language == "ar" else ", "


def _summary_parts(ctx: AIContext, observations: list[dict], focus_areas: list[dict]) -> list[str]:
    sep = _sep(ctx)
    n = len(observations)
    parts = []
    if ctx.interests:
        parts.append(frame_text("intro", ctx, interests=sep.join(i.label for i in ctx.interests)))
    else:
        parts.append(frame_text("intro_none", ctx))
    if ctx.strengths:
        parts.append(frame_text("strengths", ctx, strengths=sep.join(s.label for s in ctx.strengths)))
    parts.append(frame_text("count", ctx, n=n))
    if n < 3:
        parts.append(frame_text("few", ctx))
    if focus_areas:
        parts.append(frame_text("focus", ctx, focus=sep.join(fa["title"] for fa in focus_areas if fa.get("title"))))
    return parts


def possible_patterns(ctx: AIContext, observations: list[dict], focus_areas: list[dict]) -> list[str]:
    """Hedged sentences only ("may", "appears"), and only with enough observations."""
    out = []
    for fa in focus_areas:
        linked = [o for o in observations if o.get("focus_area_id") == fa.get("id")]
        if len(linked) >= 3 and _less_support(linked) and fa.get("title"):
            out.append(frame_text("pp_less_support", ctx, focus=fa["title"]))
    if ctx.what_helps and len(observations) >= 3:
        out.append(frame_text("pp_helps", ctx, helps=_sep(ctx).join(h.label for h in ctx.what_helps)))
    return out[:5]


def next_observation_questions(ctx: AIContext, focus_areas: list[dict]) -> list[dict]:
    out = []
    for fa in focus_areas[:3]:
        if not fa.get("title"):
            continue
        domains = for_focus(fa.get("category"), fa.get("suggestion_key")) or ["social"]
        out.append({"domain": domains[0], "question": frame_text("nq_focus", ctx, focus=fa["title"])})
    if ctx.what_helps:
        domain = next((d for d, b in ctx.domains.items() if b.helps), "daily_routine")
        out.append({"domain": domain, "question": frame_text("nq_helps", ctx,
                                                             helps=_sep(ctx).join(h.label for h in ctx.what_helps))})
    if len(out) < 2:
        out.append({"domain": "play", "question": frame_text("nq_play", ctx)})
    return out[:5]


def suggest_understanding(ctx: AIContext, observations: list[dict], focus_areas: list[dict],
                          baseline_items: list[dict]) -> dict:
    """observations: [{id, focus_area_id, support_level, text}] since the latest baseline, oldest first."""
    sep = _sep(ctx)
    parts = _summary_parts(ctx, observations, focus_areas)

    by_focus = Counter(o["focus_area_id"] for o in observations if o.get("focus_area_id"))
    focus_review = []
    for fa in focus_areas:
        fid = fa["id"]
        linked = [o for o in observations if o.get("focus_area_id") == fid]
        count = by_focus.get(fid, 0)
        if count < 3:
            status, note = "needs_more_observation", frame_text("fr_few", ctx)
        elif _less_support(linked):
            status, note = "some_improvement", frame_text("fr_less_support", ctx, n=count)
        else:
            status, note = "no_clear_change", frame_text("fr_no_change", ctx, n=count)
        focus_review.append({"focus_area_id": fid, "status": status, "note": note})

    validation = []
    for item in baseline_items:
        label = (item.get("label") or "").strip()
        key = item.get("key")
        if item.get("list") == "focus":
            linked = [o["id"] for o in observations if key and o.get("focus_area_id") == key]
        else:
            linked = [o["id"] for o in observations if label and label.lower() in (o.get("text") or "").lower()]
        if len(linked) < 3:
            status, note = "needs_more_observation", frame_text("bv_few", ctx)
        else:
            status, note = "partially_supported", frame_text("bv_some", ctx, n=len(linked))
        validation.append({
            "list": item.get("list"),
            "key": key,
            "custom": item.get("custom"),
            "label": label or (key or item.get("custom") or "-"),
            "status": status,
            "note": note,
            "observation_ids": linked[:50],
        })

    helps = sep.join(h.label for h in ctx.what_helps)
    default_interest = _data("frames")["default_interest"]
    interest = ctx.interests[0].label if ctx.interests else (default_interest.get(ctx.language) or default_interest["en"])
    return {
        "summary": " ".join(parts),
        "strengths": _profile_items(ctx.strengths),
        "interests": _profile_items(ctx.interests),
        "what_helps": _profile_items(ctx.what_helps),
        "areas_for_support": [fa["title"] for fa in focus_areas if fa.get("title")][:6],
        "adaptations": frame_text("adaptations", ctx, helps=helps) if helps else frame_text("adaptations_none", ctx),
        "next_steps": frame_text("next_steps", ctx, interest=interest),
        "baseline_validation": validation,
        "focus_review": focus_review,
        "possible_patterns": possible_patterns(ctx, observations, focus_areas),
        "next_observation_questions": next_observation_questions(ctx, focus_areas),
    }


# --------------------------------------------------------------------------- functional summary (Domain 17)


def functional_summary(ctx: AIContext, observations: list[dict], focus_areas: list[dict]) -> dict:
    """A FunctionalSummaryDraft from the profile labels, the current understanding and the focus
    areas. Never anything about following up with the parents, involvement or goal decisions."""
    sep = _sep(ctx)
    helps = sep.join(h.label for h in ctx.what_helps)
    cu = ctx.current_understanding
    adaptations = (cu.adaptations if cu and cu.adaptations else None) or (
        frame_text("adaptations", ctx, helps=helps) if helps else frame_text("adaptations_none", ctx))
    strengths = [{"key": s.key, "custom": None, "label": s.label} if s.key
                 else {"key": None, "custom": s.label[:120], "label": s.label[:120]} for s in ctx.strengths][:5]
    return {
        "general_description": " ".join(_summary_parts(ctx, observations, focus_areas))[:2000],
        "main_strengths": {"items": strengths, "text": None},
        "main_needs": {"items": [fa["title"][:300] for fa in focus_areas if fa.get("title")][:4], "text": None},
        "adaptations": adaptations[:1000],
        "team_recommendations": frame_text("fs_team", ctx, helps=helps) if helps else frame_text("fs_team_none", ctx),
        "possible_patterns": possible_patterns(ctx, observations, focus_areas),
        "next_observation_questions": next_observation_questions(ctx, focus_areas),
    }
