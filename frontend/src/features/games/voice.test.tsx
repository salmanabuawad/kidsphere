import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "@/i18n/translate";
import { PLAYER_FIXTURES } from "@/features/player/fixtures";
import type { CategorizeGame, ChoiceGame, MatchPairsGame, StoryBuilderGame } from "@/features/player/types";
import { GamePlayer } from "./index";

/** A fake speechSynthesis that records what was said ("replace" cancels first). */
let said: { text: string; lang: string }[] = [];
let cancels = 0;

class FakeUtterance {
  lang = "";
  rate = 1;
  constructor(public text: string) {}
}

beforeEach(() => {
  said = [];
  cancels = 0;
  window.localStorage.removeItem("ks_game_voice");
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("speechSynthesis", {
    speak: (u: FakeUtterance) => said.push({ text: u.text, lang: u.lang }),
    cancel: () => (cancels += 1),
  });
});
afterEach(() => vi.unstubAllGlobals());

const t = createTranslator("en").t;
const click = (testId: string) => fireEvent.click(screen.getByTestId(testId));
const spokenText = () => said.map((s) => s.text).join(" | ");
/** Visible words: the text outside screen-reader-only elements. */
function visibleText(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".sr-only").forEach((n) => n.remove());
  return clone.textContent ?? "";
}

describe("games for children who cannot read yet", () => {
  it("speaks the intro and the question, and shows pictures without their names", () => {
    const game = PLAYER_FIXTURES.en.games.multiple_choice as ChoiceGame;
    render(<GamePlayer game={game} lang="en" />);
    const round = game.rounds[0]!;
    expect(spokenText()).toContain(round.question);
    if (game.intro) expect(spokenText()).toContain(game.intro);
    expect(said.every((s) => s.lang === "en-US")).toBe(true);

    const card = screen.getByTestId("choice-0");
    // The name is not written on a picture card, but the card is still named for screen readers.
    if (round.choices[0]!.emoji) {
      expect(visibleText(card)).not.toContain(round.choices[0]!.label);
      expect(card.getAttribute("aria-label")).toBe(round.choices[0]!.label);
    }
    // The question stays on screen for the adult, with a speaker to hear it again.
    expect(screen.getByTestId("round-question").textContent).toBe(round.question);
    said = [];
    click("listen");
    expect(spokenText()).toBe(round.question);
  });

  it("a tap says the card's name, then the feedback; the feedback is a picture", () => {
    const game = PLAYER_FIXTURES.en.games.multiple_choice as ChoiceGame;
    render(<GamePlayer game={game} lang="en" />);
    said = [];
    click("choice-0");
    const round = game.rounds[0]!;
    expect(said[0]!.text).toBe(round.choices[0]!.label);
    expect(spokenText()).toContain(t("player.game.greatIdea"));
    const status = screen.getByRole("status");
    expect(visibleText(status).trim()).toBe("");
    expect(status.textContent).toContain(t("player.game.greatIdea")); // still read by screen readers
    // Next is an arrow, not a word.
    expect(visibleText(screen.getByTestId("round-next")).trim()).toBe("");
    expect(screen.getByTestId("round-next").getAttribute("aria-label")).toBe(game.rounds.length > 1 ? t("player.next") : t("player.game.allDone"));
  });

  it("how to play is heard, not written, and the same feedback is said again on the next tap", () => {
    const game = PLAYER_FIXTURES.en.games.match_pairs as MatchPairsGame;
    render(<GamePlayer game={game} lang="en" />);
    expect(spokenText()).toContain(t("player.game.match.hint"));
    expect(visibleText(screen.getByTestId("game-match_pairs"))).not.toContain(t("player.game.match.hint"));
    click("match-a-0");
    click("match-b-1");
    click("match-a-0");
    said = [];
    click("match-b-1");
    expect(spokenText()).toContain(t("player.game.tryAnother"));
  });

  it("a basket says its name when tapped", () => {
    const game = PLAYER_FIXTURES.en.games.categorize as CategorizeGame;
    render(<GamePlayer game={game} lang="en" />);
    const item = game.items[0]!;
    click("categorize-item-0");
    said = [];
    click(`basket-${item.category}`);
    expect(said[0]!.text).toBe(game.categories.find((c) => c.key === item.category)!.label);
  });

  it("story builder: prompts are spoken, and the end invites the child to tell the story", () => {
    const game = PLAYER_FIXTURES.en.games.story_builder as StoryBuilderGame;
    render(<GamePlayer game={game} lang="en" />);
    expect(spokenText()).toContain(game.steps[0]!.prompt);
    game.steps.forEach(() => click("story-choice-0"));
    expect(spokenText()).toContain(t("player.game.storyBuilder.tellYourStory"));
    expect(visibleText(screen.getByTestId("story-builder-story"))).not.toContain(game.closing_prompt);
    click("story-builder-done");
    expect(spokenText()).toContain(t("player.finish.title"));
    expect(visibleText(screen.getByTestId("play-again")).trim()).toBe("");
  });

  it("sound off brings the words back, stays off on this device, and is silent", () => {
    const game = PLAYER_FIXTURES.en.games.match_pairs as MatchPairsGame;
    const { unmount } = render(<GamePlayer game={game} lang="en" />);
    click("sound-toggle");
    expect(screen.getByTestId("sound-toggle").getAttribute("aria-pressed")).toBe("false");
    expect(visibleText(screen.getByTestId("game-match_pairs"))).toContain(t("player.game.match.hint"));
    expect(screen.queryByTestId("listen")).toBeNull();
    unmount();

    said = [];
    render(<GamePlayer game={game} lang="en" />);
    expect(said).toEqual([]);
    expect(visibleText(screen.getByTestId("game-match_pairs"))).toContain(game.pairs[0]!.left.label);
  });

  it("a device that cannot speak shows every word and no sound switch", () => {
    vi.unstubAllGlobals();
    // jsdom has no speechSynthesis of its own.
    const game = PLAYER_FIXTURES.en.games.match_pairs as MatchPairsGame;
    render(<GamePlayer game={game} lang="en" />);
    expect(screen.queryByTestId("sound-toggle")).toBeNull();
    expect(visibleText(screen.getByTestId("game-match_pairs"))).toContain(t("player.game.match.hint"));
  });
});
