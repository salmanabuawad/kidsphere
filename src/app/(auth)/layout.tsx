import { getI18n } from "@/lib/i18n/server";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getI18n();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="bg-brand flex size-9 items-center justify-center rounded-xl text-lg text-white" aria-hidden>
            ✦
          </span>
          <span className="text-lg font-semibold">{t("common.appName")}</span>
        </div>
        <LocaleSwitcher compact />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="text-muted px-5 pb-6 text-center text-xs">{t("common.tagline")}</footer>
    </div>
  );
}
