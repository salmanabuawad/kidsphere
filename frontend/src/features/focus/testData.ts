/** Test fixtures for the Plan and Development tabs (not used by the app). */
import type { ChildDetail } from "@/features/children";
import type { OptionLists } from "@/lib/options";

const L = (en: string, ar: string, he: string) => ({ en, ar, he });

export const planOptions: OptionLists = {
  languages: [
    { key: "ar", label: L("Arabic", "العربية", "ערבית") },
    { key: "en", label: L("English", "الإنجليزية", "אנגלית") },
  ],
  strengths: [
    { key: "building", icon: "🧱", label: L("Building", "البناء", "בנייה") },
    { key: "imagination", icon: "🌈", label: L("Imagination", "الخيال", "דמיון") },
  ],
  interests: [{ key: "cars_transportation", icon: "🚗", label: L("Cars & transportation", "السيارات", "מכוניות") }],
  what_helps: [{ key: "adult_mediation", icon: "🧑‍🏫", label: L("Adult guidance", "توجيه من شخص بالغ", "תיווך של מבוגר") }],
  priority_categories: [
    { key: "social", icon: "🤝", label: L("Social", "المجال الاجتماعي", "חברתי") },
    { key: "emotional", icon: "💛", label: L("Emotional", "المجال العاطفي", "רגשי") },
    { key: "motor", icon: "🤸", label: L("Motor", "المجال الحركي", "מוטורי") },
    { key: "other", label: L("Other", "أخرى", "אחר") },
  ],
  focus_suggestions: [
    { key: "joining_group_play", category: "social", label: L("Joining group play", "الانضمام إلى اللعب الجماعي", "הצטרפות למשחק קבוצתי") },
    { key: "taking_turns", category: "social", label: L("Taking turns", "انتظار الدور", "המתנה לתור") },
    { key: "expressing_frustration_in_words", category: "emotional", label: L("Expressing frustration in words", "التعبير عن الإحباط بالكلمات", "ביטוי תסכול במילים") },
  ],
  hope_child_feels: [
    { key: "safe", label: L("Safe", "بأمان", "בטוח/ה") },
    { key: "belonging", label: L("That they belong", "بالانتماء", "שייך/ת") },
  ],
  need_areas: [{ key: "social", label: L("Social", "اجتماعي", "חברתי") }],
  improvement_levels: [
    { key: "significant", icon: "🌱", label: L("Significant improvement", "تحسّن واضح", "שיפור משמעותי") },
    { key: "partial", icon: "🌤️", label: L("Partial improvement", "تحسّن جزئي", "שיפור חלקי") },
    { key: "no_change", icon: "➖", label: L("No change yet", "لا تغيير بعد", "ללא שינוי עדיין") },
    { key: "needs_more_observation", icon: "👀", label: L("Needs more observation", "يحتاج إلى مزيد من الملاحظة", "נדרשת תצפית נוספת") },
  ],
  involvement_steps: [
    { key: "none", label: L("No", "لا", "לא") },
    { key: "consultation", label: L("Consultation", "استشارة", "התייעצות") },
    { key: "joint_plan", label: L("Shared plan", "خطة مشتركة", "תוכנית משותפת") },
    { key: "referral_as_needed", label: L("Involve a specialist if needed", "إشراك مختص عند الحاجة", "שיתוף גורם מקצועי לפי הצורך") },
  ],
  observation_domains: [
    { key: "social", icon: "🤝", label: L("Social", "الجانب الاجتماعي", "חברתי") },
    { key: "play", icon: "🧸", label: L("Play", "اللعب", "משחק") },
  ],
  provenance: [
    { key: "parent_said", label: L("Parent said", "قال الأهل", "ההורים סיפרו") },
    { key: "teacher_observed", label: L("Teacher observed", "ملاحظة المعلّمة", "תצפית הגננת") },
  ],
};

export const planChild = {
  id: "c1",
  view: "staff",
  name: "Adam",
  preferred_name: null,
  birth_date: "2022-08-05",
  age: { years: 4, months: 2 },
  gender: "boy",
  class: { id: "c-a", name: "Class A", kindergarten: "Sunflower KG" },
  main_language: "ar",
  additional_languages: [],
  parent_name: null,
  parent_contact: null,
  has_photo: false,
  archived: false,
  updated_at: "2026-10-01T10:00:00Z",
  strengths: [{ key: "building", sources: ["teacher"] }],
  interests: [{ key: "cars_transportation", sources: ["parent"] }],
  what_helps: [],
  motivators: [],
  sensitivities: [],
  current_understanding: null,
  focus_areas: [],
  latest_observation: null,
  last_observation_at: null,
  wizard: { step: 8, completed_at: "2026-09-01T10:00:00Z" },
  baseline: { exists: true, latest_created_at: "2026-09-01T10:00:00Z" },
  draft_content_count: 0,
} as unknown as ChildDetail;
