"""Child profile sections (GET/PATCH /children/{id}/profile).

Owned by WP-06. Paths are relative to /api (no router prefix); main.py includes this module.
"""
from fastapi import APIRouter

router = APIRouter(tags=["profiles"])
