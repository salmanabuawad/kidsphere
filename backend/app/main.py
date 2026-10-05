"""FastAPI application: middleware, error handlers and every router under /api.

Run: ``uvicorn app.main:app --host 127.0.0.1 --port 3071`` (from backend/).
"""
import importlib
import logging
import pkgutil
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import routers
from app.config import settings
from app.errors import AppError, error_response, install_error_handlers

# Fixed order first; any other module in app/routers is included after these.
ROUTER_MODULES = [
    "auth", "me", "health", "options",
    "users", "classes", "parents",
    "children", "profiles", "baselines", "focus_areas",
    "observations", "timeline",
    "content", "feedback", "reviews",
]

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _router_modules() -> list[str]:
    found = sorted(m.name for m in pkgutil.iter_modules(routers.__path__) if not m.name.startswith("_"))
    return [m for m in ROUTER_MODULES if m in found] + [m for m in found if m not in ROUTER_MODULES]


def _cross_origin(request: Request) -> bool:
    """True when a mutating request carries an Origin whose host differs from Host."""
    origin = request.headers.get("origin")
    if request.method not in MUTATING_METHODS or origin is None:
        return False
    try:
        return urlsplit(origin).netloc.lower() != request.headers.get("host", "").lower()
    except ValueError:
        return True


def _mount_spa(app: FastAPI, dist: Path) -> None:
    """Serve a built SPA (CI preview only; production uses nginx)."""
    dist = dist.resolve()
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise AppError("NOT_FOUND")
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(dist):
            return FileResponse(candidate)
        return FileResponse(dist / "index.html", headers={"Cache-Control": "no-cache"})


def create_app() -> FastAPI:
    logging.basicConfig(level=settings.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    app = FastAPI(title="KidSphere API", docs_url=None, redoc_url=None, openapi_url=None)
    install_error_handlers(app)

    @app.middleware("http")
    async def same_origin_only(request: Request, call_next):
        if _cross_origin(request):
            return error_response("FORBIDDEN", "Cross-site request blocked.")
        return await call_next(request)

    for name in _router_modules():
        module = importlib.import_module(f"app.routers.{name}")
        app.include_router(module.router, prefix="/api")

    if settings.serve_static_dir:
        _mount_spa(app, Path(settings.serve_static_dir))
    return app


app = create_app()
