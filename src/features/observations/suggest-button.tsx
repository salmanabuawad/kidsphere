"use client";

import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";

/** Ask Kidsphere to suggest profile items; suggestions arrive as EMERGING and need confirmation. */
export function SuggestButton({ childId, observationId }: { childId: string; observationId: string }) {
  const { t } = useI18n();
  const { pending, run } = useAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={async () => {
        const res = await run(() => api<{ suggestions: unknown[] }>(`/api/children/${childId}/observations/${observationId}/suggest`, { method: "POST" }));
        if (res) toast(res.suggestions.length ? t("teacher.observations.suggested", { n: res.suggestions.length }) : t("teacher.observations.noSuggestions"));
      }}
    >
      <Wand2 className="size-4" />
      {t("teacher.observations.suggest")}
    </Button>
  );
}
