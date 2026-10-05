"""Development reviews (/children/{id}/development-reviews...).

Owned by WP-12. Paths are relative to /api (no router prefix); main.py includes this module.
"""
from fastapi import APIRouter

router = APIRouter(tags=["reviews"])
