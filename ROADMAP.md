# Roadmap

## Implemented MVP

- Auth (sessions, roles, password reset, rate limiting), multi-tenant hierarchy, server-side permission matrix, audit log
- Arabic / Hebrew (RTL) and English (LTR) UI with independent content language; locale switching
- Parent portal: onboarding, "Get to Know My Child" (14 sections, save & resume, sensitive answers protected), child overview (strengths first), shared focus and home activities, stories, messages to teacher, family characters with granular consent and revocation, account
- Teacher workspace: dashboard (review queue, review dates, drafts, not-observed, this week, recent progress), classes, child cards, child overview, parent insight, Quick & Full observations (with dictation), Child Understanding Profile with provenance and confirmation, goals (max 3), Generation Studio, content review/edit/regenerate/approve/publish, narration recording, child preview, weekly planner, content library with templates, progress, outcomes
- Child experience: locked child mode with PIN exit, picture home, story player with choices, visual routines, choice/matching activities, approved narration with TTS fallback
- Administration: metrics, organizations, kindergartens, classes, children, users, assignments, languages, settings (branding, consent configuration, AI), templates, permissions matrix, AI status and request log, audit log
- AI: provider abstraction (Claude, OpenAI, DEMO), minimal context builder, structured validation with repair, child-safety checks, metadata-only logging
- Storage abstraction (local / S3), private authorized media
- Tests: 51 unit, 30 integration (PostgreSQL), 3 Playwright E2E; seed with the full Adam scenario
- Deployment scripts for Ubuntu (nginx, systemd, certbot)

## Next stage

- Scheduled retention/deletion job and per-organization retention settings; data export for families
- SMTP/API mail transport and notification e-mails (password reset, questionnaire reminders)
- Image-generation provider behind the existing `visualPrompt` field, using consented character assets
- Server-side text-to-speech provider (narration cache per scene/language)
- Nonce-based CSP (remove `'unsafe-inline'` for scripts)
- Redis-backed rate limiting and sessions cache for multi-instance deployments
- Subdomain routing per organization (`<slug>.kidsphere.app`) using `Organization.subdomain`
- Goal review workflow (review meeting notes, extend/close with summary)
- Offline-capable child player (PWA) for unreliable kindergarten Wi-Fi
- Bulk import of classes/children/parents (CSV)
- Parent ↔ teacher two-way messaging threads

## Optional integrations

- SSO (Google Workspace / Microsoft Entra) for staff
- MDM/kiosk profiles for school tablets (see `docs/kiosk.md`)
- External analytics sink (receives only sanitized events)
- Additional UI languages (e.g. Russian, Amharic) — add to `LOCALES` and translate
