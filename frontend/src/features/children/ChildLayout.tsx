import { useState, type ReactNode } from "react";
import { FileDown, Languages, Pencil, School } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Alert, BackLink, Badge, BlockCluster, Button, ButtonLink, Card, PageSkeleton, TabNav } from "@/components/ui";
import { ClassesIcon, ParentHomeIcon } from "@/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useOptions } from "@/lib/options";
import { CHILD_TABS, childTabPath, paths } from "@/lib/paths";
import { useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { childUrl, displayName } from "./api";
import { ChildAvatar } from "./ChildAvatar";
import { EditBasicsDialog } from "./EditBasicsDialog";
import { PhotoButton, PhotoDialog } from "./PhotoDialog";
import type { ChildBasics, ChildDetail } from "./types";

/**
 * The 8 child profile tabs (X-33; COVERAGE-MATRIX §5.1) in logical order: Overview · Parent
 * View · Teacher Observation · Plan · Activities · Observations · Development · Reports.
 * The track scrolls sideways on phones and follows the reading direction (RTL mirrors it).
 * Staff only: parents never see these tabs.
 */
export function ChildTabs({ childId }: { childId: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  if (user?.role !== "teacher" && user?.role !== "admin") return null;
  return (
    <TabNav
      label={t("children.child.tabs.label")}
      tabs={CHILD_TABS.map((tab) => ({
        key: tab,
        to: childTabPath(tab, childId),
        end: tab === "overview",
        // One line per tab: with 8 tabs the track scrolls sideways instead of wrapping labels.
        label: <span className="whitespace-nowrap">{t(`children.child.tabs.${tab}`)}</span>,
      }))}
    />
  );
}

/**
 * Child header (the profile hero, spec 6.7): photo or initials block (with the photo
 * control for staff), the name in the display face, age, class and kindergarten,
 * languages, one decorative block cluster, "Edit details" and "Export PDF" (staff; it
 * opens the Reports tab, which hosts the export dialog).
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
            {child.class?.kindergarten && (
              <span className="inline-flex items-center gap-1.5" data-testid="child-kindergarten">
                <School className="size-4" aria-hidden />
                <span className="sr-only">{t("children.child.kindergarten")}: </span>
                <span dir="auto">{child.class.kindergarten}</span>
              </span>
            )}
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
            <ButtonLink to={paths.childReports(child.id)} variant="secondary" icon={<FileDown aria-hidden />}>
              {t("children.child.exportPdf")}
            </ButtonLink>
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
