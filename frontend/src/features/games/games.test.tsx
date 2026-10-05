import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "@/i18n/translate";
import { LOCALES, type AppLocale } from "@/i18n/config";
import { MALFORMED_GAMES, PLAYER_FIXTURES } from "@/features/player/fixtures";
import type { CategorizeGame, ChoiceGame, Game, MatchPairsGame, SequenceGame, StoryBuilderGame } from "@/features/player/types";
import { GAME_TEMPLATES, GamePlayer, parseGame } from "./index";

/** No scores, points or percentages anywhere a child can see (en/ar/he). */
const SCORING = /\d+\s*%|\bscore|\bpoints\b|نقاط|נקודות|ניקוד|ציון/i;

const click = (testId: string) => fireEvent.click(screen.getByTestId(testId));
const texts: string[] = [];
const snap = () => texts.push(document.body.textContent ?? "");

/** Plays a game to its end with taps only, recording the visible text along the way. */
function walk(game: Game) {
  switch (game.template) {
    case "multiple_choice":
    case "emotion_choice":
    case "what_happens_next":
      (game as ChoiceGame).rounds.forEach(() => {
        click("choice-0");
        snap();
        click("round-next");
      });
      break;
    case "match_pairs":
      (game as MatchPairsGame).pairs.forEach((_, i) => {
        click(`match-a-${i}`);
        click(`match-b-${i}`);
        snap();
      });
      break;
    case "sequence":
      (game as SequenceGame).items.forEach((_, i) => {
        click(`sequence-item-${i}`);
        snap();
      });
      break;
    case "categorize":
      (game as CategorizeGame).items.forEach((item, i) => {
        click(`categorize-item-${i}`);
        click(`basket-${item.category}`);
        snap();
      });
      break;
    case "story_builder":
      (game as StoryBuilderGame).steps.forEach(() => {
        click("story-choice-0");
        snap();
      });
      click("story-builder-done");
      break;
  }
}

describe("parseGame", () => {
  for (const lang of LOCALES)
    it.each(GAME_TEMPLATES.map((t) => [t]))(`accepts the ${lang} %s fixture`, (template) => {
      const game = parseGame(PLAYER_FIXTURES[lang].games[template]);
      expect(game?.template).toBe(template);
    });

  it.each(Object.keys(MALFORMED_GAMES).map((k) => [k]))("rejects malformed data: %s", (key) => {
    expect(parseGame(MALFORMED_GAMES[key])).toBeNull();
  });

  it("drops unknown keys and never keeps markup objects", () => {
    const g = parseGame({ ...PLAYER_FIXTURES.en.games.sequence, onClick: "alert(1)", html: "<b>x</b>" });
    expect(g).not.toBeNull();
    expect(Object.keys(g!).sort()).toEqual(["items", "template", "title"]);
  });
});

describe("GamePlayer fallback", () => {
  it.each(Object.keys(MALFORMED_GAMES).map((k) => [k]))("renders a friendly fallback for %s without throwing", (key) => {
    render(<GamePlayer game={MALFORMED_GAMES[key]} lang="en" />);
    expect(screen.getByTestId("player-fallback").textContent).toContain(createTranslator("en").t("player.fallback.title"));
    expect(screen.getByTestId("game-player").getAttribute("data-template")).toBe("invalid");
  });
});

describe("every template, every language: taps only, to the finish screen", () => {
  for (const lang of LOCALES) {
    const dir = lang === "en" ? "ltr" : "rtl";
    const t = createTranslator(lang as AppLocale).t;
    for (const template of GAME_TEMPLATES) {
      it(`${template} (${lang})`, () => {
        texts.length = 0;
        const game = PLAYER_FIXTURES[lang].games[template];
        const onFinish = vi.fn();
        render(<GamePlayer game={game} lang={lang} onFinish={onFinish} />);
        const root = screen.getByTestId("game-player");
        expect(root.getAttribute("dir")).toBe(dir);
        expect(root.getAttribute("lang")).toBe(lang);
        expect(root.getAttribute("data-template")).toBe(template);
        expect(screen.getByText(game.title)).toBeTruthy();
        snap();

        walk(game);

        expect(screen.getByTestId("finish-screen").textContent).toContain(t("player.finish.title"));
        expect(onFinish).toHaveBeenCalledTimes(1);
        snap();
        for (const text of texts) expect(text).not.toMatch(SCORING);

        click("play-again");
        expect(screen.queryByTestId("finish-screen")).toBeNull();
        expect(screen.getByText(game.title)).toBeTruthy();
      });
    }
  }
});

describe("choice rounds: gentle feedback", () => {
  const t = createTranslator("en").t;

  it("the preferred answer gets a warm message and the explanation", () => {
    const game = PLAYER_FIXTURES.en.games.multiple_choice as ChoiceGame;
    render(<GamePlayer game={game} lang="en" />);
    click("choice-0");
    expect(screen.getByRole("status").textContent).toContain(t("player.game.greatIdea"));
    expect(screen.getByRole("status").textContent).toContain(game.rounds[0]!.explanation);
  });

  it("another choice gets 'Let's think together', the explanation, and can be changed", () => {
    const game = PLAYER_FIXTURES.en.games.multiple_choice as ChoiceGame;
    render(<GamePlayer game={game} lang="en" />);
    click("choice-1");
    expect(screen.getByRole("status").textContent).toContain(t("player.game.thinkTogether"));
    expect(screen.getByRole("status").textContent).toContain(game.rounds[0]!.explanation);
    expect(screen.getByTestId("choice-0").getAttribute("data-state")).toBe("suggested");
    click("choice-0");
    expect(screen.getByRole("status").textContent).toContain(t("player.game.greatIdea"));
  });

  it("with no preferred answer every choice is welcomed", () => {
    render(<GamePlayer game={PLAYER_FIXTURES.en.games.emotion_choice} lang="en" />);
    click("choice-2");
    expect(screen.getByRole("status").textContent).toContain(t("player.game.thanks"));
  });

  it("shows no score, points, timer or right/wrong counters", () => {
    render(<GamePlayer game={PLAYER_FIXTURES.en.games.multiple_choice} lang="en" />);
    click("choice-1");
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/score|points|wrong|correct|timer|seconds|\d+\s*\/\s*\d+/i);
  });
});

describe("match pairs", () => {
  it("a mismatch is gentle and nothing is locked", () => {
    const t = createTranslator("en").t;
    render(<GamePlayer game={PLAYER_FIXTURES.en.games.match_pairs} lang="en" />);
    click("match-a-0");
    click("match-b-1");
    expect(screen.getByRole("status").textContent).toContain(t("player.game.tryAnother"));
    expect((screen.getByTestId("match-a-0") as HTMLButtonElement).disabled).toBe(false);
    click("match-b-0");
    click("match-a-0");
    expect((screen.getByTestId("match-a-0") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("match-b-0") as HTMLButtonElement).disabled).toBe(true);
  });

  it("the second column starts shuffled", () => {
    render(<GamePlayer game={PLAYER_FIXTURES.en.games.match_pairs} lang="en" />);
    const ids = within(screen.getByTestId("match-column-b"))
      .getAllByRole("button")
      .map((b) => b.getAttribute("data-testid"));
    expect(ids).not.toEqual(["match-b-0", "match-b-1", "match-b-2"]);
  });
});

describe("sequence", () => {
  it("a card tapped too early is not placed and gets a gentle hint", () => {
    const t = createTranslator("en").t;
    render(<GamePlayer game={PLAYER_FIXTURES.en.games.sequence} lang="en" />);
    click("sequence-item-2");
    expect(screen.getByRole("status").textContent).toContain(t("player.game.sequence.whatFirst"));
    expect(screen.queryAllByTestId("sequence-placed")).toHaveLength(0);
  });

  it("starts shuffled", () => {
    render(<GamePlayer game={PLAYER_FIXTURES.en.games.sequence} lang="en" />);
    const ids = within(screen.getByTestId("sequence-pool"))
      .getAllByRole("button")
      .map((b) => b.getAttribute("data-testid"));
    expect(ids).not.toEqual(["sequence-item-0", "sequence-item-1", "sequence-item-2", "sequence-item-3"]);
  });

  it.each([
    ["he", "rtl"],
    ["ar", "rtl"],
    ["en", "ltr"],
  ] as const)("the line follows the reading direction (%s → %s)", (lang, dir) => {
    const game = PLAYER_FIXTURES[lang].games.sequence as SequenceGame;
    render(<GamePlayer game={game} lang={lang} />);
    click("sequence-item-0");
    click("sequence-item-1");
    const track = screen.getByTestId("sequence-track");
    expect(track.getAttribute("dir")).toBe(dir);
    expect(track.className).toMatch(/\bflex-row\b/);
    expect(track.className).not.toMatch(/flex-row-reverse/);
    // DOM order = sequence order; with dir=rtl the first card sits on the right.
    const placed = within(track).getAllByTestId("sequence-placed");
    expect(placed.map((el) => el.textContent)).toEqual(game.items.slice(0, 2).map((i) => `${i.emoji}${i.label}`));
  });
});

describe("categorize (tap-to-place)", () => {
  it("tap a basket first → hint; wrong basket → gentle retry; right basket → placed", () => {
    const t = createTranslator("en").t;
    const game = PLAYER_FIXTURES.en.games.categorize as CategorizeGame;
    render(<GamePlayer game={game} lang="en" />);
    click("basket-animals");
    expect(screen.getByRole("status").textContent).toContain(t("player.game.categorize.pickFirst"));
    click("categorize-item-0"); // Bus → vehicles
    click("basket-animals");
    expect(screen.getByRole("status").textContent).toContain(t("player.game.categorize.again"));
    expect(screen.getByTestId("categorize-item-0")).toBeTruthy();
    click("basket-vehicles");
    expect(screen.queryByTestId("categorize-item-0")).toBeNull();
    expect(screen.getByTestId("basket-vehicles-items").textContent).toContain(game.items[0]!.label);
  });
});

describe("story builder", () => {
  it.each(LOCALES.map((l) => [l]))("assembles the child's story and invites them to tell it (%s)", (lang) => {
    const t = createTranslator(lang).t;
    const game = PLAYER_FIXTURES[lang].games.story_builder as StoryBuilderGame;
    render(<GamePlayer game={game} lang={lang} />);
    click("story-choice-1");
    click("story-builder-back");
    game.steps.forEach(() => click("story-choice-1"));
    const story = screen.getByTestId("story-builder-story");
    expect(story.textContent).toContain(t("player.game.storyBuilder.tellYourStory"));
    expect(screen.getByTestId("story-builder-closing").textContent).toContain(game.closing_prompt);
    const cards = within(story).getAllByTestId("story-builder-card");
    expect(cards.map((c) => c.textContent)).toEqual(game.steps.map((s) => `${s.choices[1]!.emoji}${s.choices[1]!.label}`));
    expect(screen.getByTestId("story-builder-cards").getAttribute("dir")).toBe(lang === "en" ? "ltr" : "rtl");
  });
});

describe("player strings", () => {
  it("child-facing strings never mention scores or points", () => {
    for (const lang of LOCALES) {
      const t = createTranslator(lang).t;
      for (const key of ["player.finish.title", "player.finish.body", "player.game.greatIdea", "player.game.thinkTogether", "player.game.thanks"])
        expect(t(key)).not.toMatch(SCORING);
    }
  });
});
