/**
 * DEMO provider — deterministic, offline content generation for development
 * and demos when no AI key is configured. Output is built from the same
 * minimized GenerationContext a real provider receives and passes through the
 * same validation pipeline. Everything it creates is flagged "DEMO" in the UI.
 */
import type { Locale } from "@prisma/client";
import { KIND_BY_TYPE, type ActivityBody, type ContentBody, type GuideBody, type RoutineBody, type StoryBody } from "../schemas";
import type { GenerationContext, RawCompletion } from "../types";
import { AIProvider, type CompletionCall } from "./base";

type T = Record<Locale, string>;
const tr = (en: string, ar: string, he: string): T => ({ en, ar, he });
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

/** Heroes are grammatically masculine in Arabic and Hebrew so templates agree. */
type Hero = { name: T; emoji: string; activity: T; two: T; one: T; rest: T; title?: T };
const HEROES: Record<string, Hero> = {
  vehicles: {
    name: tr("the little excavator", "الحفّار الصغير", "המחפר הקטן"),
    emoji: "🚜",
    activity: tr("scooping sand and building a big hill", "بغرف الرمل وبناء تلّة كبيرة", "בחפירת חול ובבניית גבעה גדולה"),
    two: tr("two scoops left", "بقيت غرفتان", "נשארו שתי חפירות"),
    one: tr("one scoop left", "بقيت غرفة واحدة", "נשארה חפירה אחת"),
    rest: tr("parks in its parking spot", "يركن في مكانه", "חונה במקום שלו"),
    title: tr("{name} and the Excavator's Last Two Scoops", "{name} وآخر غرفتين للحفّار", "{name} ושתי החפירות האחרונות של המחפר"),
  },
  building: {
    name: tr("the little builder", "البنّاء الصغير", "הבנאי הקטן"),
    emoji: "🏗️",
    activity: tr("stacking blocks into a tall tower", "برصّ المكعبات في برج عالٍ", "בבניית מגדל גבוה מקוביות"),
    two: tr("two blocks left", "بقي مكعبان", "נשארו שתי קוביות"),
    one: tr("one block left", "بقي مكعب واحد", "נשארה קובייה אחת"),
    rest: tr("puts the blocks in the basket", "يضع المكعبات في السلة", "מכניס את הקוביות לסל"),
  },
  animals: {
    name: tr("the little elephant", "الفيل الصغير", "הפיל הקטן"),
    emoji: "🐘",
    activity: tr("splashing in the water", "باللعب في الماء", "בהתזת מים"),
    two: tr("two splashes left", "بقيت رشّتان", "נשארו שתי התזות"),
    one: tr("one splash left", "بقيت رشّة واحدة", "נשארה התזה אחת"),
    rest: tr("dries off and rests", "يجفّف نفسه ويرتاح", "מתייבש ונח"),
  },
  music: {
    name: tr("the little drum", "الطبل الصغير", "התוף הקטן"),
    emoji: "🥁",
    activity: tr("playing a happy song", "بعزف أغنية سعيدة", "בניגון שיר שמח"),
    two: tr("two beats left", "بقيت دقّتان", "נשארו שתי הקשות"),
    one: tr("one beat left", "بقيت دقّة واحدة", "נשארה הקשה אחת"),
    rest: tr("rests quietly on the shelf", "يرتاح بهدوء على الرف", "נח בשקט על המדף"),
  },
  space: {
    name: tr("the little rocket", "الصاروخ الصغير", "הטיל הקטן"),
    emoji: "🚀",
    activity: tr("flying around the moon", "بالطيران حول القمر", "בטיסה סביב הירח"),
    two: tr("two loops left", "بقيت دورتان", "נשארו שני סיבובים"),
    one: tr("one loop left", "بقيت دورة واحدة", "נשאר סיבוב אחד"),
    rest: tr("lands softly", "يهبط بلطف", "נוחת בעדינות"),
  },
  stories_books: {
    name: tr("the wise owl", "الطائر الحكيم", "הינשוף החכם"),
    emoji: "🦉",
    activity: tr("reading a favorite book", "بقراءة كتابه المفضل", "בקריאת הספר האהוב"),
    two: tr("two pages left", "بقيت صفحتان", "נשארו שני עמודים"),
    one: tr("one page left", "بقيت صفحة واحدة", "נשאר עמוד אחד"),
    rest: tr("closes the book gently", "يغلق الكتاب بلطف", "סוגר את הספר בעדינות"),
  },
  drawing_art: {
    name: tr("the little painter", "الرسّام الصغير", "הצייר הקטן"),
    emoji: "🎨",
    activity: tr("painting bright colors", "برسم ألوان زاهية", "בציור צבעים עזים"),
    two: tr("two brush strokes left", "بقيت ضربتا فرشاة", "נשארו שתי משיכות מכחול"),
    one: tr("one brush stroke left", "بقيت ضربة فرشاة واحدة", "נשארה משיכת מכחול אחת"),
    rest: tr("washes the brush", "يغسل الفرشاة", "שוטף את המכחול"),
  },
  default: {
    name: tr("the little puppy", "الجرو الصغير", "הכלבלב הקטן"),
    emoji: "🐶",
    activity: tr("playing with a ball", "باللعب بالكرة", "במשחק בכדור"),
    two: tr("two throws left", "بقيت رميتان", "נשארו שתי זריקות"),
    one: tr("one throw left", "بقيت رمية واحدة", "נשארה זריקה אחת"),
    rest: tr("puts the ball away", "يعيد الكرة إلى مكانها", "מחזיר את הכדור למקום"),
  },
};
HEROES.outdoor_play = HEROES.default!;
HEROES.nature = HEROES.default!;

const SUPPORT_LINES: Record<string, T> = {
  visual_countdown: tr("A picture card appears: {two}!", "تظهر بطاقة مصوّرة: {two}!", "מופיע כרטיס תמונה: {two}!"),
  countdown: tr("The teacher says kindly: {two}!", "تقول المعلمة بلطف: {two}!", "הגננת אומרת בעדינות: {two}!"),
  advance_warning: tr(
    "The teacher says: soon it will be time for something new.",
    "تقول المعلمة: قريباً سيحين وقت شيء جديد.",
    "הגננת אומרת: עוד מעט יגיע זמן למשהו חדש.",
  ),
  explain_next_step: tr("The teacher explains what happens next.", "تشرح المعلمة ما الذي سيحدث بعد ذلك.", "הגננת מסבירה מה יקרה אחר כך."),
  first_then: tr("First we finish, then we go together.", "أولاً ننهي، ثم نذهب معاً.", "קודם מסיימים, ואז הולכים יחד."),
  visual_cue: tr("{hero} looks at the picture card.", "ينظر {hero} إلى البطاقة المصوّرة.", "{hero} מסתכל על כרטיס התמונה."),
  choice: tr("{hero} can choose how to go.", "يستطيع {hero} أن يختار كيف يذهب.", "{hero} יכול לבחור איך ללכת."),
  movement_break: tr("{hero} stretches up high and wiggles.", "يتمطّى {hero} عالياً ويتحرك.", "{hero} מתמתח גבוה ומתנועע."),
  adult_mediation: tr("The teacher comes close and helps.", "تقترب المعلمة وتساعد.", "הגננת מתקרבת ועוזרת."),
  positive_reinforcement: tr("“Well done!” says the teacher.", "«أحسنت!» تقول المعلمة.", "״כל הכבוד!״ אומרת הגננת."),
  peer_modeling: tr("A friend shows the way.", "صديق يُري الطريق.", "חבר מראה את הדרך."),
  transition_object: tr("{hero} holds a favorite little toy.", "يمسك {hero} لعبته الصغيرة المفضلة.", "{hero} מחזיק צעצוע קטן ואהוב."),
  hug_comfort: tr("A warm hug helps {hero} feel calm.", "حضن دافئ يساعد {hero} على الهدوء.", "חיבוק חם עוזר ל{hero} להירגע."),
  quiet_space: tr("{hero} rests in a quiet corner for a moment.", "يرتاح {hero} في ركن هادئ لحظة.", "{hero} נח רגע בפינה שקטה."),
  music_song: tr("Everyone sings a short tidy-up song.", "الجميع يغني أغنية ترتيب قصيرة.", "כולם שרים שיר סידור קצר."),
  visual_schedule: tr("{hero} looks at the picture schedule.", "ينظر {hero} إلى الجدول المصوّر.", "{hero} מסתכל על לוח התמונות."),
  special_role: tr("{hero} gets a special job: door helper!", "يحصل {hero} على مهمة خاصة: مساعد الباب!", "{hero} מקבל תפקיד מיוחד: עוזר הדלת!"),
};

const STRENGTH_LINES: Record<string, T> = {
  persistence: tr(
    "{hero} kept going and did not give up — just like {name}!",
    "استمرّ {hero} ولم يستسلم — تماماً مثل {name}!",
    "{hero} המשיך ולא ויתר — בדיוק כמו {name}!",
  ),
  creativity: tr(
    "{hero} had a wonderful new idea — just like {name}!",
    "خطرت لـ{hero} فكرة رائعة — تماماً مثل {name}!",
    "ל{hero} היה רעיון נפלא — בדיוק כמו ל{name}!",
  ),
  kindness: tr(
    "{hero} was kind to a friend — just like {name}!",
    "كان {hero} لطيفاً مع صديقه — تماماً مثل {name}!",
    "{hero} היה נחמד לחבר — בדיוק כמו {name}!",
  ),
  curiosity: tr(
    "{hero} wanted to discover something new — just like {name}!",
    "أراد {hero} أن يكتشف شيئاً جديداً — تماماً مثل {name}!",
    "{hero} רצה לגלות משהו חדש — בדיוק כמו {name}!",
  ),
};
const DEFAULT_STRENGTH = tr("{hero} did it — and so can {name}!", "نجح {hero} — ويستطيع {name} أيضاً!", "{hero} הצליח — וגם {name} יכול!");

type DemoInput = { op: "generate"; ctx: GenerationContext; variant?: number } | { op: "suggest"; text: string };

export class DemoProvider extends AIProvider {
  readonly name = "demo" as const;
  readonly model = "kidsphere-demo-1";
  override readonly isDemo = true;

  protected async complete(call: CompletionCall): Promise<RawCompletion> {
    const input = call.input as DemoInput;
    if (input.op === "suggest") return { json: suggestFromText(input.text) };
    return { json: buildContent(input.ctx, input.variant ?? 0) };
  }
}

function pickHero(ctx: GenerationContext): Hero {
  const theme = ctx.theme?.toLowerCase() ?? "";
  if (/space|rocket|فضاء|חלל/.test(theme)) return HEROES.space!;
  if (/animal|حيوان|חי/.test(theme)) return HEROES.animals!;
  if (/music|موسيق|מוזיק/.test(theme)) return HEROES.music!;
  for (const i of ctx.interests) if (HEROES[i]) return HEROES[i]!;
  return HEROES.default!;
}

function isTransitionGoal(ctx: GenerationContext): boolean {
  const g = `${ctx.goal} ${ctx.successIndicator}`.toLowerCase();
  return (
    /transition|move from|switch|stop|انتقال|الانتقال|מעבר|לעבור/.test(g) ||
    ctx.supports.some((s) => ["visual_countdown", "countdown", "advance_warning", "first_then"].includes(s))
  );
}

function rationale(ctx: GenerationContext, hero: Hero): ContentBody["teacherRationale"] {
  const lang = ctx.contentLanguage;
  return {
    goalUsed: ctx.goal,
    interestsUsed: ctx.interests.slice(0, 2),
    strengthsUsed: ctx.strengths.slice(0, 2),
    supportsUsed: ctx.supports.slice(0, 3),
    avoided: ctx.avoid.slice(0, 3),
    explanation: fill(
      tr(
        "[DEMO] Built around {hero} because of the child's interest; the story models the goal step by step using the selected supports and closes by celebrating a known strength. Avoided items were kept out of the story.",
        "[تجريبي] بُنيت القصة حول {hero} بسبب اهتمام الطفل؛ تُظهر الهدف خطوة بخطوة باستخدام أساليب الدعم المختارة وتنتهي بالاحتفاء بنقطة قوة معروفة. تم إبعاد العناصر التي يجب تجنبها.",
        "[הדגמה] הסיפור נבנה סביב {hero} בזכות תחום העניין של הילד; הוא מדגים את המטרה צעד אחר צעד בעזרת התמיכות שנבחרו ומסתיים בחגיגת חוזקה מוכרת. פריטים להימנעות לא נכללו.",
      )[lang],
      { hero: hero.name[lang] },
    ),
  };
}

function homeActivity(ctx: GenerationContext): ContentBody["optionalHomeActivity"] {
  const lang = ctx.contentLanguage;
  return {
    title: tr("Two more turns at home", "دورتان إضافيتان في البيت", "עוד שני סיבובים בבית")[lang],
    instructions: tr(
      "Before ending a favorite game, say “two more turns”, count down together, then show what comes next. Celebrate the smooth change with a smile.",
      "قبل إنهاء لعبة مفضلة قولوا «دورتان إضافيتان»، عدّوا معاً تنازلياً، ثم أظهروا ما سيأتي بعد ذلك. احتفلوا بالانتقال الهادئ بابتسامة.",
      "לפני שמסיימים משחק אהוב אמרו ״עוד שני סיבובים״, ספרו יחד לאחור, ואז הראו מה בא אחר כך. חגגו את המעבר החלק בחיוך.",
    )[lang],
  };
}

function buildContent(ctx: GenerationContext, variant: number): ContentBody {
  const kind = KIND_BY_TYPE[ctx.format];
  const hero = pickHero(ctx);
  switch (kind) {
    case "story":
      return buildStory(ctx, hero, variant);
    case "routine":
      return buildRoutine(ctx, hero);
    case "activity":
      return buildActivity(ctx, hero);
    case "guide":
      return buildGuide(ctx, hero);
  }
}

function common(ctx: GenerationContext, hero: Hero) {
  return {
    language: ctx.contentLanguage,
    ageBand: ctx.ageBand,
    goalId: ctx.goalId,
    durationMinutes: ctx.durationMinutes,
    teacherRationale: rationale(ctx, hero),
  };
}

function buildStory(ctx: GenerationContext, hero: Hero, variant: number): StoryBody {
  const lang = ctx.contentLanguage;
  const vars = { hero: hero.name[lang], name: ctx.childDisplayName, two: hero.two[lang], one: hero.one[lang], rest: hero.rest[lang] };
  const f = (t: T) => fill(t[lang], vars);
  const cap = (s: string) => (lang === "en" ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const characterIds = ctx.approvedCharacters.slice(0, 1).map((c) => c.id);
  const transition = isTransitionGoal(ctx);
  const supportKey = ctx.supports.find((s) => SUPPORT_LINES[s]) ?? (transition ? "visual_countdown" : "adult_mediation");
  const strength = ctx.strengths[0];

  const opening = [
    tr(
      "{name} and {hero} are playing together. {Hero} is busy {activity}.",
      "{name} و{hero} يلعبان معاً. {hero} مشغول {activity}.",
      "{name} ו{hero} משחקים יחד. {hero} עסוק {activity}.",
    ),
    tr(
      "It is a sunny morning. {Hero} is happily {activity} with {name}.",
      "إنه صباح مشمس. {hero} سعيد {activity} مع {name}.",
      "בוקר שמשי. {hero} שמח {activity} עם {name}.",
    ),
  ][variant % 2]!;

  const scenes: StoryBody["scenes"] = [
    {
      id: "s1",
      narration: cap(fill(opening[lang], { ...vars, Hero: cap(vars.hero), activity: hero.activity[lang] })),
      characterIds,
      visualPrompt: `${hero.name.en} ${hero.activity.en}, warm soft colors, kindergarten setting`,
      illustration: hero.emoji,
    },
  ];

  if (transition) {
    scenes.push(
      {
        id: "s2",
        narration:
          cap(f(SUPPORT_LINES[supportKey]!)) + " " + cap(fill(tr("{hero} looks and listens.", "ينظر {hero} ويستمع.", "{hero} מסתכל ומקשיב.")[lang], vars)),
        characterIds: [],
        visualPrompt: "a friendly picture card showing a timer with two dots",
        illustration: "⏳",
      },
      {
        id: "s3",
        narration: f(
          tr("Let's count together: two… one! {one}… and done!", "لنعدّ معاً: اثنان… واحد! {one}… وانتهينا!", "בואו נספור יחד: שתיים… אחת! {one}… וסיימנו!"),
        ),
        characterIds: [],
        visualPrompt: "two big friendly numbers 2 and 1",
        illustration: "✌️",
      },
      {
        id: "s4",
        narration: cap(f(tr("{hero} {rest}. “All done for now!”", "{hero} {rest}. «انتهيت الآن!»", "{hero} {rest}. ״סיימתי לעכשיו!״"))),
        characterIds: [],
        visualPrompt: `${hero.name.en} resting calmly`,
        illustration: "🅿️",
      },
      {
        id: "s5",
        narration: cap(
          f(
            tr(
              "{hero} checks the next-activity picture: group time with friends!",
              "ينظر {hero} إلى صورة النشاط التالي: وقت الحلقة مع الأصدقاء!",
              "{hero} בודק את תמונת הפעילות הבאה: מפגש עם החברים!",
            ),
          ),
        ),
        characterIds: [],
        visualPrompt: "a picture card of children sitting in a circle",
        illustration: "🖼️",
      },
    );
  } else {
    scenes.push(
      {
        id: "s2",
        narration: cap(
          f(
            tr(
              "Something new is happening today. {hero} feels a little unsure.",
              "شيء جديد يحدث اليوم. يشعر {hero} بقليل من التردد.",
              "משהו חדש קורה היום. {hero} מרגיש קצת לא בטוח.",
            ),
          ),
        ),
        characterIds: [],
        visualPrompt: `${hero.name.en} looking curious`,
        illustration: "🤔",
      },
      {
        id: "s3",
        narration: cap(f(SUPPORT_LINES[supportKey]!)),
        characterIds,
        visualPrompt: "a kind teacher kneeling to child height",
        illustration: "🧑‍🏫",
      },
      {
        id: "s4",
        narration: cap(f(tr("{hero} takes a deep breath and tries.", "يأخذ {hero} نفساً عميقاً ويحاول.", "{hero} נושם עמוק ומנסה."))),
        characterIds: [],
        visualPrompt: `${hero.name.en} taking a deep breath`,
        illustration: "🌬️",
      },
    );
  }

  const choiceQ = transition
    ? tr("How will {hero} go to group time?", "كيف سيذهب {hero} إلى الحلقة؟", "איך {hero} ילך למפגש?")
    : tr("What can {hero} do now?", "ماذا يستطيع {hero} أن يفعل الآن؟", "מה {hero} יכול לעשות עכשיו?");
  const choices = transition
    ? [
        { label: tr("Slowly, like a turtle", "ببطء مثل السلحفاة", "לאט כמו צב")[lang], illustration: "🐢", nextSceneId: "s7" },
        { label: tr("With a friend", "مع صديق", "עם חבר")[lang], illustration: "🤝", nextSceneId: "s7" },
      ]
    : [
        { label: tr("Ask for help", "يطلب المساعدة", "לבקש עזרה")[lang], illustration: "🙋", nextSceneId: "s7" },
        { label: tr("Try again", "يحاول مرة أخرى", "לנסות שוב")[lang], illustration: "💪", nextSceneId: "s7" },
      ];

  scenes.push(
    { id: "s6", narration: cap(f(choiceQ)), characterIds: [], visualPrompt: "two big friendly choice cards", illustration: "👉", choices },
    {
      id: "s7",
      narration: cap(
        f(
          transition
            ? tr(
                "Step by step, {hero} arrives at group time. Friends wave hello!",
                "خطوة خطوة يصل {hero} إلى الحلقة. الأصدقاء يلوّحون مرحّبين!",
                "צעד אחר צעד {hero} מגיע למפגש. החברים מנופפים שלום!",
              )
            : tr("{hero} tries again… and does it!", "يحاول {hero} مرة أخرى… وينجح!", "{hero} מנסה שוב… ומצליח!"),
        ),
      ),
      characterIds,
      visualPrompt: "children greeting each other in a circle",
      illustration: transition ? "⭕" : "🎉",
    },
    {
      id: "s8",
      narration: cap(f(strength && STRENGTH_LINES[strength] ? STRENGTH_LINES[strength]! : DEFAULT_STRENGTH)),
      characterIds,
      visualPrompt: "a warm celebratory ending with stars",
      illustration: "⭐",
    },
  );

  // Difficulty: 1 trims the middle, 3 adds a reflection scene.
  let finalScenes = scenes;
  if (ctx.difficulty <= 1) finalScenes = scenes.filter((s) => s.id !== "s4");
  if (ctx.difficulty >= 3) {
    finalScenes = [
      ...scenes.slice(0, -1),
      {
        id: "s9",
        narration: f(tr("What helped {hero}? Can you remember?", "ما الذي ساعد {hero}؟ هل تتذكر؟", "מה עזר ל{hero}? אתה זוכר?")),
        characterIds: [],
        visualPrompt: "thinking bubble with the picture card",
        illustration: "💭",
      },
      scenes[scenes.length - 1]!,
    ];
  }

  const title = hero.title ? fill(hero.title[lang], vars) : fill(tr("{name} and {hero}", "{name} و{hero}", "{name} ו{hero}")[lang], vars);

  return {
    kind: "story",
    title: cap(title),
    ...common(ctx, hero),
    scenes: finalScenes,
    optionalHomeActivity: homeActivity(ctx),
  };
}

function buildRoutine(ctx: GenerationContext, hero: Hero): RoutineBody {
  const lang = ctx.contentLanguage;
  const steps: [T, T, string][] = [
    [tr("Listen", "استمع", "להקשיב"), tr("Hear the signal.", "اسمع الإشارة.", "שומעים את האות."), "🔔"],
    [tr("Look", "انظر", "להסתכל"), tr("Look at the timer card.", "انظر إلى بطاقة المؤقت.", "מסתכלים על כרטיס הטיימר."), "⏳"],
    [tr("Finish", "أنهِ", "לסיים"), tr("Finish and tidy up.", "أنهِ ورتّب.", "מסיימים ומסדרים."), "🧺"],
    [tr("Next", "التالي", "הבא"), tr("Look at the next picture.", "انظر إلى الصورة التالية.", "מסתכלים על התמונה הבאה."), "🖼️"],
    [tr("Go", "اذهب", "ללכת"), tr("Walk to group time.", "امشِ إلى الحلقة.", "הולכים למפגש."), "⭕"],
  ];
  return {
    kind: "routine",
    title: fill(tr("{name}'s next-step pictures", "صور الخطوة التالية لـ{name}", "תמונות הצעד הבא של {name}")[lang], { name: ctx.childDisplayName }),
    ...common(ctx, hero),
    steps: steps.map(([label, narration, illustration], i) => ({ id: `step${i + 1}`, label: label[lang], narration: narration[lang], illustration })),
  };
}

function buildActivity(ctx: GenerationContext, hero: Hero): ActivityBody {
  const lang = ctx.contentLanguage;
  const vars = { hero: hero.name[lang] };
  return {
    kind: "activity",
    title: fill(tr("What comes next, {hero}?", "ما التالي يا {hero}؟", "מה הלאה, {hero}?")[lang], vars),
    ...common(ctx, hero),
    instructions: tr("Tap the picture you choose.", "المس الصورة التي تختارها.", "גע בתמונה שבחרת.")[lang],
    rounds: [
      {
        id: "r1",
        prompt: fill(
          tr("The timer is finished. What does {hero} do now?", "انتهى المؤقت. ماذا يفعل {hero} الآن؟", "הטיימר נגמר. מה {hero} עושה עכשיו?")[lang],
          vars,
        ),
        options: [
          { id: "a", label: tr("Rest and tidy", "يرتاح ويرتّب", "נח ומסדר")[lang], illustration: "🧺", isPreferred: true },
          { id: "b", label: tr("Keep playing", "يكمل اللعب", "ממשיך לשחק")[lang], illustration: hero.emoji, isPreferred: false },
        ],
        encouragement: tr("Great thinking!", "تفكير رائع!", "חשיבה נהדרת!")[lang],
      },
      {
        id: "r2",
        prompt: tr("Which picture shows group time?", "أي صورة تُظهر وقت الحلقة؟", "איזו תמונה מראה מפגש?")[lang],
        options: [
          { id: "a", label: tr("Group time", "الحلقة", "מפגש")[lang], illustration: "⭕", isPreferred: true },
          { id: "b", label: tr("Bath", "الحمّام", "אמבטיה")[lang], illustration: "🛁", isPreferred: false },
          { id: "c", label: tr("Sleep", "النوم", "שינה")[lang], illustration: "🌙", isPreferred: false },
        ],
        encouragement: tr("You looked carefully!", "نظرت بانتباه!", "הסתכלת בעיון!")[lang],
      },
      {
        id: "r3",
        prompt: tr("How do you feel when you know what comes next?", "كيف تشعر عندما تعرف ما التالي؟", "איך אתה מרגיש כשאתה יודע מה הלאה?")[lang],
        options: [
          { id: "a", label: tr("Calm", "هادئ", "רגוע")[lang], illustration: "😌", isPreferred: true },
          { id: "b", label: tr("Happy", "سعيد", "שמח")[lang], illustration: "😊", isPreferred: true },
        ],
        encouragement: tr("Thank you for sharing!", "شكراً لمشاركتك!", "תודה ששיתפת!")[lang],
      },
    ],
  };
}

function buildGuide(ctx: GenerationContext, hero: Hero): GuideBody {
  const lang = ctx.contentLanguage;
  const parent = ctx.format === "PARENT_HOME_ACTIVITY";
  const steps: [T, T, string][] = parent
    ? [
        [
          tr("Warn early", "نبّهوا مبكراً", "הכינו מראש"),
          tr(
            "Two minutes before the end of play, say “two more turns”.",
            "قبل دقيقتين من نهاية اللعب قولوا «دورتان إضافيتان».",
            "שתי דקות לפני סוף המשחק אמרו ״עוד שני סיבובים״.",
          ),
          "🔔",
        ],
        [
          tr("Count together", "عدّوا معاً", "ספרו יחד"),
          tr("Count down together: two… one… done!", "عدّوا تنازلياً معاً: اثنان… واحد… انتهينا!", "ספרו יחד לאחור: שתיים… אחת… סיימנו!"),
          "✌️",
        ],
        [
          tr("Show what's next", "أظهروا ما التالي", "הראו מה הלאה"),
          tr("Show or name the next activity.", "أظهروا النشاط التالي أو سمّوه.", "הראו או אמרו מה הפעילות הבאה."),
          "🖼️",
        ],
        [
          tr("Celebrate", "احتفلوا", "חגגו"),
          tr("Smile and name the success: “You moved so smoothly!”", "ابتسموا وسمّوا النجاح: «انتقلت بسلاسة!»", "חייכו ותארו את ההצלחה: ״עברת כל כך יפה!״"),
          "⭐",
        ],
      ]
    : [
        [
          tr("Gather", "التجمّع", "התכנסות"),
          tr("Invite the children to stand in a circle.", "ادعُ الأطفال للوقوف في دائرة.", "הזמינו את הילדים לעמוד במעגל."),
          "⭕",
        ],
        [
          tr("Move", "تحرّك", "תנועה"),
          tr(`Move like ${hero.name.en} while music plays.`, `تحرّكوا مثل ${hero.name.ar} أثناء الموسيقى.`, `זוזו כמו ${hero.name.he} בזמן המוזיקה.`),
          hero.emoji,
        ],
        [
          tr("Freeze", "تجمّد", "קפאו"),
          tr(
            "When the music stops, freeze and look at the picture card.",
            "عندما تتوقف الموسيقى تجمّدوا وانظروا إلى البطاقة.",
            "כשהמוזיקה נעצרת קפאו והסתכלו על הכרטיס.",
          ),
          "🖼️",
        ],
        [
          tr("Transition", "انتقال", "מעבר"),
          tr("Walk calmly to the next activity shown on the card.", "امشوا بهدوء إلى النشاط الظاهر على البطاقة.", "לכו ברוגע לפעילות שמופיעה בכרטיס."),
          "🚶",
        ],
      ];
  return {
    kind: "guide",
    title: parent
      ? tr("Smooth changes at home", "انتقالات هادئة في البيت", "מעברים חלקים בבית")[lang]
      : fill(tr("Move like {hero}", "تحرّك مثل {hero}", "לזוז כמו {hero}")[lang], { hero: hero.name[lang] }),
    ...common(ctx, hero),
    audience: parent ? "parent" : "teacher",
    materials: parent ? [] : [tr("Music player", "مشغّل موسيقى", "נגן מוזיקה")[lang], tr("Picture cards", "بطاقات مصوّرة", "כרטיסי תמונות")[lang]],
    steps: steps.map(([label, instructions, illustration], i) => ({ id: `step${i + 1}`, label: label[lang], instructions: instructions[lang], illustration })),
  };
}

/** Keyword-based attribute suggestions used by the demo provider. */
function suggestFromText(text: string) {
  const t = text.toLowerCase();
  const rules: { re: RegExp; category: string; value: string; reason: string }[] = [
    { re: /countdown|timer|عد تنازلي|مؤقت|ספירה לאחור|טיימר/, category: "SUPPORT", value: "visual_countdown", reason: "Countdown mentioned as helpful" },
    { re: /block|tower|lego|مكعب|برج|קובי|מגדל/, category: "INTEREST", value: "building", reason: "Engaged with building materials" },
    { re: /car|truck|excavator|vehicle|سيار|شاحن|حفّار|حفار|מכונית|משאית|מחפר/, category: "INTEREST", value: "vehicles", reason: "Vehicles mentioned" },
    { re: /noise|loud|ضجيج|صوت عال|רעש/, category: "TRIGGER", value: "loud_surprise_sounds", reason: "Reaction to loud sounds" },
    { re: /song|music|أغني|موسيق|שיר|מוזיק/, category: "INTEREST", value: "music", reason: "Music mentioned" },
    { re: /long time|kept trying|persist|لفترة طويلة|استمر|זמן רב|התמיד/, category: "STRENGTH", value: "persistence", reason: "Sustained effort noted" },
    { re: /warning|prepar|تنبيه|تحضير|הכנה|התראה/, category: "SUPPORT", value: "advance_warning", reason: "Preparation mentioned" },
    { re: /picture|card|صورة|بطاقة|תמונה|כרטיס/, category: "SUPPORT", value: "visual_cue", reason: "Visual cue mentioned" },
  ];
  return {
    suggestions: rules
      .filter((r) => r.re.test(t))
      .slice(0, 6)
      .map(({ category, value, reason }) => ({ category, value, reason: `[DEMO] ${reason}` })),
  };
}
