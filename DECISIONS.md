# Decisions

These are short records of the decisions behind the current implementation. The product rules come from [docs/mvp-refocus/SPEC.md](docs/mvp-refocus/SPEC.md). Decisions marked "PLAN" come from [docs/mvp-refocus/PLAN-ADJUSTMENTS.md](docs/mvp-refocus/PLAN-ADJUSTMENTS.md), which is binding where it differs from the design docs.

## Platform

1. **Stack as required by spec §1.**
   - **Decision:** FastAPI (Python) with PostgreSQL, a Vite React TypeScript static build, nginx and systemd on one Ubuntu server. No Docker, Redis, Celery, queues, microservices or cloud services.
   - **Why:** the previous Next.js/Prisma app could not stay. The spec requires a Python REST backend and a static React build, and that app rendered pages on a Node server. It was rewritten rather than ported, and the old code is kept under the tag `legacy-nextjs`.
2. **Simple code shape (spec §48).**
   - **Decision:** sync SQLAlchemy 2 with one `models.py` and no ORM relationships, plain-function services, thin routers, and hand-written Alembic migrations.
   - **Why:** there are no repositories, base classes, factories or event buses to learn. Sync code avoids async pitfalls with bcrypt and blocking AI calls, since FastAPI runs `def` endpoints in a thread pool.
3. **Strict validation.**
   - **Decision:** status, role and type columns are TEXT + CHECK, mirrored by Pydantic `Literal`s. Request bodies use `StrictModel`, which forbids extra fields.
   - **Why:** unknown fields such as `role` or `created_by` are rejected rather than silently ignored.
4. **Sessions and login.**
   - **Decision:** opaque, revocable DB sessions (cookie `ks_session`, with only the sha256 stored). Passwords use bcrypt at cost 12 on the first 72 UTF-8 bytes, so hashes from the legacy app still verify. Mutating requests are checked for same origin. Login throttling is done only by nginx `limit_req` (PLAN A8).
   - **Why:** this needs no JWT secret and no Redis. Sessions end on logout, password change, role change and deactivation.
5. **Three roles and 14 tables.**
   - **Decision:** the roles are admin, teacher and parent. There are the 9 tables of spec §28 plus `sessions`, `classes` (with the kindergarten as text), `class_teachers`, `child_parents` and `audit_log` (PLAN C). `children.class_id` replaces the spec's `kindergarten` column.
   - **Why:** spec §34 needs class assignment, and auth needs sessions and an audit trail.
6. **Scope inside the query.**
   - **Decision:** every child lookup goes through `app/access.py`. An id outside the user's scope returns 404; a role failure on a visible child returns 403.
   - **Why:** responses never reveal whether a child exists outside the user's scope.
7. **One shared vocabulary.**
   - **Decision:** `backend/app/data/options.json` (keys with en/ar/he labels, plus `banned_terms`) feeds validation, the UI labels (`GET /api/options`) and the AI prompts. The database stores keys, never labels.
   - **Why:** there is one source of truth for wording in three languages.
8. **Side-by-side names on the server.**
   - **Decision:** the system user is `kidsphere-mvp`, the database `kidsphere_mvp` and the service `kidsphere-mvp-api` on 127.0.0.1:3071. PLAN C had planned the plain `kidsphere` names.
   - **Why:** legacy installs are still on the server until the owner removes them: the old Next.js app `kidsphere-app` on :3070, and an older API that already owns the DB `kidsphere`. See [deploy/README.md](deploy/README.md#legacy-installs-still-on-the-server).

## Product

9. **One support scale (PLAN C).**
   - **Decision:** `independent | some_support | significant_support | not_observed` is used in wizard step 5, quick observations, feedback and baselines. The quick-observation UI shows it as Independent / With support / Difficult.
   - **Why:** answers stay comparable with the baseline.
10. **Staff can enter the parent's answers (PLAN B2).**
    - **Decision:** each wizard section has a Parent/Teacher perspective toggle. `entered[section]` is an append-only list of `{by, role, reported_by, at}`.
    - **Why:** most families have no account, and the record must still show who said what.
11. **Baselines are immutable (PLAN B13).**
    - **Decision:** a DB trigger rejects UPDATE and any direct DELETE of a baseline. "Create new baseline" always inserts a new row, for example after late parent answers.
    - **Why:** spec §3 and §12 say the original is never silently overwritten.
12. **The current understanding is approved by a teacher (PLAN B3).**
    - **Decision:** the current understanding starts from the first baseline. After that, it changes only when a teacher saves a development review; the AI suggests but never writes it. Approved strengths, interests and what-helps are merged into the profile lists with the source `review`. When the lists are recomputed, those items, and items with the source `observation`, are kept.
    - **Why:** this closes the loop, and new content reads the approved understanding.
13. **At most 3 active focus areas.**
    - **Decision:** every write that can add an active focus area first locks the child row (`SELECT … FOR UPDATE`) and then counts. Going over the limit returns 409 FOCUS_LIMIT, and inside a review it rolls back the whole save (PLAN B12).
    - **Why:** the previous count-then-insert could race.
14. **The focus plan holds the professional framework (PLAN B1).**
    - **Decision:** `focus_areas.plan` holds Strength → Need → Adaptation → What we will do → Follow-up, as free text. `success_looks_like` is descriptive and never a count.
    - **Why:** spec §2 says the framework must be preserved.
15. **No certainty from limited data (PLAN B6).**
    - **Decision:** in any suggestion, a review or validation status other than `needs_more_observation` needs at least 3 linked observations since the latest baseline. The server enforces this whatever the provider. A teacher may still choose a status, and the API then returns a warning.
    - **Why:** spec §24 and §27 forbid claiming certainty from one or two observations.
16. **No scores (spec §26).**
    - **Decision:** there are no percentages, points, scores or rankings in the UI, in AI output or in the timeline. Tests scan the UI strings and the AI output for them.
    - **Why:** change is described in words.
17. **No clinical terms (spec §2).**
    - **Decision:** clinical and deficit terms are banned in UI strings, AI prompts and AI output, in teacher edits of content and in review text (422 UNSAFE_CONTENT).
    - **Why:** KidSphere is not diagnostic. See [docs/terminology.md](docs/terminology.md).

## Content and AI

18. **Templates when there is no AI key (PLAN A4).**
    - **Decision:** a deterministic template provider covers every content type, mode and language. It also serves as the fallback on any Claude failure.
    - **Why:** the server has no key today, and generation must never break.
19. **One Claude call (PLAN A3).**
    - **Decision:** `messages.create` with JSON-schema structured output, then Pydantic validation, semantic checks and the safety check. On any failure the templates are used, and `fallback_reason` is recorded. There is no repair round-trip.
    - **Why:** this is the simplest flow that still fails safe.
20. **All content starts as a draft (spec §19, PLAN B9).**
    - **Decision:**
      - Editing or regenerating approved content returns it to draft.
      - Completed content cannot be edited, so it is duplicated as a new draft instead.
      - Only drafts can be deleted, and any status can be archived.
      - Only approved or completed content can be presented, given feedback or shared with parents.
    - **Why:** nothing reaches a child or a parent without teacher approval.
21. **Feedback becomes an observation (PLAN B4/B5).**
    - **Decision:** feedback writes a `content_feedback` row and one mirrored observation in the same transaction. The result alone (two taps) is enough. The timeline lists the observation, so each feedback appears exactly once.
    - **Why:** spec §20 says feedback automatically joins the observation history.
22. **A pack is a set of rows.**
    - **Decision:** a "small pack" is stored as story, activity and game rows (plus a video plan only when asked), which share one `pack_id`. The 3 discussion prompts live in the story row.
    - **Why:** there is no extra table or content type.
23. **The `story_builder` game template (PLAN B8).**
    - **Decision:** a 7th game template with 3–5 steps of choices that have no correct answer, ending with "Now tell your story!".
    - **Why:** spec §45 (Maya) needs a story-creation game. The teacher records the story through a quick observation.
24. **Games are data, not code (spec §30).**
    - **Decision:** the AI returns validated JSON for one of 7 React templates, and no AI-written code runs.
    - **Why:** this is a safety requirement of spec §30.
25. **Tap-to-place instead of drag (PLAN B16).**
    - **Decision:** in "categorize", the child taps an item and then taps its category. No drag library is used.
    - **Why:** it is accessible and reliable on kindergarten tablets. This deviates from spec §15C, which says "drag to category".
26. **Video is a plan plus a placeholder (PLAN A7).**
    - **Decision:** the AI writes only the video plan (script, scenes, narration, visual prompts). `services/video_service.py` has a placeholder provider, and there are no video-job endpoints.
    - **Why:** spec §42 says not to start with video. A real provider adds one branch later.
27. **No dictation or recording (PLAN A9).**
    - **Decision:** the browser microphone is disabled through `Permissions-Policy`.
    - **Why:** `webkitSpeechRecognition` sends audio to a third party. Read-aloud uses only the browser's own speech synthesis.
28. **A Present view instead of a child mode.**
    - **Decision:** approved content opens in a full-screen Present view on the teacher's device. There is no child login or PIN mode.
    - **Why:** it is simpler, and spec §1 and §40–41 ask to remove unneeded complexity.
29. **The photo is optional.**
    - **Decision:** the child's photo is re-encoded, served only through the authenticated API, and never sent to the AI. No generated likeness is made.
    - **Why:** spec §32.

## Frontend and process

30. **Routes by glob (PLAN A5).**
    - **Decision:** `import.meta.glob('./features/*/routes.tsx')` builds the route tree, with path builders in `lib/paths.ts`.
    - **Why:** features never edit a shared routes file.
31. **i18n and RTL.**
    - **Decision:**
      - Messages are JSON namespaces per language, with a key-parity test.
      - Option labels come from `/api/options`.
      - Only logical CSS utilities are allowed, enforced by a test.
      - Arabic uses Western digits (`ar-u-nu-latn`).
    - **Why:** spec §38 asks for true RTL, not only right-aligned text.
32. **Tests run only on the server (PLAN A1/A2).**
    - **Decision:** `deploy/ci/remote-test.sh` uploads the working tree and runs as `kidsphere-ci` against one `kidsphere_test` DB under `flock`. A deploy only builds, migrates, restarts and runs a smoke test; it does not rerun the tests.
    - **Why:** there is no local runtime, and the shared host has little free memory.
33. **People and children are never hard-deleted.**
    - **Decision:** users are deactivated and children are archived. Parents are created and linked by an admin (PLAN C).
    - **Why:** history and audit stay consistent. This keeps the MVP small, with no invitations.
