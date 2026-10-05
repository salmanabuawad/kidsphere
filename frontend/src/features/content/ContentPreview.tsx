/**
 * Renders one content row with the shared players (WP-10): StoryPlayer,
 * ActivityCard, VideoPlanView (with the video_status badge) or GamePlayer.
 * The language of the content (not the UI) drives direction and player strings.
 */
import { MessagesSquare } from "lucide-react";
import { GamePlayer } from "@/features/games";
import { ActivityCard, StoryPlayer, VideoPlanView, toContentLocale, type Activity, type Story, type VideoPlan } from "@/features/player";
import { useI18n } from "@/i18n/I18nProvider";
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

export function ContentPreview({
  item,
  audience = "teacher",
  onFinish,
}: {
  item: ContentDetail;
  /** "teacher" shows the teacher note; "child" hides adult-only parts (present mode, parents). */
  audience?: "teacher" | "child";
  onFinish?: () => void;
}) {
  const lang = toContentLocale(item.language);
  const body = playerBody(item);
  switch (item.content_type) {
    case "story":
      return (
        <div className="space-y-6">
          <StoryPlayer story={body as unknown as Story} lang={lang} showTeacherNote={audience === "teacher"} onFinish={onFinish} />
          <DiscussionPrompts content={body} lang={lang} />
        </div>
      );
    case "real_world_activity":
      return <ActivityCard activity={body as unknown as Activity} lang={lang} />;
    case "video":
      return <VideoPlanView plan={body as unknown as VideoPlan} lang={lang} status={item.video_status ?? "script_ready"} />;
    default:
      return <GamePlayer game={body} lang={lang} onFinish={onFinish} />;
  }
}

/** The 3 discussion prompts of a small pack (stored on the story). */
export function DiscussionPrompts({ content, lang }: { content: unknown; lang: string }) {
  const { t } = useI18n();
  const prompts = discussionPrompts(content);
  if (prompts.length === 0) return null;
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-5" data-testid="discussion-prompts">
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
        <MessagesSquare className="size-5 text-brand" aria-hidden />
        {t("content.review.discussion")}
      </h3>
      <ul className="space-y-2" lang={lang}>
        {prompts.map((p, i) => (
          <li key={i} dir="auto" className="rounded-xl bg-card px-4 py-3 text-lg text-ink">
            {p}
          </li>
        ))}
      </ul>
    </section>
  );
}
