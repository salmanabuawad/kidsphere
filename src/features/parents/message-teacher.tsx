"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/form";
import { api, useAction } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/i18n/format";

export function MessageTeacher({ childId, messages }: { childId: string; messages: { id: string; body: string; createdAt: string }[] }) {
  const { t, locale } = useI18n();
  const { pending, run } = useAction();
  const [body, setBody] = useState("");
  return (
    <Card>
      <CardHeader title={t("parent.child.messageTeacher")} />
      <CardBody className="space-y-3">
        <Textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("parent.child.messagePlaceholder")}
          aria-label={t("parent.child.messageTeacher")}
        />
        <div className="flex justify-end">
          <Button
            disabled={!body.trim()}
            loading={pending}
            onClick={async () => {
              const ok = await run(() => api(`/api/children/${childId}/messages`, { body: { body } }), { success: t("parent.child.sent") });
              if (ok) setBody("");
            }}
          >
            <Send className="size-4 rtl:-scale-x-100" />
            {t("parent.child.send")}
          </Button>
        </div>
        {messages.length > 0 && (
          <div className="border-line space-y-2 border-t pt-3">
            <p className="text-muted text-xs font-medium">{t("parent.child.yourMessages")}</p>
            {messages.slice(0, 5).map((m) => (
              <div key={m.id} className="rounded-xl bg-stone-50 px-3 py-2 text-sm">
                {m.body}
                <span className="text-muted block text-xs">{formatDateTime(m.createdAt, locale)}</span>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
