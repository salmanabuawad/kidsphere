import { getI18n } from "@/lib/i18n/server";
import { ButtonLink } from "@/components/ui/button";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="text-6xl" aria-hidden>
        🧭
      </span>
      <h1 className="text-2xl font-semibold">{t("errors.notFoundTitle")}</h1>
      <p className="text-muted max-w-md">{t("errors.notFoundBody")}</p>
      <ButtonLink href="/">{t("errors.goHome")}</ButtonLink>
    </div>
  );
}
