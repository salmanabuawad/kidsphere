import { Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { ButtonLink } from "@/components/ui";
import { ObserveAddIcon } from "@/icons";
import { INTL_LOCALE } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { KindergartenChip, themeLook, type Kindergarten } from "@/lib/kindergarten";
import { paths } from "@/lib/paths";
import { cn } from "@/lib/utils";

/** "morning" before 12:00, "afternoon" before 17:00, else "evening" (local time). */
export function partOfDay(now: Date = new Date()): "morning" | "afternoon" | "evening" {
  const h = now.getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

/**
 * The teacher home's hero: a greeting by the time of day, today's date, the kindergarten (its
 * painted chip), one plain line about today and the two everyday actions, beside a small
 * garden built from block primitives in the kindergarten's paint. The stems grow and the
 * blooms are placed once on load; nothing loops (and nothing moves under reduced motion).
 */
export function HomeHero({ kindergartens, waiting, now = new Date() }: { kindergartens: Kindergarten[]; waiting: boolean; now?: Date }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const first = (user?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: "long", day: "numeric", month: "long" }).format(now);
  const theme = kindergartens[0]?.theme ?? null;

  return (
    <section
      className="animate-placed relative mb-6 flex flex-wrap items-center gap-6 overflow-hidden rounded-xl border border-line bg-surface p-5 md:p-7"
      aria-labelledby="home-greeting"
      data-testid="home-hero"
    >
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {kindergartens.map((k) => (
            <KindergartenChip key={k.name} kindergarten={k} />
          ))}
          <span className="text-caption text-ink-muted">{date}</span>
        </div>
        <h1 id="home-greeting" className="font-display text-display-lg md:text-display-xl font-semibold text-ink">
          {first ? t(`children.home.${partOfDay(now)}`, { name: first }) : t("children.list.title")}
        </h1>
        <p className="max-w-[46ch] text-lg text-ink-muted">{waiting ? t("children.home.waiting") : t("children.home.question")}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <ButtonLink to={paths.observe()} size="lg" icon={<ObserveAddIcon aria-hidden />} className="[--icon-paint:transparent]">
            {t("children.home.observe")}
          </ButtonLink>
          <ButtonLink to={paths.newChild()} size="lg" variant="secondary" icon={<Plus className="size-5" aria-hidden />}>
            {t("children.list.add")}
          </ButtonLink>
        </div>
      </div>
      <Garden theme={theme} />
    </section>
  );
}

const STEMS = [
  { x: 60, y: 92, h: 76, cy: 80, r: 22, bloom: "", delay: 120 },
  { x: 132, y: 112, h: 56, cy: 100, r: 18, bloom: "fill-paint-sun", delay: 200 },
  { x: 204, y: 72, h: 96, cy: 60, r: 24, bloom: "fill-paint-grape", delay: 280 },
];

/** The garden: three block-icon flowers, a bridge arch, two blocks, a ball and a roof (decorative). */
function Garden({ theme }: { theme: string | null }) {
  const own = themeLook(theme).fill;
  return (
    <svg
      aria-hidden
      viewBox="0 0 420 200"
      className="h-auto w-full max-w-[420px] flex-[0_1_420px]"
      fill="none"
      stroke="var(--ink)"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-testid="home-garden"
      data-theme={theme ?? "default"}
    >
      <rect x="6" y="168" width="408" height="26" rx="10" className="fill-tray" />
      <path d="M290 168v-58a40 40 0 0 1 80 0v58" className="fill-brand-soft" />
      {STEMS.map((s) => (
        <g key={s.x}>
          <rect
            x={s.x}
            y={s.y}
            width="8"
            height={s.h}
            rx="4"
            className="animate-grow origin-bottom fill-paint-leaf [transform-box:fill-box]"
            style={{ animationDelay: `${s.delay}ms` }}
          />
          <circle cx={s.x + 4} cy={s.cy} r={s.r} className={cn("animate-placed [transform-box:fill-box]", s.bloom || own)} style={{ animationDelay: `${s.delay + 300}ms` }} />
          <circle
            cx={s.x + 4}
            cy={s.cy}
            r={Math.round(s.r / 2.8)}
            className={cn("animate-placed [transform-box:fill-box]", s.bloom === "fill-paint-sun" ? "fill-paint-tangerine" : "fill-paint-sun")}
            style={{ animationDelay: `${s.delay + 380}ms` }}
          />
        </g>
      ))}
      <rect x="236" y="138" width="30" height="30" rx="6" className="fill-paint-sky" />
      <rect x="248" y="110" width="26" height="28" rx="6" className="fill-paint-tangerine" />
      <circle cx="330" cy="150" r="13" className="fill-paint-sun" />
      <path d="M380 64l12-14 12 14z" className="fill-paint-berry" />
    </svg>
  );
}
