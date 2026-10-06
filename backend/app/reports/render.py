"""Report model → HTML (Jinja2) → PDF bytes (WeasyPrint). No file is written by us
and nothing leaves the server.

    html = render_html(model)          # for tests and debugging
    pdf  = render_pdf(model)           # bytes; raises ReportBusy when another render
                                       # holds the lock for longer than RENDER_WAIT_SECONDS

- Jinja2 ``Environment(autoescape=True)``: user text can never become markup.
- WeasyPrint gets ``base_url`` = this package and a local-only URL fetcher: only
  ``file:`` URLs inside ``app/reports`` (fonts, the stylesheet, the logo) load;
  http(s), data: and any other path are refused.
- Bidi: WeasyPrint does not implement ``unicode-bidi`` or ``dir="auto"``, so names,
  dates, numbers and free text are wrapped in Unicode isolates (FSI/LRI … PDI,
  filters ``iso`` / ``ltr``) and free-text blocks get an explicit ``dir`` from their
  first strong character (filter ``autodir``).
- One render at a time (module ``BoundedSemaphore(1)``): rendering is CPU and memory
  heavy and the API runs one worker (MemoryMax=512M).
- WeasyPrint copies the @font-face files into a private ``mkdtemp`` folder (mode 0700;
  under systemd ``PrivateTmp``); it is removed in ``finally`` after every render.
"""
import gc
import logging
import mimetypes
import shutil
import threading
import unicodedata
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import url2pathname

from jinja2 import Environment, FileSystemLoader, select_autoescape

REPORTS_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = REPORTS_DIR / "templates"
RENDER_WAIT_SECONDS = 20.0

log = logging.getLogger("app.reports")

FSI, LRI, PDI = "⁨", "⁦", "⁩"
_RTL_BIDI = frozenset({"R", "AL"})


class ReportBusy(Exception):
    """Another report is being rendered (the lock was not free within the wait time)."""


_render_lock = threading.BoundedSemaphore(1)


# ---------------------------------------------------------------------------- text direction helpers


def first_strong(text) -> str | None:
    """'rtl' / 'ltr' from the first strong character (the HTML dir=auto rule), else None."""
    if not isinstance(text, str):
        return None
    depth = 0  # like dir=auto (UBA P2), text inside an isolate (FSI/LRI/RLI … PDI) is skipped
    for ch in text:
        kind = unicodedata.bidirectional(ch)
        if kind in ("FSI", "LRI", "RLI"):
            depth += 1
            continue
        if kind == "PDI":
            depth = max(0, depth - 1)
            continue
        if depth:
            continue
        if kind in _RTL_BIDI:
            return "rtl"
        if kind == "L":
            return "ltr"
    return None


def iso(value) -> str:
    """First-strong isolate (like <bdi>): the text keeps its own direction inside any paragraph.

    Text without any strong character (a date range, a number) is left as it is, so it
    follows the paragraph: "27.8.2026 – 6.10.2026" then reads from the right in he/ar,
    like the same range in the page-1 header (an FSI would force it left to right)."""
    if value is None:
        return ""
    text = str(value)
    if not text:
        return ""
    return f"{FSI}{text}{PDI}" if first_strong(text) else text


def ltr(value) -> str:
    """Left-to-right isolate for dates, numbers, e-mail addresses and phone numbers."""
    if value is None:
        return ""
    text = str(value)
    return f"{LRI}{text}{PDI}" if text else ""


def autodir(value, default: str = "auto") -> str:
    return first_strong(value) or default


# ---------------------------------------------------------------------------- templates


@lru_cache(maxsize=1)
def environment() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(default=True, default_for_string=True),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["iso"] = iso
    env.filters["ltr"] = ltr
    env.filters["autodir"] = autodir
    return env


# The bundled fonts have no arrows; the registry sequences ("Strength → Need → …", he/ar "←") print
# with a single angle quotation mark pointing to the next step. The renderer does not mirror it in
# RTL lines, so the glyph depends on the document direction: "›" (U+203A) in en, "‹" (U+2039) in
# he/ar.
PRINT_GLYPHS = str.maketrans({"→": "›", "←": "›"})
PRINT_GLYPHS_RTL = str.maketrans({"→": "‹", "←": "‹"})


def printable(value, rtl: bool = False):
    """``value`` with every string mapped to glyphs the bundled fonts carry (PRINT_GLYPHS, or
    PRINT_GLYPHS_RTL for a right-to-left document)."""
    table = PRINT_GLYPHS_RTL if rtl else PRINT_GLYPHS
    if isinstance(value, str):
        return value.translate(table)
    if isinstance(value, dict):
        return {k: printable(v, rtl) for k, v in value.items()}
    if isinstance(value, list):
        return [printable(v, rtl) for v in value]
    return value


def render_html(model: dict) -> str:
    model = printable(model, rtl=(model.get("meta") or {}).get("dir") == "rtl")
    template = environment().get_template(f"report_{model['meta']['report_type']}.html")
    return template.render(meta=model["meta"], sections=model["sections"], t=model["meta"]["labels"])


# ---------------------------------------------------------------------------- fetching (local files only)


def _local_path(url: str) -> Path | None:
    parts = urlsplit(url)
    if parts.scheme != "file" or parts.netloc not in ("", "localhost"):
        return None
    path = Path(url2pathname(parts.path)).resolve()
    if not path.is_relative_to(REPORTS_DIR) or not path.is_file():
        return None
    return path


def _fetcher():
    from weasyprint.urls import URLFetcher, URLFetcherResponse

    class LocalOnlyFetcher(URLFetcher):
        """Serves files of app/reports only; every other URL raises (WeasyPrint skips it)."""

        def __init__(self):
            super().__init__(allowed_protocols=("file",), allow_redirects=False, fail_on_errors=False)

        def fetch(self, url, headers=None):
            path = _local_path(url)
            if path is None:
                raise ValueError("only bundled report files can be loaded")
            mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            if path.suffix == ".ttf":
                mime = "font/ttf"
            return URLFetcherResponse(path.as_uri(), body=path.read_bytes(), headers={"Content-Type": mime})

    return LocalOnlyFetcher()


# ---------------------------------------------------------------------------- PDF


def _write_pdf(html: str) -> bytes:
    from weasyprint import HTML
    from weasyprint.text.fonts import FontConfiguration

    font_config = FontConfiguration()
    try:
        document = HTML(string=html, base_url=str(REPORTS_DIR) + "/", url_fetcher=_fetcher())
        return document.write_pdf(font_config=font_config)
    finally:
        folder = getattr(font_config, "_folder", None)
        del font_config
        gc.collect()
        if folder:
            shutil.rmtree(folder, ignore_errors=True)


def render_pdf(model: dict, wait: float | None = None) -> bytes:
    """The PDF as bytes. Raises ReportBusy when the render lock stays taken."""
    html = render_html(model)
    if not _render_lock.acquire(timeout=RENDER_WAIT_SECONDS if wait is None else wait):
        raise ReportBusy()
    try:
        return _write_pdf(html)
    finally:
        _render_lock.release()
