/**
 * Content shapes rendered by the player and the game templates. They mirror the
 * backend Pydantic output models in backend/app/ai/schemas.py exactly
 * (StoryOut, ActivityOut, the GameOut union discriminated on `template`,
 * VideoPlanOut). All values are plain text: nothing is ever rendered as HTML.
 */

/**
 * A card with a short label and an optional emoji picture. `photo` is added on the client
 * only (cast.tsx) when the label names a person of the child's life who has a photo.
 */
export type Choice = { label: string; emoji?: string | null; photo?: string | null };

/** StoryOut: 2–6 short paragraphs, 2–4 discussion questions, one optional emoji per paragraph. */
export type Story = {
  title: string;
  goal: string;
  story: string[];
  questions: string[];
  teacher_note: string;
  illustrations?: string[] | null;
};

/** ActivityOut: a teacher-led, real-world activity. */
export type Activity = {
  title: string;
  goal: string;
  duration_minutes: number;
  materials: string[];
  instructions: string[];
  what_to_observe: string[];
  adaptation: string;
};

/** `emoji` pictures the scene in the narrated slideshow (plans made before it have none). */
export type VideoScene = { description: string; narration: string; visual_prompt: string; emoji?: string | null };

/** VideoPlanOut: the script and scene list (30–90 seconds). */
export type VideoPlan = {
  title: string;
  learning_goal: string;
  script: string;
  scenes: VideoScene[];
  duration_seconds: number;
};

/** generated_content.video_status */
export type VideoStatus = "script_ready" | "generating" | "ready" | "failed";

// ----------------------------------------------------------------------------- games

export const GAME_TEMPLATES = [
  "multiple_choice",
  "match_pairs",
  "sequence",
  "emotion_choice",
  "categorize",
  "what_happens_next",
  "story_builder",
] as const;
export type GameTemplate = (typeof GAME_TEMPLATES)[number];

export const CHOICE_TEMPLATES = ["multiple_choice", "emotion_choice", "what_happens_next"] as const;
export type ChoiceTemplate = (typeof CHOICE_TEMPLATES)[number];

/** One question with 2–4 choices. `correct_or_preferred_answer` is a choice index, or null when every answer is welcome. */
export type Round = {
  question: string;
  choices: Choice[];
  correct_or_preferred_answer: number | null;
  explanation: string;
};

type GameBase = { title: string; intro?: string | null };

export type ChoiceGame<T extends ChoiceTemplate = ChoiceTemplate> = GameBase & { template: T; rounds: Round[] };
export type MultipleChoiceGame = ChoiceGame<"multiple_choice">;
export type EmotionChoiceGame = ChoiceGame<"emotion_choice">;
export type WhatHappensNextGame = ChoiceGame<"what_happens_next">;

export type Pair = { left: Choice; right: Choice };
export type MatchPairsGame = GameBase & { template: "match_pairs"; pairs: Pair[] };

/** `items` are in the correct order; the player shuffles them. */
export type SequenceGame = GameBase & { template: "sequence"; items: Choice[] };

export type Category = { key: string; label: string; emoji?: string | null; photo?: string | null };
export type CategorizeItem = Choice & { category: string };
export type CategorizeGame = GameBase & { template: "categorize"; categories: Category[]; items: CategorizeItem[] };

export type StoryStep = { prompt: string; choices: Choice[] };
/** Choices have no correct answer; the child tells the story at the end. */
export type StoryBuilderGame = GameBase & { template: "story_builder"; steps: StoryStep[]; closing_prompt: string };

export type Game =
  | MultipleChoiceGame
  | EmotionChoiceGame
  | WhatHappensNextGame
  | MatchPairsGame
  | SequenceGame
  | CategorizeGame
  | StoryBuilderGame;
