import type { AppLocale } from "@/lib/i18n/config";
import type { Question } from "./definition";

/** Read-only rendering of one questionnaire answer in the viewer's language. */
export function AnswerView({ question, value, locale }: { question: Question; value: unknown; locale: AppLocale }) {
  if (value === undefined || value === null || value === "") return <span className="text-muted">—</span>;
  switch (question.type) {
    case "text":
    case "textarea":
      return <span className="whitespace-pre-line">{String(value)}</span>;
    case "single": {
      const opt = question.options.find((o) => o.key === value);
      return <span>{opt ? opt.label[locale] : String(value)}</span>;
    }
    case "multi": {
      const v = value as { selected?: string[]; other?: string | null };
      const labels = (v.selected ?? [])
        .filter((k) => k !== "other")
        .map((k) => {
          const o = question.options.find((x) => x.key === k);
          return o ? `${o.emoji ? o.emoji + " " : ""}${o.label[locale]}` : k;
        });
      if (v.other) labels.push(v.other);
      return (
        <span className="flex flex-wrap gap-1.5">
          {labels.map((l) => (
            <span key={l} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs">
              {l}
            </span>
          ))}
        </span>
      );
    }
    case "grid": {
      const v = value as Record<string, string>;
      return (
        <span className="grid gap-1 sm:grid-cols-2">
          {question.rows
            .filter((r) => v[r.key])
            .map((r) => (
              <span key={r.key} className="text-sm">
                {r.label[locale]}: <span className="text-muted">{question.levels.find((l) => l.key === v[r.key])?.label[locale]}</span>
              </span>
            ))}
        </span>
      );
    }
  }
}
