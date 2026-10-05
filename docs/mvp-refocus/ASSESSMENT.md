# Kidsphere MVP refocus: assessment (spec §39)

## Summary
- **What exists now.** A Next.js 16 full-stack app with 46 pages and 68 route handlers under `src/app/api`. The data layer is Prisma 6 with 36 models and 23 enums (`prisma/schema.prisma`). It has 5 roles spread over an Organization → Kindergarten → Class tenant model. On top of that sit a child PIN mode, family-photo consent, narration recording, a class weekly planner, a ProfileAttribute evidence/confidence engine, notifications, messaging and analytics. All of this goes well beyond the MVP loop (Know → Focus → Create → Experience → Observe → Learn → Adapt), and spec §1 does not allow this stack as the backend.
- **Production data.** kids.kortexd.com runs `kidsphere-app.service` on :3070 with DB `kidsphere_app`. It holds only one admin user and one empty organization. Nothing needs migrating except the admin login.
- **What can be reused.** A lot of the code is worth carrying over as assets:
  - design tokens and UI primitives
  - ar/he/en dictionaries and vocabularies, which are already RTL-correct because the CSS uses only logical properties
  - the wizard engine, the quick-observation form and the content player
  - the designs for bcrypt hashing, sessions, permissions and audit
  - the AI prompts, the banned-term lists and the offline phrase tables
  - the deploy provisioning scripts and the test scenarios
- **Target.**
  - FastAPI with PostgreSQL 16 (14 tables), and a Vite React TypeScript SPA behind nginx, run by systemd on one Ubuntu server.
  - About 40 REST endpoints, following spec §29 plus auth, admin and photo routes.
  - 14 work packages in 6 waves.
  - All building and testing happens on the Ubuntu server; nothing runs locally.

## Stack decision
- **Why the Next.js app cannot stay.** Spec §1 requires a Python REST backend and a static React build served by nginx. Next.js cannot be kept as the backend. Keeping it as the frontend would still need a Node server, because every page is an async Server Component that reads Prisma directly.
- **Backend.** FastAPI with sync `def` endpoints, SQLAlchemy 2 on psycopg 3, Alembic and Pydantic v2. It runs as `kidsphere-api.service` (uvicorn on 127.0.0.1:3071).
- **UI.** A Vite + React 19 + TypeScript + react-router v7 + Tailwind 4 SPA. It is TypeScript because the existing code is TS, so components port with little change.
- **Ported vs rewritten.**
  - All server-side TypeScript (services, Prisma queries, route handlers, Zod validators) is rewritten in Python. The rules are translated; the code is not.
  - Client components, CSS tokens, dictionaries and vocabularies are copied or adapted.
- **What happens to the Next.js app.** It is not kept running long term:
  - During waves 1–5 it stays untouched in the tree as a porting reference, and keeps serving kids.kortexd.com until cutover.
  - In wave 6 it is tagged `legacy-nextjs` and removed from the tree. It stays in git history.
- **Server layout** (spec §47): `/var/www/kidsphere/{frontend,backend,uploads}` with a fresh DB `kidsphere`.

## KEEP (assets to port)
### Backend logic: translate to Python
| Asset | Source | How it is reused |
|---|---|---|
| bcrypt cost-12 hashes | `src/lib/auth/password.ts` | **Translate.** Use pyca `bcrypt` with `checkpw(pw.encode()[:72], h)`. Existing `$2a$/$2b$12$` hashes verify unchanged, so the admin keeps their password. Do not use passlib. |
| Opaque DB sessions | `src/lib/auth/{session,tokens,cookies}.ts` | **Translate.** Cookie `ks_session` holds `secrets.token_urlsafe(32)`; only its sha256 is stored. HttpOnly, SameSite=Lax, Secure, 7-day lifetime. Sessions are revoked on deactivation, role change and password change. |
| Login flow (email or username, generic error, audit) | `src/server/services/auth.ts`, `loginSchema` in `src/server/validators/index.ts` | **Translate.** Also fix the dummy-hash timing leak (the current dummy is 62 characters, so the compare returns at once). |
| Scope check inside the query; out-of-scope IDs return 404 | `src/lib/permissions/index.ts` (`childScopeWhere`, `authorizeChild`) | **Translate** to `app/access.py` with 3 roles. |
| Error envelope `{error:{code,message,details}}` | `src/lib/errors.ts`, `src/lib/api.ts` | **Translate** to exception handlers. The client keeps the same envelope. |
| Same-origin check on mutating requests | `src/lib/route.ts` | **Translate** into a roughly 10-line middleware. |
| Audit log with primitive metadata only | `src/lib/audit/index.ts` | **Translate**, trimmed to about 20 actions. Profile edits record field names, not values. |
| Upload hardening | `src/lib/storage/local.ts`, `src/server/services/media.ts` | **Translate** for the child photo only: allowlist, magic bytes, opaque name, `private, no-store`. Add a Pillow re-encode to strip EXIF/GPS. |
| Domain rules | `src/features/goals/rules.ts`, `src/server/services/goals.ts`, `src/features/content/workflow.ts`, `src/server/services/observations.ts` | **Translate:** max 3 active focus areas, an edit returns content to draft, only approved content is visible beyond staff, observations are idempotent by `client_request_id`. The goal limit becomes a row lock, because today's count-then-insert can race. |
| AI data minimization | `src/server/services/generation-context.ts`, `src/server/services/profile.ts` (name masking) | **Translate** to an allow-list builder in `app/ai/context.py`. |
| Prompts | `src/lib/ai/prompts.ts` | **Translate** to `app/ai/prompts.py`. Add a section per mode. Replace the blanket "problem" ban so that "problem solving" is allowed. |
| Validate → repair once → fail safe | `src/lib/ai/providers/base.ts`, `src/lib/ai/providers/anthropic.ts` | **Translate** (about 40 lines) using the anthropic Python SDK. On failure, fall back to the template generator. |
| JSON-schema sanitizer, child-safety checker, content schemas | `src/lib/ai/schemas.ts` | **Translate** to Pydantic models plus `app/ai/safety.py`. |
| Offline ar/he/en phrase tables | `src/lib/ai/providers/demo.ts` | **Copy** the strings into `app/ai/templates/*.json`. **Rewrite** the generator for each mode, focus and type. |
| Adam / Maya demo data | `prisma/seed.ts` | **Copy the data only** into `app/dev_seed.py`, which refuses to run against the production DB. |

### Frontend: copy or adapt into `frontend/`
| Asset | Source | How it is reused |
|---|---|---|
| Design tokens and global CSS (teal brand, warm neutrals, focus ring, reduced motion) | `src/app/globals.css` | **Copy.** Rubik comes from `@fontsource-variable/rubik` instead of `next/font`. |
| UI primitives | `src/components/ui/{badge,card,feedback,form,dialog,toast}.tsx` | **Copy as-is.** Raise touch targets to at least 44px. |
| Button, PageHeader, TabNav, Table | `src/components/ui/{button,misc}.tsx` | **Adapt:** `next/link` becomes react-router `Link`/`NavLink`. |
| Helpers | `src/lib/utils.ts` | **Copy**, and add `formatAge` ("4 years 2 months"). |
| i18n runtime | `src/lib/i18n/{config,translate,format,client}.ts(x)` | **Copy/adapt.** Drop `server.ts`, add plural keys, and set `dir` from the client. |
| Dictionaries | `src/lib/i18n/messages/{en,ar,he}.ts` | **Convert** the reusable namespaces (common, auth, errors, teacher.child/observations/content, parent) into per-feature JSON. Rename enum keys to the spec's values. |
| Trilingual vocabularies with emoji | `src/features/child-understanding/vocabulary.ts`, `src/features/questionnaires/definition.ts`, `src/features/observations/definition.ts` | **Re-key** into one `backend/app/data/options.json`, served by `GET /api/options`. Fill the gaps in the spec §6–11 lists. |
| Wizard engine (steps, progress, save-and-continue, review) | `src/features/questionnaires/{questionnaire-wizard,answer-view}.tsx` | **Adapt** for the 7-step Add Child wizard and for parent onboarding. |
| Quick observation (context tiles, chips, dictation, double-tap guard) | `src/features/observations/{quick-observation-form,shared}.tsx` | **Adapt** to the spec §21 fields. |
| Content player (RTL, big buttons, TTS, no scoring) | `src/features/player/content-player.tsx` | **Copy/adapt.** It becomes the story player, the activity view and the base for the choice and sequence games. |
| Review, edit and approve UI | `src/features/content/{content-review,body-editor,status}.tsx`, `src/features/content/studio-form.tsx` | **Adapt** to 4 statuses and to the Mode → focus → type flow. |
| Feedback dialog (🌟 🌤️ 🌧️) | `src/features/goals/record-outcome.tsx` | **Adapt** to spec §20. |
| Profile, child-card and timeline markup | `src/app/teacher/children/[childId]/page.tsx`, `src/app/teacher/classes/[classId]/page.tsx`, `src/features/child-understanding/vocab-chip.tsx` | **Copy the JSX** into client pages. |
| Shell, locale switcher, API client, admin dialog, auth forms, parent pages | `src/components/layout/{app-shell,locale-switcher}.tsx`, `src/lib/client/api.ts`, `src/features/admin/simple-form.tsx`, `src/features/auth/{login-form,account-form}.tsx`, `src/app/parent/**` | **Adapt:** `usePathname`/`useRouter` become `useLocation`/`useNavigate`, and `router.refresh()` becomes a reload callback. |

### Deploy and tests
| Asset | Source | How it is reused |
|---|---|---|
| Provisioning: `--no-upgrade` apt, port check, idempotent user/DB, secrets generated on the server, nginx server_name takeover, certbot reuse | `deploy/install.sh` | **Adapt** for Python and the new paths. |
| git-archive over SSH plus the PowerShell wrapper | `deploy/remote-deploy.sh`, `deploy/deploy-kids.ps1` | **Adapt:** extract into a release dir, then `rsync --delete`. |
| Install skipped when the lockfile hash is unchanged; health loop | `deploy/deploy.sh` | **Adapt** for pip and npm. |
| systemd hardening, TLS server blocks | `deploy/systemd/kidsphere.service`, `deploy/nginx/kidsphere-tls.conf` | **Adapt** into `kidsphere-api.service` and an SPA + `/api` site. Keep `listen 443 ssl http2`, because nginx 1.24 does not support `http2 on`. |
| CSP and security headers | `next.config.ts` | **Move** into an nginx snippet. `script-src 'self'` can now drop `unsafe-inline`. |
| Test scenarios | `tests/integration/security.test.ts`, `tests/unit/{rules,validators,ai}.test.ts`, `tests/e2e/teacher-flow.spec.ts` | **Rewrite** as pytest (API) and vitest (i18n parity, game rendering). |
| Proven FastAPI + Vite deploy on the same host | `C:/projects/kortex-messaging/deploy/*` | **Reference only.** Do not copy its Redis/Celery units, its 4-worker gunicorn or `http2 on`. |

## SIMPLIFY
| Today | MVP |
|---|---|
| 5 roles on Organization → Kindergarten → Class tenancy | 3 roles (admin, teacher, parent) on a single install. Tenancy is reduced to `classes` (with kindergarten as a text field), `class_teachers` and `child_parents`. |
| ProfileAttribute + Evidence + confidence engine (REPORTED/CORROBORATED) | `child_profiles` JSONB holding the current profile, an immutable `baselines` row, and a teacher-approved `current_understanding`. Each item records its source (parent/teacher/observation/review). |
| ParentQuestionnaire/ParentResponse tables, 14 sections, about 60 questions | 7 wizard steps saved per section into `parent_perspective` / `teacher_perspective` JSONB, kept to about 5–7 minutes. |
| ContentAsset + Version + Approval + Template; 12 types; 5 statuses | One `generated_content` row: 4 types × 2 modes, statuses draft/approved/completed/archived, a `shared_with_parent` flag, and `pack_id` for packs. |
| Goal + GoalEvidence + Intervention + Outcome | `focus_areas` (with an optional `plan` JSONB) plus `content_feedback`, which is mirrored into `observations`. |
| QUICK/FULL observations, domain items, 4-level ratings | One `observations` table with one `support_level` scale (independent / some_support / significant_support / not_observed), shared with wizard step 5 and with feedback. |
| 3 AI providers, per-org settings, demo provider blocked in production | Claude when `ANTHROPIC_API_KEY` is set, otherwise the deterministic template generator. Config lives in env only. |
| 6 regenerate modes; class Mon–Fri weekly planner | One regenerate with an optional instruction; a per-child pack. |
| Child mode with PIN lock and a separate session | A client-only full-screen "Present" view of approved content. |
| In-memory login limiter keyed on a spoofable X-Forwarded-For | Failed logins counted in `audit_log` plus nginx `limit_req`, using `$remote_addr`. |
| Locale cookie with server-rendered `dir` | `public/boot.js` sets `lang`/`dir` before first paint; I18nProvider persists the choice to the user. |
| 7 child tabs; 6-card dashboard; 13 admin nav items | 4 tabs (Profile, Timeline, Content, Development); the child list with "drafts waiting" and "not observed recently" strips; admin pages Users / Classes / Parent links. |
| PG enum types, cuid ids | TEXT + CHECK, mirrored by Pydantic `Literal`; uuid via `gen_random_uuid()`. |

## REMOVE
- **Multi-tenancy:** Organization, organizationId everywhere, and org settings. Paths: `prisma/schema.prisma:212`, `src/server/services/admin.ts`, `src/features/admin/org-settings-form.tsx`, `src/components/layout/brand-style.tsx`.
- **Child mode:** `src/proxy.ts`, `src/lib/child-session.ts`, `src/server/services/child-mode.ts`, `src/app/play`, `src/features/child-mode/*`, and `docs/kiosk.md`.
- **Media consent, family-photo characters and narration:** `src/server/services/media.ts`, `src/features/{consent,media}`, `src/features/content/narration-recorder.tsx`, and MediaAsset/MediaConsent/ContentCharacter/TeacherNarration.
- **Email password reset:** `src/lib/mailer.ts`, `src/features/auth/password-reset.tsx` and PasswordResetToken. The dev mailer prints reset links to journald. Admins set passwords instead, and a server CLI handles recovery.
- **Out-of-scope services:** notifications, parent messages, the analytics store and AI request log, the dashboard, weekly plans, and the profile attribute engine. Paths: `src/server/services/{notifications,parent-messages,dashboard,weekly-plans,profile}.ts`, `src/lib/analytics`.
- **Quantitative displays and computed flags:**
  - the progress page and `getProgress` (`progressLine` "{helped} of the last {total}…")
  - the "3 of 5" success-indicator hint
  - admin percentages
  - the count-based professional-team concern flag in `src/features/child-understanding/engine.ts`

  All of these go against spec §26/§27.
- **Assessment-style forms:** the full observation form and its rating grid, and AI attribute suggestions. Paths: `src/features/observations/{full-observation-form,suggest-button}.tsx`.
- **Other features:** the OpenAI provider, the S3 driver (`src/lib/storage/s3.ts`), the library and templates, and use-template.
- **Local-run tooling** (the user deploys on Ubuntu only):
  - Docker files: `docker-compose.yml`, `scripts/docker-init.sql`
  - the embedded Postgres helper: `scripts/db-server.mjs`
  - the `BUILD_LOCALLY` branch
  - `.claude/launch.json` (gitignored)
  - Playwright against `next dev`
- **The Next/Prisma tree, at the end:** `src/`, `prisma/`, `tests/`, the root `package.json`, `next.config.ts`, and the vitest/playwright/eslint/postcss/tsconfig root configs. They are removed in wave 6 and remain in git history under the tag `legacy-nextjs`.

## ADD
- **Backend:** a `backend/` FastAPI app with Alembic revision `0001_initial`, a pydantic-settings config, `app/cli.py` (create-admin, set-password, import-users) and `GET /api/health`.
- **Vocabulary:** one shared vocabulary file `backend/app/data/options.json` (key → en/ar/he/icon) used both for validation and for UI labels. It includes new options and neutral wording; for example, "attention" is shown as "Focus & persistence".
- **Wizard and profile:** the Add Child wizard (7 steps, resumable, with fields tagged by role), parent onboarding using the same engine, baseline snapshots, and Current Understanding.
- **Strength Builder mode** (missing today), plus spec-shaped outputs:
  - story `{title, goal, story, questions, teacher_note}`
  - activity `{…, what_to_observe, adaptation}`
  - 6 game templates: multiple_choice, emotion_choice, what_happens_next, match_pairs, sequence, categorize. Today only tap-to-choose exists.
  - a video plan
  - a pack
  - an understanding-summary suggestion
- **Production AI path without a key:** a template provider covering the 10 spec §11 focus examples × 2 modes × all types × ar/he/en.
- **Development review:** five descriptive statuses, baseline-validation statuses and the teacher-approval gate.
- **Video:** `app/services/video_service.py` with `create_video_job`, `check_video_status` and `get_video_url`, backed by a placeholder provider.
- **Server CI harness** (`deploy/ci/*`):
  - uploads the working tree
  - runs pytest against a per-run throwaway DB, plus tsc, vitest and the vite build, as user `kidsphere-ci`
  - offers an optional preview on 127.0.0.1:3072, reached through an SSH tunnel
- **nginx:** a headers snippet with CSP, a login rate-limit zone, an SPA fallback and a 300s `/api` timeout for AI calls. Uploads are never exposed directly.

## DATABASE CHANGES
- **Fresh database.** A new DB `kidsphere` (role `kidsphere`, UTF8 from template0) is built by hand-written Alembic `0001`. Before cutover, `kidsphere_app` is dumped with `pg_dump -Fc` and kept read-only for rollback, then dropped. No Prisma tables, enums or `_prisma_migrations` carry over.
- **36 → 14 tables:**
  - **From spec §28 (9):** `users`, `children`, `child_profiles`, `baselines`, `focus_areas`, `observations`, `generated_content`, `content_feedback`, `development_reviews`.
  - **Supporting (5):** `sessions`, `classes` (`kindergarten` TEXT), `class_teachers`, `child_parents`, `audit_log`.
- **Deviations from §28:**
  - `children.class_id` replaces the `kindergarten` text column, because §34 needs classes and teacher assignment.
  - Additions to `users`: `is_active`, `last_login_at`.
  - Additions to `children`: `preferred_name`, `parent_name`, `parent_contact`, `archived_at`, `created_by`.
  - Additions to `child_profiles`: `wizard_step`, `wizard_completed_at`.
  - Additions to `focus_areas`: `suggestion_key`, `plan`, `close_reason`, `created_by`.
  - Additions to `observations`: `source`, `content_id` (= activity_id), `area`, `note`, `details`, `client_request_id`.
  - Additions to `generated_content`: `language`, `pack_id`, `shared_with_parent`, `generation_input`, `ai_provider`, `ai_model`, `is_template`, `variant`, the video job columns, `approved_by`, `approved_at`.
  - Additions to `content_feedback`: `observation_id`.
  - Additions to `development_reviews`: `baseline_validation`, `understanding`, `ai_suggested`.
- **Integrity rules:**
  - Status, role and type columns are TEXT + CHECK.
  - Users are deactivated, never deleted.
  - Child-owned rows use `ON DELETE CASCADE`.
  - A `BEFORE UPDATE` trigger makes `baselines` immutable.
  - The 3-active-focus rule is enforced with `SELECT … FOR UPDATE` on the child row.
- **JSONB shapes:** every JSONB column has a Pydantic model with `schema_version`. Items carry `sources`, `added_by` and `added_at` for spec §12 "who entered each piece".
- **Test databases:** `kidsphere_test_<run>` is created and dropped per CI run, plus a persistent `kidsphere_preview`. The prod admin is imported (email, name, bcrypt hash) with `app.cli import-users`.

## API CHANGES
- **Removed:** all 68 Next route handlers, in these groups:
  - `admin/{organizations,kindergartens,templates,audit,ai}`
  - `auth/{forgot,reset}`
  - `child-mode/*`, `play/*`, `locale`
  - `children/[id]/{consents,media,messages,parent-questionnaires,profile-attributes,progress,content-from-template,goals}`
  - `goals/*`, `content/[id]/{submit,publish,narration,template}`
  - `media/*`, `narrations/*`, `notifications`, `library`, `weekly-plans/*`
- **Added:** the FastAPI REST API under `/api`, implementing spec §29 verbatim. It adds:
  - auth (`/auth/login`, `/auth/logout`, `/me`, `/me/password`)
  - `/options` and `/health`
  - admin routes (`/users`, `/classes`, `/children/{id}/parents`)
  - the photo route (`/children/{id}/photo`)
  - the profile route (`GET/PATCH /children/{id}/profile`)
  - content actions (`regenerate`, `share`, `archive`, `DELETE` for drafts only)
  - `development-reviews/suggest`, which saves nothing
  - `content/{id}/video-job`

  The error envelope and codes are kept. The full table is in the architecture section.

## UI CHANGES
- **Teacher home** is the child list: cards, a class filter, and the two strips. **Add Child** opens the 7-step wizard (step 1 shows a live age and an optional photo).
- **Child profile** follows spec §13 (⭐ strengths, interest icons, ✓ what helps, numbered focus areas, latest quote, last observation date, 4 buttons) and has 4 tabs.
- **Quick observation** takes under 30 seconds and has a centre ＋ button in the phone bottom bar. The focus-areas page enforces the 3-active limit.
- **Timeline** is chronological and has no charts or counts.
- **Create content** goes Mode → focus area or strength → type (Story / Video / Game / Activity / Small pack). The review screen offers Preview / Edit / Approve / Regenerate / Delete and shows a "Template-generated" badge when no AI key is set. A full-screen Present view and a one-tap feedback dialog follow.
- **Development** shows Baseline and Current Understanding side by side, with validation chips. The review screen shows 5 status chips per focus area.
- **Admin:** Users, Classes and Parent links. **Parent:** home, onboarding wizard and shared content.
- **RTL and layout:** true RTL via `<html dir>`, logical utilities, `rtl:` icon flips and `dir="auto"` for user text. Touch targets are at least 44px. The layout is responsive for phone, tablet and desktop.

## Risks & open questions
- **Risk: testing only on the production host.** Everything is built and tested on the production host, which has about 1.4GB free and also runs kortex-messaging. CI runs are serialized with `flock`, Node is capped at 768MB, and nothing runs as root or touches prod data.
- **Risk: same-wave contracts.** Frontend and backend packages in the same wave depend on the documented API contracts. Drift shows up only at the wave merge; the CI harness and the preview catch it.
- **Risk: AI latency and key.** AI calls are synchronous: up to 60s per call with one retry and one repair, then a template fallback. With no key, the template content is what users get, so its quality is fixed by the phrase tables.
- **Risk: banned-term matching in Arabic and Hebrew.** Matching with prefixes will produce some false positives and misses. Expect allow-list iteration.
- **Risk: privacy.** Spec §17 adds recent observations to the AI input, reversing the old PRIVACY.md rule. Mitigations: names masked, at most 5 observations of at most 300 characters each, health answers never sent.
- **Q1: one support scale.** Wizard step 5, quick observations and feedback all use one scale (`independent` / `some_support` / `significant_support` / `not_observed`), so results can be compared with the baseline. Does the PO accept "Difficult" being stored as `significant_support`?
- **Q2: extra tables.** Does the PO accept the 5 supporting tables and `children.class_id` in place of a `kindergarten` text column?
- **Q3: what parents see.** As designed, a parent sees child basics, their own answers and shared approved content only. Should parents also see strengths and the current focus areas?
- **Q4: parent accounts.** Admins create parent accounts and link them to children. Should teachers be able to invite parents?
- **Q5: late parent answers.** If parent answers arrive after the teacher has created the baseline, they update the profile only. Should they create a new baseline row instead?
- **Q6: health and safety field.** Should parent step 6 have an optional `safety_note` (allergies; staff-only, never sent to AI), or should it be dropped under the minimal-data rule?
- **Q7: digits and wording.** Arabic digits default to Western (`ar-u-nu-latn`). Hebrew uses slash-gendered labels. New ar/he labels need review by native speakers.
- **Q8: Claude fallback.** Server-side refusal fallback (`fallbacks: "default"`) is on by default, so a declined request may be answered by another Claude model. It can be turned off with `AI_SERVER_FALLBACK=false`.
- **Q9: earlier cutover.** Production holds no real data, so cutover could happen right after wave 2 if the PO wants to test on the real domain sooner.
- **Q10: commit the spec.** `docs/mvp-refocus/` is not committed yet; commit it before wave 1. Importing answers from the live survey (`C:/projects/survey-src`) is out of MVP scope.