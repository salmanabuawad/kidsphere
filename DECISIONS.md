# Decisions

Choices made where the brief was unspecified or where the environment required it.

## Platform

1. **Next.js 16 + Prisma 6 + PostgreSQL**, one deployable app with a strict service layer (`src/server/services`). Prisma 6 (not 7) was chosen to avoid the driver-adapter/config migration while 7 is new; the schema is unchanged by that choice.
2. **npm** is the single package manager.
3. **Custom session auth instead of Auth.js.** Auth.js credentials-provider sessions are JWT-only; we wanted revocable database sessions (role change/deactivation kills sessions), hashed tokens and child-mode device locking. ~150 lines, fully tested.
4. **No Docker on the development machine** → added `npm run db:start`, an embedded real PostgreSQL (`embedded-postgres`) storing data in `.data/pg`. Docker Compose is still provided as an alternative.
5. **UTF-8 databases are created from `template0` with `C` collation.** The Windows dev machine defaulted to WIN1255, which cannot store Arabic.
6. **Own small component library** (Tailwind 4 + Radix-free native elements such as `<dialog>`) instead of the shadcn CLI: accessible, RTL-safe via logical properties, and no generator step.
7. **Rubik** font: one family covering Latin, Arabic and Hebrew.

## Product

8. **Parent questionnaire adds a few chip questions** (strengths seen, calming supports, preparation that helps) so that parent knowledge can be normalized deterministically. All free-text questions from the brief remain.
9. **Health questions** (sleep, eating, allergies) and _additional family context_ are marked sensitive. Sensory reactions are **not** health data and may inform "things to avoid".
10. **Quick Observation adds optional tag pickers** (strengths, interests, "before it happened") so observations become normalized evidence without AI.
11. **Confidence rules**: CORROBORATED = parent + teacher, or ≥ 2 distinct teacher observations/outcomes. A support only counts as evidence when it _helped_ or _partly helped_.
12. **Retired/rejected attributes never reactivate automatically**; new evidence is still recorded.
13. **Teachers may approve their own drafts directly**; approving a DRAFT records both "submitted for review" and "approved". A separate "Send for review" exists for co-teacher workflows.
14. **Any edit or regeneration returns content to DRAFT** (including published content, which disappears from child mode until re-approved). Narration is re-approved together with content.
15. **Publishing button is visible on drafts** and fails with a clear message — the gate is server-side and the attempt is audited (`content.publish_blocked`).
16. **Content kinds**: 12 content types map to four structured kinds — `story`, `routine`, `activity` (child-facing) and `guide` (adult-facing). Illustrations are built-in emoji ("fallback illustrations"); an image-generation provider can later fill `visualPrompt`.
17. **Weekly package** = 5 items per goal (story, visual card, choice game, movement, Friday replay + outcome). Items are generated on demand, never in bulk; Friday reuses Monday's story.
18. **Child mode language** = the child's primary language; the player direction follows the _content_ language.
19. **Child display name** is used as entered (e.g. "Adam" in an Arabic story). Families/teachers can set a localized display name.
20. **Professional-team note**: shown neutrally after ≥ 4 "did not help" observations in 30 days. No condition named, no probability.
21. **Progress** is shown as counts and a weekly outcome timeline; no percentages of "development".
22. **Characters are referenced by relation labels** ("Mom", "sibling") in AI prompts — never the family's chosen name for the person.

## AI

23. **Default Claude model `claude-opus-5-5`**, effort `medium`, JSON-schema structured output plus local Zod validation (provider schemas drop length constraints; Zod enforces them), server-side refusal fallbacks enabled.
24. **One automatic repair attempt**, then a safe failure; nothing invalid is ever stored.
25. **DEMO provider** is deterministic and multilingual, allowed in production only with `ALLOW_DEMO_AI_IN_PRODUCTION=true`; every item it creates is flagged and badged "DEMO".
26. **AI attribute suggestions** are an explicit teacher action per observation and always land as EMERGING.

## Security

27. Foreign/out-of-scope IDs return **404**, not 403, to avoid confirming existence.
28. **Same-origin check** on mutating API calls in addition to `SameSite=Lax`.
29. Child-mode PIN: 4–6 digits, bcrypt-hashed per session, lockout for 60 s after 5 failures.
30. **CSP** without external origins (`'unsafe-inline'` scripts are required by Next.js without a nonce pipeline; see ROADMAP).
31. In-process rate limiting (single instance). Swap for Redis when scaling horizontally.
32. Mail delivery is an abstraction; development prints reset links to the server console.

## Deployment

33. **kids.kortexd.com** runs on the existing Ubuntu host next to kortex-messaging: its own system user, PostgreSQL database, systemd unit (`node .next/standalone/server.js` on 127.0.0.1:3070) and nginx site with certbot TLS. Deploys upload `git archive HEAD` (same approach as kortex-messaging).
34. **Demo seed on servers uses a random password** written to `/root/kidsphere-demo-credentials.txt`; the published dev password is never used online.
