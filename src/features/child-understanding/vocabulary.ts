/**
 * Canonical normalized values for the Child Understanding Profile.
 *
 * Every attribute value stored in ProfileAttribute.value is one of these keys,
 * which keeps the profile comparable across parent and teacher evidence and
 * keeps AI context free of raw free-text. Labels exist for every locale.
 */
import type { AttributeCategory } from "@prisma/client";
import type { L } from "@/lib/i18n/config";

export type VocabEntry = { key: string; label: L; emoji?: string };

const v = (key: string, en: string, ar: string, he: string, emoji?: string): VocabEntry => ({
  key,
  label: { en, ar, he },
  emoji,
});

export const INTERESTS: VocabEntry[] = [
  v("pretend_play", "Pretend play", "اللعب التخيلي", "משחק דמיון", "🎭"),
  v("vehicles", "Vehicles", "المركبات", "כלי רכב", "🚜"),
  v("building", "Building / construction", "البناء والتركيب", "בנייה והרכבה", "🧱"),
  v("drawing_art", "Drawing / art", "الرسم والفن", "ציור ואמנות", "🎨"),
  v("music", "Music", "الموسيقى", "מוזיקה", "🎵"),
  v("dancing_movement", "Dancing / movement", "الرقص والحركة", "ריקוד ותנועה", "💃"),
  v("stories_books", "Stories / books", "القصص والكتب", "סיפורים וספרים", "📚"),
  v("outdoor_play", "Outdoor play", "اللعب في الخارج", "משחק בחוץ", "🌳"),
  v("animals", "Animals", "الحيوانات", "בעלי חיים", "🐘"),
  v("social_games", "Social games", "الألعاب الجماعية", "משחקים חברתיים", "🤝"),
  v("digital_games", "Digital games / screens", "الألعاب الرقمية", "משחקים דיגיטליים", "📱"),
  v("nature", "Nature", "الطبيعة", "טבע", "🌼"),
  v("space", "Space and stars", "الفضاء والنجوم", "חלל וכוכבים", "🚀"),
  v("cooking", "Cooking", "الطبخ", "בישול", "🍳"),
];

export const STRENGTHS: VocabEntry[] = [
  v("persistence", "Persistence", "المثابرة", "התמדה", "💪"),
  v("creativity", "Creativity", "الإبداع", "יצירתיות", "✨"),
  v("kindness", "Kindness", "اللطف", "טוב לב", "💛"),
  v("curiosity", "Curiosity", "حب الاستطلاع", "סקרנות", "🔍"),
  v("humor", "Sense of humor", "حس الفكاهة", "חוש הומור", "😄"),
  v("helpfulness", "Likes to help", "حب المساعدة", "אוהב/ת לעזור", "🙌"),
  v("imagination", "Imagination", "الخيال", "דמיון", "🌈"),
  v("deep_focus", "Deep focus on favorite activities", "تركيز عميق في نشاطاته المفضلة", "ריכוז עמוק בפעילות אהובה", "🎯"),
  v("verbal_expression", "Expresses ideas in words", "التعبير بالكلمات", "הבעה מילולית", "💬"),
  v("physical_skill", "Physical skill", "المهارة الحركية", "מיומנות גופנית", "🤸"),
  v("musicality", "Musicality", "الحس الموسيقي", "מוזיקליות", "🎶"),
  v("independence", "Independence", "الاستقلالية", "עצמאות", "🧭"),
  v("empathy", "Empathy", "التعاطف", "אמפתיה", "🤗"),
  v("problem_solving", "Problem solving", "حل المشكلات", "פתרון בעיות", "🧩"),
  v("good_memory", "Good memory", "ذاكرة جيدة", "זיכרון טוב", "🧠"),
  v("leadership", "Leads games", "القيادة في اللعب", "מוביל/ה משחקים", "⭐"),
];

export const SUPPORTS: VocabEntry[] = [
  v("visual_cue", "Visual cue", "إشارة بصرية", "רמז חזותי", "🖼️"),
  v("visual_countdown", "Visual countdown", "عد تنازلي بصري", "ספירה לאחור חזותית", "⏳"),
  v("countdown", "Verbal countdown", "عد تنازلي شفهي", "ספירה לאחור בעל פה", "🔢"),
  v("advance_warning", "Advance warning", "تنبيه مسبق", "הכנה מראש", "🔔"),
  v("explain_next_step", "Explaining what happens next", "شرح ما سيحدث بعد ذلك", "הסבר מה יקרה אחר כך", "➡️"),
  v("adult_mediation", "Adult mediation", "وساطة شخص بالغ", "תיווך של מבוגר", "🧑‍🏫"),
  v("movement_break", "Movement", "الحركة", "תנועה", "🏃"),
  v("reduced_stimulation", "Reduced stimulation", "تقليل المثيرات", "הפחתת גירויים", "🔈"),
  v("positive_reinforcement", "Positive reinforcement", "التعزيز الإيجابي", "חיזוק חיובי", "👏"),
  v("first_then", "First / then", "أولاً / ثم", "קודם / אחר כך", "1️⃣"),
  v("choice", "Offering a choice", "إعطاء خيار", "מתן בחירה", "🤔"),
  v("repetition", "Repetition", "التكرار", "חזרה", "🔁"),
  v("peer_modeling", "Peer modeling", "التعلم من الأقران", "למידה מחברים", "👫"),
  v("transition_object", "Transition object", "غرض انتقالي", "חפץ מעבר", "🧸"),
  v("hug_comfort", "Hug / physical comfort", "حضن وطمأنة", "חיבוק ונחמה", "🤗"),
  v("quiet_space", "Quiet space", "مكان هادئ", "פינה שקטה", "🛋️"),
  v("music_song", "Song or music", "أغنية أو موسيقى", "שיר או מוזיקה", "🎵"),
  v("visual_schedule", "Visual schedule", "جدول مصور", "לוח זמנים חזותי", "📅"),
  v("special_role", "A special helper role", "دور مساعد خاص", "תפקיד עוזר מיוחד", "🏅"),
];

export const TRIGGERS: VocabEntry[] = [
  v("unexpected_transition", "Unexpected transitions", "الانتقالات المفاجئة", "מעברים לא צפויים", "⏱️"),
  v("stopping_preferred_activity", "Stopping a favorite activity", "إيقاف نشاط مفضل", "הפסקת פעילות אהובה", "✋"),
  v("loud_surprise_sounds", "Loud, surprising sounds", "الأصوات العالية المفاجئة", "רעשים חזקים ומפתיעים", "📢"),
  v("crowding", "Crowded spaces", "الأماكن المزدحمة", "צפיפות", "👥"),
  v("separation", "Separation from parent", "الانفصال عن الأهل", "פרידה מההורה", "👋"),
  v("toy_taken", "Another child taking a toy", "أخذ لعبته من طفل آخر", "ילד אחר לוקח צעצוע", "🧸"),
  v("waiting", "Long waiting", "الانتظار الطويل", "המתנה ארוכה", "⌛"),
  v("new_people", "New people", "أشخاص جدد", "אנשים חדשים", "🧑"),
  v("new_situations", "New situations", "مواقف جديدة", "מצבים חדשים", "🆕"),
  v("messy_textures", "Messy textures", "الملمس المتسخ أو اللزج", "מרקמים מלכלכים", "🫳"),
  v("strong_smells", "Strong smells", "الروائح القوية", "ריחות חזקים", "👃"),
  v("bright_lights", "Bright lights", "الأضواء الساطعة", "אורות חזקים", "💡"),
  v("tiredness_hunger", "Tiredness or hunger", "التعب أو الجوع", "עייפות או רעב", "😴"),
];

export const SENSORY: VocabEntry[] = [
  v("noise_sensitive", "Sensitive to noise", "حساس للضجيج", "רגיש/ה לרעש", "🔊"),
  v("touch_sensitive", "Sensitive to touch", "حساس للمس", "רגיש/ה למגע", "✋"),
  v("texture_sensitive", "Sensitive to textures", "حساس للملمس", "רגיש/ה למרקמים", "🧶"),
  v("clothing_sensitive", "Sensitive to clothing", "حساس للملابس", "רגיש/ה לבגדים", "👕"),
  v("dirt_avoidant", "Avoids getting dirty", "يتجنب الاتساخ", "נמנע/ת מלכלוך", "🧼"),
  v("light_sensitive", "Sensitive to light", "حساس للضوء", "רגיש/ה לאור", "💡"),
  v("smell_sensitive", "Sensitive to smells", "حساس للروائح", "רגיש/ה לריחות", "👃"),
  v("movement_seeking", "Seeks movement", "يبحث عن الحركة", "מחפש/ת תנועה", "🤸"),
  v("crowd_sensitive", "Sensitive to crowding", "حساس للازدحام", "רגיש/ה לצפיפות", "👥"),
];

export const SOCIAL: VocabEntry[] = [
  v("initiates_play", "Initiates play", "يبادر إلى اللعب", "יוזם/ת משחק"),
  v("waits_for_others", "Waits for others to invite", "ينتظر دعوة الآخرين", "מחכה שיזמינו"),
  v("prefers_solo_play", "Prefers playing alone", "يفضل اللعب وحده", "מעדיף/ה לשחק לבד"),
  v("plays_with_familiar", "Plays mostly with familiar children", "يلعب غالباً مع أطفال يعرفهم", "משחק/ת בעיקר עם ילדים מוכרים"),
  v("needs_mediation", "Benefits from adult mediation", "يستفيد من وساطة البالغ", "נעזר/ת בתיווך מבוגר"),
];

export const COMMUNICATION: VocabEntry[] = [
  v("words", "Words", "كلمات", "מילים"),
  v("sentences", "Sentences", "جمل", "משפטים"),
  v("gestures", "Gestures", "إشارات", "תנועות ידיים"),
  v("behavior", "Crying / behavior", "البكاء أو السلوك", "בכי או התנהגות"),
  v("seeks_adult", "Seeks an adult", "يبحث عن شخص بالغ", "פונה למבוגר"),
  v("enjoys_recounting", "Enjoys telling about experiences", "يحب الحديث عن تجاربه", "אוהב/ת לספר על חוויות"),
];

export const FAMILY_PRIORITIES: VocabEntry[] = [
  v("safe", "Safe", "آمن", "מוגן/ת", "🛡️"),
  v("loved", "Loved", "محبوب", "אהוב/ה", "❤️"),
  v("belonging", "Belonging", "منتمٍ", "שייך/ת", "🏡"),
  v("independent", "Independent", "مستقل", "עצמאי/ת", "🧭"),
  v("capable", "Capable", "قادر", "מסוגל/ת", "💪"),
  v("happy", "Happy", "سعيد", "שמח/ה", "😊"),
  v("socially_accepted", "Socially accepted", "مقبول اجتماعياً", "מקובל/ת חברתית", "🤝"),
  v("curious", "Curious", "فضولي", "סקרן/ית", "🔍"),
];

export const LEARNING_PREFERENCES: VocabEntry[] = [
  v("visual", "Learns well with pictures", "يتعلم جيداً بالصور", "לומד/ת היטב עם תמונות", "🖼️"),
  v("hands_on", "Hands-on learning", "التعلم باليدين", "למידה בידיים", "✋"),
  v("movement_based", "Learning through movement", "التعلم بالحركة", "למידה בתנועה", "🏃"),
  v("music_based", "Learning through songs", "التعلم بالأغاني", "למידה בשירים", "🎵"),
  v("story_based", "Learning through stories", "التعلم بالقصص", "למידה בסיפורים", "📖"),
  v("repetition_based", "Learns through repetition", "يتعلم بالتكرار", "לומד/ת בחזרות", "🔁"),
];

export const EMOTIONAL_REGULATION: VocabEntry[] = [
  v("calms_with_adult", "Calms with an adult nearby", "يهدأ بوجود شخص بالغ", "נרגע/ת עם מבוגר קרוב"),
  v("calms_with_time", "Calms with a little time", "يهدأ مع قليل من الوقت", "נרגע/ת עם מעט זמן"),
  v("needs_preparation_for_change", "Does best when prepared for change", "يكون في أفضل حال عند التحضير للتغيير", "מצליח/ה כשמכינים לשינוי"),
  v("expresses_feelings_in_words", "Names feelings in words", "يسمي مشاعره بالكلمات", "מבטא/ת רגשות במילים"),
];

export const EXECUTIVE_FUNCTION: VocabEntry[] = [
  v("sustained_engagement", "Stays engaged for a long time", "ينخرط لفترة طويلة", "נשאר/ת מעורב/ת לאורך זמן"),
  v("transition_support_helpful", "Transitions go better with support", "الانتقالات تتحسن مع الدعم", "מעברים מצליחים יותר עם תמיכה"),
  v("follows_routine", "Follows familiar routines", "يتبع الروتين المألوف", "עוקב/ת אחר שגרה מוכרת"),
];

export const PLAY: VocabEntry[] = [
  v("constructive_play", "Constructive play", "اللعب البنائي", "משחק בנייה"),
  v("pretend_role_play", "Role play", "لعب الأدوار", "משחק תפקידים"),
  v("parallel_play", "Parallel play", "اللعب المتوازي", "משחק מקביל"),
  v("cooperative_play", "Cooperative play", "اللعب التعاوني", "משחק שיתופי"),
];

export const MOTOR: VocabEntry[] = [
  v("enjoys_climbing", "Enjoys climbing", "يحب التسلق", "אוהב/ת לטפס"),
  v("enjoys_fine_motor", "Enjoys fine-motor tasks", "يحب الأنشطة الدقيقة", "אוהב/ת פעילות מוטוריקה עדינה"),
  v("energetic_movement", "Energetic mover", "كثير الحركة", "תנועתי/ת מאוד"),
];

export const INDEPENDENCE: VocabEntry[] = [
  v("eats_independently", "Eats independently", "يأكل باستقلالية", "אוכל/ת באופן עצמאי"),
  v("dresses_with_help", "Dresses with some help", "يرتدي ملابسه مع بعض المساعدة", "מתלבש/ת עם מעט עזרה"),
  v("tidies_up", "Helps tidy up", "يساعد في الترتيب", "עוזר/ת בסידור"),
];

export const LANGUAGES: VocabEntry[] = [
  v("ar", "Arabic", "العربية", "ערבית"),
  v("he", "Hebrew", "العبرية", "עברית"),
  v("en", "English", "الإنجليزية", "אנגלית"),
  v("ru", "Russian", "الروسية", "רוסית"),
  v("fr", "French", "الفرنسية", "צרפתית"),
  v("am", "Amharic", "الأمهرية", "אמהרית"),
  v("other", "Other", "أخرى", "אחר"),
];

export const VOCABULARY: Record<AttributeCategory, VocabEntry[]> = {
  INTEREST: INTERESTS,
  STRENGTH: STRENGTHS,
  SUPPORT: SUPPORTS,
  TRIGGER: TRIGGERS,
  SENSORY: SENSORY,
  SOCIAL_INTERACTION: SOCIAL,
  COMMUNICATION: COMMUNICATION,
  LANGUAGE: LANGUAGES,
  FAMILY_PRIORITY: FAMILY_PRIORITIES,
  LEARNING_PREFERENCE: LEARNING_PREFERENCES,
  EMOTIONAL_REGULATION: EMOTIONAL_REGULATION,
  EXECUTIVE_FUNCTION: EXECUTIVE_FUNCTION,
  PLAY: PLAY,
  MOTOR: MOTOR,
  INDEPENDENCE: INDEPENDENCE,
};

export function isKnownValue(category: AttributeCategory, key: string): boolean {
  return VOCABULARY[category].some((e) => e.key === key);
}

export function vocabEntry(category: AttributeCategory, key: string): VocabEntry | undefined {
  return VOCABULARY[category].find((e) => e.key === key);
}

/** Human label for a value; falls back to a humanized key for legacy values. */
export function vocabLabel(category: AttributeCategory, key: string, locale: keyof L): string {
  const e = vocabEntry(category, key);
  return e ? e.label[locale] || e.label.en : key.replaceAll("_", " ");
}

/** Lookup across all categories (used for supports recorded on observations). */
export function anyVocabLabel(key: string, locale: keyof L): string {
  for (const entries of Object.values(VOCABULARY)) {
    const e = entries.find((x) => x.key === key);
    if (e) return e.label[locale] || e.label.en;
  }
  return key.replaceAll("_", " ");
}
