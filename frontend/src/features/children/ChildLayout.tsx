import { useState, type ReactNode } from "react";
import { Languages, Pencil } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Alert, BackLink, Badge, BlockCluster, Button, ButtonLink, Card, PageSkeleton, TabNav } from "@/components/ui";
import { ClassesIcon, ParentHomeIcon } from "@/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { childUrl, displayName } from "./api";
import { ChildAvatar } from "./ChildAvatar";
import { EditBasicsDialog } from "./EditBasicsDialog";
import { PhotoButton, PhotoDialog } from "./PhotoDialog";
import type { ChildBasics, ChildDetail } from "./types";

/** Profile / Timeline / Content / Development tabs of a child page. */
export function ChildTabs({ childId }: { childId: string }) {
  const { t } = useI18n();
  return (
    <TabNav
      label={t("children.child.tabs.label")}
      tabs={[
        { key: "profile", to: paths.child(childId), end: true, label: t("children.child.tabs.profile") },
        { key: "timeline", to: paths.childTimeline(childId), label: t("children.child.tabs.timeline") },
        { key: "content", to: paths.childContent(childId), label: t("children.child.tabs.content") },
        { key: "development", to: paths.childDevelopment(childId), label: t("children.child.tabs.development") },
      ]}
    />
  );
}

/**
 * Child header (the profile hero, spec 6.7): photo or initials block (with the photo
 * control for staff), the name in the display face, age, class, languages, one
 * decorative block cluster and "Edit details".
 */
export function ChildHeader({ child, onChanged }: { child: ChildBasics; onChanged?: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { formatAge } = useFormat();
  const { optionLabel } = useOptions();
  const [photoOpen, setPhotoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const staff = user?.role === "teacher" || user?.role === "admin";
  const name = displayName(child);
  const languages = [child.main_language, ...child.additional_languages.filter((l) => l !== child.main_language)];

  return (
    <div className="mb-4">
      <BackLink to={paths.children()} label={t("children.child.backToList")} className="mb-2" />
      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center md:p-5">
        <div className="relative self-center sm:self-auto">
          <ChildAvatar child={child} size="xl" />
          {staff && <PhotoButton hasPhoto={child.has_photo} onClick={() => setPhotoOpen(true)} />}
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-start">
          <h1 className="font-display text-display-lg font-semibold text-ink">
            <bdi>{name}</bdi>
          </h1>
          {child.preferred_name && child.preferred_name !== child.name && (
            <p className="text-sm text-ink-muted" dir="auto">
              {child.name}
            </p>
          )}
          <p className="tabular mt-1 text-base text-ink">{formatAge(child.birth_date)}</p>
          <div className="text-caption mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-ink-muted sm:justify-start">
            <span className="inline-flex items-center gap-1.5">
              <ClassesIcon className="size-4" paint={false} aria-hidden />
              <span dir="auto">{child.class ? child.class.name : t("children.child.noClass")}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Languages className="size-4" aria-hidden />
              <span className="sr-only">{t("children.child.languages")}: </span>
              {languages.map((l) => optionLabel("languages", l)).join(" · ")}
            </span>
          </div>
          {child.archived && (
            <Badge tone="muted" className="mt-2">
              {t("children.list.archived")}
            </Badge>
          )}
        </div>
        <BlockCluster className="self-center sm:self-start" />
        {staff && (
          <div className="flex flex-wrap justify-center gap-2 sm:flex-col sm:items-stretch">
            <Button variant="ghost" icon={<Pencil aria-hidden />} onClick={() => setEditOpen(true)}>
              {t("children.child.editBasics")}
            </Button>
            {user?.role === "admin" && (
              <ButtonLink to={paths.adminChildParents(child.id)} variant="ghost" icon={<ParentHomeIcon paint={false} aria-hidden />}>
                {t("children.child.parents")}
              </ButtonLink>
            )}
          </div>
        )}
      </Card>
      {staff && (
        <>
          <PhotoDialog child={child} open={photoOpen} onClose={() => setPhotoOpen(false)} onChanged={() => onChanged?.()} />
          <EditBasicsDialog child={child} open={editOpen} onClose={() => setEditOpen(false)} onSaved={() => onChanged?.()} />
        </>
      )}
    </div>
  );
}

/**
 * Frame for every child page: header + tabs. Pass `child` when the page already
 * loaded GET /api/children/{id}; otherwise the layout loads it.
 *
 *   <ChildLayout childId={id}>…timeline…</ChildLayout>
 */
export function ChildLayout({
  childId,
  child,
  onChanged,
  children,
}: {
  childId: string;
  child?: ChildDetail;
  onChanged?: () => void;
  children: ReactNode;
}) {
  const own = useFetch<{ child: ChildDetail }>(child ? null : childUrl(childId));
  const data = child ?? own.data?.child;
  const { t } = useI18n();
  const toMessage = useErrorMessage();

  if (!data) {
    if (own.error)
      return (
        <Alert
          tone="error"
          action={
            own.error.status !== 404 ? (
              <Button size="sm" variant="outline" onClick={own.reload}>
                {t("common.retry")}
              </Button>
            ) : (
              <ButtonLink size="sm" variant="outline" to={paths.children()}>
                {t("children.child.backToList")}
              </ButtonLink>
            )
          }
        >
          {toMessage(own.error)}
        </Alert>
      );
    return <PageSkeleton />;
  }
  return (
    <div>
      <ChildHeader
        child={data}
        onChanged={() => {
          onChanged?.();
          if (!child) own.reload();
        }}
      />
      <ChildTabs childId={childId} />
      {children}
    </div>
  );
}
