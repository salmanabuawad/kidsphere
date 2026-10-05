"""Request bodies for /api/children (WP-05).

Language and gender keys are validated against the shared vocabulary
(app/data/options.json lists ``languages`` and ``genders``). Empty optional
strings become ``None``. Which fields a role may change is decided in
services/children.py (parents: PARENT_FIELDS only).
"""
import uuid
from datetime import date
from typing import Annotated

from pydantic import AfterValidator, BeforeValidator, Field

from app import vocab
from app.schemas.common import StrictModel

NAME_MAX = 120
PREFERRED_NAME_MAX = 60
CONTACT_MAX = 200
MAX_ADDITIONAL_LANGUAGES = 8


def _blank_to_none(v):
    if isinstance(v, str) and not v.strip():
        return None
    return v


def _check_language(v: str) -> str:
    if not vocab.is_valid("languages", v):
        raise ValueError("unknown language")
    return v


def _dedupe(v: list[str]) -> list[str]:
    out: list[str] = []
    for key in v:
        if key not in out:
            out.append(key)
    return out


def _check_gender(v: str) -> str:
    if not vocab.is_valid("genders", v):
        raise ValueError("unknown gender")
    return v


def _check_birth_date(v: date) -> date:
    today = date.today()
    if v > today:
        raise ValueError("birth date is in the future")
    if v.year < today.year - 18:
        raise ValueError("birth date is too far in the past")
    return v


LanguageKey = Annotated[str, AfterValidator(_check_language)]
Languages = Annotated[list[LanguageKey], Field(max_length=MAX_ADDITIONAL_LANGUAGES), AfterValidator(_dedupe)]
GenderKey = Annotated[str, AfterValidator(_check_gender)]
BirthDate = Annotated[date, AfterValidator(_check_birth_date)]
Name = Annotated[str, Field(min_length=1, max_length=NAME_MAX)]
PreferredName = Annotated[Annotated[str, Field(max_length=PREFERRED_NAME_MAX)] | None, BeforeValidator(_blank_to_none)]
ParentName = Annotated[Annotated[str, Field(max_length=NAME_MAX)] | None, BeforeValidator(_blank_to_none)]
Contact = Annotated[Annotated[str, Field(max_length=CONTACT_MAX)] | None, BeforeValidator(_blank_to_none)]
OptGender = Annotated[GenderKey | None, BeforeValidator(_blank_to_none)]


class ChildCreateIn(StrictModel):
    name: Name
    preferred_name: PreferredName = None
    birth_date: BirthDate
    gender: OptGender = None
    class_id: uuid.UUID
    main_language: LanguageKey
    additional_languages: Languages = Field(default_factory=list)
    parent_name: ParentName = None
    parent_contact: Contact = None


class ChildUpdateIn(StrictModel):
    """Every field optional; only the fields present in the body are changed.
    ``null`` clears an optional field and is rejected for required ones
    (name, birth_date, class_id, main_language, additional_languages)."""

    name: Name | None = None
    preferred_name: PreferredName = None
    birth_date: BirthDate | None = None
    gender: OptGender = None
    class_id: uuid.UUID | None = None
    main_language: LanguageKey | None = None
    additional_languages: Languages | None = None
    parent_name: ParentName = None
    parent_contact: Contact = None
