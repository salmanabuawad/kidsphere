"""Development timeline (GET /children/{id}/timeline).

Owned by WP-08. Paths are relative to /api (no router prefix); main.py includes this module.
"""
from fastapi import APIRouter

router = APIRouter(tags=["timeline"])
