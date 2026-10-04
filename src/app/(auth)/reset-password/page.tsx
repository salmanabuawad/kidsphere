import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { Card } from "@/components/ui/card";
import { PasswordResetForms } from "@/features/auth/password-reset";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: PageProps<"/reset-password">) {
  const { t } = await getI18n();
  const token = (await searchParams).token;
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-xl font-semibold">{t("auth.resetTitle")}</h1>
      <PasswordResetForms mode="reset" token={typeof token === "string" ? token : ""} />
      <Link href="/login" className="text-brand mt-4 inline-block text-sm hover:underline">
        {t("auth.backToSignIn")}
      </Link>
    </Card>
  );
}
