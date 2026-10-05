"""Admin: classes and teacher assignment (/classes, /classes/{id}/teachers).

Owned by WP-07. Paths are relative to /api (no router prefix); main.py includes this module.
"""
from fastapi import APIRouter

router = APIRouter(tags=["classes"])
