# Kidsphere MVP target architecture

## 1. Shape
```
Browser (React SPA, ar/he/en, RTL)
   │ HTTPS kids.kortexd.com
nginx 1.24 ── /            → /var/www/kidsphere/frontend/dist (try_files → index.html)
           ── /assets/     → immutable cache
           ── /api/        → 127.0.0.1:3071 (uvicorn, kidsphere-api.service, 1 worker, sync endpoints)
                               │ SQLAlchemy 2 + psycopg 3 (pool 5+5)
                               ▼
                           PostgreSQL 16 (DB kidsphere)
                               uploads: /var/www/kidsphere/uploads (served only via authenticated API)
                               AI: anthropic SDK → Claude (only if ANTHROPIC_API_KEY set) else template generator
```

## 2. Key decisions
| Topic | Decision | Why |
|---|---|---|
| Data access | SQLAlchemy 2.0 ORM (`Mapped[...]` models in one `models.py`), sync Session per request, `select()` queries. No repository layer. | Alembic needs SQLAlchemy anyway. `select()` lets the role filter compose into every query (the scope-in-query / 404 rule). JSONB, UUID and CHECK map natively. Sync code avoids async pitfalls with bcrypt and blocking AI calls, since FastAPI runs `def` endpoints in its threadpool. |
| Migrations | Alembic, revisions written by hand (no autogenerate). `0001_initial` holds reviewed DDL via `op.execute`/`op.create_table`. Run on the server with `venv/bin/alembic upgrade head`. | Version table, transactional DDL and downgrade in one tool. Autogenerate is unreliable without a local DB. |
| Validation | Pydantic v2: `ConfigDict(extra='forbid', str_strip_whitespace=True)`. `Literal` sets mirror the DB CHECKs. Every JSONB column has a model carrying `schema_version`. | Unknown fields such as `role` or `created_by` are rejected. JSONB is never trusted unvalidated. |
| Passwords | pyca `bcrypt`, cost 12. Verify with `checkpw(pw.encode('utf-8')[:72], hash)`. | Verifies the existing bcryptjs `$2a$/$2b$` hashes, so the prod admin keeps the same password. The 72-byte slice copies bcryptjs truncation, which keeps long Arabic/Hebrew passwords working. passlib is not used. |
| Sessions | Opaque token in cookie `ks_session` (HttpOnly, SameSite=Lax, Secure, Path=/, 7 days). The `sessions` table stores only the sha256. Sessions are deleted on logout, password change, role change and deactivation. | Same-origin SPA behind nginx. Revocable. No JWT secret, no Redis. |
| CSRF | SameSite=Lax plus a middleware that rejects POST/PUT/PATCH/DELETE with 403 when the `Origin` host differs from `Host`. | Cheap and enough for same-origin. |
| Login throttling | 8 or more `auth.login_failed` audit rows for an identifier within 15 minutes returns 429 RATE_LIMITED. nginx adds `limit_req` on `/api/auth/login`. | Correct across workers; no in-memory state. |
| DB and names | New DB `kidsphere` (role `kidsphere`), system user `kidsphere`, service `kidsphere-api`, port 3071. The old `kidsphere_app` DB is dumped and retired. | Clean schema with no Prisma leftovers. Side-by-side install while the old Next app still holds :3070. |
| AI | Claude `claude-opus-5-5` when `ANTHROPIC_API_KEY` is set, otherwise the deterministic template provider. Output is always validated with Pydantic plus the safety check before saving. | The server has no key today, so templates are the production path. |
| Frontend | Vite + React 19 + TS + react-router v7 (library mode) + Tailwind 4 (`@tailwindcss/vite`) + lucide-react. A small `useFetch` hook and three contexts (Auth, I18n, Options). | Static build for nginx. Ported components keep working. Minimal dependencies. |
| i18n | JSON dictionaries per namespace: `src/i18n/messages/{en,ar,he}/<ns>.json`, loaded with `import.meta.glob`. A vitest check enforces key parity. Domain option labels come from `GET /api/options`, the single source shared with backend validation. | Parallel packages each own their own namespace files. One vocabulary feeds UI, validation and AI prompts. |

## 3. Repository layout (after wave 6)
```
backend/
  requirements.txt            fastapi, uvicorn[standard], sqlalchemy>=2, psycopg[binary]>=3.2, alembic, pydantic>=2,
                              pydantic-settings, bcrypt, python-multipart, Pillow, anthropic>=1
  requirements-dev.txt        -r requirements.txt, pytest, httpx
  .env.example  .gitignore  alembic.ini  pytest.ini
  migrations/env.py  migrations/script.py.mako  migrations/versions/0001_initial.py
  app/
    main.py        FastAPI app, middleware (origin check), exception handlers, include_router for every module in routers/,
                   optional StaticFiles+SPA fallback ONLY when SERVE_STATIC_DIR is set (CI preview, never prod)
    config.py      Settings (pydantic-settings, reads backend/.env)
    db.py          engine, SessionLocal, get_db()
    models.py      all 14 tables
    errors.py      AppError(code), code→HTTP map, handlers (RequestValidationError → 400 VALIDATION details[{path,message}],
                   IntegrityError unique → 409 DUPLICATE, anything else → 500 INTERNAL, logged)
    security.py    hash_password, verify_password, new_token, hash_token, DUMMY_HASH
    deps.py        current_user, require_roles(*roles)
    access.py      child_scope(user) → SQL predicate; get_child_or_404(db, user, child_id, write=False)
    audit.py       audit(db, actor, action, object_type, object_id, child_id=None, **primitive_meta)
    vocab.py       load data/options.json once; keys(list), is_valid(list, key), label(list, key, lang)
    cli.py         create-admin | set-password | import-users (password via prompt/stdin, never argv)
    dev_seed.py    Adam (§44) and Maya (§45); refuses unless the DB name ends with _preview or _test
    data/options.json
    routers/       auth me health options users classes parents children profiles baselines focus_areas
                   observations timeline content feedback reviews video
    services/      users classes children uploads profiles baselines focus_areas observations timeline
                   content feedback reviews packs video_service
    schemas/       common auth admin children profile focus observations content reviews
    ai/            service.py claude_provider.py template_provider.py safety.py schemas.py context.py prompts.py templates/*.json
  tests/           conftest.py + test_*.py
frontend/
  package.json  vite.config.ts  tsconfig.json  index.html  eslint.config.js  .prettierrc  .gitignore
  public/boot.js  (sets <html lang dir> from localStorage before paint; external file so CSP needs no unsafe-inline)
  src/main.tsx  App.tsx  routes.tsx  index.css
  src/lib/       api.ts  useFetch.ts  options.tsx  paths.ts  utils.ts  format.ts
  src/i18n/      config.ts  translate.ts  I18nProvider.tsx  messages/{en,ar,he}/<namespace>.json
  src/auth/      AuthProvider.tsx  RequireRole.tsx
  src/components/ui/*  src/components/layout/{AppShell,LocaleSwitcher}.tsx
  src/features/  auth children wizard admin parent observations focus timeline player games content development pack
                 (each feature has routes.tsx exporting AppRoute[] = {path, element, roles, nav?})
deploy/
  ci/{remote-test.sh,remote-test.ps1,server-run.sh,provision-ci.sh,README.md}
  install.sh  deploy.sh  remote-deploy.sh  deploy-kids.ps1  cutover.sh  README.md
  nginx/{kidsphere.conf,kidsphere-tls.conf,kidsphere-headers.conf,kidsphere-ratelimit.conf}
  systemd/kidsphere-api.service
docs/  README.md ARCHITECTURE.md DECISIONS.md ROADMAP.md PRIVACY.md AGENTS.md CLAUDE.md  .gitattributes
```
During waves 1–5 the legacy tree (`src/`, `prisma/`, `tests/`, the root `package.json`) stays in place, read-only, as the porting source. Wave 6 tags it `legacy-nextjs` and removes it.

## 4. Database schema (Alembic 0001, DDL sketch)
Conventions:
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`; every timestamp is `timestamptz NOT NULL DEFAULT now()`.
- `updated_at` is set by the ORM (`onupdate`).
- `created_by` / `approved_by` are `uuid REFERENCES users`. Users are deactivated, never deleted.
- Child-owned rows use `ON DELETE CASCADE`.
```sql
CREATE TABLE users (id uuid PK, name text NOT NULL,
  email text NOT NULL UNIQUE,                 -- login identifier: e-mail or username, lower-case
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','teacher','parent')),
  language text NOT NULL DEFAULT 'ar' CHECK (language IN ('ar','he','en')),
  is_active boolean NOT NULL DEFAULT true, last_login_at timestamptz, created_at, updated_at);
CREATE TABLE sessions (id uuid PK, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, user_agent text, created_at);
CREATE TABLE classes (id uuid PK, name text NOT NULL, kindergarten text NOT NULL, created_at, UNIQUE (kindergarten, name));
CREATE TABLE class_teachers (class_id uuid REFERENCES classes ON DELETE CASCADE,
  user_id uuid REFERENCES users ON DELETE CASCADE, PRIMARY KEY (class_id, user_id));
CREATE TABLE children (id uuid PK, name text NOT NULL, preferred_name text, birth_date date NOT NULL,
  gender text CHECK (gender IN ('girl','boy','unspecified')), class_id uuid REFERENCES classes ON DELETE SET NULL,
  main_language text NOT NULL, additional_languages jsonb NOT NULL DEFAULT '[]', photo_path text,
  parent_name text, parent_contact text, archived_at timestamptz, created_by uuid REFERENCES users, created_at, updated_at);
CREATE INDEX ON children (class_id) WHERE archived_at IS NULL;
CREATE TABLE child_parents (child_id uuid REFERENCES children ON DELETE CASCADE,
  user_id uuid REFERENCES users ON DELETE CASCADE, relation text, created_at, PRIMARY KEY (child_id, user_id));
CREATE TABLE child_profiles (id uuid PK, child_id uuid NOT NULL UNIQUE REFERENCES children ON DELETE CASCADE,
  parent_perspective jsonb NOT NULL DEFAULT '{}', teacher_perspective jsonb NOT NULL DEFAULT '{}',
  strengths jsonb NOT NULL DEFAULT '[]', interests jsonb NOT NULL DEFAULT '[]', motivators jsonb NOT NULL DEFAULT '[]',
  what_helps jsonb NOT NULL DEFAULT '[]', sensitivities jsonb NOT NULL DEFAULT '[]', current_understanding jsonb,
  wizard_step smallint NOT NULL DEFAULT 1, wizard_completed_at timestamptz, created_at, updated_at);
CREATE TABLE baselines (id uuid PK, child_id uuid NOT NULL REFERENCES children ON DELETE CASCADE,
  baseline_data jsonb NOT NULL, created_by uuid REFERENCES users, created_at);
-- trigger baselines_immutable: BEFORE UPDATE ON baselines → RAISE EXCEPTION (DELETE only via child cascade)
CREATE TABLE focus_areas (id uuid PK, child_id uuid NOT NULL REFERENCES children ON DELETE CASCADE,
  category text NOT NULL, suggestion_key text, title text NOT NULL, description text, plan jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  close_reason text, created_by uuid REFERENCES users, created_at, updated_at, closed_at timestamptz);
CREATE INDEX ON focus_areas (child_id) WHERE status = 'active';
CREATE TABLE generated_content (id uuid PK, child_id uuid NOT NULL REFERENCES children ON DELETE CASCADE,
  focus_area_id uuid REFERENCES focus_areas ON DELETE SET NULL, pack_id uuid,
  mode text NOT NULL CHECK (mode IN ('strength_builder','growth_support')),
  content_type text NOT NULL CHECK (content_type IN ('story','video','digital_game','real_world_activity')),
  language text NOT NULL CHECK (language IN ('ar','he','en')), title text NOT NULL, content jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','completed','archived')),
  shared_with_parent boolean NOT NULL DEFAULT false, generation_input jsonb NOT NULL,
  ai_provider text NOT NULL, ai_model text, is_template boolean NOT NULL, variant int NOT NULL DEFAULT 0,
  video_status text CHECK (video_status IN ('script_ready','generating','ready','failed')),
  video_provider text, video_external_job_id text, video_url text,
  approved_by uuid REFERENCES users, approved_at timestamptz, created_by uuid REFERENCES users, created_at, updated_at);
CREATE INDEX ON generated_content (child_id, status);
CREATE TABLE observations (id uuid PK, child_id uuid NOT NULL REFERENCES children ON DELETE CASCADE,
  focus_area_id uuid REFERENCES focus_areas ON DELETE SET NULL,
  content_id uuid REFERENCES generated_content ON DELETE SET NULL,            -- spec activity_id
  source text NOT NULL DEFAULT 'quick' CHECK (source IN ('quick','content_feedback')),
  observed_at timestamptz NOT NULL DEFAULT now(), area text, context text,
  observation text NOT NULL CHECK (length(observation) BETWEEN 1 AND 4000),
  support_level text CHECK (support_level IN ('independent','some_support','significant_support','not_observed')),
  what_helped jsonb, note text, details jsonb, client_request_id text,
  created_by uuid REFERENCES users, created_at, updated_at, UNIQUE (created_by, client_request_id));
CREATE INDEX ON observations (child_id, observed_at DESC);
CREATE TABLE content_feedback (id uuid PK, content_id uuid NOT NULL REFERENCES generated_content ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('worked_well','partly','did_not_work')), support_level text CHECK (...same 4...),
  observation text, what_helped jsonb, observation_id uuid REFERENCES observations ON DELETE SET NULL,
  created_by uuid REFERENCES users, created_at);
CREATE TABLE development_reviews (id uuid PK, child_id uuid NOT NULL REFERENCES children ON DELETE CASCADE,
  review_date date NOT NULL DEFAULT current_date, summary text NOT NULL, focus_review jsonb NOT NULL DEFAULT '[]',
  baseline_validation jsonb NOT NULL DEFAULT '[]', understanding jsonb NOT NULL, ai_suggested boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users, created_at);
CREATE TABLE audit_log (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid, action text NOT NULL,
  object_type text, object_id uuid, child_id uuid, metadata jsonb NOT NULL DEFAULT '{}', created_at);
CREATE INDEX ON audit_log (child_id, created_at); CREATE INDEX ON audit_log (action, created_at);
```
JSONB shapes (Pydantic, `schema_version: 1`):
- **Profile item** (in `strengths`, `interests`, `what_helps`, `sensitivities`): `{key|custom, sources:[parent|teacher|observation|review], added_by, added_at}`. Exactly one of `key` or `custom` is set. Sensitivity items also carry `what_happens` and `what_helps[]`.
- **Perspective** (`parent_perspective` / `teacher_perspective`):
  - `{sections:{basic, who, emotions, social, independence, environment, priorities}, entered:{section:{by, at}}}`
  - `who`: describe_words, strengths, interests, motivators, appreciate.
  - `emotions`: helps_when_sad, frustration_reactions, calming_helps, calming_notes, transition_reaction, transition_helps, morning_separation, what_does_not_help.
  - `social`: social, communication, comments.
  - `independence`: `{levels:{area: support_level}, notes}`.
  - `environment`: items.
  - `priorities`: parent_priorities, hope_child_feels, one_thing_to_know.
  - Parent only: `health:{safety_note}`. It is visible to staff and never sent to AI.
  - The top-level lists are the merged union of both perspectives.
- **`current_understanding`:** `{summary, strengths[], interests[], what_helps[], areas_for_support[], adaptations, next_steps, source: baseline|review, review_id, approved_by, approved_at}`.
- **`baseline_data`:** a snapshot of the child basics, both perspectives, the merged lists, the active focus areas and the completion stamps. Every later baseline is a new row.
- **`focus_review`:** `[{focus_area_id, status: improving|some_improvement|no_clear_change|needs_more_observation|no_longer_needed, decision: keep|pause|close|edit, what_worked, what_to_change, note}]`.
- **`baseline_validation`:** `[{item, status: supported|partially_supported|needs_more_observation|may_need_refinement, note, observation_ids[]}]`.

## 5. Access rules (app/access.py; no permissions engine)
| | admin | teacher | parent |
|---|---|---|---|
| Child scope | all | children whose `class_id` is in the teacher's `class_teachers` | children in `child_parents` |
| Create child | any class | own classes only | no |
| Edit basics / teacher perspective / baseline / focus / observations / content / feedback / reviews | yes | yes (in scope) | no |
| Parent perspective | read | read | read and write own; basics limited to preferred_name, additional_languages, parent_name, parent_contact |
| Read content | all | all for child | only `shared_with_parent` and status approved or completed |
| Users, classes, parent links | yes | no | no |

Out-of-scope IDs return 404 (the scope is applied inside the same SELECT). A role/action failure on a visible child returns 403. Archived children are hidden by default. `created_by` always comes from the session.

## 6. REST API (all under /api; JSON; error envelope `{error:{code,message,details}}`)
| Endpoint | Roles | Owner |
|---|---|---|
| POST auth/login, POST auth/logout, GET/PUT me, POST me/password, GET health, GET options | all (login and health public) | WP-02 |
| GET/POST users, PUT users/{id}, POST users/{id}/password; GET/POST classes, PUT/DELETE classes/{id}, PUT classes/{id}/teachers; GET/POST children/{id}/parents, DELETE children/{id}/parents/{user_id} | admin | WP-07 |
| GET/POST children (`?class_id&q`), GET/PUT children/{id} (role-shaped composite: basics, age `{years, months}`, class, merged lists, active focus, latest observation, wizard/baseline status, draft count), POST children/{id}/archive, PUT/GET/DELETE children/{id}/photo | staff; parent read | WP-05 |
| GET/PATCH children/{id}/profile (`{section, data, wizard_step}`; perspective chosen by role) | staff, parent | WP-06 |
| POST/GET children/{id}/baseline, GET children/{id}/current-understanding | staff | WP-06 |
| GET/POST children/{id}/focus-areas, PUT focus-areas/{id}, POST focus-areas/{id}/close | staff | WP-06 |
| GET/POST children/{id}/observations, PUT observations/{id} | staff | WP-08 |
| GET children/{id}/timeline (cursor; baselines, focus events, observations, content approved or completed, feedback, reviews) | staff | WP-08 |
| POST children/{id}/content/generate `{mode, content_type, template?, focus_area_id?, target_strength?, language}`; GET children/{id}/content; GET/PUT content/{id}; POST content/{id}/approve, /regenerate `{instruction?}`, /share `{shared}`, /archive; DELETE content/{id} (drafts only) | staff; parent filtered read | WP-11 |
| POST content/{id}/feedback | staff | WP-11 |
| content/generate with `content_type: pack` or `video`; POST/GET content/{id}/video-job | staff | WP-13 |
| POST children/{id}/development-reviews/suggest (no writes); POST/GET children/{id}/development-reviews | staff | WP-12 |

Error codes: UNAUTHENTICATED 401, FORBIDDEN 403, NOT_FOUND 404, VALIDATION 400, DUPLICATE 409, FOCUS_LIMIT 409, INVALID_TRANSITION 409, UNSAFE_CONTENT 422, UPLOAD_FAILED 400/413, RATE_LIMITED 429, AI_UNAVAILABLE 503, INTERNAL 500.

Content status transitions:
- draft → approved
- approved → draft, on edit or regenerate
- approved → completed, on feedback
- any status → archived
- DELETE only while draft

Feedback writes `content_feedback`, the mirrored `observations` row (source=content_feedback, with content_id and focus_area_id) and the status change in one transaction.

## 7. AI module (backend/app/ai)
- **`context.py`** builds an `AIContext` from an allow-list:
  - Included: first or preferred name, age in years, language, mode, content type or template, at most 3 strength labels, at most 3 interest labels, at most 3 what_helps labels, at most 3 avoid items (sensitivity keys), the focus area (category, title, description) or the target strength, at most 5 recent observations for that focus area (each at most 300 characters), optional gender (only for ar/he grammar), and the regenerate instruction.
  - Observation text has the child's name and every classmate's name replaced.
  - Never included: birth date, surname, photo, parent contact, `health`, or free-text parent answers.
  - The full context is stored as `generated_content.generation_input`.
- **`schemas.py`** defines the output models, each with `extra='forbid'` and length limits:
  - `StoryOut {title, goal, story (2–6 short paragraphs), questions[2–4], teacher_note, illustrations?[emoji per paragraph], personalization_used}`
  - `ActivityOut {title, goal, duration_minutes, materials[], instructions[], what_to_observe[], adaptation, personalization_used}`
  - `GameOut`, a union discriminated on `template`:
    - multiple_choice, emotion_choice and what_happens_next: `rounds[1–5]{question, choices[{label, emoji}], correct_or_preferred_answer, explanation}`
    - match_pairs: `pairs[2–6]`
    - sequence: `items[3–6]` in the correct order
    - categorize: `categories[2–3]`, `items[4–8]{label, emoji, category}`
    - Semantic checks: the answer must be one of the choices, categories must exist, items must be unique.
  - `VideoPlanOut {title, learning_goal, script, scenes[{description, narration, visual_prompt}], duration_seconds 30–90}`
  - `PackOut {story (exactly 3 discussion questions), activity, game}`
  - `UnderstandingSuggestion {summary, strengths[], interests[], what_helps[], areas_for_support[], baseline_validation[], focus_review[]}`
  - `provider_schema(Model)` strips min/max/pattern/title/default/format and sets `additionalProperties: false` on every object. Pydantic re-enforces the limits after the call.
- **`claude_provider.py`:**
  - Client: `anthropic.Anthropic(api_key, timeout=AI_TIMEOUT_SECONDS (60), max_retries=1)`.
  - Call: `client.beta.messages.create(model=ANTHROPIC_MODEL (claude-opus-5-5), max_tokens=16000, system=SYSTEM_PROMPT, messages=[...], output_config={"effort": AI_EFFORT (medium, set explicitly), "format": {"type": "json_schema", "schema": provider_schema(Model)}}, betas=["server-side-fallback-2026-07-01"], fallbacks="default")`. The last two are sent only when `AI_SERVER_FALLBACK=true`.
  - No `thinking` parameter: Opus 5.5 is always adaptive, and effort is the control.
  - A `stop_reason` of `refusal` or `max_tokens` is treated as an error. The first text block is parsed with `json.loads`.
  - Errors are caught most-specific first: `APITimeoutError` → AI_TIMEOUT; `RateLimitError`, `APIConnectionError` and `APIStatusError` → AI_UNAVAILABLE.
  - `anthropic` 1.x uses `httpx2`; FastAPI's TestClient uses `httpx`. They are separate packages, and no objects cross between them.
- **`safety.py`:**
  - `CLINICAL_TERMS` (en/ar/he; spec §2 list plus equivalents) is checked against every string field, including `teacher_note` and summaries.
  - `CHILD_DEFICIT_TERMS` (difficulty, weakness, score, risk, struggle; plus ar/he) is checked against child-facing fields only.
  - URLs are rejected.
  - Latin script uses word-boundary matching. Arabic and Hebrew use substring matching that allows common prefixes.
  - A phrase allow-list covers cases such as "problem solving" and story "problem/solution".
  - The same check runs on teacher edits (`PUT /api/content/{id}` returns 422 UNSAFE_CONTENT).
- **`service.py`:** `generate(kind, ctx) -> GenerationResult{title, content, provider, model, is_template, fallback_reason}`.
  1. Use Claude if a key is set, otherwise the template provider.
  2. Validate with Pydantic, the semantic checks and safety.
  3. On Claude, if there are issues, make one repair call that lists them.
  4. If it is still invalid, or on any AI error, fall back to the template provider and record `fallback_reason`.

  `suggest_understanding(ctx, observations, focus_areas, baseline)` follows the same flow.
- **`template_provider.py`:**
  - Deterministic. Phrase tables live in `templates/*.json`, ported from `src/lib/ai/providers/demo.ts`.
  - Tables are keyed by `focus suggestion_key` or category × mode × type × language. `{name}`, interest heroes and strength lines are filled in. `variant` drives regenerate.
  - Wording is gender-neutral unless gender is set.
  - The understanding template marks a focus area `needs_more_observation` when it has fewer than 3 observations since the baseline.
  - Template output is always valid and safe (tested for every combination). The UI shows a "Template-generated" badge.
- **Logging:** one `logging.info` per call (op, provider, model, duration_ms, ok, repaired, fallback_reason, token usage), visible via `journalctl -u kidsphere-api`. Prompt text is never logged.

## 8. Video service (backend/app/services/video_service.py)
- **Functions:**
  - `create_video_job(content) -> {status, provider, external_job_id}`
  - `check_video_status(content) -> status`
  - `get_video_url(content) -> str|None`
- **Providers:** `VIDEO_PROVIDER=none` (placeholder) keeps `video_status=script_ready` and returns a "provider not configured" notice. A real provider later only adds a module and a branch.
- **Generation:** the AI produces only `VideoPlanOut`. A video is generated only when `content_type=video` is explicitly requested; a pack includes one only if `include_video=true`.
- **Blocking:** nothing in the app ever blocks on a video job.

## 9. Uploads
- **Route:** `PUT /api/children/{id}/photo` (multipart) checks write access.
- **Validation:** the stream is read up to 8 MB + 1. The file must be jpeg, png or webp by magic bytes.
- **Processing:** Pillow re-encodes the image to JPEG, at most 1024 px, which strips EXIF/GPS.
- **Storage:** saved to `/var/www/kidsphere/uploads/children/<uuid4hex>.jpg` after checking `resolve().is_relative_to(UPLOAD_DIR)`. Only the relative path goes into `children.photo_path`, and it is never returned to clients.
- **Serving:** `GET .../photo` runs the access check, then returns a `FileResponse` with `Cache-Control: private, no-store` and `nosniff`.
- **nginx:** has no location for the uploads directory. Directory permissions are `kidsphere:kidsphere 750`.

## 10. Frontend design
- **Boot:**
  1. `public/boot.js` sets `<html lang dir>` from `localStorage.ks_locale` (default `ar`) before paint.
  2. `AuthProvider` calls `GET /api/me`; a 401 sends the user to `/login?next=` (only same-site paths are accepted).
  3. `I18nProvider` adopts `user.language`. `setLocale` updates `documentElement.lang`/`dir` and localStorage, then calls `PUT /api/me`.
  4. `OptionsProvider` caches `GET /api/options`.
- **Routing:**
  - `routes.tsx` gathers `features/*/routes.tsx` with `import.meta.glob`. Each route declares `roles` and optional `nav` metadata; `AppShell` builds the nav from that metadata.
  - `src/lib/paths.ts` (WP-03) defines every path up front, so features can link to each other before the target feature lands.
  - Paths: `/login`, `/account`, `/children`, `/children/new`, `/children/:id`, `/children/:id/edit/:step`, `/children/:id/focus`, `/children/:id/observe`, `/observe`, `/children/:id/timeline`, `/children/:id/content`, `/children/:id/content/new`, `/content/:id`, `/content/:id/present`, `/packs/:packId`, `/children/:id/development`, `/children/:id/review/new`, `/admin/users`, `/admin/classes`, `/admin/children/:id/parents`, `/parent`, `/parent/children/:id/onboarding`, `/parent/children/:id/content`, `/parent/content/:id`.
- **Data:**
  - `api<T>()` is ported from `src/lib/client/api.ts`: same-origin credentials, typed `ApiError`, and error codes mapped to `errors.*` messages.
  - `useFetch(url)` returns `{data, error, loading, reload}`.
  - `useAction` handles pending state, toasts and `onSuccess`.
  - No global store.
- **Design system:**
  - Tokens are copied from `globals.css` (brand `#0f766e`, surface `#faf8f5`, ink, muted, line, `radius-card`, focus ring, reduced motion).
  - Rubik is self-hosted via `@fontsource-variable/rubik`.
  - Colour meaning: emerald for strengths, sky for interests, violet for what helps, amber for attention; rose for errors only.
  - Ported primitives with buttons at least `h-11` and chips at least `min-h-11`. Cards first, lucide icons.
- **RTL:**
  - Only logical utilities (`ms/me/ps/pe/start/end/border-s/border-e/text-start`). A vitest grep test bans `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left` and `text-right`.
  - Directional icons use `rtl:rotate-180`. User and AI text uses `dir="auto"`. Email, password and phone inputs use `dir="ltr"`.
  - The player and games take their direction from `content.language`. Sequence order follows that direction.
  - Dates and ages use Intl: `ar-u-nu-latn` (pending PO), `he-IL`, `en`.
  - Plurals use `Intl.PluralRules` keys such as `years_one`, `years_two`, `years_few`, `years_many` and `years_other`.
- **Games:** tap-to-select interactions with no drag library, no scores or points, gentle feedback, and the shared Finish screen.

## 11. Server deploy layout
- **Paths:**
  - `/var/www/kidsphere/backend`: rsynced source, `venv/`, `.env` (600, owned by kidsphere).
  - `/var/www/kidsphere/frontend`: rsynced source, `node_modules/`, `dist/` (nginx root).
  - `/var/www/kidsphere/uploads` (750).
  - `/var/www/kidsphere/releases/<sha>` (keep 5).
  - `/var/backups/kidsphere/*.dump` (keep 10).
  - Node for Vite builds: existing `/opt/kidsphere-node` (v22).
- **`backend/.env.example`:**
  - `DATABASE_URL=postgresql+psycopg://kidsphere:...@127.0.0.1:5432/kidsphere`
  - `APP_URL`, `COOKIE_SECURE=true`, `SESSION_DAYS=7`
  - `UPLOAD_DIR=/var/www/kidsphere/uploads`, `DEFAULT_LOCALE=ar`
  - `ANTHROPIC_API_KEY=` (empty means templates), `ANTHROPIC_MODEL=claude-opus-5-5`, `AI_EFFORT=medium`, `AI_TIMEOUT_SECONDS=60`, `AI_SERVER_FALLBACK=true`
  - `VIDEO_PROVIDER=none`, `SERVE_STATIC_DIR=` (preview only), `LOG_LEVEL=info`
  - Bash never sources `.env`. pydantic-settings reads it for both the app and `alembic/env.py`; systemd reads it via `EnvironmentFile`.
- **`kidsphere-api.service`:**
  - `User=kidsphere`, `WorkingDirectory=/var/www/kidsphere/backend`, `EnvironmentFile=.../backend/.env`.
  - `ExecStart=.../venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 3071 --workers 1 --proxy-headers --forwarded-allow-ips 127.0.0.1`.
  - `Restart=always`, `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ReadWritePaths=/var/www/kidsphere/uploads`, `ProtectHome`, `MemoryMax=512M`.
- **nginx** (`listen 443 ssl http2`, reusing the existing Let's Encrypt certificate):
  - `root .../frontend/dist`
  - `location /assets/` with immutable caching; `location /` with `try_files $uri /index.html` and `no-cache`
  - `location /api/` with `proxy_pass http://127.0.0.1:3071`, `Host $host`, `X-Real-IP $remote_addr`, `X-Forwarded-For $remote_addr`, `X-Forwarded-Proto $scheme`, `proxy_read_timeout 300s`, `client_max_body_size 10m` and `Cache-Control no-store`
  - `location = /api/auth/login` with `limit_req` (the zone is defined in `conf.d/kidsphere-ratelimit.conf`)
  - `include kidsphere-headers.conf` in every location: CSP `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`, plus nosniff, `Referrer-Policy no-referrer`, `X-Frame-Options DENY`, `Permissions-Policy camera=(), geolocation=(), microphone=(self)` (for dictation), HSTS and `X-Robots-Tag noindex`.
- **Deploy** (`deploy-kids.ps1` → `remote-deploy.sh` → `deploy.sh <sha>`):
  1. `git archive HEAD` → `releases/<sha>`.
  2. Run `deploy/ci/server-run.sh` on the release; abort on failure.
  3. `rsync --delete` the backend (excluding `venv` and `.env`).
  4. pip install, only when the requirements hash changed.
  5. `pg_dump -Fc`.
  6. `alembic upgrade head` as kidsphere.
  7. rsync the frontend source, run `npm ci` (lock-hash gated), then `env -i PATH=... NODE_OPTIONS=--max-old-space-size=768 npm run build -- --outDir dist.new`, then swap `dist.new` → `dist` atomically.
  8. `systemctl restart kidsphere-api`, run the health loop and the smoke curls.
  9. `nginx -t && reload` if the config changed.
- **Cutover** (`deploy/cutover.sh` and `deploy/README.md`):
  1. `pg_dump kidsphere_app`.
  2. `install.sh` with `ENABLE_SITE=0`: creates the user, DB and dirs; installs, migrates and starts the API on 3071; curl it locally.
  3. Import the admin: psql reads email, name and passwordHash from the old `"User"` table and pipes them into `python -m app.cli import-users --role admin`.
  4. Enable the site. The takeover loop backs up and disables `kidsphere-app.conf`. Reload nginx and run the smoke tests.
  5. `systemctl disable --now kidsphere-app`.
  6. After 2 weeks, drop `kidsphere_app`, `/opt/kidsphere-app` and the old unit.

  Rollback: restore the backed-up site, start `kidsphere-app` and reload.

## 12. Testing (no local runtime; everything on the Ubuntu server)
- **CI harness** (`deploy/ci`, run from Git Bash or PowerShell):
  - `remote-test.sh [--backend|--frontend|--all] [--preview]` tars `git ls-files -co --exclude-standard -- backend frontend deploy`, so uncommitted work is included. It uploads to `/var/lib/kidsphere-ci/runs/<id>` and runs `server-run.sh` as `kidsphere-ci` under `flock`.
  - The venv is cached per requirements hash and `node_modules` per lock hash.
  - Each run creates and drops its own DB `kidsphere_test_<id>` with role `kidsphere_ci` (CREATEDB).
  - Tests run with empty AI keys.
  - `--preview` runs the build on `kidsphere_preview` with the dev seed, as a transient unit `kidsphere-preview` on 127.0.0.1:3072 (`SERVE_STATIC_DIR` set, `COOKIE_SECURE=false`). Open it with `ssh -L 3072:127.0.0.1:3072`.
  - The harness never touches prod services, the prod DB or nginx.
- **pytest:**
  - `conftest.py` asserts the DB name starts with `kidsphere_test_`. It runs `alembic upgrade head` once, so migrations are tested too, and truncates all tables except `alembic_version` before each test.
  - Fixtures: TestClient sessions for admin, teacher, other teacher, parent and other parent, plus classes and children.
  - `UPLOAD_DIR` points to `tmp_path`. A `FakeClaude` queue replaces the client.
  - Files:
    - `test_auth.py`, `test_access.py` (404s, roles, unknown fields)
    - `test_migrations.py` (upgrade/downgrade/upgrade, baseline trigger)
    - one file per feature
    - `test_ai_*.py`
    - `test_loop.py` (the Adam loop of spec §44, end to end through the API)
- **Frontend:**
  - `tsc --noEmit`, eslint, and `vite build` are the main gate.
  - vitest + jsdom: i18n key parity (ar and he contain every en key), the RTL class ban, the 6 game templates rendering from fixtures and rejecting malformed data, and `formatAge`.
  - No Playwright, because Chromium is too heavy for the host.

## 13. Simplicity rules (spec §48)
- Function-based services; each router module is thin and calls one service function per route.
- No base classes, factories, repository layer or event bus; the only "provider" choice is one if-statement.
- One models file and one Alembic chain. A schema change after 0001 is a new numbered revision, owned by at most one package per wave.
- Small React components per feature folder. Shared things live only in `components/ui`, `lib` and `i18n`.