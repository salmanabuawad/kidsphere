"""Shared helpers for the PDF report tests (tests/test_reports_*.py).

    use_registries(monkeypatch, tmp_path, real=False)
        Points settings.options_path at a temp folder holding app/data/options.json,
        lists/common.json and the fixture registries of this folder (``real=True``: every
        list fragment and the real app/data/source registries instead).
    seed(db, *, teacher, klass, make_child, lang) -> SimpleNamespace
        One child with a filled questionnaire, a quick baseline, a teacher observation
        cycle, plans, observations, an approved activity with feedback, a review, an
        approved functional summary plus a draft and a pending AI suggestion that must
        never be printed. Texts are in ``lang`` (TEXTS); MARKERS are Latin strings that
        tell where something leaked.
    pdf_pages(pdf) -> [[Glyph]]      every glyph with its text, cid, font, x0/x1 and baseline
    page_lines(glyphs) -> [Line]     glyphs grouped by baseline, sorted by x (visual order)
    expected_visual(text, rtl)       the visual order of a logical string (python-bidi)
    embedded_fonts(pdf) -> {name}    BaseFont names without the subset prefix
"""
import io
import json
import shutil
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from app import vocab
from app.config import APP_DIR, settings
from app.models import (
    AiSuggestion,
    Baseline,
    ContentFeedback,
    DevelopmentReview,
    FocusArea,
    FunctionalSummary,
    GeneratedContent,
    Observation,
    TeacherAssessment,
    TeacherAssessmentEntry,
)
from app.services import history

HERE = Path(__file__).resolve().parent
DATA = APP_DIR / "data"
ISOLATES = "⁦⁧⁨⁩"

MARKERS = {
    "health": "HEALTHMARK7Q",
    "family": "FAMILYMARK3Z",
    "private": "PRIVATEMARK9X",
    "draft": "DRAFTMARK5D",
    "ai_pending": "AIPENDINGMARK2P",
    "legacy": "LEGACYMARK4L",
    "content_draft": "CONTENTDRAFTMARK8C",
}

TEXTS = {
    "en": {
        "name": "Adam",
        "kindergarten": "Sunflower Kindergarten",
        "appreciate": "He laughs with everyone and builds a tower of 12 blocks with Lego every morning.",
        "likes_at_home": "Drawing trains with his sister on 5.3.2026.",
        "heart": "He is shy at first, but after two days he feels at home.",
        "develop": "To say what he feels in words.",
        "observation": "Built a tall tower with Noa and waited for his turn.",
        "summary": "Adam joins group play more often and uses words when he is upset.",
        "understanding": "Adam is curious and kind; short instructions help him.",
        "focus": "Joining group play",
        "remember": "Likes to know what comes next.",
    },
    "he": {
        "name": "אדם",
        "kindergarten": "גן החמנייה",
        "appreciate": "הוא צוחק עם כולם ובונה מגדל של 12 קוביות עם Lego בכל בוקר.",
        "likes_at_home": "מצייר רכבות עם אחותו ב־5.3.2026.",
        "heart": "הוא מתבייש בהתחלה, אבל אחרי יומיים הוא כבר מרגיש בבית.",
        "develop": "לומר במילים מה הוא מרגיש.",
        "observation": "בנה מגדל גבוה עם נועה וחיכה לתורו.",
        "summary": "אדם מצטרף יותר למשחק קבוצתי ומשתמש במילים כשהוא כועס.",
        "understanding": "אדם סקרן ואדיב; הוראות קצרות עוזרות לו.",
        "focus": "הצטרפות למשחק קבוצתי",
        "remember": "אוהב לדעת מה יקרה אחר כך.",
    },
    "ar": {
        "name": "آدم",
        "kindergarten": "روضة عباد الشمس",
        "appreciate": "يبني برجاً من 12 مكعباً مع Lego كل صباح ويضحك مع الجميع.",
        "likes_at_home": "ببب ب مرحبا م ر ح ب ا",
        "heart": "يخجل في البداية، لكنه بعد يومين يشعر أنه في بيته.",
        "develop": "أن يعبّر بالكلمات عمّا يشعر به.",
        "observation": "بنى برجاً عالياً مع نوعا وانتظر دوره.",
        "summary": "آدم يشارك أكثر في اللعب الجماعي ويستخدم الكلمات عندما يغضب.",
        "understanding": "آدم فضولي ولطيف؛ التعليمات القصيرة تساعده.",
        "focus": "المشاركة في اللعب الجماعي",
        "remember": "سيبدأ الرسم في 5.3.2026 مع Lego بعد اللعب.",
    },
}


# ---------------------------------------------------------------------------- registries


def use_registries(monkeypatch, tmp_path: Path, real: bool = False) -> Path:
    root = tmp_path / "data"
    (root / "lists").mkdir(parents=True)
    (root / "source").mkdir()
    shutil.copy(DATA / "options.json", root / "options.json")
    fragments = sorted((DATA / "lists").glob("*.json")) if real else [DATA / "lists" / "common.json"]
    for frag in fragments:
        shutil.copy(frag, root / "lists" / frag.name)
    source = DATA / "source" if real else HERE / "source"
    for reg in sorted(source.glob("*.json")):
        shutil.copy(reg, root / "source" / reg.name)
    monkeypatch.setattr(settings, "options_path", root / "options.json")
    vocab.reload()
    return root


# ---------------------------------------------------------------------------- seed data


def _now():
    return datetime.now(timezone.utc)


def seed(db, *, teacher, klass, make_child, lang: str = "en", parent=None):
    T = TEXTS[lang]
    now = _now()
    child = make_child(klass, parents=[parent] if parent else (), name="Adam Haddad", preferred_name=T["name"],
                       birth_date=date(2022, 8, 5), parent_name="Dana Haddad", parent_contact="050-1234567")
    stamp = {"by": str(teacher.id), "by_name": teacher.name, "role": "teacher", "reported_by": "parent",
             "at": now.isoformat(), "mode": "meeting"}
    from app.models import ChildProfile
    from sqlalchemy import select

    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one()
    profile.parent_perspective = {
        "sections": {
            "who": {"describe_words": ["curious", "kind"], "appreciate": T["appreciate"],
                    "parents": [{"name": "Dana", "relation": "mother"}],
                    "interests_pq": {"selected": ["animals", "construction"], "other": ""},
                    "interests": ["animals"],
                    "not_answered": ["what_attracts"]},
            "joy": {"likes_at_home": T["likes_at_home"], "persists_at": {"value": "yes", "text": "Lego"}},
            "emotions": {"what_does_not_help": MARKERS["legacy"]},
            "health": {"sleep": MARKERS["health"], "medical": {"value": "yes", "text": MARKERS["health"]}},
            "behaviour": {"boundaries_at_home": MARKERS["family"]},
            "expectations": {"develop": {"emotional": {"text": T["develop"]}, "other": {"area": "Music", "text": "Sing"}},
                             "hope_child_feels": {"selected": ["safe", "happy"]}},
            "partnership": {"contact_channels": {"selected": ["phone"]}, "family_context": MARKERS["family"]},
            "heart": {"message": T["heart"]},
        },
        "entered": {"who": [stamp], "joy": [stamp]},
        "questionnaire": {"status": "submitted", "submitted_at": (now - timedelta(days=30)).isoformat(),
                          "entry_mode": "meeting", "meeting": {"date": (now - timedelta(days=30)).date().isoformat(),
                                                               "attendees": ["mother"]}},
        "section_status": {"who": {"status": "sufficient"}, "joy": {"status": "in_progress"}},
    }
    profile.teacher_perspective = {
        "sections": {
            "bridge": {"main_strengths": [{"key": "creativity", "main": True}, {"key": "curiosity"}, {"key": "memory"}],
                       "remember": [{"text": T["remember"]}],
                       "calms_helps": {"items": [{"key": "hug"}], "text": ""},
                       "first_area_to_observe": {"domain": "social", "note": ""},
                       "question_for_parent": {"text": MARKERS["private"], "status": "open"}},
            "who": {"strengths": [{"key": "imagination"}]},
        },
        "entered": {"bridge": [{"by": str(teacher.id), "by_name": teacher.name, "role": "teacher",
                                "reported_by": "teacher", "at": now.isoformat()}]},
        "section_status": {"bridge": {"status": "sufficient"}},
    }
    profile.strengths = [{"key": "creativity", "sources": ["parent", "teacher"], "main": True},
                         {"key": "curiosity", "sources": ["review"]}]
    profile.interests = [{"key": "animals", "sources": ["parent"]}]
    profile.what_helps = [{"key": "hug", "list": "calming_helps", "sources": ["teacher"]}]
    db.commit()

    # Focus areas (plan goals) with a version history: closed → reopened → closed shows both closures.
    focus = FocusArea(child_id=child.id, title=T["focus"], category="social", status="active",
                      plan={"strength_used": "Building", "need": "Joining others", "adaptation": "Small group",
                            "what_we_will_do": "Build together twice a week", "frequency": "Twice a week",
                            "who": "Teacher", "success_looks_like": "Joins without help"},
                      follow_up_on=date.today() + timedelta(days=30), created_by=teacher.id)
    closed = FocusArea(child_id=child.id, title="Tidying up", category="independence", status="completed",
                       close_reason="Does it alone now", closed_at=now - timedelta(days=5), created_by=teacher.id)
    db.add_all([focus, closed])
    db.flush()
    history.record(db, child_id=child.id, entity_type="focus_area", entity_id=closed.id,
                   data={"title": "Tidying up", "status": "active"}, user=teacher, via="manual")
    history.record(db, child_id=child.id, entity_type="focus_area", entity_id=closed.id,
                   data={"title": "Tidying up", "status": "completed", "close_reason": "Done"}, user=teacher, via="status")
    db.commit()

    baseline_data = {"strengths": [{"key": "creativity"}], "interests": [{"key": "animals"}],
                     "focus_areas": [{"title": T["focus"]}],
                     "support_needs": {"independence": [{"area": "toilet", "level": "some_support"}]}}
    db.add(Baseline(child_id=child.id, baseline_data=baseline_data, created_by=teacher.id,
                    created_at=now - timedelta(days=60)))
    db.add(Baseline(child_id=child.id, baseline_data=baseline_data, created_by=teacher.id,
                    created_at=now - timedelta(days=20)))
    db.commit()

    obs = Observation(child_id=child.id, source="quick", observed_at=now - timedelta(days=3), context="free_play",
                      observation=T["observation"], support_level="some_support", focus_area_id=focus.id,
                      what_helped=[{"key": "adult_mediation"}],
                      details={"what_i_see": T["observation"], "when_detail": {"time": "10:00", "activity": "free_play"},
                               "needs": {"helps": ["short_instruction"], "text": ""}, "what_we_did": "Invited a friend",
                               "did_it_change": "partly", "what_changed": "Waited longer"},
                      created_by=teacher.id)
    db.add(obs)
    content = GeneratedContent(child_id=child.id, focus_area_id=focus.id, mode="growth_support", content_type="story",
                               language=lang, title="The tower we built", content={"title": "x"}, status="completed",
                               generation_input={}, ai_provider="template", is_template=True,
                               approved_by=teacher.id, approved_at=now - timedelta(days=4), created_by=teacher.id)
    draft_content = GeneratedContent(child_id=child.id, mode="growth_support", content_type="story", language=lang,
                                     title=MARKERS["content_draft"], content={"title": "x"}, status="draft",
                                     generation_input={}, ai_provider="template", is_template=True, created_by=teacher.id)
    db.add_all([content, draft_content])
    db.flush()
    mirrored = Observation(child_id=child.id, source="content_feedback", observed_at=now - timedelta(days=2),
                           content_id=content.id, observation=None, support_level="independent", created_by=teacher.id)
    db.add(mirrored)
    db.flush()
    db.add(ContentFeedback(content_id=content.id, child_id=child.id, result="worked_well", support_level="independent",
                           observation_id=mirrored.id, created_by=teacher.id))
    review = DevelopmentReview(child_id=child.id, review_date=date.today() - timedelta(days=1), summary=T["summary"],
                               focus_review=[{"focus_area_id": str(focus.id), "title": T["focus"], "status": "improving",
                                              "decision": "keep", "what_worked": "Small groups"}],
                               understanding={"summary": T["understanding"]}, ai_suggested=False,
                               follow_up={"reassessment_on": (date.today() + timedelta(days=40)).isoformat(),
                                          "improvement": {"level": "partial", "note": "More often now"},
                                          "involvement": {"key": "joint_plan", "note": ""}},
                               created_by=teacher.id)
    db.add(review)
    db.commit()
    profile.current_understanding = {"summary": T["understanding"], "source": "review", "review_id": str(review.id),
                                     "approved_by_name": teacher.name, "approved_at": now.isoformat(),
                                     "next_steps": "Keep small groups"}
    db.commit()

    # Teacher observation cycle with one entry per domain kind.
    cycle = TeacherAssessment(child_id=child.id, kind="initial", teacher_id=teacher.id, created_by=teacher.id,
                              filled_on=date.today() - timedelta(days=10), period_from=date.today() - timedelta(days=40),
                              period_to=date.today(), child_snapshot={"name": "Adam Haddad", "preferred_name": T["name"],
                                                                      "kindergarten": T["kindergarten"]})
    db.add(cycle)
    db.flush()
    entries = {
        "emotional": {"items": {"recognizes_basic_emotions": {"level": "independent", "note": "Names sad and happy"},
                                "calms_after_frustration": {"level": "some_support"}},
                      "fields": {"what_helps_calm": {"items": [{"key": "hug"}], "text": "A quiet corner"}}},
        "language": {"items": {"follows_simple_instructions": {"level": "independent"},
                               "asks_questions": {"level": "significant_support", "note": "Uses gestures instead"}}},
        "independence": {"items": {"eating": {"level": "independent"}, "toilet": {"level": "some_support"}}},
        "sensory": {"items": {"noise": {"effect": "affects", "reaction_text": "Covers his ears", "helps": ["reduced_stimulation"]}}},
        "daily_routine": {"stages": {"arrival": {"succeeds": "Says hello", "difficult": "Letting go",
                                                 "support_needed": {"helps": ["adult_mediation"], "text": ""},
                                                 "what_helps": {"helps": ["advance_preparation"], "text": ""}}}},
        "strengths": {"items": [{"list": "strengths", "key": "creativity", "note": "Builds bridges"},
                                {"list": "interests", "key": "animals"}],
                      "fields": {"prominent_interests": {"items": [{"key": "animals"}], "text": ""}}},
        "priority_needs": {"needs": [{"area": "social", "seeing": "Plays alone at free play", "how_often": "Most days",
                                      "focus_area_id": str(focus.id)}]},
    }
    for domain, data in entries.items():
        db.add(TeacherAssessmentEntry(assessment_id=cycle.id, child_id=child.id, domain=domain, status="in_progress",
                                      data=data, entered_by=teacher.id, entered_by_name=teacher.name, entered_role="teacher"))
    db.commit()

    # Functional summaries: an approved one is printed; a draft and a pending AI suggestion never are.
    pending = AiSuggestion(child_id=child.id, kind="functional_summary", provider="template", is_template=True,
                           input={"child": "[child]"}, output={"general_description": MARKERS["ai_pending"]},
                           created_by=teacher.id)
    db.add(pending)
    db.flush()
    approved = FunctionalSummary(child_id=child.id, general_description=T["summary"], adaptations="Short instructions",
                                 main_strengths={"items": [{"key": "creativity"}], "text": ""}, source="manual",
                                 status="approved", approved_by=teacher.id, approved_at=now - timedelta(hours=2),
                                 created_by=teacher.id)
    draft = FunctionalSummary(child_id=child.id, general_description=MARKERS["draft"], source="ai_draft",
                              ai_suggestion_id=pending.id, created_by=teacher.id)
    db.add_all([approved, draft])
    db.commit()
    return SimpleNamespace(child=child, texts=T, focus=focus, cycle=cycle, review=review, lang=lang)


# ---------------------------------------------------------------------------- PDF parsing


@dataclass
class Glyph:
    text: str
    cid: int
    font: str
    x0: float
    x1: float
    y: float
    index: int


@dataclass
class Line:
    y: float
    glyphs: list = field(default_factory=list)

    @property
    def text(self) -> str:
        """Visual (left-to-right) text; a ligature glyph's text is reversed when it is right-to-left."""
        return "".join(_visual_glyph_text(g.text) for g in self.glyphs)

    @property
    def x0(self) -> float:
        return min(g.x0 for g in self.glyphs)

    @property
    def x1(self) -> float:
        return max(g.x1 for g in self.glyphs if g.text.strip()) if any(g.text.strip() for g in self.glyphs) else self.x0


def _is_rtl(ch: str) -> bool:
    import unicodedata

    return unicodedata.bidirectional(ch) in ("R", "AL")


def _visual_glyph_text(text: str) -> str:
    return text[::-1] if len(text) > 1 and any(_is_rtl(c) for c in text) else text


def pdf_pages(pdf: bytes) -> list:
    from pdfminer.converter import PDFLayoutAnalyzer
    from pdfminer.pdfinterp import PDFPageInterpreter, PDFResourceManager
    from pdfminer.pdfpage import PDFPage

    class Recorder(PDFLayoutAnalyzer):
        def __init__(self, rsrc):
            super().__init__(rsrc, pageno=1, laparams=None)
            self.pages, self.current = [], []

        def begin_page(self, page, ctm):
            super().begin_page(page, ctm)
            self.current = []

        def end_page(self, page):
            self.pages.append(self.current)
            super().end_page(page)

        def render_char(self, matrix, font, fontsize, scaling, rise, cid, ncs, graphicstate):
            adv = super().render_char(matrix, font, fontsize, scaling, rise, cid, ncs, graphicstate)
            item = self.cur_item._objs[-1]
            self.current.append(Glyph(item.get_text(), cid, font.fontname, item.x0, item.x1, round(matrix[5], 1),
                                      len(self.current)))
            return adv

    rsrc = PDFResourceManager()
    device = Recorder(rsrc)
    interpreter = PDFPageInterpreter(rsrc, device)
    for page in PDFPage.get_pages(io.BytesIO(pdf)):
        interpreter.process_page(page)
    return device.pages


def page_lines(glyphs) -> list:
    rows: dict = {}
    for g in glyphs:
        key = round(g.y * 2) / 2
        match = next((k for k in rows if abs(k - key) <= 0.6), key)
        rows.setdefault(match, []).append(g)
    return [Line(y, sorted(gs, key=lambda g: (g.x0, g.index))) for y, gs in sorted(rows.items(), key=lambda kv: -kv[0])]


def squash(text: str) -> str:
    return "".join(c for c in text if not c.isspace() and c not in ISOLATES)


def expected_visual(text: str, rtl: bool) -> str:
    try:
        from bidi import get_display
    except ImportError:  # pragma: no cover - older python-bidi
        from bidi.algorithm import get_display
    return squash(get_display(text, base_dir="R" if rtl else "L"))


def find_line(lines, needle_visual: str):
    """The first line whose squashed visual text contains ``needle_visual`` (already squashed)."""
    return next((line for line in lines if needle_visual in squash(line.text)), None)


def embedded_fonts(pdf: bytes) -> set:
    from pypdf import PdfReader

    names = set()
    for page in PdfReader(io.BytesIO(pdf)).pages:
        fonts = (page.get("/Resources") or {}).get("/Font") or {}
        for ref in fonts.values():
            base = str(ref.get_object().get("/BaseFont", ""))
            names.add(base.lstrip("/").split("+", 1)[-1])
    return names


def page_count(pdf: bytes) -> int:
    from pypdf import PdfReader

    return len(PdfReader(io.BytesIO(pdf)).pages)


def report_body(**overrides) -> dict:
    body = {"report_type": "full", "language": "en"}
    body.update(overrides)
    return body


def json_dump(model) -> str:
    return json.dumps(model, ensure_ascii=False, default=str)


def new_id() -> str:
    return str(uuid.uuid4())
