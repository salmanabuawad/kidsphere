"""Development reviews: suggest a current understanding, save the teacher-approved
review, list past reviews (spec §3, §12, §22–27; PLAN-ADJUSTMENTS B3, B6, B12).

Staff only; parents (and anyone out of scope) get 404, like observations.

- ``suggest`` builds the AI context, the observations since the latest baseline,
  the active focus areas and the key baseline items, and asks
  ``app.ai.suggest_understanding_result`` (Claude or templates; the B6 downgrade
  is applied there). It writes nothing (the session is rolled back). As for
  content generation, every free text sent to the AI has the child's names
  masked as [child], other children's names as [friend] and the parents' and
  teachers' names as [adult], and custom entries that only a parent gave are
  not sent.
- ``create_review`` runs in ONE transaction: focus decisions (pause/close first,
  then edits, then keep-reactivations and creates against the 3-active limit;
  409 FOCUS_LIMIT rolls back everything), the ``development_reviews`` row,
  ``child_profiles.current_understanding`` (source review, teacher-approved) and
  the B3 merge of the approved strengths / interests / what_helps into the profile
  lists (``sources += ['review']``). Baselines are never touched. A status other
  than needs_more_observation resting on fewer than 3 observations since the
  baseline is saved as chosen but reported in ``warnings``.

Review JSON::

    {id, child_id, review_date, summary, ai_suggested, created_at, created_by: {id, name} | null,
     understanding: {summary, strengths[], interests[], what_helps[], areas_for_support[], adaptations, next_steps},
     focus_review: [{focus_area_id, title, status, decision, what_worked, what_to_change, note}],
     baseline_validation: [{list, key, custom, label, status, note, observation_ids[]}]}

Draft context (``context`` of GET, also in the /suggest response)::

    {baseline: {id, created_at, summary} | null, observation_count_since_baseline, max_active,
     focus_areas: [{id, category, suggestion_key, title, description, plan, observation_count}],
     baseline_items: [{list, key, custom, label}]}

Counts are plain numbers of observations for the UI to put into words; nothing is
ever a score or a percentage (spec §26).
"""
import copy
from collections import Counter
from datetime import date
from types import SimpleNamespace

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import vocab
from app.ai import build_context, suggest_understanding_result
from app.ai.context import staff_confirmed
from app.ai.safety import text_issues
from app.audit import audit
from app.errors import AppError
from app.models import Baseline, Child, ChildProfile, DevelopmentReview, FocusArea, Observation, User
from app.schemas.profile import ident
from app.schemas.reviews import NEEDS_MORE, WHAT_HELPS_LISTS, ReviewCreate, ReviewItem, SuggestIn
from app.services.baselines import initial_understanding, support_needs
from app.services.content import adult_names, classmate_names
from app.services.focus_areas import MAX_ACTIVE, active_count, focus_out
from app.services.observations import staff_child
from app.services.profiles import get_profile_row, iso, perspective
from app.sessions import utcnow

MIN_LINKED_OBSERVATIONS = 3
MAX_OBSERVATIONS = 200
ITEM_LIMITS = {"strengths": 6, "interests": 6, "what_helps": 6, "support_needs": 6}
PROFILE_LISTS = ("strengths", "interests", "what_helps")


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
    return {
        "baseline": _baseline_ref(baseline, child, lang),
        "observation_count_since_baseline": _count_since(db, child.id, since),
        "max_active": MAX_ACTIVE,
        "focus_areas": [
            {**{k: v for k, v in focus_out(f).items()
                if k in ("id", "category", "suggestion_key", "title", "description", "plan", "status", "created_at")},
             "observation_count": counts.get(str(f.id), 0)}
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
        "ai_suggested": row.ai_suggested,
        "created_by": {"id": str(row.created_by), "name": names.get(row.created_by)} if row.created_by else None,
        "created_at": iso(row.created_at),
    }


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
    """Suggested understanding, focus statuses and baseline validation. Writes nothing."""
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
    result = suggest_understanding_result(ctx, observations, focus_rows, ai_items,
                                          child_names=[child.name, child.preferred_name],
                                          classmate_names=classmate_names(db, child),
                                          adult_names=adult_names(db, child), baseline_at=since)
    db.rollback()  # nothing above may persist
    return {
        "suggestion": result.suggestion.model_dump(mode="json"),
        "provider": result.provider,
        "is_template": result.is_template,
        **context,
    }


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


def _check_wording(body: ReviewCreate) -> None:
    """Teacher text must use everyday, observational words (spec §2): clinical terms → 422."""
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
            if part is None:
                continue
            texts += [(f"{p}.{part_name}.title", part.title), (f"{p}.{part_name}.description", part.description)]
            if part.plan is not None:
                texts += [(f"{p}.{part_name}.plan.{k}", v) for k, v in part.plan.model_dump().items()]
    for i, b in enumerate(body.baseline_validation):
        texts.append((f"baseline_validation.{i}.note", b.note))  # labels/custom texts come from the profile
    details = [{"path": path, "message": issue} for path, text in texts if text for issue in text_issues(text, False)]
    if details:
        raise AppError("UNSAFE_CONTENT", "Please describe what you see in everyday words.", details=details[:20])


def _close(db: Session, user: User, row: FocusArea, status: str, reason: str | None, now, review_marker: str) -> None:
    if row.status == status:
        return
    if row.status == "completed" and status == "paused":
        raise AppError("INVALID_TRANSITION", "A completed focus cannot be paused.")
    row.status = status
    row.closed_at = now
    if status == "completed":
        row.close_reason = reason
    audit(db, user, "focus.close", "focus_area", row.id, child_id=row.child_id, status=status, via=review_marker)


def _edit(db: Session, user: User, row: FocusArea, edit, review_marker: str) -> None:
    sent = edit.model_fields_set
    changed = []
    if "title" in sent and edit.title is not None and edit.title != row.title:
        row.title = edit.title
        changed.append("title")
    if "description" in sent and edit.description != row.description:
        row.description = edit.description
        changed.append("description")
    if "plan" in sent:
        plan = edit.plan.stored() if edit.plan else None
        if plan != row.plan:
            row.plan = plan
            changed.append("plan")
    if changed:
        audit(db, user, "focus.update", "focus_area", row.id, child_id=row.child_id, fields=changed,
              status=row.status, via=review_marker)


def _assert_room(db: Session, child_id) -> None:
    db.flush()  # autoflush is off: count what this transaction already changed
    if active_count(db, child_id) >= MAX_ACTIVE:
        raise AppError("FOCUS_LIMIT", details={"max_active": MAX_ACTIVE})


def _apply_focus_decisions(db: Session, user: User, child: Child, body: ReviewCreate, now) -> list[dict]:
    """Apply keep/pause/close/edit/create; returns the stored focus_review entries (input order)."""
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
    # 1. pause / close free their places first.
    for item in body.focus_review:
        if item.decision == "pause":
            _close(db, user, rows[str(item.focus_area_id)], "paused", None, now, marker)
        elif item.decision == "close":
            _close(db, user, rows[str(item.focus_area_id)], "completed", item.note, now, marker)
    # 2. edits.
    for item in body.focus_review:
        if item.decision == "edit":
            _edit(db, user, rows[str(item.focus_area_id)], item.edit, marker)
    # 3. keep (reactivating a paused/completed focus) and create, within the 3-active limit.
    created: dict[int, FocusArea] = {}
    for i, item in enumerate(body.focus_review):
        if item.decision == "keep":
            row = rows[str(item.focus_area_id)]
            if row.status != "active":
                _assert_room(db, child.id)
                row.status, row.closed_at, row.close_reason = "active", None, None
                audit(db, user, "focus.update", "focus_area", row.id, child_id=child.id, fields=["status"],
                      status="active", via=marker)
        elif item.decision == "create":
            _assert_room(db, child.id)
            c = item.create
            category = c.category or (vocab.item("focus_suggestions", c.suggestion_key) or {}).get("category") or "other"
            title = c.title or vocab.label("focus_suggestions", c.suggestion_key, user.language or "en")
            row = FocusArea(child_id=child.id, category=category, suggestion_key=c.suggestion_key, title=title,
                            description=c.description, plan=c.plan.stored() if c.plan else None, status="active",
                            created_by=user.id)
            db.add(row)
            db.flush()
            created[i] = row
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
    return out


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
    return out


def create_review(db: Session, user: User, child_id, body: ReviewCreate) -> dict:
    child = staff_child(db, user, child_id, lock=True)  # the lock serialises the 3-active-focus rule
    _check_wording(body)
    u = body.understanding
    approved = {name: _stored_items(name, getattr(u, name), f"understanding.{name}") for name in PROFILE_LISTS}
    now = utcnow()
    baseline = latest_baseline(db, child.id)
    since = baseline.created_at if baseline else None

    obs_rows = db.execute(select(Observation.id, Observation.observed_at).where(Observation.child_id == child.id)).all()
    child_obs = {str(oid) for oid, _ in obs_rows}
    since_ids = {str(oid) for oid, at in obs_rows if since is None or at >= since}
    counts = _focus_counts(db, child.id, since)

    focus_entries = _apply_focus_decisions(db, user, child, body, now)
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
    review = DevelopmentReview(
        child_id=child.id,
        review_date=body.review_date or date.today(),
        summary=body.summary,
        focus_review=focus_entries,
        baseline_validation=validation,
        understanding=understanding,
        ai_suggested=body.ai_suggested,
        created_by=user.id,
    )
    db.add(review)
    db.flush()

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
          ai_suggested=body.ai_suggested, decisions=[f["decision"] for f in focus_entries],
          focus_area_ids=[f["focus_area_id"] for f in focus_entries],
          baseline_id=str(baseline.id) if baseline else None)
    warnings = _warnings(body, focus_entries, counts, since_ids)
    db.flush()
    db.refresh(review)
    out = {
        "review": review_out(review, {user.id: user.name}),
        "current_understanding": profile.current_understanding,
        "warnings": warnings,
    }
    db.commit()
    return out
