"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { api, useErrorMessage } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";

/**
 * Leaving child mode is an adult action: press-and-hold the small lock for
 * ~1.5s (hard for small children to trigger by accident), then enter the PIN.
 */
export function AdultExit() {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = () => {
    timer.current = setTimeout(() => setOpen(true), 1500);
  };
  const cancelHold = () => {
    if (timer.current) clearTimeout(timer.current);
  };

  async function exit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/api/child-mode/exit", { body: { pin } });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPin("");
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex justify-end px-3 pt-3">
        <button
          type="button"
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={t("child.adult")}
          data-testid="adult-exit"
          className="flex items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs text-stone-400"
        >
          <Lock className="size-3.5" />
          {t("child.adult")}
        </button>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("child.exitTitle")}
        description={t("child.exitBody")}
        size="sm"
        closeLabel={t("common.close")}
      >
        <form onSubmit={exit} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            aria-label={t("child.pin")}
            className="text-center text-2xl tracking-[0.5em]"
            dir="ltr"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            data-testid="exit-pin"
          />
          <Button type="submit" className="w-full" loading={pending} disabled={pin.length < 4} data-testid="exit-submit">
            {t("child.exit")}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
