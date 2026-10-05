# KidSphere — MVP refocus specification (from the product owner, 2026-10-05)

Core idea: Understand the child, identify strengths and growth areas, generate personalized content, observe what happens, and improve the child profile over time.
NOT a school ERP, clinical system, therapy system, research platform or large enterprise app. Simple enough for a kindergarten teacher during a busy day.

## 1. Required stack (exactly)
- Frontend: React, JS or TS (match existing), responsive web app.
- Backend: Python, FastAPI preferred, REST API.
- Database: PostgreSQL.
- Deployment: Ubuntu server, Nginx, systemd, PostgreSQL as normal Ubuntu service, React production build served by Nginx, FastAPI running directly on Ubuntu.
- DO NOT USE: Docker, docker-compose, Kubernetes, Redis, Celery, Kafka, RabbitMQ, message queues, microservices, Firebase, Supabase, unnecessary cloud infra, unnecessary architecture layers.
- Whole MVP deployable on one Ubuntu server. Browser → Nginx (React static; /api → FastAPI) → PostgreSQL.

## 2. Product philosophy
Help teachers and parents understand each child and provide personalized developmental content. Must NOT diagnose.
Avoid: diagnosis, disorder, ADHD, autism, developmental disorder, pathology, deficit (unless entered manually by an authorized professional as external info in a future version).
Use: Initial Profile, Baseline, Current Understanding, Strengths, Interests, Growth Areas, Areas for Support, Current Focus, Observations, Development.
Professional framework: Strength → Need → Adaptation → Intervention → Follow-up. Must be preserved.

## 3. Core MVP flow
Add Child → Parent + Teacher Onboarding Wizard → Create Initial Baseline → Identify Strengths + Interests → Choose up to 3 Current Focus Areas → Generate Personalized Content → Teacher Reviews and Approves → Child Experiences Story/Video/Game/Activity → Teacher Adds Quick Feedback/Observation → Compare Against Baseline → Current Understanding Evolves → Future Content More Relevant.
The initial profile is not permanently correct. Later observations may support / partially support / contradict / refine it, show improvement, reveal new strengths, reveal different support needs. Always keep the original baseline for history; never silently overwrite.

## 4. Add Child — onboarding wizard
"Add Child" opens a simple multi-step wizard (not a huge form). ~5–7 minutes. Save and continue later.

## 5. Step 1 — Basic information
Child name; date of birth; age calculated automatically; gender (optional); kindergarten/class; main language; additional language(s); child photo (optional); parent/guardian name (optional); parent contact (optional).
Support Arabic, Hebrew, English. Arabic and Hebrew true RTL; English LTR.

## 6. Step 2 — Who is this child? (strengths and personality first)
- Describe the child in 3–5 words (free text / tags).
- Main strengths, select ~3–5: Imagination, Curiosity, Communication, Vocabulary, Memory, Creativity, Building, Drawing, Music, Movement, Problem solving, Independence, Empathy, Humor, Persistence, Leadership, Observation, Social connection. Allow custom entries.
- What the child especially enjoys (multi + free text): Pretend play, Cars/transportation, Construction, Blocks, Drawing, Crafts, Music, Dancing, Stories, Books, Outdoor play, Animals, Nature, Sports, Puzzles, Technology, Water, Cooking, Social games.
- What especially motivates or attracts this child?

## 7. Step 3 — Emotions, regulation, transitions (short, practical)
- When sad, what usually helps?
- When frustrated/angry, what usually happens? cries, shouts, moves away, asks for adult help, asks for a hug, needs quiet time, struggles to calm down, throws/pushes, becomes silent, other.
- What helps calm down? adult reassurance, hug, quiet space, movement, explanation, visual support, preparation in advance, familiar routine, music, favorite object, humor, time alone, other.
- Reaction to transitions: transitions easily, needs preparation, needs a reminder, needs adult support, resists, becomes upset, depends on situation.
- What helps transitions go better?

## 8. Step 4 — Social and communication snapshot (not clinical)
- Social: initiates play, joins existing play, waits for others to approach, prefers familiar children, often plays independently, enjoys group activities, needs adult support to join, struggles with turn-taking, handles conflict well, needs help with conflict.
- Communication: expresses needs verbally, uses full sentences, asks questions, tells about experiences, describes events, listens to others, takes turns in conversation, uses gestures, sometimes communicates through behavior, needs adult support.
- Teacher/parent comments.

## 9. Step 5 — Independence and daily functioning
Areas: Eating, Drinking, Toilet, Washing hands, Dressing, Shoes, Tidying toys, Keeping belongings, Starting an activity, Finishing an activity.
Each: Independent / Needs some support / Needs significant support / Not applicable-not observed. No numeric developmental scores.

## 10. Step 6 — Sensory / environmental considerations (not a clinical sensory profile)
Things that may affect the child: noise, touch, clothing, textures, dirt, strong smells, bright lights, crowded spaces, movement, certain foods, messy play. For each selected: What happens? What helps? Optional only.

## 11. Step 7 — Current development priorities
Parent: what would you most like your child to develop this year? Emotional, Social, Language, Communication, Independence, Attention, Motor, Learning, Transitions, Confidence, Other.
Teacher selects max 3 Current Focus Areas, e.g. Joining group play, Expressing frustration using words, Managing transitions, Taking turns, Listening during story time, Asking for help, Dressing independently, Trying new activities, Completing tasks, Participating in group activities.
Never "weaknesses" — use Growth Area / Current Focus / Area for Support.

## 12. Create the initial baseline
Store: parent perspective, teacher perspective, strengths, interests, motivators, what helps, current challenges/support needs, current focus areas, languages, date created, who entered each piece of information.
Also create Current Understanding (initially based on baseline, evolves separately). Never overwrite the original baseline.

## 13. Child profile screen (visually simple)
Name, age ("4 years 2 months"), languages; STRENGTHS (⭐); INTERESTS (icons); WHAT HELPS (✓); CURRENT FOCUS (numbered, max 3); RECENT DEVELOPMENT (latest quote); last observation date.
Buttons: Add Observation, Create Content, View Development, Edit Profile. No large analytics dashboard.

## 14. Core content-generation idea
Uses A) strengths and interests (motivational channel) and B) current growth area (developmental goal). Don't only "fix weaknesses"; also strengthen strengths.
- MODE 1 Strength Builder: deepen an existing strength (creativity, imagination, language, problem solving, curiosity, memory, building, empathy, confidence). E.g. Building + Cars → design a bridge for cars and explain how it works.
- MODE 2 Growth Support: use strengths/interests to support a growth area. E.g. Animals + Imagination + "expressing frustration verbally" → story "The Lion Who Learned to Say: I Need Help"; video: short scene; game: practice phrases (Help me please / I don't like this / Can I try again? / I need a break).

## 15. Content types
A. Personalized Story: title, short story, age-appropriate language, child name when appropriate, favorite topics, current goal, positive ending, discussion questions. Teacher can edit.
B. Personalized Video: first a Video Content Plan — title, learning goal, short script, scene list, narration, visual prompts, approx. duration (30–90 s). Provider-agnostic `VideoGenerationService` with create_video_job / check_video_status / get_video_url. MVP: script + scene prompts + placeholder job; integrate provider later. No complex pipeline.
C. Digital game: simple React templates (multiple choice, match pairs, put in order, pick an emotion, what happens next, drag to category). AI provides data; React renders. No game engine.
D. Real-world / teacher-led activity (equally important): role play, building together, turn taking, treasure hunt, emotion cards, storytelling, movement, cooperative play, classroom mission, art. Return goal, materials, instructions, duration, what the teacher should observe, adaptation if the child struggles.

## 16. Create content screen
Goal: Strength Builder or Growth Support (then pick one active focus area). Type: Story, Video, Digital Game, Real-world Activity, Small Pack (one story + one game/activity + 2–3 questions). Never auto-generate expensive video unless explicitly requested.

## 17. AI input — only relevant info
Child age, main language, interests, strengths, current focus, what helps, relevant recent observations, content type. Avoid unnecessary private data.

## 18. AI output — structured JSON from the backend, validated before saving
Story: {title, goal, story, questions[], teacher_note}. Activity: {title, goal, duration_minutes, materials[], instructions[], what_to_observe[], adaptation}.

## 19. Teacher approval
All AI child-facing content starts as DRAFT. Teacher can Preview, Edit, Approve, Regenerate, Delete. Only approved is ready. Statuses: draft, approved, completed, archived.

## 20. After content is used — extremely easy feedback
How did it go? Worked well / Partly / Did not work. Optional: what did you observe; did the child need support (No / Some / Significant); what helped. Feedback automatically becomes part of the observation history.

## 21. Quick observation (< 30 seconds)
Date/time (default now), area/focus, context, what happened, support needed, what helped, optional note. Functional level: Independent / With support / Difficult. No field required except what's essential.

## 22. Development timeline
Simple chronological timeline mixing baseline, observations, activities + results. Make development visible.

## 23. Current understanding
AI periodically helps summarize observations into a suggested current understanding using careful, observational language ("appears to enjoy social play but may need support initiating"), never labels.

## 24. Baseline validation
For each important initial assumption: Supported by observations / Partially supported / Needs more observation / May need refinement. Never claim certainty from one or two observations. Keep both Initial Baseline and Current Understanding visible in history.

## 25. Development review
Screen of active focus areas; each: Improving / Some improvement / No clear change / Needs more observation / Focus no longer needed. Teacher can keep, close, edit, create focus. Max ~3 active.

## 26. No fake quantitative scoring
No "Social Skills: 73%". Descriptive change only ("More independent during transitions").

## 27. AI role
May: summarize observations, identify possible patterns, suggest questions/activities, personalize stories, create game content, video scripts, help refine goals, draft current-understanding summaries.
Must NOT: diagnose, make clinical conclusions, automatically change the official profile without teacher review, label a child, make high-confidence claims from limited data. Teacher remains in control.

## 28. Database design (simple; JSONB where it reduces complexity)
- users(id, name, email, password_hash, role[admin|teacher|parent], language, created_at)
- children(id, name, birth_date, gender, kindergarten, main_language, additional_languages JSONB, photo_path, created_at, updated_at)
- child_profiles(id, child_id, parent_perspective JSONB, teacher_perspective JSONB, strengths JSONB, interests JSONB, motivators JSONB, what_helps JSONB, sensitivities JSONB, current_understanding TEXT/JSONB, created_at, updated_at)
- baselines(id, child_id, baseline_data JSONB, created_by, created_at) — historical, never overwritten
- focus_areas(id, child_id, category, title, description, status[active|completed|paused], created_at, closed_at) — max 3 active
- observations(id, child_id, focus_area_id?, activity_id?, observed_at, context, observation, support_level, what_helped, created_by, created_at)
- generated_content(id, child_id, focus_area_id?, mode[strength_builder|growth_support], content_type[story|video|digital_game|real_world_activity], title, content JSONB, status, created_by, created_at, updated_at)
- content_feedback(id, content_id, child_id, result[worked_well|partly|did_not_work], support_level, observation, what_helped, created_by, created_at)
- development_reviews(id, child_id, review_date, summary, focus_review JSONB, created_by, created_at)
Do not create 50 tables.

## 29. REST API
Children: GET/POST /api/children; GET/PUT /api/children/{id}
Baseline: POST/GET /api/children/{id}/baseline; GET /api/children/{id}/current-understanding
Focus: GET/POST /api/children/{id}/focus-areas; PUT /api/focus-areas/{id}; POST /api/focus-areas/{id}/close
Observations: GET/POST /api/children/{id}/observations; PUT /api/observations/{id}
Content: POST /api/children/{id}/content/generate; GET /api/children/{id}/content; GET/PUT /api/content/{id}; POST /api/content/{id}/approve
Feedback: POST /api/content/{id}/feedback
Development: GET /api/children/{id}/timeline; POST/GET /api/children/{id}/development-review(s)
No GraphQL, no over-abstraction.

## 30. Digital games
Never generate/execute AI code. Predefined React templates: multiple_choice, match_pairs, sequence, emotion_choice, categorize, what_happens_next. AI only generates structured data, e.g. {template, title, question, choices[], correct_or_preferred_answer, explanation}.

## 31. Video
Phase 1: script, scene descriptions, narration, status. Phase 2: external provider. One abstraction `services/video_service.py`. Statuses: script_ready, generating, ready, failed. Store provider, external_job_id, video_url. Never block the rest of the system.

## 32. Child image
Photo optional; no generated likeness required. Works with name, interests, generic characters, animals, illustrated avatars. Extensible later.

## 33. Weekly pack
One child + one focus: 1 story, 1 teacher-led activity, 1 simple digital game, 3 discussion prompts, optional video. Lightweight.

## 34. Auth and roles
Admin: manage teachers, classes/kindergartens, users; see all permitted children.
Teacher: assigned children; teacher baseline; teacher perspective; focus areas; observations; generate/approve content; feedback; development review.
Parent: parent onboarding; edit allowed parent info; view content explicitly shared with parent.
No complex permissions engine.

## 35. Privacy
Auth required; users see only allowed children; uploads behind access control; hashed passwords; no secrets in frontend; AI calls only via Python backend; minimal child data to AI; log important profile changes. No massive compliance platform.

## 36–38. UI/UX, mobile, RTL
Warm, modern, calm, child-centered, professional, simple; not childish, not clinical. Cards, clear icons, large touch targets, obvious actions. Responsive desktop/tablet/phone; Add Observation especially on mobile. True RTL for he/ar (direction, alignment, forms, tables, cards, nav, icons, date/number handling) — not just right-aligned text.

## 39. First step
Inspect the whole existing codebase; return a concise report: KEEP / SIMPLIFY / REMOVE / ADD / DATABASE CHANGES / API CHANGES / UI CHANGES. Only after this review, begin implementation.

## 40–41. Don't break working features without reason; remove unnecessary complexity
Keep working auth, adapt working models, reuse usable components and design system. Remove/bypass: Docker, docker-compose, Redis, Celery, brokers, event buses, microservices, complex scoring engines, clinical diagnosis screens, massive analytics dashboards, unnecessary AI agents, workflow engines, multiple redundant profile systems.

## 42. Priority
Phase 1: assessment; DB cleanup/migrations; child list; Add Child wizard; baseline profile; child profile screen.
Phase 2: focus areas; quick observations; development timeline.
Phase 3: AI story; real-world activity; digital game templates; teacher approval; feedback.
Phase 4: current-understanding summaries; development review; weekly pack.
Phase 5: video script; video provider abstraction; actual video integration if credentials exist.
Don't start with video. The understanding + observation loop must work first.

## 43. Success criteria
Teacher can: log in; add a child; complete a short baseline wizard; identify strengths/interests; choose up to 3 growth areas; open a profile and immediately understand the child; generate a personalized story/game/activity; use a strength or interest to support a growth area; review and approve content; record what happened; add normal observations; see a simple development timeline; see that current understanding can change from the baseline.

## 44. Key example — Adam, 4
Strengths imagination, building, vocabulary; interests cars, animals, blocks; focus joining group play. Growth Support → Game → "Build the Garage Together": Adam + another child build a garage for toy cars; each picks one piece at a time; Adam practices "Can we build this together?"; children choose where each car parks. Observe: did Adam initiate? accept the other child's idea? need adult support? Feedback: Partly — "joined after prompting and stayed 8 minutes". Later: "asked another child to build with him without prompting". Suggestion: "Adam appears to be becoming more independent in initiating shared play." Teacher approves or edits.

## 45. Second example — Maya, Strength Builder
Strong storytelling, loves animals → story-creation game choosing animal, setting, problem, solution; Maya tells/records the story. Goal: strengthen expressive language, creativity, sequencing, confidence.

## 46. Design rule
Never "find what is wrong with the child". Who is this child? What are they good at? What do they love? Where do they need support now? How can we use what they love and are good at to help them grow? What happened when we tried? What have we learned since?

## 47. Deployment
/var/www/kidsphere/{frontend,backend,uploads}; backend venv at /var/www/kidsphere/backend/venv/; requirements.txt; .env.example; kidsphere-api.service; Nginx config; PostgreSQL setup/migration commands; React build instructions. No Docker.

## 48. Code quality
Readable, modular, documented where necessary. Simple functions, clear services, clear REST routes, small React components. No deep inheritance, complex factories, generic repository layers, event-driven architecture, unnecessary patterns.

## 49. Final rule
When unsure, choose the simpler implementation that supports the loop: Know → Focus → Create → Experience → Observe → Learn → Adapt.

## Source documents supplied with this spec
- `parents-intake-questionnaire.md` — "שאלון היכרות – להכיר את הילד שלי" (parents' intake questionnaire, Hebrew).
- `observation-model.md` — "מודל תצפית, הערכה ותוכנית התערבות לילד בגיל הרך 3–5" (teacher's observation, assessment and intervention model, Hebrew).
