import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthContext } from "@/auth/AuthProvider";
import { pick, type Localized } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { api, ApiError } from "./api";

/**
 * Shared vocabulary from GET /api/options (single source with backend validation):
 *   {lists: {strengths: [{key, icon?, category?, label: {en, ar, he}}], …}}
 */
export type OptionItem = { key: string; icon?: string; category?: string; label: Localized };
export type OptionLists = Record<string, OptionItem[]>;

type RawItem = { key: string; icon?: string; category?: string; label?: Localized; en?: string; ar?: string; he?: string };

/** Accepts both {label:{en,ar,he}} and flat {en,ar,he} items. */
export function normalizeOptions(raw: unknown): OptionLists {
  const lists = (raw as { lists?: Record<string, RawItem[]> } | null)?.lists ?? {};
  const out: OptionLists = {};
  for (const [name, items] of Object.entries(lists)) {
    if (!Array.isArray(items)) continue;
    out[name] = items
      .filter((i) => i && typeof i.key === "string")
      .map((i) => ({
        key: i.key,
        icon: i.icon,
        category: i.category,
        label: i.label ?? { en: i.en, ar: i.ar, he: i.he },
      }));
  }
  return out;
}

type OptionsState = { lists: OptionLists; ready: boolean; error: ApiError | null; reload: () => void };
const OptionsContext = createContext<OptionsState | null>(null);

/** Fetches /api/options once per signed-in session and caches it. Must sit inside AuthProvider. */
export function OptionsProvider({ children, initial }: { children: ReactNode; initial?: OptionLists }) {
  const auth = useContext(AuthContext);
  const signedIn = !!auth?.user;
  const [lists, setLists] = useState<OptionLists>(initial ?? {});
  const [ready, setReady] = useState(!!initial);
  const [error, setError] = useState<ApiError | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!signedIn || initial) return;
    let alive = true;
    api<unknown>("/api/options")
      .then((raw) => {
        if (!alive) return;
        setLists(normalizeOptions(raw));
        setReady(true);
        setError(null);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof ApiError ? e : new ApiError("INTERNAL", String(e), 0));
      });
    return () => {
      alive = false;
    };
  }, [signedIn, initial, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ lists, ready, error, reload }), [lists, ready, error, reload]);
  return <OptionsContext.Provider value={value}>{children}</OptionsContext.Provider>;
}

/**
 * const { list, optionLabel, item, labelOf, ready } = useOptions();
 *   list("strengths")                 → OptionItem[]
 *   optionLabel("strengths", "music") → label in the current UI language (falls back to en, then the key)
 *   item("interests", "cars")?.icon   → emoji/icon
 */
export function useOptions() {
  const ctx = useContext(OptionsContext);
  if (!ctx) throw new Error("useOptions must be used inside OptionsProvider");
  const { locale } = useI18n();
  const { lists, ready, error, reload } = ctx;
  return useMemo(() => {
    const list = (name: string): OptionItem[] => lists[name] ?? [];
    const item = (name: string, key: string): OptionItem | undefined => lists[name]?.find((i) => i.key === key);
    const labelOf = (i: OptionItem) => pick(i.label, locale) || i.key;
    const optionLabel = (name: string, key: string): string => {
      const i = item(name, key);
      return i ? labelOf(i) : key;
    };
    return { lists, ready, error, reload, list, item, labelOf, optionLabel };
  }, [lists, ready, error, reload, locale]);
}
