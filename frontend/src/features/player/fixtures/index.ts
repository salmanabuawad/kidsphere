import type { AppLocale } from "@/i18n/config";
import type { Activity, Game, GameTemplate, Story, VideoPlan } from "../types";
import ar from "./ar.json";
import en from "./en.json";
import he from "./he.json";
import malformed from "./malformed.json";

/**
 * Sample content for every kind (story, activity, video plan and the 7 game
 * templates) in en, ar and he, valid against backend/app/ai/schemas.py.
 * Used by tests and handy for previews; not exported from the feature index.
 */
export type PlayerFixture = {
  language: AppLocale;
  story: Story;
  activity: Activity;
  video: VideoPlan;
  games: Record<GameTemplate, Game>;
};

export const PLAYER_FIXTURES = { en, ar, he } as unknown as Record<AppLocale, PlayerFixture>;

/** Broken game payloads that must render the friendly fallback. */
export const MALFORMED_GAMES = malformed as Record<string, unknown>;
