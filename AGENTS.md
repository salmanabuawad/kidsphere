# Guidance for coding agents

KidSphere is a FastAPI + PostgreSQL backend (`backend/`) and a Vite React TypeScript SPA (`frontend/`), deployed with plain scripts (`deploy/`). Before changing anything, read [README.md](README.md) and [ARCHITECTURE.md](ARCHITECTURE.md).

- **Product rules:** [docs/mvp-refocus/SPEC.md](docs/mvp-refocus/SPEC.md), and [docs/mvp-refocus/PLAN-ADJUSTMENTS.md](docs/mvp-refocus/PLAN-ADJUSTMENTS.md), which is binding.
- **Wording:** [docs/terminology.md](docs/terminology.md).
- **API and UI conventions:** [docs/mvp-refocus/CONTRACTS.md](docs/mvp-refocus/CONTRACTS.md).

When unsure, choose the simpler implementation that serves the loop Know → Focus → Create → Experience → Observe → Learn → Adapt.

## Hard rules

- **Never run the stack locally.** Do not install Python or Node packages locally, start servers or use Docker. Do not add Docker, compose files, Redis, Celery, queues, workers or new services.
- **Run every test on the server** with `bash deploy/ci/remote-test.sh <label> [backend|frontend|all] [pytest args]`, where `<label>` is `[a-z0-9-]+`. The full suite must stay green. Add or update tests with every change.
- **Never use clinical or diagnostic terms or labels** (diagnosis, disorder, ADHD, autism, deficit, …, and their ar/he equivalents). Never use scores, points, percentages or rankings. This applies to UI strings, AI prompts, AI output, API payloads and seed data. Use the preferred terms in `docs/terminology.md` (Strengths, Interests, Current Focus, Areas for Support, Observations, Development).
- **Child data reaches the AI only through `app/ai/context.py`.** It is called only from the backend. Do not add fields to `AIContext` without updating [PRIVACY.md](PRIVACY.md). Never send the birth date, surname, photo, parent contact or free-text parent answers.
- **The AI never writes the profile.** Generated content is always a draft. Only a teacher-saved development review changes `current_understanding`.
- **Never UPDATE or DELETE baselines.** A DB trigger enforces this; insert a new one instead. Never bypass the 3-active-focus row lock.
- **No secrets in the repo or the frontend.** Never put free text about a child into audit metadata or logs.
- **Use LF line endings.** `.gitattributes` enforces `eol=lf`.
- **Do not commit or deploy unless asked.** `deploy/remote-deploy.sh` ships only the committed `HEAD`.

## Where things live

| Need | Place |
|---|---|
| A new endpoint | `backend/app/routers/<area>.py` (auto-included under `/api`) → `backend/app/services/<area>.py` |
| A request body | `backend/app/schemas/` (extend `StrictModel`) |
| A table or column | `backend/app/models.py` plus a new hand-written revision in `backend/migrations/versions/` (`0002_...`, no autogenerate). `tests/test_migrations.py` checks that they match. |
| Option lists and banned terms | `backend/app/data/options.json` (en/ar/he labels; see docs/terminology.md) |
| AI context, prompts and output | `backend/app/ai/` (`context.py`, `prompts.py`, `schemas.py`, `safety.py`, `service.py`, `template_provider.py` + `templates/*.json`) |
| Test fixtures | `backend/tests/conftest.py` (users and clients per role, classes, children) |
| A new page | `frontend/src/features/<name>/routes.tsx` (exports `routes: AppRoute[]`); paths in `frontend/src/lib/paths.ts` |
| UI primitives | `frontend/src/components/ui` (Button, Card, Chip, Field, Dialog, …) |
| UI text | `frontend/src/i18n/messages/{en,ar,he}/<namespace>.json` |

## Backend conventions

- **Routers:** `router = APIRouter(tags=[...])`, full paths with no prefix, sync `def` endpoints. A router stays thin and calls one service function.
- **Services:** plain functions such as `fn(db, user, ...)`. No classes, base classes, repositories, factories or event buses. Commit once at the end of the unit of work (`db.commit()`).
- **Errors:** `raise AppError("CODE", message=None, details=None, status=None)`. The codes are listed in `app/errors.py`. Never return a stack trace.
- **Access:** always go through `app.access`: `get_child_or_404(db, user, child_id, write=..., lock=...)`, `get_child_row_or_404(...)`, `visible_children(user)` and `scoped_child_ids(user)`. An id out of scope returns 404; a role failure returns 403. Use `lock=True` for anything that can add an active focus area.
- **Audit:** call `audit(db, actor, "area.verb", object_type, object_id, child_id=..., **meta)` for every important change. Meta holds only primitives or lists of primitives (ids, keys, field names).
- **Models:** there are no ORM relationships, so write explicit `select()`s. A change to a JSONB value is not tracked: assign a new value or call `flag_modified`. Enumerations are TEXT + CHECK, mirrored by `Literal`s in `app/schemas/common.py`.
- **Vocabulary:** store keys (`{"key"}` or `{"custom"}`), never labels. Validate with `app.vocab`.
- **AI:** use `app.ai` (`build_context`, `generate`, `suggest_understanding_result`). Every new output kind needs a Pydantic model, safety fields and template-provider output in all three languages, with tests. Tests run with an empty `ANTHROPIC_API_KEY`; to test Claude, pass a fake `client=`.
- **Settings:** `from app.config import settings`.

## Frontend conventions

- **Data:** `api()`, `useFetch`, `useAction` and `toast` from `@/lib`. There is no global store. Option labels come from `useOptions()` (`GET /api/options`); never copy them into the message files.
- **i18n:**
  - Every UI string is a key `<ns>.<path>`, present with identical keys in en, ar and he (a parity test checks this).
  - Placeholders are `{var}`, and plurals use the `_one/_two/_few/_many/_other` suffixes.
  - The banned-terms test scans every message file against `banned_terms` and `/\d+\s*%|\bscore\b|\bpoints\b/i`. In Arabic, avoid "نقاط" (points); write "مواطن القوة" or the exact phrase "نقاط القوة".
- **RTL:**
  - Use only logical Tailwind utilities (`ms-/me-/ps-/pe-/start-/end-/text-start/border-s/border-e/rounded-s/rounded-e`). A test bans `ml-/mr-/pl-/pr-/left-/right-/text-left/text-right/rounded-l/r/border-l/r`.
  - Flip directional icons with `rtl:`.
  - Put `dir="auto"` on user and AI text, and `dir="ltr"` on e-mail and password inputs. The player and the games follow the content's language.
- **Games:** tap only, with no drag library, no scores or "wrong answer" wording, and gentle feedback. The AI provides data only; never generate or run AI code.
- **CSP:** the CSP is `script-src 'self'`, so no inline scripts are allowed (the build checks `index.html`).
