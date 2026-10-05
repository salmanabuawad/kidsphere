# Plan adjustments (binding — overrides ASSESSMENT.md / ARCHITECTURE.md / work-packages.json where they differ)

Decided by the lead after the critique (critique.json). The product owner asked us not to wait for approval, so open questions are resolved here with the simplest option that serves the loop.

## A. Simplifications (spec §41/§48/§49)
1. **CI harness**: no `kidsphere-ci` platform. One script `deploy/ci/remote-test.sh <label> [backend|frontend|all]` (already written by the lead — use it, don't rewrite it). It uploads the working tree to `/var/lib/kidsphere-ci/runs/<label>`, reuses a venv cached by requirements hash and node_modules cached by lock hash, runs under `flock` against the single DB `kidsphere_test`, and runs as the unprivileged user `kidsphere-ci`. No preview service, and no per-run DBs.
2. **Deploys do not rerun the full test suite.** Deploy is: build, migrate, restart and smoke test.
3. **Claude provider**: one `messages.create` call with JSON-schema structured output. Validate with Pydantic and the safety check, and fall back to the template provider on any failure. No repair round-trip, no `server-side-fallback` beta, no hand-written schema sanitizer beyond what the SDK and API need.
4. **Template provider**: generic templates per **content type × focus category × mode**, with slot filling ({name}, interest, strength, phrase, helper), in ar/he/en, plus `variant` rotation for regenerate. No 10-suggestion × type matrix. Test every type × mode × language, not every focus suggestion.
5. **Frontend routes**: keep `import.meta.glob('./features/*/routes.tsx')` so parallel packages don't edit one file. `paths.ts` holds the path builders.
6. **No `schema_version`** fields. The timeline uses `limit/offset` ("load older"), not cursors.
7. **No video-job REST endpoints.** Only `services/video_service.py` (create_video_job/check_video_status/get_video_url, placeholder provider), called on approval of video content. The status shows as a badge from the row.
8. **Login throttling**: nginx `limit_req` only (plus the generic error message). No audit-row counting.
9. **No dictation** (webkitSpeechRecognition sends audio to Google). Recording is out of the MVP.
10. **No `health.safety_note`** field (minimal data).

## B. Gap fixes (must be implemented and tested)
1. **Framework Strength → Need → Adaptation → Intervention → Follow-up** lives on each focus area as `focus_areas.plan` JSONB `{strength_used, need, adaptation, what_we_will_do, frequency?, who?, review_on?, success_looks_like}` (all optional text; `success_looks_like` is descriptive, never a count). The focus UI edits and shows it as 5 labelled steps. The AI context includes it.
2. **Staff can fill parent sections on the parent's behalf** (most families have no account). `entered[section]` is an append-only list of `{by, role, reported_by: parent|teacher, at}`. The wizard shows each section with a "Parent / Teacher" perspective toggle. The baseline shows parent-reported items entered by a teacher as such.
3. **The loop closes.** When a teacher approves a development review / understanding, the approved strengths, interests and what_helps are merged into the `child_profiles` lists with `sources += ['review']`. Recomputing the lists from the perspectives must **preserve** items whose sources include `observation` or `review`. The AI context reads `current_understanding.summary` and `adaptations`/`next_steps` when present. Test: after an approved review, the `generation_input` of new content contains the approved understanding.
4. **Feedback without text**: `observations.observation` is nullable; CHECK `(source='content_feedback' OR length(observation) BETWEEN 1 AND 4000)`. A result-only feedback (2 taps) succeeds and mirrors exactly one observation.
5. **The timeline shows feedback once.** It is built from observations (each mirrored feedback row joined to its content title and result) plus baselines, focus events, approved/completed content and reviews. It does **not** query content_feedback separately. Test: 1 feedback → exactly 1 timeline entry.
6. **No certainty from limited data, for any provider**: on the server, after any suggestion, a focus_review or baseline_validation status other than `needs_more_observation` requires ≥ 3 linked observations since the latest baseline; otherwise it is downgraded to `needs_more_observation`. A baseline_validation item is `{list: strengths|interests|what_helps|support_needs|focus, key|custom, label, status, note, observation_ids[]}`.
7. **Adam (§44)** is a `real_world_activity` in growth_support mode for focus "joining group play". Template and test assert: `what_to_observe` covers initiation, accepting the other child's idea and the level of adult support; the instructions include the practice phrase ("Can we build this together?" in en, and the ar/he equivalents). It is used in `test_loop.py`.
8. **Maya (§45)**: add a 7th game template, **`story_builder`**: `steps[3–5]{prompt, choices[{label, emoji}]}` (e.g. animal → place → problem → solution) ending on a "Now tell your story!" screen. Choices have no correct answer. The teacher captures the story via a quick observation. Strength Builder `target_strength` may be any profile strength key **or** one of the generic strength-builder targets in options.json (`storytelling`, `confidence`, `language`, `creativity`, `problem_solving`, …). dev_seed's Maya has strengths imagination, vocabulary, communication and interest animals.
9. **Content lifecycle**:
   - Edit/regenerate is allowed on draft and approved (→ draft). On completed it returns **409 INVALID_TRANSITION**; use "duplicate as new draft" (`POST /api/content/{id}/duplicate`) instead.
   - Present and feedback work on approved **and** completed content. Repeat feedback is allowed.
   - DELETE is allowed only for drafts. Archive is allowed from any status.
10. **Uploads**: nginx has `location ^~ /uploads/ { return 404; }`. Files are served only via `GET /api/children/{id}/photo`.
11. **Banned terms in UI strings**: the frontend vitest scans every `messages/*/*.json` against the shared term list (exported from `backend/app/data/options.json` → `banned_terms`, copied to `frontend/src/test/banned-terms.json` by the test or read via relative path) and against `/\d+\s*%|\bscore\b|\bpoints\b/i`.
12. **Development review**: decisions are `keep|pause|close|edit|create`. Any create/reactivate that would exceed 3 active focus areas returns 409 FOCUS_LIMIT and rolls back the whole review.
13. **Baseline contents**: `baseline_data` snapshots basics, both perspectives (with `entered` stamps), the merged lists, **`support_needs`** (independence levels other than independent, sensitivities with their helps, emotions/transition helps, and parent priorities) and the active focus areas with their plans. **POST /baseline always inserts a new row** ("Create new baseline" — e.g. after late parent answers). A DB trigger makes rows immutable.
14. **Parent role limits**:
    - A parent PUT to basics is limited to `preferred_name, additional_languages, parent_name, parent_contact`. Anything else returns 403, and allowed changes are audited.
    - A parent GET of a child returns basics, the merged strengths and interests (positive only), their own perspective and shared content. It never returns `teacher_perspective`, focus areas, observations or reviews.
    - Tests cover all of this.
15. **Audit**: audit actions include content.generate/edit/approve/regenerate/duplicate/share/archive/delete, feedback.create, observation.create/update, photo.set/delete, profile.section_update, baseline.create, focus.create/update/close, review.create, plus user/class/link changes. Metadata holds names/ids only. Readable with `python -m app.cli audit --child <id>`.
16. **Categorize** is tap-to-place (tap an item, then tap a category), with no drag library; it is accessible on tablets. This deviation from "drag to category" is noted in DECISIONS.md.

## C. Product decisions (were open questions)
- **One support scale** everywhere: `independent | some_support | significant_support | not_observed`. The quick-observation UI labels are Independent / With support / Difficult (= significant_support). The observation model's עצמאי / בתיווך / מתקשה maps the same way.
- **Supporting tables** sessions, classes(kindergarten text), class_teachers, child_parents and audit_log are accepted. `children.class_id` replaces the kindergarten text; the class carries the kindergarten name.
- **Parents** are created and linked by an admin. Staff can enter parent answers on the parent's behalf (B2).
- **Arabic digits** are Western (`ar-u-nu-latn`).
- **Cutover** happens after everything is built and tested: the new app replaces the old Next.js app at kids.kortexd.com, and the old deployment is removed (with a DB dump first). The old code is deleted from the repo (git history keeps it; tag `legacy-nextjs`).
- **The production admin** (`admin`, existing bcrypt hash) is imported, so the same password keeps working.
- **Ports/names** are as in ARCHITECTURE.md: system user `kidsphere`, DB `kidsphere`, `kidsphere-api.service` on 127.0.0.1:3071, `/var/www/kidsphere/{backend,frontend,uploads}`.
