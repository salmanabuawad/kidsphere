"use client";

import type { AttributeCategory } from "@prisma/client";
import { useRef, useState, useSyncExternalStore } from "react";
import { Mic, MicOff, Plus, X } from "lucide-react";
import { Chip, Select } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translate";
import { VOCABULARY, type VocabEntry } from "@/features/child-understanding/vocabulary";

export function ChipGroup({ entries, value, onChange, max }: { entries: VocabEntry[]; value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const { locale } = useI18n();
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map((e) => {
        const selected = value.includes(e.key);
        return (
          <Chip
            key={e.key}
            selected={selected}
            disabled={!selected && max !== undefined && value.length >= max}
            onClick={() => onChange(selected ? value.filter((v) => v !== e.key) : [...value, e.key])}
          >
            {e.emoji && <span aria-hidden>{e.emoji}</span>}
            {e.label[locale]}
          </Chip>
        );
      })}
    </div>
  );
}

export type Pattern = { category: AttributeCategory; value: string };
const PATTERN_CATEGORIES: AttributeCategory[] = [
  "SUPPORT",
  "TRIGGER",
  "SENSORY",
  "LEARNING_PREFERENCE",
  "STRENGTH",
  "INTEREST",
  "EMOTIONAL_REGULATION",
  "SOCIAL_INTERACTION",
];

/** Teacher flags a possible pattern → stored as EMERGING, never used until confirmed. */
export function PatternPicker({ value, onChange, max = 3 }: { value: Pattern[]; onChange: (v: Pattern[]) => void; max?: number }) {
  const { t, locale } = useI18n();
  const [category, setCategory] = useState<AttributeCategory>("SUPPORT");
  const [key, setKey] = useState("");
  const options = VOCABULARY[category];
  return (
    <div className="space-y-2">
      {value.map((p, i) => (
        <div key={`${p.category}:${p.value}`} className="flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-900">
          <span className="flex-1">
            {t(`enums.category.${p.category}` as MessageKey)}: {VOCABULARY[p.category].find((e) => e.key === p.value)?.label[locale] ?? p.value}
          </span>
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={t("common.remove")}>
            <X className="size-4" />
          </button>
        </div>
      ))}
      {value.length < max && (
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label={t("teacher.observations.patternCategory")}
            className="w-auto"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as AttributeCategory);
              setKey("");
            }}
          >
            {PATTERN_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`enums.category.${c}` as MessageKey)}
              </option>
            ))}
          </Select>
          <Select aria-label={t("teacher.observations.patternValue")} className="w-auto min-w-40 flex-1" value={key} onChange={(e) => setKey(e.target.value)}>
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label[locale]}
              </option>
            ))}
          </Select>
          <button
            type="button"
            disabled={!key}
            onClick={() => {
              if (!value.some((p) => p.category === category && p.value === key)) onChange([...value, { category, value: key }]);
              setKey("");
            }}
            className="border-line inline-flex h-10 items-center gap-1 rounded-xl border px-3 text-sm hover:bg-stone-50 disabled:opacity-40"
          >
            <Plus className="size-4" />
            {t("teacher.observations.addPattern")}
          </button>
        </div>
      )}
    </div>
  );
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
};

/** Voice-created draft via the browser's speech recognition (when available). */
export function DictateButton({ onText }: { onText: (text: string) => void }) {
  const { t, locale } = useI18n();
  const supported = useSyncExternalStore(
    () => () => {},
    () => {
      const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
      return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
    },
    () => false,
  );
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRecognitionLike | null>(null);

  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (listening) {
          rec.current?.stop();
          return;
        }
        const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
        const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition)!;
        const r = new Ctor();
        r.lang = { ar: "ar", he: "he-IL", en: "en-US" }[locale];
        r.interimResults = false;
        r.continuous = false;
        r.onresult = (e) => {
          const text = Array.from(e.results)
            .map((res) => res[0]?.transcript ?? "")
            .join(" ");
          if (text) onText(text);
        };
        r.onend = () => setListening(false);
        rec.current = r;
        setListening(true);
        r.start();
      }}
      className="text-brand hover:bg-brand/10 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
    >
      {listening ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
      {listening ? t("teacher.observations.listening") : t("teacher.observations.dictate")}
    </button>
  );
}

export function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}
