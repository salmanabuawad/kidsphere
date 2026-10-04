import type { ContentType, Locale } from "@prisma/client";
import type { ZodType } from "zod";

export type ProviderName = "anthropic" | "openai" | "demo";

export type AIOperation = "generate_content" | "regenerate_content" | "regenerate_scene" | "suggest_attributes";

/**
 * The ONLY child data that may be sent to an AI provider for content
 * generation. Built exclusively by ContentGenerationContextBuilder.
 */
export type GenerationContext = {
  childDisplayName: string;
  ageBand: string;
  contentLanguage: Locale;
  goalId: string;
  goal: string;
  successIndicator: string;
  interests: string[];
  strengths: string[];
  supports: string[];
  avoid: string[];
  approvedCharacters: { id: string; label: string; relation: string }[];
  format: ContentType;
  durationMinutes: number;
  theme: string | null;
  /** 1 = simplest … 3 = slightly harder. */
  difficulty: number;
  teacherInstruction: string | null;
};

export type StructuredRequest<T> = {
  operation: AIOperation;
  system: string;
  prompt: string;
  schema: ZodType<T>;
  jsonSchema: Record<string, unknown>;
  /** Structured input for the deterministic demo provider (never logged). */
  input: unknown;
  /** Extra semantic validation; return human-readable issues. */
  validate?: (value: T) => string[];
  timeoutMs: number;
};

export type RawCompletion = {
  json: unknown;
  inputTokens?: number;
  outputTokens?: number;
};

export type StructuredResult<T> = {
  value: T;
  provider: ProviderName;
  model: string;
  repaired: boolean;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
};
