# KidSphere spec update — source-document requirements + PDF export (product owner, 2026-10-06)

Both source documents are functional source-of-truth requirements:
1. שאלון היכרות – "להכיר את הילד שלי" (`parents-intake-questionnaire.md`; original `C:\Users\A\Documents\שאלון היכרות.docx`)
2. מודל תצפית, הערכה ותוכנית התערבות לילד בגיל הרך – 3–5 שנים (`observation-model.md`; original `C:\Users\A\Documents\מודל_תצפית_והערכת_תפקוד_ילד_בגיל_הרך_3-5.docx`)

Every meaningful field, question, rating, observation area, planning item, follow-up field and summary field from these documents must have a place in KidSphere.
- Don't build them as one giant form. Translate them into a good workflow: group related questions, wizard steps, cards, hidden advanced sections, saved progress, "not observed / not answered", progressive disclosure.
- The underlying system must preserve the complete information.

## Parent questionnaire — complete requirement (Parent Baseline)

- **A. Introduction**: child name, parent/guardian name, child age, kindergarten, describe in 3–5 words, what the parent especially loves/appreciates.
- **B. Interests**:
  - Options: pretend play, cars/transportation, building/assembly, drawing/crafts, music/singing, dance/movement, stories/books, outdoor play, animals, social games, computer/screen games, other.
  - What especially attracts the child?
  - These feed content personalization.
- **C. What makes the child happy/successful**: what makes them feel happy, safe and successful; what they like doing at home; activities where they persist a long time; things they excel at or show special ability in. These feed strengths, motivators and preferred activity types.
- **Emotional world**:
  - What helps when sad.
  - Typical reaction when angry/frustrated: crying, shouting, moving away, turning to an adult, asking for a hug, difficulty calming, outburst, other.
  - Best way to calm; reaction to new situations/people; situations that overwhelm/stress; what the teacher should know in these situations.
- **Morning separation**:
  - Separates easily / needs time / finds separation very difficult / varies by day.
  - What helps entry into kindergarten; transition object/separation routine (may become useful context later).
- **Social (parent view)**:
  - Initiates play / waits to be approached / prefers playing alone / mainly plays with familiar children / needs mediation / other.
  - Reaction when another child takes a toy or disagrees; significant friendships; what helps the child succeed socially.
- **Communication & language (parent view)**:
  - Expresses needs/wants by: words, sentences, gestures, crying/behaviour, turns to adult, other.
  - Likes telling experiences (frequency/degree); additional home language (which); anything the teacher should know about communication/language.
- **Independence (parent view)**:
  - Areas: eating, drinking, toilet, washing hands, dressing, shoes, tidying toys, looking after belongings.
  - States must keep the meaning Independent / Needs Help. The UI may extend to Independent / Some Support / Significant Support but must stay compatible with the original.
  - Also: activities the parent still assists with; important home routines/habits to preserve.
- **Sleep, eating, health context**:
  - Typical sleep; food sensitivity/preferences/eating difficulties; sensitivity to noise/touch/clothing/dirt/smell/textures; limitations, sensitivities or medical instructions staff need to know.
  - STAYS INSIDE KidSphere: never sent to external AI. The default AI payload builder must exclude this category.
- **Boundaries & behaviour**: how boundaries are set at home; what works well; what does not work; what helps cooperation when the child refuses. May contribute to what_helps, but stays attributed to the Parent Perspective.
- **Change & transitions**:
  - Stopping a preferred activity: easily / needs advance preparation / resists / cries-gets angry / finds it very difficult.
  - Does preparation help: yes / no / sometimes; what preparation helps.
- **Parent expectations**:
  - Most important thing for the teacher to know.
  - How the parent wants the child to feel: safe, loved, belonging, independent, capable, happy, socially accepted, curious, other.
  - What the parent wants the child to develop: emotional, social, language, motor, independence, other.
  - These SUGGEST, never decide, the teacher's focus areas.
- **Home–kindergarten partnership**:
  - Preferred communication method when a difficulty arises: personal conversation / phone / message / structured meeting / other.
  - What is important to the parent in communication with the teacher; additional child/family context.
  - No identifying family info sent externally.
- **"Message from the heart"**: one thing to tell the teacher before she meets the child. Display it prominently but privately in the teacher profile.

### Teacher review after the parent questionnaire (bridge to the observation cycle)
Exactly 3 main strengths; 3 things I should remember about this child; what calms/helps; what may make things difficult; first area to observe; a question I want to clarify with the parent.

## Teacher observation model — complete requirement

- **Observation principles** (concise guidance, not a long page every time):
  - Observe in natural, varied situations.
  - Record behaviour, not interpretation.
  - Consider frequency, intensity, duration and context.
  - Distinguish independent performance from performance with mediation.
  - Note strengths and interests alongside every difficulty.
  - Don't compare children inappropriately.
  - Interpret relative to age, context and development.
- **Functional levels**: Independent / With mediation-support / Difficult; notes allowed.
- **Domain 1 Emotional**:
  - Items: recognizes basic emotions; expresses emotions appropriately; calms after frustration; handles separation from parent; accepts routine change; requests help when needed; shows confidence in the environment.
  - Also: what triggers difficulty; what helps the child calm.
- **Domain 2 Social**:
  - Items: initiates contact; joins existing play; shares play/materials; waits for turn; accepts boundaries; resolves conflict with support; empathy/consideration; participates in group play; interacts with different children.
  - Also: main observation.
- **Domain 3 Language & communication**:
  - Receptive: simple instructions; multi-step instructions; questions; basic concepts.
  - Expressive/social: age-appropriate vocabulary; combines sentences; tells an experience; describes event/picture; asks questions; expresses needs verbally; listens to others; short conversation; waits for conversational turn; adjusts speech to situation.
  - Also: language notes/examples.
- **Domain 4 Attention, concentration, executive functioning**:
  - Items: listens to story; participates in group meeting; completes activity; persists in task; understands what is required; starts task; finishes task; organizes equipment; transitions between activities; accepts change; tries an alternative way; copes with mistake.
  - Also: approximate attention duration in different situations.
- **Domain 5 Play**:
  - Items: chooses activity independently; plays independently; persists in play; imaginative play; role-play; imitates everyday life; parallel play; shared/cooperative play; accepts others' ideas.
  - Also: preferred types of play.
- **Domain 6 Gross motor**:
  - Items: walking/running; two-foot jumping; one-foot jumping (age appropriate); stairs; balance; climbing; throwing/catching; movement games.
  - Also: avoidance of physical activity yes/no + detail.
- **Domain 7 Fine motor & graphomotor**:
  - Items: tool grip; free drawing; copying shapes; colouring; cutting; gluing; threading; block building; puzzles; bilateral coordination.
  - Also: strengths in this area; main difficulty.
- **Domain 8 Independence**:
  - Items: eating; drinking; toilet; washing hands; dressing/undressing; shoes; organizing belongings; keeping belongings.
  - Levels Independent / Needs Help + notes.
- **Domain 9 Sensory regulation**:
  - Items: noise; touch; textures; dirt; light; smells; movement; crowded environment; creative activities.
  - Also: what the child does when overwhelmed; what helps regulation. No diagnostic sensory score.
- **Domain 10 Cognition & learning**:
  - Items: matching/sorting; colours; shapes; size concepts; quantity concepts; sequencing; memory; picture/object matching; cause and effect; simple problem solving; curiosity/exploration.
  - Assessed through play, natural activity and observation, not a formal test. Reflect this in the UX.
- **Domain 11 Participation through the day (Day Map)**:
  - Stages: arrival, free play, group meeting, structured activity, yard, meal, creative activity, transitions, end of day.
  - For each stage: what succeeds / what is difficult / what support is needed / what helps.
- **Domain 12 Strengths**: at least 3–5 strengths, abilities and interests, plus prominent interests. These feed content generation, activity planning, motivation, Strength Builder and Growth Support.
- **Domain 13 Priority needs** (up to 3; never called diagnoses; they become Current Focus candidates):
  - Areas: emotional, social, language, communication, attention/concentration, motor, cognitive, independence, sensory regulation, behaviour, adaptation to setting.
  - For each: what exactly are we seeing; how frequently; in which situations; what triggers it; what we already tried; what helped.
- **Domain 14 Observe → Understand → Intervene**:
  - A. What do I see (objective).
  - B. When: time, activity, with whom, before which event, after which event.
  - C. What the child might need: mediation, reduced stimulation, short instruction, visual support, movement, positive reinforcement, advance preparation.
  - D. What we will do.
  - E. Did anything change: yes/partly/no, and what changed.
  - Maps to PLAN → APPLY → OBSERVE → ANALYZE → APPROVE → REPLAN.
- **Domain 15 Short individual intervention plan**:
  - Fields: goal, action/method, frequency, responsible person, success indicator.
  - Only 2–3 goals per period: enforce or strongly guide this.
- **Domain 16 Follow-up review**:
  - Reassessment date; improvement level: significant / partial / no change; in which areas; what worked well; what requires change.
  - Parent/multidisciplinary involvement: no / consultation / shared plan / referral as appropriate. This is a teacher-entered field; AI never recommends referral.
- **Domain 17 Short functional summary**:
  - Fields: general description; main strengths; main needs; recommended adaptations; continued follow-up/parent collaboration; recommendations for team.
  - Written manually or as an AI draft (de-identified externally; a draft; needs teacher approval).

## Full data history
Never overwrite. Keep:
- the parent initial questionnaire
- the teacher initial assessment
- the original baseline
- observations
- intervention plans
- content/activities
- feedback
- reassessments
- functional summaries
- AI suggestions
- teacher-approved changes
- closed and current goals

Show how understanding developed over time.

## Perspectives stay distinct
Provenance labels: PARENT SAID / TEACHER OBSERVED / AI SUGGESTED / TEACHER APPROVED. Never merge them into an anonymous profile.

## Progressive workflow
- The Initial Parent Wizard covers the parent questionnaire.
- The Teacher Quick Baseline covers strengths, what helps, what may be difficult and the first area to observe.
- The Teacher Full Observation is filled in gradually.
- Each section has a status: Not Started / In Progress / Sufficient Observation / Review Later.
- Teachers never have to complete 100 fields before using the app.

## PDF export (required)
- **Where**: an "Export PDF" button on the child profile.
- **Report types**:
  1. Full Child Report: basics, parent questionnaire, teacher observations, baseline, strengths, interests, focus, intervention plans, observation history, development review, functional summary.
  2. Parent Questionnaire.
  3. Teacher Observation Report: all domains and notes.
  4. Current Development Report: understanding, strengths, active focus, recent observations, interventions, progress, next plan.
  5. Intervention Plan: goals, method, frequency, responsible person, success indicator, follow-up date.
  6. Timeline Report: baseline → plans → activities → observations → reviews → approved updates, with a date range.
- **Language**: ar/he/en, defaulting to the teacher's UI language, selectable.
- **TRUE RTL for he/ar**: direction, right-aligned paragraphs, RTL table order, mixed numbers, proper fonts, wrapping, headers/footers. Never reversed or disconnected letters. Test actual PDFs.
- **Generation**: locally on the Python backend (WeasyPrint or ReportLab-with-RTL; pick the best RTL result). No external service, no AI.
- **Contents**: may contain real identifying details, for authorized use.
- **Access and storage**:
  - Requires auth and verifies child access.
  - Logs every export.
  - No public URL. Temp files are protected and cleaned up. No filesystem paths sent to the client.
- **Layout**:
  - Header: KidSphere / Child Development Report / name / age / kindergarten / report date / prepared by. Never clinical-looking.
  - Footer disclaimer: "This report is based on parent information, teacher observations and educational follow-up. It is not a medical or clinical diagnosis."
  - Source attribution where useful: Parent Input / Teacher Observation / Teacher-Approved Understanding / AI-Assisted Draft. An AI statement is never presented as verified fact.
- **API**: `POST /api/children/{id}/reports/pdf`
  - Body: `{report_type, language, date_from, date_to, include_parent, include_teacher_observations, include_timeline}`.
  - Steps: verify permission → query → build the report model → render HTML → generate PDF → return a protected download → audit.
- **Audit table**: `report_exports(id, child_id, report_type, language, generated_by, generated_at, date_range)`. Report content is not stored.

## Child profile navigation (suggested tabs)
- **Overview**: strengths, interests, what helps, focus, recent development.
- **Parent View**: the complete questionnaire.
- **Teacher Observation**: all domains.
- **Plan**: goals and intervention plan.
- **Activities**: stories, games, videos, activities.
- **Observations**: quick and structured.
- **Development**: timeline, reviews, understanding.
- **Reports**: PDF.

## History filters
Filter by date, focus area, domain, activity and result. No BI system.

## AI uses professional domains
- Structure sanitized observations by domain: emotional, social, communication, language, executive_function, play, gross_motor, fine_motor, independence, sensory, cognitive, daily_routine.
- Send only the domains relevant to the request (data minimization).
- **AI may**: summarize, identify possible patterns, draft understanding updates, suggest activities, propose adaptations, propose next observation questions.
- **AI must NOT**: diagnose, mark deficits, refer, close goals, overwrite teacher assessment, or override parent/teacher source data.

## Implementation instruction
1. Read both DOCX completely.
2. Extract every question, field and option.
3. Produce a requirements coverage matrix (SOURCE DOCUMENT → SECTION → QUESTION/FIELD → DB FIELD/JSON PATH → UI SCREEN → API → PDF SECTION).
4. Compare it with the implementation.
5. Identify the gaps.
6. Propose DB changes.
7. Implement without destroying data.
8. Add PDF export.
9. Test Arabic and Hebrew RTL.
10. Verify every source requirement is mapped.

Return the coverage matrix before changing major database structures.

## Final product model
- **KNOW**: parent questionnaire plus teacher observations.
- **PLAN**: strengths and interests plus up to 3 growth areas.
- **APPLY**: stories, games, videos, audio, music and real-world activities via interchangeable AI providers.
- **LEARN & ADAPT**: observe → analyze de-identified data → the teacher approves → replan.
- An authorized teacher can export a professional PDF at any time.
