"""Demo data for previews and tests: Adam (spec §44) and Maya (spec §45).

    cd backend && venv/bin/python -m app.dev_seed

Creates (or reuses) a demo class and the users demo-admin, demo-teacher,
demo-parent (Adam) and demo-parent-maya (Maya), all with one fresh random
password that is printed once. Adds Adam and Maya with completed profiles
(parent + teacher perspectives), Adam's Current Focus "joining group play"
with a Strength → Need → Adaptation → What we will do → Follow-up plan, and a
baseline for each child. Children that already exist in the demo class are
left untouched, so running it twice is safe.

Refuses to run unless the database name ends with ``_test`` or ``_preview``
or the environment has ``KIDSPHERE_ALLOW_DEMO=1``.
"""
import os
import secrets
import sys
from datetime import date

from sqlalchemy import make_url, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Child, ChildParent, ChildProfile, Class, ClassTeacher, User
from app.schemas.focus import FocusCreate
from app.schemas.profile import ProfilePatch
from app.security import hash_password
from app.services import baselines, focus_areas, profiles

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


def _seed_child(db: Session, teacher: User, parent: User, klass: Class, name: str, birth: date, gender: str,
                answers: dict, focus: dict | None) -> tuple[Child, bool]:
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
    if focus:
        focus_areas.create_focus(db, teacher, child.id, FocusCreate(**focus))
    profiles.update_profile(db, teacher, child.id, ProfilePatch(wizard_step=7, complete=True))
    parent_db = db.get(User, parent.id)
    profiles.update_profile(db, parent_db, child.id, ProfilePatch(wizard_step=7, complete=True))
    baselines.create_baseline(db, teacher, child.id)
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

    adam, adam_new = _seed_child(db, teacher, users["demo-parent"], klass, "Adam", _birth_date(4, 2), "boy", ADAM, ADAM_FOCUS)
    maya, maya_new = _seed_child(db, teacher, users["demo-parent-maya"], klass, "Maya", _birth_date(5, 1), "girl", MAYA, None)
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
