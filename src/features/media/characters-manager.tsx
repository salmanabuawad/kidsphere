"use client";

import type { ConsentPurpose, ContentType, PersonRelation } from "@prisma/client";
import { useRef, useState } from "react";
import { ShieldCheck, ShieldOff, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { formatDate } from "@/lib/i18n/format";

export type MediaItem = {
  id: string;
  url: string;
  personRelation: PersonRelation;
  personLabel: string;
  consents: {
    id: string;
    status: "GRANTED" | "REVOKED";
    grantedAt: string;
    revokedAt: string | null;
    allowedPurposes: ConsentPurpose[];
    allowedContentTypes: ContentType[];
  }[];
};

const RELATIONS: PersonRelation[] = ["CHILD", "MOTHER", "FATHER", "SIBLING", "GRANDPARENT", "FAMILY_MEMBER", "FRIEND"];
const PURPOSES: ConsentPurpose[] = ["CHARACTER_INSPIRATION", "STORY_ILLUSTRATION"];
const CHILD_TYPES: ContentType[] = ["INTERACTIVE_STORY", "STORY", "SOCIAL_STORY", "VISUAL_ROUTINE", "CHOICE_ACTIVITY", "MATCHING_ACTIVITY", "SIMPLE_GAME"];

export function CharactersManager({ childId, items }: { childId: string; items: MediaItem[] }) {
  const { t, locale } = useI18n();
  const { pending, run } = useAction();
  const [relation, setRelation] = useState<PersonRelation>("CHILD");
  const [label, setLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [consentFor, setConsentFor] = useState<MediaItem | null>(null);

  async function upload() {
    if (!file || !label.trim()) return;
    const form = new FormData();
    form.append("file", file);
    form.append("personRelation", relation);
    form.append("personLabel", label.trim());
    const ok = await run(() => api(`/api/children/${childId}/media`, { form }), { success: t("parent.media.uploaded") });
    if (ok) {
      setFile(null);
      setLabel("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <p className="font-semibold">{t("parent.media.upload")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("parent.media.who")}>
            {(p) => (
              <Select {...p} value={relation} onChange={(e) => setRelation(e.target.value as PersonRelation)} data-testid="media-relation">
                {RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`enums.relation.${r}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("parent.media.label")}>
            {(p) => (
              <Input
                {...p}
                value={label}
                placeholder={t("parent.media.labelPlaceholder")}
                onChange={(e) => setLabel(e.target.value)}
                data-testid="media-label"
              />
            )}
          </Field>
        </div>
        <Field label={t("parent.media.file")}>
          {(p) => (
            <input
              {...p}
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
              data-testid="media-file"
            />
          )}
        </Field>
        <Button onClick={upload} disabled={!file || !label.trim()} loading={pending} data-testid="media-upload">
          <Upload className="size-4" />
          {t("parent.media.upload")}
        </Button>
      </Card>

      {items.length === 0 && <EmptyState title={t("parent.media.empty")} />}
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((m) => {
          const active = m.consents.find((c) => c.status === "GRANTED");
          const lastRevoked = m.consents.find((c) => c.status === "REVOKED");
          return (
            <Card key={m.id} className="overflow-hidden" data-testid="media-item">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, authorized image route */}
              <img src={m.url} alt={m.personLabel} className="aspect-[4/3] w-full object-cover" />
              <div className="space-y-3 p-4">
                <div>
                  <p className="font-medium">{m.personLabel}</p>
                  <p className="text-muted text-xs">{t(`enums.relation.${m.personRelation}`)}</p>
                </div>
                {active ? (
                  <Badge tone="green">
                    <ShieldCheck className="size-3" />
                    {t("parent.media.consentActive", { date: formatDate(active.grantedAt, locale) })}
                  </Badge>
                ) : lastRevoked?.revokedAt ? (
                  <Badge tone="stone">{t("parent.media.consentRevoked", { date: formatDate(lastRevoked.revokedAt, locale) })}</Badge>
                ) : (
                  <Badge tone="amber">{t("parent.media.noConsent")}</Badge>
                )}
                <div className="flex flex-wrap gap-2">
                  {active ? (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={pending}
                      onClick={() =>
                        run(() => api(`/api/consents/${active.id}`, { method: "PATCH", body: { status: "REVOKED" } }), { success: t("parent.media.revoked") })
                      }
                      data-testid="revoke-consent"
                    >
                      <ShieldOff className="size-4" />
                      {t("parent.media.revoke")}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setConsentFor(m)} data-testid="grant-consent">
                      <ShieldCheck className="size-4" />
                      {t("parent.media.grant")}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => api(`/api/media/${m.id}`, { method: "DELETE" }), { success: t("parent.media.deleted") })}
                  >
                    <Trash2 className="size-4" />
                    {t("parent.media.deletePhoto")}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {consentFor && <ConsentDialog childId={childId} item={consentFor} onClose={() => setConsentFor(null)} />}
    </div>
  );
}

function ConsentDialog({ childId, item, onClose }: { childId: string; item: MediaItem; onClose: () => void }) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const [purposes, setPurposes] = useState<ConsentPurpose[]>(["CHARACTER_INSPIRATION"]);
  const [types, setTypes] = useState<ContentType[]>(["INTERACTIVE_STORY", "STORY"]);
  const [agreed, setAgreed] = useState(false);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("parent.media.consentTitle", { label: item.personLabel })}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!agreed || purposes.length === 0 || types.length === 0}
            loading={pending}
            data-testid="confirm-consent"
            onClick={async () => {
              const ok = await run(
                () =>
                  api(`/api/children/${childId}/consents`, {
                    body: {
                      mediaAssetId: item.id,
                      personRelation: item.personRelation,
                      personLabel: item.personLabel,
                      allowedPurposes: purposes,
                      allowedContentTypes: types,
                    },
                  }),
                { success: t("parent.media.granted") },
              );
              if (ok) onClose();
            }}
          >
            {t("parent.media.grant")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">{t("parent.media.purposes")}</legend>
          {PURPOSES.map((p) => (
            <Checkbox key={p} label={t(`enums.purpose.${p}`)} checked={purposes.includes(p)} onChange={() => setPurposes(toggle(purposes, p))} />
          ))}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">{t("parent.media.contentTypes")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CHILD_TYPES.map((ct) => (
              <Checkbox key={ct} label={t(`enums.contentType.${ct}`)} checked={types.includes(ct)} onChange={() => setTypes(toggle(types, ct))} />
            ))}
          </div>
        </fieldset>
        <div className="rounded-xl bg-stone-50 p-3">
          <Checkbox label={t("parent.media.consentText")} checked={agreed} onChange={(e) => setAgreed(e.target.checked)} data-testid="consent-agree" />
        </div>
      </div>
    </Dialog>
  );
}
