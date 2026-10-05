import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type EmptyScene = "children" | "observations" | "content" | "timeline" | "search";

/*
 * Block scenes (spec 6.18): 120×96, 3px `ink` strokes with round joins, a `line-strong`
 * floor at y88, at most two paints. Paint and ink come from the tokens, so they follow
 * the theme.
 */
const INK = "fill-none stroke-ink";
const FLOOR = <path d="M8 88H112" className="fill-none stroke-line-strong" />;

const SCENES: Record<EmptyScene, ReactNode> = {
  // The block corner is empty: a big arch block, a ball waiting beside it.
  children: (
    <>
      {FLOOR}
      <path d="M20 88V52a4 4 0 0 1 4-4h52a4 4 0 0 1 4 4v36H62a12 12 0 0 0-24 0Z" className="fill-paint-sky stroke-ink" />
      <circle cx="96" cy="78" r="10" className="fill-paint-sun stroke-ink" />
    </>
  ),
  // Nothing noticed yet: the observe lens resting by a ball.
  observations: (
    <>
      {FLOOR}
      <circle cx="44" cy="52" r="18" className="fill-paint-sky stroke-ink" />
      <path d="M57 65 70 78" className={INK} strokeWidth={7} />
      <path d="M36 52h16M44 44v16" className={INK} strokeWidth={4} />
      <circle cx="92" cy="78" r="10" className="fill-paint-sun stroke-ink" />
    </>
  ),
  // The toy box is waiting: an open, empty box and a ball outside it.
  content: (
    <>
      {FLOOR}
      <rect x="24" y="40" width="60" height="8" rx="3" transform="rotate(-12 24 48)" className="fill-none stroke-ink" />
      <rect x="24" y="52" width="60" height="36" rx="4" className="fill-paint-sky stroke-ink" />
      <path d="M24 62h60" className={INK} />
      <circle cx="98" cy="78" r="10" className="fill-paint-sun stroke-ink" />
    </>
  ),
  // The string is ready for its first bead: one baseline triangle, empty dashed beads.
  timeline: (
    <>
      {FLOOR}
      <path d="M8 48h6M34 48h16M70 48h16M106 48h6" className="fill-none stroke-line-strong" />
      <path d="M14 58 24 38l10 20Z" className="fill-paint-sun stroke-ink" />
      <circle cx="60" cy="48" r="10" className={INK} strokeDasharray="2 5" />
      <rect x="86" y="38" width="20" height="20" rx="4" className={INK} strokeDasharray="2 5" />
    </>
  ),
  // Nothing found: a puzzle-block outline with its knob painted.
  search: (
    <>
      {FLOOR}
      <path d="M48 44a8 8 0 1 1 16 0Z" className="fill-paint-sky stroke-ink" />
      <path d="M48 44h-6a6 6 0 0 0-6 6v28a6 6 0 0 0 6 6h28a6 6 0 0 0 6-6V50a6 6 0 0 0-6-6h-6" className={INK} />
    </>
  ),
};

/** A KidSphere block scene, decorative (the heading next to it carries the meaning). */
export function BlockScene({ scene, className }: { scene: EmptyScene; className?: string }) {
  return (
    <svg
      viewBox="0 0 120 96"
      width={120}
      height={96}
      className={cn("shrink-0", className)}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-scene={scene}
    >
      {SCENES[scene]}
    </svg>
  );
}

/**
 * Friendly empty state (spec 6.18): a block scene, a heading, one kind sentence and one
 * obvious action. Pass `scene` for the illustration; a plain `icon` still works for
 * places that have no scene yet: drawn at 48px with no tile, and a nav icon there takes
 * `paint-sky` (spec 5.2). A meaning icon keeps its own paint: pass it explicitly, e.g.
 * `<CurrentFocusIcon paint="var(--paint-grape)" />`.
 */
export function EmptyState({
  scene,
  icon,
  title,
  description,
  action,
  className,
}: {
  scene?: EmptyScene;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("animate-placed mx-auto flex w-full max-w-[420px] flex-col items-center px-6 py-8 text-center", className)}>
      {scene ? (
        <BlockScene scene={scene} className="mb-4" />
      ) : (
        icon && (
          <div className="mb-4 flex items-center justify-center text-ink [--icon-paint:var(--paint-sky)] [&_svg]:size-12" aria-hidden>
            {icon}
          </div>
        )
      )}
      <p className="font-display text-title font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-[40ch] text-base text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * The one decorative block cluster a screen may carry (spec 6.7, profile hero): a sun
 * ball, a sky block and a berry roof with 2px ink outlines. Hidden below 380px.
 */
export function BlockCluster({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 72 48"
      width={72}
      height={48}
      className={cn("shrink-0 max-[380px]:hidden", className)}
      strokeWidth={2}
      strokeLinejoin="round"
      aria-hidden
      data-scene="cluster"
    >
      <circle cx="12" cy="36" r="10" className="fill-paint-sun stroke-ink" />
      <rect x="24" y="24" width="22" height="22" rx="3" className="fill-paint-sky stroke-ink" />
      <path d="M49 46 59.5 25 70 46Z" className="fill-paint-berry stroke-ink" />
    </svg>
  );
}
