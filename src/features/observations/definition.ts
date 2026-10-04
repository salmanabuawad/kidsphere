/**
 * Teacher observation model: domains, items for the full professional form,
 * and the option sets used by Quick Observation. Observation is naturalistic
 * (play, routines) — ratings describe support level, never a score.
 */
import type { DevelopmentDomain, ObservationContext, ObservationRating, SupportOutcome } from "@prisma/client";
import type { L } from "@/lib/i18n/config";

type Item = { key: string; label: L };
const i = (key: string, en: string, ar: string, he: string): Item => ({ key, label: { en, ar, he } });

export const DOMAINS: { key: DevelopmentDomain; label: L; emoji: string }[] = [
  { key: "EMOTIONAL", label: { en: "Emotional", ar: "عاطفي", he: "רגשי" }, emoji: "💛" },
  { key: "SOCIAL", label: { en: "Social", ar: "اجتماعي", he: "חברתי" }, emoji: "🤝" },
  { key: "LANGUAGE", label: { en: "Language & communication", ar: "اللغة والتواصل", he: "שפה ותקשורת" }, emoji: "💬" },
  { key: "ATTENTION_EF", label: { en: "Attention & executive function", ar: "الانتباه والوظائف التنفيذية", he: "קשב ותפקודים ניהוליים" }, emoji: "🎯" },
  { key: "PLAY", label: { en: "Play", ar: "اللعب", he: "משחק" }, emoji: "🧸" },
  { key: "GROSS_MOTOR", label: { en: "Gross motor", ar: "الحركة الكبرى", he: "מוטוריקה גסה" }, emoji: "🤸" },
  { key: "FINE_MOTOR", label: { en: "Fine motor", ar: "الحركة الدقيقة", he: "מוטוריקה עדינה" }, emoji: "✏️" },
  { key: "INDEPENDENCE", label: { en: "Independence", ar: "الاستقلالية", he: "עצמאות" }, emoji: "🧭" },
  { key: "SENSORY", label: { en: "Sensory regulation", ar: "التنظيم الحسي", he: "ויסות חושי" }, emoji: "🌊" },
  { key: "COGNITIVE", label: { en: "Cognitive / learning", ar: "المعرفي / التعلم", he: "קוגניטיבי / למידה" }, emoji: "🧩" },
  { key: "PARTICIPATION", label: { en: "Participation in the day", ar: "المشاركة خلال اليوم", he: "השתתפות לאורך היום" }, emoji: "🌞" },
];

export const DOMAIN_ITEMS: Record<Exclude<DevelopmentDomain, "PARTICIPATION">, Item[]> = {
  EMOTIONAL: [
    i("recognizes_emotions", "Recognizes basic emotions", "يتعرّف على المشاعر الأساسية", "מזהה רגשות בסיסיים"),
    i("expresses_emotion", "Expresses emotion appropriately", "يعبّر عن مشاعره بشكل مناسب", "מבטא/ת רגש באופן מותאם"),
    i("calms_after_frustration", "Calms after frustration", "يهدأ بعد الإحباط", "נרגע/ת אחרי תסכול"),
    i("separation", "Separates from parent", "ينفصل عن الأهل", "נפרד/ת מההורה"),
    i("accepts_routine_change", "Accepts routine changes", "يتقبّل تغيير الروتين", "מקבל/ת שינויים בשגרה"),
    i("asks_for_help", "Asks for help", "يطلب المساعدة", "מבקש/ת עזרה"),
    i("confident", "Confident in the environment", "واثق في البيئة", "בטוח/ה בסביבה"),
  ],
  SOCIAL: [
    i("initiates_contact", "Initiates contact", "يبادر بالتواصل", "יוזם/ת קשר"),
    i("joins_play", "Joins play", "ينضم إلى اللعب", "מצטרף/ת למשחק"),
    i("shares", "Shares", "يشارك", "משתף/ת"),
    i("turn_taking", "Takes turns", "ينتظر دوره", "ממתין/ה לתור"),
    i("accepts_boundaries", "Accepts boundaries", "يتقبّل الحدود", "מקבל/ת גבולות"),
    i("conflict_with_support", "Handles conflict with support", "يتعامل مع الخلاف بمساعدة", "מתמודד/ת עם קונפליקט בעזרה"),
    i("empathy", "Shows empathy", "يُظهر التعاطف", "מגלה אמפתיה"),
    i("group_participation", "Participates in group", "يشارك في المجموعة", "משתתף/ת בקבוצה"),
    i("varied_peers", "Interacts with different children", "يتفاعل مع أطفال مختلفين", "מתקשר/ת עם ילדים שונים"),
  ],
  LANGUAGE: [
    i("simple_instructions", "Follows simple instructions", "يتبع تعليمات بسيطة", "מבין/ה הוראות פשוטות"),
    i("multi_step_instructions", "Follows multi-step instructions", "يتبع تعليمات متعددة الخطوات", "מבין/ה הוראות מרובות שלבים"),
    i("understands_questions", "Understands questions", "يفهم الأسئلة", "מבין/ה שאלות"),
    i("basic_concepts", "Understands basic concepts", "يفهم المفاهيم الأساسية", "מבין/ה מושגים בסיסיים"),
    i("vocabulary", "Age-appropriate vocabulary", "مفردات مناسبة للعمر", "אוצר מילים מותאם גיל"),
    i("sentences", "Uses sentences", "يستخدم جملاً", "משתמש/ת במשפטים"),
    i("recounts", "Recounts an experience", "يروي تجربة", "מספר/ת על חוויה"),
    i("describes_image", "Describes an event or picture", "يصف حدثاً أو صورة", "מתאר/ת אירוע או תמונה"),
    i("asks_questions", "Asks questions", "يطرح أسئلة", "שואל/ת שאלות"),
    i("verbalizes_needs", "Says what they want or need", "يعبّر بالكلام عن رغباته واحتياجاته", "מבטא/ת רצונות וצרכים"),
    i("listens", "Listens", "يُصغي", "מקשיב/ה"),
    i("short_conversation", "Holds a short conversation", "يجري محادثة قصيرة", "מנהל/ת שיחה קצרה"),
    i("conversation_turns", "Takes conversational turns", "يتبادل الأدوار في الحديث", "מתחלף/ת בתורות בשיחה"),
    i("adapts_speech", "Adapts speech to the situation", "يكيّف كلامه حسب الموقف", "מתאים/ה דיבור למצב"),
  ],
  ATTENTION_EF: [
    i("listens_story", "Listens to a story", "يستمع إلى قصة", "מקשיב/ה לסיפור"),
    i("group_participation", "Participates in group time", "يشارك في وقت المجموعة", "משתתף/ת במפגש"),
    i("completes_activity", "Completes an activity", "يُكمل النشاط", "משלים/ה פעילות"),
    i("persists", "Persists", "يثابر", "מתמיד/ה"),
    i("understands_task", "Understands the task", "يفهم المهمة", "מבין/ה את המשימה"),
    i("starts", "Starts a task", "يبدأ المهمة", "מתחיל/ה משימה"),
    i("finishes", "Finishes a task", "يُنهي المهمة", "מסיים/ת משימה"),
    i("organizes_equipment", "Organizes equipment", "ينظّم أدواته", "מארגן/ת ציוד"),
    i("switches_activity", "Switches activity", "ينتقل بين الأنشطة", "עובר/ת בין פעילויות"),
    i("accepts_change", "Accepts change", "يتقبّل التغيير", "מקבל/ת שינוי"),
    i("tries_alternative", "Tries an alternative", "يجرّب بديلاً", "מנסה חלופה"),
    i("handles_mistakes", "Handles mistakes", "يتعامل مع الأخطاء", "מתמודד/ת עם טעויות"),
  ],
  PLAY: [
    i("chooses_activity", "Independently chooses an activity", "يختار نشاطاً باستقلالية", "בוחר/ת פעילות באופן עצמאי"),
    i("plays_independently", "Plays independently", "يلعب باستقلالية", "משחק/ת באופן עצמאי"),
    i("persists_play", "Persists in play", "يثابر في اللعب", "מתמיד/ה במשחק"),
    i("pretend_play", "Pretend play", "اللعب التخيلي", "משחק דמיון"),
    i("role_play", "Role play", "لعب الأدوار", "משחק תפקידים"),
    i("imitates_daily", "Imitates daily situations", "يقلّد مواقف يومية", "מחקה מצבים יומיומיים"),
    i("parallel_play", "Parallel play", "اللعب المتوازي", "משחק מקביל"),
    i("cooperative_play", "Cooperative / shared play", "اللعب التعاوني", "משחק שיתופי"),
    i("accepts_ideas", "Accepts others' ideas", "يتقبّل أفكار الآخرين", "מקבל/ת רעיונות של אחרים"),
  ],
  GROSS_MOTOR: [
    i("walking_running", "Walking / running", "المشي / الجري", "הליכה / ריצה"),
    i("jumping", "Jumping", "القفز", "קפיצה"),
    i("one_leg_balance", "One-leg balance (where age appropriate)", "التوازن على قدم واحدة (حسب العمر)", "שיווי משקל על רגל אחת (בהתאם לגיל)"),
    i("stairs", "Stairs", "الدرج", "מדרגות"),
    i("balance", "Balance", "التوازن", "שיווי משקל"),
    i("climbing", "Climbing", "التسلق", "טיפוס"),
    i("throw_catch", "Throwing / catching", "الرمي / الالتقاط", "זריקה / תפיסה"),
    i("movement_games", "Movement games", "ألعاب الحركة", "משחקי תנועה"),
  ],
  FINE_MOTOR: [
    i("grip", "Writing utensil grip", "إمساك أداة الكتابة", "אחיזת כלי כתיבה"),
    i("free_drawing", "Free drawing", "الرسم الحر", "ציור חופשי"),
    i("shape_copying", "Age-appropriate shape copying", "نسخ الأشكال المناسبة للعمر", "העתקת צורות מותאמת גיל"),
    i("coloring", "Coloring", "التلوين", "צביעה"),
    i("cutting", "Cutting", "القص", "גזירה"),
    i("gluing", "Gluing", "اللصق", "הדבקה"),
    i("threading", "Threading", "إدخال الخيط", "השחלה"),
    i("blocks", "Block construction", "البناء بالمكعبات", "בנייה בקוביות"),
    i("puzzles", "Puzzles", "الأحاجي", "פאזלים"),
    i("bilateral", "Using both hands together", "استخدام اليدين معاً", "שימוש בשתי ידיים יחד"),
  ],
  INDEPENDENCE: [
    i("eating", "Eating", "الأكل", "אכילה"),
    i("drinking", "Drinking", "الشرب", "שתייה"),
    i("toilet", "Toilet", "المرحاض", "שירותים"),
    i("washing_hands", "Washing hands", "غسل اليدين", "רחיצת ידיים"),
    i("dressing", "Dressing / undressing", "ارتداء / خلع الملابس", "התלבשות / התפשטות"),
    i("shoes", "Shoes", "الحذاء", "נעליים"),
    i("organizing_belongings", "Organizing belongings", "تنظيم أغراضه", "ארגון חפצים"),
    i("caring_belongings", "Caring for belongings", "العناية بأغراضه", "שמירה על חפצים"),
  ],
  SENSORY: [
    i("noise", "Noise", "الضجيج", "רעש"),
    i("touch", "Touch", "اللمس", "מגע"),
    i("textures", "Textures", "الملمس", "מרקמים"),
    i("dirt", "Dirt", "الاتساخ", "לכלוך"),
    i("light", "Light", "الضوء", "אור"),
    i("smell", "Smell", "الروائح", "ריח"),
    i("movement", "Movement", "الحركة", "תנועה"),
    i("crowding", "Crowding", "الازدحام", "צפיפות"),
    i("art_materials", "Creative / art materials", "المواد الفنية", "חומרי יצירה"),
  ],
  COGNITIVE: [
    i("matching", "Matching", "المطابقة", "התאמה"),
    i("sorting", "Sorting", "التصنيف", "מיון"),
    i("colors", "Colors", "الألوان", "צבעים"),
    i("shapes", "Shapes", "الأشكال", "צורות"),
    i("size", "Size", "الحجم", "גודל"),
    i("quantity", "Quantity", "الكمية", "כמות"),
    i("sequence", "Sequence", "التسلسل", "רצף"),
    i("memory", "Memory", "الذاكرة", "זיכרון"),
    i("picture_object", "Picture–object matching", "مطابقة الصورة بالشيء", "התאמת תמונה לחפץ"),
    i("cause_effect", "Cause and effect", "السبب والنتيجة", "סיבה ותוצאה"),
    i("problem_solving", "Simple problem solving", "حل المشكلات البسيطة", "פתרון בעיות פשוט"),
    i("curiosity", "Curiosity", "حب الاستطلاع", "סקרנות"),
  ],
};

export const RATINGS: { key: ObservationRating; label: L }[] = [
  { key: "NOT_OBSERVED", label: { en: "Not observed yet", ar: "لم يُلاحظ بعد", he: "טרם נצפה" } },
  { key: "BEGINNING", label: { en: "Beginning", ar: "في البداية", he: "בתחילת הדרך" } },
  { key: "WITH_SUPPORT", label: { en: "With support", ar: "بمساعدة", he: "עם תמיכה" } },
  { key: "CONSISTENT", label: { en: "Consistently", ar: "بثبات", he: "באופן עקבי" } },
];

export const CONTEXTS: { key: ObservationContext; label: L; emoji: string }[] = [
  { key: "arrival", label: { en: "Arrival", ar: "الوصول", he: "הגעה" }, emoji: "🚪" },
  { key: "free_play", label: { en: "Free play", ar: "اللعب الحر", he: "משחק חופשי" }, emoji: "🧸" },
  { key: "group_time", label: { en: "Group time", ar: "وقت المجموعة", he: "מפגש" }, emoji: "⭕" },
  { key: "structured_activity", label: { en: "Structured activity", ar: "نشاط موجّه", he: "פעילות מובנית" }, emoji: "📋" },
  { key: "yard", label: { en: "Yard", ar: "الساحة", he: "חצר" }, emoji: "🌳" },
  { key: "meal", label: { en: "Meal", ar: "الوجبة", he: "ארוחה" }, emoji: "🍎" },
  { key: "art", label: { en: "Art", ar: "الفن", he: "יצירה" }, emoji: "🎨" },
  { key: "transition", label: { en: "Transition", ar: "انتقال", he: "מעבר" }, emoji: "↪️" },
  { key: "end_of_day", label: { en: "End of day", ar: "نهاية اليوم", he: "סוף היום" }, emoji: "🌇" },
  { key: "other", label: { en: "Other", ar: "أخرى", he: "אחר" }, emoji: "•" },
];

/** Participation contexts for the full form (subset of CONTEXTS). */
export const PARTICIPATION_CONTEXTS = CONTEXTS.filter((c) => c.key !== "other");

export const PARTICIPATION_FIELDS: { key: "succeeds" | "difficult" | "support_required" | "what_helps"; label: L }[] = [
  { key: "succeeds", label: { en: "What succeeds?", ar: "ما الذي ينجح؟", he: "מה מצליח?" } },
  { key: "difficult", label: { en: "What is difficult?", ar: "ما الصعب؟", he: "מה קשה?" } },
  { key: "support_required", label: { en: "What support is required?", ar: "ما الدعم المطلوب؟", he: "איזו תמיכה נדרשת?" } },
  { key: "what_helps", label: { en: "What helps?", ar: "ما الذي يساعد؟", he: "מה עוזר?" } },
];

/** Supports offered as one-tap chips in Quick Observation (keys from vocabulary.SUPPORTS). */
export const QUICK_SUPPORTS = [
  "visual_cue",
  "visual_countdown",
  "countdown",
  "adult_mediation",
  "advance_warning",
  "movement_break",
  "reduced_stimulation",
  "positive_reinforcement",
  "first_then",
  "choice",
  "repetition",
  "peer_modeling",
  "explain_next_step",
] as const;

export const SUPPORT_OUTCOMES: { key: SupportOutcome; label: L }[] = [
  { key: "helped", label: { en: "Helped", ar: "ساعد", he: "עזר" } },
  { key: "partly_helped", label: { en: "Partly helped", ar: "ساعد جزئياً", he: "עזר חלקית" } },
  { key: "did_not_help", label: { en: "Did not help", ar: "لم يساعد", he: "לא עזר" } },
  { key: "not_assessed", label: { en: "Not assessed", ar: "لم يُقيَّم", he: "לא הוערך" } },
];

export function domainLabel(key: DevelopmentDomain, locale: keyof L): string {
  return DOMAINS.find((d) => d.key === key)?.label[locale] ?? key;
}

export function contextLabel(key: ObservationContext, locale: keyof L): string {
  return CONTEXTS.find((c) => c.key === key)?.label[locale] ?? key;
}
