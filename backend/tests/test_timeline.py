"""Development timeline: WP-08 (PLAN-ADJUSTMENTS B5: feedback shows once; A6 limit/offset) and WP2-NAV
(COVERAGE-MATRIX X-20, X-21, X-34, §4.5: filters per source, questionnaire_submitted, plan_changed,
summary_approved, assessment_closed, focus_closed from record_versions)."""
import json
import re
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import (
    Baseline,
    ChildProfile,
    ContentFeedback,
    DevelopmentReview,
    FocusArea,
    FunctionalSummary,
    GeneratedContent,
    Observation,
    RecordVersion,
    TeacherAssessment,
)
from app.services import history

T0 = datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc)


def at(hours: float) -> datetime:
    return T0 + timedelta(hours=hours)


def url(child):
    return f"/api/children/{child.id}/timeline"


def content_row(child, teacher, title="Build the Garage Together", status="approved", approved=None, content_type="real_world_activity", **kw):
    return GeneratedContent(
        child_id=child.id, mode="growth_support", content_type=content_type, language="en",
        title=title, content={"title": title}, status=status, generation_input={}, ai_provider="template",
        is_template=True, approved_by=teacher.id if approved else None, approved_at=approved, created_by=teacher.id, **kw,
    )


def feedback(db, child, teacher, content, result="partly", text=None, when=None):
    obs = Observation(child_id=child.id, content_id=content.id, focus_area_id=content.focus_area_id,
                      source="content_feedback", observation=text, observed_at=when or at(50),
                      support_level="some_support", created_by=teacher.id)
    db.add(obs)
    db.flush()
    db.add(ContentFeedback(content_id=content.id, child_id=child.id, result=result, observation=text,
                           observation_id=obs.id, created_by=teacher.id))
    return obs


def test_one_feedback_is_exactly_one_entry(teacher_client, teacher, child, db):
    content = content_row(child, teacher, status="completed", approved=at(1))
    db.add(content)
    db.flush()
    obs = feedback(db, child, teacher, content, result="worked_well", text=None, when=at(2))
    db.commit()

    entries = teacher_client.get(url(child)).json()["entries"]
    fb = [e for e in entries if e["type"] == "content_feedback"]
    assert len(fb) == 1
    assert fb[0]["id"] == str(obs.id) and fb[0]["result"] == "worked_well"
    assert fb[0]["content_title"] == "Build the Garage Together" and fb[0]["text"] is None
    assert fb[0]["by_name"] == teacher.name and fb[0]["support_level"] == "some_support"
    # The content itself shows once as approved; nothing else.
    assert [e["type"] for e in entries] == ["content_feedback", "content_approved"]
    assert len(entries) == 2


def test_all_sources_in_strict_reverse_order_and_pages_do_not_overlap(teacher_client, teacher, child, db):
    focus = FocusArea(child_id=child.id, category="social", title="Joining group play", status="completed",
                      created_by=teacher.id, created_at=at(3), closed_at=at(40))
    db.add(focus)
    db.add(Baseline(child_id=child.id, baseline_data={"basics": {}}, created_by=teacher.id, created_at=at(1)))
    db.flush()
    db.add(Observation(child_id=child.id, observation="Watched the block corner", observed_at=at(5),
                       focus_area_id=focus.id, context="free_play", created_by=teacher.id))
    db.add(Observation(child_id=child.id, observation="Asked to build together", observed_at=at(30),
                       support_level="independent", created_by=teacher.id))
    approved = content_row(child, teacher, status="approved", approved=at(10), focus_area_id=focus.id)
    done = content_row(child, teacher, title="The Lion Who Asked", status="completed", approved=at(20))
    draft = content_row(child, teacher, title="Draft only", status="draft")
    db.add_all([approved, done, draft])
    db.flush()
    feedback(db, child, teacher, done, result="did_not_work", text="Left after 8 minutes", when=at(25))
    db.add(DevelopmentReview(child_id=child.id, summary="More confident joining play", understanding={},
                             created_by=teacher.id, created_at=at(45)))
    db.commit()

    full = teacher_client.get(url(child), params={"limit": 100}).json()
    entries = full["entries"]
    types = [e["type"] for e in entries]
    assert types == ["review", "focus_closed", "observation", "content_feedback", "content_approved",
                     "content_approved", "observation", "focus_opened", "baseline"]
    stamps = [datetime.fromisoformat(e["at"]) for e in entries]
    assert stamps == sorted(stamps, reverse=True) and len(set(stamps)) == len(stamps)
    assert not full["has_more"]
    assert "Draft only" not in json.dumps(full)

    closed = entries[1]
    assert closed["status"] == "completed" and closed["title"] == "Joining group play"
    first_obs = entries[6]
    assert first_obs["text"] == "Watched the block corner" and first_obs["focus_area_title"] == "Joining group play"
    assert entries[5]["focus_area_title"] == "Joining group play" and entries[4]["content_title"] == "The Lion Who Asked"
    assert entries[0]["text"] == "More confident joining play"

    pages, offset = [], 0
    while True:
        page = teacher_client.get(url(child), params={"limit": 2, "offset": offset}).json()
        pages.append(page)
        offset += 2
        if not page["has_more"]:
            break
    ids = [(e["type"], e["id"]) for p in pages for e in p["entries"]]
    assert ids == [(e["type"], e["id"]) for e in entries]
    assert len(pages) == 5


def test_no_numbers_or_percentages_in_payload(teacher_client, teacher, child, db):
    db.add(Observation(child_id=child.id, observation="Played", created_by=teacher.id))
    db.commit()
    body = teacher_client.get(url(child)).json()
    assert set(body) == {"entries", "limit", "offset", "has_more"}
    entry = body["entries"][0]
    assert not any(isinstance(v, (int, float)) and not isinstance(v, bool) for v in entry.values())
    assert not re.search(r"\d+\s*%|score|points", json.dumps(entry), re.I)


def test_scope(teacher_client, other_teacher_client, parent_client, other_parent_client, admin_client, child):
    assert teacher_client.get(url(child)).status_code == 200
    assert admin_client.get(url(child)).status_code == 200
    for c in (other_teacher_client, parent_client, other_parent_client):
        r = c.get(url(child))
        assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"


def test_api_flow_shows_new_observation_and_focus(teacher_client, child):
    f = teacher_client.post(f"/api/children/{child.id}/focus-areas", json={"suggestion_key": "joining_group_play"})
    assert f.status_code == 201
    o = teacher_client.post(f"/api/children/{child.id}/observations",
                            json={"observation": "Joined the train game", "focus_area_id": f.json()["focus_area"]["id"]})
    assert o.status_code == 201
    entries = teacher_client.get(url(child)).json()["entries"]
    assert [e["type"] for e in entries] == ["observation", "focus_opened"]
    assert entries[0]["text"] == "Joined the train game" and entries[0]["focus_area_title"] == "Joining group play"


def test_dev_seed_story_reads_in_order(db, client_for):
    from sqlalchemy import select

    from app import dev_seed
    from app.models import User

    result = dev_seed.seed(db, password="Demo-pass-123")
    teacher = db.scalars(select(User).where(User.email == "demo-teacher")).one()
    c = client_for(teacher)
    adam = c.get(f"/api/children/{result['children']['Adam'][0]}/timeline").json()["entries"]
    assert [e["type"] for e in adam] == ["observation"] * 4 + ["baseline", "focus_opened"]
    assert [e["support_level"] for e in adam[:4]] == ["independent", "some_support", "some_support", "significant_support"]
    assert all(e["focus_area_title"] == "Joining group play" for e in adam[:4])
    maya = c.get(f"/api/children/{result['children']['Maya'][0]}/timeline").json()["entries"]
    assert [e["type"] for e in maya] == ["observation"] * 3 + ["baseline"]


# --------------------------------------------------------------------------- WP2-NAV: filters and new entry types


def types_of(client, child, **params):
    r = client.get(url(child), params={"limit": 100, **params})
    assert r.status_code == 200, r.text
    return [(e["type"], e["id"]) for e in r.json()["entries"]]


def version(db, child, focus, seq, created_at, via="manual", user=None, **data):
    """A focus_area record_versions row (the full focus state, as WP2-PLAN writes it) at a fixed time."""
    base = {"title": focus.title, "category": focus.category, "description": None, "plan": None,
            "status": "active", "close_reason": None, "closed_at": None, "follow_up_on": None}
    row = RecordVersion(child_id=child.id, entity_type="focus_area", entity_id=focus.id, entity_key="", seq=seq,
                        data={**base, **data}, changed_by=user.id if user else None,
                        changed_by_name=user.name if user else None, changed_role=user.role if user else "system",
                        via=via, created_at=created_at)
    db.add(row)
    db.flush()
    return row


@pytest.fixture
def story(db, child, teacher):
    """One row of every filterable source, spread over days."""
    social = FocusArea(child_id=child.id, category="social", title="Joining group play", created_by=teacher.id,
                       created_at=at(2))
    calm = FocusArea(child_id=child.id, category="emotional", title="Calming down", created_by=teacher.id,
                     created_at=at(3))
    db.add_all([social, calm])
    db.add(Baseline(child_id=child.id, baseline_data={}, created_by=teacher.id, created_at=at(1)))
    db.flush()
    obs_social = Observation(child_id=child.id, observation="Joined the train game", observed_at=at(24),
                             focus_area_id=social.id, area="social", domains=["social"], context="free_play",
                             created_by=teacher.id)
    obs_lang = Observation(child_id=child.id, observation="Told a long story", observed_at=at(48),
                           domains=["language"], created_by=teacher.id)
    obs_area = Observation(child_id=child.id, observation="Waited for a turn", observed_at=at(72), area="social",
                           created_by=teacher.id)
    db.add_all([obs_social, obs_lang, obs_area])
    activity = content_row(child, teacher, status="completed", approved=at(30), focus_area_id=social.id)
    tale = content_row(child, teacher, title="The Brave Lion", status="approved", approved=at(50),
                       content_type="story", focus_area_id=calm.id)
    db.add_all([activity, tale])
    db.flush()
    fb_activity = feedback(db, child, teacher, activity, result="worked_well", when=at(96))
    fb_tale = feedback(db, child, teacher, tale, result="partly", text="Listened to the end", when=at(120))
    review_social = DevelopmentReview(child_id=child.id, summary="Joins play more often", understanding={},
                                      focus_review=[{"focus_area_id": str(social.id), "decision": "keep"}],
                                      created_by=teacher.id, created_at=at(144))
    review_other = DevelopmentReview(child_id=child.id, summary="Calmer mornings", understanding={},
                                     focus_review=[{"focus_area_id": str(calm.id), "decision": "keep"}],
                                     created_by=teacher.id, created_at=at(168))
    db.add_all([review_social, review_other])
    db.commit()
    return {"social": social, "calm": calm, "obs_social": obs_social, "obs_lang": obs_lang, "obs_area": obs_area,
            "activity": activity, "tale": tale, "fb_activity": fb_activity, "fb_tale": fb_tale,
            "review_social": review_social, "review_other": review_other}


def _ids(story, *pairs):
    return [(t, str(story[k].id)) for t, k in pairs]


def test_unfiltered_story_lists_every_source(teacher_client, child, story):
    assert [t for t, _ in types_of(teacher_client, child)] == [
        "review", "review", "content_feedback", "content_feedback", "observation", "content_approved",
        "observation", "content_approved", "observation", "focus_opened", "focus_opened", "baseline",
    ]


def test_date_range_filters_every_source(teacher_client, child, story):
    # at(24) .. at(72) are 2026-09-02 08:00 .. 2026-09-04 08:00 UTC; both ends are whole days, inclusive.
    assert types_of(teacher_client, child, date_from="2026-09-02", date_to="2026-09-03") == _ids(
        story, ("content_approved", "tale"), ("observation", "obs_lang"), ("content_approved", "activity"),
        ("observation", "obs_social"))
    assert [t for t, _ in types_of(teacher_client, child, date_to="2026-09-01")] == [
        "focus_opened", "focus_opened", "baseline"]
    assert types_of(teacher_client, child, date_from="2026-09-08") == _ids(story, ("review", "review_other"))


def test_focus_filter_keeps_only_that_goal(teacher_client, child, story):
    assert types_of(teacher_client, child, focus_area_id=str(story["social"].id)) == _ids(
        story, ("review", "review_social"), ("content_feedback", "fb_activity"), ("content_approved", "activity"),
        ("observation", "obs_social"), ("focus_opened", "social"))
    assert types_of(teacher_client, child, focus_area_id=str(uuid.uuid4())) == []


def test_domain_filter_uses_domains_area_and_focus_category(teacher_client, child, story):
    assert types_of(teacher_client, child, domain="social") == _ids(
        story, ("content_feedback", "fb_activity"), ("observation", "obs_area"), ("content_approved", "activity"),
        ("observation", "obs_social"), ("focus_opened", "social"))
    assert types_of(teacher_client, child, domain="language") == _ids(story, ("observation", "obs_lang"))
    assert types_of(teacher_client, child, domain="emotional") == _ids(
        story, ("content_feedback", "fb_tale"), ("content_approved", "tale"), ("focus_opened", "calm"))
    assert types_of(teacher_client, child, domain="gross_motor") == []


def test_activity_and_result_filters(teacher_client, child, story):
    assert types_of(teacher_client, child, content_type="story") == _ids(
        story, ("content_feedback", "fb_tale"), ("content_approved", "tale"))
    assert types_of(teacher_client, child, content_type="real_world_activity") == _ids(
        story, ("content_feedback", "fb_activity"), ("content_approved", "activity"))
    assert types_of(teacher_client, child, result="worked_well") == _ids(story, ("content_feedback", "fb_activity"))
    assert types_of(teacher_client, child, result="did_not_work") == []
    # Filters combine with AND.
    assert types_of(teacher_client, child, result="partly", focus_area_id=str(story["social"].id)) == []


def test_type_filter_and_its_alias(teacher_client, child, story):
    got = teacher_client.get(url(child), params=[("type", "baseline"), ("type", "review"), ("limit", "100")]).json()
    assert [e["type"] for e in got["entries"]] == ["review", "review", "baseline"]
    alias = teacher_client.get(url(child), params=[("type[]", "observation")]).json()
    assert [e["type"] for e in alias["entries"]] == ["observation"] * 3


def test_filtered_pages_do_not_overlap(teacher_client, child, story):
    full = types_of(teacher_client, child, domain="social")
    seen, offset = [], 0
    while True:
        page = teacher_client.get(url(child), params={"domain": "social", "limit": 2, "offset": offset}).json()
        seen += [(e["type"], e["id"]) for e in page["entries"]]
        offset += 2
        if not page["has_more"]:
            break
    assert seen == full and len(full) == 5


@pytest.mark.parametrize("params", [
    {"domain": "attention"},  # a focus category, not an AI domain
    {"content_type": "poster"},
    {"result": "great"},
    {"type": "everything"},
    {"focus_area_id": "not-a-uuid"},
    {"date_from": "2026-09-10", "date_to": "2026-09-01"},
    {"date_from": "yesterday"},
])
def test_invalid_filters_are_400(teacher_client, child, params):
    r = teacher_client.get(url(child), params=params)
    assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION"


def test_one_feedback_is_one_entry_under_every_filter(teacher_client, teacher, child, db):
    focus = FocusArea(child_id=child.id, category="social", title="Joining group play", created_by=teacher.id,
                      created_at=at(0))
    db.add(focus)
    db.flush()
    content = content_row(child, teacher, status="completed", approved=at(1), focus_area_id=focus.id)
    db.add(content)
    db.flush()
    obs = feedback(db, child, teacher, content, result="did_not_work", when=at(2))
    db.commit()
    for params in ({}, {"focus_area_id": str(focus.id)}, {"domain": "social"}, {"result": "did_not_work"},
                   {"content_type": "real_world_activity"}, {"type": "content_feedback"}):
        got = [x for x in types_of(teacher_client, child, **params) if x[0] == "content_feedback"]
        assert got == [("content_feedback", str(obs.id))], params


def test_close_reopen_close_shows_both_closures(teacher_client, teacher, child, db, make_focus_area):
    focus = make_focus_area(child, created_by=teacher, created_at=at(0))
    version(db, child, focus, 1, at(0), user=teacher)
    first = version(db, child, focus, 2, at(10), via="status", user=teacher, status="completed",
                    closed_at=at(10).isoformat(), close_reason="Joins most mornings")
    reopen = version(db, child, focus, 3, at(20), via="review", user=teacher)
    second = version(db, child, focus, 4, at(30), via="status", user=teacher, status="paused",
                     closed_at=at(30).isoformat(), close_reason="Holiday break")
    # The row itself holds only the latest state.
    db.execute(FocusArea.__table__.update().where(FocusArea.id == focus.id).values(
        status="paused", closed_at=at(30), close_reason="Holiday break"))
    db.commit()

    entries = teacher_client.get(url(child)).json()["entries"]
    assert [(e["type"], e["id"]) for e in entries] == [
        ("focus_closed", str(second.id)), ("plan_changed", str(reopen.id)), ("focus_closed", str(first.id)),
        ("focus_opened", str(focus.id)),
    ]
    closed = [e for e in entries if e["type"] == "focus_closed"]
    assert [(e["status"], e["text"], e["at"]) for e in closed] == [
        ("paused", "Holiday break", at(30).isoformat()), ("completed", "Joins most mornings", at(10).isoformat())]
    assert all(e["focus_area_id"] == str(focus.id) and e["by_name"] == teacher.name for e in closed)
    reopened = entries[1]
    assert reopened["changes"] == ["status"] and reopened["status"] == "active" and reopened["via"] == "review"
    # The focus filter keeps all of them; the type filter only the closures.
    assert len(types_of(teacher_client, child, focus_area_id=str(focus.id))) == 4
    assert [t for t, _ in types_of(teacher_client, child, type="focus_closed")] == ["focus_closed"] * 2


def test_plan_changes_come_from_versions(teacher_client, teacher, child, db, make_focus_area):
    focus = make_focus_area(child, created_by=teacher, created_at=at(0))
    version(db, child, focus, 1, at(0), user=teacher, plan={"need": "Starting play"})
    version(db, child, focus, 2, at(5), user=teacher, plan={"need": "Starting play"})  # nothing changed
    changed = version(db, child, focus, 3, at(6), user=teacher, plan={"need": "Starting play", "frequency": "Daily"},
                      follow_up_on="2026-10-01")
    db.commit()
    entries = teacher_client.get(url(child)).json()["entries"]
    assert [(e["type"], e["id"]) for e in entries] == [("plan_changed", str(changed.id)), ("focus_opened", str(focus.id))]
    assert entries[0]["changes"] == ["plan", "follow_up_on"] and entries[0]["title"] == "Joining group play"
    assert entries[0]["by_name"] == teacher.name
    assert types_of(teacher_client, child, domain="social", type="plan_changed") == [("plan_changed", str(changed.id))]
    assert types_of(teacher_client, child, domain="emotional", type="plan_changed") == []


def test_backfilled_closure_is_not_doubled_by_the_row(teacher_client, teacher, child, db, make_focus_area):
    focus = make_focus_area(child, status="completed", created_by=teacher, created_at=at(0), closed_at=at(9),
                            close_reason="Done")
    version(db, child, focus, 1, at(9), via="backfill", status="completed", closed_at=at(9).isoformat(),
            close_reason="Done")
    db.commit()
    entries = teacher_client.get(url(child)).json()["entries"]
    assert [e["type"] for e in entries] == ["focus_closed", "focus_opened"]
    assert entries[0]["at"] == at(9).isoformat() and entries[0]["text"] == "Done"


def test_history_writer_close_reopen_close(teacher_client, teacher, child, db, make_focus_area):
    """The same story written with app.services.history.record, one transaction per change."""
    focus = make_focus_area(child, created_by=teacher)

    def save(via, **values):
        db.execute(FocusArea.__table__.update().where(FocusArea.id == focus.id).values(**values))
        db.expire_all()
        history.record(db, child_id=child.id, entity_type="focus_area", entity_id=focus.id,
                       data=history.snapshot(db.get(FocusArea, focus.id)), user=teacher, via=via)
        db.commit()

    history.record(db, child_id=child.id, entity_type="focus_area", entity_id=focus.id,
                   data=history.snapshot(focus), user=teacher, via="manual")
    db.commit()
    save("status", status="completed", closed_at=at(10))
    save("review", status="active", closed_at=None, close_reason=None)
    save("status", status="completed", closed_at=at(20))
    types = [t for t, _ in types_of(teacher_client, child)]
    assert types.count("focus_closed") == 2 and types.count("plan_changed") == 1


def test_questionnaire_submissions(teacher_client, teacher, parent, child, db):
    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one()
    profile.parent_perspective = {"questionnaire": {"status": "submitted", "submitted_at": at(5).isoformat(),
                                                    "submitted_by": str(teacher.id), "entry_mode": "on_behalf"}}
    db.add(RecordVersion(child_id=child.id, entity_type="profile_section", entity_key="parent:_questionnaire", seq=1,
                         data={"status": "submitted", "submitted_at": at(1).isoformat(), "entry_mode": "self"},
                         changed_by=parent.id, changed_by_name=parent.name, changed_role="parent", via="self",
                         created_at=at(1)))
    db.add(RecordVersion(child_id=child.id, entity_type="profile_section", entity_key="parent:_questionnaire", seq=2,
                         data={"status": "draft"}, changed_role="system", via="system", created_at=at(3)))
    db.add(RecordVersion(child_id=child.id, entity_type="profile_section", entity_key="parent:_questionnaire", seq=3,
                         data={"status": "submitted", "submitted_at": at(5).isoformat(), "entry_mode": "on_behalf",
                               "submitted_by": str(teacher.id)},
                         changed_by=teacher.id, changed_by_name=teacher.name, changed_role="teacher", via="on_behalf",
                         created_at=at(5)))
    db.commit()
    entries = teacher_client.get(url(child)).json()["entries"]
    assert [(e["type"], e["status"], e["by_name"], e["at"]) for e in entries] == [
        ("questionnaire_submitted", "on_behalf", teacher.name, at(5).isoformat()),
        ("questionnaire_submitted", "self", parent.name, at(1).isoformat()),
    ]
    # Never part of a focus, domain or activity view.
    assert types_of(teacher_client, child, domain="social") == []
    assert len(types_of(teacher_client, child, date_from="2026-09-01", date_to="2026-09-01")) == 2


def test_migrated_questionnaire_without_versions(teacher_client, child, db):
    profile = db.scalars(select(ChildProfile).where(ChildProfile.child_id == child.id)).one()
    profile.parent_perspective = {"questionnaire": {"status": "submitted", "submitted_at": at(2).isoformat(),
                                                    "entry_mode": "self", "migrated": True}}
    db.commit()
    entries = teacher_client.get(url(child)).json()["entries"]
    assert [(e["type"], e["status"], e["by_name"]) for e in entries] == [("questionnaire_submitted", "self", None)]
    profile.parent_perspective = {"questionnaire": {"status": "draft", "entry_mode": "self"}}
    db.commit()
    assert teacher_client.get(url(child)).json()["entries"] == []


def test_approved_summaries_and_closed_cycles(teacher_client, teacher, child, db):
    db.add(FunctionalSummary(child_id=child.id, general_description="Curious and kind", source="manual",
                             status="approved", approved_by=teacher.id, approved_at=at(40), created_by=teacher.id))
    db.add(FunctionalSummary(child_id=child.id, general_description="Draft only", source="manual",
                             created_by=teacher.id))
    cycle = TeacherAssessment(child_id=child.id, kind="initial", status="closed", closed_at=at(30),
                              closed_by=teacher.id, created_by=teacher.id)
    db.add(cycle)
    db.flush()
    db.add(TeacherAssessment(child_id=child.id, kind="reassessment", previous_id=cycle.id, created_by=teacher.id))
    db.commit()
    entries = teacher_client.get(url(child)).json()["entries"]
    assert [(e["type"], e["status"], e["by_name"]) for e in entries] == [
        ("summary_approved", "manual", teacher.name), ("assessment_closed", "initial", teacher.name)]
    assert entries[0]["text"] == "Curious and kind" and entries[1]["id"] == str(cycle.id)
    assert "Draft only" not in json.dumps(entries)
    assert types_of(teacher_client, child, type="assessment_closed") == [("assessment_closed", str(cycle.id))]
    assert types_of(teacher_client, child, focus_area_id=str(uuid.uuid4())) == []


def test_filters_do_not_widen_scope(other_teacher_client, parent_client, child):
    for c in (other_teacher_client, parent_client):
        r = c.get(url(child), params={"domain": "social", "type": "observation"})
        assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"


def test_child_detail_gives_the_focus_follow_up_date(teacher_client, teacher, child, make_focus_area):
    """The Overview shows each current focus with its next review date (WP2-NAV; additive key in child_detail)."""
    from datetime import date

    make_focus_area(child, created_by=teacher, follow_up_on=date(2026, 11, 2))
    make_focus_area(child, title="Taking turns", created_by=teacher)
    focus = teacher_client.get(f"/api/children/{child.id}").json()["child"]["focus_areas"]
    assert sorted((f["title"], f["follow_up_on"]) for f in focus) == [
        ("Joining group play", "2026-11-02"), ("Taking turns", None)]
