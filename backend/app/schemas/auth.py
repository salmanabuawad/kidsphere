"""Auth and account schemas. Passwords are never stripped or otherwise changed."""
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import User
from app.schemas.common import Language, Role, StrictModel

IDENTIFIER_PATTERN = r"^[a-z0-9._%+@-]+$"


class LoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # An e-mail address or a plain username; matched case-insensitively.
    identifier: str = Field(min_length=2, max_length=200, pattern=IDENTIFIER_PATTERN)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("identifier", mode="before")
    @classmethod
    def _normalize(cls, v):
        return v.strip().lower() if isinstance(v, str) else v


class MeUpdateIn(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    language: Language | None = None


class PasswordChangeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: Role
    language: Language


def user_out(user: User) -> dict:
    """The public shape of a user: {id, name, email, role, language}."""
    return {"id": str(user.id), "name": user.name, "email": user.email, "role": user.role, "language": user.language}
