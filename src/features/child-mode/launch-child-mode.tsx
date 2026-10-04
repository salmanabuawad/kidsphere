"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Baby } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/feedback";
import { api, useErrorMessage } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";

/** Adult action that hands the device to a child, protected by an exit PIN. */
export function LaunchChildMode({ childId, variant = "outline" }: { childId: string; variant?: "outline" | "primary" }) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function launch(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      setError(t("child.pinRule"));
      return;
    }
    setPending(true);
    try {
      await api("/api/child-mode/launch", { body: { childId, pin } });
      router.replace("/play");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} data-testid="launch-child-mode">
        <Baby className="size-4" />
        {t("common.startChildMode")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("child.launchTitle")}
        description={t("child.launchBody")}
        size="sm"
        closeLabel={t("common.close")}
      >
        <form onSubmit={launch} className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label={t("child.pin")} hint={t("child.pinRule")}>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                pattern="\d{4,6}"
                maxLength={6}
                autoComplete="off"
                dir="ltr"
                className="text-center text-2xl tracking-[0.5em]"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                data-testid="child-pin"
              />
            )}
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={pending} data-testid="child-launch-submit">
            {t("child.launch")}
          </Button>
        </form>
      </Dialog>
    </>
  );
}
