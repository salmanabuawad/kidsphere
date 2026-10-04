import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { Card } from "@/components/ui/card";
import { PasswordResetForms } from "@/features/auth/password-reset";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPage() {
  const { t } = await getI18n();
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold">{t("auth.forgotTitle")}</h1>
      <p className="text-muted mt-1 text-sm">{t("auth.forgotHelp")}</p>
      <PasswordResetForms mode="request" />
      <Link href="/login" className="text-brand mt-4 inline-block text-sm hover:underline">
        {t("auth.backToSignIn")}
      </Link>
    </Card>
  );
}
