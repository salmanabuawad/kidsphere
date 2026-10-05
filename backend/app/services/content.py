"""Generated content (spec §14–19, §30–33; PLAN-ADJUSTMENTS B7, B8, B9, B14, B15).

Generation
    ``generate_content`` validates the goal (growth_support → one of the child's
    ACTIVE focus areas; strength_builder → a profile strength key or a
    ``strength_targets`` key), builds the allow-listed AIContext (child, profile,
    focus incl. its plan, at most 5 recent observations for that focus or else the
    most recent ones, the names to mask (other children of the kindergarten,
    the parents and the teachers), the current understanding),
    calls ``app.ai.generate`` and inserts DRAFT rows. The profile is never changed.

Pack storage (content_type has no 'pack' value)
    A pack request stores one row per part, all sharing one ``pack_id``:
    story, real_world_activity, digital_game (+ video only when
    ``include_video`` was requested). The pack's 3 ``discussion_prompts`` live in
    the STORY row's content: ``{...StoryOut, "discussion_prompts": [3 prompts]}``.
    Every row of a pack stores the same ``generation_input`` (content_type 'pack').
    Regenerating a story that carries discussion prompts regenerates story +
    prompts together (one 'pack' call; the game/activity parts are discarded).

Lifecycle (B9)
    draft → approved (approve; a video row calls video_service.create_video_job)
    draft|approved → draft  on edit (PUT) or regenerate; completed/archived → 409
    approved → completed     on feedback (services/feedback.py; repeat allowed)
    any → new draft row      duplicate (pack_id is not copied)
    any → archived           archive
    DELETE                   drafts only, else 409
    share {shared:true}      approved|completed only, else 409; unsharing always works

Visibility
    Staff see every row of a child in scope. Parents see only rows that are
    ``shared_with_parent`` AND approved|completed (anything else is 404) and get
    no generation data, focus area, feedback or ``teacher_note``.

Content JSON (staff)::

    {id, child_id, pack_id, content_type, template, language, title, status,
     created_at, updated_at, approved_at, video_status, video_url,
     mode, focus_area_id, focus_area_title, shared_with_parent, is_template,
     ai_provider, ai_model, variant, video_provider, last_feedback_result,
     # detail only:
     content, generation_input, approved_by {id,name}|null, created_by {id,name}|null,
     feedback [{id, result, support_level, observation, what_helped, observation_id, created_at, by_name}]}

Parents get the first line plus ``content`` (detail, without teacher_note).
"""
import copy
import uuid

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app import access, vocab
from app.ai import build_context, find_unsafe_text, generate, validate_output
from app.audit import audit
from app.config import settings
from app.errors import AppError
from app.models import (
    LANGUAGE_VALUES,
    Child,
    ChildParent,
    ChildProfile,
    Class,
    ClassTeacher,
    ContentFeedback,
    FocusArea,
    GeneratedContent,
    Observation,
    User,
)
from app.schemas.content import ContentUpdate, GenerateIn, RegenerateIn, ShareIn
from app.services import video_service
from app.sessions import utcnow

MAX_CONTEXT_OBSERVATIONS = 5
PARENT_STATUSES = ("approved", "completed")
EDITABLE = ("draft", "approved")
SHAREABLE = ("approved", "completed")
USABLE = ("approved", "completed")  # Present and feedback
DISCUSSION_KEY = "discussion_prompts"
MAX_DISCUSSION_PROMPTS = 3
PACK_ORDER = {"story": 0, "real_world_activity": 1, "digital_game": 2, "video": 3}
GAME_KINDS = ("digital_game", "pack")


def _iso(dt):
    return dt.isoformat() if dt is not None else None


def _invalid(path: str, message: str) -> AppError:
    return AppError("VALIDATION", details=[{"path": path, "message": message}])


# --------------------------------------------------------------------------- visibility / lookup


def parent_visible(row: GeneratedContent) -> bool:
    return bool(row.shared_with_parent) and row.status in PARENT_STATUSES


def row_for_write(db: Session, user: User, content_id, lock: bool = True) -> GeneratedContent:
    """A content row the user may change (staff in scope). Parents get 403 for content
    they can see and 404 for anything else; out-of-scope ids are 404."""
    row = access.get_child_row_or_404(db, user, GeneratedContent, content_id, lock=lock)
    if not access.is_staff(user):
        raise AppError("FORBIDDEN" if parent_visible(row) else "NOT_FOUND")
    return row


def _require(row: GeneratedContent, allowed: tuple[str, ...], message: str) -> None:
    if row.status not in allowed:
        raise AppError("INVALID_TRANSITION", message, details={"status": row.status})


# --------------------------------------------------------------------------- output


def _template(row: GeneratedContent) -> str | None:
    if row.content_type == "digital_game" and isinstance(row.content, dict):
        return row.content.get("template")
    return None


def summary_out(row: GeneratedContent, staff: bool, focus_title: str | None = None,
                last_result: str | None = None) -> dict:
    out = {
        "id": str(row.id),
        "child_id": str(row.child_id),
        "pack_id": str(row.pack_id) if row.pack_id else None,
        "content_type": row.content_type,
        "template": _template(row),
        "language": row.language,
        "title": row.title,
        "status": row.status,
        "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
        "approved_at": _iso(row.approved_at),
        "video_status": row.video_status,
        "video_url": video_service.get_video_url(row),
    }
    if staff:
        out.update({
            "mode": row.mode,
            "focus_area_id": str(row.focus_area_id) if row.focus_area_id else None,
            "focus_area_title": focus_title,
            "shared_with_parent": row.shared_with_parent,
            "is_template": row.is_template,
            "ai_provider": row.ai_provider,
            "ai_model": row.ai_model,
            "variant": row.variant,
            "video_provider": row.video_provider,
            "last_feedback_result": last_result,
        })
    return out


def _user_names(db: Session, ids) -> dict:
    ids = {i for i in ids if i is not None}
    if not ids:
        return {}
    return dict(db.execute(select(User.id, User.name).where(User.id.in_(ids))).all())


def _feedback_rows(db: Session, content_id) -> list[ContentFeedback]:
    return list(db.scalars(
        select(ContentFeedback).where(ContentFeedback.content_id == content_id)
        .order_by(ContentFeedback.created_at.desc(), ContentFeedback.id.desc())
    ).all())


def feedback_out(fb: ContentFeedback, by_name: str | None) -> dict:
    return {
        "id": str(fb.id),
        "content_id": str(fb.content_id),
        "result": fb.result,
        "support_level": fb.support_level,
        "observation": fb.observation,
        "what_helped": fb.what_helped,
        "observation_id": str(fb.observation_id) if fb.observation_id else None,
        "created_at": _iso(fb.created_at),
        "by_name": by_name,
    }


def detail_out(db: Session, row: GeneratedContent, staff: bool) -> dict:
    content = copy.deepcopy(row.content) if isinstance(row.content, dict) else {}
    if not staff:
        out = summary_out(row, staff=False)
        content.pop("teacher_note", None)
        out["content"] = content
        return out
    focus_title = (db.scalar(select(FocusArea.title).where(FocusArea.id == row.focus_area_id))
                   if row.focus_area_id else None)
    feedback = _feedback_rows(db, row.id)
    names = _user_names(db, [row.approved_by, row.created_by, *(f.created_by for f in feedback)])
    out = summary_out(row, staff=True, focus_title=focus_title, last_result=feedback[0].result if feedback else None)
    out["content"] = content
    out["generation_input"] = row.generation_input
    out["approved_by"] = {"id": str(row.approved_by), "name": names.get(row.approved_by)} if row.approved_by else None
    out["created_by"] = {"id": str(row.created_by), "name": names.get(row.created_by)} if row.created_by else None
    out["feedback"] = [feedback_out(f, names.get(f.created_by)) for f in feedback]
    return out


# --------------------------------------------------------------------------- reading


def _list_query():
    last = (
        select(ContentFeedback.result).where(ContentFeedback.content_id == GeneratedContent.id)
        .order_by(ContentFeedback.created_at.desc()).limit(1).correlate(GeneratedContent).scalar_subquery()
    )
    return (
        select(GeneratedContent, FocusArea.title, last)
        .outerjoin(FocusArea, FocusArea.id == GeneratedContent.focus_area_id)
    )


def _parent_filter(stmt):
    return stmt.where(GeneratedContent.shared_with_parent.is_(True), GeneratedContent.status.in_(PARENT_STATUSES))


def list_content(db: Session, user: User, child_id, status: str | None = None, pack_id=None) -> dict:
    child = access.get_child_or_404(db, user, child_id)
    staff = access.is_staff(user)
    stmt = _list_query().where(GeneratedContent.child_id == child.id)
    if not staff:
        stmt = _parent_filter(stmt)
    if status:
        stmt = stmt.where(GeneratedContent.status == status)
    if pack_id is not None:
        stmt = stmt.where(GeneratedContent.pack_id == pack_id)
    stmt = stmt.order_by(GeneratedContent.created_at.desc(), GeneratedContent.id.desc())
    rows = db.execute(stmt).all()
    return {"content": [summary_out(r, staff, focus_title=ft if staff else None, last_result=res if staff else None)
                        for r, ft, res in rows]}


def get_content(db: Session, user: User, content_id) -> dict:
    row = access.get_child_row_or_404(db, user, GeneratedContent, content_id)
    staff = access.is_staff(user)
    if not staff and not parent_visible(row):
        raise AppError("NOT_FOUND")
    return {"content": detail_out(db, row, staff)}


def get_pack(db: Session, user: User, pack_id) -> dict:
    try:
        pid = uuid.UUID(str(pack_id))
    except ValueError:
        raise AppError("NOT_FOUND") from None
    staff = access.is_staff(user)
    stmt = select(GeneratedContent).where(GeneratedContent.pack_id == pid,
                                          GeneratedContent.child_id.in_(access.scoped_child_ids(user)))
    if not staff:
        stmt = _parent_filter(stmt)
    rows = sorted(db.scalars(stmt).all(), key=lambda r: (PACK_ORDER.get(r.content_type, 9), r.created_at))
    if not rows:
        raise AppError("NOT_FOUND")
    return {"pack_id": str(pid), "child_id": str(rows[0].child_id), "items": [detail_out(db, r, staff) for r in rows]}


# --------------------------------------------------------------------------- generation


def default_language(child: Child, user: User) -> str:
    if child.main_language in LANGUAGE_VALUES:
        return child.main_language
    if user.language in LANGUAGE_VALUES:
        return user.language
    return settings.default_locale


def _profile(db: Session, child_id) -> ChildProfile | None:
    return db.scalar(select(ChildProfile).where(ChildProfile.child_id == child_id))


def _strength_allowed(profile: ChildProfile | None, key: str) -> bool:
    own = {it.get("key") for it in (profile.strengths if profile else None) or [] if isinstance(it, dict)}
    return key in own or vocab.is_valid("strength_targets", key)


def _check_goal(db: Session, child: Child, profile: ChildProfile | None, body: GenerateIn):
    """Returns (focus row | None, target strength key | None)."""
    if body.mode == "growth_support":
        if body.target_strength:
            raise _invalid("target_strength", "A target strength is used with strength_builder only.")
        if body.focus_area_id is None:
            raise _invalid("focus_area_id", "Growth support needs one of the child's active focus areas.")
        focus = db.scalar(select(FocusArea).where(FocusArea.id == body.focus_area_id, FocusArea.child_id == child.id))
        if focus is None or focus.status != "active":
            raise _invalid("focus_area_id", "Choose one of the child's active focus areas.")
        return focus, None
    if body.focus_area_id is not None:
        raise _invalid("focus_area_id", "A focus area is used with growth_support only.")
    if not body.target_strength:
        raise _invalid("target_strength", "Choose a strength to build on.")
    if not _strength_allowed(profile, body.target_strength):
        raise _invalid("target_strength", "Choose one of the child's strengths or a strength-builder goal.")
    return None, body.target_strength


def _recent_observations(db: Session, child_id, focus_id=None) -> list[str]:
    def query(extra=None):
        stmt = select(Observation.observation).where(Observation.child_id == child_id, Observation.observation.is_not(None))
        if extra is not None:
            stmt = stmt.where(extra)
        stmt = stmt.order_by(Observation.observed_at.desc(), Observation.id.desc()).limit(MAX_CONTEXT_OBSERVATIONS)
        return list(db.scalars(stmt).all())

    if focus_id is not None:
        rows = query(Observation.focus_area_id == focus_id)
        if rows:
            return rows
    return query()


def _kindergarten_classes(child: Child):
    """The ids of every class of the child's kindergarten (shared yard, mixed activities)."""
    kindergarten = select(Class.kindergarten).where(Class.id == child.class_id).scalar_subquery()
    return select(Class.id).where(Class.kindergarten == kindergarten)


def classmate_names(db: Session, child: Child) -> list[str]:
    """Names (full and preferred) of the other children, for masking in AI input as [friend]:
    every child of the same kindergarten and every child without a class; every other child
    when this one has no class."""
    stmt = select(Child.name, Child.preferred_name).where(Child.id != child.id)
    if child.class_id is not None:
        stmt = stmt.where(or_(Child.class_id.in_(_kindergarten_classes(child)), Child.class_id.is_(None)))
    return [n for row in db.execute(stmt).all() for n in row if n]


def adult_names(db: Session, child: Child) -> list[str]:
    """Names of the adults around the child, for masking in AI input as [adult]: the parent name on
    the child, the linked parent accounts and the teachers of the kindergarten's classes (of every
    class when the child has no class)."""
    names = [child.parent_name]
    names += db.scalars(select(User.name).join(ChildParent, ChildParent.user_id == User.id)
                        .where(ChildParent.child_id == child.id)).all()
    teachers = select(User.name).join(ClassTeacher, ClassTeacher.user_id == User.id)
    if child.class_id is not None:
        teachers = teachers.where(ClassTeacher.class_id.in_(_kindergarten_classes(child)))
    names += db.scalars(teachers.distinct()).all()
    return [n for n in names if n]


def _context(db: Session, child: Child, profile: ChildProfile | None, *, mode: str, kind: str, language: str,
             focus: FocusArea | None, target: str | None, template: str | None = None,
             instruction: str | None = None, variant: int = 0, include_video: bool = False):
    return build_context(
        child=child,
        profile=profile,
        mode=mode,
        content_type=kind,
        language=language,
        focus=focus,
        target_strength=target,
        recent_observations=_recent_observations(db, child.id, focus.id if focus is not None else None),
        classmate_names=classmate_names(db, child),
        adult_names=adult_names(db, child),
        current_understanding=profile.current_understanding if profile else None,
        template=template,
        instruction=instruction,
        variant=variant,
        include_video=include_video,
    )


def _new_row(kind: str, content: dict, base: dict, pack_id=None) -> GeneratedContent:
    return GeneratedContent(
        content_type=kind,
        title=content["title"],
        content=content,
        pack_id=pack_id,
        status="draft",
        shared_with_parent=False,
        video_status="script_ready" if kind == "video" else None,
        **base,
    )


def _pack_parts(content: dict) -> list[tuple[str, dict]]:
    story = {**content["story"], DISCUSSION_KEY: list(content["discussion_prompts"])}
    parts = [("story", story), ("real_world_activity", content["activity"]), ("digital_game", content["game"])]
    if content.get("video"):
        parts.append(("video", content["video"]))
    return parts


def generate_content(db: Session, user: User, child_id, body: GenerateIn) -> dict:
    child = access.get_child_or_404(db, user, child_id, write=True)
    profile = _profile(db, child.id)
    focus, target = _check_goal(db, child, profile, body)
    if body.template and body.content_type not in GAME_KINDS:
        raise _invalid("template", "A game template is used with digital_game or pack only.")
    if body.include_video and body.content_type != "pack":
        raise _invalid("include_video", "include_video is used with pack only.")
    language = body.language or default_language(child, user)
    ctx = _context(db, child, profile, mode=body.mode, kind=body.content_type, language=language, focus=focus,
                   target=target, template=body.template, include_video=body.include_video)
    # Nothing is written yet: end the read transaction so no connection is held while the AI works.
    db.commit()
    result = generate(body.content_type, ctx)

    base = {
        "child_id": child.id,
        "focus_area_id": focus.id if focus is not None else None,
        "mode": body.mode,
        "language": language,
        "generation_input": ctx.model_dump(mode="json"),
        "ai_provider": result.provider,
        "ai_model": result.model,
        "is_template": result.is_template,
        "variant": 0,
        "created_by": user.id,
    }
    pack_id = uuid.uuid4() if body.content_type == "pack" else None
    parts = _pack_parts(result.content) if pack_id else [(body.content_type, result.content)]
    rows = [_new_row(kind, content, base, pack_id) for kind, content in parts]
    db.add_all(rows)
    db.flush()
    for row in rows:
        audit(db, user, "content.generate", "content", row.id, child_id=child.id, mode=body.mode,
              content_type=row.content_type, template=_template(row), language=language, provider=result.provider,
              is_template=result.is_template, pack_id=str(pack_id) if pack_id else None,
              fallback_reason=result.fallback_reason)
    db.flush()
    items = [detail_out(db, r, staff=True) for r in rows]
    db.commit()
    if pack_id:
        return {"items": items, "pack_id": str(pack_id), "fallback_reason": result.fallback_reason}
    return {"content": items[0], "fallback_reason": result.fallback_reason}


# --------------------------------------------------------------------------- edits


def _check_prompts(value) -> tuple[list[str], list[str], list[str] | None]:
    """(schema issues, safety issues, cleaned prompts) for a story's discussion prompts."""
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_DISCUSSION_PROMPTS:
        return [f"{DISCUSSION_KEY}: expected 1-{MAX_DISCUSSION_PROMPTS} prompts"], [], None
    cleaned = []
    for p in value:
        if not isinstance(p, str) or not p.strip() or len(p.strip()) > 200:
            return [f"{DISCUSSION_KEY}: every prompt is 1-200 characters"], [], None
        cleaned.append(p.strip())
    safety = [f"{DISCUSSION_KEY}: {i}" for i in find_unsafe_text(cleaned, child_facing=True)]
    return [], safety, cleaned


def validated_content(row: GeneratedContent, data) -> dict:
    """Validate a teacher edit against the row's output model + the safety check.
    Shape problems → 400 VALIDATION; wording → 422 UNSAFE_CONTENT {issues}."""
    if not isinstance(data, dict):
        raise _invalid("content", "The content must be an object.")
    data = copy.deepcopy(data)
    prompts = None
    has_prompts = row.content_type == "story" and DISCUSSION_KEY in data
    if has_prompts:
        prompts = data.pop(DISCUSSION_KEY)
    template = _template(row)
    content, issues = validate_output(row.content_type, data, template)
    schema = [i.removeprefix("schema:").strip() for i in issues if i.startswith("schema:")]
    safety = [i.removeprefix("safety:").strip() for i in issues if i.startswith("safety:")]
    if has_prompts:
        p_schema, p_safety, prompts = _check_prompts(prompts)
        schema += p_schema
        safety += p_safety
    if schema:
        raise AppError("VALIDATION", "The content is not complete or has the wrong shape.",
                       details=[{"path": "content", "message": m} for m in schema[:20]])
    if safety:
        raise AppError("UNSAFE_CONTENT", details={"issues": safety[:20]})
    if has_prompts:
        content[DISCUSSION_KEY] = prompts
    return content


def _back_to_draft(row: GeneratedContent) -> None:
    row.status = "draft"
    row.approved_by = None
    row.approved_at = None


def update_content(db: Session, user: User, content_id, body: ContentUpdate) -> dict:
    row = row_for_write(db, user, content_id)
    _require(row, EDITABLE, "Completed content cannot be edited. Duplicate it as a new draft instead.")
    if body.title is None and body.content is None:
        raise _invalid("content", "Send a title or the content to change.")
    data = copy.deepcopy(body.content if body.content is not None else row.content)
    if isinstance(data, dict) and body.title is not None:
        data["title"] = body.title
    content = validated_content(row, data)
    old = row.content or {}
    changed = sorted(k for k in set(content) | set(old) if content.get(k) != old.get(k))
    if changed:
        from_status = row.status
        row.content = content
        row.title = content["title"]
        if row.status == "approved":
            _back_to_draft(row)
        audit(db, user, "content.edit", "content", row.id, child_id=row.child_id, fields=changed,
              from_status=from_status)
    db.flush()
    out = detail_out(db, row, staff=True)
    db.commit()
    return {"content": out}


def approve_content(db: Session, user: User, content_id) -> dict:
    row = row_for_write(db, user, content_id)
    video_job = None
    if row.status != "approved":
        _require(row, ("draft",), "Only a draft can be approved.")
        row.status = "approved"
        row.approved_by = user.id
        row.approved_at = utcnow()
        if row.content_type == "video":
            video_job = video_service.create_video_job(row)
        audit(db, user, "content.approve", "content", row.id, child_id=row.child_id, content_type=row.content_type,
              video_status=row.video_status)
    db.flush()
    out = detail_out(db, row, staff=True)
    db.commit()
    return {"content": out, "video_job": video_job}


def regenerate_content(db: Session, user: User, content_id, body: RegenerateIn) -> dict:
    row = row_for_write(db, user, content_id, lock=False)
    message = "Completed content cannot be regenerated. Duplicate it as a new draft instead."
    _require(row, EDITABLE, message)
    child = db.get(Child, row.child_id)
    profile = _profile(db, row.child_id)
    focus = db.get(FocusArea, row.focus_area_id) if row.focus_area_id else None
    gi = row.generation_input if isinstance(row.generation_input, dict) else {}
    target = None
    if row.mode == "strength_builder":
        target = (gi.get("target_strength") or {}).get("key") if isinstance(gi.get("target_strength"), dict) else None
    kind, template = row.content_type, _template(row)
    with_prompts = row.content_type == "story" and DISCUSSION_KEY in (row.content or {})
    if with_prompts:
        kind, template = "pack", gi.get("template")
    variant = (row.variant or 0) + 1
    ctx = _context(db, child, profile, mode=row.mode, kind=kind, language=row.language, focus=focus, target=target,
                   template=template, instruction=body.instruction, variant=variant)
    row_id = row.id
    db.commit()  # no connection held during the AI call
    result = generate(kind, ctx)
    content = result.content
    if with_prompts:
        content = {**result.content["story"], DISCUSSION_KEY: list(result.content["discussion_prompts"])}

    db.expire_all()
    row = row_for_write(db, user, row_id)  # locked; the status may have changed meanwhile
    _require(row, EDITABLE, message)
    from_status = row.status
    row.content = content
    row.title = content["title"]
    row.variant = variant
    row.generation_input = ctx.model_dump(mode="json")
    row.ai_provider = result.provider
    row.ai_model = result.model
    row.is_template = result.is_template
    if row.content_type == "video":
        row.video_status = "script_ready"
        row.video_url = None
        row.video_external_job_id = None
    if row.status == "approved":
        _back_to_draft(row)
    audit(db, user, "content.regenerate", "content", row.id, child_id=row.child_id, variant=variant,
          from_status=from_status, provider=result.provider, is_template=result.is_template,
          with_instruction=bool(body.instruction), fallback_reason=result.fallback_reason)
    db.flush()
    out = detail_out(db, row, staff=True)
    db.commit()
    return {"content": out, "fallback_reason": result.fallback_reason}


def duplicate_content(db: Session, user: User, content_id) -> dict:
    row = row_for_write(db, user, content_id, lock=False)
    new = GeneratedContent(
        child_id=row.child_id,
        focus_area_id=row.focus_area_id,
        pack_id=None,
        mode=row.mode,
        content_type=row.content_type,
        language=row.language,
        title=row.title,
        content=copy.deepcopy(row.content),
        status="draft",
        shared_with_parent=False,
        generation_input=copy.deepcopy(row.generation_input),
        ai_provider=row.ai_provider,
        ai_model=row.ai_model,
        is_template=row.is_template,
        variant=row.variant,
        video_status="script_ready" if row.content_type == "video" else None,
        created_by=user.id,
    )
    db.add(new)
    db.flush()
    audit(db, user, "content.duplicate", "content", new.id, child_id=row.child_id, source_id=row.id,
          source_status=row.status)
    db.flush()
    out = detail_out(db, new, staff=True)
    db.commit()
    return {"content": out}


def share_content(db: Session, user: User, content_id, body: ShareIn) -> dict:
    row = row_for_write(db, user, content_id)
    if body.shared:
        _require(row, SHAREABLE, "Only approved content can be shared with parents.")
    if row.shared_with_parent != body.shared:
        row.shared_with_parent = body.shared
        audit(db, user, "content.share", "content", row.id, child_id=row.child_id, shared=body.shared)
    db.flush()
    out = detail_out(db, row, staff=True)
    db.commit()
    return {"content": out}


def archive_content(db: Session, user: User, content_id) -> dict:
    row = row_for_write(db, user, content_id)
    if row.status != "archived":
        from_status = row.status
        row.status = "archived"
        audit(db, user, "content.archive", "content", row.id, child_id=row.child_id, from_status=from_status)
    db.flush()
    out = detail_out(db, row, staff=True)
    db.commit()
    return {"content": out}


def delete_content(db: Session, user: User, content_id) -> None:
    row = row_for_write(db, user, content_id)
    _require(row, ("draft",), "Only drafts can be deleted. Archive it instead.")
    audit(db, user, "content.delete", "content", row.id, child_id=row.child_id, content_type=row.content_type,
          pack_id=str(row.pack_id) if row.pack_id else None)
    db.delete(row)
    db.commit()
