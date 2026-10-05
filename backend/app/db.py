"""Database engine and the per-request session.

Endpoints get a session through ``deps.DB`` (``Depends(get_db)``). Nothing is
committed automatically: a service that writes calls ``db.commit()`` once, at
the end of its unit of work. Anything not committed is rolled back when the
request ends.
"""
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url,
    pool_size=5,
    max_overflow=5,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
