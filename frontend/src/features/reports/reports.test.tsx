import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppLocale } from "@/i18n/config";
import { mockFetch, renderApp, teacher, type Handler } from "@/test/utils";
import { buildRequest, DEFAULT_FLAGS, rangeError, type ExportRow } from "./api";
import { routes } from "./routes";

const child = {
  id: "c1",
  view: "staff",
  name: "Adam",
  preferred_name: null,
  birth_date: "2022-08-05",
  age: { years: 4, months: 2 },
  gender: "boy",
  class: { id: "c-a", name: "Class A", kindergarten: "Sunflower KG" },
  main_language: "ar",
  additional_languages: [],
  parent_name: null,
  parent_contact: null,
  has_photo: false,
  archived: false,
  updated_at: "2026-10-01T10:00:00Z",
  strengths: [],
  interests: [],
  what_helps: [],
  motivators: [],
  sensitivities: [],
  current_understanding: null,
  focus_areas: [],
  latest_observation: null,
  last_observation_at: null,
  wizard: { step: 1, completed_at: null },
  baseline: { exists: false, latest_created_at: null },
  draft_content_count: 0,
};

const exportRow: ExportRow = {
  id: "e1",
  report_type: "timeline",
  language: "he",
  date_from: "2026-09-01",
  date_to: "2026-09-30",
  generated_at: "2026-10-05T08:30:00Z",
  generated_by: { id: "u-teacher", name: "Rana Haddad" },
  include_health: true,
  include_family: false,
  include_private_notes: false,
};

const cycles = {
  current: { id: "a2", kind: "reassessment", number: 2, status: "open", filled_on: "2026-09-20" },
  earlier: [{ id: "a1", kind: "initial", number: null, status: "closed", filled_on: "2026-03-01" }],
};

type PdfReply = { status?: number; body?: unknown };

let created: Blob[] = [];
let revoked: string[] = [];
const urlStatics = URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (u: string) => void };
const original = { create: urlStatics.createObjectURL, revoke: urlStatics.revokeObjectURL };

beforeEach(() => {
  created = [];
  revoked = [];
  urlStatics.createObjectURL = vi.fn((b: Blob) => {
    created.push(b);
    return `blob:kidsphere/${created.length}`;
  });
  urlStatics.revokeObjectURL = vi.fn((u: string) => {
    revoked.push(u);
  });
});

afterEach(() => {
  urlStatics.createObjectURL = original.create;
  // A pending revoke timer may still fire after the test: keep a harmless function there.
  urlStatics.revokeObjectURL = original.revoke ?? (() => {});
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** JSON routes through mockFetch; the PDF route answers with a binary body (or an error envelope). */
function setup({ log = [exportRow], pdf = {}, extra = {} }: { log?: ExportRow[]; pdf?: PdfReply; extra?: Record<string, Handler> } = {}) {
  const json = mockFetch({
    "GET /api/children/c1": { body: { child } },
    "GET /api/children/c1/reports": { body: { exports: log } },
    "GET /api/children/c1/teacher-assessments": { body: cycles },
    ...extra,
  });
  const bodies: Record<string, unknown>[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.split("?")[0] === "/api/children/c1/reports/pdf") {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (pdf.status && pdf.status >= 400) {
        return new Response(JSON.stringify(pdf.body), { status: pdf.status, headers: { "Content-Type": "application/json" } });
      }
      return new Response(new TextEncoder().encode("%PDF-1.7\n%%EOF\n"), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "attachment; filename*=UTF-8''kidsphere-full-2026-10-06.pdf",
          "Cache-Control": "private, no-store",
        },
      });
    }
    return json(input, init);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, bodies };
}

/** The signed-in teacher's language is the UI language (the I18nProvider follows the account). */
function open(url = "/children/c1/reports", locale: AppLocale = "en") {
  return renderApp({ routes, url, user: { ...teacher, language: locale }, locale });
}

async function openDialog(name: RegExp | string) {
  fireEvent.click(await screen.findByRole("button", { name }));
  return screen.findByRole("dialog");
}

describe("Reports tab", () => {
  it("lists the six reports and the export log without content", async () => {
    setup();
    open();
    const list = await screen.findByRole("list", { name: "Export log" });
    expect(screen.getAllByRole("button", { name: /^Export PDF: / })).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Export PDF: Intervention Plan" })).toBeTruthy();
    const row = within(list).getByText(/Timeline Report/).closest("li")!;
    expect(row.textContent).toContain("Exported on");
    expect(row.textContent).toContain("Rana Haddad");
    expect(row.textContent).toContain("עברית");
    expect(within(row).getByText("Health & medical")).toBeTruthy();
    expect(row.textContent).not.toMatch(/%|score|points/i);
  });

  it("shows an empty log", async () => {
    setup({ log: [] });
    open();
    expect(await screen.findByText("No reports have been exported for this child yet.")).toBeTruthy();
  });

  it.each<[AppLocale]>([["en"], ["he"], ["ar"]])("defaults the report language to the UI locale (%s)", async (locale) => {
    setup();
    open("/children/c1/reports?type=full", locale);
    const dialog = await screen.findByRole("dialog");
    const selects = within(dialog).getAllByRole("combobox") as HTMLSelectElement[];
    expect(selects[0]!.value).toBe("full");
    expect(selects[1]!.value).toBe(locale);
  });

  it("sends the include flags, downloads the blob and revokes the object URL", async () => {
    const { bodies } = setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    open();
    const dialog = await openDialog("Export PDF: Full Child Report");
    expect(within(dialog).getByText("Contains personal details: store securely")).toBeTruthy();
    const health = within(dialog).getByRole("checkbox", { name: /Health & medical/ }) as HTMLInputElement;
    const parent = within(dialog).getByRole("checkbox", { name: /The family's input/ }) as HTMLInputElement;
    expect(health.checked).toBe(false);
    expect(parent.checked).toBe(true);
    fireEvent.click(health);
    fireEvent.change(within(dialog).getAllByRole("combobox")[1]!, { target: { value: "ar" } });
    fireEvent.change(within(dialog).getByLabelText("From"), { target: { value: "2026-09-01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Download PDF" }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      report_type: "full",
      language: "ar",
      date_from: "2026-09-01",
      include_parent: true,
      include_teacher_observations: true,
      include_timeline: true,
      include_health: true,
      include_family: false,
      include_private_notes: false,
    });
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("kidsphere-full-2026-10-06.pdf");
    expect(anchor.isConnected).toBe(false); // the hidden link is removed right after the click
    expect(created).toHaveLength(1);
    expect(created[0]!.size).toBeGreaterThan(0);
    await waitFor(() => expect(revoked).toEqual(["blob:kidsphere/1"]), { timeout: 3000 });
    expect(await screen.findByText("The PDF is ready in your downloads.")).toBeTruthy();
  });

  it("sends the chosen observation cycle for the Teacher Observation Report", async () => {
    const { bodies } = setup();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    open();
    const dialog = await openDialog("Export PDF: Teacher Observation Report");
    const cycle = await within(dialog).findByRole("option", { name: /First observation/ });
    fireEvent.change(cycle.closest("select")!, { target: { value: "a1" } });
    expect(within(dialog).queryByLabelText("From")).toBeNull(); // R3 prints the cycle's own period
    fireEvent.click(within(dialog).getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ report_type: "teacher_observation", assessment_id: "a1", include_private_notes: false });
  });

  it("opens on the report named in the link (Plan tab → Intervention Plan)", async () => {
    setup();
    open("/children/c1/reports?type=intervention_plan");
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("intervention_plan");
    expect(within(dialog).getByRole("checkbox", { name: /The family's input/ })).toBeTruthy();
    expect(within(dialog).queryByRole("checkbox", { name: /Health & medical/ })).toBeNull();
  });

  it("shows a busy renderer as a localized message and keeps the dialog open", async () => {
    setup({ pdf: { status: 503, body: { error: { code: "REPORT_BUSY", message: "busy" } } } });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    open();
    const dialog = await openDialog("Export PDF: Timeline Report");
    fireEvent.click(within(dialog).getByRole("button", { name: "Download PDF" }));
    expect(await within(dialog).findByText("The PDF was not created")).toBeTruthy();
    expect(click).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });

  it("blocks a reversed or future date range", async () => {
    const { bodies } = setup();
    open();
    const dialog = await openDialog("Export PDF: Timeline Report");
    fireEvent.change(within(dialog).getByLabelText("From"), { target: { value: "2026-09-10" } });
    fireEvent.change(within(dialog).getByLabelText("To"), { target: { value: "2026-09-01" } });
    expect(within(dialog).getByText("The start date must be before the end date.")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Download PDF" }) as HTMLButtonElement).disabled).toBe(true);
    expect(bodies).toHaveLength(0);
  });

  it("renders in Hebrew with the personal-details note", async () => {
    setup();
    open("/children/c1/reports?type=parent_questionnaire", "he");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("מכיל פרטים אישיים: יש לשמור במקום מאובטח")).toBeTruthy();
    expect(within(dialog).getByRole("checkbox", { name: /בריאות ומידע רפואי/ })).toBeTruthy();
  });
});

describe("buildRequest", () => {
  const base = { language: "he" as const, date_from: "2026-01-01", date_to: "2026-02-01", assessment_id: "a1", flags: { ...DEFAULT_FLAGS, include_health: true } };

  it("keeps only what applies to the report", () => {
    expect(buildRequest({ ...base, report_type: "current_development" })).toEqual({
      report_type: "current_development",
      language: "he",
      date_from: "2026-01-01",
      date_to: "2026-02-01",
      ...DEFAULT_FLAGS,
    });
    expect(buildRequest({ ...base, report_type: "teacher_observation" })).toEqual({ report_type: "teacher_observation", language: "he", assessment_id: "a1", ...DEFAULT_FLAGS });
    expect(buildRequest({ ...base, report_type: "parent_questionnaire" }).include_health).toBe(true);
  });

  it("checks the range", () => {
    expect(rangeError("2026-02-01", "2026-01-01", "2026-10-06")).toBe("order");
    expect(rangeError("", "2026-12-01", "2026-10-06")).toBe("future");
    expect(rangeError("2026-01-01", "", "2026-10-06")).toBeNull();
  });
});
