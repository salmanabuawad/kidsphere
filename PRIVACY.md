# KidSphere privacy and data protection

KidSphere stores sensitive information about young children. It is an educational tool: it never diagnoses, labels, scores or predicts anything about a child. This page describes what the code actually does. The rules come from spec §35 and PLAN-ADJUSTMENTS.

## What is stored

| Data | Where | Notes |
|---|---|---|
| User accounts | `users` | Name, login (an e-mail or a username), bcrypt hash, role, UI language, active flag, last login. |
| Child basics | `children` | Name, preferred name, birth date, optional gender, class, main and additional languages, optional parent name and contact. |
| Child photo (optional) | `UPLOAD_DIR/children/<random>.jpg` | Re-encoded JPEG without EXIF/GPS. The DB stores only its relative path. |
| People in the child's life (optional) | `child_people`, photos in `UPLOAD_DIR/people/<random>.jpg` | At most 12 per child: the relation (grandfather, sister, friend, pet, …), the name the child uses for them and an optional photo, processed like the child photo. Entered by staff. |
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
- at most 3 sensitivity keys ("avoid"), and only those the teacher observed in the teacher observation (Domain 9: the effect is "affects" or "sometimes"). Sensitivities a parent reported, such as certain foods, are never sent.
- the focus area (category, title, description, and the plan without "who is responsible"; for a focus promoted from a Domain 13 need, also without the copied "what exactly do we see" text) or the target strength
- at most 5 observation texts linked to that focus (each cut to 300 characters)
- the domain blocks (`domains`) of the AI domains the focus or strength concerns, and of no other domain: the teacher-observation item keys with the support needed (or the Domain 9 effect), help keys, and at most 3 recent observations tagged with that domain (date, context, support level, the stage-E result key "did anything change" (yes/partly/no) and the focus whose plan was applied, the masked text cut to 300 characters). The domains sent are stored with the content.
- the approved current understanding (summary, adaptations, next steps)
- the teacher's regenerate instruction
- the people the teacher chose for this content (at most 3): only a placeholder such as `{grandfather}` and the relation with its label. Never their name or photo. The AI writes the placeholder; the browser shows the name and photo in its place, so names and photos never leave KidSphere. AI output that uses any other placeholder is rejected and replaced by the built-in template.

**For a development-review suggestion and a functional-summary draft (analysis, de-identified):**
- the child as `[child]`, never the first or preferred name, and the age; the answer gets the name back on the server
- the same profile labels and the current understanding
- the active focus areas (category, title, description; the summary draft also the plan without "who is responsible" and without a promoted need's text)
- the labels of the baseline items (review only), without sensitivity support needs; independence levels only when the period has independence data
- the domain blocks of the domains that have data in the period (item keys, levels, help keys)
- up to 40 observations since the latest baseline: their ids, dates, context, support level and AI domains, the stage-E result key "did anything change" (yes/partly/no, never "what changed") and the focus whose plan was applied, plus the observation text (never the note) cut to 300 characters
- every such call is stored in `ai_suggestions` with exactly this de-identified input, the output and the domains sent

**Custom labels:** a label is a vocabulary label, or a custom entry (a short text typed instead of an option). A custom entry is sent only when staff entered or confirmed it (a teacher, an observation or a saved review). A custom entry only a parent gave is never sent, and the first summary written when the baseline is made leaves it out too.

**Names are masked in every free text on both paths:** the observation texts, the focus title, description and plan, the custom labels and baseline items, the current understanding and the regenerate instruction.
- The child's names, including the surname, become `[child]`.
- The names of the other children of the kindergarten and of children not yet in a class (of every other child when the child has no class) become `[friend]`.
- The parent name on the child, the linked parent accounts, the parents and guardians the family named in the questionnaire (with or without an account) and the teachers of the kindergarten become `[adult]`.
- The names in the child's people list are masked too: sisters, brothers, cousins and friends as `[friend]`, every other relation as `[adult]`. A pet's name is not masked.
- Phone numbers become `[phone]` and e-mail addresses `[email]`.
- Matching tolerates the usual spelling variants: case and accents, Arabic hamza and alef forms, ta marbuta, alef maqsura, tashkeel and tatweel, Hebrew niqqud and geresh, and Hebrew and Arabic one-letter prefixes.
- Only names KidSphere knows can be masked. A relative, a sibling or anyone else who is not in KidSphere or in the child's people list (for example "Grandma Huda") is sent as written, so teachers should add such people to the list or not write their names.
- A given name that is also a common word (Will, May, אור, نور) is masked wherever that word appears. A name particle (bin, בן, عبد, de) is masked only together with the next word.
- Vocabulary labels are not changed.

**Never sent:** the birth date, the surname, the photo, the names and photos of the people in the child's life, the parent's name or contact, free-text parent answers (including the message from the heart), the health, medical and family answers, whole perspectives, observation notes and the other observation free texts (who was there, before, after, what changed, documentation), teacher-observation notes and texts, "who is responsible" in a plan, follow-up and summary texts, user accounts and other children's data. The source registries (`backend/app/data/source/*.json`) mark every question with `ai_policy`; anything marked `never` (or not listed) stays out, and `tests/test_ai_payload_policy.py` checks it.

**Checks and logs:**
- AI output is validated and safety-checked before it is saved, and it is always saved as a draft for teacher review. AI output may never recommend a referral or a professional evaluation, and never uses deficit wording, also in text only the teacher sees; such output is replaced by the built-in template.
- Each AI call logs one line of metadata (operation, model, duration, token usage). Prompt text is never logged.
- The input used for each content item is stored with it as `generation_input`.

**Before setting a key,** review the provider's data-handling and retention terms; they apply to what is sent.

## Uploads

- **Who can upload:** child photos and photos of the people in the child's life are optional and only staff can upload them.
- **Checks:** the file is limited to 8 MB, and only JPEG, PNG and WebP are accepted, judged by their magic bytes.
- **Processing:** the image is re-encoded with Pillow (max 1024 px), which strips EXIF and GPS metadata. It is stored under a random name.
- **Serving:** nginx returns 404 for `/uploads/`. Photos are served only by `GET /api/children/{id}/photo` and `GET /api/people/{pid}/photo` after the access check (anyone who may see the child, parents included), with `Cache-Control: private, no-store`.
- **Video:** a video plan plays in the browser as a narrated slideshow (the browser's own speech synthesis, with the people's photos). No photo, name or script is sent to a video service.
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
- people in the child's life: create, update, delete, photo set and delete (relation keys and field names only, never the name)
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
  - Deleting a child row directly in the database removes all of its data by cascade, including baselines and the people list. The photo files have to be removed separately. Removing a person through the app also removes their photo.
  - Deleted data stays in the backups until they rotate out: 14 nights for the nightly backups, and the last 10 deploys for the pre-deploy dumps.
