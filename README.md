# KidSphere

KidSphere helps kindergarten teachers and parents understand each child (ages about 3 to 6). Together they choose up to three things to work on now, create personalised content that builds on what the child loves and is good at, and learn from what happens. Everything follows one loop:

**Know → Focus → Create → Experience → Observe → Learn → Adapt**

| Step | In the app |
|---|---|
| Know | The **Add Child** wizard has 7 short steps, and the teacher can switch between the parent's and the teacher's perspective. It creates an immutable **baseline** and a first **current understanding**. |
| Focus | Up to 3 active **Current Focus** areas. Each one has a plan with five steps: Strength → Need → Adaptation → What we will do → Follow-up. |
| Create | A story, real-world activity, digital game, video plan or small pack, made in **Strength Builder** or **Growth Support** mode. Everything starts as a draft. |
| Experience | The teacher reviews, edits and approves the draft, then presents it full screen or runs the activity. |
| Observe | One-tap feedback ("Worked well / Partly / Did not work") and quick observations that take under 30 seconds. |
| Learn | A chronological development timeline, and a development review that compares what was observed with the baseline. |
| Adapt | The teacher approves a new current understanding, and the next content builds on it. |

KidSphere is **not diagnostic**. It uses no labels, no clinical terms and no scores, points or percentages. AI output is always a draft for a teacher. Nothing changes the profile or reaches a child without a teacher's approval.

The UI is available in Arabic and Hebrew (true RTL) and English. Production runs at https://kids.kortexd.com.

## Stack

```
Browser ──HTTPS──▶ nginx ── /      ─▶ React static build  (/var/www/kidsphere/frontend/dist)
                         └─ /api/  ─▶ FastAPI (uvicorn on 127.0.0.1:3071, systemd)
                                          └─▶ PostgreSQL (normal Ubuntu service)
```

- **Backend:** Python, FastAPI (sync endpoints), SQLAlchemy 2 with psycopg 3, Alembic (migrations written by hand), Pydantic v2, bcrypt, Pillow and the `anthropic` SDK. Versions are pinned in `backend/requirements.txt`.
- **Frontend:** Vite, React 19, TypeScript, react-router 7, Tailwind CSS 4 and lucide-react.
- **Server:** one Ubuntu server running nginx, systemd and PostgreSQL. There is no Docker, no Redis and no queue or worker of any kind.

## Repository layout

```
backend/
  app/              main.py, config.py, models.py, access.py, audit.py, errors.py, ...
    routers/        thin REST modules (auto-included under /api)
    services/       business logic, plain functions
    schemas/        Pydantic request models
    ai/             context allow-list, prompts, Claude + template providers, safety
    data/options.json   the shared vocabulary (see docs/terminology.md)
    cli.py  dev_seed.py
  migrations/       Alembic (0001_initial = the whole schema)
  tests/            pytest (runs against PostgreSQL on the server)
frontend/
  src/features/     one folder per feature, each with routes.tsx
  src/components/   ui/ primitives, layout/ (AppShell)
  src/i18n/         messages/{en,ar,he}/<namespace>.json
  src/lib/          api client, hooks, paths, options, formatting
deploy/             install.sh, deploy.sh, remote-deploy.sh, deploy-kids.ps1, nginx/, systemd/, ci/
docs/               terminology.md, mvp-refocus/ (spec, binding plan adjustments, design)
```

The previous Next.js/Prisma app has been removed from the tree. It is kept in git history under the tag `legacy-nextjs`.

## Testing

Nothing runs locally: there is no local Python, Node or database. Tests run on the Ubuntu server:

```bash
bash deploy/ci/remote-test.sh <label> [backend|frontend|all] [extra pytest args...]

bash deploy/ci/remote-test.sh my-change all
bash deploy/ci/remote-test.sh my-change backend -k test_content -x
bash deploy/ci/remote-test.sh my-change frontend
```

- **Where to run it:** from Git Bash or any bash shell with SSH access to the server. `KS_HOST` and `KS_KEY` override the defaults in the script; the default key is `~/.ssh/kidsphere_deploy`.
- **Label:** use `[a-z0-9-]+`.
- **What is uploaded:** the working tree of `backend/`, `frontend/` and `deploy/`, meaning tracked and untracked files minus ignored ones. Uncommitted changes are therefore tested.
- **Backend:** pytest runs against the throwaway database `kidsphere_test`, with no AI key set.
- **Frontend:** runs `tsc`, eslint, vitest and `vite build`.
- **On the server:** runs are serialised with `flock` as the unprivileged user `kidsphere-ci`.

See [deploy/README.md](deploy/README.md#ci-runner) for details.

## Deploying

```bash
bash deploy/remote-deploy.sh             # deploy the committed HEAD
bash deploy/remote-deploy.sh --install   # first time: provision the server, then deploy
```

From PowerShell: `powershell -ExecutionPolicy Bypass -File deploy\deploy-kids.ps1 [-Install]`. This wraps the same script with Git Bash.

- **Committed code only.** The deploy uses `git archive HEAD`, so uncommitted changes are not deployed.
- **No tests.** Deploying does not rerun the tests; run `remote-test.sh` first.
- **What a deploy does:** it syncs the code, backs up the database, migrates, builds the frontend, restarts the API and runs a smoke test.

Server layout, rollback and logs are in [deploy/README.md](deploy/README.md).

## Useful commands (on the server)

```bash
cd /var/www/kidsphere/backend
sudo -u kidsphere-mvp venv/bin/python -m app.cli create-admin --email admin --name "Admin" [--language ar|he|en]
sudo -u kidsphere-mvp venv/bin/python -m app.cli set-password --email admin   # also ends that user's sessions
sudo -u kidsphere-mvp venv/bin/python -m app.cli import-users [--role admin] < users.jsonl
sudo -u kidsphere-mvp venv/bin/python -m app.cli audit --child <child-uuid> [--limit 200]
```

- **Passwords:** never passed as arguments. The CLI prompts for them twice, or reads the first line of stdin when stdin is not a terminal.
- **`--email`:** takes an e-mail address or a plain username.
- **`import-users`:** reads JSON lines `{"email", "name", "password_hash", "role"?, "language"?}` with existing bcrypt hashes (`$2a$`/`$2b$`). If any line is invalid, nothing is imported. Users that already exist are skipped.

`python -m app.dev_seed` creates demo data:

- the class "Butterflies"
- the users `demo-admin`, `demo-teacher`, `demo-parent` and `demo-parent-maya`, sharing one random password that is printed once
- **Adam** (spec §44) and **Maya** (spec §45), with profiles, baselines and observations

It refuses to run unless the database name ends in `_test` or `_preview` (or `KIDSPHERE_ALLOW_DEMO=1` is set). Never run it against the production database.

## Configuration and AI

The backend reads `backend/.env` (on the server: `/var/www/kidsphere/backend/.env`, mode 600). `deploy/install.sh` creates it from [backend/.env.example](backend/.env.example).

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | PostgreSQL URL. Plain `postgresql://` URLs are switched to psycopg 3. |
| `COOKIE_SECURE`, `SESSION_DAYS` | Session cookie `ks_session`: Secure flag, and lifetime (default 7 days). |
| `UPLOAD_DIR` | Child photos (`/var/www/kidsphere/uploads`), served only through the API. |
| `DEFAULT_LOCALE` | `ar`, `he` or `en` (default `ar`). |
| `ANTHROPIC_API_KEY` | **Empty means the built-in template provider.** No external AI call is made. |
| `ANTHROPIC_MODEL`, `AI_EFFORT`, `AI_TIMEOUT_SECONDS` | Claude settings: `claude-opus-5-5`, `medium`, `60`. |
| `VIDEO_PROVIDER` | `none`: a placeholder that produces only the video plan (script and scenes). |
| `LOG_LEVEL` | Default `info`. |
| `SERVE_STATIC_DIR` | Lets FastAPI serve a built SPA itself. Never set it in production, where nginx serves the SPA. |
| `OPTIONS_PATH` | Optional override for `app/data/options.json`. |
| `APP_URL` | The public URL. It is present in the file but not used by the code today. |

**AI providers:**

- **Without a key,** all content and development-review suggestions come from deterministic templates (`backend/app/ai/templates/*.json`) in ar, he and en. The UI marks them as template-generated.
- **With `ANTHROPIC_API_KEY` set,** the backend calls Claude (`claude-opus-5-5`) once per request and asks for structured JSON output.
- **Validation and fallback:** every result is validated and safety-checked. On any failure, the backend falls back to the templates, and the response carries a `fallback_reason`.

After you edit `.env`, run `systemctl restart kidsphere-mvp-api`. See [PRIVACY.md](PRIVACY.md) for exactly what is sent to the AI provider.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md): modules, tables, access rules, the API, the AI module and the frontend structure.
- [DECISIONS.md](DECISIONS.md): key decisions and why they were made.
- [ROADMAP.md](ROADMAP.md): what is done and what remains.
- [PRIVACY.md](PRIVACY.md): child data, access and what goes to the AI.
- [deploy/README.md](deploy/README.md): server layout, install, deploy, rollback, logs, CI and the legacy installs.
- [AGENTS.md](AGENTS.md): rules for coding agents working in this repository.
- [docs/terminology.md](docs/terminology.md): the vocabulary, the banned terms and the single support scale.
- [docs/mvp-refocus/](docs/mvp-refocus/):
  - [SPEC.md](docs/mvp-refocus/SPEC.md): the product spec.
  - [PLAN-ADJUSTMENTS.md](docs/mvp-refocus/PLAN-ADJUSTMENTS.md): binding decisions.
  - ARCHITECTURE.md and ASSESSMENT.md: the original design. Where they differ from PLAN-ADJUSTMENTS, the code follows PLAN-ADJUSTMENTS.
  - CONTRACTS.md: the backend and frontend conventions.
  - The parents' intake questionnaire and the observation model the wizard is based on.
