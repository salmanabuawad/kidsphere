import { requirePageActor } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/misc";
import { AccountForm } from "@/features/auth/account-form";

export default async function TeacherAccount() {
  const actor = await requirePageActor(["TEACHER"]);
  const { t } = await getI18n();
  return (
    <div>
      <PageHeader title={t("account.title")} />
      <AccountForm name={actor.name} email={actor.email} roleLabel={t(`roles.${actor.role}`)} />
    </div>
  );
}
