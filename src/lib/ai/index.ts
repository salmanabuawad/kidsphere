import { AppError } from "@/lib/errors";
import { AnthropicProvider } from "./providers/anthropic";
import type { AIProvider } from "./providers/base";
import { DemoProvider } from "./providers/demo";
import { OpenAIProvider } from "./providers/openai";
import type { ProviderName } from "./types";

export type { AIProvider } from "./providers/base";

const DEFAULT_MODELS: Record<Exclude<ProviderName, "demo">, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-5",
};

export type ProviderStatus = {
  name: ProviderName;
  configured: boolean;
  model: string;
};

/** Which providers are usable in this deployment (never exposes keys). */
export function providerStatuses(): ProviderStatus[] {
  return [
    { name: "anthropic", configured: !!process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic },
    { name: "openai", configured: !!process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || DEFAULT_MODELS.openai },
    { name: "demo", configured: demoAllowed(), model: "kidsphere-demo-1" },
  ];
}

function demoAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_AI_IN_PRODUCTION === "true";
}

/**
 * Resolve the provider: organization override → AI_DEFAULT_PROVIDER → first
 * configured real provider → DEMO (development only).
 */
export function resolveProvider(orgOverride?: string | null): AIProvider {
  const wanted = (orgOverride || process.env.AI_DEFAULT_PROVIDER || "").toLowerCase();
  const make = (name: string): AIProvider | null => {
    if (name === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      return new AnthropicProvider(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic);
    }
    if (name === "openai" && process.env.OPENAI_API_KEY) {
      return new OpenAIProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || DEFAULT_MODELS.openai);
    }
    if (name === "demo" && demoAllowed()) return new DemoProvider();
    return null;
  };
  const chosen = (wanted && make(wanted)) || make("anthropic") || make("openai") || make("demo");
  if (!chosen) {
    throw new AppError("AI_UNAVAILABLE", "No AI provider is configured. Ask an administrator to add an API key.");
  }
  return chosen;
}

export function aiTimeoutMs(): number {
  const v = Number(process.env.AI_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 60_000;
}
