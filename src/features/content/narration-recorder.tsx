"use client";

import { useRef, useState } from "react";
import { Mic, Square, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { api, useAction } from "@/lib/client/api";
import { toast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n/client";

type Narration = { id: string; sceneId: string | null; approved: boolean };

/** Teacher narration: record in the browser (MediaRecorder) or upload an audio file. */
export function NarrationRecorder({ contentId, scenes, narrations }: { contentId: string; scenes: { id: string; label: string }[]; narrations: Narration[] }) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const [sceneId, setSceneId] = useState<string>("");
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(blob: Blob, type: string) {
    const form = new FormData();
    form.append("file", new File([blob], "narration", { type }));
    if (sceneId) form.append("sceneId", sceneId);
    await run(() => api(`/api/content/${contentId}/narration`, { form }), { success: t("teacher.content.narrationSaved") });
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast(t("teacher.content.micUnavailable"), "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        void upload(new Blob(chunks.current, { type: mime }), mime);
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast(t("teacher.content.micUnavailable"), "error");
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-muted text-xs">{t("teacher.content.narrationHint")}</p>
      <Select aria-label={t("teacher.content.narration")} value={sceneId} onChange={(e) => setSceneId(e.target.value)}>
        <option value="">{t("teacher.content.wholeStory")}</option>
        {scenes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </Select>
      <div className="flex flex-wrap gap-2">
        {recording ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              recorder.current?.stop();
              setRecording(false);
            }}
          >
            <Square className="size-4" />
            {t("teacher.content.stop")}
          </Button>
        ) : (
          <Button size="sm" variant="soft" onClick={start} loading={pending}>
            <Mic className="size-4" />
            {t("teacher.content.record")}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={pending || recording}>
          <Upload className="size-4" />
          {t("teacher.content.upload")}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f, f.type);
            e.target.value = "";
          }}
        />
      </div>
      {narrations.length === 0 ? (
        <p className="text-muted text-xs">{t("teacher.content.noNarration")}</p>
      ) : (
        <ul className="space-y-2">
          {narrations.map((n) => (
            <li key={n.id} className="flex items-center gap-2">
              <span className="text-muted w-20 shrink-0 truncate text-xs">
                {n.sceneId ? (scenes.find((s) => s.id === n.sceneId)?.label ?? n.sceneId) : t("teacher.content.wholeStory")}
              </span>
              <audio controls preload="none" src={`/api/narrations/${n.id}/audio`} className="h-8 min-w-0 flex-1" />
              <button
                type="button"
                aria-label={t("common.delete")}
                onClick={() => run(() => api(`/api/narrations/${n.id}`, { method: "DELETE" }))}
                className="text-muted rounded-lg p-1.5 hover:bg-stone-100"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
