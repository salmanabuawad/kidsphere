"use client";

import type { ContentStatus } from "@prisma/client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n/client";
import { LOCALE_NAMES, LOCALES } from "@/lib/i18n/config";
import { DOMAINS } from "@/features/observations/definition";
import { CONTENT_TYPE_VALUES } from "@/server/validators";

export function LibraryFilters({ classes, statuses }: { classes: { id: string; name: string }[]; statuses: ContentStatus[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  };
  const sel = (key: string, label: string, options: { value: string; label: string }[]) => (
    <Select aria-label={label} className="w-auto min-w-36" value={params.get(key) ?? ""} onChange={(e) => set(key, e.target.value)}>
      <option value="">
        {label}: {t("common.all")}
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {sel(
        "language",
        t("common.language"),
        LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] })),
      )}
      {sel(
        "type",
        t("teacher.studio.type"),
        CONTENT_TYPE_VALUES.map((v) => ({ value: v, label: t(`enums.contentType.${v}`) })),
      )}
      {sel(
        "status",
        t("common.status"),
        statuses.map((s) => ({ value: s, label: t(`enums.contentStatus.${s}`) })),
      )}
      {sel(
        "domain",
        t("teacher.goals.domain"),
        DOMAINS.map((d) => ({ value: d.key, label: d.label[locale] })),
      )}
      {sel(
        "classId",
        t("admin.children.class"),
        classes.map((c) => ({ value: c.id, label: c.name })),
      )}
      {sel(
        "ageBand",
        t("teacher.library.age"),
        ["3-4", "4-5", "5-6"].map((a) => ({ value: a, label: a })),
      )}
      <Checkbox label={t("teacher.library.creator")} checked={params.get("mine") === "1"} onChange={(e) => set("mine", e.target.checked ? "1" : "")} />
    </div>
  );
}
