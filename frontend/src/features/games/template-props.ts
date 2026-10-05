import type { AppLocale } from "@/i18n/config";
import type { Dir } from "@/features/player/content-locale";

/** Props every game template receives from GamePlayer. */
export type TemplateProps<G> = {
  game: G;
  /** Content language (strings) and direction (layout, sequence order). */
  lang: AppLocale;
  dir: Dir;
  /** How many times "Play again" was pressed; reshuffles cards. */
  replay: number;
  /** The child reached the end of the game. */
  onDone: () => void;
};
