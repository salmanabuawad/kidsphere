"""Real PDFs (WeasyPrint) for every report type in he, ar and en, parsed back with
pdfminer.six (COVERAGE-MATRIX §6.5). Glyph positions prove the visual result:

1. logical ↔ visual order of mixed Hebrew/Arabic lines with numbers, dates and Latin words;
2. Arabic is joined: "ببب" uses three different glyphs, none of them the isolated "ب",
   all mapping back to U+0628 (the same for "مرحبا");
3. RTL tables: the first DOM column's header is the rightmost;
4. RTL paragraph lines end at the right content edge;
5. every page has the disclaimer and "x / y"; page 1 has the child's name, age and kindergarten;
6. only the bundled fonts are embedded.

Page 1 of every report is also rasterised to PNG (pypdfium2) under
``<run dir>/artifacts/reports`` for a human look; pixels are never asserted.
"""
import io
import os
import re
import unicodedata
from datetime import date
from pathlib import Path

import pytest

from app import vocab
from app.models import REPORT_TYPE_VALUES
from app.reports.context import ReportContext
from app.reports.i18n import messages
from app.reports.render import REPORTS_DIR, render_pdf
from app.reports.service import build_model
from app.schemas.reports import ReportRequest
from tests.fixtures.reports.support import (
    ISOLATES,
    MARKERS,
    TEXTS,
    embedded_fonts,
    expected_visual,
    page_count,
    page_lines,
    pdf_pages,
    seed,
    squash,
    use_registries,
)

ARTIFACTS = Path(os.environ.get("KS_REPORT_ARTIFACTS") or Path(__file__).resolve().parents[2] / "artifacts" / "reports")
MM = 72 / 25.4
A4_WIDTH = 210 * MM
MARGIN_INLINE = 16 * MM  # static/report.css @page margin (start and end)
FOOTER_TOP = 20 * MM  # glyphs below this baseline are in the bottom margin (footer boxes)
# @font-face families of static/report.css ("KS Rubik" → BaseFont "KS-Rubik", "KS-Rubik-Bold", …) → bundled file.
BUNDLED = {"KS-Noto-Sans-Hebrew": "NotoSansHebrew-VF.ttf", "KS-Noto-Sans-Arabic": "NotoSansArabic-VF.ttf", "KS-Rubik": "Rubik-VF.ttf"}
BRACKETS = str.maketrans({c: "|" for c in "()[]{}<>"})


@pytest.fixture
def registries(monkeypatch, tmp_path):
    root = use_registries(monkeypatch, tmp_path)
    yield root
    vocab.reload()


def norm(text: str) -> str:
    """Squashed text without combining marks (Arabic harakat are positioned glyphs whose x order is
    not reading order) and with brackets unified (HarfBuzz mirrors them in RTL runs)."""
    return "".join(c for c in squash(text) if not unicodedata.combining(c)).translate(BRACKETS)


def visual(text: str, rtl: bool) -> str:
    return norm(expected_visual(text, rtl))


def make_report(db, user, seeded, klass, report_type, lang, **opts):
    request = ReportRequest(report_type=report_type, language=lang, **opts)
    ctx = ReportContext(db, user, seeded.child, klass, request, lang, date.today())
    model = build_model(ctx)
    db.rollback()
    return model, render_pdf(model)


def save_png(pdf: bytes, name: str) -> None:
    """Page 1 as PNG for a reviewer (never asserted). Missing pypdfium2 only skips the picture."""
    try:
        import pypdfium2 as pdfium
    except ImportError:  # pragma: no cover
        return
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    doc = pdfium.PdfDocument(pdf)
    try:
        page = doc[0]
        image = page.render(scale=2).to_pil()
        image.save(ARTIFACTS / f"{name}.png")
        page.close()
    finally:
        doc.close()
    (ARTIFACTS / f"{name}.pdf").write_bytes(pdf)


def lines_of(pages) -> list:
    return [page_lines(glyphs) for glyphs in pages]


def body_lines(lines):
    return [line for line in lines if line.y > FOOTER_TOP]


def footer_lines(lines):
    return [line for line in lines if line.y <= FOOTER_TOP]


def logical_of(line, rtl: bool) -> str:
    """Logical text of a line whose content is all one direction (the footer disclaimer)."""
    text = norm(line.text)
    return text[::-1] if rtl else text


def kg_class_for(make_class, teacher, lang):
    return make_class("Class A", kindergarten=TEXTS[lang]["kindergarten"], teachers=[teacher])


def walk_blocks(model):
    for section in model["sections"]:
        for block in section["blocks"]:
            if block:
                yield section, block


# ---------------------------------------------------------------------------- per report and language


def check_footer_and_header(pages, lang, seeded, model):
    rtl = lang != "en"
    disclaimer = norm(messages(lang)["footer"]["disclaimer"])
    all_lines = lines_of(pages)
    n = len(pages)
    for number, lines in enumerate(all_lines, start=1):
        foot = footer_lines(lines)
        assert foot, f"page {number}: no footer"
        text = "".join(logical_of(line, rtl) for line in sorted(foot, key=lambda ln: -ln.y))
        assert disclaimer in re.sub(r"[0-9/]", "", text), f"page {number}: disclaimer missing ({lang})"
        assert any(f"{number}/{n}" in norm(line.text) for line in foot), f"page {number}: no '{number} / {n}'"
    first = " ".join(norm(line.text) for line in body_lines(all_lines[0]))
    assert "KidSphere" in first, "the wordmark is not read left to right"
    for value in (model["meta"]["child"]["name"], model["meta"]["child"]["age"], model["meta"]["child"]["kindergarten"]):
        assert visual(value, rtl) in first, f"page 1 lacks {value!r} ({lang})"
    assert model["meta"]["child"]["name"] == seeded.texts["name"]


def check_tables(pages, model, lang):
    """3. In he/ar the first DOM column's header is the rightmost cell of the header row."""
    rtl = lang != "en"
    lines = [line for page in lines_of(pages) for line in body_lines(page)]
    seen = set()
    for _section, block in walk_blocks(model):
        if block["type"] != "table" or tuple(block["columns"]) in seen:
            continue
        seen.add(tuple(block["columns"]))
        words = [visual(col.split()[-1], rtl) for col in block["columns"]]
        found = 0
        for line in lines:
            glyphs = [g for g in line.glyphs if norm(g.text)]
            chars, owner = [], []
            for g in glyphs:
                for c in norm(g.text if not rtl or len(g.text) == 1 else g.text[::-1]):
                    chars.append(c)
                    owner.append(g)
            text = "".join(chars)
            if not all(w in text for w in words):
                continue
            found += 1
            # Search the header words in reading order: from the right in RTL, from the left in LTR.
            xs, limit = [], len(text) if rtl else 0
            for w in words:
                pos = text.rfind(w, 0, limit) if rtl else text.find(w, limit)
                assert pos >= 0, f"table header order is wrong ({lang}): {block['columns']}"
                xs.append(owner[pos].x0)
                limit = pos if rtl else pos + len(w)
            if rtl:
                assert xs[0] == max(xs), f"first column is not the rightmost ({lang}): {block['columns']}"
                assert xs == sorted(xs, reverse=True)
            else:
                assert xs[0] == min(xs) and xs == sorted(xs)
        assert found, f"no header row found for {block['columns']} ({lang})"
    return len(seen)


def check_section_titles_align(pages, model, lang):
    """4. RTL headings (block paragraphs, text-align: start) end at the right content edge."""
    edge = A4_WIDTH - MARGIN_INLINE
    lines = [line for page in lines_of(pages) for line in body_lines(page)]
    for section in model["sections"]:
        want = visual(section["title"], True)
        matches = [line for line in lines if norm(line.text) == want]
        assert matches, f"section title not found: {section['title']!r} ({lang})"
        assert min(abs(line.x1 - edge) for line in matches) <= 1.0, (section["title"], [m.x1 for m in matches], edge)


def check_fonts(pdf: bytes):
    """6. Every embedded font is a subset of one of the bundled files (same family, same revision)."""
    from fontTools.ttLib import TTFont
    from pypdf import PdfReader

    revisions = {prefix: round(TTFont(REPORTS_DIR / "fonts" / file, lazy=True)["head"].fontRevision, 3)
                 for prefix, file in BUNDLED.items()}
    names = embedded_fonts(pdf)
    assert names, "no fonts embedded"
    for name in names:
        assert any(name.startswith(prefix) for prefix in BUNDLED), f"unexpected font {name}"
    for page in PdfReader(io.BytesIO(pdf)).pages:
        fonts = (page.get("/Resources") or {}).get("/Font") or {}
        for ref in fonts.values():
            font = ref.get_object()
            base = str(font.get("/BaseFont", "")).lstrip("/").split("+", 1)[-1]
            descriptor = font.get("/FontDescriptor")
            if descriptor is None and font.get("/DescendantFonts"):
                descriptor = font["/DescendantFonts"][0].get_object().get("/FontDescriptor")
            assert descriptor is not None, base
            stream = descriptor.get_object().get("/FontFile2") or descriptor.get_object().get("/FontFile3")
            assert stream is not None, f"{base} is not embedded"
            family = next(prefix for prefix in BUNDLED if base.startswith(prefix))
            data = stream.get_object().get_data()
            try:
                revision = round(TTFont(io.BytesIO(data), lazy=True)["head"].fontRevision, 3)
            except Exception:  # a CFF program (FontFile3) has no head table; the name check above stands
                continue
            assert revision == revisions[family], f"{base}: revision {revision} is not the bundled {revisions[family]}"


def text_of(pages) -> str:
    return " ".join(line.text for page in lines_of(pages) for line in page)


@pytest.mark.parametrize("report_type", REPORT_TYPE_VALUES)
@pytest.mark.parametrize("lang", ["he", "ar", "en"])
def test_real_pdf_layout(db, registries, teacher, make_class, make_child, report_type, lang):
    klass = kg_class_for(make_class, teacher, lang)
    seeded = seed(db, teacher=teacher, klass=klass, make_child=make_child, lang=lang)
    model, pdf = make_report(db, teacher, seeded, klass, report_type, lang)
    assert pdf.startswith(b"%PDF-")
    save_png(pdf, f"{report_type}-{lang}")
    pages = pdf_pages(pdf)
    assert len(pages) == page_count(pdf) >= 1
    check_footer_and_header(pages, lang, seeded, model)
    check_tables(pages, model, lang)
    if lang != "en":
        check_section_titles_align(pages, model, lang)
    check_fonts(pdf)

    # 7. content rules: nothing scored, no drafts, nothing private without its flag.
    text = text_of(pages)
    flat = squash(text)
    assert "%" not in text
    assert not re.search(r"\bscore\b|\bpoints\b", text, re.IGNORECASE)
    for marker in ("draft", "ai_pending", "content_draft", "health", "family", "private"):
        assert MARKERS[marker] not in flat, marker
    # No path, URL or temp folder ends up in the file.
    for needle in (str(REPORTS_DIR).encode(), b"file:", b"/tmp/", b"/var/"):
        assert needle not in pdf


# ---------------------------------------------------------------------------- bidi and Arabic shaping


def find_line(pages, want: str):
    for page in lines_of(pages):
        for line in body_lines(page):
            if want in norm(line.text):
                return line
    return None


@pytest.mark.parametrize("lang, key", [
    ("he", "appreciate"),      # Hebrew + a number + a Latin word
    ("he", "likes_at_home"),   # Hebrew + a date
    ("ar", "appreciate"),      # Arabic + a number + a Latin word
    ("ar", "remember"),        # Arabic + a date + a Latin word
])
def test_mixed_lines_are_in_visual_order_and_right_aligned(db, registries, teacher, make_class, make_child, lang, key):
    klass = kg_class_for(make_class, teacher, lang)
    seeded = seed(db, teacher=teacher, klass=klass, make_child=make_child, lang=lang)
    _model, pdf = make_report(db, teacher, seeded, klass, "parent_questionnaire", lang)
    pages = pdf_pages(pdf)
    logical = TEXTS[lang][key]
    want = visual(logical, True)
    line = find_line(pages, want)
    assert line is not None, f"{logical!r} not found in visual order; expected {want!r}"
    # The whole line is exactly that answer (one paragraph), right-aligned at the content edge.
    assert norm(line.text) == want
    assert abs(line.x1 - (A4_WIDTH - MARGIN_INLINE)) <= 1.0
    # Numbers and Latin words keep their left-to-right order inside the line.
    for run in re.findall(r"[0-9][0-9.]*[0-9]|[0-9]+|[A-Za-z]+", logical):
        assert run in norm(line.text), run


def _words(line):
    """Glyph groups separated by spaces or gaps (visual order, left to right)."""
    words, current, prev = [], [], None
    for g in line.glyphs:
        if not g.text.strip() or g.text in ISOLATES:
            if current:
                words.append(current)
            current, prev = [], None
            continue
        if prev is not None and g.x0 - prev.x1 > 1.0 and not unicodedata.combining(g.text[0]):
            words.append(current)
            current = []
        if not unicodedata.combining(g.text[0]):
            current.append(g)
            prev = g
    if current:
        words.append(current)
    return words


def test_arabic_letters_are_joined_not_isolated(db, registries, teacher, make_class, make_child):
    klass = kg_class_for(make_class, teacher, "ar")
    seeded = seed(db, teacher=teacher, klass=klass, make_child=make_child, lang="ar")
    _model, pdf = make_report(db, teacher, seeded, klass, "parent_questionnaire", "ar")
    pages = pdf_pages(pdf)
    logical = TEXTS["ar"]["likes_at_home"]  # "ببب ب مرحبا م ر ح ب ا"
    line = find_line(pages, visual(logical, True))
    assert line is not None
    words = _words(line)
    # Visual order is the logical order reversed; each word's glyphs are right to left too.
    texts = ["".join(g.text for g in reversed(w)) for w in reversed(words)]
    assert texts == logical.split(), texts
    beh3, beh1, marhaba, *isolated = list(reversed(words))
    isolated = {"".join(g.text for g in w): w[0] for w in isolated}
    assert set(isolated) == {"م", "ر", "ح", "ب", "ا"}
    joined = list(reversed(beh3))  # logical order: initial, medial, final
    cids = [g.cid for g in joined]
    assert all(g.text == "ب" for g in joined) and beh1[0].text == "ب"
    assert len(set(cids)) == 3, f"ببب is not shaped: {cids}"
    assert beh1[0].cid not in cids, "the isolated ب has the same glyph as a joined one"
    assert isolated["ب"].cid == beh1[0].cid
    # مرحبا: every letter is a joining form, never the isolated glyph of that letter.
    letters = list(reversed(marhaba))
    assert "".join(g.text for g in letters) == "مرحبا"
    for g in letters:
        assert g.cid != isolated[g.text].cid, f"{g.text} in مرحبا is drawn isolated"
    assert all("KS-Noto-Sans-Arabic" in g.font for g in joined + letters)


# ---------------------------------------------------------------------------- include flags in a real PDF


@pytest.mark.parametrize("report_type", ["parent_questionnaire", "full"])
def test_private_parts_print_only_with_their_flags(db, registries, teacher, make_class, make_child, report_type):
    klass = kg_class_for(make_class, teacher, "he")
    seeded = seed(db, teacher=teacher, klass=klass, make_child=make_child, lang="he")
    _model, pdf = make_report(db, teacher, seeded, klass, report_type, "he")
    flat = squash(text_of(pdf_pages(pdf)))
    assert MARKERS["health"] not in flat and MARKERS["family"] not in flat and MARKERS["private"] not in flat
    _model, pdf = make_report(db, teacher, seeded, klass, report_type, "he", include_health=True, include_family=True,
                              include_private_notes=True)
    flat = squash(text_of(pdf_pages(pdf)))
    assert MARKERS["health"] in flat and MARKERS["family"] in flat and MARKERS["private"] in flat
    for marker in ("draft", "ai_pending", "content_draft"):
        assert MARKERS[marker] not in flat


def test_latin_first_answer_lines_align_with_the_rtl_document(db, registries, teacher, make_class, make_child):
    """An answer that starts with a Latin word ("Lego") keeps dir=ltr for its bidi order but is
    right-aligned like every other line of a he report; so is the builder's "name (relation)" line."""
    klass = kg_class_for(make_class, teacher, "he")
    seeded = seed(db, teacher=teacher, klass=klass, make_child=make_child, lang="he")
    _model, pdf = make_report(db, teacher, seeded, klass, "parent_questionnaire", "he")
    pages = pdf_pages(pdf)
    edge = A4_WIDTH - MARGIN_INLINE
    lego = [line for page in lines_of(pages) for line in body_lines(page) if norm(line.text) == "Lego"]
    assert lego, "the answer line 'Lego' was not found"
    assert min(abs(line.x1 - edge) for line in lego) <= 1.0, [line.x1 for line in lego]
    dana = [line for page in lines_of(pages) for line in body_lines(page) if "Dana" in norm(line.text)]
    assert dana and min(abs(line.x1 - edge) for line in dana) <= 1.0, [line.x1 for line in dana]


@pytest.mark.parametrize("lang, glyph, other", [("he", "‹", "›"), ("ar", "‹", "›"), ("en", "›", "‹")])
def test_step_separators_point_to_the_next_step(db, teacher, make_class, make_child, monkeypatch, tmp_path,
                                                lang, glyph, other):
    use_registries(monkeypatch, tmp_path, real=True)
    try:
        klass = kg_class_for(make_class, teacher, lang)
        seeded = seed(db, teacher=teacher, klass=klass, make_child=make_child, lang=lang)
        _model, pdf = make_report(db, teacher, seeded, klass, "timeline", lang)
        text = text_of(pdf_pages(pdf))
        assert glyph in text and other not in text
    finally:
        vocab.reload()
