import Link from "next/link";
import { requirePageActor } from "@/lib/auth/session";
import { ADMIN_ROLES } from "@/lib/auth/actor";
import { getI18n } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/i18n/format";
import { queryAudit } from "@/server/services/admin";
import { auditQuerySchema } from "@/server/validators";
import { PageHeader, Table } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const actor = await requirePageActor(ADMIN_ROLES);
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const q = auditQuerySchema.parse({
    action: typeof sp.action === "string" && sp.action ? sp.action : undefined,
    page: typeof sp.page === "string" ? sp.page : undefined,
  });
  const result = await queryAudit(actor, q);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const href = (page: number) => `/admin/audit?page=${page}${q.action ? `&action=${encodeURIComponent(q.action)}` : ""}`;

  return (
    <div>
      <PageHeader title={t("admin.audit.title")} description={t("admin.audit.subtitle")} />
      <form className="mb-4 flex gap-2" action="/admin/audit">
        <input
          name="action"
          defaultValue={q.action ?? ""}
          placeholder={t("admin.audit.filterAction")}
          dir="ltr"
          className="border-line h-10 w-72 rounded-xl border bg-white px-3 text-sm"
        />
        <button className={buttonClass("outline")}>{t("common.filter")}</button>
      </form>
      <Table>
        <thead>
          <tr>
            <th>{t("admin.audit.when")}</th>
            <th>{t("admin.audit.actor")}</th>
            <th>{t("admin.audit.action")}</th>
            <th>{t("admin.audit.object")}</th>
            <th>{t("admin.audit.metadata")}</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r) => (
            <tr key={r.id}>
              <td className="text-xs whitespace-nowrap">{formatDateTime(r.createdAt, locale)}</td>
              <td className="text-xs">
                {r.actor?.name ?? "—"}
                {r.actorRole && <span className="text-muted block">{t(`roles.${r.actorRole as "TEACHER"}`)}</span>}
              </td>
              <td className="font-mono text-xs" dir="ltr">
                {r.action}
              </td>
              <td className="font-mono text-xs" dir="ltr">
                {r.objectType}
                <span className="text-muted block">{r.objectId?.slice(0, 12)}</span>
              </td>
              <td className="text-muted max-w-xs truncate font-mono text-[11px]" dir="ltr" title={JSON.stringify(r.metadata)}>
                {r.metadata ? JSON.stringify(r.metadata) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <div className="mt-4 flex items-center justify-between text-sm">
        {q.page > 1 ? (
          <Link href={href(q.page - 1)} className={buttonClass("outline", "sm")}>
            {t("admin.audit.prev")}
          </Link>
        ) : (
          <span />
        )}
        <span className="text-muted">
          {t("admin.audit.page", { n: q.page })} / {pages}
        </span>
        {q.page < pages ? (
          <Link href={href(q.page + 1)} className={buttonClass("outline", "sm")}>
            {t("admin.audit.next")}
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
