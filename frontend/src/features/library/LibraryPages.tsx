/**
 * /library — ready-made content (the Lulu stories, activities and games) grouped by collection.
 * /library/:id — preview an item with the real player and assign it to children: each child
 * gets a new draft, with the character's name replaced by the child's name unless kept.
 */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ChevronRight, LibraryBig, Send } from "lucide-react";
import { Alert, Button, Card, CardBody, Checkbox, Dialog, EmptyState, PageHeader, PageSkeleton, Skeleton } from "@/components/ui";
import { ChildPicker, toggleIn } from "@/features/children";
import { ContentPreview, type ContentDetail } from "@/features/content";
import { TypeIcon, typeKey } from "@/features/content/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { assignLibraryItem, libraryItemUrl, libraryUrl, type ItemResponse, type LibraryItem, type LibraryResponse } from "./api";
import { ItemTags, goalLabel } from "./LibraryTags";

export function LibraryPage() {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload } = useFetch<LibraryResponse>(libraryUrl);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader icon={<LibraryBig />} title={t("library.title")} description={t("library.intro")} />
      {error ? (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      ) : loading && !data ? (
        <Skeleton className="h-40" />
      ) : !data || data.collections.length === 0 ? (
        <EmptyState scene="search" title={t("library.empty")} />
      ) : (
        <div className="space-y-8">
          {data.collections.map((c) => {
            const items = c.items;
            if (items.length === 0) return null;
            return (
              <section key={c.id} aria-labelledby={`lib-${c.id}`} data-testid="library-collection">
                <h2 id={`lib-${c.id}`} className="text-lg font-semibold text-ink" dir="auto">
                  {c.title}
                </h2>
                {c.ages && (
                  <p className="mb-3 text-sm text-ink-muted" dir="auto">
                    {c.ages}
                  </p>
                )}
                <ul className="space-y-3">
                  {items.map((i) => (
                    <li key={i.id}>
                      <ItemRow item={i} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ItemRow({ item }: { item: LibraryItem }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const type = typeKey(item.content_type);
  const goals = (item.goals ?? []).map((g) => goalLabel(g, optionLabel));
  return (
    <Link
      to={paths.libraryItem(item.id)}
      className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-lip focus-visible:outline-offset-4"
      data-testid="library-row"
    >
      <TypeIcon type={type} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold text-ink" dir="auto">
          {item.title}
        </span>
        <span className="mt-1 block text-sm text-ink-muted">
          {t(`content.types.${type}`)} · {t(`library.audience.${item.audience === "group" ? "group" : "child"}`)}
        </span>
        {goals.length > 0 && (
          <span className="mt-1 block truncate text-sm text-ink" dir="auto" data-testid="row-goals">
            {goals.join(" · ")}
          </span>
        )}
      </span>
      <ChevronRight className="size-5 shrink-0 text-ink-muted rtl:-scale-x-100" aria-hidden />
    </Link>
  );
}

export function LibraryItemPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload } = useFetch<ItemResponse>(libraryItemUrl(id));
  const [open, setOpen] = useState(false);
  const item = data?.item;
  if (!item) {
    if (error)
      return error.status === 404 ? (
        <EmptyState scene="search" title={t("library.notFound")} />
      ) : (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      );
    return loading ? <PageSkeleton /> : null;
  }
  const type = typeKey(item.content_type);
  const preview: ContentDetail = {
    id: item.id,
    content_type: item.content_type,
    template: item.template,
    language: item.language,
    title: item.title,
    status: "approved",
    content: item.content ?? null,
    media: item.media ?? [],
  };
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ to: paths.library(), label: t("library.back") }}
        icon={<TypeIcon type={type} size="sm" />}
        eyebrow={t(`content.types.${type}`)}
        title={<span dir="auto">{item.title}</span>}
        actions={
          <Button onClick={() => setOpen(true)} icon={<Send className="size-4 rtl:-scale-x-100" aria-hidden />}>
            {t("library.assign")}
          </Button>
        }
      />
      {item.goal && (
        <p className="-mt-3 mb-5 text-base text-ink-muted" dir="auto">
          {item.goal}
        </p>
      )}
      <div className="mb-5">
        <ItemTags goals={item.goals ?? []} suits={item.suits ?? []} />
      </div>
      <Card>
        <CardBody>
          <ContentPreview item={preview} />
        </CardBody>
      </Card>
      <AssignDialog item={item} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function AssignDialog({ item, open, onClose }: { item: LibraryItem; open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pending, run } = useAction();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [useChildName, setUseChildName] = useState(true);
  const close = () => {
    if (pending) return;
    setSelected(new Set());
    onClose();
  };
  async function go() {
    const ids = [...selected];
    const r = await run(() => assignLibraryItem(item.id, ids, useChildName && !!item.hero), { success: t("library.assigned", { count: ids.length }) });
    if (r.ok) {
      setSelected(new Set());
      onClose();
      const first = r.data.content[0];
      if (ids.length === 1 && first) navigate(paths.content(first.id));
    }
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      title={t("library.assignTitle")}
      description={t("library.assignHint")}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void go()} loading={pending} disabled={selected.size === 0} icon={<Send className="size-4 rtl:-scale-x-100" aria-hidden />}>
            {t("library.assignConfirm", { count: selected.size })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {item.hero && (
          <Checkbox checked={useChildName} onChange={(e) => setUseChildName(e.target.checked)} label={t("library.useChildName", { hero: item.hero })} />
        )}
        {open && (
          <ChildPicker
            selected={selected}
            onToggle={(id, on) => setSelected((prev) => toggleIn(prev, id, on))}
            label={t("library.assignTitle")}
          />
        )}
      </div>
    </Dialog>
  );
}
