# KidSphere privacy and data protection

KidSphere stores sensitive information about young children. It is an educational tool: it never diagnoses, labels, scores or predicts anything about a child. This page describes what the code actually does. The rules come from spec §35 and PLAN-ADJUSTMENTS.

## What is stored

| Data | Where | Notes |
|---|---|---|
| User accounts | `users` | Name, login (an e-mail or a username), bcrypt hash, role, UI language, active flag, last login. |
| Child basics | `children` | Name, preferred name, birth date, optional gender, class, main and additional languages, optional parent name and contact. |
| Child photo (optional) | `UPLOAD_DIR/children/<random>.jpg` | Re-encoded JPEG without EXIF/GPS. The DB stores only its relative path. |
| Profile | `child_profiles` | Parent and teacher answers from the wizard (strengths, interests, motivators, emotions and transitions, social and communication snapshot, independence levels, environment, priorities), who entered each section and when, the merged lists, and the current understanding. |
| Baselines | `baselines` | Immutable snapshots of the profile and the active focus areas. |
| Focus areas | `focus_areas` | Title, category and the 5-step plan. |
| Observations and feedback | `observations`, `content_feedback` | What happened, the context, the support level, what helped, notes. |
| Generated content | `generated_content` | The content and the minimised AI input that produced it (`generation_input`). |
| Development reviews | `development_reviews` | Summaries and decisions written or approved by the teacher. |
| Sessions | `sessions` | The sha256 of the session token, the expiry and the user agent. |
| Audit log | `audit_log` | Who did what, with ids, keys and field names only. It never holds observation text, answers or content. |

**Not collected:** health or medical information (there is no such field), diagnoses, scores, and voice or video recordings (there is no dictation or recording). Nothing is stored in the browser except the UI language (`localStorage.ks_locale`) and the session cookie.

## Who can see what

- **Admins** see every child, user and class, including archived children.
- **Teachers** see only children in the classes they are assigned to. They can see and edit everything about those children: both perspectives, baselines, focus areas, observations, content, the timeline and reviews.
- **Parents** see only the children an admin linked to them:
  - **What they can see:** the child's basics, the merged strengths and interests, their own wizard answers and content a teacher explicitly shared.
  - **Shared content:** only approved or completed content, shown without the teacher note, the AI input, the focus area or any feedback.
  - **What they can never see:** the teacher's perspective, focus areas, observations, the timeline, baselines or reviews.
  - **What they can change:** only the preferred name, additional languages and parent name and contact, plus their own answers. Every change is audited.
- **Unknown or out-of-scope ids** return 404, so the API does not reveal whether a child exists.

## What is sent to the AI provider

- **Without an AI key, nothing leaves the server.** With `ANTHROPIC_API_KEY` empty (the current setting), all content and suggestions come from the built-in templates.
- **With a key, only the backend calls the AI.** It calls Anthropic's API (model `claude-opus-5-5`). The browser never talks to an AI service, and the key exists only in `backend/.env` (mode 600). The allow-list lives in `backend/app/ai/context.py`.

**For content generation:**
- the child's first or preferred name (a surname typed into the preferred name is dropped), and their age in whole years
- gender, only when it is girl or boy (for Arabic and Hebrew grammar)
- the language, mode, content type and game template
- at most 3 strength labels, 3 interest labels and 3 what-helps labels
- at most 3 sensitivity keys ("avoid")
- the focus area (category, title, description, plan) or the target strength
- at most 5 recent observation texts (each cut to 300 characters)
- the approved current understanding (summary, adaptations, next steps)
- the teacher's regenerate instruction

**For a development-review suggestion:**
- the child's first or preferred name and age
- the same profile labels and the current understanding
- the active focus areas (category, title, description)
- the labels of the baseline items
- up to 40 observations since the latest baseline: their ids, dates, context and support level, plus the text and note cut to 300 characters

**Custom labels:** a label is a vocabulary label, or a custom entry (a short text typed instead of an option). A custom entry is sent only when staff entered or confirmed it (a teacher, an observation or a saved review). A custom entry only a parent gave is never sent, and the first summary written when the baseline is made leaves it out too.

**Names are masked in every free text on both paths:** the observation texts and notes, the focus title, description and plan, the custom labels and baseline items, the current understanding and the regenerate instruction.
- The child's names, including the surname, become `[child]`.
- The names of the other children of the kindergarten and of children not yet in a class (of every other child when the child has no class) become `[friend]`.
- The parent name on the child, the linked parent accounts and the teachers of the kindergarten become `[adult]`.
- Matching tolerates the usual spelling variants: case and accents, Arabic hamza and alef forms, ta marbuta, alef maqsura, tashkeel and tatweel, Hebrew niqqud and geresh, and Hebrew and Arabic one-letter prefixes.
- Only names KidSphere knows can be masked. A relative, a sibling or anyone else who is not in KidSphere (for example "Grandma Huda") is sent as written, so teachers should not write such names.
- A given name that is also a common word (Will, May, אור, نور) is masked wherever that word appears. A name particle (bin, בן, عبد, de) is masked only together with the next word.
- Vocabulary labels are not changed.

**Never sent:** the birth date, the surname, the photo, the parent's name or contact, free-text parent answers, whole perspectives, user accounts and other children's data.

**Checks and logs:**
- AI output is validated and safety-checked before it is saved, and it is always saved as a draft for teacher review.
- Each AI call logs one line of metadata (operation, model, duration, token usage). Prompt text is never logged.
- The input used for each content item is stored with it as `generation_input`.

**Before setting a key,** review the provider's data-handling and retention terms; they apply to what is sent.

## Uploads

- **Who can upload:** child photos are optional and only staff can upload them.
- **Checks:** the file is limited to 8 MB, and only JPEG, PNG and WebP are accepted, judged by their magic bytes.
- **Processing:** the image is re-encoded with Pillow (max 1024 px), which strips EXIF and GPS metadata. It is stored under a random name.
- **Serving:** nginx returns 404 for `/uploads/`. Photos are served only by `GET /api/children/{id}/photo` after the access check, with `Cache-Control: private, no-store`.
- **On the server:** the uploads directory is 750, owned by the service user, which is the only path the service may write to.

## Accounts and sessions

- **Passwords:**
  - Hashed with bcrypt at cost 12, and never logged or passed on a command line (the CLI prompts for them or reads stdin).
  - Admins set initial passwords, and users can change their own. An admin password reset, a role change or a deactivation ends all of that user's sessions. A user changing their own password keeps only the current session.
- **Sessions:** a random token in an HttpOnly, SameSite=Lax, Secure cookie (`ks_session`, 7 days). Only its sha256 is stored, and logging out deletes the session row.
- **Same-origin check:** any mutating request whose `Origin` belongs to another host is refused.
- **Login:**
  - It returns one generic error message, and failed attempts are audited.
  - nginx limits `POST /api/auth/login` to 10 requests per minute per IP (burst 5).
- **nginx security headers:**
  - a CSP with `script-src 'self'` and `connect-src 'self'`
  - `frame-ancestors 'none'`, `X-Frame-Options DENY`, `nosniff`, `Referrer-Policy no-referrer`
  - HSTS, `noindex`
  - camera, microphone and geolocation disabled
- **No third parties:** fonts are self-hosted, and there are no analytics or third-party scripts.
- **Read-aloud:** it uses the browser's own speech synthesis, and KidSphere makes no network call for it. Some browsers use online voices, and that is under the browser's control.

## Audit log

Important changes are written to `audit_log` in the same transaction as the change:

- logins, logouts and failed logins
- user, class and parent-link changes
- child create, update, archive and unarchive
- photo set and delete
- profile section updates
- baseline creation
- focus create, update and close
- observation create and update
- content generate, edit, approve, regenerate, duplicate, share, archive and delete
- feedback
- development reviews

The metadata contains only ids, keys and field names. Read a child's history on the server with `python -m app.cli audit --child <id>`.

## Backups and deletion

- **When backups are made:** all backups go to `/var/backups/kidsphere/` (root only: the directory is mode 700 and the files 600).
  - Before every migration, the deploy script writes a full database dump (`kidsphere-predeploy-<stamp>.dump`). The newest 10 are kept.
  - Every night at about 03:30, `kidsphere-mvp-backup.timer` writes a full database dump (`nightly-<stamp>.dump`) and an archive of the uploads directory, that is the child photos (`uploads-<stamp>.tgz`). The newest 14 of each are kept.
  - **The backups contain all child data and photos**, so treat them like the live database. They stay on the same server; nothing copies them elsewhere yet.
- **Deletion:**
  - Children are archived (hidden from everyone except admins), not deleted. Users are deactivated.
  - There is no export or hard-delete feature yet.
  - Deleting a child row directly in the database removes all of its data by cascade, including baselines. The photo file has to be removed separately.
  - Deleted data stays in the backups until they rotate out: 14 nights for the nightly backups, and the last 10 deploys for the pre-deploy dumps.
