# Kidsphere

> The teacher decides **what** to work on. Kidsphere adapts **how** the child experiences it.

Kidsphere is a secure educational platform for children aged ~3–5. It connects kindergarten teachers, parents and children:

1. **Parents** tell us who the child is ("Get to Know My Child").
2. **Teachers** observe the child naturally (30-second Quick Observations or a full professional form).
3. **Kidsphere** combines permitted evidence into a **Child Understanding Profile** with provenance and confidence, and helps the teacher create personalized stories, routines and activities. **Nothing reaches a child without teacher approval.**

Kidsphere is **not** a diagnostic tool. It never labels, diagnoses or scores children.

- Arabic (RTL), Hebrew (RTL) and English (LTR), with a content language independent of the UI language
- Multi-tenant: Organization → Kindergarten → Class → Teacher → Children ← Parents
- Pluggable AI (Anthropic Claude, OpenAI) with a deterministic **DEMO** engine when no key is configured

See [ARCHITECTURE.md](ARCHITECTURE.md), [PRIVACY.md](PRIVACY.md), [DECISIONS.md](DECISIONS.md) and [ROADMAP.md](ROADMAP.md).

---

## Prerequisites

- **Node.js 22+** and npm 10+
- **PostgreSQL 15+** — either:
  - the built-in embedded server (`npm run db:start`, no Docker or install required), or
  - Docker: `docker compose up -d` (see `docker-compose.yml`), or
  - any PostgreSQL you point `DATABASE_URL` at (database must be UTF-8)

## Installation

```bash
npm install
cp .env.example .env
```

## Environment variables

| Variable                               | Purpose                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL`                         | PostgreSQL connection (UTF-8 database).                                  |
| `TEST_DATABASE_URL`                    | Separate database for integration tests (wiped by tests).                |
| `AUTH_SECRET`                          | ≥ 32 random characters.                                                  |
| `APP_URL`                              | Public URL (used in password-reset links).                               |
| `COOKIE_SECURE`                        | `true` behind HTTPS.                                                     |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Claude provider (default model `claude-opus-5-5`).                       |
| `OPENAI_API_KEY`, `OPENAI_MODEL`       | OpenAI provider.                                                         |
| `AI_DEFAULT_PROVIDER`                  | `anthropic` \| `openai` \| `demo` — empty = first configured, else DEMO. |
| `ALLOW_DEMO_AI_IN_PRODUCTION`          | DEMO engine is refused in production unless `true`.                      |
| `STORAGE_DRIVER`                       | `local` (dev) or `s3` (S3-compatible, private bucket).                   |
| `STORAGE_LOCAL_DIR`, `S3_*`            | Storage settings.                                                        |
| `DEFAULT_LOCALE`                       | `ar` \| `he` \| `en`.                                                    |

**AI keys** go in `.env` (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`). Without a key the app runs on the DEMO engine — every item it creates is labelled **DEMO**.

## Database setup, migrations and seed

```bash
npm run db:start      # terminal 1 — embedded PostgreSQL on :5433 (keep running)
npm run db:migrate    # apply migrations (prisma migrate dev)
npm run db:seed       # demo tenant incl. the full "Adam" scenario
```

`npm run db:reset` wipes, migrates and re-seeds. In production use `npm run db:deploy` (`prisma migrate deploy`).

## Start development

```bash
npm run dev           # http://localhost:3000
```

### Demo accounts (development only)

Password for all: **`Kidsphere-Dev-2026!`**

| Email                             | Role                                                 |
| --------------------------------- | ---------------------------------------------------- |
| `teacher@kidsphere.local`         | Teacher (Sunflowers class — Adam, Yosef, Maya, Sami) |
| `parent@kidsphere.local`          | Parent of Adam and Lina                              |
| `admin@kidsphere.local`           | Organization admin                                   |
| `kgadmin@kidsphere.local`         | Kindergarten admin                                   |
| `superadmin@kidsphere.local`      | Super admin                                          |
| `teacher2@`, `parent2@`           | Second class / family                                |
| `other-teacher@`, `other-parent@` | A **different organization** (tenant-isolation demo) |

Never use these defaults in production — `deploy/install.sh` seeds servers with a random password.

### The Adam scenario (seeded, runnable from the UI)

Teacher → _My classes_ → _Sunflowers_ → **Adam**: strengths (persistence), interests (vehicles, building — _corroborated_), what helps (visual countdown, advance warning), the goal _"Move from a preferred activity to group time after one reminder and a visual cue"_, a **published** Arabic story _"Adam and the Excavator's Last Two Scoops"_, an English **draft**, a recorded **HELPED** outcome and this week's plan. _Start child mode_ (any 4–6 digit PIN) to see what Adam sees.

## Tests

```bash
npm test                  # unit + integration (needs the database running)
npm run test:unit         # pure logic only
npm run test:integration  # services against TEST_DATABASE_URL
npm run test:e2e          # Playwright (first time: npx playwright install chromium)
```

E2E runs its own server on :3100 against a dedicated `ks_e2e` database that it wipes and seeds.

## Quality

```bash
npm run lint
npm run typecheck
npm run build
```

## Production

- `npm run build` produces a standalone server (`.next/standalone/server.js`); copy `.next/static` and `public` next to it (done by `deploy/deploy.sh`).
- Set `COOKIE_SECURE=true`, a strong `AUTH_SECRET`, a real AI key and `STORAGE_DRIVER=s3` with a **private** bucket.
- Run `npm run db:deploy` on every release.
- Ubuntu + nginx + systemd scripts live in [`deploy/`](deploy/):
  ```bash
  SSH_HOST=<server> FIRST_INSTALL=1 bash deploy/remote-deploy.sh   # first time
  SSH_HOST=<server> bash deploy/remote-deploy.sh                    # updates
  ```
- Child-device kiosk: Kidsphere locks the browser session to the child player, but OS-level lockdown must be configured on the device — see [docs/kiosk.md](docs/kiosk.md).
