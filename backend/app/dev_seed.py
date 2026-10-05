"""Demo data for tests and demo databases: Adam (spec §44) and Maya (spec §45).

    cd backend && venv/bin/python -m app.dev_seed

Creates (or reuses) a demo class and the users demo-admin, demo-teacher,
demo-parent (Adam) and demo-parent-maya (Maya), all with one fresh random
password that is printed once. Adds Adam and Maya with completed profiles
(parent + teacher perspectives), Adam's Current Focus "joining group play"
with a Strength → Need → Adaptation → What we will do → Follow-up plan, and a
baseline for each child dated three weeks ago, followed by a few quick
observations that show development over time on the timeline (Adam: from
watching the block corner to inviting a friend; Maya: storytelling).
Children that already exist in the demo class are left untouched, so running
it twice is safe.

``main`` (``python -m app.dev_seed``) refuses to run, and exits with status 2,
unless ``allowed()`` holds: the database name in ``DATABASE_URL`` ends with
``_test`` or ``_preview``, or the environment has ``KIDSPHERE_ALLOW_DEMO=1``.
The production database ``kidsphere_mvp`` matches neither suffix. There are no
preview databases today; ``_preview`` is only an accepted name. ``seed(db)``
itself does not check (the tests call it on ``kidsphere_test``).
"""
import os
import secrets
import sys
import uuid
from datetime import date, timedelta

from sqlalchemy import make_url, select, update
from sqlalchemy.orm import Session

from app import vocab
from app.config import settings
from app.models import Baseline, Child, ChildParent, ChildProfile, Class, ClassTeacher, FocusArea, Observation, User
from app.schemas.focus import FocusCreate
from app.schemas.profile import ProfilePatch
from app.security import hash_password
from app.services import baselines, focus_areas, profiles
from app.sessions import utcnow

# The demo story starts this many days ago (baseline and focus), so the
# observations below land after it on the timeline.
STORY_DAYS = 21

CLASS_NAME = "Butterflies"
KINDERGARTEN = "Sunflower Kindergarten (demo)"

USERS = (
    ("demo-admin", "admin", "Demo Admin"),
    ("demo-teacher", "teacher", "Rana (demo teacher)"),
    ("demo-parent", "parent", "Adam's parent (demo)"),
    ("demo-parent-maya", "parent", "Maya's parent (demo)"),
)


def allowed(database_url: str | None = None, environ=None) -> bool:
    environ = os.environ if environ is None else environ
    name = make_url(database_url or settings.database_url).database or ""
    return name.endswith("_test") or name.endswith("_preview") or environ.get("KIDSPHERE_ALLOW_DEMO") == "1"


def _birth_date(years: int, months: int, today: date | None = None) -> date:
    today = today or date.today()
    total = today.year * 12 + (today.month - 1) - (years * 12 + months)
    return date(total // 12, total % 12 + 1, min(today.day, 28))


def _user(db: Session, email: str, role: str, name: str, password_hash: str) -> User:
    user = db.scalars(select(User).where(User.email == email)).first()
    if user is None:
        user = User(email=email, role=role, name=name, password_hash=password_hash, language="en")
        db.add(user)
    else:
        user.password_hash = password_hash
        user.is_active = True
    db.flush()
    return user


def _patch(db, user, child, perspective, section, data, step=None):
    profiles.update_profile(db, user, child.id, ProfilePatch(perspective=perspective, section=section, data=data, wizard_step=step))


ADAM = {
    "teacher": {
        "who": {
            "describe_words": ["curious", "imaginative", "energetic"],
            "strengths": ["imagination", "building", "vocabulary"],
            "interests": ["cars_transportation", "animals", "blocks"],
            "motivators": ["special_role", "hands_on_exploring"],
            "appreciate": "Builds long roads and garages and tells rich stories about them.",
        },
        "social": {
            "social": ["often_plays_independently", "waits_for_others", "needs_adult_support_to_join"],
            "communication": ["uses_full_sentences", "asks_questions", "tells_about_experiences"],
            "comments": "Watches group play at the block corner before joining.",
        },
        "independence": {
            "levels": {"eating": "independent", "drinking": "independent", "toilet": "independent",
                       "washing_hands": "independent", "dressing": "some_support", "shoes": "some_support",
                       "tidying_toys": "some_support", "keeping_belongings": "independent",
                       "starting_activity": "independent", "finishing_activity": "some_support"},
        },
    },
    "parent": {
        "who": {
            "describe_words": ["curious", "kind", {"custom": "Loves to build"}],
            "strengths": ["imagination", "building", "memory"],
            "interests": ["cars_transportation", "animals", "blocks"],
            "motivators": ["praise", "one_on_one_time"],
            "appreciate": "His imagination and how gently he treats animals.",
        },
        "emotions": {
            "helps_when_sad": ["hug", "favorite_object"],
            "frustration_reactions": ["moves_away", "asks_adult_help"],
            "calming_helps": ["hug", "quiet_space"],
            "transition_reaction": "needs_preparation",
            "transition_helps": ["advance_preparation", "countdown_timer"],
            "morning_separation": "needs_time",
        },
        "environment": {
            "items": [{"key": "noise", "what_happens": "Covers his ears in a loud hall.", "what_helps": ["quiet_space", "advance_preparation"]}],
        },
        "priorities": {
            "parent_priorities": ["social", "confidence"],
            "hope_child_feels": ["belonging", "happy"],
            "one_thing_to_know": "He needs a little time before joining a new group.",
        },
    },
}

ADAM_FOCUS = {
    "suggestion_key": "joining_group_play",
    "title": "Joining group play",
    "description": "Joining other children's play at the block corner and starting shared play.",
    "plan": {
        "strength_used": "Imagination and building with cars and blocks",
        "need": "Joining other children's play and starting shared play",
        "adaptation": "Start in a pair with a familiar child at the block corner",
        "what_we_will_do": "Build the Garage Together: take turns adding pieces and practise asking \"Can we build this together?\"",
        "frequency": "3 times a week",
        "who": "Class teacher",
        "success_looks_like": "Adam asks another child to build with him without prompting",
    },
}

MAYA = {
    "teacher": {
        "who": {
            "describe_words": ["imaginative", "loves_to_talk", "cheerful"],
            "strengths": ["imagination", "vocabulary", "communication"],
            "interests": ["animals"],
            "motivators": ["showing_their_work", "favorite_topics"],
            "appreciate": "Makes up long stories about animals and their adventures.",
        },
        "social": {
            "social": ["initiates_play", "enjoys_group_activities"],
            "communication": ["uses_full_sentences", "tells_about_experiences", "describes_events"],
        },
    },
    "parent": {
        "who": {
            "describe_words": ["creative", "funny"],
            "strengths": ["imagination", "vocabulary"],
            "interests": ["animals"],
            "appreciate": "The stories she tells at bedtime.",
        },
        "priorities": {"parent_priorities": ["language", "confidence"], "hope_child_feels": ["capable", "happy"]},
    },
}


# (days ago, context, support_level, what_helped keys, text, did_it_change)
ADAM_OBSERVATIONS = (
    (18, "free_play", "significant_support", ["adult_mediation"],
     "Watched the children at the block corner for a long time and did not join.", None),
    (12, "free_play", "some_support", ["adult_mediation", "advance_preparation"],
     "With the teacher next to him, joined Sami building a garage for a few minutes.", "partly"),
    (6, "structured_activity", "some_support", ["peer_modeling"],
     "Practised \"Can we build this together?\" with a puppet, then said it to Lina.", "partly"),
    (2, "free_play", "independent", [],
     "Went to the block corner and asked Omar: \"Can we build this together?\" They built a long road.", "yes"),
)

MAYA_OBSERVATIONS = (
    (15, "group_time", "independent", [], "Told a long story about a lion who lost his way, with a beginning and an end.", None),
    (8, "art", "independent", [], "Drew three animals and explained what each one was doing.", None),
    (3, "free_play", "some_support", ["adult_mediation"],
     "Made up a story with two friends; with a reminder she let them add their own ideas.", "partly"),
)


def _baseline_at(db: Session, teacher: User, child: Child, when) -> None:
    """Same snapshot as baselines.create_baseline, dated ``when`` (demo only; rows stay immutable)."""
    profile = profiles.get_profile_row(db, child.id)
    focus_rows = baselines.active_focus_rows(db, child.id)
    data = baselines.build_baseline_data(db, teacher, child, profile, focus_rows, when)
    row = Baseline(child_id=child.id, baseline_data=data, created_by=teacher.id, created_at=when)
    db.add(row)
    db.flush()
    if profile.wizard_completed_at is None:
        profile.wizard_completed_at = when
    if not profile.current_understanding:
        profile.current_understanding = baselines.initial_understanding(child, profile, focus_rows, teacher.language or "en", row.id, when)
    db.commit()


def _observations(db: Session, teacher: User, child: Child, rows, focus_id=None, area=None) -> None:
    now = utcnow()
    for days, context, support, helps, text, changed in rows:
        db.add(Observation(
            child_id=child.id, focus_area_id=focus_id, source="quick", observed_at=now - timedelta(days=days, hours=3),
            area=area, context=context, observation=text, support_level=support,
            what_helped=[{"key": k} for k in helps] or None,
            details={"did_it_change": changed} if changed else None, created_by=teacher.id,
        ))
    db.commit()


def _seed_child(db: Session, teacher: User, parent: User, klass: Class, name: str, birth: date, gender: str,
                answers: dict, focus: dict | None, observations=()) -> tuple[Child, bool]:
    existing = db.scalars(select(Child).where(Child.class_id == klass.id, Child.name == name)).first()
    if existing is not None:
        return existing, False
    child = Child(name=name, birth_date=birth, gender=gender, class_id=klass.id, main_language="en",
                  additional_languages=["ar"], parent_name=parent.name, created_by=teacher.id)
    db.add(child)
    db.flush()
    db.add(ChildParent(child_id=child.id, user_id=parent.id, relation="mother"))
    db.add(ChildProfile(child_id=child.id))
    db.commit()
    step = 2
    for perspective, sections in answers.items():
        for section, data in sections.items():
            _patch(db, teacher, child, perspective, section, data, step)
            step = min(step + 1, 7)
    started = utcnow() - timedelta(days=STORY_DAYS)
    focus_id = None
    if focus:
        focus_id = uuid.UUID(focus_areas.create_focus(db, teacher, child.id, FocusCreate(**focus))["focus_area"]["id"])
        db.execute(update(FocusArea).where(FocusArea.id == focus_id).values(created_at=started))
        db.commit()
    profiles.update_profile(db, teacher, child.id, ProfilePatch(wizard_step=7, complete=True))
    parent_db = db.get(User, parent.id)
    profiles.update_profile(db, parent_db, child.id, ProfilePatch(wizard_step=7, complete=True))
    _baseline_at(db, teacher, child, started + timedelta(minutes=5))
    category = (vocab.item("focus_suggestions", focus["suggestion_key"]) or {}).get("category") if focus and focus.get("suggestion_key") else None
    _observations(db, teacher, child, observations, focus_id=focus_id, area=category)
    return child, True


def seed(db: Session, password: str | None = None) -> dict:
    """Create the demo world; returns {"password", "users", "children"}."""
    password = password or secrets.token_urlsafe(9)
    pw_hash = hash_password(password)
    users = {email: _user(db, email, role, name, pw_hash) for email, role, name in USERS}
    klass = db.scalars(select(Class).where(Class.name == CLASS_NAME, Class.kindergarten == KINDERGARTEN)).first()
    if klass is None:
        klass = Class(name=CLASS_NAME, kindergarten=KINDERGARTEN)
        db.add(klass)
        db.flush()
    teacher = users["demo-teacher"]
    if db.get(ClassTeacher, (klass.id, teacher.id)) is None:
        db.add(ClassTeacher(class_id=klass.id, user_id=teacher.id))
    db.commit()

    adam, adam_new = _seed_child(db, teacher, users["demo-parent"], klass, "Adam", _birth_date(4, 2), "boy", ADAM, ADAM_FOCUS,
                                 ADAM_OBSERVATIONS)
    maya, maya_new = _seed_child(db, teacher, users["demo-parent-maya"], klass, "Maya", _birth_date(5, 1), "girl", MAYA, None,
                                 MAYA_OBSERVATIONS)
    return {
        "password": password,
        "users": [email for email, _, _ in USERS],
        "children": {"Adam": (str(adam.id), adam_new), "Maya": (str(maya.id), maya_new)},
    }


def main(argv: list[str] | None = None) -> int:
    if not allowed():
        name = make_url(settings.database_url).database
        print(f"refusing to seed demo data into database {name!r}: the name must end with _test or _preview "
              "(or set KIDSPHERE_ALLOW_DEMO=1)", file=sys.stderr)
        return 2
    from app.db import SessionLocal

    with SessionLocal() as db:
        result = seed(db)
    print("Demo data ready.")
    print(f"  users: {', '.join(result['users'])}")
    print(f"  password (all demo users): {result['password']}")
    for name, (cid, created) in result["children"].items():
        print(f"  {name}: {cid}{'' if created else ' (already existed)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
