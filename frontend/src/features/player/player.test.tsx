import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LOCALES } from "@/i18n/config";
import { createTranslator } from "@/i18n/translate";
import { PLAYER_FIXTURES } from "./fixtures";
import { ActivityCard, parseActivity, parseStory, parseVideoPlan, PresentFrame, StoryPlayer, VideoPlanView, type Story } from "./index";

const SCORING = /\d+\s*%|\bscore|\bpoints\b|نقاط|נקודות|ניקוד|ציון/i;
const dirOf = (lang: string) => (lang === "en" ? "ltr" : "rtl");

describe("parsers", () => {
  it.each(LOCALES.map((l) => [l]))("accept the %s story, activity and video fixtures", (lang) => {
    const f = PLAYER_FIXTURES[lang];
    expect(parseStory(f.story)).toEqual(f.story);
    expect(parseActivity(f.activity)).toEqual(f.activity);
    expect(parseVideoPlan(f.video)).toEqual(f.video);
  });

  it("reject malformed content", () => {
    const story = PLAYER_FIXTURES.en.story;
    expect(parseStory(null)).toBeNull();
    expect(parseStory({ ...story, story: ["only one"] })).toBeNull();
    expect(parseStory({ ...story, illustrations: ["🚗", "🧱", "🙂", "🎉", "⭐"] })?.illustrations).toEqual(["🚗", "🧱", "🙂", "🎉"]);
    expect(parseStory({ ...story, illustrations: [""] })).toBeNull();
    expect(parseStory({ ...story, title: "" })).toBeNull();
    expect(parseActivity({ ...PLAYER_FIXTURES.en.activity, duration_minutes: 0 })).toBeNull();
    expect(parseActivity({ ...PLAYER_FIXTURES.en.activity, instructions: "do it" })).toBeNull();
    expect(parseVideoPlan({ ...PLAYER_FIXTURES.en.video, duration_seconds: 300 })).toBeNull();
  });
});

describe("StoryPlayer", () => {
  it.each(LOCALES.map((l) => [l]))("pages through the %s story to the discussion questions", (lang) => {
    const t = createTranslator(lang).t;
    const story = PLAYER_FIXTURES[lang].story;
    const onFinish = vi.fn();
    render(<StoryPlayer story={story} lang={lang} onFinish={onFinish} />);
    const root = screen.getByTestId("story-player");
    expect(root.getAttribute("dir")).toBe(dirOf(lang));
    expect(root.getAttribute("lang")).toBe(lang);

    story.story.forEach((paragraph, i) => {
      expect(screen.getByTestId("story-page").textContent).toContain(paragraph);
      expect(screen.getByTestId("story-illustration").textContent).toBe(story.illustrations![i]);
      fireEvent.click(screen.getByTestId("story-next"));
    });
    const questions = screen.getByTestId("story-questions");
    expect(questions.textContent).toContain(t("player.story.questionsTitle"));
    for (const q of story.questions) expect(questions.textContent).toContain(q);
    expect(onFinish).toHaveBeenCalledTimes(1);
    // The teacher note is for adults only.
    expect(screen.queryByTestId("story-teacher-note")).toBeNull();
    expect(document.body.textContent).not.toMatch(SCORING);

    fireEvent.click(screen.getByTestId("story-again"));
    expect(screen.getByTestId("story-page").textContent).toContain(story.story[0]);
  });

  it.each([
    ["en", "right", "left"],
    ["ar", "left", "right"],
    ["he", "left", "right"],
  ] as const)("%s: Next sits at the end side and its arrow points %s", (lang, nextArrow, backArrow) => {
    render(<StoryPlayer story={PLAYER_FIXTURES[lang].story} lang={lang} />);
    fireEvent.click(screen.getByTestId("story-next"));
    const nav = screen.getByRole("navigation");
    const buttons = Array.from(nav.children);
    // DOM order Back … Next inside a dir=rtl flex row puts Next on the left in ar/he.
    expect(buttons[0]).toBe(screen.getByTestId("story-back"));
    expect(buttons[buttons.length - 1]).toBe(screen.getByTestId("story-next"));
    expect(nav.closest("[dir]")!.getAttribute("dir")).toBe(dirOf(lang));
    expect(screen.getByTestId("story-next").querySelector("svg")!.getAttribute("data-arrow")).toBe(nextArrow);
    expect(screen.getByTestId("story-back").querySelector("svg")!.getAttribute("data-arrow")).toBe(backArrow);
  });

  it("Back returns to the previous page", () => {
    const story = PLAYER_FIXTURES.en.story;
    render(<StoryPlayer story={story} lang="en" />);
    fireEvent.click(screen.getByTestId("story-next"));
    expect(screen.getByTestId("story-page").textContent).toContain(story.story[1]);
    fireEvent.click(screen.getByTestId("story-back"));
    expect(screen.getByTestId("story-page").textContent).toContain(story.story[0]);
  });

  it("shows the teacher note only when asked", () => {
    const story = PLAYER_FIXTURES.en.story;
    render(<StoryPlayer story={story} lang="en" showTeacherNote />);
    story.story.forEach(() => fireEvent.click(screen.getByTestId("story-next")));
    expect(screen.getByTestId("story-teacher-note").textContent).toContain(story.teacher_note);
  });

  it("uses a default picture when there are no illustrations", () => {
    const { illustrations: _ignored, ...story } = PLAYER_FIXTURES.en.story;
    render(<StoryPlayer story={story as Story} lang="en" />);
    expect(screen.getByTestId("story-illustration").textContent).toBe("📖");
  });

  it("hides the listen button when the browser has no speech synthesis", () => {
    render(<StoryPlayer story={PLAYER_FIXTURES.en.story} lang="en" />);
    expect(screen.queryByTestId("story-listen")).toBeNull();
  });

  it("reads the page aloud locally in the content language", () => {
    const speak = vi.fn();
    const cancel = vi.fn();
    class Utterance {
      lang = "";
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }
    vi.stubGlobal("speechSynthesis", { speak, cancel });
    vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const story = PLAYER_FIXTURES.he.story;
    render(<StoryPlayer story={story} lang="he" />);
    fireEvent.click(screen.getByTestId("story-listen"));
    expect(speak).toHaveBeenCalledTimes(1);
    const u = speak.mock.calls[0]![0] as Utterance;
    expect(u.text).toBe(story.story[0]);
    expect(u.lang).toBe("he-IL");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders a friendly fallback for malformed stories", () => {
    render(<StoryPlayer story={{ title: "x" } as unknown as Story} lang="ar" />);
    expect(screen.getByTestId("player-fallback").textContent).toContain(createTranslator("ar").t("player.fallback.title"));
  });

  it("never renders content as HTML", () => {
    const story = { ...PLAYER_FIXTURES.en.story, story: ["<img src=x onerror=alert(1)> hello", "<b>bold</b>"], illustrations: ["🚗"] };
    const { container } = render(<StoryPlayer story={story} lang="en" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("story-page").textContent).toContain("<img src=x onerror=alert(1)> hello");
  });
});

describe("ActivityCard", () => {
  it.each(LOCALES.map((l) => [l]))("shows goal, duration, materials, numbered steps, what to observe and adaptation (%s)", (lang) => {
    const t = createTranslator(lang).t;
    const a = PLAYER_FIXTURES[lang].activity;
    render(<ActivityCard activity={a} lang={lang} />);
    const card = screen.getByTestId("activity-card");
    expect(card.getAttribute("dir")).toBe(dirOf(lang));
    const text = card.textContent ?? "";
    for (const s of [a.title, a.goal, a.adaptation, ...a.materials, ...a.instructions, ...a.what_to_observe]) expect(text).toContain(s);
    for (const k of ["goal", "materials", "steps", "observe", "adaptation"]) expect(text).toContain(t(`player.activity.${k}`));
    expect(text).toContain(t("player.activity.minutes", { count: a.duration_minutes }));
    const steps = within(card).getAllByRole("listitem").filter((li) => li.closest("ol"));
    expect(steps).toHaveLength(a.instructions.length);
    expect(steps[0]!.textContent).toBe(`1${a.instructions[0]}`);
    expect(card.className).toContain("ks-print-area");
  });

  it("prints with the browser print dialog", () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<ActivityCard activity={PLAYER_FIXTURES.en.activity} lang="en" />);
    fireEvent.click(screen.getByTestId("activity-print"));
    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe("VideoPlanView", () => {
  it.each(LOCALES.map((l) => [l]))("shows the script, scenes, status and the provider note (%s)", (lang) => {
    const t = createTranslator(lang).t;
    const plan = PLAYER_FIXTURES[lang].video;
    render(<VideoPlanView plan={plan} lang={lang} />);
    const root = screen.getByTestId("video-plan");
    expect(root.getAttribute("dir")).toBe(dirOf(lang));
    expect(root.textContent).toContain(plan.script);
    expect(screen.getAllByTestId("video-scene")).toHaveLength(plan.scenes.length);
    expect(screen.getByTestId("video-status").textContent).toContain(t("player.video.status.script_ready"));
    expect(screen.getByTestId("video-notice").textContent).toContain(t("player.video.providerNotConnected"));
  });

  it("takes a custom notice, or none", () => {
    const plan = PLAYER_FIXTURES.en.video;
    const { rerender } = render(<VideoPlanView plan={plan} lang="en" status="generating" notice="Custom note" />);
    expect(screen.getByTestId("video-notice").textContent).toBe("Custom note");
    rerender(<VideoPlanView plan={plan} lang="en" notice={null} />);
    expect(screen.queryByTestId("video-notice")).toBeNull();
  });
});

describe("PresentFrame", () => {
  it("exits only after a press and hold", () => {
    vi.useFakeTimers();
    try {
      const onExit = vi.fn();
      render(
        <PresentFrame lang="he" onExit={onExit}>
          <p>content</p>
        </PresentFrame>,
      );
      expect(screen.getByTestId("present-frame").getAttribute("dir")).toBe("rtl");
      const exit = screen.getByTestId("present-exit");
      fireEvent.pointerDown(exit);
      act(() => vi.advanceTimersByTime(300));
      fireEvent.pointerUp(exit);
      act(() => vi.advanceTimersByTime(2000));
      expect(onExit).not.toHaveBeenCalled();

      fireEvent.pointerDown(exit);
      act(() => vi.advanceTimersByTime(1300));
      expect(onExit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keyboard users can exit with Enter", () => {
    const onExit = vi.fn();
    render(
      <PresentFrame lang="en" onExit={onExit}>
        <p>content</p>
      </PresentFrame>,
    );
    fireEvent.keyDown(screen.getByTestId("present-exit"), { key: "Enter" });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
