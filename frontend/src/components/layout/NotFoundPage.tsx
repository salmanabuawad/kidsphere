import { Compass, RefreshCw } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { buttonClass, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useI18n } from "@/i18n/I18nProvider";

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-xl py-10">
      <EmptyState
        icon={<Compass />}
        title={t("errors.notFoundTitle")}
        description={t("errors.notFoundBody")}
        action={<ButtonLink to="/">{t("errors.goHome")}</ButtonLink>}
      />
    </div>
  );
}

/** Router errorElement: a calm full-page message with reload and home actions. */
export function RouteError() {
  const error = useRouteError();
  const { t } = useI18n();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (import.meta.env.DEV) console.error(error);
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl items-center px-4">
      <EmptyState
        className="w-full"
        icon={<RefreshCw />}
        title={t("errors.errorTitle")}
        description={t("errors.errorBody")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => window.location.reload()} className={buttonClass("primary")}>
              {t("common.retry")}
            </button>
            <a href="/" className={buttonClass("outline")}>
              {t("errors.goHome")}
            </a>
          </div>
        }
      />
    </div>
  );
}
