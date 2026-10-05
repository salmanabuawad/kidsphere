import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockFetch, renderApp, teacher } from "@/test/utils";
import { adam, options } from "@/features/observations/testData";
import { routes } from "./routes";
import type { TimelineEntry } from "./TimelinePage";

const entry = (over: Partial<TimelineEntry> & Pick<TimelineEntry, "type" | "at" | "id">): TimelineEntry => ({
  title: null,
  text: null,
  support_level: null,
  result: null,
  status: null,
  context: null,
  area: null,
  content_id: null,
  content_title: null,
  content_type: null,
  focus_area_id: null,
  focus_area_title: null,
  by_name: "Rana",
  ...over,
});

const page1: TimelineEntry[] = [
  entry({ type: "observation", at: "2026-10-04T10:00:00Z", id: "o2", text: "Asked Omar to build together", support_level: "independent", context: "free_play", focus_area_title: "Joining group play" }),
  entry({ type: "content_feedback", at: "2026-10-03T11:00:00Z", id: "o1", result: "partly", content_title: "Build the Garage Together", text: "Stayed 8 minutes" }),
  entry({ type: "content_approved", at: "2026-10-03T09:00:00Z", id: "g1", title: "Build the Garage Together", content_title: "Build the Garage Together", content_type: "real_world_activity" }),
  entry({ type: "focus_closed", at: "2026-09-20T09:00:00Z", id: "f2", title: "Taking turns", status: "completed", area: "social" }),
];
const page2: TimelineEntry[] = [
  entry({ type: "focus_opened", at: "2026-09-01T10:05:00Z", id: "f1", title: "Joining group play", area: "social" }),
  entry({ type: "baseline", at: "2026-09-01T10:00:00Z", id: "b1" }),
];

describe("TimelinePage", () => {
  it("shows entries grouped by day with quotes and result chips, and loads older pages", async () => {
    const offsets: string[] = [];
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/timeline": (_init, url) => {
        const offset = new URL(url, "http://x").searchParams.get("offset") ?? "0";
        offsets.push(offset);
        return offset === "0"
          ? { body: { entries: page1, limit: 30, offset: 0, has_more: true } }
          : { body: { entries: page2, limit: 30, offset: 30, has_more: false } };
      },
    });
    renderApp({ routes, url: "/children/c1/timeline", user: teacher, options });

    expect(await screen.findByText("Asked Omar to build together")).toBeTruthy();
    const quote = screen.getByText("Asked Omar to build together");
    expect(quote.tagName).toBe("BLOCKQUOTE");
    expect(quote.getAttribute("dir")).toBe("auto");

    const items = screen.getAllByTestId("timeline-entry");
    expect(items.map((i) => i.getAttribute("data-type"))).toEqual(["observation", "content_feedback", "content_approved", "focus_closed"]);
    expect(within(items[0]!).getByText("Independent")).toBeTruthy();
    expect(within(items[0]!).getByText("Free play")).toBeTruthy();
    expect(within(items[0]!).getByText("Focus: Joining group play")).toBeTruthy();
    expect(within(items[1]!).getByText("After “Build the Garage Together”")).toBeTruthy();
    expect(within(items[1]!).getByText("Partly")).toBeTruthy();
    expect(within(items[2]!).getByRole("link", { name: "Build the Garage Together" }).getAttribute("href")).toBe("/content/g1");
    expect(within(items[3]!).getByText("Focus completed")).toBeTruthy();
    // 3 distinct days on the first page → 3 day headings + 3 lists.
    expect(screen.getByRole("region", { name: "Development timeline" }).querySelectorAll("ol").length).toBe(3);

    fireEvent.click(screen.getByRole("button", { name: "Load older" }));
    await waitFor(() => expect(screen.getAllByTestId("timeline-entry")).toHaveLength(6));
    expect(offsets).toEqual(["0", "4"]);
    expect(screen.queryByRole("button", { name: "Load older" })).toBeNull();
    expect(screen.getByText("Baseline created")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\d+\s*%|score|points/i);
  });

  it("shows a friendly empty state with Add observation", async () => {
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/timeline": { body: { entries: [], limit: 30, offset: 0, has_more: false } },
    });
    renderApp({ routes, url: "/children/c1/timeline", user: teacher, options });
    expect(await screen.findByText("Nothing on the timeline yet")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Add observation/ })[0]!.getAttribute("href")).toBe("/children/c1/observe");
  });

  it("renders RTL in Arabic", async () => {
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "GET /api/children/c1/timeline": { body: { entries: page1, limit: 30, offset: 0, has_more: false } },
    });
    renderApp({ routes, url: "/children/c1/timeline", user: { ...teacher, language: "ar" }, locale: "ar", options });
    expect(await screen.findByText("مسار التطور")).toBeTruthy();
    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
    expect(await screen.findByText("مستقل")).toBeTruthy();
    expect(screen.getByText("جزئياً")).toBeTruthy();
  });
});
