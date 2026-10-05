"""Baselines and current understanding (/children/{id}/baseline, /children/{id}/current-understanding).

Owned by WP-06. Paths are relative to /api (no router prefix); main.py includes this module.
"""
from fastapi import APIRouter

router = APIRouter(tags=["baselines"])
