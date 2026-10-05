import type { ReactNode } from "react";
import { MessageCircleHeart } from "lucide-react";
import { useUser } from "@/auth/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter } from "@/components/ui/Card";
import { Chip, toneGlyph } from "@/components/ui/Chip";
import { BlockCluster, EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Spinner";
import { ContentIcon, InterestsIcon, ParentHomeIcon, StrengthsIcon } from "@/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import { childDisplayName, childPhoto, className, parentChild, parentChildren, type ParentChild, type ProfileItem } from "./types";

const MAX_CHIPS = 5;

function ItemChips({ items, list, tone, title, icon }: { items: ProfileItem[]; list: string; tone: "strength" | "interest"; title: string; icon: ReactNode }) {
  const { t } = useI18n();
  const { item, optionLabel } = useOptions();
  const shown = items.slice(0, MAX_CHIPS);
  const rest = items.length - shown.length;
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-sm [&_svg]:size-[18px]", tone === "strength" ? "bg-strength-soft" : "bg-interest-soft")} aria-hidden>
          {icon}
        </span>
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {shown.map((it, i) => {
          const key = typeof it === "string" ? it : (it.key ?? null);
          const label = typeof it === "string" ? optionLabel(list, it) : it.key ? optionLabel(list, it.key) : (it.label ?? it.custom ?? "");
          if (!label) return null;
          return (
            <Chip key={`${key ?? label}-${i}`} tone={tone} icon={toneGlyph(tone, key ? item(list, key)?.icon : undefined)}>
              {label}
            </Chip>
          );
        })}
        {rest > 0 && <Chip tone="neutral" className="tabular">{t("parent.home.more", { count: rest })}</Chip>}
      </div>
    </div>
  );
}

function ChildCard({ child: listed }: { child: ParentChild }) {
  const { t } = useI18n();
  // The list rows carry basics only; the detail (GET /api/children/{id}) adds strengths and interests.
  const needsDetail = listed.strengths === undefined || listed.interests === undefined;
  const detail = useFetch<unknown>(needsDetail ? `/api/children/${encodeURIComponent(listed.id)}` : null);
  const child: ParentChild = { ...listed, ...(parentChild(detail.data) ?? {}) };
  const { formatAge } = useFormat();
  const name = childDisplayName(child);
  const age = child.birth_date
    ? formatAge(child.birth_date)
    : child.age && typeof child.age.years === "number"
      ? t("common.age.years", { count: child.age.years })
      : null;
  const cls = className(child);
  const strengths = child.strengths ?? [];
  const interests = child.interests ?? [];

  return (
    <Card className="overflow-hidden" data-testid={`parent-child-${child.id}`}>
      <CardBody className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar name={name} src={childPhoto(child)} size="xl" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-title truncate font-semibold text-ink" dir="auto">
              {name}
            </h2>
            {(age || cls) && (
              <p className="text-caption tabular text-ink-muted">
                {age}
                {age && cls ? " · " : null}
                {cls && <span dir="auto">{cls}</span>}
              </p>
            )}
          </div>
        </div>

        {strengths.length > 0 && (
          <ItemChips items={strengths} list="strengths" tone="strength" title={t("parent.home.strengths", { name })} icon={<StrengthsIcon />} />
        )}
        {interests.length > 0 && (
          <ItemChips items={interests} list="interests" tone="interest" title={t("parent.home.interests")} icon={<InterestsIcon />} />
        )}
        {strengths.length === 0 && interests.length === 0 && <p className="text-sm text-ink-muted">{t("parent.home.noProfileYet", { name })}</p>}
      </CardBody>
      <CardFooter className="justify-stretch bg-tray sm:justify-end">
        <ButtonLink to={paths.parentOnboarding(child.id)} className="flex-1 sm:flex-none" icon={<MessageCircleHeart aria-hidden />}>
          {t("parent.home.tellUs")}
        </ButtonLink>
        <ButtonLink to={paths.parentChildContent(child.id)} variant="secondary" className="flex-1 sm:flex-none" icon={<ContentIcon aria-hidden />}>
          {t("parent.home.shared")}
        </ButtonLink>
      </CardFooter>
    </Card>
  );
}

/** /parent: the parent's home with one warm card per linked child. */
export function ParentHomePage() {
  const { t } = useI18n();
  const user = useUser();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload } = useFetch<unknown>("/api/children");
  const children = parentChildren(data);
  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-end justify-between gap-4 md:mb-8">
        <div className="min-w-0">
          <h1 className="font-display text-display-lg font-semibold text-ink" dir="auto">
            {t("parent.home.greeting", { name: firstName })}
          </h1>
          <p className="mt-1 text-base text-ink-muted">{t("parent.home.subtitle")}</p>
        </div>
        <BlockCluster />
      </div>

      {error ? (
        <Alert tone="error" action={<Button size="sm" variant="secondary" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      ) : loading && data === undefined ? (
        <PageSkeleton />
      ) : children.length === 0 ? (
        <EmptyState icon={<ParentHomeIcon />} title={t("parent.home.noChildren")} description={t("parent.home.noChildrenHint")} />
      ) : (
        <div className="space-y-5">
          {children.map((c) => (
            <ChildCard key={c.id} child={c} />
          ))}
        </div>
      )}
    </div>
  );
}
