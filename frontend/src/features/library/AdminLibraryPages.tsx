/**
 * Admin: manage the content library.
 * /admin/library — collections with their items, every status; new and edit collection dialogs.
 * /admin/library/items/new?collection= — a new item: its details, then the content in the editor.
 * /admin/library/items/:id — edit the details and the content, preview, publish / unpublish / archive.
 * Teachers only see published items of published collections (features/library/LibraryPages).
 */
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Archive, ChevronRight, LibraryBig, Pencil, Plus, Save, Send, Undo2 } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Dialog,
  EmptyState,
  Field,
  Input,
  PageHeader,
  PageSkeleton,
  Select,
  Skeleton,
  Tabs,
  Textarea,
} from "@/components/ui";
import type { Tone } from "@/components/ui/Badge";
import { ContentEditor, ContentPreview, type ContentDetail } from "@/features/content";
import { TypeIcon, typeKey } from "@/features/content/ui";
import { LOCALE_NAMES, LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { paths } from "@/lib/paths";
import { useAction, useErrorMessage } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import {
  adminLibraryUrl,
  createCollection,
  createItem,
  libraryItemUrl,
  updateCollection,
  updateItem,
  type Audience,
  type ItemBody,
  type ItemResponse,
  type LibraryCollection,
  type LibraryItem,
  type LibraryResponse,
  type LibraryStatus,
} from "./api";

const STATUS_TONE: Record<LibraryStatus, Tone> = { draft: "attention", published: "success", archived: "muted" };
const TYPES = ["story", "real_world_activity", "digital_game", "video"] as const;
const GAME_TEMPLATES = ["multiple_choice", "match_pairs", "sequence", "emotion_choice", "categorize", "what_happens_next", "story_builder"] as const;

function StatusBadge({ status }: { status: LibraryStatus }) {
  const { t } = useI18n();
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{t(`library.status.${status}`)}</Badge>;
}

/** An item as the shared editor and player expect it. */
function asContent(item: { id: string; content_type: string; template: string | null; language: string; title: string; content?: Record<string, unknown> | null }): ContentDetail {
  return { id: item.id, content_type: item.content_type, template: item.template, language: item.language, title: item.title, status: "draft", content: item.content ?? null };
}

export function AdminLibraryPage() {
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const { data, error, loading, reload } = useFetch<LibraryResponse>(adminLibraryUrl);
  const [dialog, setDialog] = useState<null | "new" | LibraryCollection>(null);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        icon={<LibraryBig />}
        title={t("library.admin.title")}
        description={t("library.admin.intro")}
        actions={
          <Button onClick={() => setDialog("new")} icon={<Plus className="size-4" aria-hidden />}>
            {t("library.admin.newCollection")}
          </Button>
        }
      />
      {error ? (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      ) : loading && !data ? (
        <Skeleton className="h-40" />
      ) : !data || data.collections.length === 0 ? (
        <EmptyState scene="search" title={t("library.admin.empty")} />
      ) : (
        <div className="space-y-6">
          {data.collections.map((c) => (
            <Card key={c.id} data-testid="admin-collection">
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <span dir="auto">{c.title}</span>
                    <StatusBadge status={c.status} />
                  </span>
                }
                description={c.ages ? <span dir="auto">{c.ages}</span> : undefined}
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setDialog(c)} icon={<Pencil className="size-4" aria-hidden />}>
                      {t("library.admin.editCollection")}
                    </Button>
                    <Link
                      to={paths.adminLibraryNewItem(c.id)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-sm font-semibold text-brand hover:underline"
                    >
                      <Plus className="size-4" aria-hidden />
                      {t("library.admin.newItem")}
                    </Link>
                  </div>
                }
              />
              <CardBody>
                {c.items.length === 0 ? (
                  <p className="text-sm text-ink-muted">{t("library.admin.noItems")}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {c.items.map((i) => (
                      <li key={i.id}>
                        <Link to={paths.adminLibraryItem(i.id)} className="flex min-h-11 items-center gap-3 py-2" data-testid="admin-item">
                          <TypeIcon type={i.content_type} size="sm" />
                          <span className="min-w-0 flex-1 truncate font-medium text-ink" dir="auto">
                            {i.title}
                          </span>
                          <StatusBadge status={i.status} />
                          <ChevronRight className="size-4 shrink-0 text-ink-muted rtl:-scale-x-100" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      <CollectionDialog
        key={dialog === null ? "closed" : dialog === "new" ? "new" : dialog.id}
        collection={dialog !== null && dialog !== "new" ? dialog : null}
        open={dialog !== null}
        onClose={() => setDialog(null)}
        onSaved={() => {
          setDialog(null);
          reload();
        }}
      />
    </div>
  );
}

function CollectionDialog({
  collection,
  open,
  onClose,
  onSaved,
}: {
  collection: LibraryCollection | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const [title, setTitle] = useState(collection?.title ?? "");
  const [ages, setAges] = useState(collection?.ages ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [status, setStatus] = useState<LibraryStatus>(collection?.status ?? "draft");
  async function save() {
    const body = { title: title.trim(), ages: ages.trim() || null, description: description.trim() || null };
    await run(() => (collection ? updateCollection(collection.id, { ...body, status }) : createCollection(body)), {
      success: t("library.admin.saved"),
      onSuccess: onSaved,
    });
  }
  return (
    <Dialog
      open={open}
      onClose={() => !pending && onClose()}
      title={collection ? t("library.admin.editCollection") : t("library.admin.newCollection")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void save()} loading={pending} disabled={!title.trim()} icon={<Save className="size-4" aria-hidden />}>
            {t("library.admin.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("library.admin.collectionTitle")} required>
          {(p) => <Input {...p} dir="auto" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label={`${t("library.admin.ages")} (${t("common.optional")})`}>
          {(p) => <Input {...p} dir="auto" maxLength={80} value={ages} onChange={(e) => setAges(e.target.value)} />}
        </Field>
        <Field label={`${t("library.admin.description")} (${t("common.optional")})`}>
          {(p) => <Textarea {...p} dir="auto" rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        {collection && (
          <Field label={t("library.admin.statusLabel")}>
            {(p) => (
              <Select {...p} value={status} onChange={(e) => setStatus(e.target.value as LibraryStatus)}>
                {(["draft", "published", "archived"] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`library.status.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>
    </Dialog>
  );
}

type Details = { collection_id: string; language: string; hero: string; audience: Audience; target_strength: string };

function detailsOf(item: LibraryItem): Details {
  return {
    collection_id: item.collection_id,
    language: item.language,
    hero: item.hero ?? "",
    audience: item.audience,
    target_strength: item.target_strength ?? "",
  };
}

function detailsBody(d: Details): ItemBody {
  return { collection_id: d.collection_id, language: d.language, hero: d.hero.trim() || null, audience: d.audience, target_strength: d.target_strength || null };
}

function DetailsFields({ value, onChange, collections }: { value: Details; onChange: (d: Details) => void; collections: LibraryCollection[] }) {
  const { t } = useI18n();
  const { list, optionLabel } = useOptions();
  const set = <K extends keyof Details>(key: K, v: Details[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("library.admin.collection")}>
        {(p) => (
          <Select {...p} value={value.collection_id} onChange={(e) => set("collection_id", e.target.value)}>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("library.admin.language")}>
        {(p) => (
          <Select {...p} value={value.language} onChange={(e) => set("language", e.target.value)}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={`${t("library.admin.hero")} (${t("common.optional")})`} hint={t("library.admin.heroHint")}>
        {(p) => <Input {...p} dir="auto" maxLength={40} value={value.hero} onChange={(e) => set("hero", e.target.value)} />}
      </Field>
      <Field label={t("library.admin.audienceLabel")}>
        {(p) => (
          <Select {...p} value={value.audience} onChange={(e) => set("audience", e.target.value as Audience)}>
            <option value="child">{t("library.audience.child")}</option>
            <option value="group">{t("library.audience.group")}</option>
          </Select>
        )}
      </Field>
      <Field label={`${t("library.admin.strength")} (${t("common.optional")})`}>
        {(p) => (
          <Select {...p} value={value.target_strength} onChange={(e) => set("target_strength", e.target.value)}>
            <option value="">{t("library.admin.noStrength")}</option>
            {list("strength_targets").map((o) => (
              <option key={o.key} value={o.key}>
                {optionLabel("strength_targets", o.key)}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </div>
  );
}

export function AdminLibraryNewItemPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const listing = useFetch<LibraryResponse>(adminLibraryUrl);
  const collections = listing.data?.collections ?? [];
  const [type, setType] = useState<(typeof TYPES)[number]>("story");
  const [template, setTemplate] = useState<(typeof GAME_TEMPLATES)[number]>("multiple_choice");
  const [details, setDetails] = useState<Details | null>(null);
  if (!listing.data) return listing.loading ? <PageSkeleton /> : null;
  if (collections.length === 0) return <EmptyState scene="search" title={t("library.admin.empty")} />;
  const value = details ?? {
    collection_id: collections.some((c) => c.id === params.get("collection")) ? params.get("collection")! : collections[0]!.id,
    language: "ar",
    hero: "",
    audience: "child" as Audience,
    target_strength: "",
  };
  const draft = asContent({ id: "new", content_type: type, template: type === "digital_game" ? template : null, language: value.language, title: "" });
  draft.content = type === "digital_game" ? { template } : {};
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader back={{ to: paths.adminLibrary(), label: t("library.admin.title") }} icon={<LibraryBig />} title={t("library.admin.newItem")} />
      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("library.admin.type")}>
              {(p) => (
                <Select {...p} value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}>
                  {TYPES.map((k) => (
                    <option key={k} value={k}>
                      {t(`content.types.${k}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {type === "digital_game" && (
              <Field label={t("library.admin.template")}>
                {(p) => (
                  <Select {...p} value={template} onChange={(e) => setTemplate(e.target.value as (typeof GAME_TEMPLATES)[number])}>
                    {GAME_TEMPLATES.map((k) => (
                      <option key={k} value={k}>
                        {t(`content.templates.${k}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </div>
          <DetailsFields value={value} onChange={setDetails} collections={collections} />
        </CardBody>
      </Card>
      <ContentEditor
        key={`${type}:${template}:${value.language}`}
        item={draft}
        save={(content) => createItem({ ...detailsBody(value), content_type: type, content }).then((r) => ({ content: asContent(r.item) }))}
        onSaved={(c) => navigate(paths.adminLibraryItem(c.id), { replace: true })}
        onCancel={() => navigate(paths.adminLibrary())}
      />
    </div>
  );
}

export function AdminLibraryItemPage() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const toMessage = useErrorMessage();
  const listing = useFetch<LibraryResponse>(adminLibraryUrl);
  const { data, error, loading, reload, setData } = useFetch<ItemResponse>(libraryItemUrl(id));
  const item = data?.item;
  if (!item || !listing.data) {
    if (error)
      return error.status === 404 ? (
        <EmptyState scene="search" title={t("library.notFound")} />
      ) : (
        <Alert tone="error" action={<Button size="sm" variant="outline" onClick={reload}>{t("common.retry")}</Button>}>
          {toMessage(error)}
        </Alert>
      );
    return loading || listing.loading ? <PageSkeleton /> : null;
  }
  return <ItemEditor key={item.id} item={item} collections={listing.data.collections} onChange={(next) => setData({ item: next })} />;
}

function ItemEditor({ item, collections, onChange }: { item: LibraryItem; collections: LibraryCollection[]; onChange: (i: LibraryItem) => void }) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const [details, setDetails] = useState<Details>(() => detailsOf(item));
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const type = typeKey(item.content_type);
  const setStatus = (status: LibraryStatus) =>
    run(() => updateItem(item.id, { status }), { success: t(`library.admin.statusToast.${status}`), onSuccess: (r) => onChange(r.item) });
  const saveDetails = () => run(() => updateItem(item.id, detailsBody(details)), { success: t("library.admin.saved"), onSuccess: (r) => onChange(r.item) });
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        back={{ to: paths.adminLibrary(), label: t("library.admin.title") }}
        icon={<TypeIcon type={type} size="sm" />}
        eyebrow={t(`content.types.${type}`)}
        title={<span dir="auto">{item.title}</span>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={item.status} />
            {item.status !== "published" && (
              <Button onClick={() => void setStatus("published")} disabled={pending} icon={<Send className="size-4 rtl:-scale-x-100" aria-hidden />}>
                {t("library.admin.publish")}
              </Button>
            )}
            {item.status === "published" && (
              <Button variant="outline" onClick={() => void setStatus("draft")} disabled={pending} icon={<Undo2 className="size-4" aria-hidden />}>
                {t("library.admin.unpublish")}
              </Button>
            )}
            {item.status !== "archived" && (
              <Button variant="ghost" onClick={() => void setStatus("archived")} disabled={pending} icon={<Archive className="size-4" aria-hidden />}>
                {t("library.admin.archive")}
              </Button>
            )}
          </div>
        }
      />
      <Card>
        <CardBody className="space-y-4">
          <DetailsFields value={details} onChange={setDetails} collections={collections} />
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => void saveDetails()} loading={pending} icon={<Save className="size-4" aria-hidden />}>
              {t("library.admin.saveDetails")}
            </Button>
          </div>
        </CardBody>
      </Card>
      <Tabs
        label={item.title}
        value={tab}
        onChange={(k) => setTab(k as "edit" | "preview")}
        tabs={[
          { key: "edit", label: t("library.admin.editTab") },
          { key: "preview", label: t("library.admin.previewTab") },
        ]}
      />
      {tab === "edit" ? (
        <ContentEditor
          key={item.updated_at ?? item.id}
          item={asContent(item)}
          save={(content) =>
            updateItem(item.id, { content }).then((r) => {
              onChange(r.item);
              return { content: asContent(r.item) };
            })
          }
          onSaved={() => undefined}
          onCancel={() => setTab("preview")}
        />
      ) : (
        <Card>
          <CardBody>
            <ContentPreview item={asContent(item)} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
