import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GamePlayer } from "@/features/games";
import { PLAYER_FIXTURES } from "./fixtures";
import { CastProvider, NO_CAST, StoryPlayer, VideoSlideshow, castDeep, castResolver, type ContentCast, type Story, type VideoPlan } from "./index";

const cast: ContentCast = {
  child: { name: "Adam", has_photo: true, updated_at: "v1" },
  people: [
    { token: "{grandfather}", relation: "grandfather", person_id: "p1", display_name: "Sido", has_photo: true, updated_at: "v2" },
    { token: "{friend}", relation: "friend", person_id: "p2", display_name: "Rami", has_photo: false, updated_at: "v3" },
    { token: "{sister}", relation: "sister", person_id: null, display_name: null, has_photo: false, updated_at: null },
  ],
};
const resolver = castResolver(cast, "c1", (r) => (r === "sister" ? "Sister" : ""));
const SIDO = "/api/people/p1/photo?v=v2";
const ADAM = "/api/children/c1/photo?v=v1";

describe("castResolver", () => {
  it("puts the names in place of the placeholders", () => {
    expect(resolver.text("{grandfather} and {friend} came to see Adam.")).toBe("Sido and Rami came to see Adam.");
    // A person removed since is named by the relation.
    expect(resolver.text("Hello {sister}!")).toBe("Hello Sister!");
    // Unknown placeholders stay as they are.
    expect(resolver.text("{uncle} waves")).toBe("{uncle} waves");
  });

  it("finds the photos a text mentions, in reading order (people by placeholder, the child by name)", () => {
    expect(resolver.photos("Adam hugs {grandfather}.")).toEqual([ADAM, SIDO]);
    expect(resolver.photos("{grandfather} and {friend}")).toEqual([SIDO]); // Rami has no photo
    expect(resolver.photos("A quiet morning.")).toEqual([]);
  });

  it("adds a photo to game choices that name a person", () => {
    const game = { template: "story_builder", steps: [{ prompt: "Who comes along?", choices: [{ label: "{grandfather}", emoji: "👴" }, { label: "Lion", emoji: "🦁" }] }] };
    const out = castDeep(game, resolver);
    expect(out.steps[0]!.choices).toEqual([{ label: "Sido", emoji: "👴", photo: SIDO }, { label: "Lion", emoji: "🦁" }]);
    expect(game.steps[0]!.choices[0]!.label).toBe("{grandfather}"); // the input is not changed
  });

  it("is a no-op without people or a child photo", () => {
    expect(castResolver({ child: { name: "Adam", has_photo: false }, people: [] }, "c1")).toBe(NO_CAST);
    expect(castResolver(null, "c1")).toBe(NO_CAST);
  });
});

describe("players with the people of the child's life", () => {
  afterEach(() => vi.useRealTimers());

  it("the story shows the names and, on a page that mentions them, their photos", () => {
    const base = PLAYER_FIXTURES.en.story;
    const story: Story = { ...base, story: ["{grandfather} came to the garage with Adam.", ...base.story.slice(1)] };
    render(
      <CastProvider value={resolver}>
        <StoryPlayer story={story} lang="en" />
      </CastProvider>,
    );
    const page = screen.getByTestId("story-page");
    expect(page.textContent).toContain("Sido came to the garage with Adam.");
    expect(page.textContent).not.toContain("{grandfather}");
    const photos = [...screen.getByTestId("photo-stack").querySelectorAll("img")];
    expect(photos.map((img) => img.getAttribute("src"))).toEqual([SIDO, ADAM]);
    expect(screen.queryByTestId("story-illustration")).toBeNull();
    // Page 2 names only the child: the child's photo.
    fireEvent.click(screen.getByTestId("story-next"));
    expect([...screen.getByTestId("photo-stack").querySelectorAll("img")].map((i) => i.getAttribute("src"))).toEqual([ADAM]);
    // Page 4 names no one: the emoji.
    fireEvent.click(screen.getByTestId("story-next"));
    fireEvent.click(screen.getByTestId("story-next"));
    expect(screen.getByTestId("story-illustration")).toBeTruthy();
  });

  it("a game card that names a person shows their photo and name", () => {
    const game = {
      template: "story_builder",
      title: "Build a story",
      steps: [
        { prompt: "Who comes along?", choices: [{ label: "{grandfather}", emoji: "👴" }, { label: "Lion", emoji: "🦁" }] },
        { prompt: "Where?", choices: [{ label: "Park", emoji: "🌳" }, { label: "Sea", emoji: "🌊" }] },
        { prompt: "Then?", choices: [{ label: "Sing", emoji: "🎵" }, { label: "Dance", emoji: "💃" }] },
      ],
      closing_prompt: "Now tell your story!",
    };
    render(
      <CastProvider value={resolver}>
        <GamePlayer game={game} lang="en" />
      </CastProvider>,
    );
    const card = screen.getByTestId("story-choice-0");
    expect(card.textContent).toContain("Sido");
    expect(within(card).getByTestId("choice-photo").getAttribute("src")).toBe(SIDO);
    expect(within(screen.getByTestId("story-choice-1")).queryByTestId("choice-photo")).toBeNull();
  });

  it("the video plays as a narrated slideshow, scene by scene, to the end", () => {
    vi.useFakeTimers();
    const base = PLAYER_FIXTURES.en.video;
    const plan: VideoPlan = {
      ...base,
      duration_seconds: 30,
      scenes: [
        { description: "One", narration: "{grandfather} opens the garage door.", visual_prompt: "a garage", emoji: "🚗" },
        { description: "Two", narration: "Everyone builds together.", visual_prompt: "blocks", emoji: "🧱" },
      ],
    };
    const onFinish = vi.fn();
    render(
      <CastProvider value={resolver}>
        <VideoSlideshow plan={plan} lang="en" onFinish={onFinish} />
      </CastProvider>,
    );
    expect(screen.getByTestId("slideshow-narration").textContent).toBe("Sido opens the garage door.");
    expect(within(screen.getByTestId("slideshow-scene")).getByTestId("photo-stack")).toBeTruthy();

    // jsdom has no speech synthesis: each scene stays for its share of the duration (at least 4 s).
    fireEvent.click(screen.getByTestId("slideshow-play"));
    expect(screen.getByTestId("slideshow-play").getAttribute("data-playing")).toBe("true");
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.getByTestId("slideshow-narration").textContent).toBe("Everyone builds together.");
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.getByTestId("slideshow-again")).toBeTruthy();
    expect(onFinish).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("slideshow-again"));
    expect(screen.getByTestId("slideshow-narration").textContent).toBe("Sido opens the garage door.");
    fireEvent.click(screen.getByTestId("slideshow-play")); // pause
    fireEvent.click(screen.getByTestId("slideshow-next"));
    expect(screen.getByTestId("slideshow-narration").textContent).toBe("Everyone builds together.");
    fireEvent.click(screen.getByTestId("slideshow-back"));
    expect(screen.getByTestId("slideshow-narration").textContent).toBe("Sido opens the garage door.");
  });

  it("the slideshow follows the content language (RTL)", () => {
    const he = PLAYER_FIXTURES.he.video;
    render(<VideoSlideshow plan={he} lang="he" />);
    const root = screen.getByTestId("video-slideshow");
    expect(root.getAttribute("dir")).toBe("rtl");
    expect(screen.getByTestId("slideshow-narration").textContent).toBe(he.scenes[0]!.narration);
  });
});
