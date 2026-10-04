"use client";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

/** Generic error boundary — never shows stack traces or server details. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="text-6xl" aria-hidden>
        🌧️
      </span>
      <h1 className="text-2xl font-semibold">{t("errors.errorTitle")}</h1>
      <p className="text-muted max-w-md">{t("errors.errorBody")}</p>
      <Button onClick={reset}>{t("common.retry")}</Button>
    </div>
  );
}
