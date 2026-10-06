"""PDF report API (COVERAGE-MATRIX §4.4, §6.5 item 8, §6.6): access, headers, the export log,
audit, failure handling, the render lock, temp files and memory."""
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from datetime import date, timedelta
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app import vocab
from app.models import AuditLog, ReportExport
from app.reports import render, service
from app.reports.context import ReportContext
from app.reports.render import REPORTS_DIR, ReportBusy, render_pdf
from app.reports.service import build_model
from app.schemas.reports import ReportRequest
from tests.fixtures.reports.support import TEXTS, seed, use_registries

BACKEND = Path(__file__).resolve().parents[1]
MAX_RSS_MB = 250


@pytest.fixture
def registries(monkeypatch, tmp_path):
    root = use_registries(monkeypatch, tmp_path)
    yield root
    vocab.reload()


@pytest.fixture
def kg_class(make_class, teacher):
    return make_class("Class A", kindergarten=TEXTS["en"]["kindergarten"], teachers=[teacher])


@pytest.fixture
def seeded(db, registries, teacher, kg_class, make_child, parent):
    return seed(db, teacher=teacher, klass=kg_class, make_child=make_child, lang="en", parent=parent)


def url(child_id) -> str:
    return f"/api/children/{child_id}/reports/pdf"


def counts(db) -> tuple[int, int]:
    db.expire_all()
    exports = db.scalar(select(func.count()).select_from(ReportExport))
    audits = db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == "report.export"))
    return exports, audits


def my_tmp_entries() -> set:
    root = tempfile.gettempdir()
    out = set()
    for name in os.listdir(root):
        try:
            if os.stat(os.path.join(root, name)).st_uid == os.getuid():
                out.add(name)
        except OSError:
            continue
    return out


# ---------------------------------------------------------------------------- access


def test_requires_a_session(client, seeded):
    r = client.post(url(seeded.child.id), json={"report_type": "full"})
    assert r.status_code == 401
    assert client.get(f"/api/children/{seeded.child.id}/reports").status_code == 401


def test_parents_and_out_of_scope_teachers_get_404(db, seeded, parent_client, other_teacher_client):
    for c in (parent_client, other_teacher_client):
        r = c.post(url(seeded.child.id), json={"report_type": "parent_questionnaire"})
        assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
        assert c.get(f"/api/children/{seeded.child.id}/reports").status_code == 404
    assert counts(db) == (0, 0)


def test_unknown_child_is_404(teacher_client, registries):
    r = teacher_client.post(url("00000000-0000-0000-0000-000000000000"), json={"report_type": "full"})
    assert r.status_code == 404


# ---------------------------------------------------------------------------- success


def test_export_returns_an_attachment_and_logs_once(db, seeded, teacher_client, teacher):
    before = my_tmp_entries()
    r = teacher_client.post(url(seeded.child.id), json={"report_type": "full", "language": "he",
                                                        "include_health": True})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF-")
    today = date.today().isoformat()
    disposition = r.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    assert f"filename*=UTF-8''kidsphere-full-" in disposition and disposition.endswith(".pdf")
    assert r.headers["cache-control"] == "private, no-store"
    assert r.headers["x-content-type-options"] == "nosniff"
    # No filesystem path, URL or temp folder reaches the client.
    for needle in (str(REPORTS_DIR).encode(), str(BACKEND).encode(), b"file:", b"/tmp/"):
        assert needle not in r.content
    assert not (my_tmp_entries() - before), "a render left files in the temp folder"

    assert counts(db) == (1, 1)
    row = db.scalars(select(ReportExport)).one()
    assert row.report_type == "full" and row.language == "he" and row.generated_by == teacher.id
    assert row.options["include_health"] is True and row.options["include_family"] is False
    assert json.dumps(row.options).find(seeded.texts["heart"]) == -1  # never content
    audit = db.scalars(select(AuditLog).where(AuditLog.action == "report.export")).one()
    assert audit.child_id == seeded.child.id and audit.object_id == row.id
    assert audit.meta["report_type"] == "full" and audit.meta["include_health"] is True
    assert today[:4] in disposition


def test_language_defaults_to_the_users_language(db, seeded, client_for, make_user, kg_class):
    from app.models import ClassTeacher

    arabic_teacher = make_user("teacher", language="ar")
    db.add(ClassTeacher(class_id=kg_class.id, user_id=arabic_teacher.id))
    db.commit()
    r = client_for(arabic_teacher).post(url(seeded.child.id), json={"report_type": "intervention_plan"})
    assert r.status_code == 200
    db.expire_all()
    assert db.scalars(select(ReportExport)).one().language == "ar"


@pytest.mark.parametrize("report_type", ["parent_questionnaire", "teacher_observation", "current_development",
                                         "intervention_plan", "timeline"])
def test_every_report_type_exports(db, seeded, teacher_client, report_type):
    body = {"report_type": report_type, "language": "en"}
    if report_type == "teacher_observation":
        body["assessment_id"] = str(seeded.cycle.id)
    if report_type == "timeline":
        body.update(date_from=(date.today() - timedelta(days=90)).isoformat(), date_to=date.today().isoformat())
    r = teacher_client.post(url(seeded.child.id), json=body)
    assert r.status_code == 200, r.text
    assert r.content.startswith(b"%PDF-")
    assert f"kidsphere-{report_type.replace('_', '-')}-" in r.headers["content-disposition"]
    assert counts(db) == (1, 1)


def test_export_log_lists_exports_newest_first_without_content(db, seeded, teacher_client, teacher):
    start = (date.today() - timedelta(days=30)).isoformat()
    end = date.today().isoformat()
    assert teacher_client.post(url(seeded.child.id), json={"report_type": "timeline", "date_from": start,
                                                           "date_to": end}).status_code == 200
    assert teacher_client.post(url(seeded.child.id), json={"report_type": "intervention_plan",
                                                           "language": "ar"}).status_code == 200
    r = teacher_client.get(f"/api/children/{seeded.child.id}/reports")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "private, no-store"
    log = r.json()["exports"]
    assert [e["report_type"] for e in log] == ["intervention_plan", "timeline"]
    assert log[1]["date_from"] == start and log[1]["date_to"] == end
    assert log[0]["language"] == "ar" and log[0]["date_from"] is None
    assert log[0]["generated_by"] == {"id": str(teacher.id), "name": teacher.name}
    assert set(log[0]) == {"id", "report_type", "language", "date_from", "date_to", "generated_at", "generated_by",
                           "include_health", "include_family", "include_private_notes"}
    assert seeded.texts["heart"] not in r.text


# ---------------------------------------------------------------------------- validation


@pytest.mark.parametrize("body", [
    {"report_type": "nope"},
    {"report_type": "full", "language": "fr"},
    {"report_type": "timeline", "date_from": "2026-03-05", "date_to": "2026-03-01"},
    {"report_type": "timeline", "date_from": (date.today() + timedelta(days=10)).isoformat()},
    {"report_type": "full", "unexpected": True},
])
def test_invalid_requests_are_400(db, seeded, teacher_client, body):
    r = teacher_client.post(url(seeded.child.id), json=body)
    assert r.status_code == 400, r.text
    assert r.json()["error"]["code"] == "VALIDATION"
    assert counts(db) == (0, 0)


def test_a_cycle_of_another_child_is_rejected(db, seeded, teacher_client, make_child, kg_class, make_assessment, teacher):
    sibling = make_child(kg_class, name="Noa")
    cycle = make_assessment(sibling, created_by=teacher)
    r = teacher_client.post(url(seeded.child.id), json={"report_type": "teacher_observation",
                                                        "assessment_id": str(cycle.id)})
    assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION"
    assert counts(db) == (0, 0)


# ---------------------------------------------------------------------------- failures and the render lock


def test_a_failed_render_writes_nothing_and_leaks_nothing(db, seeded, teacher_client, monkeypatch):
    def boom(model, wait=None):
        raise RuntimeError(f"cannot open {REPORTS_DIR}/fonts/secret.ttf")

    monkeypatch.setattr(service, "render_pdf", boom)
    r = teacher_client.post(url(seeded.child.id), json={"report_type": "full"})
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "REPORT_FAILED"
    assert str(REPORTS_DIR) not in r.text and "secret" not in r.text
    assert counts(db) == (0, 0)


def test_a_failed_model_writes_nothing(db, seeded, teacher_client, monkeypatch):
    def boom(ctx):
        raise KeyError("builder bug")

    monkeypatch.setitem(service.BUILDERS, "full", boom)
    r = teacher_client.post(url(seeded.child.id), json={"report_type": "full"})
    assert r.status_code == 500 and r.json()["error"]["code"] == "REPORT_FAILED"
    assert "builder bug" not in r.text
    assert counts(db) == (0, 0)


def test_busy_renderer_returns_503_and_writes_nothing(db, seeded, teacher_client, monkeypatch):
    monkeypatch.setattr(render, "RENDER_WAIT_SECONDS", 0.05)
    assert render._render_lock.acquire(timeout=5)
    try:
        r = teacher_client.post(url(seeded.child.id), json={"report_type": "intervention_plan"})
    finally:
        render._render_lock.release()
    assert r.status_code == 503 and r.json()["error"]["code"] == "REPORT_BUSY"
    assert counts(db) == (0, 0)


def _model(db, teacher, seeded, kg_class, report_type="full", lang="en"):
    request = ReportRequest(report_type=report_type, language=lang)
    model = build_model(ReportContext(db, teacher, seeded.child, kg_class, request, lang, date.today()))
    db.rollback()
    return model


def test_a_second_render_waits_for_the_first(db, seeded, teacher, kg_class):
    model = _model(db, teacher, seeded, kg_class, "intervention_plan")
    with pytest.raises(ReportBusy):
        assert render._render_lock.acquire(timeout=5)
        try:
            render_pdf(model, wait=0.05)
        finally:
            render._render_lock.release()
    result = {}
    assert render._render_lock.acquire(timeout=5)
    worker = threading.Thread(target=lambda: result.setdefault("pdf", render_pdf(model, wait=30)))
    worker.start()
    time.sleep(0.3)
    assert "pdf" not in result  # still waiting for the lock
    render._render_lock.release()
    worker.join(60)
    assert result["pdf"].startswith(b"%PDF-")


def test_full_report_render_stays_under_the_memory_budget(db, seeded, teacher, kg_class):
    """R1 for the seeded child, rendered in a fresh interpreter: peak RSS (imports included) < 250 MB.

    The peak is VmHWM of /proc/self/status: getrusage's ru_maxrss survives fork + exec, so in a
    child of pytest it would report the test runner's own size."""
    model = _model(db, teacher, seeded, kg_class, "full", "ar")
    script = (
        "import json, re, sys\n"
        "peak = lambda: int(re.search(r'VmHWM:\\s+(\\d+)', open('/proc/self/status').read()).group(1))\n"
        "import weasyprint\n"
        "from app.reports.render import render_pdf\n"
        "imported = peak()\n"
        "pdf = render_pdf(json.load(sys.stdin))\n"
        "print(json.dumps({'rss_kb': peak(), 'imported_kb': imported, 'size': len(pdf)}))\n"
    )
    payload = json.dumps(model, default=str, ensure_ascii=False)
    artifacts = Path(os.environ.get("KS_REPORT_ARTIFACTS") or BACKEND.parent / "artifacts" / "reports")
    artifacts.mkdir(parents=True, exist_ok=True)
    (artifacts / "full-ar-model.json").write_text(payload, encoding="utf-8")  # for a reviewer; fixture data only
    proc = subprocess.run([sys.executable, "-W", "ignore", "-c", script], input=payload, capture_output=True,
                          text=True, cwd=BACKEND, env=dict(os.environ), timeout=180)
    assert proc.returncode == 0, proc.stderr[-2000:]
    out = json.loads(proc.stdout.strip().splitlines()[-1])
    print(f"R1 render: peak RSS {out['rss_kb'] // 1024} MB (after imports {out['imported_kb'] // 1024} MB), "
          f"{out['size']} bytes")
    assert out["size"] > 1000
    assert out["rss_kb"] / 1024 < MAX_RSS_MB, f"peak RSS {out['rss_kb'] / 1024:.0f} MB"
