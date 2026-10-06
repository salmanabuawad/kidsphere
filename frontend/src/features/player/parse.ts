import {
  GAME_TEMPLATES,
  type Activity,
  type CategorizeGame,
  type Choice,
  type ChoiceGame,
  type ChoiceTemplate,
  type Game,
  type GameTemplate,
  type MatchPairsGame,
  type Round,
  type SequenceGame,
  type Story,
  type StoryBuilderGame,
  type VideoPlan,
  type VideoScene,
} from "./types";

/**
 * Runtime validation for content coming from the API (or a teacher edit).
 * Mirrors the limits and semantic checks of backend/app/ai/schemas.py.
 * Each parser returns a clean, typed copy (unknown keys dropped, strings
 * trimmed) or null when the data is malformed. Never throws.
 */

function fail(msg: string): never {
  throw new Error(msg);
}

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(`${what}: expected an object`);
  return v as Obj;
}

/** Length in code points, like Python's len(). */
const len = (s: string) => [...s].length;

function text(v: unknown, max: number, what: string): string {
  if (typeof v !== "string") fail(`${what}: expected text`);
  const s = v.trim();
  if (!s || len(s) > max) fail(`${what}: empty or too long`);
  return s;
}

function optText(v: unknown, max: number, what: string): string | null {
  return v === undefined || v === null ? null : text(v, max, what);
}

function list<T>(v: unknown, min: number, max: number, what: string, item: (x: unknown, i: number) => T): T[] {
  if (!Array.isArray(v)) fail(`${what}: expected a list`);
  if (v.length < min || v.length > max) fail(`${what}: expected ${min}-${max} entries`);
  return v.map(item);
}

function int(v: unknown, min: number, max: number, what: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) fail(`${what}: out of range`);
  return v;
}

const emoji = (v: unknown, what: string) => optText(v, 16, what);
const KEY_RE = /^[a-z0-9_]{1,40}$/;

function unique(labels: string[], what: string) {
  const seen = labels.map((s) => s.trim().toLowerCase());
  if (new Set(seen).size !== seen.length) fail(`${what} must be unique`);
}

function choice(v: unknown, what = "choice"): Choice {
  const o = obj(v, what);
  const e = emoji(o.emoji, `${what}.emoji`);
  return e ? { label: text(o.label, 80, `${what}.label`), emoji: e } : { label: text(o.label, 80, `${what}.label`) };
}

function safely<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    // Invalid data (or anything unexpected in it): the caller shows a friendly fallback.
    return null;
  }
}

// ----------------------------------------------------------------------------- story / activity / video

export function parseStory(data: unknown): Story | null {
  return safely(() => {
    const o = obj(data, "story");
    const story = list(o.story, 2, 6, "story", (p) => text(p, 600, "paragraph"));
    const out: Story = {
      title: text(o.title, 120, "title"),
      goal: text(o.goal, 300, "goal"),
      story,
      questions: list(o.questions, 2, 4, "questions", (q) => text(q, 200, "question")),
      teacher_note: text(o.teacher_note, 800, "teacher_note"),
    };
    if (o.illustrations !== undefined && o.illustrations !== null) {
      const ill = list(o.illustrations, 0, 6, "illustrations", (e) => text(e, 16, "illustration"));
      // One emoji per paragraph; extras are dropped (as the backend does).
      out.illustrations = ill.slice(0, story.length);
    }
    return out;
  });
}

export function parseActivity(data: unknown): Activity | null {
  return safely(() => {
    const o = obj(data, "activity");
    return {
      title: text(o.title, 120, "title"),
      goal: text(o.goal, 300, "goal"),
      duration_minutes: int(o.duration_minutes, 3, 60, "duration_minutes"),
      materials: list(o.materials, 0, 10, "materials", (m) => text(m, 120, "material")),
      instructions: list(o.instructions, 2, 10, "instructions", (s) => text(s, 400, "instruction")),
      what_to_observe: list(o.what_to_observe, 1, 6, "what_to_observe", (s) => text(s, 300, "what_to_observe")),
      adaptation: text(o.adaptation, 600, "adaptation"),
    };
  });
}

export function parseVideoPlan(data: unknown): VideoPlan | null {
  return safely(() => {
    const o = obj(data, "video");
    return {
      title: text(o.title, 120, "title"),
      learning_goal: text(o.learning_goal, 300, "learning_goal"),
      script: text(o.script, 2500, "script"),
      scenes: list(o.scenes, 2, 8, "scenes", (s) => {
        const sc = obj(s, "scene");
        const scene: VideoScene = {
          description: text(sc.description, 300, "scene.description"),
          narration: text(sc.narration, 400, "scene.narration"),
          visual_prompt: text(sc.visual_prompt, 300, "scene.visual_prompt"),
        };
        const e = emoji(sc.emoji, "scene.emoji");
        return e ? { ...scene, emoji: e } : scene;
      }),
      duration_seconds: int(o.duration_seconds, 30, 90, "duration_seconds"),
    };
  });
}

// ----------------------------------------------------------------------------- games

function base(o: Obj) {
  const intro = optText(o.intro, 300, "intro");
  return intro ? { title: text(o.title, 120, "title"), intro } : { title: text(o.title, 120, "title") };
}

function round(v: unknown): Round {
  const o = obj(v, "round");
  const choices = list(o.choices, 2, 4, "choices", (c) => choice(c));
  unique(
    choices.map((c) => c.label),
    "choice labels",
  );
  const a = o.correct_or_preferred_answer;
  let answer: number | null = null;
  if (a !== undefined && a !== null) {
    if (typeof a !== "number" || !Number.isInteger(a) || a < 0 || a >= choices.length)
      fail("correct_or_preferred_answer must be the index of one of the choices");
    answer = a;
  }
  return { question: text(o.question, 200, "question"), choices, correct_or_preferred_answer: answer, explanation: text(o.explanation, 300, "explanation") };
}

function choiceGame<T extends ChoiceTemplate>(o: Obj, template: T): ChoiceGame<T> {
  return { template, ...base(o), rounds: list(o.rounds, 1, 5, "rounds", round) };
}

function matchPairs(o: Obj): MatchPairsGame {
  const pairs = list(o.pairs, 2, 6, "pairs", (p) => {
    const po = obj(p, "pair");
    return { left: choice(po.left, "pair.left"), right: choice(po.right, "pair.right") };
  });
  unique(
    pairs.map((p) => p.left.label),
    "left labels",
  );
  unique(
    pairs.map((p) => p.right.label),
    "right labels",
  );
  return { template: "match_pairs", ...base(o), pairs };
}

function sequence(o: Obj): SequenceGame {
  const items = list(o.items, 3, 6, "items", (c) => choice(c, "item"));
  unique(
    items.map((i) => i.label),
    "items",
  );
  return { template: "sequence", ...base(o), items };
}

function categorize(o: Obj): CategorizeGame {
  const categories = list(o.categories, 2, 3, "categories", (c) => {
    const co = obj(c, "category");
    const key = text(co.key, 40, "category.key");
    if (!KEY_RE.test(key)) fail("category.key: bad format");
    const e = emoji(co.emoji, "category.emoji");
    const label = text(co.label, 60, "category.label");
    return e ? { key, label, emoji: e } : { key, label };
  });
  const items = list(o.items, 4, 8, "items", (i) => {
    const io = obj(i, "item");
    return { ...choice(io, "item"), category: text(io.category, 40, "item.category") };
  });
  const keys = categories.map((c) => c.key);
  unique(keys, "category keys");
  unique(
    categories.map((c) => c.label),
    "category labels",
  );
  unique(
    items.map((i) => i.label),
    "items",
  );
  if (items.some((i) => !keys.includes(i.category))) fail("items use unknown categories");
  if (keys.some((k) => !items.some((i) => i.category === k))) fail("every category needs at least one item");
  return { template: "categorize", ...base(o), categories, items };
}

function storyBuilder(o: Obj): StoryBuilderGame {
  const steps = list(o.steps, 3, 5, "steps", (s) => {
    const so = obj(s, "step");
    const choices = list(so.choices, 2, 4, "choices", (c) => choice(c));
    unique(
      choices.map((c) => c.label),
      "choice labels",
    );
    return { prompt: text(so.prompt, 200, "step.prompt"), choices };
  });
  return { template: "story_builder", ...base(o), steps, closing_prompt: text(o.closing_prompt, 200, "closing_prompt") };
}

export function isGameTemplate(v: unknown): v is GameTemplate {
  return typeof v === "string" && (GAME_TEMPLATES as readonly string[]).includes(v);
}

/** The typed game, or null for malformed data (unknown template, answer out of range, missing categories…). */
export function parseGame(data: unknown): Game | null {
  return safely<Game>(() => {
    const o = obj(data, "game");
    const t = o.template;
    if (!isGameTemplate(t)) fail("unknown template");
    switch (t) {
      case "multiple_choice":
      case "emotion_choice":
      case "what_happens_next":
        return choiceGame(o, t);
      case "match_pairs":
        return matchPairs(o);
      case "sequence":
        return sequence(o);
      case "categorize":
        return categorize(o);
      case "story_builder":
        return storyBuilder(o);
    }
  });
}
