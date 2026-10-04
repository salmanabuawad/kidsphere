/**
 * "Get to Know My Child" — declarative questionnaire definition.
 *
 * The form UI, server validation, the parent-insight view and the
 * deterministic profile engine all read from this single definition.
 * `sensitive: true` answers are health/family details: they are stored with
 * ParentResponse.isSensitive, shown only to permitted staff, and are never
 * read by the AI context builder.
 */
import type { L } from "@/lib/i18n/config";
import {
  COMMUNICATION,
  FAMILY_PRIORITIES,
  INTERESTS,
  LANGUAGES,
  SOCIAL,
  STRENGTHS,
  SUPPORTS,
  type VocabEntry,
} from "@/features/child-understanding/vocabulary";

export type Option = { key: string; label: L; emoji?: string };

export type Question =
  | { key: string; type: "text" | "textarea"; label: L; help?: L; sensitive?: boolean }
  | { key: string; type: "single" | "multi"; label: L; options: Option[]; allowOther?: boolean; sensitive?: boolean }
  | { key: string; type: "grid"; label: L; rows: Option[]; levels: Option[] };

export type Section = { key: string; title: L; intro?: L; questions: Question[] };

const o = (key: string, en: string, ar: string, he: string): Option => ({ key, label: { en, ar, he } });
const fromVocab = (entries: VocabEntry[], keys?: string[]): Option[] =>
  entries.filter((e) => !keys || keys.includes(e.key)).map((e) => ({ key: e.key, label: e.label, emoji: e.emoji }));
const yesNoSometimes = [o("yes", "Yes", "نعم", "כן"), o("sometimes", "Sometimes", "أحياناً", "לפעמים"), o("no", "No", "لا", "לא")];

const text = (key: string, en: string, ar: string, he: string, sensitive = false): Question => ({
  key,
  type: "textarea",
  label: { en, ar, he },
  sensitive,
});

export const QUESTIONNAIRE: Section[] = [
  {
    key: "child_info",
    title: { en: "About your child", ar: "عن طفلك", he: "על הילד/ה שלך" },
    intro: {
      en: "Thank you for helping us get to know your child. Every question is optional — share what feels right. You can save and continue later.",
      ar: "شكراً لمساعدتنا في التعرّف على طفلك. جميع الأسئلة اختيارية — شاركوا ما ترونه مناسباً. يمكنكم الحفظ والمتابعة لاحقاً.",
      he: "תודה שאתם עוזרים לנו להכיר את ילדכם. כל השאלות רשות — שתפו מה שמרגיש לכם נכון. אפשר לשמור ולהמשיך אחר כך.",
    },
    questions: [
      {
        key: "preferred_name",
        type: "text",
        label: { en: "What does your child like to be called?", ar: "بماذا يحب طفلك أن يُنادى؟", he: "איך הילד/ה אוהב/ת שיקראו לו/ה?" },
      },
    ],
  },
  {
    key: "strengths",
    title: { en: "Description and strengths", ar: "الوصف ونقاط القوة", he: "תיאור וחוזקות" },
    questions: [
      { key: "describe_words", type: "text", label: { en: "Describe your child in 3–5 words", ar: "صِف طفلك في 3–5 كلمات", he: "תארו את ילדכם ב־3–5 מילים" } },
      text("appreciate", "What do you especially appreciate about your child?", "ما الذي تقدّره بشكل خاص في طفلك؟", "מה אתם מעריכים במיוחד בילד/ה שלכם?"),
      {
        key: "strengths_seen",
        type: "multi",
        label: { en: "Strengths you see at home", ar: "نقاط قوة تلاحظونها في البيت", he: "חוזקות שאתם רואים בבית" },
        options: fromVocab(STRENGTHS),
      },
    ],
  },
  {
    key: "interests",
    title: { en: "Interests", ar: "الاهتمامات", he: "תחומי עניין" },
    questions: [
      {
        key: "interests",
        type: "multi",
        label: { en: "What does your child enjoy?", ar: "بماذا يستمتع طفلك؟", he: "ממה הילד/ה נהנה/ית?" },
        options: fromVocab(INTERESTS),
        allowOther: true,
      },
      text("attracts", "What especially attracts your child?", "ما الذي يجذب طفلك بشكل خاص؟", "מה מושך במיוחד את הילד/ה?"),
    ],
  },
  {
    key: "joy",
    title: { en: "Joy, safety and competence", ar: "الفرح والأمان والكفاءة", he: "שמחה, ביטחון ומסוגלות" },
    questions: [
      text("happy", "What usually makes your child feel happy?", "ما الذي يُشعر طفلك بالسعادة عادةً؟", "מה בדרך כלל משמח את הילד/ה?"),
      text("safe", "What helps your child feel safe?", "ما الذي يساعد طفلك على الشعور بالأمان؟", "מה עוזר לילד/ה להרגיש מוגן/ת?"),
      text("successful", "When does your child feel successful?", "متى يشعر طفلك بالنجاح؟", "מתי הילד/ה מרגיש/ה מוצלח/ת?"),
      text("home_activities", "Preferred activities at home", "الأنشطة المفضلة في البيت", "פעילויות אהובות בבית"),
      text(
        "engaged_activities",
        "Activities your child stays engaged with",
        "أنشطة يبقى طفلك منشغلاً بها لفترة طويلة",
        "פעילויות שהילד/ה נשאר/ת בהן לאורך זמן",
      ),
      text("good_at", "Things your child is especially good at", "أشياء يجيدها طفلك بشكل خاص", "דברים שהילד/ה טוב/ה בהם במיוחד"),
    ],
  },
  {
    key: "emotional",
    title: { en: "Emotional world", ar: "العالم العاطفي", he: "העולם הרגשי" },
    questions: [
      text("helps_when_sad", "What helps when your child is sad?", "ما الذي يساعد عندما يكون طفلك حزيناً؟", "מה עוזר כשהילד/ה עצוב/ה?"),
      {
        key: "frustration_reaction",
        type: "multi",
        label: {
          en: "How does your child usually react to anger or frustration?",
          ar: "كيف يتفاعل طفلك عادةً مع الغضب أو الإحباط؟",
          he: "איך הילד/ה מגיב/ה בדרך כלל לכעס או תסכול?",
        },
        options: [
          o("cries", "Cries", "يبكي", "בוכה"),
          o("shouts", "Shouts", "يصرخ", "צועק/ת"),
          o("moves_away", "Moves away", "يبتعد", "מתרחק/ת"),
          o("seeks_adult", "Seeks an adult", "يبحث عن شخص بالغ", "פונה למבוגר"),
          o("asks_hug", "Asks for a hug", "يطلب حضناً", "מבקש/ת חיבוק"),
          o("hard_to_calm", "Takes time to calm down", "يحتاج وقتاً ليهدأ", "לוקח זמן להירגע"),
          o("outburst", "Big emotional reaction", "ردة فعل عاطفية قوية", "תגובה רגשית עוצמתית"),
        ],
        allowOther: true,
      },
      {
        key: "calming_supports",
        type: "multi",
        label: { en: "What helps your child calm down?", ar: "ما الذي يساعد طفلك على الهدوء؟", he: "מה עוזר לילד/ה להירגע?" },
        options: fromVocab(SUPPORTS, [
          "hug_comfort",
          "quiet_space",
          "explain_next_step",
          "music_song",
          "movement_break",
          "choice",
          "transition_object",
          "adult_mediation",
        ]),
      },
      text("calming_notes", "Best ways to calm and support your child", "أفضل الطرق لتهدئة طفلك ودعمه", "הדרכים הטובות ביותר להרגיע ולתמוך"),
      text("new_situations", "How does your child respond to new situations?", "كيف يستجيب طفلك للمواقف الجديدة؟", "איך הילד/ה מגיב/ה למצבים חדשים?"),
      text("new_people", "How does your child respond to new people?", "كيف يستجيب طفلك للأشخاص الجدد؟", "איך הילד/ה מגיב/ה לאנשים חדשים?"),
      text("overwhelm", "Situations that may overwhelm or stress your child", "مواقف قد ترهق طفلك أو تسبب له التوتر", "מצבים שעלולים להציף או להלחיץ"),
      text("teacher_should_know", "What should the teacher know?", "ما الذي يجب أن تعرفه المعلمة؟", "מה חשוב שהגננת תדע?"),
    ],
  },
  {
    key: "separation",
    title: { en: "Morning separation", ar: "الانفصال الصباحي", he: "פרידת בוקר" },
    questions: [
      {
        key: "separation",
        type: "single",
        label: { en: "Saying goodbye in the morning is usually…", ar: "الوداع في الصباح يكون عادةً…", he: "הפרידה בבוקר היא בדרך כלל…" },
        options: [
          o("easy", "Easy", "سهلاً", "קלה"),
          o("needs_time", "Needs some time", "يحتاج بعض الوقت", "צריכה זמן"),
          o("very_difficult", "Very difficult", "صعباً جداً", "קשה מאוד"),
          o("varies", "Changes from day to day", "يختلف من يوم لآخر", "משתנה מיום ליום"),
        ],
      },
      text("separation_helps", "What helps?", "ما الذي يساعد؟", "מה עוזר?"),
      {
        key: "transition_object",
        type: "text",
        label: { en: "Is there a transition object or goodbye routine?", ar: "هل هناك غرض انتقالي أو روتين للوداع؟", he: "יש חפץ מעבר או טקס פרידה?" },
      },
    ],
  },
  {
    key: "social",
    title: { en: "Social relationships", ar: "العلاقات الاجتماعية", he: "קשרים חברתיים" },
    questions: [
      {
        key: "social_style",
        type: "multi",
        label: { en: "With other children, your child usually…", ar: "مع الأطفال الآخرين، طفلك عادةً…", he: "עם ילדים אחרים, הילד/ה בדרך כלל…" },
        options: fromVocab(SOCIAL),
        allowOther: true,
      },
      text(
        "toy_conflict",
        "How does your child react when another child takes a toy or disagrees?",
        "كيف يتفاعل طفلك عندما يأخذ طفل آخر لعبته أو يختلف معه؟",
        "איך הילד/ה מגיב/ה כשילד אחר לוקח צעצוע או לא מסכים?",
      ),
      text("friendships", "Meaningful friendships", "صداقات مهمة", "חברויות משמעותיות"),
      text("social_success", "What helps your child succeed socially?", "ما الذي يساعد طفلك على النجاح اجتماعياً؟", "מה עוזר לילד/ה להצליח חברתית?"),
    ],
  },
  {
    key: "communication",
    title: { en: "Communication and language", ar: "التواصل واللغة", he: "תקשורת ושפה" },
    questions: [
      {
        key: "communicates_needs",
        type: "multi",
        label: { en: "How does your child communicate needs?", ar: "كيف يعبّر طفلك عن احتياجاته؟", he: "איך הילד/ה מבטא/ת צרכים?" },
        options: fromVocab(COMMUNICATION, ["words", "sentences", "gestures", "behavior", "seeks_adult"]),
        allowOther: true,
      },
      {
        key: "enjoys_recounting",
        type: "single",
        label: { en: "Does your child enjoy talking about experiences?", ar: "هل يستمتع طفلك بالحديث عن تجاربه؟", he: "האם הילד/ה נהנה/ית לספר על חוויות?" },
        options: yesNoSometimes,
      },
      {
        key: "home_languages",
        type: "multi",
        label: { en: "Languages spoken at home", ar: "اللغات المحكية في البيت", he: "שפות המדוברות בבית" },
        options: fromVocab(LANGUAGES),
      },
      text(
        "communication_notes",
        "Anything about communication or language the teacher should know",
        "أي شيء عن التواصل أو اللغة يجب أن تعرفه المعلمة",
        "משהו על תקשורת או שפה שחשוב שהגננת תדע",
      ),
    ],
  },
  {
    key: "independence",
    title: { en: "Independence and daily routines", ar: "الاستقلالية والروتين اليومي", he: "עצמאות ושגרת יום" },
    questions: [
      {
        key: "independence",
        type: "grid",
        label: { en: "How independent is your child with…", ar: "ما مدى استقلالية طفلك في…", he: "עד כמה הילד/ה עצמאי/ת ב…" },
        rows: [
          o("eating", "Eating", "الأكل", "אכילה"),
          o("drinking", "Drinking", "الشرب", "שתייה"),
          o("toilet", "Toilet", "استخدام المرحاض", "שירותים"),
          o("washing_hands", "Washing hands", "غسل اليدين", "רחיצת ידיים"),
          o("dressing", "Dressing", "ارتداء الملابس", "התלבשות"),
          o("shoes", "Shoes", "الحذاء", "נעליים"),
          o("cleaning_toys", "Cleaning up toys", "ترتيب الألعاب", "סידור צעצועים"),
          o("belongings", "Keeping belongings", "الحفاظ على أغراضه", "שמירה על חפצים"),
        ],
        levels: [
          o("independent", "Independent", "مستقل", "עצמאי/ת"),
          o("some_help", "Some help", "بعض المساعدة", "קצת עזרה"),
          o("adult_helps", "Adult helps", "يساعده شخص بالغ", "מבוגר עוזר"),
        ],
      },
      text("parent_assists", "Where do you still assist?", "أين ما زلتم تساعدون طفلكم؟", "במה אתם עדיין עוזרים?"),
      text("routines_preserve", "Routines that are important to preserve", "روتين مهم الحفاظ عليه", "שגרות שחשוב לשמור עליהן"),
    ],
  },
  {
    key: "sensitivities",
    title: { en: "Sleep, eating and sensitivities", ar: "النوم والأكل والحساسيات", he: "שינה, אכילה ורגישויות" },
    intro: {
      en: "Health details (sleep, eating, allergies) are kept in a protected area visible only to your child's teacher. They are never used to create content.",
      ar: "تُحفظ التفاصيل الصحية (النوم والأكل والحساسية) في منطقة محمية لا تراها إلا معلمة طفلك، ولا تُستخدم أبداً لإنشاء المحتوى.",
      he: "פרטי בריאות (שינה, אכילה, אלרגיות) נשמרים באזור מוגן שרק הגננת רואה, ולעולם אינם משמשים ליצירת תוכן.",
    },
    questions: [
      text("sleep", "Sleep", "النوم", "שינה", true),
      text("food_preferences", "Food preferences", "تفضيلات الطعام", "העדפות אוכל", true),
      text("eating_difficulties", "Eating difficulties", "صعوبات في الأكل", "קשיים באכילה", true),
      text(
        "allergies",
        "Allergies or food sensitivities the kindergarten must know",
        "حساسية أو حساسية طعام يجب أن تعرفها الروضة",
        "אלרגיות או רגישויות למזון שהגן חייב לדעת",
        true,
      ),
      {
        key: "sensory_reactions",
        type: "multi",
        label: { en: "Your child may be sensitive to…", ar: "قد يكون طفلك حساساً لـ…", he: "הילד/ה עשוי/ה להיות רגיש/ה ל…" },
        options: [
          o("noise", "Noise", "الضجيج", "רעש"),
          o("touch", "Touch", "اللمس", "מגע"),
          o("clothing", "Clothing", "الملابس", "בגדים"),
          o("dirt", "Getting dirty", "الاتساخ", "לכלוך"),
          o("smells", "Smells", "الروائح", "ריחות"),
          o("textures", "Textures", "الملمس", "מרקמים"),
          o("light", "Bright light", "الضوء الساطع", "אור חזק"),
          o("crowding", "Crowding", "الازدحام", "צפיפות"),
        ],
      },
      text("sensory_notes", "Anything else about sensitivities", "أي شيء آخر عن الحساسيات", "משהו נוסף על רגישויות"),
    ],
  },
  {
    key: "boundaries",
    title: { en: "Boundaries and cooperation", ar: "الحدود والتعاون", he: "גבולות ושיתוף פעולה" },
    questions: [
      text("boundaries_home", "How are boundaries handled at home?", "كيف تتعاملون مع الحدود في البيت؟", "איך מציבים גבולות בבית?"),
      text("what_works", "What usually works?", "ما الذي ينجح عادةً؟", "מה בדרך כלל עובד?"),
      text("what_not_works", "What does not work?", "ما الذي لا ينجح؟", "מה לא עובד?"),
      text(
        "refusal_helps",
        "What helps when your child refuses or doesn't cooperate?",
        "ما الذي يساعد عندما يرفض طفلك أو لا يتعاون؟",
        "מה עוזר כשהילד/ה מסרב/ת או לא משתף/ת פעולה?",
      ),
    ],
  },
  {
    key: "transitions",
    title: { en: "Changes and transitions", ar: "التغييرات والانتقالات", he: "שינויים ומעברים" },
    questions: [
      {
        key: "stopping_activity",
        type: "single",
        label: {
          en: "When stopping a preferred activity, your child usually…",
          ar: "عند إيقاف نشاط مفضل، طفلك عادةً…",
          he: "כשצריך להפסיק פעילות אהובה, הילד/ה בדרך כלל…",
        },
        options: [
          o("easy", "Stops easily", "يتوقف بسهولة", "מפסיק/ה בקלות"),
          o("needs_preparation", "Needs advance preparation", "يحتاج إلى تحضير مسبق", "צריך/ה הכנה מראש"),
          o("resists", "Resists", "يقاوم", "מתנגד/ת"),
          o("cries_angry", "Cries or gets angry", "يبكي أو يغضب", "בוכה או כועס/ת"),
          o("very_difficult", "Finds it very difficult", "يجد الأمر صعباً جداً", "מתקשה מאוד"),
        ],
      },
      {
        key: "preparation_helps",
        type: "single",
        label: { en: "Does preparation help?", ar: "هل يساعد التحضير؟", he: "האם הכנה עוזרת?" },
        options: yesNoSometimes,
      },
      {
        key: "preparation_what",
        type: "multi",
        label: { en: "What kind of preparation helps?", ar: "ما نوع التحضير الذي يساعد؟", he: "איזו הכנה עוזרת?" },
        options: fromVocab(SUPPORTS, [
          "advance_warning",
          "visual_countdown",
          "countdown",
          "explain_next_step",
          "first_then",
          "choice",
          "transition_object",
          "special_role",
          "visual_schedule",
        ]),
      },
      text("preparation_notes", "Tell us more about what helps", "أخبرونا أكثر عما يساعد", "ספרו לנו עוד על מה שעוזר"),
    ],
  },
  {
    key: "priorities",
    title: { en: "Your priorities", ar: "أولوياتكم", he: "סדרי העדיפויות שלכם" },
    questions: [
      text(
        "most_important",
        "What is the most important thing you want the teacher to know?",
        "ما أهم شيء تريدون أن تعرفه المعلمة؟",
        "מה הדבר החשוב ביותר שתרצו שהגננת תדע?",
      ),
      {
        key: "feel",
        type: "multi",
        label: {
          en: "What would you like your child to feel in kindergarten?",
          ar: "ماذا تودون أن يشعر طفلكم في الروضة؟",
          he: "מה הייתם רוצים שהילד/ה ירגיש/ה בגן?",
        },
        options: fromVocab(FAMILY_PRIORITIES),
        allowOther: true,
      },
      {
        key: "development_areas",
        type: "multi",
        label: { en: "Areas you would like to support this year", ar: "مجالات تودون دعمها هذا العام", he: "תחומים שתרצו לחזק השנה" },
        options: [
          o("emotional", "Emotional", "العاطفي", "רגשי"),
          o("social", "Social", "الاجتماعي", "חברתי"),
          o("language", "Language", "اللغوي", "שפה"),
          o("motor", "Motor", "الحركي", "מוטורי"),
          o("independence", "Independence", "الاستقلالية", "עצמאות"),
        ],
        allowOther: true,
      },
    ],
  },
  {
    key: "partnership",
    title: { en: "Home–kindergarten partnership", ar: "الشراكة بين البيت والروضة", he: "שותפות בית–גן" },
    questions: [
      {
        key: "communication_pref",
        type: "multi",
        label: { en: "Preferred way to communicate", ar: "الطريقة المفضلة للتواصل", he: "דרך התקשורת המועדפת" },
        options: [
          o("conversation", "Personal conversation", "محادثة شخصية", "שיחה אישית"),
          o("phone", "Phone", "الهاتف", "טלפון"),
          o("message", "Message", "رسالة", "הודעה"),
          o("meeting", "Planned meeting", "لقاء مخطط", "פגישה מתוכננת"),
        ],
        allowOther: true,
      },
      text("difficulty_matters", "What matters to you when a difficulty occurs?", "ما المهم بالنسبة لكم عند حدوث صعوبة؟", "מה חשוב לכם כשמתעורר קושי?"),
      text(
        "family_context",
        "Additional family context (only if you choose to share)",
        "سياق عائلي إضافي (فقط إن رغبتم بمشاركته)",
        "הקשר משפחתי נוסף (רק אם תבחרו לשתף)",
        true,
      ),
      text(
        "final_message",
        "If you could tell the teacher one thing about your child before they meet, what would you say?",
        "لو استطعتم أن تقولوا للمعلمة شيئاً واحداً عن طفلكم قبل أن يلتقيا، ماذا ستقولون؟",
        "אם הייתם יכולים לומר לגננת דבר אחד על הילד/ה לפני שייפגשו, מה הייתם אומרים?",
      ),
    ],
  },
];

export const ALL_QUESTIONS: Question[] = QUESTIONNAIRE.flatMap((s) => s.questions);

export function findQuestion(key: string): { section: Section; question: Question } | undefined {
  for (const section of QUESTIONNAIRE) {
    const question = section.questions.find((q) => q.key === key);
    if (question) return { section, question };
  }
  return undefined;
}

export function isSensitiveQuestion(key: string): boolean {
  const q = findQuestion(key)?.question;
  return !!q && "sensitive" in q && !!q.sensitive;
}
