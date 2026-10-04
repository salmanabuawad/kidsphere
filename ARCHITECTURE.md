# Kidsphere architecture

## Overview

A single Next.js 16 (App Router) application with a clean internal split, designed so the server layer can later move into separate services:

```
src/
  app/                      Routes: pages (Server Components) + REST API (route handlers)
    (auth)/                 login, forgot/reset password
    teacher/  parent/  admin/  play/      the four experiences
    api/                    REST endpoints — thin: parse → authorize (service) → respond
  components/ui, layout/    Design system (accessible, RTL-safe logical CSS)
  features/                 Domain modules: pure rules + UI per domain
    child-understanding/    vocabulary, deterministic engine (confidence, candidates)
    questionnaires/         "Get to Know My Child" definition, wizard, answer view
    observations/           observation model, Quick & Full forms
    goals/  content/  consent/  media/  player/  weekly-plans/  admin/  child-mode/
  server/
    services/               Business logic. Every function takes an Actor and authorizes.
    validators/             Zod schemas for every API input (strict objects)
  lib/
    auth/                   sessions, password/PIN hashing, actor, cookies
    permissions/            the ONLY place that decides access (tenant + role)
    ai/                     provider abstraction, prompts, schemas, DEMO engine
    storage/                local filesystem / S3-compatible private storage
    i18n/                   locales, dictionaries (ar/he/en), RTL helpers
    audit/  analytics/  db.ts  errors.ts  api.ts  route.ts  mailer.ts
  proxy.ts                  coarse routing guard + child-mode device lock
prisma/                     schema, migrations, seed
tests/                      unit, integration (real PostgreSQL), e2e (Playwright)
deploy/                     Ubuntu provisioning, nginx, systemd, remote deploy
```

## Request flow

```
Browser ─► proxy.ts (child-mode lock, login redirect)
        ─► page (Server Component) ──► service(actor, …) ──► permissions ──► Prisma
        ─► /api/... route ─► authed() wrapper: same-origin check → requireActor(roles)
                              → Zod parse → service(actor, …) → JSON / typed error
```

- Pages call services directly (no HTTP hop); client components call the REST API.
- Errors are `AppError(code)` → JSON `{error:{code,message}}` with the right status; the UI translates the code. Stack traces never reach clients.

## Auth model

- Email + password (bcrypt, cost 12). Database sessions: a random 256-bit token in an `httpOnly`, `SameSite=Lax` cookie; only its SHA-256 hash is stored.
- Login rate limiting, constant-work password check, audited success/failure.
- Password reset: one-time hashed token (1 h) delivered through the `mailer` abstraction (dev: server console).
- Roles: `SUPER_ADMIN`, `ORGANIZATION_ADMIN`, `KINDERGARTEN_ADMIN`, `TEACHER`, `PARENT`. Admins can only grant roles below their own. Users cannot change their own role (strict schemas reject unknown fields).
- **Children have no accounts.** An adult launches _child mode_ with a 4–6 digit PIN. The device then carries a child-session cookie; `getActor()` treats the adult session as absent and `proxy.ts` confines the browser to `/play` and `/api/play/*`. Exiting needs the PIN (lockout after 5 failures).

## Tenant isolation

- Every child/family table carries `organizationId`.
- `lib/permissions` builds a Prisma `where` scope per actor (`childScopeWhere`, `classScopeWhere`) and **combines it with the ID in the same query**. A foreign ID is indistinguishable from a missing one (404).
- Role/action matrix (`canPerform`): `view`, `viewInternal`, `viewSensitive`, `observe`, `plan`, `parentContribute`, `manage`.
- UI hiding is never the protection — every service re-checks. Integration tests try cross-tenant ID guessing for every role.
- Subdomain-per-tenant is prepared (`Organization.subdomain`); local development uses one host.

## Child Understanding Engine

1. **Inputs → candidates (pure, deterministic)** — `features/child-understanding/engine.ts` maps questionnaire answers and observation facts to normalized `{category, value}` pairs from a fixed vocabulary. Free text and health answers never become attributes.
2. **Apply with provenance** — `services/profile.applyCandidates` upserts the attribute, attaches evidence `(sourceType, sourceId)` idempotently, and recomputes:
   - `REPORTED` single parent/teacher report · `OBSERVED` direct observation · `CORROBORATED` parent + teacher, or ≥ 2 independent observations/outcomes · `EMERGING` pending · `RETIRED`.
3. **Pending items** — teacher "possible patterns" and AI suggestions create `PENDING_CONFIRMATION/EMERGING` attributes. They are excluded from goals and from AI context until a teacher confirms. Parent/AI evidence never activates them; retire/reject is never reversed automatically.

## AI integration

```
ContentGenerationContextBuilder ──► GenerationContext (minimal)
          │                                   │
          ▼                                   ▼
  AIProvider.generateStructuredContent(schema, validate)
     ├─ AnthropicProvider (SDK, output_config json_schema, refusal fallbacks)
     ├─ OpenAIProvider   (json_schema response_format)
     └─ DemoProvider     (deterministic, offline, labelled DEMO)
          │
          ▼  Zod parse + childSafetyIssues() → repair once → else AI_INVALID_OUTPUT
```

- Provider chosen by organization override → `AI_DEFAULT_PROVIDER` → first configured → DEMO (dev only unless allowed).
- The context builder reads only: display name, age band, the active goal, ACTIVE interests/strengths/supports/triggers (limited to 2/2/3/3), consented characters (as relation labels such as "Mom"), format, language, duration, theme, difficulty and an optional teacher instruction.
- Output schemas per content kind (`story`, `routine`, `activity`, `guide`) and semantic safety checks: no links, no deficit or diagnostic words in child-facing text, valid choice graph, an expected option in every activity round.
- `AIRequestLog` stores provider, model, operation, tokens, duration, success/repaired/error code — never prompts or outputs.

## Content lifecycle

```
generate ─► DRAFT ─► TEACHER_REVIEW ─► APPROVED ─► PUBLISHED ─► ARCHIVED
              ▲            │                │           │
              └── edit / regenerate (any state → DRAFT, narration un-approved)
```

- `features/content/workflow.ts` is the single state machine; `isVisibleToChild()` is true only for `PUBLISHED`.
- Approve/publish re-validate the exact current version and re-check character consent.
- Optimistic concurrency: every edit carries `revision`; stale writes get `STALE_EDIT` (409).
- Every action is written to `ContentApproval` and `AuditLog`.
- Templates store `{{child}}` placeholders and never a child's data; instantiating fills only the display name.

## Media, consent and narration

- `MediaAsset` (opaque storage key, never sent to clients) and `MediaConsent` (who, purposes, content types, granted/revoked) are separate tables.
- Bytes are served only through authorized routes (`/api/media/:id/file`, `/api/play/media/:id`, narration equivalents) with `Cache-Control: private, no-store`. Staff and children need a currently granted consent; children additionally need the asset to be used in their own published content.
- Uploads are type-checked by magic bytes and size-limited.
- Teacher narration is recorded in the browser (MediaRecorder) or uploaded; it is approved together with the content. The player falls back to the browser's speech synthesis (TTS architecture point: `useNarration`).

## Internationalization

- Locale cookie → user preference → `DEFAULT_LOCALE`; `<html lang dir>` set server-side, so RTL is document-level.
- UI strings in typed dictionaries (`ar.ts`, `he.ts` must match `en.ts`); domain vocabulary and questionnaire/observation definitions carry `{en, ar, he}` labels. Adding a locale = add it to `LOCALES` and let TypeScript list every missing label.
- The child player uses the **content** language for direction, independent of the adult's UI language. Child mode itself speaks the child's primary language.
- Layout uses logical properties (`ms/me/ps/pe/start/end`) and mirrored directional icons.

## Observability & analytics

- `AuditLog`: actor, role, tenant, action, object, timestamp and primitive metadata only.
- `lib/analytics`: closed set of event names, whitelisted primitive properties; feeds the admin metrics (questionnaire completion, observation frequency, Quick Observation < 60 s, approval/regeneration rates, outcomes, languages, content types).
