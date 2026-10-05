# KidSphere architecture

This document describes what is implemented on branch `mvp-refocus`. The original design is in [docs/mvp-refocus/ARCHITECTURE.md](docs/mvp-refocus/ARCHITECTURE.md), and section 12 below lists where the implementation differs from it.

## 1. Shape

```
Browser (React SPA, ar/he/en, RTL)
   │ HTTPS kids.kortexd.com
nginx ── /         → /var/www/kidsphere/frontend/dist   (try_files → index.html)
      ── /assets/  → hashed files, cached for 1 year
      ── /uploads/ → 404 (never served)
      ── /api/     → 127.0.0.1:3071  uvicorn, 1 worker (kidsphere-mvp-api.service)
                         │ SQLAlchemy 2 + psycopg 3 (pool 5 + overflow 5)
                         ▼
                     PostgreSQL (DB kidsphere_mvp)
                     uploads: /var/www/kidsphere/uploads (read only through the API)
                     AI: Claude when ANTHROPIC_API_KEY is set, else built-in templates
```

## 2. Backend (`backend/app`)

| Module | Role |
|---|---|
| `main.py` | Builds the app. Installs the error handlers and a same-origin check: a POST/PUT/PATCH/DELETE whose `Origin` host differs from `Host` gets 403. Includes every module in `routers/` under `/api`. Serves a built SPA only when `SERVE_STATIC_DIR` is set. |
| `config.py` | `settings`, read by pydantic-settings from the environment and `backend/.env`. |
| `db.py` | Engine, `SessionLocal`, `get_db`. Nothing auto-commits: a service commits once at the end of its unit of work. |
| `models.py` | All 14 tables. There are no ORM relationships; queries are explicit `select()`s. |
| `errors.py` | `AppError(code)` turns into `{"error": {code, message, details}}`. Request validation errors become 400 VALIDATION with `details=[{path, message}]`. A unique violation becomes 409 DUPLICATE, and FK/CHECK/NOT NULL violations become 400. Anything else becomes 500 INTERNAL and is logged. |
| `deps.py` | `DB`, `CurrentUser` (401), `StaffUser` and `AdminUser` (403), `require_roles(...)`. |
| `access.py` | Child scope inside the query: `child_scope`, `visible_children`, `scoped_child_ids`, `get_child_or_404`, `get_child_row_or_404` (with `write=` and `lock=`). |
| `security.py` | bcrypt at cost 12, using the first 72 UTF-8 bytes so hashes from the legacy app still verify. Also a dummy hash for constant-time login, and the session-token helpers. |
| `sessions.py` | Opaque token in the cookie `ks_session` (HttpOnly, SameSite=Lax, Secure, 7 days); only its sha256 is stored. Create, lookup and revoke. |
| `audit.py` | `audit(db, actor, action, object_type, object_id, child_id=None, **meta)`. Meta holds primitives only. |
| `vocab.py` + `data/options.json` | The shared vocabulary (option lists with en/ar/he labels, plus `banned_terms`). It is used for validation, for UI labels (`GET /api/options`) and for AI prompts. |
| `schemas/` | Pydantic request models. `StrictModel` forbids extra fields and strips strings. `Literal`s mirror the DB CHECKs. |
| `services/` | One module of plain functions per area: users, classes, children, uploads, profiles, baselines, focus_areas, observations, timeline, content, feedback, reviews, video_service. |
| `routers/` | Thin modules (auth, me, health, options, users, classes, parents, children, profiles, baselines, focus_areas, observations, timeline, content, feedback, reviews). Endpoints are sync `def` functions that each call one service function. |
| `ai/` | `context.py`, `prompts.py`, `claude_provider.py`, `template_provider.py` + `templates/*.json`, `schemas.py`, `safety.py`, `service.py` (section 6). |
| `cli.py` | `create-admin`, `set-password`, `import-users`, `audit --child`. |
| `dev_seed.py` | Demo data for Adam and Maya. Refuses to run unless the DB name ends in `_test` or `_preview`, or `KIDSPHERE_ALLOW_DEMO=1` is set. |
| `migrations/` | Alembic. `0001_initial` is hand-written DDL with the CHECKs, the indexes and the immutable-baseline trigger. |

## 3. Data model (14 tables)

Every table has a UUID primary key (except `audit_log`) and `timestamptz` timestamps. Enumerations are TEXT + CHECK. Child-owned rows use `ON DELETE CASCADE`. Users are deactivated, never deleted. Children are archived (`archived_at`).

| Table | Purpose and key columns |
|---|---|
| `users` | `name`, `email` (login identifier: an e-mail or a username, lower-case), `password_hash`, `role` admin\|teacher\|parent, `language` ar\|he\|en, `is_active`, `last_login_at`. |
| `sessions` | `user_id`, `token_hash` (sha256), `expires_at`, `user_agent`. |
| `classes` | `name`, `kindergarten` (text), unique per kindergarten. |
| `class_teachers` | Which teacher works in which class. |
| `children` | `name`, `preferred_name`, `birth_date`, `gender` girl\|boy\|unspecified, `class_id`, `main_language`, `additional_languages` (JSONB list), `photo_path` (relative; never sent to clients), `parent_name`, `parent_contact`, `archived_at`, `created_by`. |
| `child_parents` | Links parent users to children, with an optional `relation`. |
| `child_profiles` | One row per child: both perspectives, the merged lists, `current_understanding`, `wizard_step`, `wizard_completed_at`. |
| `baselines` | `baseline_data` snapshot. **Immutable:** a trigger rejects UPDATE and any DELETE that is not part of the child's cascade. |
| `focus_areas` | `category`, `suggestion_key`, `title`, `description`, `plan`, `status` active\|paused\|completed, `close_reason`, `closed_at`. At most 3 active per child. |
| `generated_content` | `mode` strength_builder\|growth_support, `content_type` story\|video\|digital_game\|real_world_activity, `language`, `title`, `content`, `status` draft\|approved\|completed\|archived, `shared_with_parent`, `pack_id`, `generation_input`, `ai_provider`, `ai_model`, `is_template`, `variant`, `video_status` script_ready\|generating\|ready\|failed, `video_provider`, `video_external_job_id`, `video_url`, `approved_by`, `approved_at`. |
| `observations` | `source` quick\|content_feedback, `focus_area_id`, `content_id`, `observed_at`, `area`, `context`, `observation` (NULL only for content_feedback), `support_level`, `what_helped`, `note`, `details`, `client_request_id` (unique per author). |
| `content_feedback` | `content_id`, `result` worked_well\|partly\|did_not_work, `support_level`, `observation`, `what_helped`, `observation_id` (the mirrored observation). |
| `development_reviews` | `review_date`, `summary`, `focus_review`, `baseline_validation`, `understanding`, `ai_suggested`. |
| `audit_log` | `actor_id`, `action`, `object_type`, `object_id`, `child_id`, `metadata` (primitives only). It has no foreign keys, so rows outlive what they describe. |

There is one support scale everywhere: `independent | some_support | significant_support | not_observed`.

**JSONB shapes:**

- **Perspectives** (`parent_perspective`, `teacher_perspective`): `{sections: {who, emotions, social, independence, environment, priorities}, entered: {section: [{by, by_name, role, reported_by, at}]}}`. The parent perspective also has `wizard: {step, completed_at}`. `entered` is append-only: `role` is who typed the answer, and `reported_by` is whose answer it is.
- **Merged lists** (`strengths`, `interests`, `motivators`, `what_helps`, `sensitivities`): `[{key | custom, sources: [parent|teacher|observation|review], added_by, added_at}]`. `what_helps` items also carry `list`. `sensitivities` items carry `what_happens` and `what_helps[]`. When the lists are recomputed from the perspectives, items whose sources include `observation` or `review` are kept.
- **`current_understanding`:** `{summary, strengths[], interests[], what_helps[], areas_for_support[], adaptations, next_steps, source: baseline|review, ...}`. A review adds `review_id`, `approved_by`, `approved_by_name` and `approved_at`.
- **`baseline_data`:** `{basics, parent_perspective, teacher_perspective, strengths, interests, motivators, what_helps, sensitivities, support_needs: {independence[], sensitivities[], emotions, parent_priorities}, focus_areas[], wizard_completed_at, created_by, created_at}`.
- **`focus_areas.plan`:** `{strength_used, need, adaptation, what_we_will_do, frequency, who, review_on, success_looks_like}`. Every field is optional text, and nothing is a count.
- **`generated_content.content`:** the validated AI output for its type (section 6). The story row of a pack also carries `discussion_prompts[3]`.
- **`generated_content.generation_input`:** the `AIContext` that was used.
- **`observations.what_helped`:** `[{key} | {custom}]`.
- **`observations.details`:** `{what_i_see, when, what_needed, what_we_did, did_it_change: yes|partly|no}`.
- **`development_reviews.focus_review`:** `[{focus_area_id, title, status, decision, what_worked, what_to_change, note}]`.
- **`development_reviews.baseline_validation`:** `[{list, key, custom, label, status, note, observation_ids[]}]`.

## 4. Access rules

| | admin | teacher | parent |
|---|---|---|---|
| Children visible | all (archived ones on request) | children in their own classes | linked children |
| Create a child | any class | own classes only | no |
| Edit basics | yes | yes; can move a child only between own classes | only `preferred_name`, `additional_languages`, `parent_name`, `parent_contact` (anything else gets 403), audited |
| `GET /children/{id}` | staff composite | staff composite | basics, plus the merged strengths and interests (`key`/`custom`/`sources` only) |
| Profile (`/profile`) | both perspectives and lists | both perspectives and lists | own parent perspective only (read and write) |
| Baseline, focus, observations, timeline, reviews | yes | yes | no: 403 for baseline and focus, 404 for the rest |
| Generate, edit, approve or give feedback on content | yes | yes | no |
| Read content | all | all for the child | only `shared_with_parent` content that is approved or completed, without `teacher_note`, generation data, focus area or feedback |
| Photo | read and write | read and write | read |
| Users, classes, parent links | yes | `GET /classes` (own classes) only | no |
| Unarchive a child | yes | no | no |

An id outside the user's scope returns **404**, because the scope is part of the same SELECT. A role or action failure on a child the user can see returns **403**. `created_by` always comes from the session.

## 5. REST API (all under `/api`; JSON; error envelope `{error: {code, message, details}}`)

**Auth and account**

- `POST /auth/login {identifier, password}` (public; an e-mail or a username), `POST /auth/logout`
- `GET /me`, `PUT /me {name?, language?}`, `POST /me/password {current_password, new_password}`
- `GET /health` (public), `GET /options` (the vocabulary; signed-in users only)

**Admin**

- `GET /users?role&q&active`, `POST /users`, `PUT /users/{id}`, `POST /users/{id}/password`
- `GET /classes` (teachers get their own classes), `POST /classes`, `PUT /classes/{id}`, `DELETE /classes/{id}`, `PUT /classes/{id}/teachers`
- `GET /children/{id}/parents`, `POST /children/{id}/parents`, `DELETE /children/{id}/parents/{user_id}`

**Children and profile**

- `GET /children?class_id&q&include_archived`, `POST /children`, `GET /children/{id}`, `PUT /children/{id}`
- `POST /children/{id}/archive`, `POST /children/{id}/unarchive` (admin)
- `PUT /children/{id}/photo` (multipart), `GET /children/{id}/photo`, `DELETE /children/{id}/photo`
- `GET /children/{id}/profile`, `PATCH /children/{id}/profile {perspective?, section?, data?, wizard_step?, complete?}`

**Baseline and current understanding**

- `POST /children/{id}/baseline` (always inserts a new row), `GET /children/{id}/baseline` (`{latest, earlier[]}`)
- `GET /children/{id}/current-understanding`

**Focus areas**

- `GET /children/{id}/focus-areas?status`, `POST /children/{id}/focus-areas`
- `PUT /focus-areas/{id}`, `POST /focus-areas/{id}/close {status: completed|paused, close_reason?}`

**Observations and timeline**

- `GET /children/{id}/observations?focus_area_id&limit&offset`
- `POST /children/{id}/observations`. A repeated `client_request_id` returns the existing row with status 200.
- `PUT /observations/{id}` (the author or an admin)
- `GET /children/{id}/timeline?limit&offset`. Pagination is "load older"; there are no cursors.

**Content**

- `POST /children/{id}/content/generate {mode, content_type, template?, focus_area_id?, target_strength?, language?, include_video?}`. `content_type` is story, video, digital_game, real_world_activity or pack.
- `GET /children/{id}/content?status&pack_id`, `GET /packs/{pack_id}`
- `GET /content/{id}`, `PUT /content/{id} {title?, content?}`, `DELETE /content/{id}`
- `POST /content/{id}/approve`, `/regenerate {instruction?}`, `/duplicate`, `/share {shared}`, `/archive`
- `POST /content/{id}/feedback {result, support_level?, observation?, what_helped?, client_request_id?}`. A repeated `client_request_id` returns the existing feedback with status 200; one used for other content or for a quick observation returns 409 DUPLICATE.

**Development reviews**

- `POST /children/{id}/development-reviews/suggest` (writes nothing)
- `POST /children/{id}/development-reviews`, `GET /children/{id}/development-reviews`

**Error codes:**

- UNAUTHENTICATED 401, INVALID_CREDENTIALS 401
- FORBIDDEN 403
- NOT_FOUND 404
- VALIDATION 400
- DUPLICATE, CONFLICT, FOCUS_LIMIT and INVALID_TRANSITION: 409
- UNSAFE_CONTENT 422
- UPLOAD_FAILED 400/413
- RATE_LIMITED 429 (from nginx)
- AI_UNAVAILABLE 503
- INTERNAL 500

**Key flows:**

- **Content lifecycle:**

  | Action | Allowed from | Result |
  |---|---|---|
  | generate | — | draft |
  | approve | draft | approved; a video row also calls `video_service.create_video_job` |
  | edit or regenerate | draft, approved | draft; completed or archived content returns 409 INVALID_TRANSITION, so use duplicate instead |
  | feedback | approved, completed | completed; feedback can be given more than once |
  | duplicate | any status | a new draft |
  | share | approved, completed | shared with the parent; unsharing always works |
  | archive | any status | archived |
  | delete | draft only | the row is removed |

  A pack is stored as 3–4 rows (story, activity, game, plus a video plan if requested) that share one `pack_id`.
- **Feedback** is one transaction. It writes the mirrored `observations` row (`source=content_feedback`, with the text optional, so two taps are enough), the `content_feedback` row linked through `observation_id`, the status change and an audit row. The dialog sends one `client_request_id` per feedback, stored on the mirrored observation, so a retry or double tap saves once. It keeps the id (and the answers) until a save succeeds, also across Cancel and reopening after an error.
- **Timeline:**
  - It is built from observations, baselines, focus opened and closed events, approved or completed content, and reviews.
  - Feedback appears through its mirrored observation, so each feedback shows up exactly once.
  - It contains no counts or percentages.
- **Development review:**
  - `suggest` asks the AI or the templates for a draft and saves nothing.
  - The teacher edits the draft and then saves it. The save is one transaction:
    - the focus decisions (`keep|pause|close|edit|create`)
    - the review row
    - `child_profiles.current_understanding` (`source: review`)
    - the approved strengths, interests and what-helps, merged into the profile lists with the source `review`
  - If the decisions would leave more than 3 active focus areas, the save returns 409 FOCUS_LIMIT and nothing is saved.

## 6. AI module (`backend/app/ai`)

- **`context.py`** builds the `AIContext` from an allow-list:
  - first or preferred name, age in years
  - gender, only when it is girl or boy (for Arabic and Hebrew grammar)
  - language, mode, content type, game template
  - at most 3 strength, 3 interest and 3 what-helps labels, and at most 3 sensitivity keys as the avoid list
  - the focus area (category, title, description, plan) or the target strength
  - at most 5 recent observations, each at most 300 characters
  - the current understanding (summary, adaptations, next_steps)
  - the regenerate instruction, the variant and `include_video`

  A custom label (a list entry without a key) is included only when staff entered or confirmed it (`staff_confirmed`: sources teacher, observation or review), so a parent's own wording never reaches the AI. The name is the preferred name without a surname typed into it (`first_name`).

  `name_masker` compiles one pattern for all the names and replaces the child's names (including the surname) with `[child]`, the other children of the kindergarten (`services/content.classmate_names`) with `[friend]`, and the parent name, linked parents and the kindergarten's teachers (`adult_names`) with `[adult]`. It tolerates case, accents, Arabic and Hebrew spelling variants, marks and one-letter prefixes, and masks a name particle (bin, בן, عبد) only with the next word. `build_context` masks every free text it keeps (custom labels, focus title, description and plan, observations, current understanding, instruction). The context is stored as `generation_input`. For a development-review suggestion, the context keeps the teacher's wording (`mask_free_text=False`) and `mask_understanding_inputs` masks the same names in every free text sent to the AI (observations, focus titles and descriptions, baseline item texts, custom labels and the current understanding); the baseline items sent leave out parent-only custom entries, and the template provider and the response keep the teacher's own wording.
- **`claude_provider.py`:**
  - Makes one `messages.create` call to `ANTHROPIC_MODEL` (`claude-opus-5-5`) with `output_config = {effort, format: json_schema}`, where the schema comes from `anthropic.transform_schema(Model)`.
  - Uses `max_tokens` 16000, `timeout` `AI_TIMEOUT_SECONDS` and `max_retries=1`. It sends no thinking or temperature parameters.
  - A refusal, a `max_tokens` stop, non-JSON output or an SDK error raises `AIError` (AI_TIMEOUT, AI_UNAVAILABLE, AI_REFUSAL, AI_MAX_TOKENS or AI_INVALID_OUTPUT).
  - Each call logs one line with the op, model, duration, stop reason and token usage. Prompt text is never logged.
- **`template_provider.py`** produces deterministic content when there is no key, or as the fallback:
  - The phrase tables live in `templates/`:
    - `themes.json`: one theme per focus category or target strength
    - `heroes.json`: one hero per interest
    - `frames.json`: shared sentence frames
  - Slots are filled in all three languages, and `variant` rotates the hero, the opening and the choice order on regenerate.
  - Model name: `kidsphere-template-1`.
- **`schemas.py`** defines the output models. All forbid extra keys and have length limits.
  - `StoryOut {title, goal, story[2–6], questions[2–4], teacher_note, illustrations?}`
  - `ActivityOut {title, goal, duration_minutes, materials, instructions, what_to_observe, adaptation}`
  - Seven game templates: `multiple_choice`, `emotion_choice`, `what_happens_next` (rounds of choices), `match_pairs`, `sequence`, `categorize` and `story_builder` (3–5 steps of choices with no correct answer, then a "tell your story" prompt). Each has semantic checks.
  - `VideoPlanOut {title, learning_goal, script, scenes[2–8], duration_seconds 30–90}`
  - `PackOut` (story with exactly 3 questions, activity, game, 3 discussion prompts, optional video)
  - `UnderstandingSuggestion`
- **`safety.py`** applies `banned_terms` from `options.json`. The `allow_phrases` are removed first. Then:
  - Clinical terms are rejected in every field.
  - Child-deficit terms and `/\d+\s*%|\bscore\b|\bpoints\b/i` are rejected in child-facing fields.
  - URLs are rejected everywhere.
  - The same check runs on teacher edits (`PUT /content/{id}` returns 422 UNSAFE_CONTENT) and on the text of development reviews.
- **`service.py`:**
  - `generate(kind, ctx)` uses Claude when a key is set, otherwise the templates. Claude output is checked with Pydantic, the semantic checks and safety.
  - On any problem it falls back to the templates and returns `fallback_reason` (also AI_UNSAFE_OUTPUT). There is no repair round-trip.
  - `suggest_understanding_result(...)` follows the same flow.
- **No-certainty rule:** after any suggestion, whatever the provider, a focus_review or baseline_validation status other than `needs_more_observation` needs at least 3 linked observations since the latest baseline. Otherwise the server downgrades it. When the teacher saves a review, their chosen statuses are kept, but low-evidence ones are reported in `warnings`.
- **The AI never writes the profile.** Generation never changes the profile, and the current understanding changes only through a review saved by a teacher.

## 7. Video service (`services/video_service.py`)

- **Functions:** `create_video_job(row)`, `check_video_status(row)` and `get_video_url(row)`.
- **Placeholder provider:** `VIDEO_PROVIDER=none` is the only provider today. On approval, the row keeps `video_status=script_ready` and returns the notice `provider_not_configured`.
- **What the AI makes:** only the video plan (script, scenes, narration, visual prompts). A pack includes one only when `include_video` is set.
- **No dedicated endpoints:** there are no video-job REST endpoints, and nothing ever waits on a video.

## 8. Uploads (child photo)

- **Upload:** `PUT /api/children/{id}/photo` (multipart, staff only).
- **Checks:** the file is read up to 8 MB (more returns 413). Only JPEG, PNG and WebP are accepted, judged by their magic bytes.
- **Processing:** Pillow re-encodes the image to JPEG, at most 1024 px on the long side, which strips EXIF and GPS data.
- **Storage:** the file is written to `UPLOAD_DIR/children/<uuid4hex>.jpg` (mode 750, owned by the app user). Only the relative path is stored.
- **Serving:** `GET .../photo` checks access, then returns the file with `Cache-Control: private, no-store` and `nosniff`. nginx returns 404 for `/uploads/`.
- **systemd:** the unit can write only to the uploads directory.

## 9. Frontend (`frontend/src`)

- **Boot:**
  1. `public/boot.js` sets `<html lang dir>` from `localStorage.ks_locale` before the first paint. It is an external file, because the CSP allows no inline scripts.
  2. `AuthProvider` calls `GET /api/me`.
  3. `I18nProvider` adopts the user's language.
  4. `OptionsProvider` loads `GET /api/options`.
- **Feature folders:** auth, children (child list, profile), wizard (Add Child, edit steps, parent onboarding), focus, observations, timeline, content (create, list, review, present, pack, feedback), player (story, activity, video plan, read-aloud), games (7 templates), development (baseline vs current understanding, review), admin, parent. Shared code lives in `components/ui`, `components/layout`, `lib`, `auth` and `i18n`. Features that other features reuse (children, content, games, player) expose an `index.ts`.
- **Routes:**
  - `routes.tsx` collects `features/*/routes.tsx` with `import.meta.glob`, so adding a feature never edits a shared file.
  - Each module exports `routes: AppRoute[] = [{path, element, roles?, public?, layout?: 'shell'|'bare', nav?}]`.
  - `AppShell` builds the desktop sidebar and the phone bottom bar from the `nav` metadata. `/observe` is the centre "+" action.
  - Every path is defined in `lib/paths.ts`.
- **Data:** `api()` (same-origin, typed `ApiError`), `useFetch`, `useAction` and `toast`. There is no global store.
- **i18n:**
  - Messages live in `i18n/messages/{en,ar,he}/<namespace>.json`: account, admin, auth, children, common, content, development, errors, focus, nav, observations, parent, player, timeline, wizard.
  - Keys are `<ns>.<path>`, placeholders are `{var}`, and plurals use `Intl.PluralRules` suffixes (`_one`, `_two`, `_few`, `_many`, `_other`).
  - Arabic uses Western digits (`ar-u-nu-latn`).
- **Options:** option labels (strengths, interests, support levels, …) come from `GET /api/options` through `useOptions()` and are never duplicated in the message files.
- **RTL:**
  - `<html dir>` follows the UI locale.
  - Only logical Tailwind utilities are allowed (`ms/me/ps/pe/start/end/text-start/border-s/rounded-s…`); a test bans the physical ones.
  - Directional icons flip with `rtl:`.
  - User and AI text uses `dir="auto"`. E-mail and password inputs use `dir="ltr"`.
  - The player and the games take their direction from the content's language.
- **Games:** the games are tap only, with no drag library (categorize is tap-to-place). They have no scores or points, give gentle feedback and end on a shared finish screen. AI output is data only, and React renders it.

## 10. Testing

All tests run on the server through `bash deploy/ci/remote-test.sh <label> [backend|frontend|all]` (see [deploy/README.md](deploy/README.md#ci-runner)).

- **Backend (pytest):**
  - Runs against the database `kidsphere_test`; `conftest.py` refuses to run against any other database name.
  - Each session drops the schema and runs `alembic upgrade head`; each test starts with truncated tables.
  - Fixtures give TestClient sessions for every role.
  - The AI key is empty, so the templates are used. Claude is tested with a fake client.
  - There is one test file per area (access, auth, admin, children, uploads, profile wizard, baseline, focus, observations, timeline, content, feedback, reviews, migrations, CLI, vocabulary, AI context, schemas, safety, templates and service), plus `test_deploy_scripts.py` (the nightly backup script run against stub commands, the backup units and `.env.example`).
  - The spec examples are covered by `test_content.py::test_adam_spec_44_loop`, `test_adam_garage_game_loop` and `test_maya_spec_45_story_builder`.
- **Frontend:**
  - `tsc --noEmit`, eslint, vitest (jsdom) and `vite build`. The build fails if `index.html` contains an inline script.
  - Cross-cutting tests: i18n key parity, the banned-terms scan of every message file, the RTL class ban, locale and `dir` handling, the API/auth client, formatting and the shell.
  - Each feature folder has its own vitest file.

## 11. Server layout

| What | Where |
|---|---|
| Code | `/var/www/kidsphere/backend` (+ `venv/`, `.env` mode 600) and `/var/www/kidsphere/frontend` (+ `dist/` = nginx root) |
| Uploads | `/var/www/kidsphere/uploads` (750) |
| Releases | `/var/www/kidsphere/releases/<sha>` (the newest 5 are kept) |
| Backups | `/var/backups/kidsphere/` (700, root): `kidsphere-predeploy-<stamp>.dump` before each migration (newest 10 kept), and nightly at about 03:30 (`kidsphere-mvp-backup.timer`) `nightly-<stamp>.dump` plus `uploads-<stamp>.tgz` (newest 14 of each kept) |
| System user | `kidsphere-mvp` |
| Database | `kidsphere_mvp` (role `kidsphere_mvp`) |
| Service | `kidsphere-mvp-api.service`: uvicorn on 127.0.0.1:3071, 1 worker, `MemoryMax=512M`, `ProtectSystem=strict` |
| nginx | site `kidsphere-mvp`, `snippets/kidsphere-headers.conf` (CSP and security headers), `conf.d/kidsphere-ratelimit.conf` (login `limit_req`) |
| Node for builds | `/opt/kidsphere-node` |
| CI | `/var/lib/kidsphere-ci` (user `kidsphere-ci`, DB `kidsphere_test`) |

## 12. Differences from the design docs

[docs/mvp-refocus/PLAN-ADJUSTMENTS.md](docs/mvp-refocus/PLAN-ADJUSTMENTS.md) is binding. Compared with the design in `docs/mvp-refocus/ARCHITECTURE.md` and `ASSESSMENT.md`:

- **Names on the server.** The service is `kidsphere-mvp-api`, the user `kidsphere-mvp` and the DB `kidsphere_mvp`, not `kidsphere-api`, `kidsphere` and `kidsphere`. The older installs still use the plain names (see [DECISIONS.md](DECISIONS.md)).
- **CI.** There is one `kidsphere_test` DB under `flock`. There are no per-run databases, no preview service on :3072, no `remote-test.ps1` and no Playwright.
- **Deploys.** A deploy does not rerun the tests, and there is no `cutover.sh`.
- **Claude.** There is no repair round-trip and no server-side-fallback beta (`AI_SERVER_FALLBACK` does not exist), and there is no custom schema sanitizer: `anthropic.transform_schema` is used instead.
- **Login throttling.** It is done by nginx `limit_req` only; failed logins are not counted in the audit log.
- **Removed endpoints.** There are no `content/{id}/video-job` endpoints.
- **Added endpoints.** `POST /children/{id}/unarchive`, `GET /packs/{id}` and `POST /content/{id}/duplicate` were added.
- **Data.** No JSONB carries `schema_version`, and there is no `health.safety_note` field. Instead of a single CHECK, `observations` has two CHECKs (nullable text only for feedback, and a length of 1–4000).
- **Game templates.** There are 7, with `story_builder` added for spec §45.
- **No dictation.** Accordingly, `Permissions-Policy` sets `microphone=()`.
- **Template provider.** It uses generic themes: per focus category for Growth Support (with a few phrase overrides for specific focus suggestions) and per target strength for Strength Builder, with slot filling. There are no phrase tables per focus suggestion × type.
- **Spec loop test.** The spec §44 loop test lives in `test_content.py`, not in a separate `test_loop.py`.
