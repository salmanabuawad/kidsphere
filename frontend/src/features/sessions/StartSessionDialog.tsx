import { useState } from "react";
import { useNavigate } from "react-router";
import { Users } from "lucide-react";
import { Button, Checkbox, Dialog, Field, Input, Select, Spinner } from "@/components/ui";
import { displayName, type ChildListResponse } from "@/features/children";
import { useI18n } from "@/i18n/I18nProvider";
import { paths } from "@/lib/paths";
import { useAction } from "@/lib/useAction";
import { useFetch } from "@/lib/useFetch";
import { createSession } from "./api";

/** Today in the device's own time zone (YYYY-MM-DD). */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Start a class session: a class of the user, the day, the title (the item's by default) and the
 * children who took part (all of the class at first). Opens the session page to note how each did.
 */
export function StartSessionDialog({
  open,
  onClose,
  item,
}: {
  open: boolean;
  onClose: () => void;
  item?: { id: string; title: string } | null;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pending, run } = useAction();
  const { data, loading } = useFetch<ChildListResponse>(open ? "/api/children" : null);
  const classes = data?.classes ?? [];
  const [classId, setClassId] = useState<string | null>(null);
  const [heldOn, setHeldOn] = useState(today);
  const [title, setTitle] = useState(item?.title ?? "");
  const [left, setLeft] = useState<Set<string>>(new Set());
  const cls = classId ?? classes[0]?.id ?? null;
  const children = (data?.children ?? []).filter((c) => c.class?.id === cls && !c.archived);
  const chosen = children.filter((c) => !left.has(c.id));
  async function go() {
    if (!cls) return;
    const r = await run(
      () => createSession({ class_id: cls, library_item_id: item?.id ?? null, title: title.trim() || null, held_on: heldOn, child_ids: chosen.map((c) => c.id) }),
      { success: t("sessions.started") },
    );
    if (r.ok) navigate(paths.session(r.data.session.id));
  }
  return (
    <Dialog
      open={open}
      onClose={() => !pending && onClose()}
      title={t("sessions.startTitle")}
      description={t("sessions.startHint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void go()} loading={pending} disabled={!cls || chosen.length === 0 || (!item && !title.trim())} icon={<Users className="size-4" aria-hidden />}>
            {t("sessions.start", { count: chosen.length })}
          </Button>
        </>
      }
    >
      {loading && !data ? (
        <Spinner label={t("common.loading")} />
      ) : classes.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("sessions.noClasses")}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("sessions.class")}>
              {(p) => (
                <Select
                  {...p}
                  value={cls ?? ""}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setLeft(new Set());
                  }}
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("sessions.day")}>
              {(p) => <Input {...p} type="date" dir="ltr" max={today()} value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />}
            </Field>
          </div>
          <Field label={t("sessions.titleLabel")}>
            {(p) => <Input {...p} dir="auto" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />}
          </Field>
          <fieldset>
            <legend className="mb-1 text-base font-semibold text-ink">{t("sessions.whoTookPart")}</legend>
            {children.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("children.picker.none")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {children.map((c) => (
                  <li key={c.id}>
                    <Checkbox
                      checked={!left.has(c.id)}
                      onChange={(e) =>
                        setLeft((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        })
                      }
                      label={<span dir="auto">{displayName(c)}</span>}
                    />
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        </div>
      )}
    </Dialog>
  );
}
