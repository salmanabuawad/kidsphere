"use client";

import type { ContentStatus, ContentType, OutcomeResult, PlanItemStatus } from "@prisma/client";
import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Check, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Checkbox } from "@/components/ui/form";
import { Avatar } from "@/components/ui/misc";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { STATUS_TONE } from "@/features/content/status";

type Item = {
  id: string;
  dayOfWeek: number;
  contentType: ContentType;
  title: string;
  status: PlanItemStatus;
  content: { id: string; status: ContentStatus; title: string } | null;
};
type ChildRow = {
  id: string;
  displayName: string;
  avatarColor: string;
  goals: { id: string; statement: string; lastOutcome: OutcomeResult | null; items: Item[] }[];
};

export function WeeklyPlanner({ classId, weekStart, rows: children }: { classId: string; weekStart: string; rows: ChildRow[] }) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  const unplanned = children.flatMap((c) => c.goals.filter((g) => g.items.length === 0).map((g) => g.id));
  const [selected, setSelected] = useState<string[]>([]);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const hasGoals = children.some((c) => c.goals.length > 0);

  if (!hasGoals) return <EmptyState title={t("teacher.weekly.noGoals")} />;

  return (
    <div className="space-y-4">
      {unplanned.length > 0 && (
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <span className="text-sm font-medium">{t("teacher.weekly.selectGoals")}</span>
          <Button
            size="sm"
            disabled={selected.length === 0}
            loading={pending}
            onClick={async () => {
              await run(() => api("/api/weekly-plans", { body: { classId, weekStart, goalIds: selected } }), { success: t("teacher.weekly.planned") });
              setSelected([]);
            }}
            data-testid="plan-week"
          >
            <CalendarPlus className="size-4" />
            {t("teacher.weekly.generatePackage")}
          </Button>
        </Card>
      )}

      {children
        .filter((c) => c.goals.length > 0)
        .map((c) => (
          <Card key={c.id} className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Avatar name={c.displayName} color={c.avatarColor} size="sm" />
              <Link href={`/teacher/children/${c.id}`} className="font-semibold hover:underline">
                {c.displayName}
              </Link>
            </div>
            <div className="space-y-4">
              {c.goals.map((g) => (
                <div key={g.id} className="border-line rounded-xl border p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    {g.items.length === 0 && (
                      <Checkbox
                        aria-label={g.statement}
                        label=""
                        checked={selected.includes(g.id)}
                        onChange={(e) => setSelected(e.target.checked ? [...selected, g.id] : selected.filter((x) => x !== g.id))}
                      />
                    )}
                    <p className="min-w-0 flex-1 text-sm font-medium">{g.statement}</p>
                    <span className="text-muted text-xs">
                      {t("teacher.weekly.lastOutcome")}: {g.lastOutcome ? t(`enums.outcome.${g.lastOutcome}`) : "—"}
                    </span>
                  </div>
                  {g.items.length === 0 ? (
                    <p className="text-muted mt-2 text-xs">{t("teacher.weekly.noPlan")}</p>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-5">
                      {g.items.map((i) => (
                        <div key={i.id} className="flex flex-col gap-1.5 rounded-xl bg-stone-50 p-2.5">
                          <span className="text-muted text-xs">{t(`enums.days.${i.dayOfWeek}` as MessageKey)}</span>
                          <span className="text-sm font-medium">{t(`enums.planItem.${i.title}` as MessageKey)}</span>
                          {i.content ? (
                            <Link href={`/teacher/content/${i.content.id}`} className="text-xs">
                              <Badge tone={STATUS_TONE[i.content.status]}>{t(`enums.contentStatus.${i.content.status}`)}</Badge>
                            </Link>
                          ) : (
                            <Button
                              size="sm"
                              variant="soft"
                              loading={busyItem === i.id}
                              disabled={busyItem !== null}
                              onClick={async () => {
                                setBusyItem(i.id);
                                await run(() => api(`/api/weekly-plans/items/${i.id}/generate`, { body: {} }), { success: t("teacher.studio.generated") });
                                setBusyItem(null);
                              }}
                            >
                              <Sparkles className="size-3.5" />
                              {t("teacher.weekly.createItem")}
                            </Button>
                          )}
                          {i.status !== "DONE" && i.content && (
                            <button
                              type="button"
                              className="text-muted hover:text-ink inline-flex items-center gap-1 text-xs"
                              onClick={() => run(() => api(`/api/weekly-plans/items/${i.id}`, { method: "PATCH", body: { status: "DONE" } }))}
                            >
                              <Check className="size-3" />
                              {t("teacher.weekly.markDone")}
                            </button>
                          )}
                          {i.status === "DONE" && <Badge tone="green">{t("enums.planStatus.DONE")}</Badge>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
    </div>
  );
}
