/**
 * Admin: the media of a library item, one file per slot (backend services/library_media.py):
 * cover and music for every item, a picture and a narration per story page, a picture or clip per
 * activity step. Upload, replace, remove, and the alt text and credit (source and licence) of each.
 */
import { useRef, useState } from "react";
import { Save, Trash2, Upload } from "lucide-react";
import { Button, Card, CardBody, Input } from "@/components/ui";
import type { MediaRef } from "@/features/player";
import { useI18n } from "@/i18n/I18nProvider";
import { useAction } from "@/lib/useAction";
import { removeMedia, updateMediaDetails, uploadMedia } from "./api";

const ACCEPT: Record<string, string> = {
  cover: "image/jpeg,image/png,image/webp",
  page: "image/jpeg,image/png,image/webp",
  narration: "audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/webm,.mp3,.m4a,.ogg,.wav",
  music: "audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/webm,.mp3,.m4a,.ogg,.wav",
  step: "image/jpeg,image/png,image/webp,video/mp4,video/webm",
};

export function MediaPanel({
  itemId,
  slots,
  media,
  onChange,
}: {
  itemId: string;
  slots: string[];
  media: MediaRef[];
  onChange: (m: MediaRef[]) => void;
}) {
  const { t } = useI18n();
  const bySlot = new Map(media.map((m) => [m.slot, m]));
  return (
    <div className="space-y-3" data-testid="media-panel">
      <p className="text-sm text-ink-muted">{t("library.media.intro")}</p>
      {slots.map((slot) => (
        <SlotRow
          key={`${slot}:${bySlot.get(slot)?.updated_at ?? ""}`}
          itemId={itemId}
          slot={slot}
          media={bySlot.get(slot) ?? null}
          onChange={onChange}
          onRemoved={() => onChange(media.filter((m) => m.slot !== slot))}
        />
      ))}
    </div>
  );
}

function slotLabel(slot: string, t: (k: string, v?: Record<string, string | number>) => string) {
  const [name, n] = slot.split(":");
  return t(`library.media.slots.${name}`, { n: Number(n ?? 0) + 1 });
}

function SlotRow({
  itemId,
  slot,
  media,
  onChange,
  onRemoved,
}: {
  itemId: string;
  slot: string;
  media: MediaRef | null;
  onChange: (m: MediaRef[]) => void;
  onRemoved: () => void;
}) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const input = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState(media?.alt ?? "");
  const [credit, setCredit] = useState(media?.credit ?? "");
  const kind = slot.split(":")[0]!;
  const label = slotLabel(slot, t);
  const upload = (file: File) =>
    run(() => uploadMedia(itemId, slot, file), { success: t("library.media.uploaded"), onSuccess: (r) => onChange(r.media) });
  return (
    <Card data-testid={`media-slot-${slot}`}>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-ink">{label}</p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept={ACCEPT[kind]}
              className="sr-only"
              aria-label={`${label}: ${media ? t("library.media.replace") : t("library.media.upload")}`}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
            <Button size="sm" variant="outline" loading={pending} onClick={() => input.current?.click()} icon={<Upload className="size-4" aria-hidden />}>
              {media ? t("library.media.replace") : t("library.media.upload")}
            </Button>
            {media && (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                disabled={pending}
                onClick={() =>
                  void run(() => removeMedia(itemId, slot), {
                    success: t("library.media.removed"),
                    onSuccess: onRemoved,
                  })
                }
                icon={<Trash2 className="size-4" aria-hidden />}
              >
                {t("library.media.remove")}
              </Button>
            )}
          </div>
        </div>
        {media ? (
          <>
            {media.kind === "image" && <img src={media.url} alt={media.alt ?? ""} className="max-h-40 rounded-md" />}
            {media.kind === "audio" && <audio src={media.url} controls preload="none" className="w-full max-w-md" />}
            {media.kind === "video" && <video src={media.url} controls preload="metadata" playsInline className="max-h-48 rounded-md" />}
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Input dir="auto" maxLength={300} value={alt} placeholder={t("library.media.alt")} aria-label={t("library.media.alt")} onChange={(e) => setAlt(e.target.value)} />
              <Input dir="auto" maxLength={300} value={credit} placeholder={t("library.media.credit")} aria-label={t("library.media.credit")} onChange={(e) => setCredit(e.target.value)} />
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  void run(() => updateMediaDetails(itemId, slot, { alt: alt.trim() || null, credit: credit.trim() || null }), {
                    success: t("library.admin.saved"),
                    onSuccess: (r) => onChange(r.media),
                  })
                }
                icon={<Save className="size-4" aria-hidden />}
              >
                {t("library.admin.save")}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-muted">{t("library.media.empty")}</p>
        )}
      </CardBody>
    </Card>
  );
}
