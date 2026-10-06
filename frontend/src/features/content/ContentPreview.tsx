/**
 * Renders one content row with the shared players (WP-10): StoryPlayer,
 * ActivityCard, the video (a narrated slideshow, plus the plan for teachers) or GamePlayer.
 * The language of the content (not the UI) drives direction and player strings.
 * The people of the child's life in it (`cast`) are shown by name and photo.
 */
import { useMemo } from "react";
import { MessagesSquare } from "lucide-react";
import { GamePlayer } from "@/features/games";
import {
  ActivityCard,
  CastProvider,
  StoryPlayer,
  VideoPlanView,
  VideoSlideshow,
  castResolver,
  toContentLocale,
  useCast,
  type Activity,
  type CastResolver,
  type Story,
  type VideoPlan,
} from "@/features/player";
import { pick } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { discussionPrompts, type ContentDetail } from "./api";

/**
 * The content body as the players expect it. Parents receive stories without
 * the teacher-only `teacher_note`; the story parser needs one, so a placeholder
 * is filled in (it is never shown: the child/parent view hides the note).
 */
export function playerBody(item: ContentDetail): Record<string, unknown> {
  const body = item.content ?? {};
  if (item.content_type === "story" && (typeof body.teacher_note !== "string" || !body.teacher_note.trim())) {
    return { ...body, teacher_note: "-" };
  }
  return body;
}

/**
 * The people of one content item for the players: names and photos in place of the
 * placeholders. A person removed since is named by the relation, in the content language.
 */
export function useContentCast(item: ContentDetail): CastResolver {
  const { item: option } = useOptions();
  const lang = toContentLocale(item.language);
  return useMemo(
    () => castResolver(item.cast, item.child_id, (relation) => (relation ? pick(option("person_relations", relation)?.label, lang) : "")),
    [item.cast, item.child_id, option, lang],
  );
}

export function ContentPreview({
  item,
  audience = "teacher",
  onFinish,
}: {
  item: ContentDetail;
  /** "teacher" shows the teacher note and the video plan; "child" hides adult-only parts (present mode, parents). */
  audience?: "teacher" | "child";
  onFinish?: () => void;
}) {
  const lang = toContentLocale(item.language);
  const body = playerBody(item);
  const cast = useContentCast(item);
  let player;
  switch (item.content_type) {
    case "story":
      player = (
        <div className="space-y-6">
          <StoryPlayer story={body as unknown as Story} lang={lang} showTeacherNote={audience === "teacher"} onFinish={onFinish} />
          <DiscussionPrompts content={body} lang={lang} />
        </div>
      );
      break;
    case "real_world_activity":
      player = <ActivityCard activity={body as unknown as Activity} lang={lang} />;
      break;
    case "video":
      player = (
        <div className="space-y-8">
          <VideoSlideshow plan={body as unknown as VideoPlan} lang={lang} onFinish={onFinish} />
          {audience === "teacher" && <VideoPlanView plan={body as unknown as VideoPlan} lang={lang} status={item.video_status ?? "script_ready"} />}
        </div>
      );
      break;
    default:
      player = <GamePlayer game={body} lang={lang} onFinish={onFinish} />;
  }
  return <CastProvider value={cast}>{player}</CastProvider>;
}

/** The 3 discussion prompts of a small pack (stored on the story). */
export function DiscussionPrompts({ content, lang }: { content: unknown; lang: string }) {
  const { t } = useI18n();
  const cast = useCast();
  const prompts = discussionPrompts(content);
  if (prompts.length === 0) return null;
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-tray p-5" data-testid="discussion-prompts">
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
        <MessagesSquare className="size-5 text-brand" aria-hidden />
        {t("content.review.discussion")}
      </h3>
      <ul className="space-y-2" lang={lang}>
        {prompts.map((p, i) => (
          <li key={i} dir="auto" className="rounded-md bg-surface px-4 py-3 text-lg text-ink">
            {cast.text(p)}
          </li>
        ))}
      </ul>
    </section>
  );
}
