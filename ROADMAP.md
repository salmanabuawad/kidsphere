# Roadmap

This file tracks progress against the phases in spec §42 ([docs/mvp-refocus/SPEC.md](docs/mvp-refocus/SPEC.md)).

## Done

**Phase 1: Know**
- The assessment of the legacy app ([docs/mvp-refocus/ASSESSMENT.md](docs/mvp-refocus/ASSESSMENT.md)).
- A fresh schema of 14 tables in one hand-written Alembic revision. The legacy Next.js app was removed from the tree (tag `legacy-nextjs`).
- Auth with sessions, e-mail or username login, and account settings. Admin pages for users, classes, teacher assignment and parent links.
- The child list (the teacher's home) with search and a class filter.
- The 7-step Add Child wizard. It can be saved and continued later, has a Parent/Teacher perspective toggle, and parents get their own onboarding.
- An immutable baseline with "Create new baseline".
- The child profile screen (spec §13) and an optional photo upload.

**Phase 2: Focus and observe**
- Current Focus areas: at most 3 active (enforced with a row lock), each with a 5-step plan (Strength → Need → Adaptation → What we will do → Follow-up).
- Quick observations that take under 30 seconds and can be repeated safely (`client_request_id`).
- A development timeline with "load older".

**Phase 3: Create and experience**
- Generation in Strength Builder and Growth Support modes: story, real-world activity and digital game, with 7 tap-only templates including `story_builder`.
- Claude when a key is set, otherwise deterministic templates in ar, he and en. Every result is validated and safety-checked.
- Teacher review: preview, edit, approve, regenerate (with an instruction), duplicate, archive, delete drafts and share with the parent.
- A full-screen Present view, a story player with read-aloud, an activity card and a video plan view.
- One-tap feedback, mirrored into the observations, that can be retried safely (`client_request_id`).

**Phase 4: Learn and adapt**
- A development review with an AI or template suggestion, the no-certainty rule and five descriptive statuses per focus area.
- Baseline validation.
- Focus decisions (keep, pause, close, edit, create).
- A teacher-approved current understanding that new content builds on.
- The weekly "small pack": story, activity, game and 3 discussion prompts, plus a video plan only on request.

**Phase 5: Video (partly done)**
- The AI writes a video plan (script, scenes, narration, visual prompts, 30–90 s).
- `services/video_service.py` exists, with a placeholder provider.

**Platform**
- The ar/he/en UI with true RTL. The parent area shows shared content and onboarding.
- An audit log with a CLI reader.
- Server-side CI (`deploy/ci/remote-test.sh`).
- The deploy scripts (`remote-deploy.sh`, `deploy-kids.ps1`).
- Nightly backups of the database and the uploads (`kidsphere-mvp-backup.timer`, the newest 14 kept), plus a dump before every migration.

## Remaining

**Product**
- **A real video provider.** Add a branch to `services/video_service.py` once credentials exist, and poll or show `generating/ready/failed` status. Nothing may block on it.
- **Native-speaker review of the Arabic and Hebrew wording.** This covers the new option labels and the template phrase tables. Also decide on one Hebrew convention for UI strings (slash forms or not). See [docs/terminology.md](docs/terminology.md) §6.
- **Personalised characters.** Generic characters, animals and interest-based heroes are used today. Characters made from the child or family would need consent (spec §32).

**Server**
- **Remove the legacy apps.** The owner removes the legacy apps from the server after checking the backups (see [deploy/README.md](deploy/README.md#legacy-installs-still-on-the-server)). After that, the side-by-side names (`kidsphere-mvp`, `kidsphere_mvp`) may stay as they are.
- **Off-site backups.** The nightly backups and the pre-deploy dumps stay on the same server (`/var/backups/kidsphere`). Copy them to another host if the data must survive losing the server.

**Privacy**
- **Data lifecycle.** There is no export, retention or hard-delete for a child (children are only archived). Add these when a real retention policy exists.
