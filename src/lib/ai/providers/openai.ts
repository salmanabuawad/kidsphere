import OpenAI from "openai";
import { AIProvider, type CompletionCall, parseJsonText } from "./base";
import type { RawCompletion } from "../types";

export class OpenAIProvider extends AIProvider {
  readonly name = "openai" as const;
  private client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    super();
    this.client = new OpenAI({ apiKey, maxRetries: 1 });
  }

  protected async complete(call: CompletionCall): Promise<RawCompletion> {
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content: call.prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "kidsphere_output", schema: call.jsonSchema, strict: false },
        },
      },
      { signal: call.signal },
    );
    const text = response.choices[0]?.message?.content ?? "";
    return {
      json: parseJsonText(text),
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    };
  }
}
