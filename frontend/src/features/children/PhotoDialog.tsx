import { useRef } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { Button, Dialog, toast } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";
import { childUrl, displayName, MAX_PHOTO_BYTES, PHOTO_TYPES } from "./api";
import { ChildAvatar } from "./ChildAvatar";
import type { ChildBasics } from "./types";

/** Add, replace or remove the child's photo (staff). The file is re-encoded on the server. */
export function PhotoDialog({ child, open, onClose, onChanged }: { child: ChildBasics; open: boolean; onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const upload = useAction();
  const remove = useAction();

  async function onFile(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    if (file.type && !PHOTO_TYPES.includes(file.type)) return toast(t("children.photo.wrongType"), "error");
    if (file.size > MAX_PHOTO_BYTES) return toast(t("children.photo.tooLarge"), "error");
    const form = new FormData();
    form.append("file", file);
    await upload.run(() => api(`${childUrl(child.id)}/photo`, { method: "PUT", form }), {
      success: t("children.photo.uploaded"),
      onSuccess: () => {
        onChanged();
        onClose();
      },
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("children.photo.title")}
      description={t("children.photo.hint")}
      size="sm"
      footer={
        <>
          {child.has_photo && (
            <Button
              variant="ghost"
              className="me-auto text-rose-700"
              icon={<Trash2 className="size-4" aria-hidden />}
              loading={remove.pending}
              disabled={upload.pending}
              onClick={() =>
                remove.run(() => api(`${childUrl(child.id)}/photo`, { method: "DELETE" }), {
                  success: t("children.photo.removed"),
                  onSuccess: () => {
                    onChanged();
                    onClose();
                  },
                })
              }
            >
              {t("children.photo.remove")}
            </Button>
          )}
          <Button
            icon={<ImagePlus className="size-4" aria-hidden />}
            loading={upload.pending}
            disabled={remove.pending}
            onClick={() => input.current?.click()}
          >
            {t("children.photo.choose")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3 py-2">
        <ChildAvatar child={child} size="xl" />
        <p className="font-medium" dir="auto">
          {displayName(child)}
        </p>
        <input
          ref={input}
          type="file"
          accept={PHOTO_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          data-testid="photo-input"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
    </Dialog>
  );
}

/** Small round camera button that sits on the avatar. */
export function PhotoButton({ hasPhoto, onClick }: { hasPhoto: boolean; onClick: () => void }) {
  const { t } = useI18n();
  const label = hasPhoto ? t("children.photo.change") : t("children.photo.add");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute -end-1 -bottom-1 inline-flex size-11 items-center justify-center rounded-full border border-line bg-white text-ink shadow-md hover:bg-stone-50"
    >
      <Camera className="size-5" aria-hidden />
    </button>
  );
}
