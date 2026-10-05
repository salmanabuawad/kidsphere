"""Password hashing and session tokens.

Passwords use pyca ``bcrypt`` at cost 12. Only the first 72 UTF-8 bytes are
used, exactly like bcryptjs, so hashes written by the legacy Next.js app
(``$2a$`` / ``$2b$``) keep verifying, and long Arabic/Hebrew passwords work
(bcrypt 5 raises on more than 72 bytes instead of truncating).
"""
import hashlib
import re
import secrets

import bcrypt

BCRYPT_ROUNDS = 12
BCRYPT_HASH_RE = re.compile(r"^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$")


def _pw_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:72]


def hash_password(password: str, rounds: int = BCRYPT_ROUNDS) -> str:
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt(rounds)).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_pw_bytes(password), password_hash.encode("ascii"))
    except (ValueError, UnicodeEncodeError):
        return False


def is_bcrypt_hash(value: str) -> bool:
    """True for a 60-character ``$2a$``/``$2b$`` bcrypt hash."""
    return bool(BCRYPT_HASH_RE.match(value or ""))


# A real cost-12 hash of a random secret. Login checks unknown identifiers
# against it so the response time does not reveal whether an account exists.
DUMMY_HASH = hash_password(secrets.token_urlsafe(24))


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Only this sha256 hex digest is stored; the token itself lives only in the cookie."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
