import { describe, expect, it } from "vitest";
import type { ContentType, Locale } from "@prisma/client";
import { AIProvider, type CompletionCall } from "@/lib/ai/providers/base";
import { DemoProvider } from "@/lib/ai/providers/demo";
import { childSafetyIssues, contentBodySchema, schemaForType, storyBodySchema, toProviderJsonSchema, type ContentBody } from "@/lib/ai/schemas";
import { generationPrompt, SYSTEM_PROMPT } from "@/lib/ai/prompts";
import type { GenerationContext, RawCompletion } from "@/lib/ai/types";

const ctx = (format: ContentType, lang: Locale = "en", over: Partial<GenerationContext> = {}): GenerationContext => ({
  childDisplayName: "Adam",
  ageBand: "4-5",
  contentLanguage: lang,
  goalId: "goal_1",
  goal: "Move from a preferred activity to group time after one reminder and a visual cue.",
  successIndicator: "3 of 5",
  interests: ["vehicles", "building"],
  strengths: ["persistence"],
  supports: ["visual_countdown", "advance_warning"],
  avoid: ["unexpected_transition"],
  approvedCharacters: [],
  format,
  durationMinutes: 6,
  theme: null,
  difficulty: 2,
  teacherInstruction: null,
  ...over,
});

/** Scripted provider: returns the queued outputs in order. */
class ScriptedProvider extends AIProvider {
  readonly name = "demo" as const;
  readonly model = "scripted";
  calls: CompletionCall[] = [];
  constructor(private outputs: unknown[]) {
    super();
  }
  protected async complete(call: CompletionCall): Promise<RawCompletion> {
    this.calls.push(call);
    return { json: this.outputs.shift() ?? null };
  }
}

async function demoBody(format: ContentType, lang: Locale = "en", over: Partial<GenerationContext> = {}) {
  const c = ctx(format, lang, over);
  const r = await new DemoProvider().generateStructuredContent<ContentBody>({
    operation: "generate_content",
    system: SYSTEM_PROMPT,
    prompt: generationPrompt(c),
    schema: schemaForType(format) as never,
    jsonSchema: {},
    input: { op: "generate", ctx: c },
    validate: (b) => childSafetyIssues(b, format),
    timeoutMs: 5000,
  });
  return r;
}

describe("AI response validation", () => {
  it("accepts valid output without repair", async () => {
    const valid = (await demoBody("INTERACTIVE_STORY")).value;
    const p = new ScriptedProvider([valid]);
    const r = await p.generateStructuredContent({
      operation: "generate_content",
      system: "s",
      prompt: "p",
      schema: storyBodySchema,
      jsonSchema: {},
      input: null,
      timeoutMs: 1000,
    });
    expect(r.repaired).toBe(false);
    expect(p.calls).toHaveLength(1);
  });

  it("repairs malformed output once", async () => {
    const valid = (await demoBody("INTERACTIVE_STORY")).value;
    const p = new ScriptedProvider([{ kind: "story", title: "" }, valid]);
    const r = await p.generateStructuredContent({
      operation: "generate_content",
      system: "s",
      prompt: "p",
      schema: storyBodySchema,
      jsonSchema: {},
      input: null,
      timeoutMs: 1000,
    });
    expect(r.repaired).toBe(true);
    expect(p.calls).toHaveLength(2);
    expect(p.calls[1]!.isRepair).toBe(true);
    expect(p.calls[1]!.prompt).toMatch(/did not match/);
  });

  it("fails safely when output is still invalid after one repair", async () => {
    const p = new ScriptedProvider([{ nope: true }, "still wrong"]);
    await expect(
      p.generateStructuredContent({
        operation: "generate_content",
        system: "s",
        prompt: "p",
        schema: storyBodySchema,
        jsonSchema: {},
        input: null,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT" });
    expect(p.calls).toHaveLength(2);
  });

  it("maps provider failures to AI_UNAVAILABLE and slow calls to AI_TIMEOUT", async () => {
    class Failing extends ScriptedProvider {
      protected override async complete(): Promise<RawCompletion> {
        throw new Error("network down");
      }
    }
    await expect(
      new Failing([]).generateStructuredContent({
        operation: "generate_content",
        system: "s",
        prompt: "p",
        schema: storyBodySchema,
        jsonSchema: {},
        input: null,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
    });
    class Slow extends ScriptedProvider {
      protected override async complete(call: CompletionCall): Promise<RawCompletion> {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 2000);
          call.signal.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new Error("aborted"));
          });
        });
        return { json: null };
      }
    }
    await expect(
      new Slow([]).generateStructuredContent({
        operation: "generate_content",
        system: "s",
        prompt: "p",
        schema: storyBodySchema,
        jsonSchema: {},
        input: null,
        timeoutMs: 50,
      }),
    ).rejects.toMatchObject({
      code: "AI_TIMEOUT",
    });
  });

  it("flags deficit labels, diagnoses and links in child-facing text", async () => {
    const body = (await demoBody("INTERACTIVE_STORY")).value as Extract<ContentBody, { kind: "story" }>;
    const bad = { ...body, scenes: body.scenes.map((s, i) => (i === 0 ? { ...s, narration: "Adam has a problem with ADHD. Visit www.example.com" } : s)) };
    const issues = childSafetyIssues(bad, "INTERACTIVE_STORY");
    expect(issues.join(" ")).toMatch(/problem/);
    expect(issues.join(" ")).toMatch(/adhd/);
    expect(issues.join(" ")).toMatch(/links/);
  });

  it("requires choices in interactive stories and valid choice targets", async () => {
    const body = (await demoBody("INTERACTIVE_STORY")).value as Extract<ContentBody, { kind: "story" }>;
    const noChoices = { ...body, scenes: body.scenes.map((s) => ({ ...s, choices: undefined })) };
    expect(childSafetyIssues(noChoices, "INTERACTIVE_STORY")).toContain("an interactive story needs at least one scene with choices");
    const broken = { ...body, scenes: body.scenes.map((s) => (s.choices ? { ...s, choices: s.choices.map((c) => ({ ...c, nextSceneId: "missing" })) } : s)) };
    expect(childSafetyIssues(broken, "INTERACTIVE_STORY").some((i) => i.includes("unknown scene"))).toBe(true);
  });

  it("produces provider JSON schemas without length constraints but with closed objects", () => {
    const js = JSON.stringify(toProviderJsonSchema(storyBodySchema));
    expect(js).not.toMatch(/maxLength|minItems/);
    expect(js).toMatch(/"additionalProperties":false/);
  });
});

describe("DEMO provider", () => {
  const types: ContentType[] = [
    "INTERACTIVE_STORY",
    "STORY",
    "SOCIAL_STORY",
    "VISUAL_ROUTINE",
    "CHOICE_ACTIVITY",
    "MATCHING_ACTIVITY",
    "SIMPLE_GAME",
    "MOVEMENT_ACTIVITY",
    "ROLE_PLAY_ACTIVITY",
    "PARENT_HOME_ACTIVITY",
    "TEACHER_DISCUSSION_ACTIVITY",
  ];
  for (const lang of ["ar", "he", "en"] as const) {
    it(`generates valid, safe content for every type in ${lang}`, async () => {
      for (const t of types) {
        const r = await demoBody(t, lang);
        expect(contentBodySchema.safeParse(r.value).success).toBe(true);
        expect(childSafetyIssues(r.value, t)).toEqual([]);
        expect(r.repaired).toBe(false);
      }
    });
  }
  it("builds the Adam excavator story with countdown, parking, next picture and a choice", async () => {
    const body = (await demoBody("INTERACTIVE_STORY")).value as Extract<ContentBody, { kind: "story" }>;
    expect(body.title).toBe("Adam and the Excavator's Last Two Scoops");
    const text = body.scenes.map((s) => s.narration).join(" ");
    expect(text).toMatch(/two scoops left/i);
    expect(text).toMatch(/two… one/);
    expect(text).toMatch(/parks/);
    expect(text).toMatch(/next-activity picture/);
    expect(body.scenes.some((s) => (s.choices?.length ?? 0) >= 2)).toBe(true);
    expect(body.teacherRationale.supportsUsed).toContain("visual_countdown");
  });
  it("changes length with difficulty", async () => {
    const easy = (await demoBody("INTERACTIVE_STORY", "en", { difficulty: 1 })).value as Extract<ContentBody, { kind: "story" }>;
    const hard = (await demoBody("INTERACTIVE_STORY", "en", { difficulty: 3 })).value as Extract<ContentBody, { kind: "story" }>;
    expect(hard.scenes.length).toBeGreaterThan(easy.scenes.length);
  });
});
