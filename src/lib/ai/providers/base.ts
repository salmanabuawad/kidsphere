import { AppError } from "@/lib/errors";
import { repairPrompt } from "../prompts";
import type { ProviderName, RawCompletion, StructuredRequest, StructuredResult } from "../types";

export type CompletionCall = {
  system: string;
  prompt: string;
  jsonSchema: Record<string, unknown>;
  input: unknown;
  operation: StructuredRequest<unknown>["operation"];
  signal: AbortSignal;
  isRepair: boolean;
};

/**
 * Shared structured-output pipeline: call → parse → validate → repair once →
 * validate again → fail safely. Providers only implement `complete`.
 */
export abstract class AIProvider {
  abstract readonly name: ProviderName;
  abstract readonly model: string;
  readonly isDemo: boolean = false;

  protected abstract complete(call: CompletionCall): Promise<RawCompletion>;

  async generateStructuredContent<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);
    let inputTokens = 0;
    let outputTokens = 0;

    const run = async (prompt: string, isRepair: boolean) => {
      try {
        const res = await this.complete({
          system: req.system,
          prompt,
          jsonSchema: req.jsonSchema,
          input: req.input,
          operation: req.operation,
          signal: controller.signal,
          isRepair,
        });
        inputTokens += res.inputTokens ?? 0;
        outputTokens += res.outputTokens ?? 0;
        return res.json;
      } catch (e) {
        if (e instanceof AppError) throw e;
        if (controller.signal.aborted) throw new AppError("AI_TIMEOUT", "Content generation took too long. Please try again.");
        throw new AppError("AI_UNAVAILABLE", "The AI service is unavailable right now. Please try again shortly.");
      }
    };

    const check = (json: unknown): { ok: true; value: T } | { ok: false; issues: string[] } => {
      const parsed = req.schema.safeParse(json);
      if (!parsed.success) {
        return { ok: false, issues: parsed.error.issues.slice(0, 20).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
      }
      const semantic = req.validate?.(parsed.data) ?? [];
      return semantic.length ? { ok: false, issues: semantic } : { ok: true, value: parsed.data };
    };

    try {
      const first = await run(req.prompt, false);
      let result = check(first);
      let repaired = false;
      if (!result.ok) {
        repaired = true;
        const second = await run(repairPrompt(JSON.stringify(first ?? null), result.issues), true);
        result = check(second);
      }
      if (!result.ok) {
        throw new AppError("AI_INVALID_OUTPUT", "The generated content did not pass safety and format checks. Nothing was saved — please try again.", {
          issues: result.issues.slice(0, 5),
        });
      }
      return {
        value: result.value,
        provider: this.name,
        model: this.model,
        repaired,
        inputTokens: inputTokens || undefined,
        outputTokens: outputTokens || undefined,
        durationMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Parse model text that should be JSON (tolerates fenced code blocks). */
export function parseJsonText(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
