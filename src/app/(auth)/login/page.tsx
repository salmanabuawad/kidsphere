import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/actor";
import { getI18n } from "@/lib/i18n/server";
import { Card } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

const DEMO = ["teacher@kidsphere.local", "parent@kidsphere.local", "admin@kidsphere.local"];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const actor = await getActor();
  if (actor) redirect(homePathFor(actor.role));
  const { t } = await getI18n();
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : null;
  const showDemo = process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_ACCOUNTS === "true";
  return (
    <div className="space-y-4">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">{t("auth.welcome")}</h1>
        <p className="text-muted mt-1 text-sm">{t("auth.welcomeSub")}</p>
        <LoginForm next={next} />
      </Card>
      {showDemo && (
        <Card className="p-4 text-sm">
          <p className="font-medium">{t("auth.demoAccounts")}</p>
          <ul className="mt-2 space-y-1 font-mono text-xs text-stone-600" dir="ltr">
            {DEMO.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="text-muted mt-2 text-xs">
            {t("auth.demoPassword")}{" "}
            <span className="font-mono" dir="ltr">
              Kidsphere-Dev-2026!
            </span>
          </p>
        </Card>
      )}
    </div>
  );
}
