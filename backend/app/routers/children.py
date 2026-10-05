"""Children CRUD, archive and photo (/children, /children/{id}, /children/{id}/photo).

Owned by WP-05. Paths are relative to /api (no router prefix); main.py includes this module.
"""
from fastapi import APIRouter

router = APIRouter(tags=["children"])
