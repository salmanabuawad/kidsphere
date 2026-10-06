# KidSphere terminology

The single shared vocabulary is `backend/app/data/options.json` plus the list fragments `backend/app/data/lists/*.json`, which `app/vocab.py` merges into the same lists (options.json first, then the fragments by file name). Backend validation, UI labels (`GET /api/options`) and AI prompts all read the merged lists. Stored values are always the snake_case `key`, never a label. Custom entries are stored as `{"custom": "text"}`.

Item shape: `{"key", "icon"?, "category"?, "label": {en, ar, he}, "short"?: {en, ar, he}}`. Hebrew labels use slash-gendered forms (`עצמאי/ת`). Arabic labels use the generic masculine, as the legacy labels did.

**Fragments.** A fragment holds only `{"lists": {...}}`. A list name is defined in exactly one file: a fragment never redefines or extends a list from options.json or from another fragment (loading fails). Each work package owns its own fragment, so nobody edits options.json in parallel:

| Fragment | Lists |
|---|---|
| `lists/common.json` | `section_statuses`, `provenance`, `ai_domains`, `observation_domains`, `yes_no`, `yes_no_sometimes` |
| `lists/parent_questionnaire.json` | `pq_interests`, `pq_frustration_reactions`, `pq_morning_separation`, `pq_social_contact`, `pq_express_needs`, `pq_degree`, `pq_stop_activity`, `health_food_flags` |
| `lists/observation_model.json` | `observation_principles`, `observation_frequency`, `sensory_effects`, `need_areas` |
| `lists/plan.json` | `improvement_levels`, `involvement_steps` |

`tests/test_options_data.py` checks options.json and every fragment with the same rules (fields, en/ar/he labels, scripts, banned and numeric terms, categories). Extra data that is not a label (`maps_to`, storage paths, `source_he`, sensitivity, `ai_policy`) belongs in the source registries `backend/app/data/source/*.json` (served by `GET /api/source-model`), never in a list item.

## 1. Preferred terms (spec §2)

| Use | Hebrew | Arabic |
|---|---|---|
| Initial Profile | פרופיל ראשוני | الملف الأولي |
| Baseline | תמונת פתיחה | نقطة البداية |
| Current Understanding | ההבנה הנוכחית | الفهم الحالي |
| Strengths | חוזקות | نقاط القوة |
| Interests | תחומי עניין | الاهتمامات |
| Growth Areas / Areas for Support | תחומים לצמיחה / תחומים לתמיכה | مجالات النمو / مجالات الدعم |
| Current Focus | מיקוד נוכחי | التركيز الحالي |
| Observations | תצפיות | الملاحظات |
| Development | התפתחות | التطور |
| Development review | סקירת התפתחות | مراجعة التطور |

The professional framework is kept everywhere: **Strength → Need → Adaptation → Intervention → Follow-up** (חוזקה → צורך → התאמה → התערבות → מעקב). In teacher-facing UI, "Intervention" is shown as "What we will do" (מה נעשה / ما سنفعله).

## 2. Forbidden terms and replacements

Never use these in labels, UI strings, AI prompts or AI output. The machine-readable list is `banned_terms` in options.json.

| Avoid | Use instead |
|---|---|
| diagnosis, disorder, ADHD, autism, pathology, syndrome, developmental delay, abnormal (and ar/he equivalents) | Describe what was observed. Do not label the child. |
| deficit, weakness, weaknesses | Growth Area, Area for Support, Current Focus |
| score, points, percent ("Social skills: 73%") | Descriptive change ("More independent during transitions") |
| קשב וריכוז / attention (as a category) | ריכוז והתמדה / Focus & persistence / التركيز والمثابرة |
| ויסות חושי, sensory profile, מוצף | דברים בסביבה שעשויים להשפיע על הילד/ה / Things in the environment that may affect the child / أشياء في البيئة قد تؤثر على الطفل |
| התנהגות (as a need category) | No category. The teacher names a concrete focus (e.g. expressing_frustration_in_words). |
| מוקדי צורך, צרכים מרכזיים, קושי מרכזי | מוקדי התמקדות, תחומים לתמיכה (Current Focus, Areas for Support) |
| מה גורם לקושי | מה נראה שמקשה (What seems to make it harder) |
| מדד הצלחה (success metric) | איך נדע שזה עוזר (How will we know it is helping?), descriptive, never a count |
| תוכנית התערבות, הערכה | מה ננסה, סקירת התפתחות (Development review) |
| הפניה, צוות רב-מקצועי | שיחה עם הצוות החינוכי (share_next_step: consult_education_team); the teacher-only follow-up option is "שיתוף גורם מקצועי לפי הצורך" (OQ-2, below) |
| מתפרץ | Not an option (imports as frustration_reactions: other) |
| מתקשה מאוד | זקוק/ה להרבה תמיכה (needs_a_lot_of_support / needs_adult_support) |
| מתקשה להירגע, struggles to calm down | לוקח לו/ה זמן להירגע, Takes time to calm down |
| struggles with turn-taking | Still learning to take turns (לומד/ת לחכות לתור) |
| רמת תפקוד | כמה תמיכה נדרשה (How much support was needed) |
| Age-norm wording (בהתאם לגיל, מותאם לגיל) | Not used |
| Child-facing: wrong answer, you lost, failure | Try again / Let's see another way. Game choices in story_builder have no correct answer. |

### Source-document wording (OQ-3, OQ-2, OQ-6 decisions)

The two source documents (`docs/mvp-refocus/parents-intake-questionnaire.md`, `observation-model.md`) use some wording that section 2 bans. The verbatim source text is kept only in the registries (`source_he`, `backend/app/data/source/*.json`) for traceability and is **never rendered**. UI, PDF and AI use the KidSphere wording below.

| Source wording | Where | en | he | ar |
|---|---|---|---|---|
| תוכנית התערבות (אישית קצרה) | Plan tab, R5 report title | Intervention Plan (report title only; the tab is "Plan") | תוכנית עבודה אישית | خطة العمل الفردية |
| מדד הצלחה | plan column | How we will know it helps | איך נדע שזה עוזר | كيف سنعرف أن ذلك يساعد |
| קשב, ריכוז ותפקודים ניהוליים (D4) | domain `executive_function` | Focus, persistence & organizing | ריכוז, התמדה וארגון | التركيز والمثابرة والتنظيم |
| ויסות חושי (D9) | domain `sensory` | Things in the environment that may affect the child | דברים בסביבה שעשויים להשפיע על הילד/ה | أشياء في البيئة قد تؤثر على الطفل |
| מה הילד עושה כאשר הוא מוצף | D9 field | When things feel like too much | כשזה מרגיש יותר מדי | عندما يصبح الأمر أكثر من اللازم |
| תחום קוגניטיבי ולמידה (D10) | domain `cognitive` | Learning & thinking | למידה וחשיבה | التعلّم والتفكير |
| מוטוריקה עדינה וגרפו-מוטוריקה (D7) | domain `fine_motor` | Fine motor & drawing skills | מוטוריקה עדינה וציור | المهارات الحركية الدقيقة والرسم |
| השתלבות בסדר היום (D11) | domain `daily_routine` | Participation through the day | השתלבות בסדר היום | المشاركة خلال اليوم |
| איתור מוקדי צורך (D13) | domain `priority_needs` | Where to focus next (PDF: Areas to focus on) | במה נתמקד בהמשך | أين نركّز لاحقاً |
| קושי מרכזי (D7) | field | Area for support | תחום לתמיכה | مجال للدعم |
| צרכים מרכזיים (D17) | functional summary | Areas for support | תחומים לתמיכה | مجالات الدعم |
| מה גורם לקושי? (D13) | need card | What seems to make it harder? | מה נראה שמקשה? | ما الذي يبدو أنه يصعّب الأمر؟ |
| רמת תפקוד (indicator tables) | column header | How much support was needed? | כמה תמיכה נדרשה? | كم من الدعم كان مطلوباً؟ |
| התנהגות (D13 need area, OQ-6) | `need_areas.behaviour` (key kept) | Coping in everyday situations | התמודדות במצבים יומיומיים | التعامل مع المواقف اليومية |
| הפניה בהתאם לצורך (D16, OQ-2) | `involvement_steps.referral_as_needed`, teacher-only | Involve a specialist if needed | שיתוף גורם מקצועי לפי הצורך | إشراك مختص عند الحاجة |
| משתמש באוצר מילים מותאם לגיל / קפיצה על רגל אחת בהתאם לגיל / העתקת צורות בהתאם לגיל | indicator labels (age-norm wording) | Uses a range of words / Hops on one foot / Copies shapes | no "בהתאם לגיל" | no age wording |
| כלי אבחוני / תחליף לאבחון (OM purpose) and the PDF disclaimer | footer, notes | see "PDF disclaimer" below | | |

Rules that come with these decisions:

- **Teacher free text** in the teacher observation (assessment domains) and in the review follow-up (`follow_up.involvement.note`) gets the wording check as a **warning** only; it is never blocked. Development-review text keeps today's 422 `UNSAFE_CONTENT`.
- **`referral_as_needed`** is chosen by the teacher only. The AI never produces or suggests it; the `ai_only` group below blocks referral wording in every AI output field.
- **`need_areas.behaviour`** cannot become a focus category on its own: promoting it to a Current Focus requires a concrete focus title.
- **Curiosity (D10-11)** is note-first; its level is optional.

**PDF disclaimer** (every report footer; exact text, the PDF messages use it verbatim):

| | |
|---|---|
| en | This report is based on parent information, teacher observations and educational follow-up. It is not a medical or clinical diagnosis. |
| he | דוח זה מבוסס על מידע מההורים, על תצפיות של הגננת ועל מעקב חינוכי. הוא אינו מהווה אבחנה רפואית או קלינית. |
| ar | يستند هذا التقرير إلى معلومات من الأهل وملاحظات المعلّمة والمتابعة التربوية. وهو ليس تشخيصاً طبياً أو سريرياً. |

The clause that names the banned word is in `allow_phrases`, exactly as written here: "it is not a medical or clinical diagnosis", "אינו מהווה אבחנה רפואית או קלינית", "ليس تشخيصاً طبياً أو سريرياً" (Arabic tanween written as alef + fathatan, `اً`). Any other wording with these words still fails the checks.

**Provenance labels** (list `provenance`, derived by `backend/app/provenance.py`; shown as visible text chips, never tooltip-only):

| key | en | he | ar | PDF source label |
|---|---|---|---|---|
| parent_said | Parent said | ההורים סיפרו | قال الأهل | Parent Input |
| teacher_observed | Teacher observed | תצפית הגננת | ملاحظة المعلّمة | Teacher Observation |
| ai_suggested | AI suggested | הצעת בינה מלאכותית | اقتراح الذكاء الاصطناعي | AI-Assisted Draft (printed only once approved) |
| teacher_approved | Teacher approved | אושר על ידי הגננת | اعتمدته المعلّمة | Teacher-Approved Understanding |

When staff typed the parent's answers, the chip reads "Parent said · entered by {name}" (on behalf of the family, or at a meeting).

**Section statuses** (list `section_statuses`; a pill, never a percentage): Not started · In progress · Sufficient observation (short: Enough for now) · Review later. No data means `not_started`.

### How `banned_terms` is matched

- `clinical`: spec §2 terms and close equivalents in en/ar/he.
- `child_deficit`: words that must never appear in child-facing text, and are also kept out of option labels.
- `ai_only`: referral and professional-evaluation wording (en "referral", "refer the child", "specialist evaluation", …; he הפניה, הפנייה, להפנות, …; ar إحالة, تحويل إلى أخصائي, …). It is checked on **every AI output field** (and kept out of option labels) but never on teacher input, because the teacher may choose `referral_as_needed`. Terms are phrases, not the bare word "refer", because the substring match would also hit "prefer" and "preferences".
- `allow_phrases`: phrases that contain a banned substring but are fine (for example "problem solving", "نقاط القوة", "פתרון בעיות", and the disclaimer clauses above).

Matching: lowercase the text, remove every allow phrase, then do a substring search for every term in all three languages. Hebrew and Arabic attach prefixes (ה, ו, ב, ال, و), so the search uses substrings, not word boundaries. Also apply `/\d+\s*%|\bscore\b|\bpoints\b/i`. The lists are deliberately short and precise. "קשב" on its own (attention, listening) is allowed; only clinical compounds such as "הפרעת קשב" and "קשב וריכוז" are banned. Words common in children's stories ("naughty", "שובב", "lazy") are not banned.

## 3. One support scale

One enum is used in Step 5 (independence), quick observations, content feedback and baselines: `support_levels`.

| key | Wizard label (`label`) | Quick observation (`short`) | Feedback "Did the child need support?" | Observation model | Intake (binary) |
|---|---|---|---|---|---|
| independent | Independent / עצמאי/ת / مستقل | Independent | No | עצמאי | עצמאי |
| some_support | Needs some support / זקוק/ה לקצת תמיכה | With support / בתיווך / بمساعدة | Some | בתיווך | זקוק לעזרה |
| significant_support | Needs significant support / זקוק/ה לתמיכה רבה | Difficult / מתקשה / يجد صعوبة | Significant | מתקשה | — |
| not_observed | Not observed / not applicable | Not observed | — | — | — |

"Difficult" mapped to significant_support is a small change of meaning, accepted in PLAN-ADJUSTMENTS §C. The observation model's "האם חל שיפור? משמעותי / חלקי / ללא שינוי" maps to review_statuses improving / some_improvement / no_clear_change.

## 4. Option lists

| List | Purpose | Used by |
|---|---|---|
| languages | Main and additional languages | Wizard step 1, profile header |
| genders | Optional gender (girl, boy, unspecified). Used only for grammatical gender in ar/he content. | Wizard step 1, AI context |
| relations | Parent/guardian relation | Admin parent linking, step 1 |
| contact_preferences | Preferred way for the teacher to update the parent (Q39; `other` + text; he "פגישה מסודרת" for meeting) | Wizard step 1 (parent), questionnaire partnership |
| describe_words | Suggestion chips for "describe the child in 3–5 words" | Wizard step 2 |
| strengths | 18 strengths (spec §6) | Wizard step 2, profile ⭐, AI context, strength_builder targets |
| interests | 19 interests (spec §6) with icons | Wizard step 2, profile icons, AI context |
| motivators | What attracts or motivates the child (no reward-point wording) | Wizard step 2, AI context |
| sad_helps | What helps when sad | Wizard step 3 |
| frustration_reactions | What usually happens when frustrated (spec §7) | Wizard step 3 |
| calming_helps | What helps the child calm down (spec §7) | Wizard step 3, profile "What helps", AI context |
| transition_reactions | Reaction to transitions (spec §7) | Wizard step 3 |
| transition_helps | What helps transitions go better | Wizard step 3, profile "What helps" |
| morning_separation | Morning goodbye (intake ד) | Wizard step 3 (parent, optional) |
| social | Social snapshot (spec §8) | Wizard step 4 |
| communication | Communication snapshot (spec §8) | Wizard step 4 |
| independence_areas | 11 daily-functioning rows (spec §9 + observation model D8 `organizing_belongings`; `dressing` = "Dressing / undressing") | Wizard step 5 grid, teacher observation D8 |
| support_levels | The one support scale (section 3 above) | Step 5, quick observation, feedback, baseline, timeline |
| sensitivities | Things in the environment that may affect the child (spec §10) | Wizard step 6 |
| sensitivity_helps | What helps for a selected sensitivity | Wizard step 6 |
| priority_categories | 11 development priority categories (spec §11); `attention` = "Focus & persistence" | Wizard step 7 (parent priorities), focus area category, template provider |
| focus_suggestions | Ready-made focus titles, each with a `category` from priority_categories | Wizard step 7 (teacher), focus screen |
| hope_child_feels | What the parent hopes the child feels in kindergarten (intake Q37; he "בטוח/ה" for safe) | Wizard step 7 (parent, optional) |
| observation_contexts | Daily-routine stages from the observation model §11, plus other | Quick observation, feedback mirror, timeline |
| what_helps | One-tap "what helped" chips | Quick observation, content feedback |
| content_results | Worked well / Partly / Did not work | Content feedback |
| review_statuses | Per-focus status in a development review (spec §25) | Development review |
| review_decisions | keep / pause / close / edit / create (PLAN B12) | Development review |
| share_next_step | Optional next step with family or education team | Development review |
| validation_statuses | Baseline validation states (spec §24) | Baseline validation, current understanding |
| modes | strength_builder, growth_support (spec §14) | Create content screen, AI prompts |
| strength_targets | Generic strength-builder targets (PLAN B8) | Create content (strength_builder), AI prompts |
| content_types | story, video, digital_game, real_world_activity, pack | Create content screen, content list |
| game_templates | 7 React game templates, including story_builder (PLAN B8) | Game renderer, AI schema |
| content_statuses | draft, approved, completed, archived | Content list badges |
| focus_statuses | active, paused, completed | Focus screen |
| video_statuses | script_ready, generating, ready, failed | Video badge |
| perspectives | parent, teacher | Wizard perspective toggle (PLAN B2), baseline |
| section_statuses | not_started, in_progress, sufficient, review_later (`lists/common.json`) | Questionnaire sections, quick baseline, teacher observation domains |
| provenance | parent_said, teacher_observed, ai_suggested, teacher_approved (`lists/common.json`) | Provenance chips everywhere; PDF source labels |
| ai_domains | The 12 AI domains: emotional, social, communication, language, executive_function, play, gross_motor, fine_motor, independence, sensory, cognitive, daily_routine (`lists/common.json`) | `observations.domains`, AI data minimisation, history filters |
| observation_domains | The 13 teacher-observation sections (D1–D13): the AI domains without `communication`, plus strengths and priority_needs (`lists/common.json`) | Teacher Observation tab, quick baseline "first area to observe", review follow-up areas |
| yes_no, yes_no_sometimes | Simple answers (`lists/common.json`) | Questionnaire (e.g. Q35 "does preparation help"), D6 avoidance |

## 5. Renamed keys (legacy app → options.json)

Apply this map in any data migration or import from the legacy app and the parents survey.

| List | Legacy key | New key |
|---|---|---|
| interests | vehicles | cars_transportation |
| interests | building | construction |
| interests | drawing_art | drawing (+ crafts) |
| interests | dancing_movement | dancing |
| interests | stories_books | stories (+ books) |
| interests | digital_games | technology |
| interests | space | custom entry |
| strengths | good_memory | memory |
| strengths | musicality | music |
| strengths | physical_skill | movement |
| strengths | verbal_expression | communication |
| strengths | kindness, helpfulness, deep_focus | custom entries |
| frustration_reactions | seeks_adult | asks_adult_help |
| frustration_reactions | asks_hug | asks_for_hug |
| frustration_reactions | hard_to_calm | takes_time_to_calm |
| frustration_reactions | outburst | other |
| calming_helps / what_helps | hug_comfort | hug |
| calming_helps / what_helps | movement_break | movement |
| calming_helps / what_helps | explain_next_step | explanation |
| calming_helps / what_helps | visual_cue, visual_schedule | visual_support |
| calming_helps / what_helps | advance_warning | advance_preparation |
| calming_helps / what_helps | music_song | music |
| calming_helps / what_helps | transition_object | favorite_object |
| what_helps / transition_helps | visual_countdown, countdown | countdown_timer |
| what_helps / transition_helps | choice | offering_choice |
| transition_reactions (was stopping_activity) | easy | transitions_easily |
| transition_reactions | cries_angry | becomes_upset |
| transition_reactions | very_difficult | needs_adult_support |
| morning_separation (was separation) | very_difficult | needs_a_lot_of_support |
| social | prefers_solo_play | often_plays_independently |
| social | plays_with_familiar | prefers_familiar_children |
| social | needs_mediation | needs_adult_support_to_join |
| communication | words | expresses_needs_verbally |
| communication | sentences | uses_full_sentences |
| communication | gestures | uses_gestures |
| communication | behavior | sometimes_communicates_through_behavior |
| communication | seeks_adult | needs_adult_support |
| communication | enjoys_recounting | tells_about_experiences |
| independence_areas | cleaning_toys | tidying_toys |
| independence_areas | belongings | keeping_belongings |
| support_levels | some_help | some_support |
| support_levels | adult_helps | significant_support |
| sensitivities | smells | strong_smells |
| sensitivities | light | bright_lights |
| sensitivities | crowding | crowded_spaces |
| contact_preferences | conversation | personal_conversation |
| priority_categories (was development_areas / DevelopmentDomain) | ATTENTION_EF | attention |
| priority_categories | GROSS_MOTOR, FINE_MOTOR | motor |
| priority_categories | COGNITIVE | learning |
| priority_categories | PARTICIPATION | transitions |
| priority_categories | SENSORY | emotional (details go to step 6) |
| content_results (was outcome) | HELPED / PARTLY_HELPED / DID_NOT_HELP | worked_well / partly / did_not_work |

Observation model §13 need categories map to priority_categories as: רגשי → emotional, חברתי → social, שפתי → language, תקשורתי → communication, קשב וריכוז → attention, מוטורי → motor, קוגניטיבי → learning, עצמאות → independence, הסתגלות למסגרת → transitions, ויסות חושי → emotional, התנהגות → no category.

## 6. Open items for the product owner (ar/he review)

- Arabic labels for new options have no source document. A native Arabic reviewer should check them before release, especially: support_levels short "يجد صعوبة", modes "تعزيز نقاط القوة" / "دعم النمو", strength_targets "التعبير اللغوي", sensitivities "اللعب بالمواد اللزجة".
- Hebrew: option labels use slash forms (עצמאי/ת), while legacy teacher UI strings used the feminine imperative. Decide on one convention for UI strings.
- Hebrew review_statuses.improving is "ניכר שיפור" (about the focus area, not the child) and some_improvement is "שיפור חלקי", following the observation model's משמעותי / חלקי wording.
- Confirm that "Difficult" (מתקשה) as the quick-observation label of significant_support is acceptable (PLAN-ADJUSTMENTS §C).
- "קשב וריכוז" is banned as a term, because it reads as the ADHD domain. Plain "קשב" (as in הקשבה) is allowed.
- The Arabic labels of `lists/common.json` (section statuses, provenance, domains) and the Arabic PDF disclaimer have no source document either; include them in the native review.
