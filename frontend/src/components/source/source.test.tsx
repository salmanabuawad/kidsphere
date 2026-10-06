import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, type User } from "@/auth/AuthProvider";
import type { AppLocale } from "@/i18n/config";
import { I18nProvider } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { clearSourceModelCache, loadSourceModel, normalizeSourceModel, primeSourceModel, useSourceModel } from "@/lib/sourceModel";
import ar from "@/i18n/messages/ar/common.json";
import en from "@/i18n/messages/en/common.json";
import he from "@/i18n/messages/he/common.json";
import { mockFetch, teacher } from "@/test/utils";
import {
  NotAnswered,
  NotObserved,
  PROVENANCE_KINDS,
  ProvenanceBadge,
  ProvenanceBadges,
  SECTION_STATUSES,
  StatusPicker,
  StatusPill,
  interpolateNodes,
  normalizeStatus,
} from ".";

/** WP1-FE shared source-document UI: status pills, provenance badges, markers, and the source-model hook. */

const DICTS = { en, ar, he } as const;
const LOCALES: [AppLocale, "ltr" | "rtl"][] = [
  ["en", "ltr"],
  ["he", "rtl"],
  ["ar", "rtl"],
];

function wrap(ui: ReactNode, locale: AppLocale = "en", user: User | null = null) {
  return render(
    <AuthProvider initialUser={user}>
      <I18nProvider locale={locale}>{ui}</I18nProvider>
    </AuthProvider>,
  );
}

/** Visible = rendered text that is not screen-reader-only and does not depend on a title tooltip. */
function expectVisible(el: HTMLElement) {
  expect(el.closest(".sr-only")).toBeNull();
  expect(el.closest("[hidden]")).toBeNull();
  expect(el.closest("[title]")).toBeNull();
}

const SCORING = /\d+\s*%|\bscore\b|\bpoints\b/i;

describe.each(LOCALES)("StatusPill in %s", (locale, dir) => {
  const d = DICTS[locale].sectionStatus;

  it(`renders every status as a word (dir=${dir}), never a percentage`, () => {
    const { container } = wrap(
      <ul>
        {SECTION_STATUSES.map((s) => (
          <li key={s}>
            <StatusPill status={s} />
          </li>
        ))}
      </ul>,
      locale,
    );
    expect(document.documentElement.dir).toBe(dir);
    expect(document.documentElement.lang).toBe(locale);
    for (const s of SECTION_STATUSES) {
      const el = screen.getByText(d[s]);
      expectVisible(el);
      expect(el.getAttribute("data-status")).toBe(s);
    }
    expect(container.textContent).not.toMatch(SCORING);
    // Screen readers hear "Status: …".
    expect(screen.getAllByText(`${DICTS[locale].status}:`, { exact: false })).toHaveLength(SECTION_STATUSES.length);
  });

  it("uses the answers wording for questionnaire sections", () => {
    wrap(<StatusPill status="sufficient" wording="answers" />, locale);
    expect(screen.getByText(d.sufficientAnswers).getAttribute("data-status")).toBe("sufficient");
    expect(screen.queryByText(d.sufficient)).toBeNull();
  });
});

describe("StatusPill / StatusPicker behaviour", () => {
  it("treats missing or unknown data as not started and accepts the stored {status} object", () => {
    expect(normalizeStatus(undefined)).toBe("not_started");
    expect(normalizeStatus("finished")).toBe("not_started");
    expect(normalizeStatus({ status: "review_later", by: "u1", at: "2026-10-01" })).toBe("review_later");
    wrap(
      <>
        <StatusPill status={null} />
        <StatusPill status={{ status: "in_progress" }} />
      </>,
    );
    expect(screen.getByText(en.sectionStatus.not_started)).toBeTruthy();
    expect(screen.getByText(en.sectionStatus.in_progress)).toBeTruthy();
  });

  it.each(LOCALES)("StatusPicker is a radiogroup of the 4 statuses in %s", (locale) => {
    const onChange = vi.fn();
    wrap(<StatusPicker value="in_progress" onChange={onChange} />, locale);
    const group = screen.getByRole("radiogroup", { name: DICTS[locale].sectionStatus.label });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(SECTION_STATUSES.map((s) => DICTS[locale].sectionStatus[s]));
    expect(within(group).getByRole("radio", { name: DICTS[locale].sectionStatus.in_progress }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(group).getByRole("radio", { name: DICTS[locale].sectionStatus.review_later }));
    expect(onChange).toHaveBeenCalledWith("review_later");
  });

  it("StatusPicker can offer a subset and be disabled", () => {
    wrap(<StatusPicker value="sufficient" wording="answers" options={["in_progress", "sufficient"]} onChange={() => undefined} disabled />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual([en.sectionStatus.in_progress, en.sectionStatus.sufficientAnswers]);
    expect(radios.every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
  });
});

describe.each(LOCALES)("ProvenanceBadge in %s", (locale, dir) => {
  const d = DICTS[locale].provenance;

  it(`shows each source as visible text without hover (dir=${dir})`, () => {
    const { container } = wrap(
      <>
        {PROVENANCE_KINDS.map((k) => (
          <ProvenanceBadge key={k} kind={k} />
        ))}
      </>,
      locale,
    );
    expect(document.documentElement.dir).toBe(dir);
    for (const k of PROVENANCE_KINDS) {
      const el = screen.getByText(d[k]);
      expectVisible(el);
      expect(el.closest("[data-provenance]")?.getAttribute("data-provenance")).toBe(k);
    }
    expect(container.querySelector("[title]")).toBeNull();
    expect(screen.getAllByText(`${d.label}:`, { exact: false })).toHaveLength(PROVENANCE_KINDS.length);
  });

  it("adds an 'entered by' line with the name isolated, and the date when given", () => {
    const { container } = wrap(
      <>
        <ProvenanceBadge kind="parent_said" enteredBy="Rana Haddad" />
        <ProvenanceBadge kind="parent_said" enteredBy="רנא חדאד" enteredAt="2026-10-01" />
      </>,
      locale,
    );
    const lines = [...container.querySelectorAll("[data-entered-by]")] as HTMLElement[];
    expect(lines).toHaveLength(2);
    expect(lines[0]!.textContent).toBe(d.enteredBy.replace("{name}", "Rana Haddad"));
    expect(lines[1]!.textContent).toBe(d.enteredByOn.replace("{name}", "רנא חדאד").replace("{date}", formatDate("2026-10-01", locale)));
    expect(lines[1]!.querySelectorAll("bdi")).toHaveLength(2);
    lines.forEach(expectVisible);
  });
});

describe("ProvenanceBadges", () => {
  it("renders an item's provenance[] de-duplicated, in canonical order, skipping unknown labels", () => {
    const { container } = wrap(<ProvenanceBadges kinds={["teacher_approved", "parent_said", "something_else", "parent_said"]} />);
    expect([...container.querySelectorAll("[data-provenance]")].map((e) => e.getAttribute("data-provenance"))).toEqual(["parent_said", "teacher_approved"]);
  });

  it.each(LOCALES)("accepts badge objects from app.provenance.badges() with entered_by and meeting mode (%s)", (locale) => {
    const d = DICTS[locale].provenance;
    const { container } = wrap(
      <ProvenanceBadges kinds={[{ label: "teacher_observed" }, { label: "parent_said", entered_by: "Rana Haddad", mode: "meeting" }, "parent_said"]} />,
      locale,
    );
    expect([...container.querySelectorAll("[data-provenance]")].map((e) => e.getAttribute("data-provenance"))).toEqual(["parent_said", "teacher_observed"]);
    const line = container.querySelector("[data-entered-by]")!;
    expect(line.textContent).toBe(`${d.enteredBy.replace("{name}", "Rana Haddad")} · ${d.inMeeting}`);
    expectVisible(screen.getByText(d.parent_said));
  });

  it("renders nothing for an empty list", () => {
    const { container } = wrap(
      <>
        <ProvenanceBadges kinds={[]} />
        <ProvenanceBadges kinds={null} />
      </>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("a blank enteredBy shows no line", () => {
    const { container } = wrap(<ProvenanceBadge kind="teacher_observed" enteredBy="  " enteredAt="2026-10-01" />);
    expect(container.querySelector("[data-entered-by]")).toBeNull();
  });
});

describe.each(LOCALES)("NotAnswered / NotObserved in %s", (locale, dir) => {
  it(`render muted words (dir=${dir})`, () => {
    const { container } = wrap(
      <>
        <NotAnswered />
        <NotObserved />
      </>,
      locale,
    );
    expect(document.documentElement.dir).toBe(dir);
    expectVisible(screen.getByText(DICTS[locale].notAnswered));
    expectVisible(screen.getByText(DICTS[locale].notObserved));
    expect(container.querySelector('[data-marker="not-answered"]')?.className).toMatch(/\btext-ink-muted\b/);
    expect(container.querySelector('[data-marker="not-observed"]')?.className).toMatch(/\btext-ink-muted\b/);
  });
});

describe("interpolateNodes", () => {
  it("puts nodes into placeholders and keeps unknown ones", () => {
    const { container } = render(<p>{interpolateNodes("A {name} B {other}", { name: <bdi>x</bdi> })}</p>);
    expect(container.textContent).toBe("A x B {other}");
    expect(container.querySelector("bdi")?.textContent).toBe("x");
  });
});

// ---------------------------------------------------------------------------
// useSourceModel(): cached GET /api/source-model

const REGISTRY = {
  meta: { source: "parent_questionnaire", version: 1 },
  sections: [
    { id: "PQ-SEC-02", key: "joy", order: 2, label: { en: "What makes my child happy", ar: "ما يُسعد طفلي", he: "מה משמח את הילד/ה שלי" } },
    { id: "PQ-SEC-01", key: "who", order: 1, label: { en: "Me and my child", ar: "أنا وطفلي", he: "אני והילד/ה שלי" } },
  ],
  items: [
    {
      id: "PQ-JOY-02",
      section: "joy",
      order: 2,
      kind: "text",
      storage: "PP.joy.likes_at_home",
      sensitivity: "none",
      ai_policy: "never",
      pdf: "R2§B",
      label: { en: "What does your child like doing at home?", ar: "ماذا يحب طفلكم أن يفعل في البيت؟", he: "מה הילד/ה אוהב/ת לעשות בבית?" },
      source_he: "SOURCE-HE-VERBATIM-1",
    },
    {
      id: "PQ-JOY-01",
      section: "joy",
      order: 1,
      kind: "text",
      storage: "PP.joy.happy_safe_successful",
      sensitivity: "none",
      ai_policy: "never",
      pdf: "R2§B",
      label: { en: "What makes your child feel happy, safe and successful?" },
      source_he: "SOURCE-HE-VERBATIM-2",
    },
    {
      id: "PQ-INTRO-01",
      section: "PQ-SEC-01",
      order: 1,
      kind: "text",
      storage: "PP.who.describe_words",
      sensitivity: "none",
      ai_policy: "label",
      label: { en: "Describe your child in 3–5 words", ar: "صِفوا طفلكم في 3–5 كلمات", he: "תארו את הילד/ה ב־3–5 מילים" },
      source_he: "SOURCE-HE-VERBATIM-3",
    },
  ],
};

function Probe({ name = "parent_questionnaire" }: { name?: string }) {
  const sm = useSourceModel();
  if (sm.error) return <p role="alert">{sm.error.code}</p>;
  if (!sm.ready) return <p>loading</p>;
  return (
    <div>
      <p data-testid="has">{sm.registry(name) ? "yes" : "no"}</p>
      {sm.sections(name).map((s) => (
        <section key={s.id} aria-label={sm.label(s)}>
          <h2>{sm.label(s)}</h2>
          <ul>
            {sm.items(name, s.key).map((i) => (
              <li key={i.id}>{sm.label(i)}</li>
            ))}
          </ul>
        </section>
      ))}
      <button onClick={sm.reload}>reload</button>
    </div>
  );
}

describe("useSourceModel()", () => {
  beforeEach(() => clearSourceModelCache());

  it("fetches once for every consumer and orders sections and items by source order", async () => {
    const fetch = mockFetch({ "GET /api/source-model": { body: { parent_questionnaire: REGISTRY, observation_model: {} } } });
    wrap(
      <>
        <Probe />
        <Probe name="observation_model" />
      </>,
      "en",
      teacher,
    );
    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(["Me and my child", "What makes my child happy"]);
    const joy = screen.getByRole("region", { name: "What makes my child happy" });
    expect(within(joy).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "What makes your child feel happy, safe and successful?",
      "What does your child like doing at home?",
    ]);
    // Items may reference their section by id as well as by key.
    expect(within(screen.getByRole("region", { name: "Me and my child" })).getByText("Describe your child in 3–5 words")).toBeTruthy();
    // A registry that is not shipped yet ({}) is simply absent.
    expect(screen.getAllByTestId("has").map((e) => e.textContent)).toEqual(["yes", "no"]);
    expect(fetch.mock.calls.filter(([u]) => String(u) === "/api/source-model")).toHaveLength(1);
    // The verbatim source wording is never rendered.
    expect(document.body.textContent).not.toContain("SOURCE-HE-VERBATIM");
  });

  it.each([
    ["he", "אני והילד/ה שלי", "מה הילד/ה אוהב/ת לעשות בבית?"],
    ["ar", "أنا وطفلي", "ماذا يحب طفلكم أن يفعل في البيت؟"],
  ] as const)("labels follow the UI language (%s) and fall back to English", async (locale, section, question) => {
    mockFetch({ "GET /api/source-model": { body: { parent_questionnaire: REGISTRY } } });
    wrap(<Probe />, locale, { ...teacher, language: locale });
    expect(await screen.findByRole("heading", { name: section })).toBeTruthy();
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.getByText(question)).toBeTruthy();
    expect(screen.getByText("What makes your child feel happy, safe and successful?")).toBeTruthy();
  });

  it("does not fetch while signed out", async () => {
    const fetch = mockFetch({ "GET /api/source-model": { body: {} } });
    wrap(<Probe />, "en", null);
    await act(async () => undefined);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText("loading")).toBeTruthy();
  });

  it("surfaces errors and refetches on reload", async () => {
    let calls = 0;
    mockFetch({
      "GET /api/source-model": () => (++calls === 1 ? { status: 500, body: { error: { code: "INTERNAL", message: "x" } } } : { body: { parent_questionnaire: REGISTRY } }),
    });
    wrap(<Probe />, "en", teacher);
    expect((await screen.findByRole("alert")).textContent).toBe("INTERNAL");
    await act(async () => {
      await loadSourceModel(true);
    });
    expect(await screen.findByRole("heading", { name: "Me and my child" })).toBeTruthy();
    expect(calls).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "reload" }));
    await waitFor(() => expect(calls).toBe(3));
  });

  it("can be primed without a request, and is cleared when the session ends (401)", async () => {
    const fetch = mockFetch({ "GET /api/children": { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "x" } } } });
    primeSourceModel({ parent_questionnaire: REGISTRY });
    wrap(<Probe />, "en", teacher);
    expect(screen.getByRole("heading", { name: "Me and my child" })).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => {
      await api("/api/children").catch(() => undefined);
    });
    // The 401 signs out (AuthProvider) and empties the cache.
    expect(await screen.findByText("loading")).toBeTruthy();
  });

  it("normalizeSourceModel ignores malformed registries", () => {
    expect(normalizeSourceModel(null)).toEqual({});
    expect(normalizeSourceModel({ parent_questionnaire: {}, observation_model: null, x: { sections: "no" } })).toEqual({});
    const m = normalizeSourceModel({ observation_model: { sections: [{ key: "emotional", order: 1, label: { en: "Emotional" } }], items: [{ id: "OM-D01-01", section: "emotional", order: 1, label: { en: "x" } }] } });
    expect(m.observation_model?.sections[0]).toMatchObject({ id: "emotional", key: "emotional" });
    expect(m.observation_model?.items[0]).toMatchObject({ id: "OM-D01-01", sensitivity: "none", ai_policy: "never" });
  });
});
