"""Development reviews: suggest a current understanding, save the teacher-approved
review, list past reviews (spec §3, §12, §22–27; PLAN-ADJUSTMENTS B3, B6, B12;
COVERAGE-MATRIX §4.3, Domain 16, X-17, X-19, X-24).

Staff only; parents (and anyone out of scope) get 404, like observations.

- ``suggest`` builds the AI context, the observations since the latest baseline,
  the active focus areas and the key baseline items, and asks
  ``app.ai.service.suggest_understanding(db, child, user, ctx, ...)`` (WP2-AI; Claude
  or templates; the B6 downgrade is applied there). Analysis payloads are
  de-identified ([child], [friend], [adult]) and custom entries that only a parent
  gave are not sent. The only thing it writes is ONE ``ai_suggestions`` row (kind
  ``understanding``: the de-identified input, the output and the provider; earlier
  pending suggestions of the child become ``discarded``, X-19) and its
  audit row. The response adds ``suggestion_id``, ``possible_patterns`` and
  ``next_observation_questions``. It never contains the Domain 16 follow-up (involvement,
  reassessment date): those are teacher-only.
- ``create_review`` runs in ONE transaction: focus decisions (pause/close first,
  then edits, then keep-reactivations and creates against the 3-active limit;
  409 FOCUS_LIMIT rolls back everything), the ``development_reviews`` row (with
  the Domain 16 ``follow_up`` block and ``ai_suggestion_id``), one
  ``record_versions`` row per changed goal (via ``review``, with the review id),
  ``child_profiles.current_understanding`` (source review, teacher-approved), the
  B3 merge of the approved strengths / interests / what_helps into the profile
  lists (``sources += ['review']``) and the outcome of the AI suggestion it
  started from (``accepted`` when the approved understanding is the suggestion as
  it was, else ``edited``). Baselines are never touched. A status other than
  needs_more_observation resting on fewer than 3 observations since the baseline
  is saved as chosen but reported in ``warnings``; so is wording to avoid in
  ``follow_up.involvement.note`` (code WORDING; every other teacher text gets 422
  UNSAFE_CONTENT).

Review JSON::

    {id, child_id, review_date, summary, ai_suggested, ai_suggestion_id, created_at,
     created_by: {id, name} | null, provenance: ["teacher_approved"],
     understanding: {summary, strengths[], interests[], what_helps[], areas_for_support[], adaptations, next_steps},
     focus_review: [{focus_area_id, title, status, decision, what_worked, what_to_change, note}],
     baseline_validation: [{list, key, custom, label, status, note, observation_ids[]}],
     follow_up: {reassessment_on, improvement: {level, note}, areas: {domains[], focus_area_ids[], text},
                 what_worked, what_to_change, involvement: {key, note}} | null}

Draft context (``context`` of GET, also in the /suggest response)::

    {baseline: {id, created_at, summary} | null, observation_count_since_baseline, max_active,
     focus_areas: [{id, category, suggestion_key, title, description, plan, observation_count,
                    changes: {yes|partly|no: [{id, observed_at}]}}],
       (``changes``: the stage-E results of the focus since the last review, else the baseline)
     baseline_items: [{list, key, custom, label}]}

Counts are plain numbers of observations for the UI to put into words; nothing is
ever a score or a percentage (spec §26).

Shared with functional summaries: ``find_suggestion`` (this child's suggestion of a
kind, or 400). Outcomes are set through ``app.ai.service.resolve_suggestion``.
"""
import copy
from collections import Counter
from datetime import date
from types import SimpleNamespace

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import provenance, vocab
from app.ai import build_context
from app.ai import service as ai_service
from app.ai.context import staff_confirmed
from app.ai.safety import text_issues
from app.audit import audit
from app.errors import AppError
from app.models import (
    AiSuggestion,
    Baseline,
    Child,
    ChildProfile,
    DevelopmentReview,
    FocusArea,
    Observation,
    User,
)
from app.schemas.profile import ident
from app.schemas.reviews import NEEDS_MORE, WHAT_HELPS_LISTS, ReviewCreate, ReviewItem, SuggestIn
from app.services.baselines import initial_understanding, support_needs
from app.services.content import adult_names, classmate_names
from app.services.focus_areas import (
    MAX_ACTIVE,
    active_count,
    check_assessment,
    check_review_on,
    focus_out,
    open_assessment_id,
    record_version,
)
from app.services.observations import staff_child
from app.services.profiles import get_profile_row, iso, perspective
from app.sessions import utcnow

MIN_LINKED_OBSERVATIONS = 3
MAX_OBSERVATIONS = 200
ITEM_LIMITS = {"strengths": 6, "interests": 6, "what_helps": 6, "support_needs": 6}
PROFILE_LISTS = ("strengths", "interests", "what_helps")
# Teacher-only Domain 16 keys: never part of what /suggest returns.
TEACHER_ONLY_KEYS = ("follow_up", "involvement", "reassessment_on")

# --------------------------------------------------------------------------- lookups

def latest_baseline(db: Session, child_id) -> Baseline | None:
    return db.scalars(
        select(Baseline).where(Baseline.child_id == child_id).order_by(Baseline.created_at.desc(), Baseline.id).limit(1)
    ).first()

def _since(stmt, since):
    return stmt.where(Observation.observed_at >= since) if since is not None else stmt

def observations_since(db: Session, child_id, since) -> list[Observation]:
    """Observations since the baseline (all when there is none), oldest first; the newest MAX_OBSERVATIONS."""
    stmt = _since(select(Observation).where(Observation.child_id == child_id), since)
    rows = db.scalars(stmt.order_by(Observation.observed_at.desc(), Observation.id.desc()).limit(MAX_OBSERVATIONS)).all()
    return list(reversed(rows))

def _count_since(db: Session, child_id, since) -> int:
    stmt = _since(select(func.count()).select_from(Observation).where(Observation.child_id == child_id), since)
    return db.scalar(stmt) or 0

def _focus_counts(db: Session, child_id, since) -> Counter:
    stmt = _since(
        select(Observation.focus_area_id, func.count()).where(
            Observation.child_id == child_id, Observation.focus_area_id.is_not(None)
        ),
        since,
    ).group_by(Observation.focus_area_id)
    return Counter({str(fid): n for fid, n in db.execute(stmt).all()})

CHANGE_KEYS = ("yes", "partly", "no")
MAX_CHANGES = 10


def _last_review_at(db: Session, child_id):
    return db.scalar(select(func.max(DevelopmentReview.created_at)).where(DevelopmentReview.child_id == child_id))


def _focus_changes(db: Session, child_id, since, focus_ids) -> dict[str, dict[str, list[dict]]]:
    """Stage E per focus (OM-D14-10, X-38): ``{focus_id: {yes|partly|no: [{id, observed_at}]}}`` for
    the observations linked to the focus (or applying its plan, ``details.plan_ref``) since ``since``,
    newest first, at most MAX_CHANGES per result. Dated items, never a count or a score."""
    ids = {str(f) for f in focus_ids}
    if not ids:
        return {}
    change = Observation.details["did_it_change"].astext
    ref = Observation.details["plan_ref"]["focus_area_id"].astext
    stmt = _since(
        select(Observation.id, Observation.observed_at, Observation.focus_area_id, ref, change)
        .where(Observation.child_id == child_id, change.in_(CHANGE_KEYS)),
        since,
    ).order_by(Observation.observed_at.desc(), Observation.id.desc())
    out: dict[str, dict[str, list[dict]]] = {}
    for oid, at, fid, ref_id, result in db.execute(stmt).all():
        for focus_id in dict.fromkeys(x for x in (str(fid) if fid else None, ref_id) if x in ids):
            bucket = out.setdefault(focus_id, {k: [] for k in CHANGE_KEYS})[result]
            if len(bucket) < MAX_CHANGES:
                bucket.append({"id": str(oid), "observed_at": iso(at)})
    return out


def _active_focus(db: Session, child_id) -> list[FocusArea]:
    return list(db.scalars(
        select(FocusArea).where(FocusArea.child_id == child_id, FocusArea.status == "active")
        .order_by(FocusArea.created_at, FocusArea.id)
    ))

def _profile(db: Session, child_id) -> ChildProfile | None:
    return db.scalars(select(ChildProfile).where(ChildProfile.child_id == child_id)).first()

def _user_names(db: Session, ids) -> dict:
    ids = {i for i in ids if i is not None}
    return dict(db.execute(select(User.id, User.name).where(User.id.in_(ids))).all()) if ids else {}

# --------------------------------------------------------------------------- baseline items

def _label(lists, key: str, lang: str) -> str | None:
    for name in lists:
        try:
            if vocab.is_valid(name, key):
                return vocab.label(name, key, lang)
        except KeyError:
            continue
    return None

def _as_item(raw) -> dict | None:
    if isinstance(raw, str):
        return {"key": raw}
    if isinstance(raw, dict) and (raw.get("key") or raw.get("custom")):
        return raw
    return None

def _sendable(it: dict, for_ai: bool) -> bool:
    """For the AI, a custom entry needs a staff source: a parent's own wording is never sent."""
    return not for_ai or bool(it.get("key")) or staff_confirmed(it)

def _list_items(list_name: str, items, lang: str, for_ai: bool = False) -> list[dict]:
    lookup = {"strengths": ("strengths",), "interests": ("interests",)}.get(list_name, WHAT_HELPS_LISTS)
    out = []
    for raw in items or []:
        it = _as_item(raw)
        if it is None or not _sendable(it, for_ai):
            continue
        if it.get("key"):
            lists = ((it["list"],) if it.get("list") else ()) + lookup
            label = _label(lists, it["key"], lang)
            if label is None:
                continue
            out.append({"list": list_name, "key": it["key"], "custom": None, "label": label})
        else:
            out.append({"list": list_name, "key": None, "custom": str(it["custom"])[:120], "label": str(it["custom"])[:160]})
        if len(out) >= ITEM_LIMITS[list_name]:
            break
    return out

def _support_need_items(needs: dict, lang: str, for_ai: bool = False) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for entry in needs.get("independence") or []:
        area = entry.get("area")
        if area and area not in seen:
            label = _label(("independence_areas",), area, lang)
            if label:
                seen.add(area)
                out.append({"list": "support_needs", "key": area, "custom": None, "label": label})
    for raw in needs.get("sensitivities") or []:
        it = _as_item(raw)
        if it is None or not _sendable(it, for_ai):
            continue
        if it.get("key"):
            label = _label(("sensitivities",), it["key"], lang)
            if label and it["key"] not in seen:
                seen.add(it["key"])
                out.append({"list": "support_needs", "key": it["key"], "custom": None, "label": label})
        else:
            out.append({"list": "support_needs", "key": None, "custom": str(it["custom"])[:120],
                        "label": str(it["custom"])[:160]})
    return out[:ITEM_LIMITS["support_needs"]]

def baseline_items(baseline: Baseline | None, profile: ChildProfile | None, focus_rows, lang: str,
                   for_ai: bool = False) -> list[dict]:
    """The key initial assumptions to validate: {list, key|custom, label}.

    From the latest baseline snapshot; without a baseline, from the current
    profile lists and active focus areas. Focus items use the focus area id as key.
    ``for_ai=True`` leaves out custom entries that only a parent gave (the copy sent to the AI;
    the review screen gets every item).
    """
    if baseline is not None:
        data = baseline.baseline_data or {}
        lists = {name: data.get(name) or [] for name in PROFILE_LISTS}
        needs = data.get("support_needs") or {}
        focus = [f for f in data.get("focus_areas") or [] if isinstance(f, dict) and f.get("id")]
    else:
        lists = {name: (getattr(profile, name) or []) if profile else [] for name in PROFILE_LISTS}
        sens = (profile.sensitivities or []) if profile else []
        needs = support_needs(perspective(profile, "parent"), perspective(profile, "teacher"), sens) if profile else {}
        focus = [{"id": str(f.id), "title": f.title} for f in focus_rows]
    items: list[dict] = []
    for name in PROFILE_LISTS:
        items += _list_items(name, lists[name], lang, for_ai)
    items += _support_need_items(needs, lang, for_ai)
    for f in focus[:3]:
        items.append({"list": "focus", "key": str(f["id"]), "custom": None, "label": (f.get("title") or "")[:160] or "-"})
    return items

# --------------------------------------------------------------------------- output

def _baseline_summary(child: Child, baseline: Baseline, lang: str) -> str | None:
    """The first-picture summary, worded as when the baseline was created (it is not stored in the snapshot)."""
    data = baseline.baseline_data or {}
    lists = SimpleNamespace(**{name: data.get(name) or [] for name in PROFILE_LISTS})
    focus = [SimpleNamespace(title=f["title"]) for f in data.get("focus_areas") or [] if isinstance(f, dict) and f.get("title")]
    return initial_understanding(child, lists, focus, lang, baseline.id, baseline.created_at).get("summary")

def _baseline_ref(baseline: Baseline | None, child: Child, lang: str) -> dict | None:
    if baseline is None:
        return None
    return {"id": str(baseline.id), "created_at": iso(baseline.created_at), "summary": _baseline_summary(child, baseline, lang)}

def draft_context(db: Session, child: Child, lang: str, profile=None, baseline=None, focus_rows=None) -> dict:
    """What the review screen needs to start (blank or suggested)."""
    since = baseline.created_at if baseline else None
    counts = _focus_counts(db, child.id, since)
    focus_rows = _active_focus(db, child.id) if focus_rows is None else focus_rows
    changes = _focus_changes(db, child.id, _last_review_at(db, child.id) or since, [f.id for f in focus_rows])
    return {
        "baseline": _baseline_ref(baseline, child, lang),
        "observation_count_since_baseline": _count_since(db, child.id, since),
        "max_active": MAX_ACTIVE,
        "focus_areas": [
            {**{k: v for k, v in focus_out(f).items()
                if k in ("id", "category", "suggestion_key", "title", "description", "plan", "status", "created_at")},
             "observation_count": counts.get(str(f.id), 0),
             "changes": changes.get(str(f.id)) or {k: [] for k in CHANGE_KEYS}}
            for f in focus_rows
        ],
        "baseline_items": baseline_items(baseline, profile, focus_rows, lang),
    }

def review_out(row: DevelopmentReview, names: dict) -> dict:
    return {
        "id": str(row.id),
        "child_id": str(row.child_id),
        "review_date": row.review_date.isoformat() if row.review_date else None,
        "summary": row.summary,
        "understanding": row.understanding,
        "focus_review": row.focus_review or [],
        "baseline_validation": row.baseline_validation or [],
        "follow_up": row.follow_up,
        "ai_suggested": row.ai_suggested,
        "ai_suggestion_id": str(row.ai_suggestion_id) if row.ai_suggestion_id else None,
        "provenance": provenance.derive(approved=True),
        "created_by": {"id": str(row.created_by), "name": names.get(row.created_by)} if row.created_by else None,
        "created_at": iso(row.created_at),
    }

# --------------------------------------------------------------------------- AI suggestions (X-19)

def find_suggestion(db: Session, child_id, suggestion_id, kind: str, path: str = "ai_suggestion_id") -> AiSuggestion:
    """This child's suggestion of that kind (locked for the outcome update), or 400."""
    row = db.scalars(select(AiSuggestion).where(AiSuggestion.id == suggestion_id, AiSuggestion.child_id == child_id)
                     .with_for_update()).first()
    if row is None or row.kind != kind:
        raise _invalid(path, "unknown suggestion")
    return row

def _norm(text) -> str:
    return " ".join(text.split()) if isinstance(text, str) else ""

def _idents(items) -> set:
    return {i for i in (ident(it) for it in items or []) if i is not None}

def understanding_outcome(output: dict, understanding: dict) -> str:
    """``accepted`` when the approved understanding is the suggestion as it was, else ``edited``."""
    out = output or {}
    same = all(_norm(out.get(k)) == _norm(understanding.get(k)) for k in ("summary", "adaptations", "next_steps"))
    same = same and [_norm(a) for a in out.get("areas_for_support") or []] == \
        [_norm(a) for a in understanding.get("areas_for_support") or []]
    same = same and all(_idents(out.get(n)) == _idents(understanding.get(n)) for n in PROFILE_LISTS)
    return "accepted" if same else "edited"

# --------------------------------------------------------------------------- endpoints: read

def list_reviews(db: Session, user: User, child_id) -> dict:
    child = staff_child(db, user, child_id)
    rows = db.scalars(
        select(DevelopmentReview).where(DevelopmentReview.child_id == child.id)
        .order_by(DevelopmentReview.created_at.desc(), DevelopmentReview.id.desc())
    ).all()
    names = _user_names(db, [r.created_by for r in rows])
    lang = user.language or "en"
    context = draft_context(db, child, lang, profile=_profile(db, child.id), baseline=latest_baseline(db, child.id))
    return {"reviews": [review_out(r, names) for r in rows], "context": context}

def suggest(db: Session, user: User, child_id, body: SuggestIn | None) -> dict:
    """Suggested understanding, focus statuses and baseline validation. Writes only the
    ai_suggestions row (and discards the earlier pending one)."""
    child = staff_child(db, user, child_id)
    lang = (body.language if body else None) or user.language or "en"
    profile = _profile(db, child.id)
    baseline = latest_baseline(db, child.id)
    since = baseline.created_at if baseline else None
    focus_rows = _active_focus(db, child.id)
    observations = observations_since(db, child.id, since)
    context = draft_context(db, child, lang, profile=profile, baseline=baseline, focus_rows=focus_rows)
    # Every free text that may reach the AI is masked right before the call (app.ai.service):
    # the child's names → [child], other children's → [friend], parents' and teachers' → [adult]
    # (observations, focus areas, baseline items, custom labels, the current understanding), as
    # for content generation. The context keeps the teacher's wording for the template provider.
    # Custom entries only a parent gave are left out of what the AI gets.
    ctx = build_context(
        child=child, profile=profile, mode=None, content_type="understanding", language=lang,
        current_understanding=profile.current_understanding if profile else None, mask_free_text=False,
    )
    ai_items = baseline_items(baseline, profile, focus_rows, lang, for_ai=True)
    # Contract with WP2-AI: the suggestion plus ONE ai_suggestions row holding the de-identified
    # input, the output and the provider (earlier pending ones are discarded). Flushes only.
    result, row = ai_service.suggest_understanding(
        db, child, user, ctx, observations, focus_rows, ai_items,
        classmate_names=classmate_names(db, child), adult_names=adult_names(db, child), baseline_at=since)
    output = result.suggestion.model_dump(mode="json")
    for key in TEACHER_ONLY_KEYS:  # the follow-up block is the teacher's alone
        output.pop(key, None)
    audit(db, user, "review.suggest", "ai_suggestion", row.id, child_id=child.id, provider=result.provider,
          is_template=result.is_template)
    out = {
        "suggestion": output,
        "suggestion_id": str(row.id),
        "possible_patterns": list(output.get("possible_patterns") or []),
        "next_observation_questions": list(output.get("next_observation_questions") or []),
        "provider": result.provider,
        "is_template": result.is_template,
        **context,
    }
    db.commit()
    return out

# --------------------------------------------------------------------------- endpoints: save

def _invalid(path: str, message: str) -> AppError:
    return AppError("VALIDATION", details=[{"path": path, "message": message}])

def _stored_items(name: str, items: list[ReviewItem], path: str) -> list[dict]:
    """Validated input items → stored {key[, list]} | {custom} (deduplicated)."""
    out: list[dict] = []
    seen: set = set()
    for i, it in enumerate(items):
        if it.custom is not None:
            item = {"custom": it.custom}
        elif name == "what_helps":
            lists = (it.list,) if it.list else WHAT_HELPS_LISTS
            found = next((n for n in lists if n in WHAT_HELPS_LISTS and vocab.is_valid(n, it.key)), None)
            if found is None:
                raise _invalid(f"{path}.{i}.key", f"unknown what helps key {it.key!r}")
            item = {"key": it.key, "list": found}
        else:
            if it.list is not None:
                raise _invalid(f"{path}.{i}.list", "list is only used for what helps")
            if not vocab.is_valid(name, it.key):
                raise _invalid(f"{path}.{i}.key", f"unknown {name} key {it.key!r}")
            item = {"key": it.key}
        key = ident(item)
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out

def _focus_part_texts(p: str, part) -> list[tuple[str, str | None]]:
    texts = [(f"{p}.title", part.title), (f"{p}.description", part.description)]
    if part.plan is not None:
        texts += [(f"{p}.plan.{k}", v) for k, v in part.plan.model_dump().items()]
    return texts

def _check_wording(body: ReviewCreate) -> list[dict]:
    """Teacher text must use everyday, observational words (spec §2): clinical terms → 422.
    The one exception is ``follow_up.involvement.note``: it only gets a WORDING warning (OQ-3).
    Returns those warnings."""
    texts: list[tuple[str, str | None]] = [("summary", body.summary)]
    u = body.understanding
    texts += [("understanding.summary", u.summary), ("understanding.adaptations", u.adaptations),
              ("understanding.next_steps", u.next_steps)]
    texts += [(f"understanding.areas_for_support.{i}", s) for i, s in enumerate(u.areas_for_support)]
    for name in PROFILE_LISTS:
        texts += [(f"understanding.{name}.{i}.custom", it.custom) for i, it in enumerate(getattr(u, name))]
    for i, f in enumerate(body.focus_review):
        p = f"focus_review.{i}"
        texts += [(f"{p}.what_worked", f.what_worked), (f"{p}.what_to_change", f.what_to_change), (f"{p}.note", f.note)]
        for part_name, part in (("edit", f.edit), ("create", f.create)):
            if part is not None:
                texts += _focus_part_texts(f"{p}.{part_name}", part)
    for i, b in enumerate(body.baseline_validation):
        texts.append((f"baseline_validation.{i}.note", b.note))  # labels/custom texts come from the profile
    warned: list[tuple[str, str | None]] = []
    fu = body.follow_up
    if fu is not None:
        texts += [("follow_up.what_worked", fu.what_worked), ("follow_up.what_to_change", fu.what_to_change)]
        if fu.improvement is not None:
            texts.append(("follow_up.improvement.note", fu.improvement.note))
        if fu.areas is not None:
            texts.append(("follow_up.areas.text", fu.areas.text))
        if fu.involvement is not None:
            warned.append(("follow_up.involvement.note", fu.involvement.note))
    details = [{"path": path, "message": issue} for path, text in texts if text for issue in text_issues(text, False)]
    if details:
        raise AppError("UNSAFE_CONTENT", "Please describe what you see in everyday words.", details=details[:20])
    return [{"code": "WORDING", "path": path, "message": issue}
            for path, text in warned if text for issue in text_issues(text, False)]

def _close(db: Session, user: User, row: FocusArea, status: str, reason: str | None, now, review_marker: str) -> bool:
    if row.status == status:
        return False
    if row.status == "completed" and status == "paused":
        raise AppError("INVALID_TRANSITION", "A completed focus cannot be paused.")
    row.status = status
    row.closed_at = now
    if status == "completed":
        row.close_reason = reason
    audit(db, user, "focus.close", "focus_area", row.id, child_id=row.child_id, status=status, via=review_marker)
    return True

def _edit(db: Session, user: User, row: FocusArea, edit, review_marker: str, path: str) -> bool:
    sent = edit.model_fields_set
    changed = []
    if "title" in sent and edit.title is not None and edit.title != row.title:
        row.title = edit.title
        changed.append("title")
    if "description" in sent and edit.description != row.description:
        row.description = edit.description
        changed.append("description")
    legacy_date = None
    if "plan" in sent:
        plan = edit.plan.stored() if edit.plan else None
        legacy_date = check_review_on(plan, row.plan, f"{path}.plan.review_on")
        if plan != row.plan:
            row.plan = plan
            changed.append("plan")
    follow_up_on = edit.follow_up_on if "follow_up_on" in sent else legacy_date or row.follow_up_on
    if follow_up_on != row.follow_up_on:
        row.follow_up_on = follow_up_on
        changed.append("follow_up_on")
    if changed:
        audit(db, user, "focus.update", "focus_area", row.id, child_id=row.child_id, fields=changed,
              status=row.status, via=review_marker)
    return bool(changed)

def _assert_room(db: Session, child_id) -> None:
    db.flush()  # autoflush is off: count what this transaction already changed
    if active_count(db, child_id) >= MAX_ACTIVE:
        raise AppError("FOCUS_LIMIT", details={"max_active": MAX_ACTIVE})

def _apply_focus_decisions(db: Session, user: User, child: Child, body: ReviewCreate,
                           now) -> tuple[list[dict], list[FocusArea]]:
    """Apply keep/pause/close/edit/create. Returns the stored focus_review entries (input order)
    and the goals that changed (each gets a record_versions row once the review row exists)."""
    rows = {str(f.id): f for f in db.scalars(select(FocusArea).where(FocusArea.child_id == child.id))}
    seen: set[str] = set()
    for i, item in enumerate(body.focus_review):
        if item.decision == "create":
            continue
        fid = str(item.focus_area_id)
        if fid not in rows:
            raise _invalid(f"focus_review.{i}.focus_area_id", "unknown focus area")
        if fid in seen:
            raise _invalid(f"focus_review.{i}.focus_area_id", "this focus area is reviewed twice")
        seen.add(fid)

    marker = "review"
    changed: dict[str, FocusArea] = {}
    # 1. pause / close free their places first.
    for item in body.focus_review:
        if item.decision not in ("pause", "close"):
            continue
        row = rows[str(item.focus_area_id)]
        status, reason = ("paused", None) if item.decision == "pause" else ("completed", item.note)
        if _close(db, user, row, status, reason, now, marker):
            changed[str(row.id)] = row
    # 2. edits.
    for i, item in enumerate(body.focus_review):
        if item.decision == "edit":
            row = rows[str(item.focus_area_id)]
            if _edit(db, user, row, item.edit, marker, f"focus_review.{i}.edit"):
                changed[str(row.id)] = row
    # 3. keep (reactivating a paused/completed focus) and create, within the 3-active limit.
    created: dict[int, FocusArea] = {}
    open_cycle = open_assessment_id(db, child.id)
    for i, item in enumerate(body.focus_review):
        if item.decision == "keep":
            row = rows[str(item.focus_area_id)]
            if row.status != "active":
                _assert_room(db, child.id)
                row.status, row.closed_at, row.close_reason = "active", None, None
                changed[str(row.id)] = row
                audit(db, user, "focus.update", "focus_area", row.id, child_id=child.id, fields=["status"],
                      status="active", via=marker)
        elif item.decision == "create":
            _assert_room(db, child.id)
            c = item.create
            category = c.category or (vocab.item("focus_suggestions", c.suggestion_key) or {}).get("category") or "other"
            title = c.title or vocab.label("focus_suggestions", c.suggestion_key, user.language or "en")
            plan = c.plan.stored() if c.plan else None
            legacy_date = check_review_on(plan, None, f"focus_review.{i}.create.plan.review_on")
            assessment_id = (check_assessment(db, child.id, c.assessment_id, f"focus_review.{i}.create.assessment_id")
                             if "assessment_id" in c.model_fields_set else open_cycle)
            row = FocusArea(child_id=child.id, category=category, suggestion_key=c.suggestion_key, title=title,
                            description=c.description, plan=plan, follow_up_on=c.follow_up_on or legacy_date,
                            assessment_id=assessment_id, status="active", created_by=user.id)
            db.add(row)
            db.flush()
            created[i] = row
            changed[str(row.id)] = row
            audit(db, user, "focus.create", "focus_area", row.id, child_id=child.id, category=category,
                  suggestion_key=c.suggestion_key, via=marker)
    db.flush()

    out = []
    for i, item in enumerate(body.focus_review):
        row = created[i] if item.decision == "create" else rows[str(item.focus_area_id)]
        out.append({
            "focus_area_id": str(row.id),
            "title": row.title,
            "status": item.status,
            "decision": item.decision,
            "what_worked": item.what_worked,
            "what_to_change": item.what_to_change,
            "note": item.note,
        })
    return out, list(changed.values())

def _merge_into_profile(profile: ChildProfile, approved: dict[str, list[dict]], actor_id, now) -> None:
    """PLAN B3: approved items join the profile lists with sources += ['review']; nothing is removed."""
    for name in PROFILE_LISTS:
        current = []
        index = {}
        for raw in getattr(profile, name) or []:
            it = _as_item(raw)
            if it is None:
                continue
            it = copy.deepcopy(it)
            current.append(it)
            index.setdefault(ident(it), it)
        for item in approved[name]:
            existing = index.get(ident(item))
            if existing is not None:
                sources = list(existing.get("sources") or [])
                if "review" not in sources:
                    existing["sources"] = sources + ["review"]
                continue
            new = {**item, "sources": ["review"], "added_by": str(actor_id), "added_at": iso(now)}
            current.append(new)
            index[ident(new)] = new
        setattr(profile, name, current)

def _warnings(body: ReviewCreate, focus_entries: list[dict], counts: Counter, since_ids: set[str]) -> list[dict]:
    out = []
    for i, (item, entry) in enumerate(zip(body.focus_review, focus_entries)):
        if item.decision == "create" or item.status in (None, NEEDS_MORE):
            continue
        n = counts.get(entry["focus_area_id"], 0)
        if n < MIN_LINKED_OBSERVATIONS:
            out.append({"code": "LIMITED_OBSERVATIONS", "path": f"focus_review.{i}.status",
                        "focus_area_id": entry["focus_area_id"], "title": entry["title"], "observation_count": n})
    for i, b in enumerate(body.baseline_validation):
        if b.status == NEEDS_MORE:
            continue
        n = len({str(o) for o in b.observation_ids} & since_ids)
        if n < MIN_LINKED_OBSERVATIONS:
            out.append({"code": "LIMITED_OBSERVATIONS", "path": f"baseline_validation.{i}.status",
                        "list": b.list, "key": b.key, "label": b.label, "observation_count": n})
    level = body.follow_up.improvement.level if body.follow_up and body.follow_up.improvement else None
    if level not in (None, NEEDS_MORE) and len(since_ids) < MIN_LINKED_OBSERVATIONS:
        out.append({"code": "LIMITED_OBSERVATIONS", "path": "follow_up.improvement.level",
                    "observation_count": len(since_ids)})
    return out

def _check_follow_up_goals(body: ReviewCreate, known_ids: set[str]) -> None:
    areas = body.follow_up.areas if body.follow_up else None
    for i, fid in enumerate(areas.focus_area_ids if areas else []):
        if str(fid) not in known_ids:
            raise _invalid(f"follow_up.areas.focus_area_ids.{i}", "unknown focus area")

def _filled(follow_up: dict | None) -> list[str]:
    """Names of the follow-up fields that were filled in (audit metadata: names only, never text)."""
    out = []
    for key, value in (follow_up or {}).items():
        if isinstance(value, dict):
            out += [f"{key}.{k}" for k, v in value.items() if v]
        elif value:
            out.append(key)
    return out

def create_review(db: Session, user: User, child_id, body: ReviewCreate) -> dict:
    child = staff_child(db, user, child_id, lock=True)  # the lock serialises the 3-active-focus rule
    wording_warnings = _check_wording(body)
    u = body.understanding
    approved = {name: _stored_items(name, getattr(u, name), f"understanding.{name}") for name in PROFILE_LISTS}
    now = utcnow()
    baseline = latest_baseline(db, child.id)
    since = baseline.created_at if baseline else None
    suggestion = find_suggestion(db, child.id, body.ai_suggestion_id, "understanding") if body.ai_suggestion_id else None
    _check_follow_up_goals(body, {str(i) for i in db.scalars(select(FocusArea.id).where(FocusArea.child_id == child.id))})

    obs_rows = db.execute(select(Observation.id, Observation.observed_at).where(Observation.child_id == child.id)).all()
    child_obs = {str(oid) for oid, _ in obs_rows}
    since_ids = {str(oid) for oid, at in obs_rows if since is None or at >= since}
    counts = _focus_counts(db, child.id, since)

    focus_entries, changed_goals = _apply_focus_decisions(db, user, child, body, now)
    validation = [{
        "list": b.list,
        "key": b.key,
        "custom": b.custom,
        "label": b.label,
        "status": b.status,
        "note": b.note,
        "observation_ids": [o for o in dict.fromkeys(str(x) for x in b.observation_ids) if o in child_obs],
    } for b in body.baseline_validation]
    understanding = {
        "summary": u.summary,
        **approved,
        "areas_for_support": list(u.areas_for_support),
        "adaptations": u.adaptations,
        "next_steps": u.next_steps,
    }
    follow_up = body.follow_up.stored() if body.follow_up else None
    review = DevelopmentReview(
        child_id=child.id,
        review_date=body.review_date or date.today(),
        summary=body.summary,
        focus_review=focus_entries,
        baseline_validation=validation,
        understanding=understanding,
        follow_up=follow_up,
        ai_suggested=body.ai_suggested or suggestion is not None,
        ai_suggestion_id=suggestion.id if suggestion is not None else None,
        created_by=user.id,
    )
    db.add(review)
    db.flush()
    for row in changed_goals:  # X-14 / X-21: every goal change of the review is kept
        record_version(db, row, user, via="review", review_id=review.id)
    if suggestion is not None:  # one UPDATE pending -> accepted | edited (a no-op when already resolved)
        ai_service.resolve_suggestion(db, suggestion.id, child_id=child.id,
                                      outcome=understanding_outcome(suggestion.output, understanding),
                                      used_by_type="development_review", used_by_id=review.id)

    profile = get_profile_row(db, child.id, lock=True)
    profile.current_understanding = {
        **copy.deepcopy(understanding),
        "source": "review",
        "review_id": str(review.id),
        "review_date": review.review_date.isoformat(),
        "baseline_id": str(baseline.id) if baseline else None,
        "approved_by": str(user.id),
        "approved_by_name": user.name,
        "approved_at": iso(now),
    }
    _merge_into_profile(profile, approved, user.id, now)
    audit(db, user, "review.create", "development_review", review.id, child_id=child.id,
          ai_suggested=review.ai_suggested, decisions=[f["decision"] for f in focus_entries],
          focus_area_ids=[f["focus_area_id"] for f in focus_entries],
          baseline_id=str(baseline.id) if baseline else None,
          ai_suggestion_id=str(suggestion.id) if suggestion is not None else None,
          follow_up=_filled(follow_up))
    warnings = _warnings(body, focus_entries, counts, since_ids) + wording_warnings
    db.flush()
    db.refresh(review)
    out = {
        "review": review_out(review, {user.id: user.name}),
        "current_understanding": profile.current_understanding,
        "warnings": warnings,
    }
    db.commit()
    return out
