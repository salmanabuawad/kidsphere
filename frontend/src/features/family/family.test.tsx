import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { User } from "@/auth/AuthProvider";
import type { AppRoute } from "@/lib/routing";
import { mockFetch, parent, renderApp, teacher } from "@/test/utils";
import type { Enrolment, Program } from "./api";
import { ParentJourneyCard } from "./ParentJourneyCard";
import { routes as adminRoutes } from "./routes";
import { TeacherJourneyCard } from "./TeacherJourneyCard";

const admin: User = { id: "u-admin", name: "Admin", email: "admin", role: "admin", language: "en" };

const program: Program = {
  id: "p1",
  title: { en: "Roots of Resilience", ar: "جذور المرونة", he: "שורשים של חוסן" },
  description: { en: "Eight weeks." },
  status: "published",
  weeks: [1, 2].map((n) => ({
    content_type: "home_activity" as const,
    topic: { en: `Topic ${n}`, ar: `موضوع ${n}` },
    lesson: { en: `Lesson ${n}` },
    try_at_home: { en: `Try ${n}` },
    reflection: { en: `Question ${n}?` },
  })),
};

const enrolment = (over: Partial<Enrolment> = {}): Enrolment => ({
  id: "e1",
  child_id: "c1",
  status: "active",
  started_on: "2026-11-02",
  current_week: 2,
  weeks_count: 2,
  program,
  reflections: [{ id: "r0", week: 2, author_role: "teacher", result: null, note: "Try the calm breath at bedtime.", created_at: "2026-11-09T10:00:00Z", by_name: "Rana" }],
  shared_content: [{ id: "h1", title: "At Home Together", content_type: "home_activity", approved_at: "2026-11-05T10:00:00Z" }],
  can_edit: false,
  ...over,
});

const NO_SCORES = /\d+\s*%|\bscore\b|\bpoints\b/i;

describe("Family journey", () => {
  it("parents see this week, the teacher's note and send a reflection", async () => {
    let sent: unknown = null;
    mockFetch({
      "GET /api/children/c1/family-programs": { body: { enrolments: [enrolment()] } },
      "POST /api/family-enrolments/e1/reflections": (init) => {
        sent = JSON.parse(String(init?.body));
        return { status: 201, body: { enrolment: enrolment() } };
      },
    });
    const routes: AppRoute[] = [{ path: "/x", element: <ParentJourneyCard childId="c1" /> }];
    renderApp({ routes, url: "/x", user: parent });
    expect(await screen.findByText("Week 2 of 2")).toBeTruthy();
    expect(screen.getByText("Topic 2")).toBeTruthy();
    expect(screen.getByTestId("teacher-guidance").textContent).toContain("calm breath");
    expect(screen.getByRole("link", { name: "At Home Together" }).getAttribute("href")).toBe("/parent/content/h1");
    fireEvent.click(screen.getByRole("radio", { name: "Partly" }));
    fireEvent.click(screen.getByRole("button", { name: "Send to the teacher" }));
    await waitFor(() => expect(sent).toEqual({ week: 2, result: "partly", note: null }));
    expect(document.body.textContent).not.toMatch(NO_SCORES);
  });

  it("teachers start a journey for the family", async () => {
    let body: unknown = null;
    let enrolled = false;
    mockFetch({
      "GET /api/children/c1/family-programs": () => ({ body: { enrolments: enrolled ? [enrolment({ can_edit: true })] : [] } }),
      "GET /api/family-programs": { body: { programs: [program] } },
      "POST /api/children/c1/family-programs": (init) => {
        body = JSON.parse(String(init?.body));
        enrolled = true;
        return { status: 201, body: { enrolment: enrolment({ can_edit: true }) } };
      },
    });
    const routes: AppRoute[] = [{ path: "/x", element: <TeacherJourneyCard childId="c1" /> }];
    renderApp({ routes, url: "/x", user: teacher });
    const card = await screen.findByTestId("teacher-journey");
    fireEvent.click(await within(card).findByRole("button", { name: "Start the journey" }));
    await waitFor(() => expect(body).toMatchObject({ program_id: "p1" }));
    expect(await screen.findByText("Week 2 of 2")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Create this week's/ })).toBeTruthy();
  });

  it("admins edit a program one language at a time", async () => {
    const sent: unknown[] = [];
    mockFetch({
      "GET /api/family-programs": { body: { programs: [program] } },
      "PUT /api/admin/family-programs/p1": (init) => {
        sent.push(JSON.parse(String(init?.body)));
        return { body: { program } };
      },
    });
    renderApp({ routes: adminRoutes, url: "/admin/family-programs", user: admin });
    expect(await screen.findByText("Roots of Resilience")).toBeTruthy();
    expect(screen.getByText("2 weeks")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editor = await screen.findByTestId("program-editor");
    fireEvent.change(within(editor).getByLabelText("Topic for parents"), { target: { value: "Feelings at home" } });
    fireEvent.click(within(editor).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent).toHaveLength(1));
    const weeks = (sent[0] as { weeks: { topic: Record<string, string> }[] }).weeks;
    expect(weeks[0]!.topic).toEqual({ en: "Feelings at home", ar: "موضوع 1" });
  });
});

describe("Parent Copilot", () => {
  it("gives curated ideas for a common situation and the safety answer when needed", async () => {
    const { CopilotPage } = await import("./CopilotPage");
    const answer = { title: "When your child gets angry at \"no\"", explanation: "Anger after a no is common.", steps: ["Stay calm.", "Name the feeling."], say: ["I see you are angry."], activity: "Play angry teddy.", see_professional: "Talk with the teacher if it is very frequent." };
    const bodies: unknown[] = [];
    mockFetch({
      "GET /api/children": { body: { children: [{ id: "c1", name: "Adam" }] } },
      "GET /api/copilot/topics": { body: { topics: [{ key: "angry_when_no", title: answer.title }] } },
      "POST /api/copilot/ask": (init) => {
        const b = JSON.parse(String(init?.body));
        bodies.push(b);
        if (b.question) return { body: { kind: "safety", article_key: null, source: "guidance", answer: { title: "Please get help now", explanation: "Call now.", steps: ["Police 100"], say: [], activity: null, see_professional: null }, topics: [], suggested_content: [] } };
        return { body: { kind: "guidance", article_key: "angry_when_no", source: "guidance", answer, topics: [], suggested_content: [{ id: "h1", title: "At Home Together", content_type: "home_activity" }] } };
      },
    });
    const routes: AppRoute[] = [{ path: "/parent/ideas", element: <CopilotPage /> }];
    renderApp({ routes, url: "/parent/ideas", user: parent });
    fireEvent.click(await screen.findByRole("button", { name: answer.title }));
    const card = await screen.findByTestId("copilot-answer");
    expect(within(card).getByText("Stay calm.")).toBeTruthy();
    expect(within(card).getByRole("link", { name: "At Home Together" })).toBeTruthy();
    expect(bodies[0]).toEqual({ child_id: "c1", language: "en", topic: "angry_when_no" });

    fireEvent.change(screen.getByPlaceholderText(/For example/), { target: { value: "someone hurts him" } });
    fireEvent.click(screen.getByRole("button", { name: "Get ideas" }));
    expect(await screen.findByTestId("safety-steps")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_SCORES);
  });
});

describe("Daily routines", () => {
  it("shows a picture schedule and saves a routine from a preset", async () => {
    const { RoutinesPage } = await import("./RoutinesPage");
    let posted: unknown = null;
    const routine = { id: "r1", child_id: "c1", title: "Our morning", steps: [{ emoji: "🌞", label: "Wake up" }, { emoji: "🥣", label: "Breakfast" }], created_by_role: "parent" };
    mockFetch({
      "GET /api/children/c1/routines": { body: { routines: [routine] } },
      "GET /api/routine-presets": { body: { presets: [{ key: "bedtime", title: "Our bedtime", steps: [{ emoji: "🛁", label: "Bath" }, { emoji: "🌙", label: "Sleep" }] }], emojis: ["🛁", "🌙"] } },
      "POST /api/children/c1/routines": (init) => {
        posted = JSON.parse(String(init?.body));
        return { status: 201, body: { routine: { ...routine, id: "r2" } } };
      },
    });
    const routes: AppRoute[] = [{ path: "/family/:id/routines", element: <RoutinesPage /> }];
    renderApp({ routes, url: "/family/c1/routines", user: parent });
    const card = await screen.findByTestId("routine");
    const step = within(card).getByRole("button", { name: /Wake up/ });
    fireEvent.click(step);
    expect(step.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Our bedtime" }));
    const editor = await screen.findByTestId("routine-editor");
    fireEvent.click(within(editor).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posted).toEqual({ title: "Our bedtime", steps: [{ emoji: "🛁", label: "Bath" }, { emoji: "🌙", label: "Sleep" }] }));
  });
});

describe("Pilot", () => {
  it("parents answer the start questionnaire", async () => {
    let sent: unknown = null;
    mockFetch({
      "GET /api/children/c1/family-programs": { body: { enrolments: [enrolment({ questionnaires: [] })] } },
      "GET /api/family-questionnaire": { body: { questions: [{ key: "routines", text: "Our day has calm routines.", options: [{ key: "rarely", label: "Rarely" }, { key: "often", label: "Often" }] }] } },
      "POST /api/family-enrolments/e1/questionnaire": (init) => {
        sent = JSON.parse(String(init?.body));
        return { status: 201, body: { kind: "baseline", answered: ["baseline"] } };
      },
    });
    const routes: AppRoute[] = [{ path: "/x", element: <ParentJourneyCard childId="c1" /> }];
    renderApp({ routes, url: "/x", user: parent });
    const form = await screen.findByTestId("questionnaire-baseline");
    fireEvent.click(within(form).getByRole("radio", { name: "Often" }));
    fireEvent.click(within(form).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sent).toEqual({ kind: "baseline", answers: { routines: "often" } }));
  });

  it("staff see plain counts only", async () => {
    const { OverviewPage } = await import("./OverviewPage");
    mockFetch({
      "GET /api/family-overview": {
        body: {
          programs: [{ id: "p1", title: { en: "Roots of Resilience" } }],
          journeys: { total: 3, by_status: { active: 2, completed: 1 }, by_kindergarten: [{ kindergarten: "Sunflower KG", count: 3 }] },
          weekly_reflections: [{ week: 1, families: 2 }],
          families_active_recently: 2,
          recent_days: 14,
          content: { home_reflections: 4, shared: 6, awaiting_approval: 1 },
          questionnaires: { baseline: 2, end: 1, answers: { baseline: { routines: { rarely: 1, often: 1 } }, end: { routines: { rarely: 0, often: 1 } } } },
        },
      },
      "GET /api/family-questionnaire": { body: { questions: [{ key: "routines", text: "Our day has calm routines.", options: [{ key: "rarely", label: "Rarely" }, { key: "often", label: "Often" }] }] } },
    });
    const routes: AppRoute[] = [{ path: "/family/overview", element: <OverviewPage /> }];
    renderApp({ routes, url: "/family/overview", user: teacher });
    expect(await screen.findByTestId("family-overview")).toBeTruthy();
    expect(screen.getByText("2 families")).toBeTruthy();
    expect(await screen.findByText("Our day has calm routines.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NO_SCORES);
  });
});
