import type { ReactNode } from "react";
import { Heart, MessageCircleHeart, Sparkles, Star } from "lucide-react";
import { useUser } from "@/auth/AuthProvider";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Spinner";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { useFormat } from "@/lib/format";
import { childDisplayName, childPhoto, className, parentChild, parentChildren, type ParentChild, type ProfileItem } from "./types";

const MAX_CHIPS = 5;

function ItemChips({ items, list, tone, title, icon }: { items: ProfileItem[]; list: string; tone: "strength" | "interest"; title: string; icon: ReactNode }) {
  const { t } = useI18n();
  const { item, optionLabel } = useOptions();
  const shown = items.slice(0, MAX_CHIPS);
  const rest = items.length - shown.length;
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon}
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {shown.map((it, i) => {
          const key = typeof it === "string" ? it : (it.key ?? null);
          const label = typeof it === "string" ? optionLabel(list, it) : it.key ? optionLabel(list, it.key) : (it.label ?? it.custom ?? "");
          if (!label) return null;
          return (
            <Chip key={`${key ?? label}-${i}`} tone={tone} icon={key ? item(list, key)?.icon : undefined}>
              {label}
            </Chip>
          );
        })}
        {rest > 0 && <Chip tone="neutral">{t("parent.home.more", { count: rest })}</Chip>}
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
          <Avatar name={name} src={childPhoto(child)} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-ink" dir="auto">
              {name}
            </h2>
            {(age || cls) && (
              <p className="text-sm text-muted">
                {age}
                {age && cls ? " · " : null}
                {cls && <span dir="auto">{cls}</span>}
              </p>
            )}
          </div>
        </div>

        {strengths.length > 0 && (
          <ItemChips items={strengths} list="strengths" tone="strength" title={t("parent.home.strengths", { name })} icon={<Star className="size-3.5" aria-hidden />} />
        )}
        {interests.length > 0 && (
          <ItemChips items={interests} list="interests" tone="interest" title={t("parent.home.interests")} icon={<Sparkles className="size-3.5" aria-hidden />} />
        )}
        {strengths.length === 0 && interests.length === 0 && <p className="text-sm text-muted">{t("parent.home.noProfileYet", { name })}</p>}
      </CardBody>
      <CardFooter className="justify-stretch bg-brand-soft/50 sm:justify-end">
        <ButtonLink to={paths.parentOnboarding(child.id)} className="flex-1 sm:flex-none" icon={<MessageCircleHeart className="size-4" />}>
          {t("parent.home.tellUs")}
        </ButtonLink>
        <ButtonLink to={paths.parentChildContent(child.id)} variant="outline" className="flex-1 sm:flex-none" icon={<Heart className="size-4" />}>
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
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-[1.7rem]" dir="auto">
          {t("parent.home.greeting", { name: firstName })}
        </h1>
        <p className="mt-1 text-sm text-muted">{t("parent.home.subtitle")}</p>
      </div>

      {error ? (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      ) : loading && data === undefined ? (
        <PageSkeleton />
      ) : children.length === 0 ? (
        <EmptyState icon={<Heart />} title={t("parent.home.noChildren")} description={t("parent.home.noChildrenHint")} />
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
