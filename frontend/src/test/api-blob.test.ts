import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  OBJECT_URL_TTL_MS,
  api,
  apiBlob,
  apiBlobResponse,
  apiDownload,
  errorMessage,
  filenameFromDisposition,
  onUnauthenticated,
  saveBlob,
} from "@/lib/api";
import { createTranslator } from "@/i18n/translate";
import enErrors from "@/i18n/messages/en/errors.json";

/** apiBlob(): the PDF download path (WP1-FE). Same session, CSRF and error envelope as api(). */

const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\n%\u00e2\u00e3\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n");
const PDF_HEADERS = {
  "Content-Type": "application/pdf",
  "Content-Disposition": "attachment; filename*=UTF-8''kidsphere-full-2026-10-06.pdf",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

type Reply = { status?: number; body?: BodyInit | null; headers?: Record<string, string> };

/** Stub fetch with one reply per call (the last one repeats); returns the mock for call assertions. */
function stubFetch(...replies: Reply[]) {
  let i = 0;
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    const r = replies[Math.min(i++, replies.length - 1)]!;
    return new Response(r.body ?? null, { status: r.status ?? 200, headers: r.headers });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (status: number, body: unknown): Reply => ({ status, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

function readText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

// jsdom has no object URLs: install spies for the duration of each test.
let created: Blob[] = [];
let revoked: string[] = [];
const urlStatics = URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (u: string) => void };
const original = { create: urlStatics.createObjectURL, revoke: urlStatics.revokeObjectURL };

beforeEach(() => {
  created = [];
  revoked = [];
  urlStatics.createObjectURL = vi.fn((b: Blob) => {
    created.push(b);
    return `blob:http://localhost/obj-${created.length}`;
  });
  urlStatics.revokeObjectURL = vi.fn((u: string) => {
    revoked.push(u);
  });
});

afterEach(() => {
  urlStatics.createObjectURL = original.create;
  // A pending revoke timer may still fire after the test: keep a harmless function there.
  urlStatics.revokeObjectURL = original.revoke ?? (() => {});
  vi.useRealTimers();
});

describe("apiBlob()", () => {
  it("returns a Blob for application/pdf", async () => {
    stubFetch({ body: PDF_BYTES, headers: PDF_HEADERS });
    const blob = await apiBlob("/api/children/c1/reports/pdf", { report_type: "full", language: "he" });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe(PDF_BYTES.byteLength);
    expect(await readText(blob)).toMatch(/^%PDF-1\.7/);
  });

  it("POSTs the JSON body with same-origin credentials and asks for a PDF", async () => {
    const fetch = stubFetch({ body: PDF_BYTES, headers: PDF_HEADERS });
    const body = { report_type: "timeline", language: "ar", date_from: "2026-09-01", date_to: "2026-10-01", include_parent: true };
    await apiBlob("/api/children/c1/reports/pdf", body);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/children/c1/reports/pdf");
    expect(init!.method).toBe("POST");
    expect(init!.credentials).toBe("same-origin");
    const headers = init!.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Accept).toContain("application/pdf");
    expect(JSON.parse(String(init!.body))).toEqual(body);
  });

  it("GETs when there is no body, with the query string", async () => {
    const fetch = stubFetch({ body: PDF_BYTES, headers: PDF_HEADERS });
    await apiBlob("/api/files/x", undefined, { query: { lang: "he", empty: "" } });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/files/x?lang=he");
    expect(init!.method).toBe("GET");
    expect(init!.body).toBeUndefined();
  });

  it("surfaces the JSON error envelope on 5xx (REPORT_BUSY) with its localized message", async () => {
    stubFetch(json(503, { error: { code: "REPORT_BUSY", message: "busy", details: null } }));
    const err = await apiBlob("/api/children/c1/reports/pdf", { report_type: "full" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "REPORT_BUSY", status: 503, message: "busy" });
    expect(errorMessage(err, createTranslator("en"))).toBe(enErrors.REPORT_BUSY);
  });

  it("surfaces the JSON error envelope on 4xx with details", async () => {
    stubFetch(json(400, { error: { code: "VALIDATION", message: "bad", details: [{ path: "date_from", message: "after date_to" }] } }));
    await expect(apiBlob("/api/children/c1/reports/pdf", { report_type: "timeline" })).rejects.toMatchObject({
      code: "VALIDATION",
      status: 400,
      details: [{ path: "date_from", message: "after date_to" }],
    });
    stubFetch(json(404, { error: { code: "NOT_FOUND", message: "nf" } }));
    await expect(apiBlob("/api/children/other/reports/pdf", {})).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    stubFetch(json(500, { error: { code: "REPORT_FAILED", message: "x" } }));
    await expect(apiBlob("/api/children/c1/reports/pdf", {})).rejects.toMatchObject({ code: "REPORT_FAILED", status: 500 });
  });

  it("derives a code from the status when there is no envelope (and a bare 503 is not about AI)", async () => {
    stubFetch({ status: 503, body: "<html>busy</html>", headers: { "Content-Type": "text/html" } });
    await expect(apiBlob("/api/x", {})).rejects.toMatchObject({ code: "INTERNAL", status: 503 });
    stubFetch({ status: 403 });
    await expect(apiBlob("/api/x", {})).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    // api() keeps its own mapping.
    stubFetch({ status: 503 });
    await expect(api("/api/y")).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("signs out on 401 like api()", async () => {
    const listener = vi.fn();
    const off = onUnauthenticated(listener);
    stubFetch(json(401, { error: { code: "UNAUTHENTICATED", message: "x" } }));
    await expect(apiBlob("/api/children/c1/reports/pdf", {})).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it("reports network failures as NETWORK and rethrows aborts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(apiBlob("/api/x", {})).rejects.toMatchObject({ code: "NETWORK", status: 0 });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new DOMException("aborted", "AbortError"))));
    await expect(apiBlob("/api/x", {})).rejects.toMatchObject({ name: "AbortError" });
  });

  it("apiBlobResponse() also returns the server's file name and type", async () => {
    stubFetch({ body: PDF_BYTES, headers: { ...PDF_HEADERS, "Content-Type": "application/pdf; charset=binary" } });
    const res = await apiBlobResponse("/api/children/c1/reports/pdf", { report_type: "full" });
    expect(res.filename).toBe("kidsphere-full-2026-10-06.pdf");
    expect(res.contentType).toBe("application/pdf");
    expect(res.blob).toBeInstanceOf(Blob);
  });
});

describe("filenameFromDisposition()", () => {
  it.each([
    ["attachment; filename*=UTF-8''kidsphere-full-2026-10-06.pdf", "kidsphere-full-2026-10-06.pdf"],
    ["attachment; filename=\"plan.pdf\"; filename*=UTF-8''%D7%AA%D7%95%D7%9B%D7%A0%D7%99%D7%AA.pdf", "תוכנית.pdf"],
    ['attachment; filename="a \\"quoted\\" name.pdf"', 'a "quoted" name.pdf'],
    ["attachment; filename=simple.pdf", "simple.pdf"],
    ["attachment; filename*=UTF-8''..%2F..%2Fetc%2Fpasswd", "passwd"],
    ['attachment; filename="C:\\\\temp\\\\x.pdf"', "x.pdf"],
    ["attachment", null],
    ["", null],
    [null, null],
  ])("%j → %j", (header, expected) => {
    expect(filenameFromDisposition(header)).toBe(expected);
  });
});

describe("saveBlob() / apiDownload(): object URL lifecycle", () => {
  function captureClicks() {
    const clicks: { href: string; download: string; attached: boolean }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.getAttribute("href") ?? "", download: this.download, attached: document.body.contains(this) });
    });
    return clicks;
  }

  it("clicks a hidden download link, removes it and revokes the object URL after the click", () => {
    vi.useFakeTimers();
    const clicks = captureClicks();
    const blob = new Blob(["%PDF-1.7"], { type: "application/pdf" });
    saveBlob(blob, "kidsphere-plan.pdf");
    expect(created).toEqual([blob]);
    expect(clicks).toEqual([{ href: "blob:http://localhost/obj-1", download: "kidsphere-plan.pdf", attached: true }]);
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
    expect(revoked).toEqual([]);
    vi.advanceTimersByTime(OBJECT_URL_TTL_MS);
    expect(revoked).toEqual(["blob:http://localhost/obj-1"]);
  });

  it("returns a revoke function the caller can use early; it revokes exactly once", () => {
    vi.useFakeTimers();
    captureClicks();
    const revoke = saveBlob(new Blob(["x"], { type: "application/pdf" }), "x.pdf");
    revoke();
    revoke();
    vi.advanceTimersByTime(OBJECT_URL_TTL_MS * 2);
    expect(revoked).toEqual(["blob:http://localhost/obj-1"]);
  });

  it("the caller can also manage the URL itself: apiBlob → createObjectURL → revokeObjectURL", async () => {
    stubFetch({ body: PDF_BYTES, headers: PDF_HEADERS });
    const blob = await apiBlob("/api/children/c1/reports/pdf", { report_type: "intervention_plan" });
    const url = URL.createObjectURL(blob);
    URL.revokeObjectURL(url);
    expect(created).toEqual([blob]);
    expect(revoked).toEqual([url]);
  });

  it("apiDownload saves under the server's name, else the fallback, and revokes", async () => {
    const clicks = captureClicks();
    stubFetch({ body: PDF_BYTES, headers: PDF_HEADERS }, { body: PDF_BYTES, headers: { "Content-Type": "application/pdf" } });
    const first = await apiDownload("/api/children/c1/reports/pdf", { report_type: "full" }, "fallback.pdf");
    expect(first.filename).toBe("kidsphere-full-2026-10-06.pdf");
    const second = await apiDownload("/api/children/c1/reports/pdf", { report_type: "full" }, "fallback.pdf");
    expect(second.filename).toBe("fallback.pdf");
    expect(clicks.map((c) => c.download)).toEqual(["kidsphere-full-2026-10-06.pdf", "fallback.pdf"]);
    first.revoke();
    second.revoke();
    expect(revoked).toEqual(["blob:http://localhost/obj-1", "blob:http://localhost/obj-2"]);
  });

  it("apiDownload creates no object URL when the export fails", async () => {
    captureClicks();
    stubFetch(json(503, { error: { code: "REPORT_BUSY", message: "busy" } }));
    await expect(apiDownload("/api/children/c1/reports/pdf", {}, "x.pdf")).rejects.toMatchObject({ code: "REPORT_BUSY" });
    expect(created).toEqual([]);
  });
});
