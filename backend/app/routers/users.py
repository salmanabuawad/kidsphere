"""Admin: users (GET/POST /users, PUT /users/{id}, POST /users/{id}/password).

Owned by WP-07. Paths are relative to /api (no router prefix); main.py includes this module.
"""
from fastapi import APIRouter

router = APIRouter(tags=["users"])
