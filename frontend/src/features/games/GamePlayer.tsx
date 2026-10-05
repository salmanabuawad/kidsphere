import { useMemo, useState } from "react";
import type { AppLocale } from "@/i18n/config";
import { contentDir, type Dir } from "@/features/player/content-locale";
import { parseGame } from "@/features/player/parse";
import { PlayerFallback } from "@/features/player/PlayerFallback";
import type { Game } from "@/features/player/types";
import { Categorize } from "./Categorize";
import { ChoiceRounds } from "./ChoiceRounds";
import { FinishScreen } from "./FinishScreen";
import { MatchPairs } from "./MatchPairs";
import { Sequence } from "./Sequence";
import { StoryBuilder } from "./StoryBuilder";
import type { TemplateProps } from "./template-props";

export type GamePlayerProps = {
  /** Game data from the API. Validated with parseGame; malformed data shows a friendly fallback. */
  game: Game | unknown;
  /** Content language: drives direction, the player strings and the sequence order. */
  lang: AppLocale;
  /** Overrides the direction derived from `lang`. */
  dir?: Dir;
  /** Called every time the child reaches the finish screen. */
  onFinish?: () => void;
};

function Template({ game, ...rest }: TemplateProps<Game>) {
  switch (game.template) {
    case "multiple_choice":
    case "emotion_choice":
    case "what_happens_next":
      return <ChoiceRounds game={game} {...rest} />;
    case "match_pairs":
      return <MatchPairs game={game} {...rest} />;
    case "sequence":
      return <Sequence game={game} {...rest} />;
    case "categorize":
      return <Categorize game={game} {...rest} />;
    case "story_builder":
      return <StoryBuilder game={game} {...rest} />;
  }
}

/** Renders one of the 7 game templates (switching on `template`), then the shared finish screen. */
export function GamePlayer({ game: raw, lang, dir: dirProp, onFinish }: GamePlayerProps) {
  const dir = contentDir(lang, dirProp);
  const game = useMemo(() => parseGame(raw), [raw]);
  const [replay, setReplay] = useState(0);
  const [finished, setFinished] = useState(false);

  return (
    <div dir={dir} lang={lang} className="flex min-h-[70vh] flex-col" data-testid="game-player" data-template={game?.template ?? "invalid"}>
      {!game ? (
        <PlayerFallback lang={lang} />
      ) : finished ? (
        <FinishScreen
          lang={lang}
          onPlayAgain={() => {
            setReplay((r) => r + 1);
            setFinished(false);
          }}
        />
      ) : (
        <Template
          key={replay}
          game={game}
          lang={lang}
          dir={dir}
          replay={replay}
          onDone={() => {
            setFinished(true);
            onFinish?.();
          }}
        />
      )}
    </div>
  );
}
