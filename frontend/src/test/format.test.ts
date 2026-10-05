import { describe, expect, it } from "vitest";
import { createTranslator } from "@/i18n/translate";
import { ageParts, formatAge, formatDate } from "@/lib/format";

const NOW = new Date(2026, 4, 20); // 20 May 2026, local time
const age = (birth: string, locale: "en" | "ar" | "he") => formatAge(birth, createTranslator(locale).t, NOW);

describe("ageParts", () => {
  it("counts whole years and months", () => {
    expect(ageParts("2022-03-10", NOW)).toEqual({ years: 4, months: 2 });
    expect(ageParts("2022-05-20", NOW)).toEqual({ years: 4, months: 0 });
    expect(ageParts("2022-05-21", NOW)).toEqual({ years: 3, months: 11 });
    expect(ageParts("2025-12-01", NOW)).toEqual({ years: 0, months: 5 });
  });

  it("never goes negative for future dates", () => {
    expect(ageParts("2027-01-01", NOW)).toEqual({ years: 0, months: 0 });
  });
});

describe("formatAge", () => {
  it("English", () => {
    expect(age("2022-03-10", "en")).toBe("4 years 2 months");
    expect(age("2025-04-10", "en")).toBe("1 year 1 month");
    expect(age("2022-05-01", "en")).toBe("4 years");
    expect(age("2025-12-01", "en")).toBe("5 months");
  });

  it("Arabic uses dual and few/many forms with Western digits", () => {
    expect(age("2022-03-10", "ar")).toBe("4 سنوات وشهران");
    expect(age("2023-02-10", "ar")).toBe("3 سنوات و3 أشهر");
    expect(age("2025-05-01", "ar")).toBe("سنة واحدة");
    expect(age("2024-05-01", "ar")).toBe("سنتان");
    expect(age("2025-12-01", "ar")).toBe("5 أشهر");
    expect(age("2022-03-10", "ar")).not.toMatch(/[٠-٩]/);
  });

  it("Hebrew uses dual forms and ו־ joining", () => {
    expect(age("2022-03-10", "he")).toBe("4 שנים וחודשיים");
    expect(age("2023-02-10", "he")).toBe("3 שנים ו-3 חודשים");
    expect(age("2024-05-01", "he")).toBe("שנתיים");
    expect(age("2025-04-10", "he")).toBe("שנה וחודש");
  });
});

describe("formatDate", () => {
  it("Arabic dates use Western (Latin) digits", () => {
    const s = formatDate("2026-03-05", "ar");
    expect(s).toMatch(/2026/);
    expect(s).not.toMatch(/[٠-٩]/);
  });

  it("parses YYYY-MM-DD as a local calendar date", () => {
    expect(formatDate("2026-03-05", "en", { day: "numeric" })).toBe("5");
  });
});

describe("plural keys", () => {
  it("falls back to _other and then to English", () => {
    const { t } = createTranslator("he");
    expect(t("common.minutes", { count: 1 })).toBe("דקה");
    expect(t("common.minutes", { count: 7 })).toBe("7 דקות");
    expect(t("common.age.months", { count: 20 })).toBe("20 חודשים");
  });

  it("returns the key for unknown keys", () => {
    expect(createTranslator("ar").t("nope.missing")).toBe("nope.missing");
  });
});
