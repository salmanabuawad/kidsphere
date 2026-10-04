import { describe, expect, it } from "vitest";
import { sanitize } from "@/lib/analytics";
import { createTranslator } from "@/lib/i18n/translate";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import { dirOf, isLocale } from "@/lib/i18n/config";
import { generateSchema, quickObservationSchema, setLocaleSchema, updateGoalSchema, updateMeSchema } from "@/server/validators";
import { sniffMatches } from "@/lib/storage";
import { normalizeAnswer } from "@/server/services/questionnaires";
import { findQuestion } from "@/features/questionnaires/definition";

describe("validation", () => {
  it("rejects invalid locales", () => {
    expect(setLocaleSchema.safeParse({ locale: "fr" }).success).toBe(false);
    expect(setLocaleSchema.safeParse({ locale: "ar" }).success).toBe(true);
    expect(isLocale("xx")).toBe(false);
  });
  it("a client cannot promote its own role", () => {
    expect(updateMeSchema.safeParse({ name: "x", role: "SUPER_ADMIN" }).success).toBe(false);
    expect(updateMeSchema.safeParse({ organizationId: "other" }).success).toBe(false);
  });
  it("quick observation requires context, area and a factual description", () => {
    expect(quickObservationSchema.safeParse({ kind: "QUICK", context: "yard", domains: [], observedBehavior: "ran" }).success).toBe(false);
    expect(quickObservationSchema.safeParse({ kind: "QUICK", context: "yard", domains: ["GROSS_MOTOR"], observedBehavior: "Climbed the frame" }).success).toBe(
      true,
    );
  });
  it("limits generation personalization to 1–2 interests", () => {
    expect(
      generateSchema.safeParse({ contentType: "STORY", language: "ar", include: { interests: ["a", "b", "c"], strengths: [], supports: [], avoid: [] } })
        .success,
    ).toBe(false);
  });
  it("PATCH goal keeps omitted fields unchanged (undefined) and clears explicit empty ones", () => {
    expect(updateGoalSchema.parse({ status: "PAUSED" }).parentFocus).toBeUndefined();
    expect(updateGoalSchema.parse({ parentFocus: "" }).parentFocus).toBeNull();
  });
});

describe("questionnaire answers", () => {
  it("validates options and drops unknown keys", () => {
    const interests = findQuestion("interests")!.question;
    expect(normalizeAnswer(interests, { selected: ["vehicles", "fake"], other: null })).toEqual({ selected: ["vehicles"], other: null });
    const sep = findQuestion("separation")!.question;
    expect(() => normalizeAnswer(sep, "nonsense")).toThrow();
    expect(normalizeAnswer(sep, "easy")).toBe("easy");
  });
});

describe("analytics sanitization", () => {
  it("drops unknown keys and free text so no child data leaves the app", () => {
    const out = sanitize({ contentType: "STORY", childName: "Adam", note: "Adam cried at drop-off", durationMs: 12 });
    expect(out).toEqual({ contentType: "STORY", durationMs: 12 });
  });
});

describe("i18n", () => {
  it("has RTL for Arabic and Hebrew and LTR for English", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("he")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
  });
  it("interpolates and falls back to English", () => {
    const t = createTranslator(DICTIONARIES.ar, DICTIONARIES.en);
    expect(t("teacher.goals.limit", { n: 2 })).toContain("2");
  });
  it("Arabic and Hebrew dictionaries contain every English key", () => {
    const keys = (o: object, p = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [`${p}${k}`] : keys(v as object, `${p}${k}.`)));
    const en = keys(DICTIONARIES.en);
    for (const l of ["ar", "he"] as const) {
      const other = new Set(keys(DICTIONARIES[l]));
      expect(en.filter((k) => !other.has(k))).toEqual([]);
    }
  });
});

describe("upload sniffing", () => {
  it("rejects files whose bytes do not match their declared type", () => {
    const png = Buffer.from("89504e470d0a1a0a0000", "hex");
    expect(sniffMatches("image/png", png)).toBe(true);
    expect(sniffMatches("image/jpeg", png)).toBe(false);
    expect(sniffMatches("image/png", Buffer.from("<script>alert(1)</script>"))).toBe(false);
  });
});
