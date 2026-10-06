import { useEffect, useRef, useState } from "react";
import { ImagePlus, Lock, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Alert, Button, Card, CardBody, CardHeader, Dialog, Field, Input, ToggleChip } from "@/components/ui";
import { MAX_PHOTO_BYTES, PHOTO_TYPES } from "@/features/children/api";
import { useI18n } from "@/i18n/I18nProvider";
import { useOptions } from "@/lib/options";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { cn } from "@/lib/utils";
import { createPerson, deletePerson, deletePersonPhoto, MAX_NAME, peopleUrl, updatePerson, uploadPersonPhoto, type PeopleResponse, type Person } from "./api";
import { PersonAvatar } from "./PersonAvatar";

/**
 * Overview card "People in {name}'s life": grandfather, a sister, a friend, a pet. Stories,
 * games and videos can include them with their photos; the AI only ever sees a placeholder
 * and the relation. Staff add, edit and remove them; parents see the list.
 */
export function PeopleCard({ childId, childName, canEdit }: { childId: string; childName: string; canEdit: boolean }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const { data, reload } = useFetch<PeopleResponse>(peopleUrl(childId));
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const people = data?.people ?? [];
  const full = data ? people.length >= data.max : false;

  if (!data) return null;
  if (!canEdit && people.length === 0) return null;

  return (
    <Card data-testid="people-card">
      <CardHeader
        icon={<Users />}
        title={t("people.title", { name: childName })}
        description={t("people.hint")}
        action={
          canEdit && (
            <Button size="sm" variant="outline" icon={<Plus className="size-4" aria-hidden />} onClick={() => setEditing("new")} disabled={full} data-testid="people-add">
              {t("people.add")}
            </Button>
          )
        }
      />
      <CardBody className="space-y-3">
        {people.length === 0 ? (
          <p className="text-ink-muted">{t("people.empty", { name: childName })}</p>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-3">
            {people.map((p, i) => (
              <li key={p.id} className="animate-placed" style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setEditing(p)}
                  className={cn("group flex w-28 flex-col items-center gap-1.5 rounded-lg p-2 text-center", canEdit && "hover:bg-tray")}
                  aria-label={canEdit ? t("people.editPerson", { name: p.display_name }) : undefined}
                  data-testid="person-tile"
                >
                  <span className="relative">
                    <PersonAvatar person={p} size="xl" className="size-[88px] rounded-full border-[3px] border-ink text-[34px]" />
                    {canEdit && (
                      <span aria-hidden className="absolute -end-1 bottom-0 flex size-8 items-center justify-center rounded-md border-[1.5px] border-line-strong bg-surface text-ink shadow-lip">
                        <Pencil className="size-4" />
                      </span>
                    )}
                  </span>
                  <span dir="auto" className="w-full truncate font-semibold text-ink">
                    {p.display_name}
                  </span>
                  <span className="text-caption w-full truncate text-ink-muted">{optionLabel("person_relations", p.relation)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-caption flex items-start gap-1.5 text-ink-muted">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("people.privacy")}
        </p>
        {full && canEdit && <p className="text-caption text-ink-muted">{t("people.full", { count: data.max })}</p>}
      </CardBody>
      {editing && (
        <PersonDialog
          childId={childId}
          childName={childName}
          person={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onChanged={reload}
        />
      )}
    </Card>
  );
}

/** Add or edit one person: who they are to the child, what the child calls them, an optional photo. */
export function PersonDialog({
  childId,
  childName,
  person,
  onClose,
  onChanged,
}: {
  childId: string;
  childName: string;
  person: Person | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const { list, labelOf } = useOptions();
  const save = useAction();
  const remove = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [relation, setRelation] = useState(person?.relation ?? "");
  const [name, setName] = useState(person?.display_name ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dropPhoto, setDropPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A local preview of the chosen file (blob: URL; nothing is uploaded before Save).
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onFile(f: File | undefined) {
    if (input.current) input.current.value = "";
    if (!f) return;
    if (f.type && !PHOTO_TYPES.includes(f.type)) return setError(t("children.photo.wrongType"));
    if (f.size > MAX_PHOTO_BYTES) return setError(t("children.photo.tooLarge"));
    setError(null);
    setDropPhoto(false);
    setFile(f);
  }

  const missing = !relation ? t("people.pickRelation") : !name.trim() ? t("people.enterName") : null;

  async function submit() {
    if (missing) return setError(missing);
    const body = { relation, display_name: name.trim() };
    const r = await save.run(
      async () => {
        const saved = person ? await updatePerson(person.id, body) : await createPerson(childId, body);
        const id = saved.person.id;
        if (file) await uploadPersonPhoto(id, file);
        else if (dropPhoto && person?.has_photo) await deletePersonPhoto(id);
        return saved;
      },
      { success: person ? t("people.saved") : t("people.added") },
    );
    if (r.ok) {
      onChanged();
      onClose();
    } else onChanged(); // a failed photo upload still created the person
  }

  const keepsPhoto = !!person?.has_photo && !dropPhoto && !file;
  const hasPhoto = !!file || keepsPhoto;

  return (
    <Dialog
      open
      onClose={onClose}
      title={person ? t("people.editTitle") : t("people.addTitle")}
      description={t("people.dialogHint", { name: childName })}
      footer={
        <>
          {person && (
            <Button
              variant="ghost"
              className="me-auto text-danger hover:text-danger"
              icon={<Trash2 className="size-4" aria-hidden />}
              loading={remove.pending}
              disabled={save.pending}
              onClick={() =>
                remove.run(() => deletePerson(person.id), {
                  success: t("people.removed"),
                  onSuccess: () => {
                    onChanged();
                    onClose();
                  },
                })
              }
              data-testid="person-remove"
            >
              {t("people.remove")}
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={save.pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} loading={save.pending} disabled={remove.pending} data-testid="person-save">
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">{t("people.relation", { name: childName })}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("people.relation", { name: childName })}>
            {list("person_relations").map((o) => (
              <ToggleChip key={o.key} single icon={o.icon} selected={relation === o.key} onToggle={() => setRelation(o.key)}>
                {labelOf(o)}
              </ToggleChip>
            ))}
          </div>
        </div>
        <Field label={t("people.name", { name: childName })} hint={t("people.nameHint")} required>
          {(p) => <Input {...p} dir="auto" value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} data-testid="person-name" />}
        </Field>
        <div className="flex items-center gap-4">
          {preview ? (
            <img src={preview} alt="" className="size-20 shrink-0 rounded-lg border border-line object-cover" data-testid="person-photo-preview" />
          ) : keepsPhoto && person ? (
            <PersonAvatar person={person} size="xl" />
          ) : (
            <PersonAvatar person={{ id: "", display_name: name, relation, has_photo: false, updated_at: null }} size="xl" />
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" icon={<ImagePlus className="size-4" aria-hidden />} onClick={() => input.current?.click()}>
              {hasPhoto ? t("people.changePhoto") : t("people.addPhoto")}
            </Button>
            {hasPhoto && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFile(null);
                  setDropPhoto(true);
                }}
              >
                {t("people.removePhoto")}
              </Button>
            )}
          </div>
          <input
            ref={input}
            type="file"
            accept={PHOTO_TYPES.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            data-testid="person-photo-input"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>
        <p className="text-caption text-ink-muted">{t("people.photoHint")}</p>
      </div>
    </Dialog>
  );
}

/** A compact, read-only row of the people in the child's life (the parent home card). Hidden when empty. */
export function PeopleStrip({ childId, childName }: { childId: string; childName: string }) {
  const { t } = useI18n();
  const { optionLabel } = useOptions();
  const people = useFetch<PeopleResponse>(peopleUrl(childId)).data?.people ?? [];
  if (people.length === 0) return null;
  return (
    <section className="space-y-2" data-testid="people-strip">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Users className="size-4" aria-hidden />
        {t("people.title", { name: childName })}
      </h3>
      <ul className="flex flex-wrap gap-3">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-md bg-tray py-1 ps-1 pe-3">
            <PersonAvatar person={p} size="md" />
            <span className="min-w-0">
              <span dir="auto" className="block text-sm font-semibold text-ink">
                {p.display_name}
              </span>
              <span className="text-caption block text-ink-muted">{optionLabel("person_relations", p.relation)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
