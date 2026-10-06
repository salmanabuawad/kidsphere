# KidSphere: requirements coverage matrix (source documents → implementation)

- **Status:** implemented (waves 1–3, WP3-INT integration). The *Status* column records the implemented state, checked by `backend/tests/test_coverage_matrix.py`; the *Before* column keeps the audit evidence from before the work. §1.4 lists what is still open; §8 records the decisions taken on OQ-1..OQ-8 (the proposed defaults).
- **Date:** 2026-10-06 (audit and implementation)
- **Branch:** `mvp-refocus`
- **Author:** lead architect
- **Inputs:**
  - `SPEC-UPDATE-SOURCE-DOCS.md` (binding)
  - `SPEC.md`
  - `PLAN-ADJUSTMENTS.md` (binding, except where §8 proposes superseding A10 and B9)
  - `docs/terminology.md`
  - the two DOCX originals, re-extracted on the server
  - inventories: PQ (83 items) and OM (192 items)
  - three mapping passes and two critic passes. The critic corrections are applied here and listed in §1.3.

This file is the single source of truth for "every source item has a place". `backend/tests/test_coverage_matrix.py` parses every table in §2. A table row is any line that starts with `| PQ-`, `| OM-` or `| X-`. The test checks:

1. Every ID in the two source registries (`backend/app/data/source/*.json`) appears in this file exactly once, and the reverse; the only other rows are X-01..X-64. (The observation-model `OM-SEC-*` sections only group items; their headings are the `OM-D00-HDR` row and the domain-title rows.)
2. Every status is one of `covered`, `partial` or `missing`, and the §1.1 totals equal the rows.
3. Every registry storage path resolves: a profile section, bridge or questionnaire-record model field, an assessment domain model field, an observation details/attributes field, a plan, follow-up or summary field, or a column in `app.models`; every `REG` path resolves to a registry entry, list option or UI message.
4. The registry's `ai_policy` equals the *AI* column.
5. Every registry label (and every option of its list) exists in en, ar and he.
6. Every registry item with a *PDF* entry prints its stored value (each option as its label, each free text as itself) in **every** report its *PDF* cell names, built from a fully filled child whose free texts are distinct sentinels (real registries, every report flag on); every option row prints its label with that option stored; registry text and layout rows print their label.
7. The *PDF* column names the same reports (R1–R6) as the registry `pdf`.

`backend/tests/test_source_docs_e2e.py` runs the whole flow through the API (questionnaire → quick baseline → 13 domains → need → focus → plan → content → review → summary → 12 PDFs in he/ar) and checks that history keeps the initial versions.

---

## 0. How to read the tables

### 0.1 Status rules
These are the rules, applied the same way everywhere. They include the critic consistency fixes. The audit applied them to the code before this plan (its evidence is the *Before* column); the *Status* column now applies them to the implemented code.

| Status | Meaning |
|---|---|
| `covered` | A dedicated field keeps the full source meaning and staff can reach it in the UI. A missing PDF, missing history or missing provenance badge alone does not lower the status; those gaps are listed in *Target*. |
| `partial` | Something exists but loses information. Examples: merged into a shared field, an approximate or renamed key, binary instead of a scale, hidden, not per item. Evidence that is only a vocabulary key, a strength chip, an interest chip or a focus-suggestion title also counts as `partial`. |
| `missing` | No field and no UI. **A generic catch-all box does not count as a place for a question.** Examples are `social.comments` ("Comments") and `environment.notes` ("Anything else?"). The exception is a note placed right next to the question, such as `priorities_note` for Q37 "other". An unused vocabulary list counts as `missing`; one example is `share_next_step`, which no code references. |

### 0.2 Storage abbreviations (*Before* and *Target storage* columns)
| Code | Means |
|---|---|
| `CH.x` / `CL.kindergarten` | `children.x` / `classes.kindergarten` |
| `PP.<sec>.<f>` | `child_profiles.parent_perspective.sections.<sec>.<f>`, the parent questionnaire. The new sections and keys are **added in place**; see §3.3. |
| `PQM.<k>` | `child_profiles.parent_perspective.questionnaire.<k>`, the record metadata (new key) |
| `PSS.<sec>` | `child_profiles.<perspective>.section_status.<sec>` = `{status, by, at}` (new key) |
| `TP.<sec>.<f>` | `child_profiles.teacher_perspective.sections.<sec>.<f>` |
| `QB.<f>` | `TP.bridge.<f>`, the **Teacher Quick Baseline** (the "teacher's part" after the parent questionnaire; new section) |
| `CPL.<list>` | the merged lists `child_profiles.{strengths,interests,motivators,what_helps,sensitivities}` |
| `TAH.<col>` | `teacher_assessments.<col>`, one row per observation cycle (new table) |
| `TA.<domain>.<path>` | `teacher_assessment_entries.data.<path>` for that domain. The table is append-only; the latest entry is cached in `teacher_assessments.domains.<domain>`. |
| `OBS.<col>` / `OBS.details.<k>` | `observations` |
| `FA.<col>` / `FA.plan.<k>` | `focus_areas` (= plan goals; see §3.2.7) |
| `DR.<col>` / `DR.follow_up.<k>` | `development_reviews` |
| `FS.<col>` | `functional_summaries` (new table) |
| `AIS` | `ai_suggestions` (new table) |
| `RV(<entity>)` | a row in `record_versions` (new generic append-only history table) |
| `REG` | static registry or i18n text: `backend/app/data/source/{parent_questionnaire,observation_model}.json`, `data/lists/*.json`, report messages. No per-child data. |
| `derived` | computed at read time; nothing is stored |

### 0.3 UI codes
| Code | Screen |
|---|---|
| `PW1`–`PW9` | Parent wizard step 1–9 (§5.2). Staff open the same flow "on behalf" of the family, or in meeting mode, from the Parent View. |
| `PV§X` | **Parent View** tab, section X (the complete questionnaire, read-only, with history) |
| `QB` | **Quick baseline** page (one screen) |
| `OV` | **Overview** tab. Its cards: `heart`, `good-to-know`, `strengths`, `interests`, `what-helps`, `focus`, `recent`. |
| `TO/Dn` | **Teacher Observation** tab, domain card n. `TO.hdr` is the header card; `TO.guide` is the "How to observe" card. |
| `QO` | quick-observation form (Observe → Understand → Act stepper A–E) |
| `OB` | **Observations** tab (list + detail + filters) |
| `PL` | **Plan** tab |
| `DV` | **Development** tab: `DV.review`, `DV.summary`, `DV.baseline`, `DV.timeline` |
| `RP` | **Reports** tab / export dialog |
| `HDR` | child header (all tabs) |

### 0.4 API codes
| Code | Endpoint |
|---|---|
| `PROF` | `PATCH /api/children/{id}/profile` `{perspective, section, data, status?, questionnaire?}` (extended) |
| `PROF-H` | `GET /api/children/{id}/profile/history?perspective&section` |
| `CHILD` | `GET`/`PUT /api/children/{id}` (unchanged) |
| `SRC` / `OPT` | `GET /api/source-model` (static registries; new) / `GET /api/options` (lists, now merged from fragments) |
| `TA-H` | `POST /api/children/{id}/teacher-assessments`, `PATCH /api/teacher-assessments/{aid}` (header) |
| `TA-D(d)` | `PUT /api/teacher-assessments/{aid}/domains/{d}`. Every call **appends** an entry. |
| `TA-APPLY` / `TA-NEED` | `POST /api/teacher-assessments/{aid}/apply` (merge into the profile lists) / `POST /api/teacher-assessments/{aid}/needs/{i}/focus` |
| `OBSV` | `POST /api/children/{id}/observations`, `PUT /api/observations/{oid}`, `GET /api/children/{id}/observations?…` (filters) |
| `FOC` | `POST /api/children/{id}/focus-areas`, `PUT /api/focus-areas/{fid}` |
| `REV` | `POST /api/children/{id}/development-reviews` (+ `/suggest`) |
| `FSUM` | `/api/children/{id}/functional-summaries` (+ `/suggest`), `POST /api/functional-summaries/{sid}/approve` |
| `PDF` | `POST /api/children/{id}/reports/pdf` |
| `TL` | `GET /api/children/{id}/timeline?…` (filters) |

### 0.5 PDF and AI codes
**PDF reports:**

| Code | Report |
|---|---|
| R1 | Full Child Report |
| R2 | Parent Questionnaire |
| R3 | Teacher Observation Report |
| R4 | Current Development Report |
| R5 | Intervention Plan |
| R6 | Timeline Report |

`R2§C` means report 2, questionnaire section ג. `R3§7` means report 3, domain 7.

**AI policy:**

| Code | Meaning |
|---|---|
| `never` | never in any external AI payload |
| `label` | de-identified label only: vocabulary keys turned into labels through the merged lists, at most 3; parent-only custom text excluded |
| `domain` | domain-structured: item key + level, or help/context keys, sent only when the request concerns that domain; notes and free text never |
| `n/a` | static text |

---

## 1. Summary

### 1.1 Counts

The implemented state after waves 1–3 (the test keeps the Total row equal to the rows). The audit before the work counted 38 covered, 228 partial and 133 missing; the root causes it found are kept in §1.2.

| Document | Rows | covered | partial | missing |
|---|---:|---:|---:|---:|
| Parent questionnaire (PQ): 83 items + 13 section headings | 96 | 96 | 0 | 0 |
| Observation model (OM): 192 items + 47 headings, options, helpers and format rows | 239 | 239 | 0 | 0 |
| Cross-cutting (X): workflow, history, provenance, AI, PDF, navigation | 64 | 63 | 1 | 0 |
| **Total** | **399** | **398** | **1** | **0** |

The OM extra rows are: 4 section headings, 17 domain titles, 2 Domain 3 sub-headings, the split principle 26b, the functional-level format row, 11 Domain 13 options, 7 Stage C options, 2 Domain 14 helper texts, the Domain 14 cycle row and 4 Domain 16 options.

**Per section, parent questionnaire:**

| Section | Rows | c | p | m |
|---|---:|---:|---:|---:|
| META (title, purpose) | 3 | 3 | 0 | 0 |
| א Me and my child + interests | 10 | 10 | 0 | 0 |
| ב What makes my child happy | 5 | 5 | 0 | 0 |
| ג Emotional world | 8 | 8 | 0 | 0 |
| ד Morning separation | 4 | 4 | 0 | 0 |
| ה Social | 6 | 6 | 0 | 0 |
| ו Communication & language | 7 | 7 | 0 | 0 |
| ז Independence | 12 | 12 | 0 | 0 |
| ח Sleep, eating, health | 5 | 5 | 0 | 0 |
| ט Boundaries & behaviour | 5 | 5 | 0 | 0 |
| י Changes & transitions | 4 | 4 | 0 | 0 |
| יא Expectations | 11 | 11 | 0 | 0 |
| יב Partnership | 5 | 5 | 0 | 0 |
| יג Message from the heart | 2 | 2 | 0 | 0 |
| Teacher's part (bridge) | 9 | 9 | 0 | 0 |

**Per section, observation model:**

| Section | Rows | c | p | m |
|---|---:|---:|---:|---:|
| Front matter, A child details, B principles, level format | 22 | 22 | 0 | 0 |
| 1 Emotional | 11 | 11 | 0 | 0 |
| 2 Social | 11 | 11 | 0 | 0 |
| 3 Language & communication | 18 | 18 | 0 | 0 |
| 4 Attention / executive functions | 14 | 14 | 0 | 0 |
| 5 Play | 11 | 11 | 0 | 0 |
| 6 Gross motor | 11 | 11 | 0 | 0 |
| 7 Fine motor | 13 | 13 | 0 | 0 |
| 8 Independence | 10 | 10 | 0 | 0 |
| 9 Sensory | 12 | 12 | 0 | 0 |
| 10 Cognition | 13 | 13 | 0 | 0 |
| 11 Day map | 14 | 14 | 0 | 0 |
| 12 Strengths | 8 | 8 | 0 | 0 |
| 13 Priority needs | 19 | 19 | 0 | 0 |
| 14 Observe → Understand → Intervene | 23 | 23 | 0 | 0 |
| 15 Plan | 7 | 7 | 0 | 0 |
| 16 Follow-up | 13 | 13 | 0 | 0 |
| 17 Functional summary | 7 | 7 | 0 | 0 |
| Closing principles | 2 | 2 | 0 | 0 |

### 1.2 What the gaps came down to before the work (10 root causes, all addressed; see §1.4)
1. **The parent questionnaire is only half modelled.** Sections ב, ח, ט, יב and יג have no fields. Many free-text questions are squeezed into vocabulary chips (custom text ≤120 characters) or into shared notes. "Other" cannot be stored for Q16, Q20, Q37 or Q39. Q36 and the message from the heart share one slot.
2. **The teacher full observation does not exist.** There is no domain entity, no indicator × level × note matrix, no day map and no Domain 13 need marking. The teacher perspective reuses the parent's 6 sections as binary chips.
3. **Nothing is versioned.** `PATCH /profile` replaces a whole section; the `entered[]` stamps keep who and when but not the values. `PUT /observations`, `PUT /focus-areas`, draft content edits and regenerate all overwrite in place. Reopening a goal clears `closed_at`. AI suggestions are thrown away. Only `baselines` and `development_reviews` are safe.
4. **Staff cannot read the parent answers** except inside the edit wizard. There is no Parent View, no heart-message card, and no Teacher Observation, Plan, Observations or Reports tab.
5. **There are no section statuses** and no explicit not-answered or not-observed state outside the support scale.
6. **The plan fields `frequency`, `who` and `review_on` exist only in the API**, and `review_on` is free text. There is no period and no 2–3-goal guidance. Domain 16 has no review-level follow-up block. Domain 17 has no separate summary record.
7. **The AI payload breaks the new policy** in three places:
   - parent-reported sensitivity keys, including `certain_foods`, go out as `avoid` and in `baseline_items(for_ai)`;
   - analysis prompts carry the child's first name; `observations.note` and `plan.who` are sent;
   - there is no domain minimisation and nothing blocks referral wording.
8. **There is no PDF stack**: no library, templates, fonts, `report_exports` table, endpoint or blob download.
9. **Terminology conflicts.** Several labels the source requires are banned by `docs/terminology.md` or `banned_terms`, and so is the required PDF disclaimer. See §8 OQ-3.
10. **Provenance is invisible on touch screens.** It shows only as a hover tooltip; the PARENT SAID, TEACHER OBSERVED, AI SUGGESTED and TEACHER APPROVED vocabulary is not modelled.

### 1.3 Critic corrections applied
**Status changes, parent questionnaire:**
- JOY-01, SOC-02, SOC-04, SOC-05, COM-02 and COM-06: `partial` → `missing` (catch-all rule).
- INTRO-08, BEH-03 and TCH-04: `covered` → `partial`.

**Status changes, observation model:**
- D06-08, D07-11, D10-01, D10-07, D10-10 and D10-11: `missing` → `partial` (chip, focus-title and interest-only rule).
- D99-02: `covered` → `partial`.

**Corrected evidence (status unchanged):**
- META-03: unanswered lists are stored as `[]`; only text and single fields are absent.
- EMO-04: `calming_notes` is not merged into `what_helps`.
- HLT-02/03: `reviews.suggest` also sends `support_needs` keys through `baseline_items(for_ai=True)`.
- TCH-09: the stamp role is `user.role`.
- IND-02..09: the baseline chips show no `reported_by`.
- INTRO-09: `motivators` is never displayed and is not in AIContext.
- D16-01: `development_reviews.review_date` exists, but it is the review date, not a planned reassessment date.
- D99-01: the actual profile order is Strengths → Interests / What helps → Focus → Recent → Understanding.
- D01-01, D02-10 and D03-03: `observations.area` can only be set through a selected focus.
- D09-01: sensitivities are not rendered on the profile page.
- D00-04: the source wording hits `banned_terms` (`אבחון`).

**Rows added:**
- 13 PQ section headings (`PQ-SEC-01..13`).
- OM: the headings, domain titles, sub-headings, Domain 13, 14 and 16 option rows, the helper texts, the D14 cycle row, `OM-D00-26b` and `OM-LEVEL`.
- `X-64`: the matrix-walk verification.
- `OM-SEC-STATUS`, `OM-DOMAIN-TAXONOMY` and `OM-D16-AI` are tracked as X-05, X-28 and X-30 respectively. No duplicate rows were added for them.

### 1.4 Implementation status (WP3-INT)

**How the root causes were resolved:**
1. The parent questionnaire is modelled in full: 13 parent sections (`PP.*`, schemas in `app/schemas/profile.py`), `not_answered[]`, the record `PQM`, the 9-step wizard and the Parent View, both driven by `backend/app/data/source/parent_questionnaire.json`; legacy keys are projected (§3.3.2).
2. The teacher full observation exists: `teacher_assessments` cycles and append-only `teacher_assessment_entries` for 13 domains (`app/schemas/assessments.py`), the Teacher Observation tab driven by `observation_model.json`, Domain 13 needs → Current Focus.
3. Nothing is overwritten: `record_versions` (profile sections, observations, focus areas, content), immutable cycles, entries, summaries and report exports, soft-deleted drafts, stored AI suggestions.
4. Staff read the parent answers in the Parent View and the Overview (heart message, good-to-know, family hopes).
5. Section statuses for the questionnaire, the quick baseline and every domain, plus "Not answered" / "Not observed yet".
6. The plan has its 6 fields with a real follow-up date; Domain 16 is the review's `follow_up` block; Domain 17 is `functional_summaries`.
7. The AI payload follows the registry `ai_policy` (health, family, third-party and parent free text never leave), analysis calls use `[child]`, data is structured by the 12 AI domains, `banned_terms.ai_only` blocks referral wording.
8. Six PDF reports in en/ar/he with true RTL (WeasyPrint, bundled fonts), logged in `report_exports`.
9. Terminology is reconciled (OQ-3): exact disclaimer sentences in `allow_phrases`, neutral labels, `source_he` never rendered.
10. Provenance is a visible chip (PARENT SAID / TEACHER OBSERVED / AI SUGGESTED / TEACHER APPROVED) in the UI and as source tags in the PDFs.

**Still partial:**
- X-60: audio stories and songs are not a content type yet; providers stay interchangeable for stories, games, videos and real-world activities.

**Known follow-ups that do not lower a status** (the field exists and staff reach it; §0.1):
- PQ-INTRO-08: staff confirm a parent's "other" interest by adding it in the teacher perspective; there is no one-tap "Confirm" on the Overview yet.
- PQ-TCH-06: the Teacher Observation tab marks the quick baseline's first area to observe; the quick-observation form does not preselect it and its domain status is not set automatically.
- Production rollout (pg_dump → `alembic upgrade` 0002 → restart → smoke test, deploy/README.md) is run by the lead after the commit; the migration is additive and its backfill is idempotent.

---

## 2. Coverage matrix

### 2.1 Parent questionnaire: שאלון היכרות – "להכיר את הילד שלי"

#### 2.1.0 Title and purpose (display)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-META-01 | PQ·title | שאלון היכרות – "להכיר את הילד שלי" · Getting-to-know questionnaire (title) | covered | Not shown anywhere: no Parent View, no PDF | REG `parent_questionnaire.meta.title` | PW intro heading; PV heading | SRC | R2 title; R1 chapter heading | n/a |
| PQ-META-02 | PQ·title | מיועד להורה/ים למילוי בתחילת שנת הלימודים \| גילאי 3–5 · For parent(s), start of school year, ages 3–5 | covered | `entered[]` stamps; `wizard.completed_at` only on parent self-submit; no fill date, no school year | PQM.{status draft/submitted, filled_at, submitted_at, submitted_by, school_year, entry_mode} | PW intro; PV header "Filled on {date} by the family · entered by {name}" | PROF (`questionnaire`) | R2 header block | never |
| PQ-META-03 | PQ·intro | מטרת השאלון… אין צורך לענות על כל השאלות; ניתן להרחיב · Purpose; every answer optional; may expand | covered | `wizard.parent.intro`; fields optional; unanswered lists saved as `[]`, text absent; no not-answered; custom ≤120 | `PP.<sec>.not_answered[]` (field names); text answers ≤4000; PSS.<sec> | PW intro card + "Skip" per question; PV muted "Not answered" | PROF | R2 intro; "Not answered" markers | n/a |

#### 2.1.1 א. אני והילד שלי (incl. interests)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-SEC-01 | PQ·א | א. אני והילד שלי · A. Me and my child (heading) | covered | Split: identity in staff Step 1 (parents never see it); Q1–3 in wizard step 2 | REG section `intro` → PP.who | PW1 (+PW2 interests) | SRC | R2§A | n/a |
| PQ-INTRO-01 | PQ·א | שם הילד · Child's name | covered | CH.name (+preferred_name), staff Step 1, header | CH.name (unchanged); name snapshot in RV(profile_section `parent:_questionnaire`) at submit | PW1 read-only; HDR | CHILD | every header; R2§A | never (analysis uses the `[child]` token; content keeps the first name, OQ-4) |
| PQ-INTRO-02 | PQ·א | שם ההורה/ים · Parent(s)' name(s) | covered | CH.parent_name single string (staff only); linked accounts in child_parents | PP.who.parents[{name≤120, relation}]; CH.parent_name kept = first entry | PW1; PV§A | PROF; CHILD | R2 header; R1 basics | never (masked as `[adult]`) |
| PQ-INTRO-03 | PQ·א | גיל הילד · Child's age | covered | derived from CH.birth_date (`age_parts`) | derived; age at PQM.filled_at | PW1 read-only; PV header | CHILD | every header; R2 "age when filled" | label (age in years) |
| PQ-INTRO-04 | PQ·א | שם הגן · Kindergarten | covered | CL.kindergarten via class_id; header shows only the class | derived; snapshot at submit | PW1 read-only; HDR adds kindergarten | CHILD | R2§A; every header | never |
| PQ-INTRO-05 | PQ·א·Q1 | לתאר את הילד ב־3–5 מילים · Describe in 3–5 words | covered | PP.who.describe_words (server max 8, UI 5); never displayed outside the wizard | PP.who.describe_words (parent mode max 5, order kept) | PW1; PV§A; OV "In the family's words" | PROF | R2§A Q1; R1 | never |
| PQ-INTRO-06 | PQ·א·Q2 | מה אתם הכי אוהבים ומעריכים בילד · What you love/appreciate most | covered | PP.who.appreciate, collapsed under "More" | PP.who.appreciate (≤4000, not collapsed) | PW1; PV§A; OV strengths quote (PARENT SAID) | PROF | R2§A Q2; R1 strengths (Parent input) | never |
| PQ-INTRO-07 | PQ·א·Q3 | תחומי העניין (12 אפשרויות) · Interests (12 options) | covered | PP.who.interests vocabulary: split (drawing+crafts, stories+books), approximate (dancing, technology), so no round trip | **PP.who.interests_pq**{selected[pq_interests], other}; legacy PP.who.interests derived through `maps_to` | PW2 (12 source chips); PV§A; OV interests | PROF; OPT | R2§A Q3; R1 interests | label (mapped keys, ≤3) |
| PQ-INTRO-08 | PQ·א·Q3 | אחר · Other interest (free text) | covered | `{custom}`≤120 in who.interests; a parent-only custom never reaches content (staff_confirmed) | PP.who.interests_pq.other ≤500 (projected as custom ≤120); staff "Confirm" adds source `teacher` | PW2 "Other" box; PV§A; OV interests "Confirm" | PROF | R2§A Q3 "Other" | label only after a teacher confirms |
| PQ-INTRO-09 | PQ·א | מה במיוחד מושך את הילד? · What especially draws the child | covered | PP.who.motivators (reward vocabulary; merged list never displayed, not in AIContext) | PP.who.what_attracts (text) | PW2; PV§A; OV interests note | PROF | R2§A; R1 interests | never |

#### 2.1.2 ב. מה משמח את הילד שלי?
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-SEC-02 | PQ·ב | ב. מה משמח את הילד שלי? · B. What makes my child happy (heading) | covered | no step or heading | PP.joy (new section) | PW2 | SRC | R2§B | n/a |
| PQ-JOY-01 | PQ·ב·Q4 | מה גורם להרגיש שמח, בטוח ומצליח · Happy, safe, successful | covered | none (motivators is INTRO-09's slot) | PP.joy.happy_safe_successful | PW2; PV§B; OV what-helps (PARENT SAID) | PROF | R2§B Q4; R1 | never |
| PQ-JOY-02 | PQ·ב·Q5 | מה אוהב לעשות בבית · Likes doing at home | covered | none | PP.joy.likes_at_home | PW2; PV§B | PROF | R2§B Q5; R1 interests | never |
| PQ-JOY-03 | PQ·ב·Q6 | פעילות שבה יכול להתמיד · Activity the child persists at | covered | none (strength key `persistence` is only a flag) | PP.joy.persists_at{value yes/no?, text} | PW2 (yes → "Which?") | PROF | R2§B Q6; R1 strengths | never |
| PQ-JOY-04 | PQ·ב·Q7 | מצטיין / יכולת מיוחדת · Excels / special ability | covered | PP.who.strengths keys/chips; verbatim answer lost | PP.joy.special_ability{value?, text, strength_keys[]} → keys to PP.who.strengths | PW2; PV§B; OV strengths | PROF | R2§B Q7; R1 strengths | label (keys); text never |

#### 2.1.3 ג. העולם הרגשי
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-SEC-03 | PQ·ג | ג. העולם הרגשי · C. Emotional world (heading) | covered | merged with transitions in wizard step 3 | PP.emotions | PW3 | SRC | R2§C | n/a |
| PQ-EMO-01 | PQ·ג·Q8 | כאשר עצוב, מה עוזר · When sad, what helps | covered | PP.emotions.helps_when_sad chips (collapsed); no free text | PP.emotions.when_sad_text + helps_when_sad (optional chips) | PW3; PV§C; OV what-helps | PROF | R2§C Q8; R1 | label (keys); text never |
| PQ-EMO-02 | PQ·ג·Q9 | כשכועס/מתוסכל – תגובה (8 אפשרויות) · Reaction when angry/frustrated | covered | PP.emotions.frustration_reactions: `מתפרץ` has no key; `מתקשה להירגע` reworded | **PP.emotions.frustration_pq**{selected[pq_frustration_reactions], other}; legacy list derived | PW3; PV§C; TO/D1 "Parent said" | PROF | R2§C Q9; R1 emotional | never |
| PQ-EMO-03 | PQ·ג·Q9 | אחר · Other reaction | covered | `{custom}`≤120 in frustration_reactions | PP.emotions.frustration_pq.other ≤500 | PW3; PV§C | PROF | R2§C Q9 "Other" | never |
| PQ-EMO-04 | PQ·ג·Q10 | הדרך הטובה ביותר להרגיע · Best way to calm | covered | calming_helps (→ CPL.what_helps) + calming_notes (not merged; collapsed) | unchanged; calming_notes ≤4000, no longer collapsed | PW3; PV§C; OV what-helps | PROF | R2§C Q10; R1 | label (keys); text never |
| PQ-EMO-05 | PQ·ג·Q11 | מצבים או אנשים חדשים · New situations / people | covered | none | PP.emotions.new_situations | PW3; PV§C | PROF | R2§C Q11 | never |
| PQ-EMO-06 | PQ·ג·Q12 | מצבים שעלולים להציף או להלחיץ · Situations that may overwhelm/stress | covered | sensory only (environment.items[].what_happens / notes) | PP.emotions.overwhelming_situations{value?, text} | PW3; PV§C; OV good-to-know | PROF | R2§C Q12 | never |
| PQ-EMO-07 | PQ·ג | מה חשוב שהגננת תדע במצבים אלה · What the teacher should know | covered | sensory helps only | PP.emotions.overwhelm_teacher_should_know | PW3 (after Q12); PV§C; OV good-to-know | PROF | R2§C | never |

#### 2.1.4 ד. הילד שלי והפרידה בבוקר
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-SEC-04 | PQ·ד | ד. הפרידה בבוקר · D. Morning separation (heading) | covered | no step; one collapsed parent-only field | PP.separation (new) | PW3 | SRC | R2§D | n/a |
| PQ-SEP-01 | PQ·ד·Q13 | כיצד נפרד בבוקר (בקלות/זקוק לזמן/מתקשה מאוד/משתנה) · How the child separates | covered | PP.emotions.morning_separation; `needs_a_lot_of_support` ≠ "מתקשה מאוד"; collapsed | **PP.separation.morning** (pq_morning_separation: easily/needs_time/very_difficult/varies); legacy key derived | PW3; PV§D; TO/D1 item 04 "Parent said" | PROF | R2§D Q13; R1 | never |
| PQ-SEP-02 | PQ·ד·Q14 | מה עוזר להיפרד ולהיכנס לגן · What helps entry | covered | generic transition_helps keys | PP.separation.what_helps_entry{text, keys[transition_helps]} | PW3; PV§D; OV what-helps | PROF | R2§D Q14 | label (keys); text never |
| PQ-SEP-03 | PQ·ד·Q15 | חפץ מעבר או שגרת פרידה · Transitional object / goodbye routine | covered | keys favorite_object / goodbye_routine only | PP.separation.transition_object{value, text} | PW3; PV§D; OV good-to-know | PROF | R2§D Q15 | never |

#### 2.1.5 ה. קשרים חברתיים
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-SEC-05 | PQ·ה | ה. קשרים חברתיים · E. Social (heading) | covered | merged with communication in step 4 | PP.social | PW4 | SRC | R2§E | n/a |
| PQ-SOC-01 | PQ·ה·Q16 | כיצד יוצר קשר עם ילדים (6) · How the child makes contact | covered | PP.social.social keys only; two meanings shifted; no "other" | **PP.social.contact_pq**{selected[pq_social_contact], other}; legacy derived | PW4; PV§E; TO/D2 "Parent said" | PROF | R2§E Q16 | never |
| PQ-SOC-02 | PQ·ה·Q16 | אחר · Other | covered | cannot be selected (Keys, no custom) | PP.social.contact_pq.other | PW4; PV§E | PROF | R2§E Q16 "Other" | never |
| PQ-SOC-03 | PQ·ה·Q17 | כשילד לוקח משחק או לא מסכים · Reaction to toy-taking / disagreement | covered | keys handles_conflict_well / needs_help_with_conflict + shared comments | PP.social.conflict_reaction | PW4; PV§E | PROF | R2§E Q17 | never |
| PQ-SOC-04 | PQ·ה·Q18 | חברים משמעותיים · Significant friends | covered | only the catch-all `comments` | PP.social.significant_friends{value, text} (sensitivity `third_party`) | PW4; PV§E (staff only) | PROF | R2§E Q18 | never (third-party names) |
| PQ-SOC-05 | PQ·ה·Q19 | מה עוזר להצליח במפגש חברתי · What helps socially | covered | only the catch-all `comments` | PP.social.what_helps_socially | PW4; PV§E; OV what-helps | PROF | R2§E Q19 | never |

#### 2.1.6 ו. תקשורת ושפה
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-SEC-06 | PQ·ו | ו. תקשורת ושפה · F. Communication & language (heading) | covered | merged into step 4 | PP.communication (new section) | PW4 | SRC | R2§F | n/a |
| PQ-COM-01 | PQ·ו·Q20 | כיצד מביע צרכים ורצונות (6) · How needs are expressed | covered | PP.social.communication keys only; "crying" lost; "turns to adult" reworded | **PP.communication.expresses_needs**{selected[pq_express_needs], other}; legacy derived | PW4; PV§F; TO/D3 "Parent said" | PROF | R2§F Q20 | never |
| PQ-COM-02 | PQ·ו·Q20 | אחר · Other | covered | cannot be selected | PP.communication.expresses_needs.other | PW4; PV§F | PROF | R2§F "Other" | never |
| PQ-COM-03 | PQ·ו·Q21 | אוהב לספר על חוויות (מאוד/לפעמים/מעט) · Likes telling experiences | covered | flag tells_about_experiences, no degree | PP.communication.tells_experiences (pq_degree) | PW4; PV§F | PROF | R2§F Q21 | never |
| PQ-COM-04 | PQ·ו·Q22 | שפה נוספת בבית (לא/כן) · Another home language | covered | CH.additional_languages (staff Step 1); empty = "no" or "not answered" | PP.communication.home_language{value yes/no, languages[], other_text}; on save, union into CH.additional_languages (audited) | PW4; PV§F; HDR languages | PROF; CHILD | R2§F Q22; headers | never |
| PQ-COM-05 | PQ·ו·Q22 | כן. איזו? · Which language | covered | key `other` without text | PP.communication.home_language.other_text | PW4; PV§F | PROF | R2§F | never |
| PQ-COM-06 | PQ·ו·Q23 | משהו בשפה/תקשורת שהגננת תדע · Language notes for the teacher | covered | only the catch-all `comments` | PP.communication.teacher_should_know | PW4; PV§F; TO/D3 note | PROF | R2§F Q23 | never |

#### 2.1.7 ז. עצמאות ותפקודי יום־יום
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-SEC-07 | PQ·ז | ז. עצמאות ותפקודי יום־יום · G. Independence (heading) | covered | wizard step 5 "Everyday independence" | PP.independence | PW5 | SRC | R2§G | n/a |
| PQ-IND-01 | PQ·ז | סמנו את רמת העצמאות (תחום / עצמאי / זקוק לעזרה) · Table instruction | covered | grid shows 4 teacher levels including "Not observed" | REG; parent mode shows 2 columns + optional "a little / a lot" | PW5; PV§G | SRC | R2§G table header | n/a |
| PQ-IND-02 | PQ·ז | אכילה · Eating | covered | PP.independence.levels.eating (4 levels) | **PP.independence.levels_pq.eating** (independent/needs_help) + legacy levels derived | PW5; PV§G; TO/D8 parent column | PROF | R2§G; R1; R3§8 parent column | domain (only for independence requests) |
| PQ-IND-03 | PQ·ז | שתייה · Drinking | covered | PP.independence.levels.drinking | PP.independence.levels_pq.drinking | PW5; PV§G; TO/D8 | PROF | R2§G; R3§8 | domain |
| PQ-IND-04 | PQ·ז | שירותים · Toileting | covered | PP.independence.levels.toilet | PP.independence.levels_pq.toilet | PW5; PV§G; TO/D8 | PROF | R2§G; R3§8 | domain (level only, never text) |
| PQ-IND-05 | PQ·ז | רחיצת ידיים · Hand washing | covered | PP.independence.levels.washing_hands | PP.independence.levels_pq.washing_hands | PW5; PV§G; TO/D8 | PROF | R2§G; R3§8 | domain |
| PQ-IND-06 | PQ·ז | לבוש · Dressing | covered | PP.independence.levels.dressing | PP.independence.levels_pq.dressing | PW5; PV§G; TO/D8 | PROF | R2§G; R3§8 | domain |
| PQ-IND-07 | PQ·ז | נעילת נעליים · Shoes | covered | PP.independence.levels.shoes | PP.independence.levels_pq.shoes | PW5; PV§G; TO/D8 | PROF | R2§G; R3§8 | domain |
| PQ-IND-08 | PQ·ז | סידור משחקים · Tidying toys | covered | PP.independence.levels.tidying_toys | PP.independence.levels_pq.tidying_toys | PW5; PV§G; TO/D8 | PROF | R2§G; R3§8 | domain |
| PQ-IND-09 | PQ·ז | שמירה על חפצים · Looking after belongings | covered | PP.independence.levels.keeping_belongings; grid also shows starting/finishing_activity | PP.independence.levels_pq.keeping_belongings; parent mode hides the 2 teacher-only rows | PW5; PV§G; TO/D8 | PROF | R2§G (8 source rows only); R3§8 | domain |
| PQ-IND-10 | PQ·ז·Q24 | באילו פעולות עדיין עוזרים · What you still help with | covered | shared PP.independence.notes (with Q25) | PP.independence.still_helping | PW5; PV§G | PROF | R2§G Q24 | never |
| PQ-IND-11 | PQ·ז·Q25 | הרגלים או שגרות לשמור בגן · Routines to keep | covered | shared PP.independence.notes | PP.independence.routines_to_keep | PW5; PV§G; OV good-to-know | PROF | R2§G Q25 | never |

#### 2.1.8 ח. שינה, אכילה ובריאות (sensitive: never sent to AI)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-SEC-08 | PQ·ח | ח. שינה, אכילה ובריאות · H. Sleep, eating & health (heading) | covered | none (PLAN A10; superseded per OQ-1) | PP.health (new; registry sensitivity `health`) | PW6 + privacy notice "Stays inside the kindergarten team" | SRC | R2§H, R1 health (only with include_health) | never |
| PQ-HLT-01 | PQ·ח·Q26 | כיצד ישן · Sleep | covered | none | PP.health.sleep | PW6; PV§H ("Private") | PROF | R2§H; R1 (include_health) | never |
| PQ-HLT-02 | PQ·ח·Q27 | רגישות למזון / העדפות / קשיי אכילה · Food | covered | only the sensitivity key `certain_foods`, **sent today as `avoid`** | PP.health.food{text, flags[allergy/preference/eating_difficulty]} | PW6; PV§H; OV staff-only "Food note on file" | PROF | R2§H; R1 (include_health) | never (remove from `avoid`) |
| PQ-HLT-03 | PQ·ח·Q28 | רגישות לרעש, מגע, בגדים, לכלוך, ריחות, מרקמים · Sensory sensitivity (one text question) | covered | environment.items keys + what_happens; parent keys go to the AI | PP.health.sensory{text, keys[]}; keys projected to PP.environment.items (keys only) | PW6 (text + optional chips); PV§H; TO/D9 "Parent said" | PROF | R2§H; R3§9 parent note | never |
| PQ-HLT-04 | PQ·ח·Q29 | מגבלה, רגישות או הנחיה רפואית · Medical limitation / instruction | covered | none (A10) | PP.health.medical{value, text} (sensitivity `medical`; export audited) | PW6; PV§H alert card; OV "Medical note on file" | PROF | R2§H; R1 (include_health) | never |

#### 2.1.9 ט. גבולות והתנהגות
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-SEC-09 | PQ·ט | ט. גבולות והתנהגות · I. Boundaries & behaviour (heading) | covered | none | PP.behaviour (new) | PW7 | SRC | R2§I | n/a |
| PQ-BEH-01 | PQ·ט·Q30 | כיצד מציבים גבולות בבית · Boundaries at home | covered | none | PP.behaviour.boundaries_at_home (sensitivity `family`) | PW7; PV§I | PROF | R2§I Q30 | never |
| PQ-BEH-02 | PQ·ט·Q31 | מה עובד היטב · What works well | covered | none | PP.behaviour.what_works (staff may promote to CPL.what_helps; stays PARENT SAID) | PW7; PV§I; OV what-helps | PROF | R2§I Q31; R1 | never |
| PQ-BEH-03 | PQ·ט·Q32 | מה אינו עובד · What does not work | covered | PP.emotions.what_does_not_help (reads as "calming", step 3) | PP.behaviour.what_does_not_work (legacy value shown as "earlier answer") | PW7; PV§I | PROF | R2§I Q32 | never |
| PQ-BEH-04 | PQ·ט·Q33 | מה עוזר לשתף פעולה כשמסרב · Helps cooperation | covered | none | PP.behaviour.helps_cooperation | PW7; PV§I; OV what-helps | PROF | R2§I Q33 | never |

#### 2.1.10 י. שינויים ומעברים
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-SEC-10 | PQ·י | י. שינויים ומעברים · J. Changes & transitions (heading) | covered | folded into step 3 | PP.transitions (new) | PW7 | SRC | R2§J | n/a |
| PQ-TRN-01 | PQ·י·Q34 | הפסקת פעילות אהובה (5) · Stopping a loved activity | covered | single PP.emotions.transition_reaction; "מתקשה מאוד" mapped to needs_adult_support | **PP.transitions.stopping_activity**{selected[pq_stop_activity]} ("easily" is exclusive); legacy derived | PW7; PV§J; TO/D4 item 09 "Parent said" | PROF | R2§J Q34 | never |
| PQ-TRN-02 | PQ·י·Q35 | האם הכנה מראש עוזרת (כן/לא/לפעמים) · Does preparation help | covered | none | PP.transitions.preparation_helps (yes_no_sometimes) | PW7; PV§J | PROF | R2§J Q35 | never |
| PQ-TRN-03 | PQ·י | איזו הכנה עוזרת? · Which preparation | covered | transition_helps keys only | PP.transitions.which_preparation{text, keys[transition_helps]} | PW7 (after yes/sometimes); PV§J; OV what-helps | PROF | R2§J | label (keys); text never |

#### 2.1.11 יא. הילד שלי בגן – מה חשוב לי מהגננת?
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-SEC-11 | PQ·יא | יא. מה חשוב לי מהגננת · K. Expectations (heading) | covered | step 7 "What matters most now" (different heading) | PP.expectations (new) | PW8 | SRC | R2§K | n/a |
| PQ-EXP-01 | PQ·יא·Q36 | הדבר החשוב ביותר שהגננת תדע · Most important thing to know | covered | PP.priorities.one_thing_to_know (shared with the heart message; never displayed) | PP.expectations.most_important; legacy one_thing_to_know derived | PW8; PV§K; OV good-to-know | PROF | R2§K Q36; R1 | never |
| PQ-EXP-02 | PQ·יא·Q37 | מה ירגיש בגן (9) · How the child should feel | covered | PP.priorities.hope_child_feels keys only; he label for "safe" differs | PP.expectations.hope_child_feels{selected, other}; legacy derived; he label → "בטוח/ה" | PW8; PV§K; OV "Family hopes" | PROF | R2§K Q37 | never |
| PQ-EXP-03 | PQ·יא·Q37 | אחר · Other feeling | covered | shared priorities_note (next to the question) | PP.expectations.hope_child_feels.other | PW8; PV§K | PROF | R2§K "Other" | never |
| PQ-EXP-04 | PQ·יא·Q38 | מה יפתח השנה (מיכל) · What to develop this year (container) | covered | parent_priorities keys + one note; FocusPicker badges them (suggest only) | PP.expectations.develop{…}; legacy parent_priorities derived from non-empty domains | PW8 (6 labelled boxes); PV§K; PL "Family hopes" panel | PROF | R2§K Q38; R5 family hopes | never (reaches the AI only via a teacher-created focus) |
| PQ-EXP-05 | PQ·יא·Q38 | רגשית · Emotionally | covered | key `emotional` + shared note | PP.expectations.develop.emotional.text | PW8; PV§K; PL | PROF | R2§K | never |
| PQ-EXP-06 | PQ·יא·Q38 | חברתית · Socially | covered | key `social` + shared note | PP.expectations.develop.social.text | PW8; PV§K; PL | PROF | R2§K | never |
| PQ-EXP-07 | PQ·יא·Q38 | שפתית · Language | covered | key `language` + shared note | PP.expectations.develop.language.text | PW8; PV§K; PL | PROF | R2§K | never |
| PQ-EXP-08 | PQ·יא·Q38 | מוטורית · Motor | covered | key `motor` + shared note | PP.expectations.develop.motor.text | PW8; PV§K; PL | PROF | R2§K | never |
| PQ-EXP-09 | PQ·יא·Q38 | עצמאות · Independence | covered | key `independence` + shared note | PP.expectations.develop.independence.text | PW8; PV§K; PL | PROF | R2§K | never |
| PQ-EXP-10 | PQ·יא·Q38 | תחום נוסף · Additional area (name + goal) | covered | key `other`, no area name | PP.expectations.develop.other{area, text} | PW8; PV§K; PL | PROF | R2§K "Additional area: {area}" | never |

#### 2.1.12 יב. הבית והגן – שותפות (family context: never sent to AI)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-SEC-12 | PQ·יב | יב. הבית והגן – שותפות · L. Partnership (heading) | covered | none | PP.partnership (new; sensitivity `family`) | PW8 | SRC | R2§L | never |
| PQ-PRT-01 | PQ·יב·Q39 | איך לעדכן כשעולה קושי (5) · Preferred update channel | covered | `lists.contact_preferences` exists but nothing uses it | PP.partnership.contact_channels{selected[contact_preferences (+`other`)], other} | PW8; PV§L; OV staff line "How to reach the family" | PROF | R2§L Q39; R1 partnership | never |
| PQ-PRT-02 | PQ·יב·Q39 | אחר · Other channel | covered | none | PP.partnership.contact_channels.other | PW8; PV§L | PROF | R2§L "Other" | never |
| PQ-PRT-03 | PQ·יב·Q40 | מה חשוב לכם בתקשורת עם הגננת · What matters in communication | covered | none | PP.partnership.communication_matters | PW8; PV§L; OV next to "How to reach" | PROF | R2§L Q40; R1 | never |
| PQ-PRT-04 | PQ·יב·Q41 | מידע נוסף על הילד או המשפחה · Additional child/family information | covered | none (`environment.notes` is a catch-all) | PP.partnership.family_context (sensitivity `family`) | PW8 (privacy hint); PV§L "Private" | PROF | R2§L Q41 (include_family) | never |

#### 2.1.13 יג. "משפט מהלב"
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-SEC-13 | PQ·יג | יג. "משפט מהלב" · M. Message from the heart (heading) | covered | no heading or card | PP.heart (new) | PW9 | SRC | R2§M | n/a |
| PQ-HRT-01 | PQ·יג | אם הייתם יכולים לומר לגננת דבר אחד… · One thing before she meets the child | covered | shares one_thing_to_know with Q36; never shown on the staff profile | **PP.heart.message** (own field, never merged with Q36) | PW9 (last step before Send); **OV "From the heart" card** (prominent, staff only); PV§M | PROF | R2§M; R1 opening box (authorized export) | never |

#### 2.1.14 חלק הגננת (Teacher's part = Teacher Quick Baseline / bridge)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| PQ-TCH-01 | PQ·teacher | הגננת תמלא לאחר קריאת שאלון ההורה · Teacher fills after reading (instruction) | covered | no step after the questionnaire | TP.bridge (new section) + QB.based_on{parent_version_id, read_at}; PSS.bridge | QB page; OV prompt "Family answers received: 2-minute quick baseline" | PROF (teacher, bridge) | R2 closing "Teacher's first reading" (staff export); R3 intro | n/a |
| PQ-TCH-02 | PQ·teacher | 3 חוזקות מרכזיות · 3 main strengths | covered | TP.who.strengths, any count, not "main" | QB.main_strengths[exactly 3 when status=sufficient]{key/custom, note?} → CPL.strengths (`main:true`, source teacher) | QB (suggestions from PQ Q2/Q7); OV strengths ⭐ | PROF | R2 teacher part; R3 QB; R1; R4 | label |
| PQ-TCH-03 | PQ·teacher | 3 דברים שחשוב לי לזכור · 3 things to remember | covered | none | QB.remember[≤3 {text≤300}; exactly 3 when status=sufficient] | QB; OV "Remember" card (staff) | PROF | R3 QB; R1 | never |
| PQ-TCH-04 | PQ·teacher | מה מרגיע ומסייע לילד · What calms/helps | covered | parallel staff wizard step 3 (calming/transition helps), not tied to reading the parent answers | QB.calms_helps{items[calming_helps/what_helps/custom], text} → CPL.what_helps | QB; OV what-helps | PROF | R3 QB; R1 (the keys also feed the merged what-helps list) | label (keys) |
| PQ-TCH-05 | PQ·teacher | מה עשוי להקשות עליו · What may make things difficult | covered | sensory what_happens / what_does_not_help only | QB.may_be_difficult (wording check like reviews) | QB; OV good-to-know; hint in TO/D1 item 08 | PROF | R3 QB; R1 | never |
| PQ-TCH-06 | PQ·teacher | תחום ראשון להתבוננות · First area to observe | covered | only by creating a Current Focus | QB.first_area_to_observe{domain (observation_domains), note}; sets that domain to `in_progress`; suggests (never creates) a focus | QB; TO highlights the domain; QO defaults to it | PROF | R3 QB; R1 | domain (key only); note never |
| PQ-TCH-07 | PQ·teacher | שאלה שארצה לברר עם ההורה · Question to clarify with the parent | covered | none | QB.question_for_parent{text, status open/clarified, clarified_at?, outcome_note?} (teacher-private) | QB; OV reminder until clarified | PROF | excluded by default; R1 only with include_private_notes | never |
| PQ-TCH-08 | PQ·teacher | 🌱 משפט מסכם לגננת · Summary motto (display) | covered | none | REG i18n | QB header; TO.guide | SRC | R3 intro line | n/a |
| PQ-TCH-09 | PQ·teacher | בסיס למפגש היכרות של 10–15 דקות · Basis for a 10–15 min meeting (display) | covered | staff on-behalf entry + `entered` stamps; no meeting mode or meeting date | PQM.entry_mode (self/on_behalf/meeting) + PQM.meeting{date, attendees[relations]}; stamps gain `mode` | PV "Fill in together with the family" (meeting mode, PW1–PW9 one card at a time) | PROF (`questionnaire`) | R2 header "Recorded by {teacher} at a meeting on {date}" | never |

### 2.2 Observation model: מודל תצפית, הערכה ותוכנית התערבות לילד בגיל הרך – 3–5 שנים

The verbatim source text lives in `backend/app/data/source/observation_model.json` as `source_he` and is never rendered. UI and PDF labels follow `docs/terminology.md`; banned source wording is listed in OQ-3. Indicator rows use the one support scale (PLAN-ADJUSTMENTS §C): עצמאי = `independent`, בתיווך = `some_support`, מתקשה = `significant_support`, plus `not_observed`.

#### 2.2.0 Front matter, א. פרטי הילד, ב. עקרונות, functional-level format
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D00-HDR | OM·headings | מטרת המודל / א. פרטי הילד / ב. עקרונות לתצפית מקצועית / עקרון מנחה לגננת · Section headings | covered | no grouping anywhere | REG `observation_model.sections[]` | TO.hdr, TO.guide, TO footer line | SRC | R3 headings | n/a |
| OM-D00-01 | OM·title | מודל תצפית, הערכה ותוכנית התערבות לילד בגיל הרך – 3–5 שנים · Document title | covered | only the i18n `observations.model.title` "Observation model (optional)" in QO | REG meta.title (adapted wording) + meta.source_title_he (traceability only) | TO "About this observation" sheet | SRC | R3 source-attribution line; appendix "Source documents" | n/a |
| OM-D00-02 | OM·title | כלי עבודה מקצועי לגננת – תמונה תפקודית הוליסטית… · Subtitle | covered | none | REG meta.subtitle (neutral: "a whole picture of the child, areas for support and a tailored response") | TO about sheet | SRC | R3 subtitle | n/a |
| OM-D00-03 | OM·purpose | מטרת המודל: … · Purpose of the model | covered | none | REG meta.purpose (1–2 sentences) | TO one-line intro; about sheet (shown once, then collapsed via localStorage) | SRC | R3 intro paragraph | n/a |
| OM-D00-04 | OM·purpose | אין לראות בו כלי אבחוני או תחליף לאבחון מקצועי · Not a diagnostic tool | covered | enforced (banned_terms, safety.py, prompts) but never stated; the source words hit `banned_terms` ("אבחון") | REG meta.disclaimer + report messages; exact sentences added to `allow_phrases` (OQ-3) | TO header note (muted); RP dialog | PDF | footer of every report | never (AI rules unchanged: never diagnose) |
| OM-D00-05 | OM·footer | מודל תצפית והערכת תפקוד הילד בגיל הרך \| כלי עבודה לגננת · DOCX page footer | covered | only in `word/footer1.xml` | REG meta.footer (adapted; no "הערכת תפקוד") | n/a | PDF | R3 page footer (+ disclaimer + page x/y) | n/a |
| OM-D00-11 | OM·א | שם הילד · Child's name | covered | CH.name (+preferred_name); baseline snapshot | CH.name + TAH.child_snapshot.name | TO.hdr (read-only) | TA-H | headers; R3§A | never |
| OM-D00-12 | OM·א | גיל · Age | covered | derived from birth_date | TAH.child_snapshot.age_at_fill{years, months} | TO.hdr | TA-H | R3§A (age at fill date) | label (age in years) |
| OM-D00-13 | OM·א | תאריך לידה · Date of birth | covered | CH.birth_date | TAH.child_snapshot.birth_date | TO.hdr | TA-H | R3§A | never |
| OM-D00-14 | OM·א | שם הגן · Kindergarten | covered | CL.kindergarten via class_id | TAH.child_snapshot.{class_name, kindergarten} | TO.hdr; HDR shows kindergarten | TA-H | headers; R3§A | never |
| OM-D00-15 | OM·א | שם הגננת · Teacher's name | covered | no field; class_teachers may hold several teachers | TAH.teacher_id (FK users) + child_snapshot.teacher_name | TO.hdr "Teacher" select | TA-H | R3§A | never |
| OM-D00-16 | OM·א | תאריך מילוי · Date filled in | covered | no assessment instance (only section stamps) | TAH.filled_on (date, default today) | TO.hdr; cycle switcher | TA-H | R3§A | never |
| OM-D00-17 | OM·א | תקופת התצפית · Observation period | covered | none | TAH.period_from / period_to / period_note | TO.hdr date range | TA-H | R3§A; default R3 range | never |
| OM-D00-18 | OM·א | מי מילא/ה · Filled in by | covered | stamps only | TAH.created_by + filled_by_text; entries carry entered_by/entered_role | TO.hdr | TA-H | R3§A + "Teacher observation" tag | never |
| OM-D00-21 | OM·ב | להתבונן במצבים טבעיים ומגוונים · Natural, varied situations | covered | observation_contexts in QO; no guidance | REG `observation_principles.natural_varied_situations` | TO.guide (collapsible, 7 one-liners); hint "no observations yet in: …" | OPT | R3 principles box | n/a |
| OM-D00-22 | OM·ב | לתאר התנהגות נצפית ולא פרשנות · Behaviour, not interpretation | covered | QO placeholder; prompts use observational language | REG `behaviour_not_interpretation` | TO.guide; rotating QO tip | OPT | R3 principles box | n/a |
| OM-D00-23 | OM·ב | תדירות, עוצמה, משך והקשר · Frequency, intensity, duration, context | covered | context only (OBS.context, details.when) | REG `frequency_intensity_duration_context` + **OBS.attributes**{frequency (observation_frequency), duration_minutes?, intensity?} (descriptive, never a score) | TO.guide; QO "More details" chips | OPT; OBSV | R3 principles box; observation tables | domain (frequency/duration keys) |
| OM-D00-24 | OM·ב | עצמאי לעומת בתיווך · Independent vs with mediation | covered | support_levels exist; not applied per indicator | REG `independent_vs_supported`; the scale applies per indicator (OM-D01-00) | TO.guide + tooltip on every level column | OPT | R3 principles box | n/a |
| OM-D00-25 | OM·ב | לצד כל צורך – חוזקות ותחומי עניין · Strengths alongside needs | covered | profile shows strengths first; FA.plan.strength_used | REG `strengths_alongside_needs` + optional `TA.<d>.strengths_here[]` per item domain | TO.guide; "Strengths seen here" chips on each domain card | OPT; TA-D | R3 box; per-domain strengths | label |
| OM-D00-26 | OM·ב | להימנע מהשוואה לא מותאמת בין ילדים · No inappropriate comparison | covered | by design: no comparison views, no scores | REG `no_inappropriate_comparison` | TO.guide | OPT | R3 box | n/a |
| OM-D00-26b | OM·ב | ההתייחסות תלוית גיל, הקשר והתפתחות · Interpret by age, context, development | covered | not shown; source items use age-norm wording that terminology.md bans | REG `interpret_by_age_context_development`; age at fill date in TO.hdr | TO.guide | OPT | R3 box | n/a |
| OM-LEVEL | OM·D2–D10 (SPEC-UPDATE) | Functional levels for the bulleted indicators of D2–7 and D10: level + note | covered | D2–D7 and D10 have no answer format; today they exist as binary chips or nothing | every item in an item domain = `{level, note≤500, seen_in?, observation_ids?}` (`schemas/assessments.py`); D9 is descriptive (no level) | every item row: 4 taps + note icon | TA-D | R3 tables | domain |

#### 2.2.1 Domain 1: תחום רגשי
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D01-T | OM·1 | 1. תחום רגשי · Emotional (domain title) | covered | no domain entity | REG domain `emotional`; status in TAH.domains.emotional.status | TO/D1 card + status pill | SRC | R3§1 heading | n/a |
| OM-D01-00 | OM·1 table | מדד \| רמת תפקוד \| הערות · Indicator / functional level / notes | covered | support_levels exist; no indicator × level × note table; QO offers 3 levels | `TA.<d>.items.<item>` = {level (CHECK support scale), note≤500}; unrated = not_observed | column header "How much support was needed?" (never "רמת תפקוד"); 4 taps + note | TA-D | R3: Indicator / Support needed / Notes (RTL column order) | domain (level; notes never) |
| OM-D01-01 | OM·1 | מזהה רגשות בסיסיים · Recognizes basic emotions | covered | none (QO `area` is settable only through a focus) | TA.emotional.items.recognizes_basic_emotions | TO/D1 | TA-D(emotional) | R3§1; R1 | domain |
| OM-D01-02 | OM·1 | מביע רגשות באופן מותאם · Expresses emotions appropriately | covered | TP.emotions.frustration_reactions chips only | TA.emotional.items.expresses_feelings_appropriately | TO/D1 | TA-D(emotional) | R3§1; R1 | domain |
| OM-D01-03 | OM·1 | נרגע לאחר תסכול · Calms after frustration | covered | chip takes_time_to_calm + calming_helps; focus suggestion | TA.emotional.items.calms_after_frustration | TO/D1 | TA-D(emotional) | R3§1; R1 | domain |
| OM-D01-04 | OM·1 | מתמודד עם פרידה מהורה · Copes with parent separation | covered | parent-only PP.emotions.morning_separation; focus suggestion | TA.emotional.items.copes_with_separation (PP.separation.morning shown beside it as PARENT SAID, never merged) | TO/D1 + "Parent said" hint | TA-D(emotional) | R3§1; R1 parent vs teacher | domain |
| OM-D01-05 | OM·1 | מקבל שינוי בשגרה · Accepts routine change | covered | one transition_reaction shared with D04-09/10 | TA.emotional.items.accepts_routine_change | TO/D1 | TA-D(emotional) | R3§1; R1 | domain |
| OM-D01-06 | OM·1 | מבקש עזרה בעת צורך · Asks for help | covered | chip asks_adult_help; focus asking_for_help | TA.emotional.items.asks_for_help | TO/D1 | TA-D(emotional) | R3§1; R1 | domain |
| OM-D01-07 | OM·1 | מגלה ביטחון בסביבה · Feels secure in the environment | covered | none | TA.emotional.items.feels_secure | TO/D1 | TA-D(emotional) | R3§1; R1 | domain |
| OM-D01-08 | OM·1 | מה מעורר קושי · What triggers difficulty (half of a combined line, split per SPEC-UPDATE) | covered | what_does_not_help / what_happens / details.when; no trigger field | TA.emotional.fields.what_makes_it_harder{text≤1000, contexts[]} | TO/D1 "What seems to make it harder?" (hint from QB.may_be_difficult) | TA-D(emotional) | R3§1 | never (text); contexts → domain |
| OM-D01-09 | OM·1 | מה מסייע לילד להירגע · What helps the child calm | covered | TP.emotions.calming_helps/notes → CPL.what_helps | TA.emotional.fields.what_helps_calm{items, text}; "Add to What helps" → CPL.what_helps (source `observation`) | TO/D1; OV what-helps | TA-D; TA-APPLY | R3§1; R1 | label (keys) |

#### 2.2.2 Domain 2: תחום חברתי
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D02-T | OM·2 | 2. תחום חברתי · Social (domain title) | covered | no domain entity | REG domain `social` | TO/D2 | SRC | R3§2 | n/a |
| OM-D02-01 | OM·2 | יוזם קשר עם ילדים · Initiates contact | covered | chip initiates_play (binary) | TA.social.items.initiates_contact | TO/D2 (earlier chip shown as a hint) | TA-D(social) | R3§2; R1 | domain |
| OM-D02-02 | OM·2 | מצטרף למשחק קיים · Joins existing play | covered | chips joins_existing_play / needs_adult_support_to_join | TA.social.items.joins_existing_play | TO/D2 | TA-D(social) | R3§2; R1 | domain |
| OM-D02-03 | OM·2 | משתף במשחק ובחפצים · Shares play/objects | covered | focus suggestion sharing_toys only | TA.social.items.shares_play_and_objects | TO/D2 | TA-D(social) | R3§2; R1 | domain |
| OM-D02-04 | OM·2 | ממתין לתורו · Waits for turn | covered | chip learning_turn_taking (one-sided) | TA.social.items.waits_for_turn | TO/D2 | TA-D(social) | R3§2; R1 | domain |
| OM-D02-05 | OM·2 | מקבל גבולות · Accepts boundaries | covered | none | TA.social.items.accepts_boundaries | TO/D2 | TA-D(social) | R3§2; R1 | domain |
| OM-D02-06 | OM·2 | פותר קונפליקט בעזרת תיווך · Resolves conflict with support | covered | chips handles_conflict_well / needs_help_with_conflict | TA.social.items.resolves_conflict_with_support (hint "Independent = without an adult") | TO/D2 | TA-D(social) | R3§2; R1 | domain |
| OM-D02-07 | OM·2 | מגלה אמפתיה והתחשבות · Empathy & consideration | covered | strength chip `empathy` only | TA.social.items.shows_empathy (at `independent`, offers "add strength empathy") | TO/D2 | TA-D(social); TA-APPLY | R3§2; R1 | domain |
| OM-D02-08 | OM·2 | משתתף במשחק קבוצתי · Takes part in group play | covered | chip enjoys_group_activities (enjoyment, not participation) | TA.social.items.joins_group_play | TO/D2 | TA-D(social) | R3§2; R1 | domain |
| OM-D02-09 | OM·2 | יוצר קשר עם ילדים שונים · Interacts with different children | covered | inverse chip prefers_familiar_children | TA.social.items.connects_with_different_children | TO/D2 | TA-D(social) | R3§2; R1 | domain |
| OM-D02-10 | OM·2 | תצפית מרכזית · Main observation | covered | shared TP.social.comments; area settable only through a focus | TA.social.fields.main_observation{text≤2000, observation_ids[]} | TO/D2 + "link a quick observation" | TA-D(social) | R3§2 | never |

#### 2.2.3 Domain 3: שפה ותקשורת
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D03-T | OM·3 | 3. שפה ותקשורת · Language & communication (domain title) | covered | flat social.communication chips | REG domain `language` (items D03-11..14 carry ai_domain `communication`) | TO/D3 | SRC | R3§3 | n/a |
| OM-D03-R | OM·3 | שפה קולטת · Receptive language (sub-heading) | covered | no grouping | REG subgroup `receptive` | TO/D3 group "Understanding language" | SRC | R3§3 sub-table | n/a |
| OM-D03-E | OM·3 | שפה מביעה ותקשורת חברתית · Expressive & social communication (sub-heading) | covered | no grouping | REG subgroup `expressive_social` | TO/D3 group "Expressing & conversation" | SRC | R3§3 sub-table | n/a |
| OM-D03-01 | OM·3·R | מבין הוראות פשוטות · Simple instructions | covered | chip understands_instructions | TA.language.items.follows_simple_instructions | TO/D3 | TA-D(language) | R3§3; R1 | domain |
| OM-D03-02 | OM·3·R | מבין הוראות הכוללות מספר שלבים · Multi-step instructions | covered | focus suggestion only | TA.language.items.follows_multi_step_instructions | TO/D3 | TA-D(language) | R3§3; R1 | domain |
| OM-D03-03 | OM·3·R | מבין שאלות · Understands questions | covered | none (area settable only through a focus) | TA.language.items.understands_questions | TO/D3 | TA-D(language) | R3§3; R1 | domain |
| OM-D03-04 | OM·3·R | מבין מושגים בסיסיים · Basic concepts | covered | none | TA.language.items.understands_basic_concepts | TO/D3 | TA-D(language) | R3§3; R1 | domain |
| OM-D03-05 | OM·3·E | משתמש באוצר מילים מותאם לגיל · Age-appropriate vocabulary | covered | strength chip `vocabulary` only | TA.language.items.uses_range_of_words (UI "Uses a range of words"; source kept in REG) | TO/D3 | TA-D(language) | R3§3 (neutral label); R1 | domain |
| OM-D03-06 | OM·3·E | מחבר משפטים · Combines sentences | covered | chip uses_full_sentences | TA.language.items.combines_sentences | TO/D3 | TA-D(language) | R3§3; R1 | domain |
| OM-D03-07 | OM·3·E | מספר על חוויה · Tells an experience | covered | chip tells_about_experiences; focus suggestion | TA.language.items.tells_about_experience | TO/D3 | TA-D(language) | R3§3; R1 | domain |
| OM-D03-08 | OM·3·E | מתאר אירוע/תמונה · Describes event/picture | covered | chip describes_events | TA.language.items.describes_event_or_picture | TO/D3 | TA-D(language) | R3§3; R1 | domain |
| OM-D03-09 | OM·3·E | שואל שאלות · Asks questions | covered | chip asks_questions | TA.language.items.asks_questions | TO/D3 | TA-D(language) | R3§3; R1 | domain |
| OM-D03-10 | OM·3·E | מביע צורך ורצון במילים · Expresses needs in words | covered | chip expresses_needs_verbally | TA.language.items.expresses_needs_in_words | TO/D3 | TA-D(language) | R3§3; R1 | domain |
| OM-D03-11 | OM·3·E | מקשיב לאחר · Listens to others | covered | chip listens_to_others | TA.language.items.listens_to_others (ai_domain communication) | TO/D3 | TA-D(language) | R3§3; R1 | domain |
| OM-D03-12 | OM·3·E | מנהל שיחה קצרה · Short conversation | covered | none | TA.language.items.holds_short_conversation (communication) | TO/D3 | TA-D(language) | R3§3; R1 | domain |
| OM-D03-13 | OM·3·E | מחכה לתורו בשיחה · Waits for conversational turn | covered | chip takes_turns_in_conversation | TA.language.items.waits_turn_in_conversation (communication) | TO/D3 | TA-D(language) | R3§3; R1 | domain |
| OM-D03-14 | OM·3·E | מתאים את הדיבור לסיטואציה · Adjusts speech to situation | covered | none | TA.language.items.adjusts_speech_to_situation (communication) | TO/D3 | TA-D(language) | R3§3; R1 | domain |
| OM-D03-15 | OM·3 | הערות / דוגמאות לשפה · Language notes/examples | covered | shared TP.social.comments | TA.language.fields.language_examples{text≤2000} | TO/D3 (end of card) | TA-D(language) | R3§3 | never (verbatim utterances may contain names) |

#### 2.2.4 Domain 4: קשב, ריכוז ותפקודים ניהוליים
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D04-T | OM·4 | 4. קשב, ריכוז ותפקודים ניהוליים · Attention & executive functions (title) | covered | none; "קשב וריכוז" is in banned_terms.clinical.he | REG domain `executive_function`; UI label "ריכוז, התמדה וארגון" / Focus, persistence & organizing | TO/D4 | SRC | R3§4 (neutral title) | n/a |
| OM-D04-01 | OM·4 | מקשיב לסיפור · Listens to a story | covered | focus suggestion only | TA.executive_function.items.listens_to_story | TO/D4 | TA-D(executive_function) | R3§4; R1 | domain |
| OM-D04-02 | OM·4 | משתתף במפגש · Takes part in group time | covered | context group_time + generic level | TA.executive_function.items.takes_part_in_group_time | TO/D4 | TA-D(executive_function) | R3§4; R1 | domain |
| OM-D04-03 | OM·4 | משלים פעילות · Completes an activity | covered | independence grid finishing_activity (shared with D04-07) | TA.executive_function.items.completes_activity | TO/D4 | TA-D(executive_function) | R3§4; R1 | domain |
| OM-D04-04 | OM·4 | מתמיד במשימה · Persists in a task | covered | strength chip `persistence` | TA.executive_function.items.persists_in_task | TO/D4 | TA-D(executive_function) | R3§4; R1 | domain |
| OM-D04-05 | OM·4 | מבין מה נדרש ממנו · Understands what is asked | covered | none | TA.executive_function.items.understands_what_is_asked | TO/D4 | TA-D(executive_function) | R3§4; R1 | domain |
| OM-D04-06 | OM·4 | מתחיל משימה · Starts a task | covered | grid starting_activity (same scale; no note, no dated history) | TA.executive_function.items.starts_task (grid value shown as an earlier hint, never auto-copied) | TO/D4 | TA-D(executive_function) | R3§4; R1 | domain |
| OM-D04-07 | OM·4 | מסיים משימה · Finishes a task | covered | grid finishing_activity | TA.executive_function.items.finishes_task | TO/D4 | TA-D(executive_function) | R3§4; R1 | domain |
| OM-D04-08 | OM·4 | מסדר ציוד · Organizes equipment | covered | grid tidying_toys / keeping_belongings | TA.executive_function.items.organizes_materials | TO/D4 | TA-D(executive_function) | R3§4; R1 | domain |
| OM-D04-09 | OM·4 | עובר מפעילות לפעילות · Moves between activities | covered | single transition_reaction | TA.executive_function.items.moves_between_activities (PP.transitions shown as PARENT SAID) | TO/D4 | TA-D(executive_function) | R3§4; R1 | domain |
| OM-D04-10 | OM·4 | מקבל שינוי · Accepts change | covered | merged into transition_reaction | TA.executive_function.items.accepts_change | TO/D4 | TA-D(executive_function) | R3§4; R1 | domain |
| OM-D04-11 | OM·4 | מסוגל לנסות דרך אחרת · Tries another way | covered | none (strength problem_solving is a label) | TA.executive_function.items.tries_another_way | TO/D4 | TA-D(executive_function) | R3§4; R1 | domain |
| OM-D04-12 | OM·4 | מתמודד עם טעות · Copes with a mistake | covered | focus suggestion only | TA.executive_function.items.copes_with_mistakes | TO/D4 | TA-D(executive_function) | R3§4; R1 | domain |
| OM-D04-13 | OM·4 | משך קשב משוער במצבים שונים · Approx. attention time by situation | covered | none | TA.executive_function.fields.attention_span{by_context[{context, approx_minutes 1–90, note}], text} | TO/D4 repeater "About how long does the child stay with it?" | TA-D(executive_function) | R3§4 table: situation / about how long | domain ({context, minutes} pairs only); text never |

#### 2.2.5 Domain 5: משחק
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D05-T | OM·5 | 5. משחק · Play (title) | covered | none | REG domain `play` | TO/D5 | SRC | R3§5 | n/a |
| OM-D05-01 | OM·5 | בוחר פעילות בעצמו · Chooses activity | covered | none (motivator having_choices is a different thing) | TA.play.items.chooses_activity | TO/D5 | TA-D(play) | R3§5; R1 | domain |
| OM-D05-02 | OM·5 | משחק באופן עצמאי · Plays independently | covered | chip often_plays_independently | TA.play.items.plays_independently | TO/D5 | TA-D(play) | R3§5; R1 | domain |
| OM-D05-03 | OM·5 | מתמיד במשחק · Persists in play | covered | strength chip `persistence` | TA.play.items.persists_in_play | TO/D5 | TA-D(play) | R3§5; R1 | domain |
| OM-D05-04 | OM·5 | משתמש במשחק דמיוני · Imaginative play | covered | interest pretend_play / strength imagination | TA.play.items.imaginative_play | TO/D5 | TA-D(play) | R3§5; R1 | domain |
| OM-D05-05 | OM·5 | משחק תפקידים · Role play | covered | merged into interest pretend_play | TA.play.items.role_play | TO/D5 | TA-D(play) | R3§5; R1 | domain |
| OM-D05-06 | OM·5 | מחקה מצבים מחיי היום-יום · Imitates everyday life | covered | merged into interest pretend_play | TA.play.items.imitates_everyday_life | TO/D5 | TA-D(play) | R3§5; R1 | domain |
| OM-D05-07 | OM·5 | משחק לצד ילדים · Parallel play | covered | none | TA.play.items.parallel_play | TO/D5 | TA-D(play) | R3§5; R1 | domain |
| OM-D05-08 | OM·5 | מנהל משחק משותף · Leads shared play | covered | strength leadership; chip initiates_play | TA.play.items.leads_shared_play | TO/D5 | TA-D(play) | R3§5; R1 | domain |
| OM-D05-09 | OM·5 | מקבל רעיונות של אחרים · Accepts others' ideas | covered | appears only in generated content text | TA.play.items.accepts_others_ideas | TO/D5 | TA-D(play) | R3§5; R1 | domain |
| OM-D05-10 | OM·5 | סוגי משחק מועדפים · Preferred types of play | covered | TP.who.interests (mixes topics and play types; no provenance or date) | TA.play.fields.preferred_play{items[interests/custom], text} → "Add to profile" CPL.interests (source `observation`) | TO/D5; OV interests | TA-D(play); TA-APPLY | R3§5; R1 interests | label (interest labels ≤3); text never |

#### 2.2.6 Domain 6: מוטוריקה גסה
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D06-T | OM·6 | 6. מוטוריקה גסה · Gross motor (title) | covered | only the category `motor` | REG domain `gross_motor` | TO/D6 | SRC | R3§6 | n/a |
| OM-D06-01 | OM·6 | הליכה וריצה · Walking & running | covered | none | TA.gross_motor.items.walking_running | TO/D6 | TA-D(gross_motor) | R3§6; R1 | domain |
| OM-D06-02 | OM·6 | קפיצה בשתי רגליים · Two-foot jump | covered | none | TA.gross_motor.items.two_foot_jump | TO/D6 | TA-D(gross_motor) | R3§6; R1 | domain |
| OM-D06-03 | OM·6 | קפיצה על רגל אחת בהתאם לגיל · One-foot hop (age wording) | covered | none | TA.gross_motor.items.one_foot_hop (UI "Hops on one foot"; source in REG) | TO/D6 | TA-D(gross_motor) | R3§6 (neutral label); R1 | domain |
| OM-D06-04 | OM·6 | מדרגות · Stairs | covered | none | TA.gross_motor.items.stairs | TO/D6 | TA-D(gross_motor) | R3§6; R1 | domain |
| OM-D06-05 | OM·6 | שיווי משקל · Balance | covered | none | TA.gross_motor.items.balance | TO/D6 | TA-D(gross_motor) | R3§6; R1 | domain |
| OM-D06-06 | OM·6 | טיפוס · Climbing | covered | none | TA.gross_motor.items.climbing | TO/D6 | TA-D(gross_motor) | R3§6; R1 | domain |
| OM-D06-07 | OM·6 | זריקה ותפיסת כדור · Throwing & catching | covered | none | TA.gross_motor.items.throwing_catching | TO/D6 | TA-D(gross_motor) | R3§6; R1 | domain |
| OM-D06-08 | OM·6 | משחקי תנועה · Movement games | covered | interests sports/dancing/outdoor_play, strength movement (liking, not functioning) | TA.gross_motor.items.movement_games | TO/D6 | TA-D(gross_motor) | R3§6; R1 | domain |
| OM-D06-09 | OM·6 | האם קיימת הימנעות מפעילות גופנית? כן/לא · Avoids physical activity? | covered | none | TA.gross_motor.fields.avoids_physical_activity (yes/no/null = not answered) | TO/D6 toggle | TA-D(gross_motor) | R3§6 | never (may reflect health) |
| OM-D06-10 | OM·6 | פירוט · Details | covered | none | TA.gross_motor.fields.avoidance_details ≤1000 | TO/D6 (shown when yes) | TA-D(gross_motor) | R3§6 | never |

#### 2.2.7 Domain 7: מוטוריקה עדינה וגרפו-מוטוריקה
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D07-T | OM·7 | 7. מוטוריקה עדינה וגרפו-מוטוריקה · Fine motor (title) | covered | only the category `motor` | REG domain `fine_motor` (UI "Fine motor & drawing skills") | TO/D7 | SRC | R3§7 | n/a |
| OM-D07-01 | OM·7 | אחיזת כלי כתיבה · Tool grip | covered | none | TA.fine_motor.items.tool_grip | TO/D7 | TA-D(fine_motor) | R3§7; R1 | domain |
| OM-D07-02 | OM·7 | ציור חופשי · Free drawing | covered | strength/interest `drawing` | TA.fine_motor.items.free_drawing | TO/D7 | TA-D(fine_motor) | R3§7; R1 | domain |
| OM-D07-03 | OM·7 | העתקת צורות בהתאם לגיל · Copying shapes (age wording) | covered | none | TA.fine_motor.items.copying_shapes (UI "Copies shapes") | TO/D7 | TA-D(fine_motor) | R3§7 (neutral label); R1 | domain |
| OM-D07-04 | OM·7 | צביעה · Colouring | covered | none | TA.fine_motor.items.colouring | TO/D7 | TA-D(fine_motor) | R3§7; R1 | domain |
| OM-D07-05 | OM·7 | גזירה · Cutting | covered | focus suggestion using_scissors | TA.fine_motor.items.cutting | TO/D7 | TA-D(fine_motor) | R3§7; R1 | domain |
| OM-D07-06 | OM·7 | הדבקה · Gluing | covered | none | TA.fine_motor.items.gluing | TO/D7 | TA-D(fine_motor) | R3§7; R1 | domain |
| OM-D07-07 | OM·7 | השחלה · Threading | covered | none | TA.fine_motor.items.threading | TO/D7 | TA-D(fine_motor) | R3§7; R1 | domain |
| OM-D07-08 | OM·7 | בנייה בקוביות · Block building | covered | strength building; interest blocks/construction | TA.fine_motor.items.block_building | TO/D7 | TA-D(fine_motor) | R3§7; R1 | domain |
| OM-D07-09 | OM·7 | פאזלים · Puzzles | covered | interest `puzzles` | TA.fine_motor.items.puzzles | TO/D7 | TA-D(fine_motor) | R3§7; R1 | domain |
| OM-D07-10 | OM·7 | תיאום שתי ידיים · Bilateral coordination | covered | none | TA.fine_motor.items.bilateral_coordination | TO/D7 | TA-D(fine_motor) | R3§7; R1 | domain |
| OM-D07-11 | OM·7 | חוזקות בתחום · Strengths in this area | covered | TP.who.strengths (custom allowed, not tied to the domain) | TA.fine_motor.fields.strengths{items[strengths/custom], text≤1000} → "Add to strengths" (source `observation`) | TO/D7 | TA-D(fine_motor); TA-APPLY | R3§7; R1 strengths (TEACHER OBSERVED) | label (keys); text never |
| OM-D07-12 | OM·7 | קושי מרכזי · Main difficulty | covered | none | TA.fine_motor.fields.support_area_text ≤1000 (UI "Area for support"; never "קושי מרכזי") | TO/D7 | TA-D(fine_motor) | R3§7 (KidSphere label) | never |

#### 2.2.8 Domain 8: עצמאות ותפקודי יום-יום
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D08-T | OM·8 | 8. עצמאות ותפקודי יום-יום · Independence (title) | covered | wizard step 5 "Everyday independence" | REG domain `independence` | TO/D8 | SRC | R3§8 | n/a |
| OM-D08-00 | OM·8 table | תפקוד \| עצמאי \| זקוק לעזרה \| הערות · Function / independent / needs help / notes | covered | TP.independence.levels (4 levels); one shared notes field; no per-row note; replaced on save | TA.independence.items.<area> = {level, note≤300}; binary buttons first (independent / some_support = "Needs help"), "More" adds significant_support / not_observed | TO/D8 8-row table | TA-D(independence) | R3§8 Function / Independent / Needs help / Notes (RTL); significant prints as "Needs help" | domain (area + level, independence requests only) |
| OM-D08-01 | OM·8 | אכילה · Eating | covered | TP.independence.levels.eating | TA.independence.items.eating | TO/D8 (+ parent column from PP.independence.levels_pq) | TA-D(independence) | R3§8; R1 | domain |
| OM-D08-02 | OM·8 | שתייה · Drinking | covered | TP.independence.levels.drinking | TA.independence.items.drinking | TO/D8 | TA-D(independence) | R3§8; R1 | domain |
| OM-D08-03 | OM·8 | שימוש בשירותים · Toilet | covered | TP.independence.levels.toilet | TA.independence.items.toilet | TO/D8 | TA-D(independence) | R3§8; R1 | domain (note never) |
| OM-D08-04 | OM·8 | רחיצת ידיים · Washing hands | covered | TP.independence.levels.washing_hands | TA.independence.items.washing_hands | TO/D8 | TA-D(independence) | R3§8; R1 | domain |
| OM-D08-05 | OM·8 | לבוש/הפשטה · Dressing/undressing | covered | key `dressing`, label without undressing | TA.independence.items.dressing; relabel `independence_areas.dressing` → "לבוש והפשטה" / "Dressing / undressing" (key unchanged) | TO/D8 | TA-D(independence) | R3§8; R1 | domain |
| OM-D08-06 | OM·8 | נעילת נעליים · Shoes | covered | TP.independence.levels.shoes | TA.independence.items.shoes | TO/D8 | TA-D(independence) | R3§8; R1 | domain |
| OM-D08-07 | OM·8 | סידור חפצים · Organizing belongings | covered | approximate: tidying_toys (toys only) | new key `independence_areas.organizing_belongings`; TA.independence.items.organizing_belongings | TO/D8 | TA-D(independence) | R3§8; R1 | domain |
| OM-D08-08 | OM·8 | שמירה על חפציו · Keeps own belongings | covered | TP.independence.levels.keeping_belongings | TA.independence.items.keeping_belongings | TO/D8 | TA-D(independence) | R3§8; R1 | domain |

#### 2.2.9 Domain 9: ויסות חושי (no score)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D09-T | OM·9 | 9. ויסות חושי · Sensory regulation (title) | covered | wizard step 6 "environment"; "ויסות חושי" banned in UI | REG domain `sensory`; UI "Things in the environment that may affect the child" | TO/D9 | SRC | R3§9 (neutral title) | n/a |
| OM-D09-01 | OM·9 | תגובה לגירוי: רעש · Noise | covered | TP.environment.items[noise] what_happens/helps; no "no effect / not observed"; parent and teacher text merged; parent keys sent as `avoid` | TA.sensory.items.noise{effect (sensory_effects: affects/sometimes/no_visible_effect/not_observed), reaction_text≤500, helps[]} | TO/D9 row | TA-D(sensory) | R3§9 Stimulus / What happens / What helps (no score) | label (teacher-observed key may become `avoid` when the effect ≠ no_visible_effect); text never |
| OM-D09-02 | OM·9 | מגע · Touch | covered | environment.items[touch] | TA.sensory.items.touch | TO/D9 | TA-D(sensory) | R3§9 | label (teacher-observed only) |
| OM-D09-03 | OM·9 | מרקמים · Textures | covered | environment.items[textures] | TA.sensory.items.textures | TO/D9 | TA-D(sensory) | R3§9 | label (teacher-observed only) |
| OM-D09-04 | OM·9 | לכלוך · Dirt | covered | environment.items[dirt] | TA.sensory.items.dirt | TO/D9 | TA-D(sensory) | R3§9 | label (teacher-observed only) |
| OM-D09-05 | OM·9 | אור · Light | covered | approximate: bright_lights | TA.sensory.items.light (maps_to bright_lights) | TO/D9 | TA-D(sensory) | R3§9 | label (teacher-observed only) |
| OM-D09-06 | OM·9 | ריחות · Smells | covered | approximate: strong_smells | TA.sensory.items.smells (maps_to strong_smells) | TO/D9 | TA-D(sensory) | R3§9 | label (teacher-observed only) |
| OM-D09-07 | OM·9 | תנועה · Movement | covered | environment.items[movement] | TA.sensory.items.movement | TO/D9 | TA-D(sensory) | R3§9 | label (teacher-observed only) |
| OM-D09-08 | OM·9 | צפיפות · Crowding | covered | environment.items[crowded_spaces] | TA.sensory.items.crowded_spaces | TO/D9 | TA-D(sensory) | R3§9 | label (teacher-observed only) |
| OM-D09-09 | OM·9 | פעילויות יצירה · Creative activities | covered | approximate: messy_play | TA.sensory.items.creative_activities (maps_to messy_play) | TO/D9 | TA-D(sensory) | R3§9 | label (teacher-observed only) |
| OM-D09-10 | OM·9 | מה הילד עושה כאשר הוא מוצף · What the child does when overwhelmed | covered | scattered across per-stimulus texts and notes | TA.sensory.fields.when_too_much_text ≤1000 (UI avoids "מוצף") | TO/D9 | TA-D(sensory) | R3§9 "When things feel like too much" | never |
| OM-D09-11 | OM·9 | מה מסייע לו להתווסת · What helps regulate | covered | per-stimulus sensitivity_helps; calming_helps | TA.sensory.fields.what_helps_regulate{helps[], text} → "Add to What helps" | TO/D9 | TA-D(sensory); TA-APPLY | R3§9; R1 what-helps | label (keys); text never |

#### 2.2.10 Domain 10: תחום קוגניטיבי ולמידה (through play, not a test)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D10-T | OM·10 | 10. תחום קוגניטיבי ולמידה · Cognition & learning (title) | covered | none | REG domain `cognitive` (UI "Learning & thinking") | TO/D10 | SRC | R3§10 | n/a |
| OM-D10-01 | OM·10 | התאמה ומיון · Matching & sorting | covered | focus suggestion sorting_and_matching only | TA.cognitive.items.matching_sorting (+seen_in context) | TO/D10 | TA-D(cognitive) | R3§10; R1 | domain |
| OM-D10-02 | OM·10 | זיהוי צבעים · Colours | covered | none | TA.cognitive.items.colours | TO/D10 | TA-D(cognitive) | R3§10; R1 | domain |
| OM-D10-03 | OM·10 | זיהוי צורות · Shapes | covered | none | TA.cognitive.items.shapes | TO/D10 | TA-D(cognitive) | R3§10; R1 | domain |
| OM-D10-04 | OM·10 | מושגי גודל · Size concepts | covered | none | TA.cognitive.items.size_concepts | TO/D10 | TA-D(cognitive) | R3§10; R1 | domain |
| OM-D10-05 | OM·10 | מושגי כמות · Quantity concepts | covered | none | TA.cognitive.items.quantity_concepts (never a number or score) | TO/D10 | TA-D(cognitive) | R3§10; R1 | domain |
| OM-D10-06 | OM·10 | רצף · Sequencing | covered | none (game template only) | TA.cognitive.items.sequencing | TO/D10 | TA-D(cognitive) | R3§10; R1 | domain |
| OM-D10-07 | OM·10 | זיכרון · Memory | covered | strength chip `memory` | TA.cognitive.items.memory | TO/D10 | TA-D(cognitive) | R3§10; R1 | domain |
| OM-D10-08 | OM·10 | התאמת תמונה/חפץ · Picture/object matching | covered | none (game template only) | TA.cognitive.items.picture_object_matching | TO/D10 | TA-D(cognitive) | R3§10; R1 | domain |
| OM-D10-09 | OM·10 | הבנת סיבה ותוצאה · Cause & effect | covered | none | TA.cognitive.items.cause_effect | TO/D10 | TA-D(cognitive) | R3§10; R1 | domain |
| OM-D10-10 | OM·10 | פתרון בעיות פשוטות · Simple problem solving | covered | strength chip problem_solving | TA.cognitive.items.simple_problem_solving | TO/D10 | TA-D(cognitive) | R3§10; R1 | domain |
| OM-D10-11 | OM·10 | סקרנות ורצון לחקור · Curiosity & exploration | covered | strength chip curiosity; describe_words curious | TA.cognitive.items.curiosity_exploration (note first; level optional, OQ-6) | TO/D10 | TA-D(cognitive) | R3§10; R1 | domain |
| OM-D10-12 | OM·10 | ההערכה תיעשה באמצעות משחק… ולא כמבחן · Through play, not a test | covered | none | REG guidance + UX rules: no totals, no percentages, no test flow, no right/wrong wording | TO/D10 permanent guidance line | SRC | R3§10 under the heading | n/a |

#### 2.2.11 Domain 11: השתלבות בסדר היום (Day Map)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D11-T | OM·11 | 11. השתלבות בסדר היום · Participation through the day (title) | covered | none | REG domain `daily_routine` | TO/D11 | SRC | R3§11 | n/a |
| OM-D11-01 | OM·11 | קבלת בוקר · Arrival | covered | context `arrival` on single observations only | TA.daily_routine.stages.arrival{succeeds, difficult, support_needed{helps[], text}, what_helps{helps[], text}, observation_ids[]} | TO/D11 (accordion on phone, 9×4 table on desktop; recent observations for the context shown as evidence) | TA-D(daily_routine); OBSV `?context=` | R3§11 Stage / Succeeds / Hard / Support / Helps (RTL) | domain (stage + help keys); texts never |
| OM-D11-02 | OM·11 | משחק חופשי · Free play | covered | context free_play | TA.daily_routine.stages.free_play | TO/D11 | TA-D(daily_routine) | R3§11 | domain |
| OM-D11-03 | OM·11 | מפגש · Group meeting | covered | context group_time | TA.daily_routine.stages.group_time | TO/D11 | TA-D(daily_routine) | R3§11 | domain |
| OM-D11-04 | OM·11 | פעילות מובנית · Structured activity | covered | context structured_activity | TA.daily_routine.stages.structured_activity | TO/D11 | TA-D(daily_routine) | R3§11 | domain |
| OM-D11-05 | OM·11 | חצר · Yard | covered | context yard | TA.daily_routine.stages.yard | TO/D11 | TA-D(daily_routine) | R3§11 | domain |
| OM-D11-06 | OM·11 | ארוחה · Meal | covered | context meal | TA.daily_routine.stages.meal | TO/D11 | TA-D(daily_routine) | R3§11 | domain (texts never: may hold food/health details) |
| OM-D11-07 | OM·11 | יצירה · Creative activity | covered | context art | TA.daily_routine.stages.art | TO/D11 | TA-D(daily_routine) | R3§11 | domain |
| OM-D11-08 | OM·11 | מעברים · Transitions | covered | context transition | TA.daily_routine.stages.transition | TO/D11 | TA-D(daily_routine) | R3§11 | domain |
| OM-D11-09 | OM·11 | סיום יום · End of day | covered | context end_of_day | TA.daily_routine.stages.end_of_day | TO/D11 | TA-D(daily_routine) | R3§11 | domain |
| OM-D11-10 | OM·11 col | מה מצליח? · What succeeds (per stage) | covered | only reconstructable from observations | TA.daily_routine.stages.<s>.succeeds ≤500 | TO/D11 "What goes well?" | TA-D(daily_routine) | R3§11 column | never |
| OM-D11-11 | OM·11 col | מה קשה? · What is difficult | covered | only reconstructable from observations | TA.daily_routine.stages.<s>.difficult ≤500 | TO/D11 "What is still hard?" | TA-D(daily_routine) | R3§11 column | never |
| OM-D11-12 | OM·11 col | איזה תיווך נדרש? · Support needed | covered | per observation: details.what_needed / support_level | TA.daily_routine.stages.<s>.support_needed{helps[what_helps], text} | TO/D11 | TA-D(daily_routine) | R3§11 column | domain (keys); text never |
| OM-D11-13 | OM·11 col | מה עוזר? · What helps | covered | per observation: what_helped | TA.daily_routine.stages.<s>.what_helps{helps[], text} → "Add to What helps" | TO/D11 | TA-D(daily_routine); TA-APPLY | R3§11; R1 what-helps | label (keys) |

#### 2.2.12 Domain 12: חוזקות הילד
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D12-T | OM·12 | 12. חוזקות הילד ⭐ · Strengths (title) | covered | profile Strengths card | REG domain `strengths` | TO/D12; OV strengths | SRC | R3§12 | n/a |
| OM-D12-01 | OM·12 | יש לזהות לפחות 3–5 חוזקות · At least 3–5 strengths (rule) | covered | hint "Choose about 3–5"; no minimum or warning | rule: when status=sufficient and fewer than 3 items, a soft warning (never blocks) | QB (exactly 3); TO/D12 slot display (no numbers shown as a score) | TA-D(strengths) returns warnings[] | R3§12 guidance | n/a |
| OM-D12-02 | OM·12 | 1. · Strength #1 | covered | TP.who.strengths → CPL.strengths; profile ⭐ | TA.strengths.items[0]{list strengths/interests, key/custom, note, observation_ids[]} → "Add to profile" (source `observation`) | TO/D12 slot 1; QB; OV ⭐ | TA-D(strengths); TA-APPLY | R3§12; R1 | label |
| OM-D12-03 | OM·12 | 2. · Strength #2 | covered | as #1 | TA.strengths.items[1] | TO/D12 slot 2 | TA-D(strengths) | R3§12; R1 | label |
| OM-D12-04 | OM·12 | 3. · Strength #3 | covered | as #1 | TA.strengths.items[2] | TO/D12 slot 3 | TA-D(strengths) | R3§12; R1 | label |
| OM-D12-05 | OM·12 | 4. · Strength #4 (optional) | covered | as #1 | TA.strengths.items[3] | TO/D12 slot 4 | TA-D(strengths) | R3§12; R1 | label |
| OM-D12-06 | OM·12 | 5. · Strength #5 (optional) | covered | as #1 | TA.strengths.items[4] | TO/D12 slot 5 | TA-D(strengths) | R3§12; R1 | label |
| OM-D12-07 | OM·12 | תחומי עניין בולטים · Prominent interests | covered | TP.who.interests → CPL.interests | TA.strengths.fields.prominent_interests{items[], text≤500} → "Add to profile" | TO/D12; OV interests | TA-D(strengths); TA-APPLY | R3§12; R1 | label (≤3); text never |

#### 2.2.13 Domain 13: איתור מוקדי צורך (up to 3; never diagnoses; Current Focus candidates)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D13-T | OM·13 | 13. איתור מוקדי צורך · Priority needs (title) | covered | "מוקדי צורך" banned in UI; no need-marking step | REG domain `priority_needs` (UI "Where to focus next") | TO/D13 | SRC | R3§13 "Areas to focus on" | n/a |
| OM-D13-01 | OM·13 | סמנו עד 3 מוקדים מרכזיים · Mark up to 3 areas | covered | teachers create a Current Focus directly (max 3 active); lossy category map | TA.priority_needs.needs[≤3]{area (need_areas), …, focus_area_id?}; FA.source_need on promotion | TO/D13 chips (max 3) + "Make it a Current Focus"; PL candidates | TA-D(priority_needs); TA-NEED (409 FOCUS_LIMIT) | R3§13 (a promoted need then shows as an active focus) | label (area key as focus candidate; never called a diagnosis) |
| OM-D13-01a | OM·13 opt | רגשי · Emotional | covered | priority_categories.emotional (focus only) | need_areas.emotional (maps_to emotional) | TO/D13 | TA-D | R3§13 | label |
| OM-D13-01b | OM·13 opt | חברתי · Social | covered | priority_categories.social | need_areas.social | TO/D13 | TA-D | R3§13 | label |
| OM-D13-01c | OM·13 opt | שפתי · Language | covered | priority_categories.language | need_areas.language | TO/D13 | TA-D | R3§13 | label |
| OM-D13-01d | OM·13 opt | תקשורתי · Communication | covered | priority_categories.communication | need_areas.communication | TO/D13 | TA-D | R3§13 | label |
| OM-D13-01e | OM·13 opt | קשב וריכוז · Attention & concentration | covered | attention, relabelled "ריכוז והתמדה"; source label banned | need_areas.attention (UI "Focus & persistence") | TO/D13 | TA-D | R3§13 (neutral label) | label |
| OM-D13-01f | OM·13 opt | מוטורי · Motor | covered | priority_categories.motor (no gross/fine split) | need_areas.motor | TO/D13 | TA-D | R3§13 | label |
| OM-D13-01g | OM·13 opt | קוגניטיבי · Cognitive | covered | renamed and broader: learning | need_areas.cognitive (maps_to learning) | TO/D13 | TA-D | R3§13 | label |
| OM-D13-01h | OM·13 opt | עצמאות · Independence | covered | priority_categories.independence | need_areas.independence | TO/D13 | TA-D | R3§13 | label |
| OM-D13-01i | OM·13 opt | ויסות חושי · Sensory regulation | covered | folded into `emotional` (information lost); term banned | need_areas.sensory (UI "Things in the environment"; maps_to emotional for the focus category) | TO/D13 | TA-D | R3§13 (neutral label) | label |
| OM-D13-01j | OM·13 opt | התנהגות · Behaviour | covered | no category (terminology §2) | need_areas.behaviour (key kept; UI label per OQ-6; a concrete focus title is required on promotion) | TO/D13 | TA-D | R3§13 | label |
| OM-D13-01k | OM·13 opt | הסתגלות למסגרת · Adaptation to the setting | covered | mapped to `transitions` (different meaning) | need_areas.adapting_to_setting (maps_to transitions) | TO/D13 | TA-D | R3§13 | label |
| OM-D13-02 | OM·13 | מה בדיוק אנו רואים? · What exactly do we see | covered | per focus only (FA.description / plan.need) | TA.priority_needs.needs[i].seeing ≤1000 → copied to FA.plan.need on promotion | TO/D13 per-need card | TA-D(priority_needs) | R3§13 per need | never |
| OM-D13-03 | OM·13 | באיזו תדירות? · How often | covered | none (plan.frequency means something else) | needs[i].how_often ≤300 | TO/D13 | TA-D(priority_needs) | R3§13 | never |
| OM-D13-04 | OM·13 | באילו מצבים? · In which situations | covered | derivable from linked observations' context | needs[i].situations{contexts[], text≤500} | TO/D13 | TA-D(priority_needs) | R3§13 | domain (context keys); text never |
| OM-D13-05 | OM·13 | מה גורם לקושי? · What triggers it | covered | none per need | needs[i].what_seems_harder ≤500 (UI "What seems to make it harder?") | TO/D13 | TA-D(priority_needs) | R3§13 (KidSphere label) | never |
| OM-D13-06 | OM·13 | מה כבר ניסינו? · What we already tried | covered | none | needs[i].already_tried ≤500 | TO/D13 | TA-D(priority_needs) | R3§13 | never |
| OM-D13-07 | OM·13 | מה עזר? · What helped | covered | CPL.what_helps / observations.what_helped, not per need | needs[i].what_helped{helps[], text} (optional merge to what_helps) | TO/D13 | TA-D(priority_needs); TA-APPLY | R3§13 | label (keys); text never |

#### 2.2.14 Domain 14: מודל תצפית → הבנה → התערבות (per structured observation)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D14-T | OM·14 | 14. מודל תצפית → הבנה → התערבות · Observe → Understand → Intervene (title) | covered | i18n "Observation model (optional)" block in QO | REG; UI "Observe → Understand → Act" | QO stepper; OB detail | SRC | R3§14 | n/a |
| OM-D14-00 | OM·14 + SPEC | Cycle mapping to PLAN → APPLY → OBSERVE → ANALYZE → APPROVE → REPLAN | covered | the loop runs (focus → content → feedback → review), but details stages are never read by reviews, AI or timeline | OBS.details.plan_ref{focus_area_id, version_id} + details.did_it_change feed the review evidence and the timeline | QO; DV.review shows stage-E outcomes per focus | OBSV; REV | R6; R4 | domain |
| OM-D14-01 | OM·14·A | שלב א' – מה אני רואה? · Stage A: what do I see | covered | OBS.details.what_i_see (stored, never displayed; PUT overwrites) | unchanged + RV(observation) on every change + **OBS.domains** text[] | QO step A; OB list/detail | OBSV; `GET /api/observations/{oid}/versions` | R3§14; R1 history; R6 | domain (masked ≤300, relevant domains only) |
| OM-D14-01h | OM·14·A | תיאור עובדתי ללא פרשנות. לדוגמה… · Helper + example | covered | label only | REG i18n hint with the source example | QO step A hint | SRC | n/a | n/a |
| OM-D14-02 | OM·14·B | שלב ב' – מתי זה קורה? · Stage B: when (group) | covered | one ShortText details.when | OBS.details.when_detail{…} (legacy details.when kept read-only) | QO step B (5 short optional fields) | OBSV | R3§14 "When" | n/a |
| OM-D14-03 | OM·14·B | באיזה זמן? · At what time | covered | collapsed into details.when | when_detail.time ≤60 | QO B | OBSV | R3§14 | domain (time of day) |
| OM-D14-04 | OM·14·B | באיזו פעילות? · During which activity | covered | OBS.context + free text | when_detail.activity (observation_contexts; defaults to OBS.context) + activity_text ≤200 | QO B chips | OBSV | R3§14 | domain (key); text never |
| OM-D14-05 | OM·14·B | עם מי? · With whom | covered | collapsed into details.when | when_detail.with_whom ≤200 (may contain names; internal) | QO B | OBSV | R3§14 | never |
| OM-D14-06 | OM·14·B | לפני איזה אירוע? · Before which event | covered | collapsed | when_detail.before_event ≤200 | QO B | OBSV | R3§14 | never |
| OM-D14-07 | OM·14·B | לאחר איזה אירוע? · After which event | covered | collapsed | when_detail.after_event ≤200 | QO B | OBSV | R3§14 | never |
| OM-D14-08 | OM·14·C | שלב ג' – מה הילד צריך? · Stage C: what the child needs | covered | details.what_needed free text only | OBS.details.needs{helps[what_helps], text≤500} (legacy what_needed kept) | QO step C: 7 chips + other + text | OBSV | R3§14 "What the child may need" | domain (keys); text never |
| OM-D14-08a | OM·14·C opt | תיווך · Mediation | covered | key adult_mediation exists only in what_helped | needs.helps ∋ adult_mediation | QO C | OBSV | R3§14 | domain |
| OM-D14-08b | OM·14·C opt | הפחתת גירויים · Reduced stimulation | covered | key reduced_stimulation (what_helped only) | ∋ reduced_stimulation | QO C | OBSV | R3§14 | domain |
| OM-D14-08c | OM·14·C opt | הוראה קצרה · Short instruction | covered | key short_instruction | ∋ short_instruction | QO C | OBSV | R3§14 | domain |
| OM-D14-08d | OM·14·C opt | המחשה חזותית · Visual support | covered | key visual_support | ∋ visual_support | QO C | OBSV | R3§14 | domain |
| OM-D14-08e | OM·14·C opt | תנועה · Movement | covered | key movement | ∋ movement | QO C | OBSV | R3§14 | domain |
| OM-D14-08f | OM·14·C opt | חיזוק חיובי · Positive reinforcement | covered | key positive_reinforcement | ∋ positive_reinforcement | QO C | OBSV | R3§14 | domain |
| OM-D14-08g | OM·14·C opt | הכנה מראש למעבר · Advance preparation for a transition | covered | generic advance_preparation | ∋ advance_preparation | QO C | OBSV | R3§14 | domain |
| OM-D14-09 | OM·14·D | שלב ד' – מה נעשה? · Stage D: what we will do | covered | details.what_we_did; not displayed; no link to the plan version | details.what_we_did + details.plan_ref{focus_area_id, version_id} | QO step D + "link to a Current Focus" | OBSV | R3§14; R4 interventions | never |
| OM-D14-09h | OM·14·D | תיעוד ההתערבות שנבחרה · Helper | covered | none | REG i18n hint | QO D | SRC | n/a | n/a |
| OM-D14-10 | OM·14·E | שלב ה' – האם חל שינוי? כן/חלקי/לא · Stage E: change? | covered | details.did_it_change stored, never displayed or used | unchanged | QO E; OB detail; DV.review per focus | OBSV | R3§14; R6 | domain (key) |
| OM-D14-11 | OM·14·E | מה השתנה? · What changed | covered | no field | OBS.details.what_changed ≤1000 | QO E (when yes/partly) | OBSV | R3§14 | never |
| OM-D14-12 | OM·14 | תיעוד · Documentation | covered | general OBS.note (sent to the AI today) | OBS.details.documentation ≤2000 (kept separate from what_changed) | QO after E | OBSV | R3§14 | never (also stop sending OBS.note) |

#### 2.2.15 Domain 15: תוכנית התערבות אישית קצרה (= Plan; goals = `focus_areas`)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D15-T | OM·15 | 15. תוכנית התערבות אישית קצרה · Short individual plan (title) | covered | FocusPage "Current focus" | REG; UI and PDF title per OQ-3 | PL | SRC | R5 title | n/a |
| OM-D15-01 | OM·15 | יעד · Goal | covered | FA.title (max 3 active); edits overwrite | FA.title + RV(focus_area) on every change + FA.assessment_id (period) | PL plan table "Goal" | FOC; `GET /api/focus-areas/{fid}/versions` | R5; R1; R4 | label (masked title) |
| OM-D15-02 | OM·15 | דרך פעולה · Method | covered | FA.plan.what_we_will_do | unchanged + RV | PL "What we will do" | FOC | R5; R1 | domain (masked ≤400) |
| OM-D15-03 | OM·15 | תדירות · Frequency | covered | FA.plan.frequency, API only (no UI) | unchanged | PL "How often" + PlanEditor field | FOC | R5 | domain (masked) |
| OM-D15-04 | OM·15 | מי אחראי · Responsible | covered | FA.plan.who, API only; **sent to the AI** | unchanged | PL "Who" | FOC | R5 | never (drop plan.who from the AI context) |
| OM-D15-05 | OM·15 | מדד הצלחה · Success indicator | covered | FA.plan.success_looks_like ("How will we know it helps?") | unchanged + RV | PL "How we will know it helps" | FOC | R5 (KidSphere label) | domain (masked) |
| OM-D15-06 | OM·15 | המלצה: 2–3 יעדים בלבד בכל תקופה · Only 2–3 goals per period | covered | hard max 3 (409 FOCUS_LIMIT); no lower guidance, no period | keep max 3 (+ deferred DB constraint trigger); FA.assessment_id groups goals by cycle; soft hint when fewer than 2 or when adding the 3rd | PL banner "Choose 2–3 goals for this period" | FOC (`?assessment_id`) | R5 period header + guidance | n/a |

#### 2.2.16 Domain 16: מעקב והערכת התקדמות (review-level follow-up)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D16-T | OM·16 | 16. מעקב והערכת התקדמות · Follow-up (title) | covered | development review page | REG | DV.review "Follow-up" step | SRC | R4 progress | n/a |
| OM-D16-01 | OM·16 | מועד הערכה מחדש · Reassessment date | covered | DR.review_date (date of the review, not a planned date); FA.plan.review_on free text, API only | DR.follow_up.reassessment_on (date) + **FA.follow_up_on** (date, per goal; backfilled from parseable review_on) | DV.review; PL per-goal follow-up date; OV "Next review" | REV; FOC | R5 follow-up date; R4 next plan | never |
| OM-D16-02 | OM·16 | האם חל שיפור? משמעותי/חלקי/ללא שינוי · Improvement? | covered | per-focus DR.focus_review[].status only | DR.follow_up.improvement{level (improvement_levels → review_statuses), note}; per-focus status kept | DV.review 3 chips + "needs more observation" | REV | R4; R1 | domain (keys; B6 downgrade applies) |
| OM-D16-03 | OM·16 | (פירוט לשאלת השיפור) · Elaboration (unlabelled blank) | covered | focus_review[].note not editable | DR.follow_up.improvement.note ≤1000; focus_review[].note editable | DV.review | REV | R4; R1 | never |
| OM-D16-04 | OM·16 | באילו תחומים? · In which areas | covered | implicit (one entry per focus) | DR.follow_up.areas{domains[observation_domains], focus_area_ids[], text≤500} | DV.review domain chips | REV | R4; R1 | domain (keys) |
| OM-D16-05 | OM·16 | מה עבד היטב? · What worked well | covered | DR.focus_review[].what_worked | kept + optional DR.follow_up.what_worked | DV.review | REV | R4; R1; R5 | never |
| OM-D16-06 | OM·16 | מה דורש שינוי? · What needs change | covered | DR.focus_review[].what_to_change | kept + optional DR.follow_up.what_to_change | DV.review | REV | R4; R1 | never |
| OM-D16-07 | OM·16 | האם נדרש שיתוף הורים/צוות רב-מקצועי? · Parent / team involvement | covered | `share_next_step` list exists but is unused; no referral option | DR.follow_up.involvement{key (involvement_steps), note}; teacher-entered only; not in any AI schema | DV.review single choice (teacher only) | REV | R4 next plan; R1 | never |
| OM-D16-07a | OM·16 opt | לא · No | covered | unused share_next_step.none | involvement_steps.none | DV.review | REV | R4 | never |
| OM-D16-07b | OM·16 opt | התייעצות · Consultation | covered | unused consult_education_team | involvement_steps.consultation | DV.review | REV | R4 | never |
| OM-D16-07c | OM·16 opt | תוכנית משותפת · Shared plan | covered | unused joint_plan_with_parents | involvement_steps.joint_plan | DV.review | REV | R4 | never |
| OM-D16-07d | OM·16 opt | הפניה בהתאם לצורך · Referral as needed | covered | no key; "הפניה" banned in UI | involvement_steps.referral_as_needed (label per OQ-2; teacher-only) | DV.review | REV | R4 | never (AI output blocked by the `ai_only` banned group, X-30) |
| OM-D16-08 | OM·16 | (פירוט לשיתוף) · Involvement details (unlabelled blank) | covered | none | DR.follow_up.involvement.note ≤1000 (the wording check warns but does not block, OQ-3) | DV.review | REV | R1 | never |

#### 2.2.17 Domain 17: סיכום תפקודי קצר (functional summary)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D17-T | OM·17 | 17. סיכום תפקודי קצר · Functional summary (title) | covered | Understanding card on DevelopmentPage | REG; FS table | DV.summary card | SRC | R1; R4; R3§17 | n/a |
| OM-D17-01 | OM·17 | תיאור כללי של הילד · General description | covered | DR.summary / current_understanding.summary; AI draft via /suggest | FS.general_description (append-only versions; source manual/ai_draft; approved_by/at) | DV.summary: "Write" or "Draft with AI" → edit → Approve | FSUM | R1; R4; R3§17 (approved only) | domain (de-identified draft; labelled AI SUGGESTED until approved) |
| OM-D17-02 | OM·17 | חוזקות מרכזיות · Main strengths | covered | DR.understanding.strengths (list only, no prose) | FS.main_strengths{items[], text≤1000} | DV.summary | FSUM | R1; R4 | label (keys) |
| OM-D17-03 | OM·17 | צרכים מרכזיים · Main needs | covered | DR.understanding.areas_for_support | FS.main_needs{items[], text≤1000} (UI "Areas for support") | DV.summary | FSUM | R1 (KidSphere label) | never |
| OM-D17-04 | OM·17 | התאמות מומלצות בגן · Recommended adaptations | covered | DR.understanding.adaptations → current_understanding | FS.adaptations ≤2000 (current_understanding unchanged: written only by reviews) | DV.summary | FSUM | R1; R4 | domain (masked ≤1000) |
| OM-D17-05 | OM·17 | המשך מעקב / שיתוף הורים · Follow-up / parent collaboration | covered | shared DR.understanding.next_steps (sent to the AI) | FS.follow_up_with_parents ≤1000 (teacher-written; not in the AI draft) | DV.summary | FSUM | R1 | never |
| OM-D17-06 | OM·17 | המלצות לצוות · Recommendations for the team | covered | next_steps is the closest field | FS.team_recommendations ≤1000 | DV.summary | FSUM | R1 | domain (draft may propose; teacher approves) |

#### 2.2.18 עקרון מנחה לגננת (closing principles)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| OM-D99-01 | OM·closing | מי הילד? → במה הוא מצליח? → היכן הוא זקוק לעזרה? → מה אנחנו יכולים לעשות · Who → succeeds → needs help → what we do | covered | profile order Strengths → Interests/What helps → Focus → Recent → Understanding; principle not shown | REG; Overview ordered who → strengths → areas for support → what we do | OV order; TO one-line principle | SRC | R1 section order; R3 intro | n/a |
| OM-D99-02 | OM·closing | חוזקה → צורך → התאמה → התערבות → מעקב · Strength → need → adaptation → intervention → follow-up | covered | exists only on FA.plan (5 steps); follow-up date API only; not in observations | FA.plan + FA.follow_up_on shown as step 6; QO shows the sequence as a reminder line | PL (6 steps); QO | FOC | R5; R3 intro | n/a |

### 2.3 Cross-cutting requirements (SPEC-UPDATE: workflow, history, provenance, AI, PDF, navigation)

In this table *Source* is a SPEC-UPDATE section. *Question/field* carries the requirement in English only, because these requirements have no Hebrew source text.

#### 2.3.1 Workflow and states
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| X-01 | SPEC·intro | Translate both documents into a workflow: grouped steps, cards, hidden advanced items, saved progress; storage keeps everything | covered | wizard steps 2–7 with "More (optional)"; save & finish later; storage limited to 6 sections | PP new sections (§3.3); TP.bridge; TAH/TA; FS; registries | PW1–9; QB; TO cards (one open at a time); PL; DV | PROF; TA-*; FSUM | all 6 reports print the complete stored data | per category (X-26..X-28) |
| X-02 | SPEC·intro | Every item can be "not answered" (parent) or "not observed" (teacher), distinct from "not reached" | covered | not_observed only on the support scale; lists saved as `[]` | `PP.<sec>.not_answered[]`; TA items level=not_observed; "not started" comes from PSS (X-05) | "Skip" link per question; "Not observed" segment | PROF; TA-D | "Not answered" / "Not observed yet" | never |
| X-03 | SPEC·bridge | Teacher review after the parent questionnaire: 3 strengths; 3 things to remember; calms/helps; may be difficult; first area; question for the parent | covered | none | TP.bridge (QB.*) + RV(profile_section `teacher:bridge`) | OV prompt once PQM.status=submitted; QB page (read-only parent summary + form) | PROF {perspective:teacher, section:bridge, status} (exactly 3 strengths when status=sufficient) | R2 closing; R1 initial picture | label (keys); texts never |
| X-04 | SPEC·principles | Observation principles as concise guidance | covered | none (one placeholder in QO) | REG `observation_principles` (7 keys) + OBS.attributes | TO.guide (expanded on first visit, then a one-line link); QO micro-hints | OPT | R3 intro box | n/a |
| X-05 | SPEC·workflow | Section status Not Started / In Progress / Sufficient Observation / Review Later (incl. OM-SEC-STATUS) | covered | only wizard_step / completed_at | PSS.<sec>{status, by, at}; TAH.domains.<d>.status + teacher_assessment_entries.status; list `section_statuses`; no data = not_started | status pill on PW steps, PV sections, TO cards; "Review later" list; never a percentage | PROF `status`; TA-D `status` | R2/R3 per-section status | never |
| X-06 | SPEC·workflow | Initial Parent Wizard covers the whole questionnaire, filled by the parent or by staff on their behalf | covered | parent onboarding route; staff Parent/Teacher toggle; 6 sections | PP new sections + PQM (entry_mode, meeting) | PW1–9 (parent home and staff "on behalf" / meeting mode from PV) | PROF | R2; R1 | per PQ row |
| X-07 | SPEC·workflow | Teacher Quick Baseline (strengths, what helps, may be difficult, first area) is enough to start | covered | staff wizard teacher steps 2–7 + focus picker; no "may be difficult" or "first area" | = X-03 (TP.bridge); create-baseline snapshots it automatically | QB one screen (4–6 fields) → "Create baseline"; the 7-step wizard stays optional | PROF; `POST /baseline` | R1 initial picture | label (keys) |
| X-08 | SPEC·workflow | Teacher Full Observation filled in gradually, domain by domain (D1–13 + header) | covered | none | TAH + teacher_assessment_entries (append-only) | TO tab: 13 domain cards with status, saved per domain | `GET/POST /api/children/{id}/teacher-assessments`; TA-D; `POST …/{aid}/close` | R3; R1; R4 | domain |
| X-09 | SPEC·workflow | Never require 100 fields before using the app | covered | only the observation text is required; steps skippable; generation needs only a focus or strength | rule: no endpoint depends on TA or on statuses | every tab works with an empty TO | n/a | reports print what exists | n/a |

#### 2.3.2 History (never overwrite)
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| X-10 | SPEC·history | Parent initial questionnaire never overwritten | covered | sections replaced on every PATCH; values survive only in baselines | RV(profile_section `parent:<sec>`) written in the same transaction as each PATCH (full new section state); "initial" = versions up to the first PQM.submitted_at; backfill one row per existing section | PV per-section "History" + "Initial / Latest" toggle | PROF-H | R2 prints latest + initial submission date (option: initial version) | never |
| X-11 | SPEC·history | Teacher initial assessment never overwritten | covered | nothing to keep yet | TAH rows per cycle (first = `initial`, kind CHECK); entries append-only (trigger); closed cycles immutable | TO cycle switcher (Initial / Current / earlier) | `GET /api/teacher-assessments/{aid}`; `…/domains/{d}/history` | R3 picks a cycle | domain (current cycle only) |
| X-12 | SPEC·history | Original baseline kept and viewable | covered | baselines immutable; GET returns only id and date for older rows | no schema change; first row flagged `original` in the output | DV.baseline "Original baseline" vs latest | `GET /api/children/{id}/baselines/{bid}` | R1, R6 show the original | label (for_ai drops parent-only custom text) |
| X-13 | SPEC·history | Observations never overwritten | covered | PUT overwrites; audit keeps field names only | RV(observation) on create and every PUT | OB "Edited" marker + "Earlier version" | `GET /api/observations/{oid}/versions` | "edited on {date}" | domain (current text only) |
| X-14 | SPEC·history | Intervention plans never overwritten | covered | FA.plan overwritten by PUT and review "edit" | RV(focus_area){title, description, category, plan, status, close_reason, follow_up_on, via manual/review, review_id} | PL per-goal "History" | `GET /api/focus-areas/{fid}/versions` | R5 version date; R6 plan changes | domain (current plan) |
| X-15 | SPEC·history | Content/activities never overwritten | covered | drafts overwritten by edit/regenerate; DELETE hard-deletes drafts (PLAN B9) | RV(content) before each edit/regenerate (via generated/regenerated/edited); generated_content.deleted_at/deleted_by soft delete (OQ-5) | content review "Earlier versions" (AI draft vs teacher edit) | `GET /api/content/{cid}/versions`; DELETE → soft | R1 activities (approved/completed only) | n/a |
| X-16 | SPEC·history | Feedback never overwritten | covered | insert-only; mirrored observation cannot be edited (409) | no change | Activities; OB | existing | R1, R4, R6 | domain (masked) |
| X-17 | SPEC·history | Reassessments never overwritten | covered | development_reviews insert-only; no D16 fields | DR.follow_up (X-24); TAH cycles = domain reassessments | DV reviews list | REV | R4; R1; R6 | domain |
| X-18 | SPEC·history | Functional summaries never overwritten | covered | no table | FS rows immutable (trigger); each edit inserts a new row with supersedes_id; approval is the only allowed update | DV.summary history list | FSUM | R1 latest approved (with date) | domain (draft only) |
| X-19 | SPEC·history | AI suggestions kept and distinguishable from approved data | covered | /suggest writes nothing; DR.ai_suggested is a bool | AIS rows (input = the de-identified payload sent, output, outcome); DR.ai_suggestion_id; FS.ai_suggestion_id | "AI suggested" badge + "Compare with AI draft" | suggest responses gain suggestion_id; `GET /api/children/{id}/ai-suggestions` | never printed unless approved, then labelled AI-Assisted Draft | stores only what was sent |
| X-20 | SPEC·history | Teacher-approved changes kept; show how understanding developed | covered | each review keeps its understanding; current_understanding is overwritten | timeline also reads RV(focus_area), approved FS, closed TAH | DV understanding sequence (baseline → each approved review → current) | TL gains `plan_changed`, `summary_approved`, `assessment_closed` | R6 "approved updates"; R4 | n/a |
| X-21 | SPEC·history | Closed and current goals kept | covered | reactivation clears closed_at and close_reason; earlier closure lost | RV(focus_area) on every status change; timeline `focus_closed` built from RV | PL "Closed goals" (each open/close cycle) | `GET …/focus-areas?status`; versions | R5 goals closed in the period; R1 | domain (active focus only) |

#### 2.3.3 Provenance, plan, follow-up, summary
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| X-22 | SPEC·perspectives | Provenance labels PARENT SAID / TEACHER OBSERVED / AI SUGGESTED / TEACHER APPROVED; never merge into an anonymous profile | covered | item `sources` shown only as a hover tooltip; perspectives stored apart; review keeps only ai_suggested bool | list `provenance`; derived by `app/provenance.py` from sources, stamps (role vs reported_by), approval and AIS rows; CPL items gain `via` {assessment_id} for observation-sourced items | visible badges (touch-friendly) on OV chips, PV, TO, DV | `provenance[]` in profile_out, reviews, FS, TA | Parent Input / Teacher Observation / Teacher-Approved Understanding / AI-Assisted Draft | filter only (staff_confirmed) |
| X-23 | SPEC·D15 | Short plan: goal, method, frequency, responsible, success indicator, follow-up date; 2–3 goals per period | covered | FA + FA.plan; frequency/who/review_on have no UI; review_on is text; no period | FA.follow_up_on (date), FA.assessment_id, FA.source_need; max 3 active (service + deferred DB constraint trigger) | PL plan table with all 6 columns; guidance banner | FOC (review_on validated as a date) | R5 table (RTL order) | domain (masked; plan.who dropped) |
| X-24 | SPEC·D16 | Follow-up fields incl. involvement (teacher-only; AI never recommends referral) | covered | focus_review[] status / what_worked / what_to_change; share_next_step unused | DR.follow_up{reassessment_on, improvement{level, note}, areas, what_worked?, what_to_change?, involvement{key, note}} | DV.review final "Follow-up" step | REV (FollowUpIn) | R4; R5; R1 | AI may draft what_worked/what_to_change only; involvement and date never |
| X-25 | SPEC·D17 | Functional summary: manual or AI draft (de-identified); needs teacher approval | covered | none (closest: current_understanding) | FS table (§3.2) | DV.summary: Write / Draft with AI → edit → Approve; history | FSUM (+suggest, approve) | R1, R4 latest approved; drafts never printed | domain (de-identified; `[child]` token; no health or family data) |

#### 2.3.4 AI policy
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| X-26 | SPEC·health | Sleep/eating/health stays inside KidSphere; the default AI payload builder excludes it | covered | no health section, but parent sensitivity keys are sent as `avoid` (build_context) and in baseline_items(for_ai) | PP.health; registry `sensitivity` ∈ {health, medical, family, third_party} → excluded by the payload builder; `avoid` only from TA.sensory teacher-observed keys | PV health card with a lock note | n/a | R2/R1 only with include_health | never |
| X-27 | SPEC·partnership | No identifying family info sent externally | covered | allow-list excludes perspectives and parent name/contact; name_masker for names | deny-list extended to partnership, behaviour.boundaries_at_home, home_language, heart, parents; phone and e-mail scrubbing in masked free text | PV marks "Private" | n/a | allowed (authorized) | never |
| X-28 | SPEC·AI domains | Sanitized observations structured by 12 AI domains; send only relevant domains (incl. OM-DOMAIN-TAXONOMY) | covered | up to 5 (content) or 40 (review) observations, regardless of relevance; area = priority_categories | list `ai_domains`; OBS.domains (backfilled from area); AIContext.domains{d:{assessment[{item, level}], observations[], helps[]}}; relevance map in `app/ai/domains.py` | "Why this content" lists the domains used | n/a | n/a | domain |
| X-29 | SPEC·AI may | Summarize, possible patterns, draft understanding, suggest activities, adaptations, next observation questions | covered | UnderstandingSuggestion; content generation | UnderstandingSuggestion and the FS draft gain possible_patterns[≤5], next_observation_questions[≤5{domain, question}]; stored in AIS | DV.review; TO "What to look for next" (tap pre-fills QO) | /suggest response | only if approved (AI-Assisted Draft) | domain |
| X-30 | SPEC·AI must not | No diagnosing, deficit marking, referral, closing goals, overwriting the teacher assessment or source data (incl. OM-D16-AI) | covered | prompts and banned_terms.clinical; AI never writes the profile; no referral block; deficit words allowed in teacher-facing AI text | `banned_terms.ai_only` (refer/referral/specialist evaluation/הפניה/הפנייה/إحالة…) checked on every AI output; child_deficit also applied to teacher-facing AI text; AI schemas exclude involvement, focus decisions and closing | n/a | n/a | n/a | all calls |
| X-31 | SPEC·LEARN | Analysis calls send de-identified data only | covered | understanding_prompt sends child.name; build_context always has the name | analysis payloads use `[child]`, restored locally; content keeps the first name (OQ-4) | n/a | n/a | n/a | de-identified |

#### 2.3.5 Navigation, filters, parent hopes, focus candidates
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| X-32 | SPEC vs terminology | Reconcile required names/options with terminology.md and banned_terms (incl. the PDF disclaimer containing "diagnosis") | covered | terminology §2 bans several required labels; the disclaimer fails banned-terms tests | OQ-3 defaults; `allow_phrases` for the exact disclaimer sentences; neutral labels in lists; terminology.md updated | all new labels | n/a | titles, column headers, footer | banned terms still apply to AI output |
| X-33 | SPEC·tabs | Tabs: Overview, Parent View, Teacher Observation, Plan, Activities, Observations, Development, Reports | covered | Profile / Timeline / Content / Development; focus and observe as separate pages | new path builders: childParentView, childTeacherObservation, childPlan, childObservations, childReports, childQuickBaseline; Timeline moves under Development | TabNav with 8 tabs (scrolls on phones, logical RTL order) | n/a | RP hosts the export dialog | n/a |
| X-34 | SPEC·filters | History filters by date, focus area, domain, activity, result (no BI) | covered | timeline limit/offset only; observations filter by focus only | query filters; index on observations (child_id, observed_at) + GIN on OBS.domains | filter chips + date range in the URL (OB, DV.timeline); no charts, counts or % | TL / OBSV `?date_from&date_to&focus_area_id&domain&context&content_type&result&type` | R6 uses the same filters | n/a |
| X-35 | SPEC·expectations | Parent hopes SUGGEST, never decide, focus | covered | focus is teacher-only; FocusPicker badges parent priorities; FocusPage does not | no storage; PP.expectations orders the suggestions | PL "Family hopes" panel + PARENT SAID badge; never auto-created | n/a | R5 may cite family hopes (Parent Input) | label (category keys) |
| X-36 | SPEC·D13 | Priority needs (≤3) become Current Focus candidates | covered | none | TA.priority_needs + FA.source_need | TO/D13 → "Make it a Current Focus" → PL | TA-NEED | R3; R5 | domain (never as a label) |
| X-37 | SPEC·D12 | Strengths and interests feed content, planning, motivation, Strength Builder, Growth Support | covered | merged lists feed AIContext and strength targets | TA-APPLY merges with source `observation` (kept by PRESERVED_SOURCES) | TO/D12; OV TEACHER OBSERVED badge | TA-APPLY | R1 | label |
| X-38 | SPEC·D14 | Observe → Understand → Intervene maps to the loop | covered | details stages A–E stored; B/C free text; loop works end to end | see OM-D14-* | QO stepper; DV.review | OBSV | R6; R4 | domain |
| X-39 | SPEC·access | Only staff in scope see assessments, bridge, summaries, AI suggestions, history, reports; parents see only their own questionnaire | covered | access.py scope inside SELECT; parents get 404 on observations/reviews | `staff_child()` in every new endpoint; parent GET /profile returns only parent_perspective (incl. own health) and never TP.bridge; new audit actions | parent home shows none of the new tabs | all new endpoints staff-only (404 for parents) | staff-only export | n/a |

#### 2.3.6 PDF export
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| X-40 | SPEC·PDF | "Export PDF" button on the child profile | covered | none | report_exports only | HDR action (staff) + RP dialog; blob download via `apiBlob()` | PDF; `GET /api/children/{id}/reports` (export log) | entry point | never |
| X-41 | SPEC·PDF 1 | Full Child Report | covered | data mostly exists; TA and FS missing | `app/reports/builders/full.py` | RP | `report_type=full` | §6.4 | never |
| X-42 | SPEC·PDF 2 | Parent Questionnaire report | covered | partial data | builder reads PP + registry order + RV for initial/latest | RP | `parent_questionnaire` | §6.4 | never |
| X-43 | SPEC·PDF 3 | Teacher Observation report (all domains and notes) | covered | no TA | builder reads TAH/TA of the chosen cycle | RP (cycle picker) | `teacher_observation` (+assessment_id) | §6.4 | never |
| X-44 | SPEC·PDF 4 | Current Development report | covered | buildable from current data | builder: understanding, lists, active focus, observations since the last review, approved content and results, follow-up | RP | `current_development` | §6.4 | never |
| X-45 | SPEC·PDF 5 | Intervention Plan report | covered | FA.plan (3 fields have no UI) | builder: active FA + plan + follow_up_on + family hopes | RP; PL "Export plan" | `intervention_plan` | §6.4 | never |
| X-46 | SPEC·PDF 6 | Timeline report with date range | covered | timeline has no date filter | builder reuses the timeline sources with filters | RP (date range) | `timeline` + date_from/date_to | §6.4 | never |
| X-47 | SPEC·PDF | Language ar/he/en, defaults to the UI language, selectable | covered | labels in options.json; UI strings only in the frontend | `app/reports/messages/{en,ar,he}.json` (key parity + banned-terms test); question/item labels from the registries | RP language select | body.language (optional; fallback users.language) | all text in the chosen language; free text as typed (dir=auto) | never |
| X-48 | SPEC·PDF | True RTL: direction, alignment, table order, mixed numbers, fonts, headers/footers; no reversed or disconnected letters; test real PDFs | covered | none | §6.3 / §6.5 | n/a | n/a | all reports in he/ar | never |
| X-49 | SPEC·PDF | Local generation (WeasyPrint or ReportLab-RTL), no external service, no AI | covered | no library; server has Pango 1.52, HarfBuzz 8.3, fonts-noto-core | WeasyPrint (§6.1) | n/a | n/a | all | never |
| X-50 | SPEC·PDF | May contain identifying details, for authorized use | covered | none | builders read the DB directly; never import `app.ai` | dialog note "Contains personal details: store securely" | n/a | real names, age, kindergarten | never |
| X-51 | SPEC·PDF | Auth + child access check | covered | reusable staff_child | `staff_child(db, user, child_id)`; parents get 404 (OQ-7) | staff only | PDF | n/a | never |
| X-52 | SPEC·PDF | Log every export in report_exports; no content stored | covered | audit_log only | report_exports table (§3.2) + audit `report.export` | RP list "Exported on {date} by {name}" | `GET /api/children/{id}/reports` | n/a | never |
| X-53 | SPEC·PDF | No public URL; temp files protected and cleaned; no paths to the client | covered | photo endpoint as precedent | render to bytes in memory; `Content-Disposition: attachment`; `Cache-Control: private, no-store`; nosniff | object URL revoked after the click | response body is the PDF | n/a | never |
| X-54 | SPEC·PDF | Header: KidSphere / Child Development Report / name / age / kindergarten / date / prepared by; not clinical-looking | covered | data available | `templates/_header.html` (running element) | n/a | n/a | every page | never |
| X-55 | SPEC·PDF | Footer disclaimer (en/ar/he) + page numbers | covered | banned-term conflict | report messages + allow_phrases (OQ-3) | n/a | n/a | every page | never |
| X-56 | SPEC·PDF | Source attribution; AI is never presented as fact | covered | sources on items; approved_by on understanding | provenance (X-22) → 4 PDF labels; AI text printed only when approved: "AI-assisted draft, approved by {name} on {date}" | n/a | n/a | all | never |
| X-57 | SPEC·PDF API | `POST /api/children/{id}/reports/pdf` {report_type, language, date_from, date_to, include_parent, include_teacher_observations, include_timeline} | covered | none | `schemas/reports.py` ReportRequest (+include_health, include_family, include_private_notes, assessment_id; defaults in §4) | RP dialog | PDF → 200 application/pdf | all | never |

#### 2.3.7 Product model and process
| ID | Source | Question/field (he · en) | Status | Before | Target storage | UI | API | PDF | AI |
|---|---|---|---|---|---|---|---|---|---|
| X-58 | SPEC·final | KNOW: parent questionnaire + teacher observations | covered | 6-section perspectives + quick observations | complete PP + TP.bridge + TA | PV; QB; TO | PROF; TA-* | R1; R2; R3 | per category |
| X-59 | SPEC·final | PLAN: strengths and interests + up to 3 growth areas | covered | merged lists; max 3 active focus | + plan fields (X-23) | OV; PL | FOC | R4; R5 | label + domain |
| X-60 | SPEC·final | APPLY: stories, games, videos, audio, music, real activities via interchangeable providers | partial | story/video/digital_game/real_world_activity; Claude + template providers | future: content_type audio_story/song + `services/audio_service.py` placeholder + provider registry (no schema change now) | Activities | content endpoints | R1 activities | domain context |
| X-61 | SPEC·final | LEARN & ADAPT: observe → de-identified analysis → teacher approves → replan | covered | loop works; analysis sends the first name and an unfiltered observation list | X-28 + X-31 + AIS + FS | DV | REV; FSUM | R4; R6 | de-identified, domain |
| X-62 | SPEC·final | An authorized teacher exports a professional PDF at any time | covered | none | X-40..X-57 | RP | PDF | all 6 | never |
| X-63 | SPEC·process | Matrix before major DB changes; no data destruction; test RTL; verify every requirement is mapped | covered | 0001 only; pre-deploy pg_dump; this matrix | additive 0002 (§3); backfill; downgrade drops only new objects | n/a | n/a | n/a | n/a |
| X-64 | SPEC·process (step 10) | Automated verification: every registry ID ↔ a matrix row ↔ an existing storage path, UI string, PDF section and AI policy | covered | none | registries `backend/app/data/source/*.json` + `backend/tests/test_coverage_matrix.py` | n/a | SRC | the builders iterate the registries (no hand-picked fields) | registry `ai_policy` enforced by the payload-builder tests |

---

## 3. Database changes: one additive Alembic revision `0002_source_documents`

### 3.1 Principles
1. **Additive only.** No column is dropped, renamed or retyped. No existing JSON key is renamed or removed. Existing JSON is migrated forward in place **only by adding keys** (§3.4).
2. **Never overwrite.**
   - Every save of a parent or teacher section, an observation, a goal or a content draft writes a full snapshot to `record_versions` in the same transaction.
   - Assessment domains, functional summaries, AI suggestions and report exports are append-only tables. A trigger enforces this, using the same pattern as `baselines_immutable`.
3. **Reuse the right entity instead of duplicating it.**
   - Plan goals stay in `focus_areas`. That is the table `observations.focus_area_id`, `generated_content.focus_area_id`, reviews, feedback and the AI context already point to. A parallel `plan_goals` table would split the loop (§3.2.7).
   - The parent questionnaire stays in `child_profiles.parent_perspective`. The merged lists, baselines, FocusPicker and the AI already read it.
4. **One writer per field.** New source-faithful keys are canonical. The older lossy keys (`who.interests`, `emotions.frustration_reactions`, …) become a *legacy projection*: the server recomputes them on save (§3.3.2), so everything that reads them keeps working.
5. **No `schema_version` fields** (PLAN-ADJUSTMENTS A6). A version is identified by `record_versions.seq`.
6. **Six new tables**, which satisfies SPEC §28 ("don't create 50 tables"): `record_versions`, `teacher_assessments`, `teacher_assessment_entries`, `ai_suggestions`, `functional_summaries` and `report_exports`. Four existing tables get nullable or defaulted columns: `observations`, `focus_areas`, `development_reviews` and `generated_content`.

### 3.2 DDL sketch (hand-written, like 0001; `app/models.py` mirrors it; `tests/test_migrations.py` TABLES += the 6 new tables)

```sql
-- 3.2.0 shared guard: rows are history; never updated, deleted only together with their child
CREATE FUNCTION kidsphere_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION '% rows are append-only; insert a new row instead', TG_TABLE_NAME;
  END IF;
  IF EXISTS (SELECT 1 FROM children WHERE id = OLD.child_id) THEN
    RAISE EXCEPTION '% rows can only be deleted together with their child', TG_TABLE_NAME;
  END IF;
  RETURN OLD;
END;
$$;

-- 3.2.1 AI suggestions (created first: referenced by record_versions, development_reviews, functional_summaries)
CREATE TABLE ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('understanding','functional_summary','observation_questions')),
  provider text NOT NULL,                      -- 'claude' | 'template'
  model text,
  is_template boolean NOT NULL,
  fallback_reason text,
  domains text[] NOT NULL DEFAULT '{}',        -- AI domains actually sent (data minimisation audit)
  input jsonb NOT NULL,                        -- the de-identified payload actually sent (never raw names/health)
  output jsonb NOT NULL,
  outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','accepted','edited','discarded')),
  used_by_type text CHECK (used_by_type IN ('development_review','functional_summary')),
  used_by_id uuid,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX ai_suggestions_child_idx ON ai_suggestions (child_id, kind, created_at);
CREATE FUNCTION ai_suggestions_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.outcome <> 'pending'
       OR (NEW.input, NEW.output, NEW.kind, NEW.provider, NEW.child_id, NEW.created_at)
          IS DISTINCT FROM (OLD.input, OLD.output, OLD.kind, OLD.provider, OLD.child_id, OLD.created_at) THEN
      RAISE EXCEPTION 'ai_suggestions: only a pending outcome may be resolved';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM children WHERE id = OLD.child_id) THEN
    RAISE EXCEPTION 'ai_suggestions can only be deleted together with their child';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER ai_suggestions_guard BEFORE UPDATE OR DELETE ON ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION ai_suggestions_guard();

-- 3.2.2 Generic version history (profile sections, observations, goals, content drafts)
CREATE TABLE record_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('profile_section','observation','focus_area','content')),
  entity_id uuid,                              -- observations.id / focus_areas.id / generated_content.id
  entity_key text NOT NULL DEFAULT '',         -- profile_section: '<perspective>:<section>', e.g. 'parent:health',
                                               -- 'teacher:bridge', 'parent:_questionnaire' (record metadata)
  seq integer NOT NULL CHECK (seq >= 1),       -- 1 = first known state (backfill or create)
  data jsonb NOT NULL,                         -- FULL state after the change (not a diff)
  changed_by uuid REFERENCES users(id),
  changed_by_name text,
  changed_role text CHECK (changed_role IN ('admin','teacher','parent','system')),
  reported_by text CHECK (reported_by IN ('parent','teacher')),   -- whose answer it is (provenance)
  via text NOT NULL CHECK (via IN ('backfill','self','on_behalf','meeting','manual','review','assessment',
                                   'generated','regenerated','edited','status','system')),
  review_id uuid REFERENCES development_reviews(id),
  ai_suggestion_id uuid REFERENCES ai_suggestions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_versions_entity_chk
    CHECK ((entity_type = 'profile_section') = (entity_id IS NULL AND entity_key <> ''))
);
CREATE UNIQUE INDEX record_versions_seq_uq ON record_versions
  (child_id, entity_type, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid), entity_key, seq);
CREATE INDEX record_versions_child_idx ON record_versions (child_id, entity_type, created_at);
CREATE INDEX record_versions_entity_idx ON record_versions (entity_id, seq) WHERE entity_id IS NOT NULL;
CREATE TRIGGER record_versions_append_only BEFORE UPDATE OR DELETE ON record_versions
  FOR EACH ROW EXECUTE FUNCTION kidsphere_append_only();

-- 3.2.3 Teacher full observation: one row per observation cycle (header = observation-model section א)
CREATE TABLE teacher_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'initial' CHECK (kind IN ('initial','reassessment')),
  previous_id uuid REFERENCES teacher_assessments(id),
  filled_on date NOT NULL DEFAULT current_date,                       -- OM-D00-16
  period_from date,                                                   -- OM-D00-17
  period_to date,
  period_note text CHECK (period_note IS NULL OR length(period_note) <= 500),
  teacher_id uuid REFERENCES users(id),                               -- OM-D00-15
  filled_by_text text CHECK (filled_by_text IS NULL OR length(filled_by_text) <= 200),  -- OM-D00-18
  child_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {name, preferred_name, birth_date, age_at_fill{years,months},
                                                      --  class_id, class_name, kindergarten, teacher_name}
  domains jsonb NOT NULL DEFAULT '{}'::jsonb,         -- CACHE of the latest entry per domain:
                                                      -- {<domain>: {status, entry_id, data, updated_by, updated_at}}
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES users(id),
  closed_at timestamptz,
  CONSTRAINT teacher_assessments_period_chk CHECK (period_from IS NULL OR period_to IS NULL OR period_from <= period_to),
  CONSTRAINT teacher_assessments_closed_chk CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX teacher_assessments_one_open_uq ON teacher_assessments (child_id) WHERE status = 'open';
CREATE UNIQUE INDEX teacher_assessments_one_initial_uq ON teacher_assessments (child_id) WHERE kind = 'initial';
CREATE INDEX teacher_assessments_child_idx ON teacher_assessments (child_id, filled_on);
CREATE FUNCTION teacher_assessments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'closed' THEN
      RAISE EXCEPTION 'closed teacher assessments are immutable; start a reassessment';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM children WHERE id = OLD.child_id) THEN
    RAISE EXCEPTION 'teacher assessments can only be deleted together with their child';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER teacher_assessments_guard BEFORE UPDATE OR DELETE ON teacher_assessments
  FOR EACH ROW EXECUTE FUNCTION teacher_assessments_guard();

-- 3.2.4 Domain saves: every save appends one full domain document (history for free; never overwritten)
CREATE TABLE teacher_assessment_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES teacher_assessments(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (domain IN ('emotional','social','language','executive_function','play',
         'gross_motor','fine_motor','independence','sensory','cognitive','daily_routine','strengths','priority_needs')),
  status text NOT NULL CHECK (status IN ('not_started','in_progress','sufficient','review_later')),
  data jsonb NOT NULL,                       -- shape per domain: §3.3.5, validated by schemas/assessments.py
  entered_by uuid REFERENCES users(id),
  entered_by_name text,
  entered_role text NOT NULL CHECK (entered_role IN ('admin','teacher')),   -- provenance: TEACHER OBSERVED
  entered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teacher_assessment_entries_latest_idx ON teacher_assessment_entries (assessment_id, domain, entered_at DESC);
CREATE INDEX teacher_assessment_entries_child_idx ON teacher_assessment_entries (child_id, entered_at);
CREATE FUNCTION teacher_assessment_entries_open() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT status FROM teacher_assessments WHERE id = NEW.assessment_id) <> 'open' THEN
    RAISE EXCEPTION 'cannot add entries to a closed teacher assessment';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER teacher_assessment_entries_open BEFORE INSERT ON teacher_assessment_entries
  FOR EACH ROW EXECUTE FUNCTION teacher_assessment_entries_open();
CREATE TRIGGER teacher_assessment_entries_append_only BEFORE UPDATE OR DELETE ON teacher_assessment_entries
  FOR EACH ROW EXECUTE FUNCTION kidsphere_append_only();

-- 3.2.5 Functional summaries (Domain 17): every edit = a new row; approval is the only allowed update
CREATE TABLE functional_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  supersedes_id uuid REFERENCES functional_summaries(id),
  review_id uuid REFERENCES development_reviews(id),
  assessment_id uuid REFERENCES teacher_assessments(id),
  general_description text CHECK (general_description IS NULL OR length(general_description) <= 4000),
  main_strengths jsonb NOT NULL DEFAULT '{}'::jsonb,     -- {items:[{key}|{custom}], text}
  main_needs jsonb NOT NULL DEFAULT '{}'::jsonb,         -- {items:[text], text}  (UI: "Areas for support")
  adaptations text CHECK (adaptations IS NULL OR length(adaptations) <= 2000),
  follow_up_with_parents text CHECK (follow_up_with_parents IS NULL OR length(follow_up_with_parents) <= 1000),
  team_recommendations text CHECK (team_recommendations IS NULL OR length(team_recommendations) <= 1000),
  source text NOT NULL CHECK (source IN ('manual','ai_draft')),
  ai_suggestion_id uuid REFERENCES ai_suggestions(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT functional_summaries_approved_chk
    CHECK ((status = 'approved') = (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT functional_summaries_ai_chk CHECK (source = 'manual' OR ai_suggestion_id IS NOT NULL)
);
CREATE INDEX functional_summaries_child_idx ON functional_summaries (child_id, created_at);
CREATE FUNCTION functional_summaries_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.status = 'draft' AND NEW.status = 'approved')
       OR (NEW.general_description, NEW.main_strengths, NEW.main_needs, NEW.adaptations,
           NEW.follow_up_with_parents, NEW.team_recommendations, NEW.source, NEW.ai_suggestion_id,
           NEW.supersedes_id, NEW.child_id, NEW.created_by, NEW.created_at)
          IS DISTINCT FROM
          (OLD.general_description, OLD.main_strengths, OLD.main_needs, OLD.adaptations,
           OLD.follow_up_with_parents, OLD.team_recommendations, OLD.source, OLD.ai_suggestion_id,
           OLD.supersedes_id, OLD.child_id, OLD.created_by, OLD.created_at) THEN
      RAISE EXCEPTION 'functional summaries are immutable; save a new version instead';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM children WHERE id = OLD.child_id) THEN
    RAISE EXCEPTION 'functional summaries can only be deleted together with their child';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER functional_summaries_guard BEFORE UPDATE OR DELETE ON functional_summaries
  FOR EACH ROW EXECUTE FUNCTION functional_summaries_guard();

-- 3.2.6 PDF export log (SPEC-UPDATE: report content is NOT stored)
CREATE TABLE report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('full','parent_questionnaire','teacher_observation',
                                                   'current_development','intervention_plan','timeline')),
  language text NOT NULL CHECK (language IN ('ar','he','en')),
  generated_by uuid REFERENCES users(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  date_range daterange,
  options jsonb NOT NULL DEFAULT '{}'::jsonb      -- include_* flags, assessment_id; never content
);
CREATE INDEX report_exports_child_idx ON report_exports (child_id, generated_at DESC);
CREATE TRIGGER report_exports_append_only BEFORE UPDATE OR DELETE ON report_exports
  FOR EACH ROW EXECUTE FUNCTION kidsphere_append_only();

-- 3.2.7 Plan goals = focus_areas (extended); hard max 3 active also enforced at commit time
ALTER TABLE focus_areas
  ADD COLUMN follow_up_on date,                                                        -- Domain 15/16 follow-up date
  ADD COLUMN assessment_id uuid REFERENCES teacher_assessments(id) ON DELETE SET NULL, -- plan period (cycle)
  ADD COLUMN source_need jsonb;                                                        -- {assessment_id, index} (D13 → focus)
CREATE FUNCTION focus_areas_max_active() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'active'
     AND (SELECT count(*) FROM focus_areas WHERE child_id = NEW.child_id AND status = 'active') > 3 THEN
    RAISE EXCEPTION 'FOCUS_LIMIT: at most 3 active focus areas per child';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER focus_areas_max_active AFTER INSERT OR UPDATE OF status ON focus_areas
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION focus_areas_max_active();

-- 3.2.8 Other additive columns
ALTER TABLE observations
  ADD COLUMN domains text[] NOT NULL DEFAULT '{}',          -- the 12 AI domains (filters + data minimisation)
  ADD COLUMN attributes jsonb,                               -- {frequency, duration_minutes, intensity}: descriptive, never a score
  ADD CONSTRAINT observations_domains_chk CHECK (domains <@ ARRAY['emotional','social','communication','language',
      'executive_function','play','gross_motor','fine_motor','independence','sensory','cognitive','daily_routine']::text[]);
CREATE INDEX observations_domains_gin ON observations USING gin (domains);

ALTER TABLE development_reviews
  ADD COLUMN follow_up jsonb,                                -- Domain 16 block (§3.3.6)
  ADD COLUMN ai_suggestion_id uuid REFERENCES ai_suggestions(id);

ALTER TABLE generated_content
  ADD COLUMN deleted_at timestamptz,                         -- soft delete of drafts (OQ-5)
  ADD COLUMN deleted_by uuid REFERENCES users(id),
  ADD CONSTRAINT generated_content_soft_delete_chk CHECK (deleted_at IS NULL OR status = 'draft');
CREATE INDEX generated_content_live_idx ON generated_content (child_id, status) WHERE deleted_at IS NULL;
```

**Plan-goal field mapping.** The task asks for an "intervention plan goals table". The goals table is `focus_areas`, extended:

| Source column (D15/D16) | Storage | Note |
|---|---|---|
| goal (יעד) | `focus_areas.title` (+ category, suggestion_key, description) | max 3 `active`: the service returns 409; the deferred trigger is a backstop |
| method (דרך פעולה) | `focus_areas.plan.what_we_will_do` | |
| frequency (תדירות) | `focus_areas.plan.frequency` | gets a UI |
| responsible (מי אחראי) | `focus_areas.plan.who` | gets a UI; dropped from AI payloads |
| success indicator (מדד הצלחה) | `focus_areas.plan.success_looks_like` | descriptive, never a count |
| follow-up date | `focus_areas.follow_up_on` (DATE, new) | `plan.review_on` (legacy text) is kept read-only and backfilled when parseable |
| status | `focus_areas.status` (active/paused/completed) + `close_reason`, `closed_at` | every change → `record_versions` (fixes the reopen-clears-closure bug) |
| period ("2–3 goals per period") | `focus_areas.assessment_id` → `teacher_assessments.period_from/to` | guidance: a soft hint when fewer than 2 or when adding the 3rd |
| strength → need → adaptation | `focus_areas.plan.strength_used/need/adaptation` (unchanged) | |

**Downgrade.** Drop the 6 tables and their triggers and functions, the `focus_areas_max_active` trigger, and the added columns and constraints. JSON keys added by §3.4 stay. The 0001 code ignores unknown sections and keys, so nothing is lost and nothing breaks.

### 3.3 JSON documents

#### 3.3.1 `child_profiles.parent_perspective`: forward shape
New keys are **bold**. `†` marks a legacy projection key, derived on save from the canonical key (§3.3.2). The staff teacher perspective keeps writing the legacy keys directly.

```text
parent_perspective = {
  sections: {
    who:          describe_words, appreciate, strengths, interests†, motivators,
                  **parents[{name,relation}]**, **interests_pq{selected[pq_interests],other}**, **what_attracts**
    **joy**:      happy_safe_successful, likes_at_home, persists_at{value,text}, special_ability{value,text,strength_keys[]}
    emotions:     helps_when_sad, frustration_reactions†, calming_helps, calming_notes, transition_reaction†,
                  transition_helps†, morning_separation†, what_does_not_help (legacy, read-only),
                  **when_sad_text, frustration_pq{selected,other}, new_situations,
                  overwhelming_situations{value,text}, overwhelm_teacher_should_know**
    **separation**: morning (pq_morning_separation), what_helps_entry{text,keys[]}, transition_object{value,text}
    social:       social†, communication†, comments (legacy, read-only),
                  **contact_pq{selected,other}, conflict_reaction, significant_friends{value,text}, what_helps_socially**
    **communication**: expresses_needs{selected,other}, tells_experiences (pq_degree),
                  home_language{value,languages[],other_text}, teacher_should_know
    independence: levels†, notes (legacy, read-only), **levels_pq{area: independent|needs_help}, still_helping, routines_to_keep**
    environment:  items† (keys projected from health.sensory), notes (legacy)
    **health**:   sleep, food{text,flags[]}, sensory{text,keys[]}, medical{value,text}      -- sensitivity: health/medical
    **behaviour**: boundaries_at_home (family), what_works, what_does_not_work, helps_cooperation
    **transitions**: stopping_activity{selected[pq_stop_activity]}, preparation_helps (yes_no_sometimes),
                  which_preparation{text,keys[]}
    priorities:   parent_priorities†, hope_child_feels†, one_thing_to_know†, priorities_note (legacy)
    **expectations**: most_important, hope_child_feels{selected,other},
                  develop{emotional|social|language|motor|independence:{text}, other:{area,text}}
    **partnership**: contact_channels{selected[contact_preferences+other],other}, communication_matters,
                  family_context                                                       -- sensitivity: family
    **heart**:    message
    (every section may also carry **not_answered: [field names]**; free-text answers ≤ 4000)
  },
  entered:  {<section>: [{by, by_name, role, reported_by, at, **mode: self|on_behalf|meeting**, **version_seq**}]},
  wizard:   {step, completed_at},
  **questionnaire**:  {status: draft|submitted, filled_at, submitted_at, submitted_by, school_year,
                       entry_mode: self|on_behalf|meeting, meeting{date, attendees[relations]}, migrated?},
  **section_status**: {<section>: {status: not_started|in_progress|sufficient|review_later, by, at}}
}
```

#### 3.3.2 Legacy projection (keeps merged lists, baselines, FocusPicker and AI context working)
| Canonical source answer | Legacy key recomputed on save | Rule |
|---|---|---|
| who.interests_pq | who.interests | pretend_play→pretend_play; cars_transport→cars_transportation; building_assembly→construction; drawing_crafts→drawing+crafts; music_singing→music; dance_movement→dancing; stories_books→stories+books; outdoor_play, animals, social_games 1:1; screen_games→technology; `other` text → `{custom: text[:120]}` |
| emotions.frustration_pq | emotions.frustration_reactions | cries, shouts, moves_away, asks_for_hug 1:1; turns_to_adult→asks_adult_help; hard_to_calm→takes_time_to_calm; outburst→other (+custom) |
| separation.morning | emotions.morning_separation | easily→easy; needs_time→needs_time; very_difficult→needs_a_lot_of_support; varies→varies |
| separation.what_helps_entry.keys ∪ transitions.which_preparation.keys | emotions.transition_helps | union |
| transitions.stopping_activity | emotions.transition_reaction | strongest selected: very_difficult→needs_adult_support > cries_or_angry→becomes_upset > resists→resists > needs_preparation→needs_preparation > easily→transitions_easily |
| social.contact_pq | social.social | initiates→initiates_play; waits_to_be_approached→waits_for_others; prefers_alone→often_plays_independently; familiar_children→prefers_familiar_children; needs_mediation→needs_adult_support_to_join |
| communication.expresses_needs + tells_experiences | social.communication | words→expresses_needs_verbally; sentences→uses_full_sentences; gestures→uses_gestures; crying_behaviour→sometimes_communicates_through_behavior; turns_to_adult→needs_adult_support; tells_experiences ∈ {very_much, sometimes} → tells_about_experiences |
| independence.levels_pq | independence.levels | independent→independent; needs_help→some_support (an existing significant_support is kept) |
| health.sensory.keys | environment.items | keys only; existing what_happens and what_helps of the same key are kept |
| expectations.develop | priorities.parent_priorities | non-empty domains → emotional/social/language/motor/independence/other |
| expectations.hope_child_feels.selected | priorities.hope_child_feels | copy |
| expectations.most_important | priorities.one_thing_to_know | copy (the heart message is **never** copied here) |
| communication.home_language.languages | children.additional_languages | union only (never removes); audited |

The `maps_to` data lives in `backend/app/data/source/parent_questionnaire.json` (the option registry), not in `options.json`, because `test_options_data` allows only `{key, icon, category, label, short}` per item.

#### 3.3.3 `child_profiles.teacher_perspective`: additions
- `sections.bridge` (Teacher Quick Baseline). Keys `main_strengths`, `remember`, `calms_helps`, `may_be_difficult`, `first_area_to_observe` and `question_for_parent` are defined in the PQ-TCH rows. `based_on: {parent_version_seq, read_at}` records which version of the parent answers the teacher read.
- `section_status.<section>` is the same shape as for the parent.
- `compute_lists` reads `bridge.main_strengths` into `strengths` (with `main: true`) and `bridge.calms_helps.items` into `what_helps`.

#### 3.3.4 Provenance on merged items (`child_profiles.{strengths,…}`)
- Existing `sources[]` values are kept: parent, teacher, observation, review.
- Items merged from an assessment (`TA-APPLY`) get source `observation` (already in `PRESERVED_SOURCES`) plus a new key `via: {assessment_id, domain}`.
- The `provenance[]` labels are **derived** by `app/provenance.py` and are not stored:

| Derived from | Label |
|---|---|
| source `parent` (also when a teacher typed it: stamp role ≠ parent, reported_by = parent → "entered by staff") | `parent_said` |
| sources `teacher` or `observation` | `teacher_observed` |
| source `review`, or an approved FS or current_understanding | `teacher_approved` |
| a pending or edited AIS | `ai_suggested` |

#### 3.3.5 `teacher_assessment_entries.data`: shape per domain (validated by `schemas/assessments.py`)
| Domain key(s) | `data` shape |
|---|---|
| emotional, social, language, executive_function, play, gross_motor, fine_motor, cognitive | `{items: {<item_key>: {level: support_levels key, note ≤500, seen_in?: observation_contexts key, observation_ids?: [uuid]}}, fields: {…domain fields below…}, strengths_here?: [{key}/{custom}]}`. An unrated item is `not_observed` and is not stored. |
| fields per domain | emotional `what_makes_it_harder{text,contexts[]}`, `what_helps_calm{items,text}`; social `main_observation{text,observation_ids[]}`; language `language_examples{text}`; executive_function `attention_span{by_context[{context,approx_minutes,note}],text}`; play `preferred_play{items,text}`; gross_motor `avoids_physical_activity` (yes/no/null), `avoidance_details`; fine_motor `strengths{items,text}`, `support_area_text`; cognitive: none |
| independence | `{items: {<area>: {level, note ≤300}}}`. Areas: eating, drinking, toilet, washing_hands, dressing, shoes, organizing_belongings, keeping_belongings. |
| sensory | `{items: {<stimulus>: {effect: sensory_effects, reaction_text ≤500, helps[]}}, fields: {when_too_much_text, what_helps_regulate{helps[],text}}}`. Never a score. |
| daily_routine | `{stages: {<observation_context>: {succeeds, difficult, support_needed{helps[],text}, what_helps{helps[],text}, observation_ids[]}}}` |
| strengths | `{items: [≤5 ordered {list: strengths/interests, key/custom, note, observation_ids[]}], fields: {prominent_interests{items[],text}}}` |
| priority_needs | `{needs: [≤3 {area: need_areas key, seeing, how_often, situations{contexts[],text}, what_seems_harder, already_tried, what_helped{helps[],text}, focus_area_id?}]}` |

Item keys, verbatim `source_he`, UI labels (en/ar/he), subgroup and `ai_domain` live in `backend/app/data/source/observation_model.json`. That file is the registry the matrix test walks.

#### 3.3.6 Other JSON
- **`observations.details`** gains `when_detail{time, activity, activity_text, with_whom, before_event, after_event}`, `needs{helps[], text}`, `what_changed`, `documentation` and `plan_ref{focus_area_id, version_seq}`. `what_i_see`, `when`, `what_needed`, `what_we_did` and `did_it_change` are kept.
- **`observations.attributes`** = `{frequency: observation_frequency key, duration_minutes: 1–90, intensity: light|moderate|strong}`.
- **`development_reviews.follow_up`** = `{reassessment_on: date, improvement{level: improvement_levels, note}, areas{domains[], focus_area_ids[], text}, what_worked?, what_to_change?, involvement{key: involvement_steps, note}}`.

#### 3.3.7 New vocabulary lists
Every list is labelled in en/ar/he and passes the banned-terms and age-norm label tests. Lists live in **fragments** under `backend/app/data/lists/*.json`, which `vocab.py` merges into `GET /api/options`; that way parallel packages never edit one file.

| Fragment file | Lists |
|---|---|
| `common.json` (WP1) | `section_statuses`, `provenance`, `ai_domains` (12), `observation_domains` (13 assessment sections), `yes_no`, `yes_no_sometimes` |
| `parent_questionnaire.json` (WP2-PQ) | `pq_interests`, `pq_frustration_reactions`, `pq_morning_separation`, `pq_social_contact`, `pq_express_needs`, `pq_degree`, `pq_stop_activity`, `health_food_flags` |
| `observation_model.json` (WP2-TO) | `observation_principles` (7), `observation_frequency`, `sensory_effects`, `need_areas` (11) |
| `plan.json` (WP2-PLAN) | `improvement_levels`, `involvement_steps` |

Edits to `options.json` itself (WP1 only):
- `contact_preferences` += `other`; he label of `meeting` → "פגישה מסודרת".
- `independence_areas` += `organizing_belongings`; relabel `dressing` → "Dressing / undressing".
- `hope_child_feels.safe` he → "בטוח/ה".
- `banned_terms.ai_only` (new group).
- `allow_phrases` for the exact disclaimer sentences.

### 3.4 Data migration inside 0002 (SQL `INSERT … SELECT` plus one small Python step; idempotent; no deletes)
1. **`record_versions` seq 1 ("backfill")** for:
   - every existing profile section: `entity_key` = `parent:<sec>` or `teacher:<sec>` via `jsonb_each(sections)`; `changed_by` and `created_at` from the last `entered` stamp, else `child_profiles.updated_at`;
   - every observation, focus area and non-archived content row (`to_jsonb(row)` minus id and audit columns).

   These rows give "the initial questionnaire / plan / text" an anchor from day one.
2. **`observations.domains`** from `area`:
   - emotional→{emotional}, social→{social}, language→{language}, communication→{communication}, attention→{executive_function};
   - motor→{gross_motor, fine_motor}, independence→{independence}, learning→{cognitive}, transitions→{daily_routine}, confidence→{emotional};
   - other and NULL→{}.
3. **`focus_areas.follow_up_on`** = `(plan->>'review_on')::date` when it matches `^\d{4}-\d{2}-\d{2}$`. Otherwise it stays NULL and the text is kept.
4. **Python step: forward-add keys in `child_profiles`.** Keys are added only when absent.
   - `parent_perspective.questionnaire`:
     - `status` = `submitted` when `wizard.completed_at` is set, else `draft`;
     - `submitted_at` = that date;
     - `entry_mode` = `on_behalf` when any stamp has a staff role, else `self`;
     - `migrated: true`.
   - `section_status` for each perspective: `in_progress` for every section that has data, with `by`/`at` taken from the last stamp and `derived: true`.

   Nothing else is rewritten. The new canonical keys (`interests_pq`, `frustration_pq`, …) start empty, and the Parent View shows the legacy answers under "From the earlier form" until the family or staff answer again. That is a deliberate no-guessing rule: the legacy keys are lossy, so reverse-mapping them would invent answers.
5. **Pre-deploy safety:** the existing `pg_dump` runs before the migration. `tests/test_migrations.py` covers upgrade → downgrade → upgrade and checks that every trigger rejects UPDATE and direct DELETE.

### 3.5 Models and tests touched by 0002 (WP1)
- **`app/models.py`:** 6 new mapped classes (`RecordVersion`, `TeacherAssessment`, `TeacherAssessmentEntry`, `AiSuggestion`, `FunctionalSummary`, `ReportExport`) and the new columns.
- **`tests/test_migrations.py`:**
  - the TABLES set;
  - column mirroring;
  - the immutability and guard triggers;
  - the backfill (seq 1 rows exist);
  - one open assessment per child;
  - the deferred max-3 trigger.
- **`app/services/history.py`:** `record(db, *, child_id, entity_type, entity_id=None, key='', data, user, reported_by=None, via, review_id=None, ai_suggestion_id=None)` computes `seq = max+1` under the row lock the caller already holds. `versions(db, …)` reads them back.
- **`app/provenance.py`:** the derivation in §3.3.4 as a pure function.

---

## 4. API changes
These rules apply to every new endpoint:
- Thin routers with `def` handlers and one service call; `StrictModel` schemas; the error envelope `{error:{code,message,details}}`.
- Staff-only: endpoints use `staff_child()`, and parents get 404.
- Every write is audited, with ids and names only in the metadata.

New error codes go into `app/errors.py` in WP1: `ASSESSMENT_OPEN`, `ASSESSMENT_CLOSED`, `SUMMARY_APPROVED`, `REPORT_BUSY` (503) and `REPORT_FAILED` (500).

### 4.1 Profile, parent questionnaire, quick baseline (WP2-PQ)
| Method and path | Change |
|---|---|
| `PATCH /api/children/{id}/profile` | **Body:** `{perspective?, section?, data?, status?, questionnaire?, wizard_step?, complete?}`. `SectionName` gains `joy, separation, communication, health, behaviour, transitions, expectations, partnership, heart` (parent perspective only) and `bridge` (teacher perspective, staff only). `data.not_answered` must list fields of that section model. `status` ∈ section_statuses. `questionnaire` = `{filled_at?, school_year?, entry_mode?, meeting?{date, attendees[]}, submit?: bool}`. **The server then:** validates, writes the section, runs the legacy projection (§3.3.2), runs `recompute_lists`, writes **one `record_versions` row per changed section** (plus `parent:_questionnaire` when the metadata changes) and appends an `entered` stamp with `mode`. **Rules:** `bridge` with `status=sufficient` needs exactly 3 `main_strengths`. Parents get 403 for `bridge` or the teacher perspective. **Audit:** `profile.section_update {section, perspective, mode}` and `questionnaire.submit`. |
| `GET /api/children/{id}/profile` | **Parent:** `parent_perspective` only, including their own health answers; never `teacher_perspective` or `bridge` (B14 kept). **Staff:** both perspectives plus the merged lists, each item with derived `provenance[]`, `section_status` and `questionnaire`. |
| `GET /api/children/{id}/profile/history?perspective&section` | Staff only. Returns `[{seq, data, changed_by_name, changed_role, reported_by, via, created_at}]`. |
| `GET /api/source-model` | Static registries `{parent_questionnaire, observation_model}`, with item ids, order, kind, options, storage path, sensitivity, ai_policy, pdf section and labels (en/ar/he). Authenticated, cacheable. The router is in WP1; the JSON files come from WP2-PQ and WP2-TO. |

### 4.2 Teacher assessments and structured observations (WP2-TO)
| Method and path | Change |
|---|---|
| `GET /api/children/{id}/teacher-assessments` | `{current: {header…, domains:{<d>:{status, data, updated_at, updated_by_name}}} \| null, earlier:[{id, kind, filled_on, period_from, period_to, closed_at}]}` |
| `POST /api/children/{id}/teacher-assessments` | `{kind?, filled_on?, period_from?, period_to?, period_note?, teacher_id?, filled_by_text?, copy_forward?}` → 201. Returns 409 `ASSESSMENT_OPEN` if a cycle is already open. With `copy_forward`, a reassessment copies the latest domain documents as `in_progress` entries tagged `data.carried_from`. |
| `GET /api/teacher-assessments/{aid}` · `PATCH /api/teacher-assessments/{aid}` | Read the header and domains · edit header fields (open cycles only; otherwise 409 `ASSESSMENT_CLOSED`). The child snapshot is refreshed. |
| `PUT /api/teacher-assessments/{aid}/domains/{domain}` | `{status, data}` → **appends** an entry and refreshes the cache. Returns `{domain, status, data, entry_id, warnings[]}`. Free text gets a wording check that **warns** but does not block (OQ-3). Vocabulary is checked per domain model. |
| `GET /api/teacher-assessments/{aid}/domains/{domain}/history` | The entries of that domain, newest first |
| `POST /api/teacher-assessments/{aid}/close` | Closes the cycle; it becomes immutable (trigger). |
| `POST /api/teacher-assessments/{aid}/apply` | `{list: strengths\|interests\|what_helps, items[], domain}` → merges into the profile lists with source `observation` and `via` |
| `POST /api/teacher-assessments/{aid}/needs/{i}/focus` | `{title?, category?}` → creates a `focus_areas` row with `plan.need` = need.seeing and `source_need`. Returns 409 `FOCUS_LIMIT`. |
| `POST /api/children/{id}/observations` · `PUT /api/observations/{oid}` | Body adds `domains[]`, `attributes`, `details.{when_detail, needs, what_changed, documentation, plan_ref}`. Every create or update writes a `record_versions` row. |
| `GET /api/children/{id}/observations` | Filters `date_from, date_to, focus_area_id, domain, context, source` plus `limit/offset` |
| `GET /api/observations/{oid}/versions` | Staff only |

### 4.3 Plan, follow-up, functional summary, baselines (WP2-PLAN)
| Method and path | Change |
|---|---|
| `POST /api/children/{id}/focus-areas` · `PUT /api/focus-areas/{fid}` | Adds `follow_up_on` (date) and `assessment_id`. `plan.review_on` is kept, but new values must be an ISO date. Every change, including a status change, writes `record_versions` with `via` manual or review. Reopening no longer loses the earlier closure. |
| `GET /api/children/{id}/focus-areas?status&assessment_id` · `GET /api/focus-areas/{fid}/versions` | Goals grouped by period; history |
| `POST /api/children/{id}/development-reviews` | Adds `follow_up` (FollowUpIn) and `ai_suggestion_id`. Teacher text keeps the 422 check, except `follow_up.involvement.note`, which only warns. |
| `POST /api/children/{id}/development-reviews/suggest` | Inserts an `ai_suggestions` row and returns `suggestion_id` together with `possible_patterns` and `next_observation_questions`. |
| `GET /api/children/{id}/baselines/{bid}` | Full `baseline_data` of any baseline; the first one is flagged `original`. |
| `GET /api/children/{id}/functional-summaries` | `{latest_approved, drafts[], history[]}` |
| `POST /api/children/{id}/functional-summaries` | Inserts a draft row (`supersedes_id`, `source`, `ai_suggestion_id?`). Text gets the wording check. |
| `POST /api/children/{id}/functional-summaries/suggest` | De-identified AI draft. Inserts `ai_suggestions` and returns the draft without saving an FS row. |
| `POST /api/functional-summaries/{sid}/approve` | Draft → approved. Returns 409 `SUMMARY_APPROVED` when it is already approved. Audit: `summary.approve`. |

### 4.4 Reports (WP2-PDF)
| Method and path | Change |
|---|---|
| `POST /api/children/{id}/reports/pdf` | **Body (`ReportRequest`):** `report_type` (6 values); `language?`; `date_from?`, `date_to?` (from ≤ to, not in the future); `include_parent`, `include_teacher_observations`, `include_timeline` (default true); `include_health`, `include_family`, `include_private_notes` (default **false**); `assessment_id?`. **Steps:** permission → query → report model → HTML → PDF in memory → insert `report_exports` and audit `report.export` → **200** `application/pdf`, `Content-Disposition: attachment; filename*=UTF-8''kidsphere-<type>-<date>.pdf`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`. **Errors:** 400, 404, 503 `REPORT_BUSY` (render lock timeout), 500 `REPORT_FAILED` (logged without content). |
| `GET /api/children/{id}/reports` | The export log: type, language, range, by, at. Never the content. |

### 4.5 Timeline, content, AI suggestions
| Method and path | Owner | Change |
|---|---|---|
| `GET /api/children/{id}/timeline` | WP2-NAV | Filters `date_from, date_to, focus_area_id, domain, content_type, result, type[]`. Each source is filtered before the merge. New entry types: `questionnaire_submitted`, `plan_changed`, `summary_approved`, `assessment_closed`. `focus_closed` entries come from `record_versions`. |
| `GET /api/content/{cid}/versions` · `DELETE /api/content/{cid}` | WP2-AI | Versions: AI draft vs edits. DELETE still returns 204 but now soft-deletes (`deleted_at`). |
| `GET /api/children/{id}/ai-suggestions?kind` | WP2-AI | Staff-only list of the stored de-identified suggestions |

---

## 5. UI changes

### 5.1 Child profile navigation (WP2-NAV)
- **Tabs,** in logical order (mirrored automatically in RTL): **Overview · Parent View · Teacher Observation · Plan · Activities · Observations · Development · Reports**.
  - `TabNav` scrolls horizontally on phones.
  - The new path builders are added in WP1: `childParentView`, `childQuickBaseline`, `childTeacherObservation`, `childPlan`, `childObservations`, `childReports`.
  - Timeline becomes a section of Development; its route stays as a redirect.
- **Child header:** adds the kindergarten name and an **Export PDF** action (staff only).

**Overview cards, in order** (follows OM-D99-01: who → strengths → areas for support → what we do):

| Card | What it shows |
|---|---|
| **From the heart** | The parent's message: prominent, staff only, PARENT SAID. Never shown to other parents and never used in content. |
| **Good to know** | Most important thing (Q36), routines to keep, overwhelming situations, "Food note on file" and "Medical note on file" indicators that link to the Parent View, and "How to reach the family". |
| **Strengths** | ⭐ the 3 main strengths first |
| **Interests** | |
| **What helps** | |
| **Current focus** | Plus the next review date |
| **Recent development** | |
| **Prompts** | "Family answers received: quick baseline", the open question for the family, and "Review later" domains |

Provenance badges (`components/source/ProvenanceBadge`, WP1) are visible text chips, not tooltips.

**History filters:**
- The **Observations** tab (new `features/observation-history`) shows a list and detail view of quick and structured observations. Filter chips cover date range, focus, domain, context and source, and are kept in the URL.
- The **Development › Timeline** view has the same filter bar.
- Neither view shows charts, counts or percentages.

### 5.2 Parent wizard (WP2-PQ)
These are the 9 steps in source order. Each step is a few cards, follow-ups open only after "yes" or "other", and every question has a "Skip".

| Step | Contents (source section) |
|---|---|
| PW1 Me and my child | identity (read-only name, age, kindergarten; editable parent names), Q1–Q2 (א) |
| PW2 What my child loves | Q3 (12 source chips + other) + "what draws", Q4–Q7 (ב) |
| PW3 Feelings & mornings | Q8–Q12 + follow-up (ג), Q13–Q15 (ד) |
| PW4 Friends & talking | Q16–Q19 (ה), Q20–Q23 (ו) |
| PW5 Everyday independence | 8-row table, 2 columns (Independent / Needs help + optional "a little / a lot"), Q24–Q25 (ז) |
| PW6 Sleep, eating & health | Q26–Q29 (ח) with the notice "Stays inside the kindergarten team, never shared outside KidSphere" |
| PW7 Boundaries & changes | Q30–Q33 (ט), Q34–Q35 + follow-up (י) |
| PW8 Hopes & partnership | Q36–Q38 (יא; six labelled boxes), Q39–Q41 (יב; privacy hint on Q41) |
| PW9 Message from the heart | (יג) → **Send** (`questionnaire.submit`) |

- Progress is saved per step ("Save & finish later"). Each step shows a status pill; it is never a percentage.
- **Staff entry:** from the Parent View, "Enter the family's answers" opens the same 9 steps in `on_behalf` mode, and "Fill in together with the family" opens them in `meeting` mode (one card at a time, about 15 minutes, can be resumed; it records the meeting date and who attended).
- The staff wizard's per-step Parent/Teacher toggle is replaced by these two entry points. The staff wizard keeps the teacher perspective, steps 2–7 → focus → review.

### 5.3 Parent View tab (WP2-PQ)
- Shows the complete questionnaire read-only in source order (sections א–יג), rendered from the registry.
- Each section shows a status pill, "Not answered" markers and provenance ("Parent said · entered by {staff} · meeting on {date}").
- The health (ח) and family (Q41) blocks are collapsed with a **Private** badge.
- Each section has a **History** drawer (versions) and an **Initial / Latest** toggle.
- Data that only exists in the legacy keys appears under "From the earlier form".
- The closing "Teacher's first reading" summary links to the QB.

### 5.4 Teacher Quick Baseline (WP2-PQ)
- One screen. On the left, a read-only summary of the key parent answers (Q1, Q2, Q7, Q10, Q13, Q36, the heart message). On the right, the form:
  - exactly 3 strength slots, with suggestions from the parent's answers;
  - 3 "remember" lines;
  - what calms or helps (chips + text);
  - what may be difficult;
  - first area to observe (a domain picker + note);
  - a question for the family (open / clarified).
- Saving sets the bridge status and offers **Create baseline**.

### 5.5 Teacher Observation tab (WP2-TO, `features/assessment`)
- **Header card (section א):** child snapshot, cycle (Initial / Reassessment n), fill date, observation period, teacher, filled by, and the close and start-reassessment actions.
- **"How to observe" card:** the 7 principles as one-liners plus the motto. It is expanded on the first visit (remembered in localStorage) and becomes a one-line link afterwards. Also a one-line "not a diagnostic tool" note.
- **13 domain cards** with status pills; only one card is open at a time.
  - **Item rows:** 4 taps (Independent / With support / Difficult / Not observed, using the `support_levels.short` labels), a note icon, and a "Parent said" hint where the questionnaire has a matching answer. The column header reads "How much support was needed?".
  - **Domain fields** sit at the end of each card, plus an optional "Strengths seen here" row.
  - **D3** has two groups. **D8** uses binary buttons first, with "More" for the extended levels. **D9** has no levels, only effect chips and text. **D10** shows a permanent line: "Observed through play and daily activity, not a test".
  - **D11** is an accordion on phones and a 9×4 table on desktop, and shows recent observations for each stage as evidence.
  - **D12** has ordered slots and an "Add to profile" action. **D13** has at most 3 need cards, each with **Make it a Current Focus**.
- **"What to look for next":** AI observation questions (AI SUGGESTED). Tapping one pre-fills the quick-observation form.
- Source labels that `terminology.md` bans are replaced by the KidSphere wording listed in the matrix rows.

### 5.6 Quick observation form and Observations tab (WP2-TO for the form; WP2-NAV for the list page)
- `QuickObservationForm` keeps its 3-tap quick path.
- "More details" becomes the **Observe → Understand → Act** stepper:
  - A: what I see (helper + example);
  - B: when (time, activity chips, with whom, before, after);
  - C: what the child may need (7 chips + other);
  - D: what we will do (+ link to a focus);
  - E: did it change + what changed + documentation.
- Optional frequency, duration and intensity chips, plus a domain picker that does not depend on having a focus. The sequence strength → need → adaptation → action → follow-up is shown as a reminder line.

### 5.7 Plan tab (WP2-PLAN, evolves `features/focus`)
- One card per goal with **goal, what we will do, how often, who, how we will know it helps, follow-up date**, plus strength used / need / adaptation as the 6-step plan.
- Banner: "Choose 2–3 goals for this period". The hard maximum of 3 is kept.
- A "Family hopes" panel (PARENT SAID; suggestions only), D13 candidates, a "Closed goals" section with per-goal history, and **Export plan**, which opens the PDF dialog preset to R5.

### 5.8 Development tab (WP2-PLAN)
- **Understanding over time:** original baseline → each approved review → current, with dates and approvers.
- **Review flow:** adds a final **Follow-up** step (reassessment date, overall change, areas, what worked, what to change, next step with family or team, details).
- **Functional summary card:** Write, or Draft with AI (AI SUGGESTED badge, compare with the AI draft) → Approve (TEACHER APPROVED); plus a history list.
- **Original vs latest baseline viewer.**
- The **Timeline** section, owned by WP2-NAV and mounted through its own route.

### 5.9 Reports tab (WP2-PDF)
- **Export dialog:**
  - report type (6);
  - language (defaults to the UI locale);
  - date range (for Timeline and Full, plus the observation history range);
  - include toggles: parent, teacher observations, timeline, health & medical, family context, private notes;
  - a cycle picker for R3;
  - the note "Contains personal details: store securely".
- The file is downloaded as a blob through `apiBlob()`; the object URL is revoked after the click.
- Below the dialog is the export log.

---

## 6. PDF design (WP2-PDF)

### 6.1 Engine: WeasyPrint (decision)
- **Why WeasyPrint:** its text layout uses **Pango** with **FriBidi** for bidi and **HarfBuzz** for shaping. That gives correct Arabic joining, mixed-direction lines, `direction: rtl` tables and `@page` margin boxes from plain HTML and CSS.
- **Why not ReportLab:** it would need `arabic-reshaper` plus `python-bidi` and manual mirroring of tables and wrapped lines. Bidi breaks when text wraps, which fails "never reversed or disconnected letters".
- **Server fit:** Ubuntu 24.04 already has libpango 1.52 (WeasyPrint needs ≥ 1.44), HarfBuzz 8.3 and fonts-noto-core. No apt changes are needed; the CI script installs the pip dependencies into its cached venv.
- **Dependencies:**
  - `backend/requirements.txt`: `weasyprint` (pin the latest stable 6x.y at implementation time) and `Jinja2==3.1.*`.
  - `backend/requirements-dev.txt`: `pdfminer.six`, `pypdf`, `python-bidi`.
- **Fonts are bundled** in `backend/app/reports/fonts/` (OFL, with `OFL.txt`) so rendering is identical in CI and production:
  - `Rubik` (variable TTF; Latin and Hebrew; already the UI body font);
  - `NotoSansHebrew` (variable; Hebrew fallback);
  - `NotoSansArabic` (variable; Arabic).

  They are loaded with `@font-face` through a **local-only `url_fetcher`**, which refuses http, https and any file path outside `app/reports/`. The system `fonts-noto-core` remains the last fallback.

  | Language | `font-family` |
  |---|---|
  | he | `"Rubik", "Noto Sans Hebrew", sans-serif` |
  | ar | `"Noto Sans Arabic", "Rubik", sans-serif` |
  | en | `"Rubik", sans-serif` |

### 6.2 Package layout (`backend/app/reports/`)
| Path | Content |
|---|---|
| `service.py` | `export_pdf(db, user, child_id, body) -> (bytes, filename)`: access → builder → render → `report_exports` + audit. It **never imports `app.ai`**. |
| `builders/{full,parent_questionnaire,teacher_observation,current_development,intervention_plan,timeline}.py` | Each returns a plain **report model** `{meta, sections[{key, title, source_label, blocks[]}]}`. Builders iterate the registries (no hand-picked fields), so a new registry item appears in R2 and R3 automatically. |
| `i18n.py` + `messages/{en,ar,he}.json` | Report strings: titles, column headers, "Not answered", the disclaimer, provenance labels. A test checks key parity and runs the banned-terms scan with `allow_phrases`. |
| `render.py` | A Jinja2 `Environment(autoescape=True)` and `HTML(string, base_url=reports_dir, url_fetcher=local_only).write_pdf()` to **bytes** (no temp file). A module-level `BoundedSemaphore(1)` with a timeout → `REPORT_BUSY`. `XDG_CACHE_HOME` must be writable. |
| `templates/` | `base.html`, `_header.html`, `_footer.html`, `_blocks/{qa,table,levels,day_map,plan_table,timeline,provenance}.html`, `report_<type>.html` |
| `static/report.css`, `static/page-{ltr,rtl}.css` | Brand tokens (warm palette, rounded chips, no checkbox grids, no scores); the direction-specific `@page` rules |
| `fonts/` | the TTFs + `OFL.txt` |

### 6.3 Layout and RTL rules
- `<html lang="{he|ar|en}" dir="{rtl|ltr}">`. CSS uses logical properties only (`margin-inline-start`, `padding-inline`, `text-align: start`, `border-inline-start`) and no `left`/`right`.
- **Tables** are written in DOM order with `direction: rtl` inherited, so the first column renders on the right. Width hints use `<colgroup>`. `thead` repeats on page breaks and `tr { break-inside: avoid; }`.
- **Mixed content:** names, dates, ages, numbers, e-mail addresses and Latin words are wrapped in `<bdi>` or `.iso { unicode-bidi: isolate }`. Phone numbers are `dir="ltr"`. Dates use Western digits in every language (PLAN C) and the format comes from `messages` (`d.M.yyyy` for he/ar). Free text typed by users is rendered with `dir="auto"`.
- **Header:** `position: running(header)` placed in `@page { @top-center }`. Page 1 has the full header (KidSphere logo text / "Child Development Report" or the report title / child name / age / kindergarten / report date / prepared by). Later pages get a compact one-line header.
- **Footer:** `@bottom-center` holds the disclaimer. The page number box ("page x of y" via `counter(page)` / `counter(pages)`) goes in `@bottom-left` in RTL and `@bottom-right` in LTR (`page-rtl.css` / `page-ltr.css`).
- **Source attribution:** a small label per section ("Parent Input", "Teacher Observation", "Teacher-Approved Understanding", "AI-Assisted Draft, approved by {name} on {date}"). Unapproved AI text is never printed.
- **Never clinical:** support levels print as words in soft chips; "Not observed yet" and "Not answered" are muted; there are no scores, totals, percentages or checkbox grids.

### 6.4 The six reports
| Report | Sections (in order) |
|---|---|
| R1 Full Child Report | Header → "In the family's words" (heart message; authorized) → basics → parent questionnaire summary (Parent Input; `include_parent`) → quick baseline + teacher observation by domain (`include_teacher_observations`) → original and latest baseline → strengths / interests / what helps with sources → focus and plans (current + closed in range) → observation history (date range) → development reviews + follow-up → latest **approved** functional summary → health / family / private notes only when their include flags are set |
| R2 Parent Questionnaire | Header + "Filled on / entered by / meeting" block → sections א–יג in source order (every question, "Not answered" where empty; options printed with source labels; Other texts) → ח and Q41 only with include flags → closing "Teacher's first reading" (QB) |
| R3 Teacher Observation | Header + section א (cycle, period, teacher, filled by) → principles box → 13 domain tables (Indicator / Support needed / Notes; D8 Function / Independent / Needs help / Notes; D9 Stimulus / What happens / What helps; D11 Stage × 4) with status per domain → domain fields → D12 strengths, D13 needs → structured observations (D14 A–E) in the period |
| R4 Current Development | Teacher-approved understanding (approver and date) → strengths → active focus (≤3) → recent observations (default: since the last review) → interventions (approved activities + results) → progress in words (review statuses, never scores) → next plan (next steps, reassessment date, involvement) |
| R5 Intervention Plan | Period header + "2–3 goals" note → table Goal / Method / Frequency / Responsible / How we will know it helps / Follow-up date (RTL order) with strength / need / adaptation sub-rows → family hopes (Parent Input) |
| R6 Timeline | Date range (default: since the first baseline) → entries oldest first, grouped by month: baseline → plans (opened / changed / closed) → activities → observations → reviews → approved updates (summaries, closed cycles); each with a type label and source tag |

### 6.5 Tests (on the Ubuntu server via `deploy/ci/remote-test.sh <label> backend`)
`tests/test_reports_rtl.py` renders **real PDFs** from fixture children in he, ar and en, then parses them with `pdfminer.six`. A custom `PDFLayoutAnalyzer` subclass records `(char, cid, fontname, x0, x1, y0)` for every glyph.

1. **Logical ↔ visual order.** For each expected string (a Hebrew sentence with a number and a Latin word; an Arabic sentence with a date), the line's glyphs are sorted by `x0`. The resulting string must contain `bidi.get_display(expected, base_dir='R')`. This checks bidi, mixed numbers and isolation. Test strings avoid the lam-alef ligature, or the helper expands it.
2. **Arabic is joined, not isolated.** The fixture contains "ببب" next to an isolated "ب". The three joined glyphs must have **pairwise different cids**, all different from the isolated glyph's cid, while all four map to U+0628 through ToUnicode. This proves HarfBuzz chose the initial, medial and final forms. The same check runs on a real word, `مرحبا`.
3. **RTL table order.** In every he/ar table, the header cell of the first DOM column has the largest `x0`.
4. **Right alignment.** In RTL paragraphs, the `x1` of each line is within 1pt of the content-box right edge.
5. **Header and footer on every page.** `pypdf` page count; each page contains the disclaimer and "x / y"; page 1 contains the child name, age and kindergarten.
6. **Fonts embedded.** Every font object is one of the bundled subsets, so no tofu or system substitution is possible.
7. **Content rules.** No "%", "score" or "points"; unapproved AI drafts are absent; health and Q41 are absent unless their include flags are set.
8. **API.** 401 without a session; 404 for a parent or an out-of-scope teacher; one `report_exports` row and one `audit_log` row per export; no row on failure; response headers as in §4.4; nothing is written under `/tmp` (`os.listdir` before and after).
9. **Artifacts.** If `pdftoppm` is available, the sample PDFs are also rasterised to PNG and kept as CI artifacts for a human visual check. They are never asserted pixel-by-pixel.

### 6.6 Operations
- Systemd unit `kidsphere-mvp-api.service`: `Environment=XDG_CACHE_HOME=/var/lib/kidsphere/cache` (with a matching writable `ReadWritePaths`), because `ProtectSystem=strict` blocks fontconfig's default cache.
- Keep 1 worker and `MemoryMax=512M`. One render at a time; a test measures the peak RSS of R1 for a seeded child and must stay under 250 MB.
- No public URL, no file on disk, no path in any response or error.

---

## 7. AI changes (WP2-AI)
1. **Category deny-list driven by the registries.** Anything with `sensitivity` ∈ {health, medical, family, third_party}, any parent free text, and identity fields (names, parent names, kindergarten, birth date, contact) are **never** put in any payload. The payload builders read `ai_policy` from the registry, so a new question is excluded by default unless it is explicitly marked `label` or `domain`.
2. **`avoid` list.**
   - Remove the parent-reported sensitivities, including `certain_foods`.
   - `avoid` now comes **only** from teacher-observed `TA.sensory.items` whose `effect` ∈ {affects, sometimes}, mapped to sensitivity keys. Maximum 3.
   - `baseline_items(for_ai=True)` drops sensitivity support needs. Independence levels are kept only for independence-relevant requests.
3. **Domain-structured, minimised context.** `AIContext.domains = {<ai_domain>: {assessment: [{item, level}], observations: [{id, observed_at, context, support_level, text≤300 masked}], helps: [keys]}}`, filled only for `relevant_domains(request)`.
   - The mapping lives in `app/ai/domains.py`: focus category → domains; strength target → domains; content type has no domains; analysis → domains that have data in the period, with caps per domain.
   - Item keys carry their `ai_domain`; D03-11..14 map to `communication`.
   - The domains actually sent are stored in `generation_input.domains` or `ai_suggestions.domains`.
4. **Observations:** send only the masked `observation` / `details.what_i_see`. Stop appending `observations.note`. Never send `when_detail.with_whom/before/after`, `what_changed`, `documentation`, need texts, day-map texts or any notes.
5. **Focus plan:** drop `plan.who`. The other plan fields stay masked and clipped (400).
6. **De-identified analysis.** The understanding, functional-summary and observation-question payloads use `[child]` instead of the name, and the response is restored locally. Content generation keeps the first or preferred name (SPEC §15; OQ-4). `name_masker` gains phone and e-mail scrubbing.
7. **New outputs.**
   - `UnderstandingSuggestion` gains `possible_patterns[≤5]` (hedged wording) and `next_observation_questions[≤5 {domain, question}]`.
   - A new `FunctionalSummaryDraft` with general_description, main_strengths, main_needs (as areas for support), adaptations, team_recommendations, possible_patterns and next_observation_questions. Its schema has **no** follow-up-with-parents, involvement, focus-decision or closing fields.
   - New prompt `FUNCTIONAL_SUMMARY_SYSTEM_PROMPT` and a deterministic template-provider fallback.
   - **Contract for WP2-PLAN:** `app.ai.service.draft_functional_summary(db, child, lang, user) -> (draft: dict, suggestion: AiSuggestion)` and `app.ai.service.suggest_understanding(...)`, which now persists an AIS row.
8. **Safety.**
   - A new `banned_terms.ai_only` group (en refer/referral/specialist evaluation/therapist assessment; he הפניה/הפנייה/להפנות; ar إحالة/تحويل إلى أخصائي) is checked on **every AI output field** but never on teacher input.
   - `child_deficit` terms are also checked on teacher-facing AI text.
   - The prompts add "never recommend referral or professional evaluation; never close goals; never present patterns as facts".
9. **Persistence.** Every suggest call inserts an `ai_suggestions` row with the exact de-identified input and the output. Its outcome is set when the teacher saves (`accepted` or `edited`) or leaves it (`discarded`, lazily on the next suggest).
10. **Tests (`tests/test_ai_payload_policy.py`).** For every registry item with `ai_policy=never`, a fixture child with a unique marker string in that field is generated. The test asserts that the marker appears in no `generation_input`, no `ai_suggestions.input` and no captured provider request. Further assertions:
    - no child, parent or classmate name, phone or e-mail appears in analysis payloads;
    - only the relevant domains are present;
    - the referral wording in a fake provider output is rejected and falls back to the template.

---

## 8. Open questions and the decisions taken (no answer came before wave 2, so every proposed default applies)
| # | Question | Proposed default | Decision (implemented) |
|---|---|---|---|
| OQ-1 | SPEC-UPDATE requires health and medical answers (Q26–Q29); PLAN-ADJUSTMENTS A10 said "no health.safety_note". | **Supersede A10.** Store `PP.health`. Staff with child access and the authoring parent can read it. It is never sent to AI. It is printed only with `include_health`, and every export is logged. | **Default taken.** `PP.health` is stored and versioned; the payload builder and `tests/test_ai_payload_policy.py` keep it out of every AI call; R1/R2 print it only with `include_health`; the family reads its own answers. |
| OQ-2 | Wording of "הפניה בהתאם לצורך" (D16-07); terminology bans "הפניה" and "צוות רב-מקצועי". | Key `referral_as_needed`. Teacher-only labels: he "שיתוף גורם מקצועי לפי הצורך", en "Involve a specialist if needed", ar "إشراك مختص عند الحاجة". It is never produced or suggested by AI (`ai_only` banned group). | **Default taken.** `involvement_steps.referral_as_needed` with the teacher-only labels; `banned_terms.ai_only` is checked on every AI output field and never on teacher input. |
| OQ-3 | Required labels and text that hit `terminology.md` or `banned_terms`: the PDF disclaimer ("diagnosis" / "אבחנה" / "تشخيص"), "Intervention Plan", "success indicator", "קשב וריכוז", "ויסות חושי", "התנהגות", "מוקדי צורך", "קושי מרכזי", "מוצף", age-norm wording. Also, should teacher free text with clinical words be blocked? | The exact three disclaimer sentences go into `allow_phrases`. Report titles: en "Intervention Plan", he "תוכנית עבודה אישית", ar "خطة العمل الفردية". The other labels use the KidSphere wording in the matrix rows; the verbatim source is kept only in the registries (`source_he`, never rendered). `terminology.md` is updated in WP1. Teacher text in assessments and follow-up **warns** but is not blocked. Review text keeps today's 422. | **Default taken.** The three disclaimer sentences are in `allow_phrases` and print verbatim; R5 carries the agreed titles; assessment and follow-up text warns (never blocks), review text keeps the 422. |
| OQ-4 | Should the child's first name still go to the AI? | Analysis calls (understanding, functional summary, observation questions) use `[child]`. Child-facing content generation keeps the first or preferred name (SPEC §15). | **Default taken.** Understanding, functional-summary and observation-question payloads use `[child]` (restored locally); content generation keeps the first or preferred name. |
| OQ-5 | PLAN B9 allows hard-deleting drafts; SPEC-UPDATE says "never overwrite content". | Soft delete (`deleted_at`). The user-facing behaviour is the same: the draft disappears from lists. | **Default taken.** `DELETE /api/content/{id}` soft-deletes drafts (`deleted_at`, `deleted_by`); deleted drafts are hidden everywhere. |
| OQ-6 | The D13 "behaviour" need area (terminology: no category) and the curiosity item (D10-11) scale. | Keep the key `behaviour`, with labels he "התמודדות במצבים יומיומיים" / en "Coping in everyday situations"; promoting it requires a concrete focus title. Curiosity is note-first with an optional level. | **Default taken.** Key `behaviour` with the neutral labels; promoting it needs a title (422 otherwise); `curiosity_exploration` is note-first with an optional level. |
| OQ-7 | May a parent export their own questionnaire PDF? | **No** in this phase. Exports are staff-only (404 for parents). | **Default taken.** Every report endpoint is staff-only; parents get 404. |
| OQ-8 | Independence scale in the teacher full observation (D8): 2 or 4 levels? | Binary first (Independent / Needs help = `some_support`); "More" adds significant support and not observed. One storage scale. The PDF prints the binary meaning. | **Default taken.** D8 offers Independent / Needs help first ("More" adds the other two levels) on the one support scale; the PDF prints the binary meaning. |

---

## 9. Implementation waves (summary; the full package definitions are returned to the orchestrator)
| Wave | Package | Owns (disjoint within the wave) |
|---|---|---|
| 1 | **WP1-DB** Foundation: migration 0002, models, history, vocabulary fragments, provenance, terminology | `backend/migrations/versions/0002_source_documents.py`, `backend/app/models.py`, `backend/app/services/history.py`, `backend/app/provenance.py`, `backend/app/vocab.py`, `backend/app/errors.py`, `backend/app/routers/source_model.py`, `backend/app/data/options.json`, `backend/app/data/lists/common.json`, `backend/tests/{conftest,test_migrations,test_history,test_vocab,test_options_data,test_source_model}.py`, `docs/terminology.md` |
| 1 | **WP1-FE** Frontend plumbing | `frontend/src/lib/{paths,api}.ts`, `frontend/src/components/source/**`, `frontend/src/lib/sourceModel.ts`, `frontend/src/i18n/messages/*/common.json` |
| 2 | **WP2-PQ** Parent questionnaire + quick baseline + Parent View | `backend/app/{schemas/profile.py, services/profiles.py, services/questionnaire_projection.py, routers/profiles.py}`, `backend/app/data/source/parent_questionnaire.json`, `backend/app/data/lists/parent_questionnaire.json`, `backend/tests/{test_profile_wizard,test_parent_questionnaire,test_quick_baseline}.py`, `frontend/src/features/{wizard,parent-view,quick-baseline,parent}/**`, `frontend/src/i18n/messages/*/{wizard,parentView,quickBaseline,parent}.json` |
| 2 | **WP2-TO** Teacher observation domains + structured observations | `backend/app/{schemas,services,routers}/{assessments,observations}.py`, `backend/app/data/source/observation_model.json`, `backend/app/data/lists/observation_model.json`, `backend/tests/{test_assessments,test_observations}.py`, `frontend/src/features/{assessment,observations}/**`, `frontend/src/i18n/messages/*/{assessment,observations}.json` |
| 2 | **WP2-PLAN** Plan/goals, follow-up, functional summary, baselines | `backend/app/{schemas,services,routers}/{focus,focus_areas,reviews,functional_summaries,baselines}.py` (as present), `backend/app/data/lists/plan.json`, `backend/tests/{test_focus_areas,test_reviews,test_functional_summaries,test_baseline}.py`, `frontend/src/features/{focus,development}/**`, `frontend/src/i18n/messages/*/{focus,development}.json` |
| 2 | **WP2-PDF** PDF reports + Reports tab | `backend/app/reports/**`, `backend/app/{routers,schemas}/reports.py`, `backend/tests/test_reports_*.py`, `backend/tests/fixtures/reports/**`, `backend/requirements*.txt`, `deploy/systemd/kidsphere-mvp-api.service`, `frontend/src/features/reports/**`, `frontend/src/i18n/messages/*/reports.json` |
| 2 | **WP2-NAV** Tabs, Overview, provenance UI, history filters | `frontend/src/features/{children,timeline,observation-history}/**`, `backend/app/{services,routers}/timeline.py`, `backend/tests/test_timeline.py`, `frontend/src/i18n/messages/*/{children,timeline,history}.json` |
| 2 | **WP2-AI** AI context, safety, summary draft, content history | `backend/app/ai/**`, `backend/app/{services,routers,schemas}/content.py`, `backend/app/routers/ai_suggestions.py`, `backend/tests/test_ai_*.py`, `backend/tests/test_content.py`, `frontend/src/features/content/**`, `frontend/src/i18n/messages/*/content.json` |
| 3 | **WP3-INT** Integration + matrix verification | `backend/tests/test_coverage_matrix.py`, `backend/tests/test_source_docs_e2e.py`, `frontend/src/test/source-docs.test.tsx`, `docs/mvp-refocus/COVERAGE-MATRIX.md`, `ARCHITECTURE.md`, `docs/mvp-refocus/ARCHITECTURE.md`, plus integration fixes anywhere (sole owner in wave 3) |

**Cross-package contracts.** They were fixed before wave 2 so that it could run in parallel; WP3-INT wired the packages together and removed the mocks:
- **The registry JSON shape:**

  ```text
  {meta, sections[{id, key, order, label{en,ar,he}}],
   items[{id, section, order, kind, storage, options?, sensitivity, ai_policy,
          pdf, label{en,ar,he}, source_he}]}
  ```
- `GET /api/teacher-assessments` output (§4.2)
- `profile_out` additions (`provenance[]`, `section_status`, `questionnaire`)
- `app.services.history.record(...)` and `app.provenance.derive(...)` (WP1)
- `app.ai.service.draft_functional_summary(...)` and the `suggest` persistence (WP2-AI → WP2-PLAN)
- the report builders read only the DB tables of §3 and the registries (WP2-PDF)

**Before wave 1:** the uncommitted branding work (`AppShell.tsx`, `index.css`, the icons, the favicon, `components/brand`) was handled in wave 1 together with LOGO-COLOURS (new tokens, icon paints, the contrast guard test).
