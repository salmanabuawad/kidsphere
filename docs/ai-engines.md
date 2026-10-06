# AI engines

KidSphere uses AI through **engines**: capabilities such as "Story", "Video animator" or "Voice". The core never names a vendor. Which provider and model power an engine is configuration, decided later and changeable per engine.

```
KidSphere UI  (never calls a provider)
   │  /api/ai/run · /api/ai/pipelines/{name} · /api/admin/ai/...
   ▼
AI orchestrator            backend/app/ai/engines/orchestrator.py
   │  validate input → resolve configuration → execute (retry, fallback)
   │  → validate + sanitize + safety (+ moderation engine) → trace
   ▼
Engine interfaces          interfaces.py · facade.py · contracts.py · catalog.py
   ▼
Provider configuration     config.py (AI_<ENGINE>_* + admin overrides; secrets by reference)
   ▼
Provider adapters          providers/   ("mock" built in; real ones added later)
```

The older content flow (stories, games, activities and video plans from the Create content page, plus the development-review suggestion) still runs on `app/ai/service.py` with the Claude provider and the built-in templates. Moving it onto the engines is a separate step (see "Decisions" at the end).

## The 21 engines

| Engine | Output | Tasks | Child-facing |
|---|---|---|---|
| `reasoning` | structured | analyze, decide | |
| `child_understanding` | structured | build_profile | |
| `observation_analysis` | structured | analyze, categorize, changes | |
| `recommendation` | structured | recommend | |
| `content_generation` | structured (games as `GameDefinition`) | generate | yes |
| `story` | structured | generate, adapt | yes |
| `character` | structured | create, describe | yes |
| `image_generation` | image | generate | yes |
| `video_animator` | video (long job) | animate | yes |
| `voice` | audio | speak | yes |
| `speech_recognition` | transcript | transcribe | |
| `music` | audio | compose | yes |
| `sound_effects` | audio | generate | yes |
| `vision` | structured | describe | |
| `embedding` | embedding | embed | |
| `classification` | structured | classify | |
| `translation` | text | translate | yes |
| `safety_moderation` | structured | moderate | |
| `personalization` | structured | adapt | yes |
| `progress_analysis` | structured | analyze | |
| `orchestration` | structured (a plan) | plan | |

Each engine's input and output shapes are Pydantic models in `contracts.py`; `catalog.py` ties them together. Games are data (`game_type, title, instructions, difficulty, learning_goal, questions, assets, feedback, adaptation_rules`) rendered by KidSphere's own game player. There is no `scoring` field, because KidSphere never scores children.

## The standard result

Every call returns an `AIResult`, whether it succeeded, failed or never ran:

```json
{
  "success": false,
  "engine": "video_animator",
  "task": "animate",
  "provider": null,
  "model": null,
  "request_id": "6c1f…",
  "status": "not_configured",
  "output": null,
  "assets": [],
  "usage": {"input_units": 0, "output_units": 0, "unit": "requests", "cost_estimate": 0.0},
  "error": {"code": "ENGINE_NOT_CONFIGURED", "message": "This AI engine is not set up yet. An administrator can configure it.", "retryable": false},
  "validation": null,
  "fallback_used": false,
  "created_at": "2026-10-06T18:00:00Z",
  "finished_at": "2026-10-06T18:00:00Z"
}
```

`status` is one of `succeeded`, `failed`, `not_configured`, `rejected` (invalid input) or `pending` (a long job). These are the error codes:

- **Request and configuration:** `UNKNOWN_ENGINE`, `UNSUPPORTED_TASK`, `INVALID_INPUT`, `ENGINE_NOT_CONFIGURED`, `ENGINE_DISABLED`, `PROVIDER_NOT_AVAILABLE`, `PROVIDER_UNSUPPORTED_OUTPUT`, `CREDENTIALS_MISSING`, `COST_LIMIT_REACHED`.
- **Calling the provider:** `PROVIDER_ERROR`, `PROVIDER_TIMEOUT`.
- **Checking the output:** `INVALID_OUTPUT`, `UNSAFE_OUTPUT`, `MODERATION_REJECTED`.

**No fake output.** When nothing can answer, `output` is null and the error says why. The user can retry; `retryable` says whether retrying may help.

## Example requests

Run an engine about a child. The child's id is ours: the provider never sees it.

```http
POST /api/ai/run
{"engine": "story", "task": "generate", "child_id": "8b0e…",
 "language": {"language": "he"},
 "input": {"goal": "Asking for help", "topic": "a little lion", "length": "short"}}
```

```json
{"success": true, "engine": "story", "task": "generate", "provider": "mock", "model": "mock-1",
 "request_id": "1a2b…", "status": "succeeded",
 "output": {"title": "a little lion",
            "pages": [{"text": "היה היה פעם a little lion. …", "illustration_prompt": "a little lion"},
                      {"text": "ובסוף כולם חייכו."}],
            "questions": ["מה a little lion ניסה?"], "reading_level": "easy"},
 "validation": {"schema_ok": true, "safety_ok": true, "issues": [], "sanitized": false, "moderated_by_engine": true},
 "usage": {"input_units": 1, "output_units": 1, "unit": "requests", "cost_estimate": 0.0}, "...": "..."}
```

A picture comes back as a file reference, and the file is served only after the access check:

```json
{"status": "succeeded", "assets": [{"asset_id": "…", "kind": "image", "mime": "image/png",
  "url": "/api/ai/assets/…", "width": 256, "height": 256, "alt": "A lion and blocks"}]}
```

A long job (video) returns `"status": "pending"`. `GET /api/ai/requests/{id}` checks it once and returns the finished result when it is ready.

A pipeline runs several engines under one `pipeline_id`:

```http
POST /api/ai/pipelines/activity_for_goal
{"child_id": "8b0e…", "input": {"goal": "Taking turns"}}
→ {"pipeline_id": "…", "name": "activity_for_goal", "status": "succeeded",
   "steps": [{"engine": "recommendation", …}, {"engine": "content_generation", …}]}
```

- **`activity_for_goal`:** Recommendation → Content generation → safety (inside each step) → for teacher review.
- **`personalized_cartoon`:** Story → Character → Image generation (up to 4 pages) → Video animator → Voice → for teacher approval.

A pipeline never publishes anything. Its status is `succeeded`, `partial` (an optional step failed), `pending` (the video is still running), `failed` or `not_configured`.

## Configuration

Each engine is configured on its own. The base is environment variables in `backend/.env` (systemd loads it). An admin can override every non-secret value on the **Admin → AI engines** page; those overrides live in `ai_engine_configs`.

| Variable (`<ENGINE>` = the key in capitals) | Meaning |
|---|---|
| `AI_<ENGINE>_ENABLED` | `true`/`false` (default: on once a provider is set) |
| `AI_<ENGINE>_PROVIDER` | an adapter name (today only `mock`) |
| `AI_<ENGINE>_MODEL` | passed to the adapter |
| `AI_<ENGINE>_ENDPOINT` | `https://…`, for adapters that need one |
| `AI_<ENGINE>_CREDENTIALS_REF` | the **name** of the variable holding the secret; must start with `AI_CRED_` |
| `AI_<ENGINE>_TIMEOUT_SECONDS` | 5–600, default 60 |
| `AI_<ENGINE>_MAX_RETRIES` | 0–5, default 1 (retryable failures only) |
| `AI_<ENGINE>_MAX_OUTPUT` | output limit in the adapter's unit |
| `AI_<ENGINE>_DAILY_COST_LIMIT` | estimated cost per day; then `COST_LIMIT_REACHED` |
| `AI_<ENGINE>_UNIT_COST` | estimate per usage unit when the adapter gives none |
| `AI_<ENGINE>_SAFETY_LEVEL` | `strict` / `standard` (child-facing engines are always strict) |
| `AI_<ENGINE>_FALLBACK_PROVIDER`, `AI_<ENGINE>_FALLBACK_MODEL` | used after the primary fails with a retryable error |
| `AI_CRED_<ANYTHING>` | a secret, referenced by an engine; never stored in the database, returned or logged |
| `AI_MOCK_MODE` | `true` runs every engine without a provider on the mock adapter |

Example:

```
AI_STORY_PROVIDER=<adapter>
AI_STORY_MODEL=<model>
AI_STORY_CREDENTIALS_REF=AI_CRED_STORY
AI_CRED_STORY=<secret>
```

## Mock mode

The whole application can be developed and tested without any real key:

- `AI_MOCK_MODE=true` in `backend/.env` runs every engine that has no provider on the built-in mock adapter. Alternatively, set `provider: mock` on one engine on the admin page.
- The mock answers every engine with the same contracts a real provider must meet. It answers in Arabic, Hebrew or English, repeats the request's own words, and produces tiny real files: a PNG picture, a short WAV and, for video, a JSON storyboard behind a pending job.
- The backend tests run the orchestrator, every engine and the pipelines on it (`tests/test_ai_engines.py`).
- Never turn mock mode on in production. The admin page shows a banner while it is on.

## Adding a provider later

1. Create `backend/app/ai/engines/providers/<name>.py` with a class that implements `interfaces.ProviderAdapter`:
   - `name`, `output_kinds` (which kinds it can produce) and `needs_secret = True` when it needs a key.
   - `invoke(call, secret) -> ProviderResponse`, which maps `EngineCall` (engine, task, input, minimised context, language, instructions, model, endpoint, max_output, timeout) to the vendor's API and the answer back to the engine's output shape. Files go in `binaries`, usage and a cost estimate in `usage`.
   - `poll(job_id, call, secret)` for long jobs. Return `state="pending"` and a `job_id` from `invoke`.
   - Raise `ProviderError(code, retryable=...)` on failure: timeouts, rate limits and 5xx are retryable; bad requests and authentication errors are not.
   - Vendor names, URLs, headers and request bodies stay inside this file, along with any vendor package in `requirements.txt`.
2. Register it in `providers/__init__.py` (`ADAPTERS`).
3. Add tests with a fake HTTP client (no network in tests).
4. Configure an engine to use it: `AI_<ENGINE>_PROVIDER=<name>`, the model, and `AI_<ENGINE>_CREDENTIALS_REF=AI_CRED_…` with the secret in that variable. Then use **Test** on the admin page.

The orchestrator validates whatever the adapter returns. Output that does not match the contract, or does not pass the safety check, is never shown.

## Data and traceability

| Table | Holds |
|---|---|
| `ai_engine_configs` | admin overrides per engine (no secrets) |
| `ai_requests` | every execution: engine, task, status, provider, model, fallback, child (internal id), user, language, the minimised input and context, its hash and context version, prompt template, validated output, validation, error, usage, estimated cost, attempts, duration, job id |
| `ai_request_events` | the execution log, append-only (started, attempt, provider_error, fallback, polled, final status) |
| `ai_assets` | produced files under `UPLOAD_DIR/ai`, served by `GET /api/ai/assets/{id}` |
| `ai_prompt_templates` | versioned instructions per engine, task and language; the newest active one is used |
| `ai_characters` | reusable character specifications |
| `generated_content.ai_request_id` | which request produced a content row |

Approvals and versions already live on `generated_content` (status, `approved_by`/`approved_at`) and `record_versions`. Together they give the trace: request → engine → provider → model → input/context version → output → validation → teacher approval → published content.

## Privacy

- **The child context is pseudonymous.** It is built only by `app.ai.context.engine_child_context`: a `child_ref` (a one-way hash, not the id), age in years, gender when set, vocabulary labels, the focus, masked texts and the approved current understanding. `[child]` stands for the child in every text.
- **What a provider never receives:** the name, internal id, birth date, surname, photos, contacts or free-text parent answers.
- **Logs:** one line per request with codes and numbers only.
- **The database:** stores the minimised input. Requests are deleted with the child.
- **No diagnoses.** Every output goes through the same safety rules as all AI output: clinical and diagnostic terms, referral wording, deficit wording, scores and percentages are refused. AI results are suggestions for the teacher; child-facing content goes through teacher approval.

## Decisions that need the product owner

See the delivery notes in the pull request or session. In short:

1. **The existing generation flow.** Moving stories, games and activities onto the Story and Content engines would retire the built-in templates, or keep them as an explicit "built-in" provider. Today, a failed Claude call falls back to the templates with a visible "Made with templates" badge.
2. **The child's first name.** The existing flow sends it to the provider (OQ-4). The engines send `[child]` and a reference instead.
3. **Speech recognition.** The engine exists, but recording is off in the app (`Permissions-Policy: microphone=()`, no dictation).
4. **Secrets.** Engines read secrets only from environment variables. The existing Anthropic key can still be saved on the settings page (in the database).
