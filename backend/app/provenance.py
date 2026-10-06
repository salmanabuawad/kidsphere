"""Provenance labels (COVERAGE-MATRIX §3.3.4; X-22). Derived at read time, never stored.

Pure functions, no DB access. The labels are the keys of the ``provenance``
option list (app/data/lists/common.json), always in this order:

    parent_said        source 'parent', or reported_by 'parent' (also when staff
                       typed the parent's answers: the stamp role is admin/teacher)
    teacher_observed   sources 'teacher' or 'observation', or reported_by 'teacher'
    ai_suggested       an AI suggestion whose outcome is 'pending' or 'edited'
    teacher_approved   source 'review', or an approved functional summary /
                       the current understanding (``approved=True``)

    derive(sources=(), *, reported_by=None, approved=False, ai_outcome=None) -> list[str]
        e.g. derive(item["sources"]) for a merged profile list item
        (child_profiles.strengths/interests/what_helps/...),
        derive(reported_by=version.reported_by) for a record_versions row,
        derive(approved=True) for an approved summary,
        derive(ai_outcome=suggestion.outcome) for an AI suggestion.

    badges(sources=(), *, stamp=None, reported_by=None, approved=False, ai_outcome=None) -> list[dict]
        The same labels as ``[{"label": ...}]``. ``stamp`` is an ``entered`` stamp
        ({by, by_name, role, reported_by, at, mode?}) or a record_versions row as a
        dict ({changed_by_name, changed_role, reported_by, via}); when staff typed a
        parent's answer, the parent_said badge gains ``entered_by`` (the name) and
        ``mode`` (on_behalf | meeting, when known): "Parent said · entered by {name}".

    entered_by_staff(stamp) -> bool
"""
from collections.abc import Iterable

LABELS = ("parent_said", "teacher_observed", "ai_suggested", "teacher_approved")
STAFF_ROLES = ("admin", "teacher")
ENTRY_MODES = ("self", "on_behalf", "meeting")
AI_OPEN_OUTCOMES = ("pending", "edited")

_SOURCE_LABELS = {
    "parent": "parent_said",
    "teacher": "teacher_observed",
    "observation": "teacher_observed",
    "review": "teacher_approved",
}
_REPORTED_LABELS = {"parent": "parent_said", "teacher": "teacher_observed"}


def derive(
    sources: Iterable[str] | None = (),
    *,
    reported_by: str | None = None,
    approved: bool = False,
    ai_outcome: str | None = None,
) -> list[str]:
    found = {_SOURCE_LABELS[s] for s in sources or () if s in _SOURCE_LABELS}
    if reported_by in _REPORTED_LABELS:
        found.add(_REPORTED_LABELS[reported_by])
    if approved:
        found.add("teacher_approved")
    if ai_outcome in AI_OPEN_OUTCOMES:
        found.add("ai_suggested")
    return [label for label in LABELS if label in found]


def _role(stamp: dict) -> str | None:
    return stamp.get("role") or stamp.get("changed_role")


def entered_by_staff(stamp: dict | None) -> bool:
    """True when a staff member typed answers that are the parent's."""
    return bool(stamp) and _role(stamp) in STAFF_ROLES and stamp.get("reported_by") == "parent"


def badges(
    sources: Iterable[str] | None = (),
    *,
    stamp: dict | None = None,
    reported_by: str | None = None,
    approved: bool = False,
    ai_outcome: str | None = None,
) -> list[dict]:
    reported = reported_by or (stamp or {}).get("reported_by")
    out = []
    for label in derive(sources, reported_by=reported, approved=approved, ai_outcome=ai_outcome):
        badge = {"label": label}
        if label == "parent_said" and entered_by_staff(stamp):
            badge["entered_by"] = stamp.get("by_name") or stamp.get("changed_by_name")
            mode = stamp.get("mode") or stamp.get("via")
            if mode in ENTRY_MODES:
                badge["mode"] = mode
        out.append(badge)
    return out
