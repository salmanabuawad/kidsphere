# Contracts for feature packages (from WP-02 backend core and WP-03 frontend foundation)

Read the code when in doubt — this is a map, not a substitute.

## Backend (backend/)
- **Tests**: `bash deploy/ci/remote-test.sh <label> backend [pytest args]` runs on the Ubuntu server against DB `kidsphere_test`. No local Python. The full suite must stay green.
- **Routers**: every `app/routers/*.py` exports `router = APIRouter(tags=[...])` with full paths after `/api` and no prefix (e.g. `@router.get("/children/{child_id}/timeline")`). Any module in `app/routers/` is included automatically. Stubs already exist for users, classes, parents, children, profiles, baselines, focus_areas, observations, timeline, content, feedback, reviews: fill in yours. Endpoints are sync `def`. Call `db.commit()` once at the end of the unit of work.
- **Deps** (`from app.deps import ...`):
  - `DB` is the Session.
  - `CurrentUser` raises 401 UNAUTHENTICATED.
  - `StaffUser` (admin|teacher) and `AdminUser` raise 403 FORBIDDEN.
  - `require_roles(*roles)`.
  - `request.state.session_id`.
- **Errors**: `raise AppError("CODE", message=None, details=None, status=None)`.
  - Codes: UNAUTHENTICATED, INVALID_CREDENTIALS, FORBIDDEN, NOT_FOUND, VALIDATION, DUPLICATE, CONFLICT, FOCUS_LIMIT, INVALID_TRANSITION, UNSAFE_CONTENT (422), UPLOAD_FAILED, RATE_LIMITED, AI_UNAVAILABLE, INTERNAL.
  - A body validation error → 400 VALIDATION, `details=[{path, message}]`.
  - Unique violation → 409 DUPLICATE. FK/check/not-null violations → 400.
- **Access** (`app.access`):
  - `child_scope(user)` (predicate on Child), `visible_children(user, include_archived=False)` → `select(Child)`, `scoped_child_ids(user)` (subquery).
  - `get_child_or_404(db, user, child_id, write=False, lock=False, include_archived=False)`:
    - out of scope, unknown or malformed id → 404
    - a parent with `write=True` → 403
    - `lock=True` → SELECT … FOR UPDATE (use it for the 3-active-focus rule)
  - `get_child_row_or_404(db, user, Model, row_id, write=False, lock=False)` works for any model with `child_id`.
  - Archived children are visible to admins only.
- **Audit**: `audit(db, actor_or_None, "action", "object_type", object_id, child_id=None, **meta)`. Meta values are primitives or lists of primitives only. It adds the row; the caller commits.
- **Sessions** (`app.sessions`): `revoke_user_sessions(db, user_id, keep_session_id=None)` — call on role change, deactivation and admin password set. `create_session`, `delete_session`, `utcnow()`.
- **Security** (`app.security`): `hash_password`, `verify_password`, `DUMMY_HASH`, `new_token`, `hash_token`.
- **Vocab** (`app.vocab`): `lists()`, `keys(list)`, `is_valid(list,key)`, `item(list,key)`, `label(list,key,lang)`, `banned_terms()`. List names are in `backend/app/data/options.json`; see docs/terminology.md.
- **Settings**: `from app.config import settings` (lower-case attributes: `database_url`, `upload_dir` (Path), `anthropic_api_key`, `anthropic_model`, `ai_effort`, `ai_timeout_seconds`, `video_provider`, `default_locale`, …).
- **Schemas**: `app/schemas/common.py` has `StrictModel` (extra forbidden, strings stripped) and the Literals Role, Language, Gender, SupportLevel, FocusStatus, Mode, ContentType, ContentStatus, FeedbackResult. `user_out(user)` is also there.
- **Models** (`app/models.py`):
  - Tables: User, UserSession, Class, ClassTeacher, Child, ChildParent, ChildProfile, Baseline, FocusArea, GeneratedContent, Observation, ContentFeedback, DevelopmentReview, AuditLog (`.meta` maps to the column `metadata`).
  - No ORM relationships: write explicit `select()`s.
  - JSONB mutation is not tracked: assign a new value or call `flag_modified`.
  - Value tuples such as `SUPPORT_LEVEL_VALUES` and `CONTENT_STATUS_VALUES`.
  - UUIDs get a Python-side default.
  - `observations.observation` is nullable only for `source='content_feedback'`.
  - The `baselines` trigger rejects UPDATE and direct DELETE.
- **conftest fixtures**:
  - `TEST_PASSWORD`, `db` (call `db.expire_all()` after API calls).
  - `make_user(role, name, email, language='en', is_active, password)`.
  - Users: `admin`, `teacher`, `other_teacher`, `parent`, `other_parent`.
  - `make_class(name, kindergarten='Sunflower KG', teachers=())`; `klass` (teacher), `other_class` (other_teacher).
  - `make_child(class_=None, parents=(), name='Adam', birth_date=date(2022,8,5), with_profile=True, created_by=None, **fields)`.
  - `child` (Adam, klass, parent); `other_child` (Maya, other_class, other_parent).
  - Clients: `client` (anonymous), `client_for(user)`, `admin_client`, `teacher_client`, `other_teacher_client`, `parent_client`, `other_parent_client`.
  - `sample_options`; `upload_dir` is set to tmp per test.
- **AI** (`app/ai`, WP-09, in progress): see its `__init__.py` once it lands. Callers store `generation_input` (the AIContext JSON), `ai_provider`, `ai_model` and `is_template` on `generated_content`.

## Frontend (frontend/)
- **Tests**: `bash deploy/ci/remote-test.sh <label> frontend` runs typecheck, eslint, vitest and the vite build on the server. No local node. The `@/` alias points to `src/`.
- **Routes**: create `src/features/<name>/routes.tsx` exporting `export const routes: AppRoute[]` (type from `@/lib/routing`):
  - Fields: `{ path, element, roles?, public?, layout?: 'shell'|'bare', nav?: { labelKey, icon (lucide), order, roles?, action?, to? } }`.
  - `nav.action: true` marks the phone bottom-bar centre button; use it only for `/observe`.
  - Nav label keys already in `nav.json`: `nav.children`, `nav.observe`, `nav.users`, `nav.classes`, `nav.parentHome`, `nav.account`, `nav.home`.
- **Paths** (`@/lib/paths`): `paths.child(id)`, `childEdit(id, step)`, `childFocus`, `childObserve`, `observe`, `childTimeline`, `childContent`, `newContent(id, query?)`, `content`, `presentContent`, `pack(packId)`, `childDevelopment`, `newReview`, `adminUsers`, `adminClasses`, `adminChildParents(id)`, `parentHome`, `parentOnboarding`, `parentChildContent`, `parentContent`, `children`, `newChild`. `routePatterns.*` holds the router patterns.
- **i18n**:
  - `const { t, locale, dir, intlLocale, setLocale, has } = useI18n()`.
  - Keys are `<ns>.<path>`. Placeholders use `{var}`. Plurals use `count` with `_one/_two/_few/_many/_other`.
  - Add your namespace as `src/i18n/messages/{en,ar,he}/<ns>.json` with identical keys in all three; a parity test and a banned-terms test enforce this.
  - No physical-direction Tailwind classes (ml-/mr-/pl-/pr-/left-/right-/text-left/text-right/rounded-l/r/border-l/r): a test bans them.
  - Arabic: "نقاط" (points) is banned. Avoid inflected forms of "نقاط القوة"; use "مواطن القوة" or the exact phrase.
- **Data**:
  - `api<T>(url, {method, body, form, query, signal})` throws `ApiError {code, message, status, details}`. Helpers: `isApiError`, `fieldErrors(e)`, `withQuery`.
  - `useFetch<T>(url|null, query?)` → `{data, error, loading, reload, setData}`.
  - `useAction()` → `{pending, run(fn, {success?, onSuccess?, onError?, errorToast?})}`.
  - `toast(msg, 'success'|'error')`. `useAuth()`, `useUser()`.
- **Options**: `useOptions()` → `{list(name), item(name,key), optionLabel(name,key), labelOf(item), ready}`.
- **Format**: `useFormat()` → `{formatAge, formatDate, formatDateTime, formatRelativeDays, formatNumber}`.
- **UI** (`@/components/ui`):
  - `Button` (variant primary|secondary|outline|ghost|danger|soft; size sm|md|lg|xl; loading; icon), `ButtonLink`, `IconButton` (label required).
  - `Card`, `CardHeader` (title, description, action, icon), `CardBody`, `CardFooter`.
  - `Badge` and `Chip` (tone strength|interest|helps|attention|danger|brand|neutral). `ToggleChip` (selected, onToggle, icon, tone).
  - `Field` (render-prop), `Label`, `Input`, `Textarea`, `Select`, `Checkbox`.
  - `Dialog` (bottom sheet on phones).
  - `EmptyState`, `Alert`, `Spinner`, `FullPageSpinner`, `Skeleton`, `PageSkeleton`.
  - `PageHeader` (title, description, actions, back:{to,label}, icon), `SectionTitle`, `TabNav`, `Tabs`, `Avatar`, `Table`.
- **Test utils**: `src/test/utils.tsx` provides `mockFetch` and `renderApp`.

## Ownership rule
Only touch the paths your package owns (docs/mvp-refocus/work-packages.json, adjusted by PLAN-ADJUSTMENTS.md). Do not git commit; the lead commits. LF line endings.
