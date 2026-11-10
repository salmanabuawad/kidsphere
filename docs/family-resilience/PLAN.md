# Family Resilience & Emotional Intelligence (FREI): integration plan

*Hebrew: חוסן משפחתי ואינטליגנציה רגשית · Arabic: المرونة النفسية والأسرية والذكاء العاطفي*

This plan is based on the program brief "Roots of Resilience" (שורשים של חוסן). It describes how the module fits into KidSphere. It is not a separate app: it extends the existing loop **Know → Focus → Create → Experience → Observe → Learn → Adapt** with the family at home. The brief's cycle **Observe → Define Goal → Generate → Review → Practice → Reflect → Adapt** maps onto that loop one to one.

Status: **Phase 1, first slice built** (migration `0010_family_home`). Everything else here is a proposal.

## 1. Assessment of the existing architecture

KidSphere already has most of what the brief asks for. The table maps each request to what exists.

| Brief asks for | Already in KidSphere | Gap |
|---|---|---|
| Emotional-development profile (§4) | Wizard sections on emotions, regulation, separation, transitions, social and "what helps". Teacher Observation domain `emotional`, plus `social` and `daily_routine`. Merged lists (strengths, interests, what helps, sensitivities). An immutable baseline and an evolving current understanding. | No new profile fields are needed for the pilot. The 11 suggested fields are covered by the existing sections and domains. |
| Teacher-defined goals (§4, §10) | Current Focus: at most 3 active, with a 5-step plan (Strength → Need → Adaptation → What we will do → Follow-up). | The pilot goals were missing as suggestions. **Added:** `naming_feelings` and `talking_about_feelings_with_family`. Managing frustration already exists as `calming_after_frustration` and `expressing_frustration_in_words`. |
| Personalised stories (§5A) | Story generation: Strength Builder or Growth Support, from interests and strengths, with discussion questions and a positive ending. A safety check blocks clinical words, shame and scores. | None. |
| Games (§5B) | 7 tap-only templates, including `emotion_choice`, `what_happens_next` and `story_builder`. There is no losing. | None for Phase 1. |
| **Parent-child activities at home (§5C)** | `real_world_activity` exists, but it is teacher-led in the kindergarten. | **Added:** the content type `home_activity`, written to the parent in plain words, offline. |
| Videos (§5D) | Video plan with a narrated slideshow and a provider-agnostic `video_service` (placeholder provider). | A real provider is Phase 3. |
| Teacher review and approval (§6, §10) | Every AI output is a draft. The teacher edits, approves, regenerates or deletes it. Only approved content is shared. | None. |
| Parent portal (§7) | A parent sees approved content a teacher shared, without teacher notes or AI input. | **Added:** "How did it go at home?" reflections. A weekly journey and routines are Phase 2. |
| **Parent feedback (§8, §10)** | Feedback is staff only. | **Added:** `home_reflections`, which are parent-reported and kept apart from observations. |
| Observations and progress (§10–12) | Quick and structured observations, the timeline, development reviews and baseline validation (no certainty from fewer than 3 observations). | **Added:** reflections on the timeline. |
| **Recommend the next activity, with an explanation (§10, §11)** | AI suggestions for understanding and observation questions. Library items have `goals` and `suits`. | **Added:** `GET /children/{id}/next-steps`, a transparent rule that keeps facts apart from the suggestion. |
| Configurable AI engines (§14) | `ai/engines`: 21 provider-agnostic engines with an admin page, plus Claude or templates for content. | A job queue is not allowed (see §10 below). |
| Privacy and audit (§13) | An allow-listed AI context, name masking, scoped access (out of scope = 404), the audit log and archive/delete. | Consent records and retention settings are Phase 2. Legal review is needed. |

## 2. What was built (Phase 1, first slice)

This is the smallest end-to-end feature that runs the brief's demo scenario.

```
Teacher sets an emotional goal (Current Focus, e.g. "Naming feelings")
  → KidSphere drafts a personalised story + a home activity (template or Claude)
  → Teacher reviews, edits, approves and shares with the parent
  → Parent opens the activity (plain words, printable, no screen needed)
  → Parent taps "How did it go at home?" (+ optional note)
  → Teacher sees it on the Development timeline ("From home", parent-reported)
  → Child overview shows "Suggested next step": the facts, a reason, pre-filled Create buttons
```

The scenario is covered by `backend/tests/test_family_home.py::test_family_loop`.

### Database (migration `0010_family_home`)

- `generated_content.content_type` also allows `home_activity`.
- `home_reflections`: `id`, `content_id` (cascade), `child_id` (cascade), `result` (`worked_well`, `partly` or `did_not_work`), `note` (optional, at most 1000 characters), `client_request_id` (unique per author), `created_by` and `created_at`. Rows are only inserted.

### API

| Method and path | Who | What |
|---|---|---|
| `POST /api/children/{id}/content/generate` with `content_type: "home_activity"` | staff | A draft home activity: `{title, goal, duration_minutes 3–30, materials[≤8], steps[2–8], words_to_try[1–4], what_to_notice[1–4], if_it_feels_hard, parent_tip}`. |
| `POST /api/content/{id}/home-reflections` | parent of the child, on content shared with them | Body `{result, note?, client_request_id?}`. Returns 201, or 200 on a replay. Staff get 403. Content the parent cannot see returns 404. |
| `GET /api/content/{id}/home-reflections` | staff: all; a parent: their own | |
| `GET /api/children/{id}/home-reflections` | staff (parents get 404) | Includes the content title and type. |
| `GET /api/children/{id}/next-steps` | staff (parents get 404) | Per active focus: `facts` (newest 4: teacher feedback, home reflections, observations; never free text), `signal` (`start`, `build`, `repeat` or `smaller_step`), `suggestions` (content types in growth_support), and `library` (published items whose `goals` include the focus key). |

The timeline has a new entry type, `home_reflection`. The focus, content-type and result filters apply to it.

### Frontend

- `features/player/HomeActivityCard.tsx`: the parent-facing card, which follows the content language and RTL.
- `features/content/HomeReflectionCard.tsx`: shown under shared content on the parent's page.
- Content editor fields for `home_activity`.
- `features/next-steps/NextStepsCard.tsx`: shown on the child overview under Current Focus.
- The timeline shows `home_reflection` entries with the "Parent said" provenance badge.
- New i18n namespace `nextSteps`, plus new keys in `content`, `player` and `timeline`, all in en, ar and he.

### Rules kept

- **Draft first:** the AI still never writes the profile, and nothing reaches a parent without teacher approval and sharing.
- **No AI in the next steps:** the next-step rule is deterministic. It only pre-fills Create content.
- **Parent notes stay out of the AI:** a reflection note is parent free text. It is shown to staff and never sent to any AI provider (test `test_parent_note_never_reaches_the_ai`).
- **Parent reports are not observations:** reflections never become observations, so they never count toward the "≥ 3 linked observations" certainty rule.
- **Wording:** no scores, percentages, rankings or clinical words. Home activities get the child-facing wording check on every field, because parents read all of them.

## 3. Proposed schema for the later phases

These are proposals. Each one needs a hand-written migration and tests.

- **Phase 2: eight-week journey**
  - `family_programs(id, title, language, weeks JSONB, status draft|published|archived)`, admin-managed like library collections.
  - Each week is `{topic, parent_lesson, child_activity: {library_item_id | content_type}, reflection_prompt}`.
  - `family_enrolments(id, child_id, program_id, started_on, status, created_by)`: a child is enrolled by staff. The current week is derived from `started_on`.
  - Single activities stay possible without enrolling, through today's generate and share.
- **Phase 2: אפר״ת scenarios (Event → Interpretation → Emotion → Response)**
  - Store them as a structured plan on a focus area or a library item: `{event, interpretation, emotion_key, response}`.
  - Add a story template that walks through the four steps. For ages 3–4, use emotion cards and a two-step version (Event → Emotion → Response).
- **Phase 2: family routines and visual schedules**
  - A new content type, `routine` (`steps[{label, emoji, time?}]`), rendered like the sequence game but printable.
- **Phase 2: consent**
  - `consents(child_id, parent_user_id, kind: ai_processing|home_portal, granted_at, withdrawn_at)`.
  - A child-level switch, "no external AI": templates only for that child. The admin switch `provider_mode=template` already exists globally.

## 4. Parent and teacher UX flows

- **Teacher**
  - Child → Plan: set the goal (now including "Naming feelings").
  - Activities → Create: Growth Support → "Activity at home" (and a story).
  - Review → Approve → Share with parent.
  - Development → Timeline: "From home".
  - Overview → Suggested next step → Create.
- **Parent**
  - Home → Shared activities → open the home activity.
  - Read and print it, then do it together without a screen.
  - "How did it go at home?": one tap and an optional note. Earlier answers are listed.

Wireframes: the built screens are the first wireframes. Phase 2 screens (journey, Copilot, routines) will be drawn before they are built.

## 5. AI generation and approval

There is no change to the pipeline:

1. `app/ai/context.py` builds the allow-listed context.
2. Claude (one structured call) or the trilingual template provider writes the output.
3. Pydantic and the semantic checks validate it, and `safety.py` checks it. On any problem the template provider takes over.
4. The result is saved as a draft and the teacher approves it.

`home_activity` was added to `KIND_MODELS`, `KIND_GUIDES` (the prompt), `child_facing_fields` and the template provider (`frames.json → home`).

## 6. Security and privacy

- **Unchanged:** access scoping, the audit log and the AI allow-list. `AIContext` has no new fields.
- **New stored data:** parents' reflections (`home_reflections`), deleted with the child or the content. The audit row `home_reflection.create` holds ids, the result and `has_note` only.
- **Before production:** review the Israeli Protection of Privacy Law and its regulations (data security, including amendment 13), the Ministry of Education guidance on children's data, and parental consent for the pilot. Write down who the database owner is and the retention period. This needs a legal reviewer; it is not done here.

## 7. MVP plan (Phase 1)

| # | Item | Status |
|---|---|---|
| 1 | Emotional goals in the child profile | done: existing Current Focus plus two new suggestions |
| 2 | Teacher assigns goals | done (existing) |
| 3 | Personalised emotional-learning stories | done (existing) |
| 4 | Parent-child activity recommendations | done: `home_activity` |
| 5 | Parent feedback forms | done: home reflections |
| 6 | Teacher review and content approval | done (existing) |
| 7 | Basic progress view | done: timeline entries plus suggested next steps. A program-level dashboard is Phase 2 and needs decision §10.3. |

## 8. Testing

- **Backend:** `tests/test_family_home.py` covers:
  - the migration up and down
  - home-activity templates in 3 languages × 3 genders × 3 goals
  - wording checks on teacher edits
  - reflection access for parent, staff and other families, plus unsharing
  - idempotency and validation
  - the timeline, including its filters
  - that the parent note never reaches the AI
  - the next-step signals and library matching
  - the full demo loop

  Existing suites (content, timeline, options, AI templates, migrations, dev seed) were extended.
- **Frontend:**
  - `features/content/home.test.tsx`: the parent card, sending a reflection and Arabic RTL.
  - `features/next-steps/next-steps.test.tsx`: facts kept apart from suggestions, the pre-filled links and the no-scores check.
- **Demo data:** `dev_seed` gives Maya the goal "Naming feelings", a shared home activity and her parent's reflection.

## 9. Pilot (Buq'ata, 2 kindergartens, 20–30 families, ages 3–5)

What the current build already supports:

- teacher and parent accounts (admin-created)
- the 3 pilot goals as focus suggestions
- weekly activity assignment (generate and share, or give from the library)
- tracking parent participation through reflections

Still needed: onboarding guides (a short doc per role), baseline and end questionnaires (descriptive, never scored), and an aggregated pilot view. Results must be reported as usability, participation and teacher-reported observations, **never as evidence of clinical effectiveness**.

## 10. Conflicts with binding project rules: decisions needed

1. **Job queue for local AI (brief §14).** AGENTS.md forbids queues, workers and new services. Proposal: keep one synchronous generation at a time (today's behaviour). If local models are too slow, store a `pending` row and let a systemd timer pick it up. That is still not a queue service, but it needs the product owner's approval.
2. **Parent Copilot (brief §9).** A parent types free text about their child, and that text would go to an AI. Today's rule is that free-text parent answers are never sent. A Copilot needs:
   - an explicit PRIVACY.md change and consent
   - a curated, versioned knowledge base reviewed by educators
   - retrieval over that knowledge base only
   - masking of names in the question
   - a refusal-and-escalation path for safety concerns (fixed text pointing to the kindergarten team and the local welfare or emergency numbers, never generated)
   - no child-facing chat

   Proposed for Phase 2, after sign-off.
3. **Admin dashboard and "aggregated pilot outcomes" (brief §12, §15).** The project bans scores, percentages and rankings about children. Counts of participation per program (families enrolled, reflections sent per week) are about the program, not a child. Proposal: allow program-level counts for admins only, never per child, never as percentages. This needs the product owner's decision.
4. **Video generation (brief §5D, Phase 3).** It needs a vendor, a key and a cost limit (PLAN-ADJUSTMENTS D, next phases).
