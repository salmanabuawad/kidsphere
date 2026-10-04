import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getChildSession } from "@/lib/child-session";
import { I18nProvider } from "@/lib/i18n/client";
import { dirOf } from "@/lib/i18n/config";
import { AdultExit } from "@/features/child-mode/adult-exit";

export const metadata: Metadata = { title: "Kidsphere" };

/**
 * Child environment: no admin navigation, no links out. The interface speaks
 * the child's primary language regardless of the adult's UI language.
 */
export default async function PlayLayout({ children }: { children: React.ReactNode }) {
  const session = await getChildSession();
  if (!session) redirect("/login");
  return (
    <I18nProvider locale={session.primaryLanguage}>
      <div
        dir={dirOf(session.primaryLanguage)}
        lang={session.primaryLanguage}
        className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50/40 to-sky-50 select-none"
      >
        <AdultExit />
        <main className="mx-auto max-w-5xl px-4 pt-4 pb-10 md:px-8">{children}</main>
      </div>
    </I18nProvider>
  );
}
