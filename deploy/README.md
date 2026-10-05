# Deploying KidSphere

The app runs on one Ubuntu server: nginx, systemd, PostgreSQL and a Python venv. There is no Docker. All the scripts here are plain bash and run as root on the server. You start them from Git Bash on Windows (or any bash with SSH). The SSH target and key come from `KS_HOST` and `KS_KEY`; the defaults are in the scripts, and the default key is `~/.ssh/kidsphere_deploy`.

| File | Purpose |
|---|---|
| `remote-deploy.sh` | Sends `git archive HEAD` (backend, frontend, deploy) to the server and runs `deploy.sh` there. With `--install`, it runs `install.sh` first. |
| `deploy-kids.ps1` | A PowerShell wrapper for `remote-deploy.sh` (`-Install`). |
| `install.sh` | One-time, idempotent provisioning: user, directories, DB role and DB, `.env`, systemd unit, nginx site. |
| `deploy.sh` | Deploys one release: sync, venv, DB backup, migrate, frontend build, restart, health check, smoke test. |
| `systemd/kidsphere-mvp-api.service` | The uvicorn service. |
| `nginx/kidsphere-mvp.conf`, `kidsphere-headers.conf`, `kidsphere-ratelimit.conf` | The site, the CSP and security headers, and the login rate limit. |
| `ci/` | The server-side test runner (see [CI runner](#ci-runner)). |

## Server layout

| What | Where |
|---|---|
| Backend | `/var/www/kidsphere/backend` (code, `venv/`, `.env` with mode 600, owned by `kidsphere-mvp`) |
| Frontend | `/var/www/kidsphere/frontend` (sources, `node_modules/`, `dist/` = the nginx root) |
| Uploads | `/var/www/kidsphere/uploads` (750, `kidsphere-mvp`; never served by nginx) |
| Releases | `/var/www/kidsphere/releases/<short-sha>` (the 5 newest are kept) |
| DB backups | `/var/backups/kidsphere/kidsphere-<YYYYmmdd-HHMMSS>.dump` (700, root; the 10 newest are kept) |
| System user | `kidsphere-mvp` |
| Database | `kidsphere_mvp`, owned by the role `kidsphere_mvp`. Its password is generated into `.env`. |
| Service | `kidsphere-mvp-api.service`: uvicorn on `127.0.0.1:3071`, 1 worker |
| nginx | `/etc/nginx/sites-available/kidsphere-mvp`, `snippets/kidsphere-headers.conf`, `conf.d/kidsphere-ratelimit.conf` |
| TLS | the existing Let's Encrypt certificate in `/etc/letsencrypt/live/kids.kortexd.com/` |
| Node (for builds) | `/opt/kidsphere-node/bin` |
| CI | `/var/lib/kidsphere-ci` (user `kidsphere-ci`, DB `kidsphere_test`) |

## First install

**Prerequisites.** The scripts do not install packages, so the server needs these already:

- PostgreSQL, nginx, `python3` with `venv`, `rsync`, `curl`, `openssl`
- Node 22+ in `/opt/kidsphere-node`
- a certificate for `kids.kortexd.com`, plus certbot's `options-ssl-nginx.conf` and `ssl-dhparams.pem`

**Steps:**

1. **Provision and deploy.** From the repo, with the code committed:
   ```bash
   bash deploy/remote-deploy.sh --install
   ```
   `install.sh` does the following:
   - creates the `kidsphere-mvp` user and the directories
   - creates the `kidsphere_mvp` role (with a random password) and the database (UTF8, from `template0`)
   - writes `backend/.env` from `backend/.env.example`
   - installs and enables the systemd unit
   - installs the nginx site and snippets

   It also disables any other enabled nginx site that claims `kids.kortexd.com`, and copies it to `/root/backups/nginx/` first. `deploy.sh` then installs the code.
2. **Create the first admin** on the server:
   ```bash
   cd /var/www/kidsphere/backend
   sudo -u kidsphere-mvp venv/bin/python -m app.cli create-admin --email admin --name "Admin"
   ```
3. **Optional: turn on Claude.** Set `ANTHROPIC_API_KEY=` in `/var/www/kidsphere/backend/.env`, then run `systemctl restart kidsphere-mvp-api`. Without a key, the built-in templates are used.

## Routine deploy

```bash
bash deploy/ci/remote-test.sh <label> all   # tests first: deploys do not run them
git commit ...                              # only the committed HEAD is deployed
bash deploy/remote-deploy.sh                # or: powershell -ExecutionPolicy Bypass -File deploy\deploy-kids.ps1
```

`deploy.sh` runs from `/var/www/kidsphere/releases/<sha>`:

1. `rsync --delete` of the backend (it keeps `venv` and `.env`) and the frontend sources.
2. A rebuild of the venv, only if the hash of `requirements.txt` changed.
3. `pg_dump -Fc kidsphere_mvp` into `/var/backups/kidsphere/`, then `alembic upgrade head` as `kidsphere-mvp`.
4. `npm ci` (only if the lock-file hash changed), then `vite build` into `dist.new`, which is swapped into place as `dist`.
5. `systemctl restart kidsphere-mvp-api`. It waits up to 30 s for `/api/health` and prints the service log if the API does not come up. Then `nginx -t && systemctl reload nginx`.
6. A smoke test: the local `/api/health`, `https://kids.kortexd.com/` and `https://kids.kortexd.com/api/health`.

## Rollback

List the kept releases with `ls -1t /var/www/kidsphere/releases`, and the backups with `ls -1t /var/backups/kidsphere`.

**When the bad release had no new migration,** redeploy the previous release:

```bash
bash /var/www/kidsphere/releases/<previous-sha>/deploy/deploy.sh
```

**When the bad release ran a migration,** first restore the dump that its deploy wrote just before migrating: the dump timestamped at that deploy. This loses everything written after the dump.

```bash
systemctl stop kidsphere-mvp-api
sudo -u postgres pg_restore --clean --if-exists --single-transaction -d kidsphere_mvp \
  /var/backups/kidsphere/kidsphere-<YYYYmmdd-HHMMSS>.dump
bash /var/www/kidsphere/releases/<previous-sha>/deploy/deploy.sh
```

A rollback never touches uploads.

## Logs and checks

```bash
journalctl -u kidsphere-mvp-api -f            # app log; one "ai call" / "ai generate" line per AI request (never prompt text)
systemctl status kidsphere-mvp-api
curl -s http://127.0.0.1:3071/api/health      # {"status":"ok","db":"ok"}
tail -f /var/log/nginx/kidsphere.access.log /var/log/nginx/kidsphere.error.log
cd /var/www/kidsphere/backend && sudo -u kidsphere-mvp venv/bin/python -m app.cli audit --child <uuid>
```

## CI runner

```bash
bash deploy/ci/remote-test.sh <label> [backend|frontend|all] [extra pytest args...]
```

1. **`remote-test.sh`** (on your machine) packs the files git sees under `backend/`, `frontend/` and `deploy/`: tracked and untracked, minus ignored ones, so uncommitted changes are included. It uploads them to `/var/lib/kidsphere-ci/runs/<label>` and starts the run. If the frontend has no `package-lock.json` yet, it copies back the one npm generated on the server.
2. **`server-run.sh`** (as root) takes the `flock` on `/var/lib/kidsphere-ci/lock`, so runs are serialised. It then switches to `kidsphere-ci` with a clean environment.
3. **`run-tests.sh`** (as `kidsphere-ci`) runs the suites:
   - **Backend:** a venv cached per requirements hash, then pytest against `kidsphere_test` with the `DATABASE_URL` from `/var/lib/kidsphere-ci/ci.env`, an empty `ANTHROPIC_API_KEY` and `COOKIE_SECURE=false`.
   - **Frontend:** `node_modules` cached per lock hash, then `npm run typecheck`, `lint`, `test` and `build`, with Node capped at 768 MB.
   - It ends with `ALL PASSED` or `FAILURES`, and the exit status says the same.

The runner never touches the production services, the production database or nginx.

**One-time setup** of the CI user, the `kidsphere_test` DB and `ci.env`: run `bash deploy/ci/provision-ci.sh` as root from any copy of the repo on the server, for example `/var/www/kidsphere/releases/<sha>/deploy/ci/provision-ci.sh`.

## Legacy installs still on the server

The previous KidSphere installs still run on the same host, which is why the new app uses the side-by-side names `kidsphere-mvp`, `kidsphere_mvp` and `kidsphere-mvp-api`. The owner will remove them.

| Install | Code | Database | Notes |
|---|---|---|---|
| Old Next.js app | `/opt/kidsphere-app` | `kidsphere_app` | Service `kidsphere-app` (port 3070). `install.sh` disables any other nginx site that claims `kids.kortexd.com` (backup in `/root/backups/nginx/`). Its code is in git under the tag `legacy-nextjs`. |
| Older Planet Heroes API | `/opt/kidsphere` | `kidsphere` | Not the new app: do not confuse it with `/var/www/kidsphere` or `kidsphere_mvp`. |
| Content studio | `/opt/kidsphere-content-studio` | `kidsphere_studio` | |

Backups of all three are in `/root/kidsphere-legacy-backup-20261005-*/`. Before removing anything:

- **Check the backups.** Make sure they are complete and readable.
- **Find the services.** Check each install's systemd unit and nginx site, for example with `systemctl list-units 'kidsphere*'` and `ls /etc/nginx/sites-enabled`. Never stop or remove `kidsphere-mvp-api` or the `kidsphere-mvp` site.
- **Keep the Node runtime.** **Keep `/opt/kidsphere-node`**: the new deploy builds the frontend with it.
- **Import admins first (optional).** If an admin from the old Next.js app should keep their password, import them before dropping `kidsphere_app`. The new CLI accepts its bcrypt hashes:
  ```bash
  cd /var/www/kidsphere/backend
  sudo -u postgres psql -d kidsphere_app -tAc \
    "SELECT json_build_object('email', lower(email), 'name', name, 'password_hash', \"passwordHash\") FROM \"User\" WHERE email = 'admin'" \
    | sudo -u kidsphere-mvp venv/bin/python -m app.cli import-users --role admin
  ```
