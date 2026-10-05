/** Shared test fixtures for the observations, focus and timeline tests (not used by the app). */
import type { OptionLists } from "@/lib/options";
import type { ChildCard, ChildStaffView } from "@/features/children";

const L = (en: string, ar: string, he: string) => ({ en, ar, he });

export const options: OptionLists = {
  languages: [
    { key: "ar", label: L("Arabic", "العربية", "ערבית") },
    { key: "en", label: L("English", "الإنجليزية", "אנגלית") },
  ],
  strengths: [{ key: "building", icon: "🧱", label: L("Building", "البناء", "בנייה") }],
  interests: [{ key: "cars_transportation", icon: "🚗", label: L("Cars & transportation", "السيارات", "מכוניות") }],
  observation_contexts: [
    { key: "free_play", icon: "🧸", label: L("Free play", "اللعب الحر", "משחק חופשי") },
    { key: "group_time", icon: "⭕", label: L("Group time", "وقت الحلقة", "מפגש") },
    { key: "yard", icon: "🌳", label: L("Yard", "الساحة", "חצר") },
  ],
  what_helps: [
    { key: "adult_mediation", icon: "🧑‍🏫", label: L("Adult guidance", "توجيه من شخص بالغ", "תיווך של מבוגר") },
    { key: "visual_support", icon: "🖼️", label: L("Visual support", "دعم بصري", "תמיכה חזותית") },
    { key: "other", label: L("Other", "أخرى", "אחר") },
  ],
  priority_categories: [
    { key: "social", icon: "🤝", label: L("Social", "المجال الاجتماعي", "חברתי") },
    { key: "emotional", icon: "💛", label: L("Emotional", "المجال العاطفي", "רגשי") },
  ],
  focus_suggestions: [
    { key: "joining_group_play", category: "social", label: L("Joining group play", "الانضمام إلى اللعب الجماعي", "הצטרפות למשחק קבוצתי") },
    { key: "taking_turns", category: "social", label: L("Taking turns", "انتظار الدور", "המתנה לתור") },
    { key: "expressing_frustration_in_words", category: "emotional", label: L("Expressing frustration in words", "التعبير عن الإحباط بالكلمات", "ביטוי תסכול במילים") },
  ],
  content_results: [
    { key: "worked_well", icon: "🌟", label: L("Worked well", "نجح جيداً", "עבד טוב") },
    { key: "partly", icon: "🌤️", label: L("Partly", "جزئياً", "חלקית") },
    { key: "did_not_work", icon: "🌧️", label: L("Did not work this time", "لم ينجح هذه المرة", "לא הצליח הפעם") },
  ],
  content_types: [{ key: "real_world_activity", icon: "🤲", label: L("Real-world activity", "نشاط عملي", "פעילות מעשית") }],
};

export const classA = { id: "c-a", name: "Class A", kindergarten: "Sunflower KG" };

export const adamCard: ChildCard = {
  id: "c1",
  name: "Adam",
  preferred_name: null,
  birth_date: "2022-08-05",
  age: { years: 4, months: 2 },
  class: classA,
  main_language: "ar",
  has_photo: false,
  updated_at: "2026-10-01T10:00:00Z",
  wizard_completed: true,
  active_focus_count: 1,
  last_observation_at: null,
  draft_content_count: 0,
};

export const mayaCard: ChildCard = { ...adamCard, id: "c2", name: "Maya", birth_date: "2021-11-20" };

export const adam: ChildStaffView = {
  id: "c1",
  view: "staff",
  name: "Adam",
  preferred_name: null,
  birth_date: "2022-08-05",
  age: { years: 4, months: 2 },
  gender: "boy",
  class: classA,
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
  focus_areas: [
    {
      id: "f1",
      title: "Joining group play",
      category: "social",
      suggestion_key: "joining_group_play",
      description: null,
      plan: null,
      created_at: "2026-09-01T10:00:00Z",
    },
  ],
  latest_observation: null,
  last_observation_at: null,
  wizard: { step: 8, completed_at: "2026-09-01T10:00:00Z" },
  baseline: { exists: true, latest_created_at: "2026-09-01T10:00:00Z" },
  draft_content_count: 0,
};
