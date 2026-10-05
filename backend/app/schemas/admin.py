"""Admin request/response schemas: users, classes, teacher assignment, parent links.

Passwords are never stripped or otherwise changed, so the password-bearing
models use their own config instead of ``StrictModel``.
"""
import uuid

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import Class, ChildParent, User
from app.schemas.auth import IDENTIFIER_PATTERN
from app.schemas.common import Language, Role, StrictModel

MIN_PASSWORD = 10


def _strip(v):
    return v.strip() if isinstance(v, str) else v


class UserCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    # An e-mail address or a plain username; stored lower-case.
    email: str = Field(min_length=2, max_length=200, pattern=IDENTIFIER_PATTERN)
    role: Role
    language: Language = "ar"
    password: str = Field(min_length=MIN_PASSWORD, max_length=200)

    @field_validator("name", mode="before")
    @classmethod
    def _name(cls, v):
        return _strip(v)

    @field_validator("email", mode="before")
    @classmethod
    def _identifier(cls, v):
        return v.strip().lower() if isinstance(v, str) else v


class UserUpdateIn(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: Role | None = None
    language: Language | None = None
    is_active: bool | None = None


class PasswordSetIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str = Field(min_length=MIN_PASSWORD, max_length=200)


class ClassIn(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    kindergarten: str = Field(min_length=1, max_length=120)


class ClassUpdateIn(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    kindergarten: str | None = Field(default=None, min_length=1, max_length=120)


class TeachersIn(StrictModel):
    user_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)


class ParentLinkIn(StrictModel):
    user_id: uuid.UUID
    # A key of the "relations" option list (mother, father, guardian, other).
    relation: str | None = Field(default=None, max_length=40)


def _iso(dt) -> str | None:
    return dt.isoformat() if dt is not None else None


def admin_user_out(user: User) -> dict:
    """{id, name, email, role, language, is_active, last_login_at, created_at}"""
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "language": user.language,
        "is_active": user.is_active,
        "last_login_at": _iso(user.last_login_at),
        "created_at": _iso(user.created_at),
    }


def class_out(cls: Class, teachers: list[User], child_count: int) -> dict:
    """{id, name, kindergarten, teachers:[{id, name}], child_count}"""
    return {
        "id": str(cls.id),
        "name": cls.name,
        "kindergarten": cls.kindergarten,
        "teachers": [{"id": str(t.id), "name": t.name} for t in teachers],
        "child_count": child_count,
    }


def parent_link_out(user: User, link: ChildParent) -> dict:
    """{id, name, email, is_active, relation, linked_at}"""
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "is_active": user.is_active,
        "relation": link.relation,
        "linked_at": _iso(link.created_at),
    }
