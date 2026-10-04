import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@/lib/errors";
import { AIProvider, type CompletionCall, parseJsonText } from "./base";
import type { RawCompletion } from "../types";

export class AnthropicProvider extends AIProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    super();
    // Retries are handled by our single repair pass; keep SDK retries low so the
    // request timeout stays meaningful.
    this.client = new Anthropic({ apiKey, maxRetries: 1 });
  }

  protected async complete(call: CompletionCall): Promise<RawCompletion> {
    const response = await this.client.beta.messages.create(
      {
        model: this.model,
        max_tokens: 16000,
        // Server-side refusal fallback, routed by refusal category.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: call.system,
        messages: [{ role: "user", content: call.prompt }],
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: call.jsonSchema },
        },
      },
      { signal: call.signal },
    );

    if (response.stop_reason === "refusal") {
      throw new AppError("AI_UNAVAILABLE", "The AI service declined this request. Try adjusting the theme or instruction.");
    }
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return {
      json: parseJsonText(text),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}
