import { Columns2 } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, Chip, type Tone } from "@/components/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useFormat } from "@/lib/format";
import { useProfileItem, type ProfileItem } from "@/features/children";
import type { BaselineData, BaselineDetail } from "./api";

type ListName = "strengths" | "interests" | "what_helps";
const LISTS: { list: ListName; tone: Tone; titleKey: string }[] = [
  { list: "strengths", tone: "strength", titleKey: "development.sections.strengths" },
  { list: "interests", tone: "interest", titleKey: "development.sections.interests" },
  { list: "what_helps", tone: "helps", titleKey: "development.sections.whatHelps" },
];

const id = (it: ProfileItem) => (it.key ? `k:${it.key}` : `c:${(it.custom ?? "").trim().toLowerCase()}`);

/**
 * The original baseline next to the latest one (X-12): both are kept as they were. Items that are
 * new since the original, or no longer in the latest, are marked in words (never a count or a score).
 */
export function BaselineCompare({ original, latest, latestDate }: { original: BaselineDetail; latest: BaselineData; latestDate: string }) {
  const { t } = useI18n();
  const { formatDate } = useFormat();
  const resolve = useProfileItem();
  const first = original.baseline_data ?? {};

  const column = (data: BaselineData, other: BaselineData, side: "original" | "latest") => (
    <div className="min-w-0 space-y-4" data-testid={`compare-${side}`}>
      <p className="text-sm font-semibold text-ink">
        {side === "original" ? t("development.compare.original", { date: formatDate(original.created_at) }) : t("development.compare.latest", { date: formatDate(latestDate) })}
      </p>
      {LISTS.map(({ list, tone, titleKey }) => {
        const items = (data[list] ?? []) as ProfileItem[];
        const otherIds = new Set(((other[list] ?? []) as ProfileItem[]).map(id));
        return (
          <section key={list} className="space-y-1.5">
            <h4 className="text-caption font-semibold text-ink-muted">{t(titleKey)}</h4>
            {items.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("development.sections.empty")}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {items.map((it, i) => {
                  const r = resolve(list, it);
                  const marker = !otherIds.has(id(it)) ? (side === "latest" ? "new" : "gone") : null;
                  return (
                    <li key={`${id(it)}-${i}`} className="flex items-center gap-1" data-marker={marker ?? undefined}>
                      <Chip tone={tone} icon={r.icon}>
                        <span dir="auto">{r.label}</span>
                      </Chip>
                      {marker === "new" && <Badge tone="brand">{t("development.compare.new")}</Badge>}
                      {marker === "gone" && <Badge tone="muted">{t("development.compare.notInLatest")}</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      <section className="space-y-1.5">
        <h4 className="text-caption font-semibold text-ink-muted">{t("development.compare.focus")}</h4>
        {(data.focus_areas ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">{t("development.sections.empty")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {(data.focus_areas ?? []).map((f) => (
              <li key={f.id}>
                <Chip tone="focus">
                  <span dir="auto">{f.title}</span>
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  return (
    <Card data-testid="baseline-compare">
      <CardHeader title={t("development.compare.title")} description={t("development.compare.hint")} icon={<Columns2 className="size-4" aria-hidden />} />
      <CardBody className="grid gap-6 md:grid-cols-2">
        {column(first, latest, "original")}
        {column(latest, first, "latest")}
      </CardBody>
    </Card>
  );
}
