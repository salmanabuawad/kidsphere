import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppRoute } from "@/lib/routing";
import { mockFetch, renderApp, teacher } from "@/test/utils";
import { rememberChild } from "./api";
import { routes as observationRoutes } from "./routes";
import { adam, adamCard, mayaCard, options } from "./testData";

const routes: AppRoute[] = [...observationRoutes, { path: "/children/:id", element: <p>Profile page</p>, roles: ["teacher", "admin"] }];

function saved(body: Record<string, unknown>) {
  return { status: 201, body: { observation: { id: "o1", child_id: "c1", source: "quick", observed_at: "2026-10-05T09:00:00Z", ...body } } };
}

describe("QuickObservation", () => {
  it("saves with text + context + support in three taps and returns to the profile", async () => {
    let sent: Record<string, unknown> | null = null;
    const fetchFn = mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "POST /api/children/c1/observations": (init) => {
        sent = JSON.parse(String(init?.body));
        return saved(sent!);
      },
    });
    const { router } = renderApp({ routes, url: "/children/c1/observe", user: teacher, options });

    const text = await screen.findByLabelText(/What happened\?/);
    fireEvent.change(text, { target: { value: "Asked Omar: can we build this together?" } });
    fireEvent.click(screen.getByRole("button", { name: /Free play/ }));
    fireEvent.click(screen.getByRole("radio", { name: /With support/ }));
    fireEvent.click(screen.getByRole("button", { name: /Save observation/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/children/c1"));
    expect(sent).toMatchObject({ observation: "Asked Omar: can we build this together?", context: "free_play", support_level: "some_support" });
    expect(typeof sent!.client_request_id).toBe("string");
    expect(sent).not.toHaveProperty("focus_area_id");
    expect(sent).not.toHaveProperty("observed_at");
    expect(await screen.findByText("Observation saved")).toBeTruthy();
    expect(fetchFn.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("requires only the text, and sends focus, helps, custom help and the observation model", async () => {
    let sent: Record<string, unknown> | null = null;
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "POST /api/children/c1/observations": (init) => {
        sent = JSON.parse(String(init?.body));
        return saved(sent!);
      },
    });
    renderApp({ routes, url: "/children/c1/observe", user: teacher, options });

    fireEvent.click(await screen.findByRole("button", { name: /Save observation/ }));
    expect(await screen.findByText("Please write what happened.")).toBeTruthy();
    expect(sent).toBeNull();

    fireEvent.change(screen.getByLabelText(/What happened\?/), { target: { value: "Joined the train game" } });
    fireEvent.click(screen.getByRole("button", { name: "Joining group play" }));
    fireEvent.click(screen.getByRole("button", { name: /Adult guidance/ }));
    expect(screen.queryByRole("button", { name: /^Other$/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Something else that helped"), { target: { value: "A favourite car" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: /More details/ }));
    fireEvent.change(screen.getByLabelText(/What do I see\?/), { target: { value: "Watched first" } });
    fireEvent.click(screen.getByRole("button", { name: /Step E/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Partly" }));
    fireEvent.click(screen.getByRole("button", { name: /Save observation/ }));

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toMatchObject({
      observation: "Joined the train game",
      focus_area_id: "f1",
      area: "social",
      what_helped: ["adult_mediation", { custom: "A favourite car" }],
      details: { what_i_see: "Watched first", did_it_change: "partly" },
    });
  });

  it("offers exactly three support buttons with the short labels and big touch targets", async () => {
    mockFetch({ "GET /api/children/c1": { body: { child: adam } } });
    renderApp({ routes, url: "/children/c1/observe", user: teacher, options });
    const legend = await screen.findByText("How much support was needed?");
    const group = legend.closest("fieldset")!;
    const buttons = within(group).getAllByRole("radio");
    expect(buttons.map((b) => b.textContent?.replace(/\p{Extended_Pictographic}/gu, "").trim())).toEqual(["Independent", "With support", "Difficult"]);
    for (const b of buttons) expect(b.className).toContain("min-h-16");
    for (const b of within(screen.getByText("Where?").closest("fieldset")!).getAllByRole("button")) expect(b.className).toContain("min-h-16");
    expect(screen.queryByText("Not observed")).toBeNull();
  });

  it("keeps one request id across retries so a repeat never saves twice", async () => {
    const ids: string[] = [];
    let fail = true;
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "POST /api/children/c1/observations": (init) => {
        const body = JSON.parse(String(init?.body));
        ids.push(body.client_request_id);
        if (fail) {
          fail = false;
          return { status: 500, body: { error: { code: "INTERNAL", message: "x" } } };
        }
        return saved(body);
      },
    });
    const { router } = renderApp({ routes, url: "/children/c1/observe", user: teacher, options });
    fireEvent.change(await screen.findByLabelText(/What happened\?/), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: /Save observation/ }));
    await waitFor(() => expect(ids).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: /Save observation/ }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /Save observation/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/children/c1"));
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it("renders RTL in Arabic", async () => {
    mockFetch({ "GET /api/children/c1": { body: { child: adam } } });
    renderApp({ routes, url: "/children/c1/observe", user: { ...teacher, language: "ar" }, locale: "ar", options });
    expect(await screen.findByText("ماذا حدث؟")).toBeTruthy();
    await waitFor(() => expect(document.documentElement.dir).toBe("rtl"));
    expect(screen.getByRole("radio", { name: /بمساعدة/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /اللعب الحر/ })).toBeTruthy();
  });
});

describe("Observe → Understand → Act stepper (D14)", () => {
  const L = (en: string, ar: string, he: string) => ({ en, ar, he });
  const stepperOptions = {
    ...options,
    ai_domains: [
      { key: "social", icon: "🤝", label: L("Social", "الجانب الاجتماعي", "חברתי") },
      { key: "play", icon: "🧸", label: L("Play", "اللعب", "משחק") },
    ],
    observation_frequency: [
      { key: "once", label: L("Once", "مرة واحدة", "פעם אחת") },
      { key: "often", label: L("Often", "غالباً", "לעיתים קרובות") },
    ],
  };

  it("saves areas, how often / long / strongly, when_detail, needs, the plan link and what changed", async () => {
    let sent: Record<string, unknown> | null = null;
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "POST /api/children/c1/observations": (init) => {
        sent = JSON.parse(String(init?.body));
        return saved(sent!);
      },
    });
    renderApp({ routes, url: "/children/c1/observe", user: teacher, options: stepperOptions });

    fireEvent.change(await screen.findByLabelText(/What happened\?/), { target: { value: "Stood at the edge of the train game" } });
    fireEvent.click(screen.getByRole("button", { name: /More details/ }));

    // A: what I see + areas + how often / how long / how strongly
    expect(screen.getByText(/Describe the facts without interpreting/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("What do I see?"), { target: { value: "Watched for a minute, then joined" } });
    fireEvent.click(screen.getByRole("button", { name: /Social/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Often" }));
    fireEvent.change(screen.getByLabelText(/About how long/), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("radio", { name: "Strongly" }));

    // B: when
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("At what time?"), { target: { value: "09:30" } });
    fireEvent.click(screen.getByRole("radio", { name: /Yard/ }));
    fireEvent.change(screen.getByLabelText("With whom?"), { target: { value: "Lina" } });

    // C: what the child may need (7 chips + other)
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const stageC = screen.getByRole("group", { name: "What might the child need?" });
    expect(within(stageC).getAllByRole("button").length).toBe(7);
    fireEvent.click(within(stageC).getByRole("button", { name: /Adult guidance/ }));
    fireEvent.change(screen.getByLabelText("Something else the child may need"), { target: { value: "A friend to start with" } });

    // D: what we will do, linked to a Current Focus
    fireEvent.click(screen.getByRole("button", { name: /Step D/ }));
    fireEvent.change(screen.getByLabelText("What will we do?"), { target: { value: "Invite Lina to join him" } });
    fireEvent.click(screen.getByRole("radio", { name: "Joining group play" }));

    // E: did anything change
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.queryByLabelText("What changed?")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    fireEvent.change(screen.getByLabelText("What changed?"), { target: { value: "Joined after a minute" } });
    fireEvent.change(screen.getByLabelText("Documentation"), { target: { value: "Second morning in a row" } });

    // Going back keeps what was written.
    fireEvent.click(screen.getByRole("button", { name: /Step A/ }));
    expect((screen.getByLabelText("What do I see?") as HTMLTextAreaElement).value).toBe("Watched for a minute, then joined");

    fireEvent.click(screen.getByRole("button", { name: /Save observation/ }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toMatchObject({
      observation: "Stood at the edge of the train game",
      domains: ["social"],
      attributes: { frequency: "often", duration_minutes: 5, intensity: "strong" },
      details: {
        what_i_see: "Watched for a minute, then joined",
        when_detail: { time: "09:30", activity: "yard", with_whom: "Lina" },
        needs: { helps: ["adult_mediation"], text: "A friend to start with" },
        what_we_did: "Invite Lina to join him",
        plan_ref: { focus_area_id: "f1" },
        did_it_change: "yes",
        what_changed: "Joined after a minute",
        documentation: "Second morning in a row",
      },
    });
    expect(sent).not.toHaveProperty("focus_area_id");
    expect(JSON.stringify(sent)).not.toMatch(/score|points|\d+\s*%/i);
  });

  it("sends no details when the stepper is left empty", async () => {
    let sent: Record<string, unknown> | null = null;
    mockFetch({
      "GET /api/children/c1": { body: { child: adam } },
      "POST /api/children/c1/observations": (init) => {
        sent = JSON.parse(String(init?.body));
        return saved(sent!);
      },
    });
    renderApp({ routes, url: "/children/c1/observe", user: teacher, options: stepperOptions });
    fireEvent.change(await screen.findByLabelText(/What happened\?/), { target: { value: "Smiled at arrival" } });
    fireEvent.click(screen.getByRole("button", { name: /More details/ }));
    fireEvent.click(screen.getByRole("button", { name: /Step E/ }));
    fireEvent.click(screen.getByRole("button", { name: /Save observation/ }));
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).not.toHaveProperty("details");
    expect(sent).not.toHaveProperty("attributes");
    expect(sent).not.toHaveProperty("domains");
  });

  it("renders the stepper in Hebrew with RTL arrows and letters", async () => {
    mockFetch({ "GET /api/children/c1": { body: { child: adam } } });
    renderApp({ routes, url: "/children/c1/observe", user: { ...teacher, language: "he" }, locale: "he", options: stepperOptions });
    fireEvent.click(await screen.findByRole("button", { name: /פרטים נוספים/ }));
    expect(screen.getByText("תצפית ← הבנה ← פעולה")).toBeTruthy();
    expect(screen.getByLabelText("מה אני רואה?")).toBeTruthy();
    expect(screen.getByRole("button", { name: /שלב ה/ })).toBeTruthy();
  });
});

describe("/observe child picker", () => {
  it("lists recent children first, filters by search and links to the form", async () => {
    rememberChild("c2");
    mockFetch({ "GET /api/children": { body: { children: [adamCard, mayaCard], classes: [] } } });
    renderApp({ routes, url: "/observe", user: teacher, options });

    const recent = await screen.findByRole("region", { name: "Recently observed" });
    expect(within(recent).getByRole("link").getAttribute("href")).toBe("/children/c2/observe");
    const all = screen.getByRole("region", { name: "All children" });
    expect(within(all).getAllByRole("link")).toHaveLength(2);

    fireEvent.change(screen.getByLabelText("Search for a child"), { target: { value: "ada" } });
    expect(screen.queryByRole("region", { name: "Recently observed" })).toBeNull();
    const links = within(screen.getByRole("region", { name: "All children" })).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/children/c1/observe"]);
  });

  it("is the centre action of the phone bottom bar", async () => {
    mockFetch({ "GET /api/children": { body: { children: [], classes: [] } } });
    renderApp({ routes, url: "/observe", user: teacher, options });
    expect(await screen.findByText("There are no children yet.")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "Observation" });
    expect(links.some((a) => a.getAttribute("href") === "/observe")).toBe(true);
  });
});
