import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { BookOpen, ChevronLeft, Languages, LineChart, Pencil, School, Sparkles, UserRound, UsersRound } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Alert, Button, ButtonLink, Card, PageSkeleton, TabNav } from "@/components/ui";
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
        { key: "profile", to: paths.child(childId), end: true, label: t("children.child.tabs.profile"), icon: <UserRound className="size-4" aria-hidden /> },
        { key: "timeline", to: paths.childTimeline(childId), label: t("children.child.tabs.timeline"), icon: <BookOpen className="size-4" aria-hidden /> },
        { key: "content", to: paths.childContent(childId), label: t("children.child.tabs.content"), icon: <Sparkles className="size-4" aria-hidden /> },
        { key: "development", to: paths.childDevelopment(childId), label: t("children.child.tabs.development"), icon: <LineChart className="size-4" aria-hidden /> },
      ]}
    />
  );
}

/**
 * Child header: photo (with the photo control for staff), name, age, class,
 * languages and "Edit details".
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
      <Link to={paths.children()} className="-ms-1 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("children.child.backToList")}
      </Link>
      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="relative self-center sm:self-auto">
          <ChildAvatar child={child} size="xl" />
          {staff && <PhotoButton hasPhoto={child.has_photo} onClick={() => setPhotoOpen(true)} />}
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-start">
          <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl" dir="auto">
            {name}
          </h1>
          {child.preferred_name && child.preferred_name !== child.name && (
            <p className="text-sm text-muted" dir="auto">
              {child.name}
            </p>
          )}
          <p className="mt-1 text-base text-ink">{formatAge(child.birth_date)}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted sm:justify-start">
            <span className="inline-flex items-center gap-1.5">
              <School className="size-4" aria-hidden />
              <span dir="auto">{child.class ? child.class.name : t("children.child.noClass")}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Languages className="size-4" aria-hidden />
              <span className="sr-only">{t("children.child.languages")}: </span>
              {languages.map((l) => optionLabel("languages", l)).join(" · ")}
            </span>
          </div>
          {child.archived && <p className="mt-2 text-sm font-medium text-amber-800">{t("children.list.archived")}</p>}
        </div>
        {staff && (
          <div className="flex flex-wrap justify-center gap-2 sm:flex-col sm:items-stretch">
            <Button variant="outline" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditOpen(true)}>
              {t("children.child.editBasics")}
            </Button>
            {user?.role === "admin" && (
              <ButtonLink to={paths.adminChildParents(child.id)} variant="ghost" icon={<UsersRound className="size-4" aria-hidden />}>
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
