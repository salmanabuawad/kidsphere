import { useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { AuthContext } from "@/auth/AuthProvider";
import { pick, type Localized } from "@/i18n/config";
import { useI18n } from "@/i18n/I18nProvider";
import { api, ApiError, onUnauthenticated } from "./api";

/**
 * The static source-document registries from GET /api/source-model
 * (backend/app/data/source/*.json): every parent-questionnaire question and every
 * observation-model item, in source order, with storage path, sensitivity, AI policy,
 * PDF section and en/ar/he labels. Static per deploy, so it is fetched once per page
 * load and shared by every caller.
 *
 *   const sm = useSourceModel();
 *   sm.sections("parent_questionnaire")            → sections in source order
 *   sm.items("parent_questionnaire", "joy")         → that section's items in order
 *   sm.item("observation_model", "OM-D06-02")       → one item by id
 *   sm.label(item)                                  → its label in the UI language
 *
 * `source_he` is the verbatim source wording. It is kept for traceability and is
 * never rendered: always show `label`.
 */

export type RegistryName = "parent_questionnaire" | "observation_model";
export const REGISTRY_NAMES: readonly RegistryName[] = ["parent_questionnaire", "observation_model"];

/** none, or the category that keeps an item out of AI payloads and out of PDFs unless included (COVERAGE-MATRIX §7). */
export type Sensitivity = "none" | "third_party" | "family" | "health" | "medical";
/** never | label | domain (§0.5); n/a for static text. */
export type AiPolicy = "never" | "label" | "domain" | "n/a";

export type RegistrySection = {
  id: string;
  key: string;
  order: number;
  label: Localized;
  [extra: string]: unknown;
};

export type RegistryItem = {
  id: string;
  /** The section's key (or id). */
  section: string;
  order: number;
  kind: string;
  /** Storage path, e.g. "PP.joy.likes_at_home" or "TA.social.items.initiates_contact". */
  storage: string;
  /** The option list name (GET /api/options) for choice items. */
  options?: string | string[] | null;
  sensitivity: Sensitivity;
  ai_policy: AiPolicy;
  /** PDF section code, e.g. "R2§C" (null when not printed). */
  pdf?: string | null;
  label: Localized;
  /** Verbatim Hebrew source wording: traceability only, never rendered. */
  source_he?: string;
  /** Observation model extras (domain key, subgroup, item key, ai_domain …) and questionnaire extras (maps_to …). */
  [extra: string]: unknown;
};

export type Registry = {
  meta: Record<string, unknown>;
  /** Sorted by `order`. */
  sections: RegistrySection[];
  /** Sorted by section order, then item order. */
  items: RegistryItem[];
};

/** Registries that exist on the server; one that is not there yet is simply absent. */
export type SourceModel = Partial<Record<RegistryName, Registry>> & Record<string, Registry | undefined>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number.MAX_SAFE_INTEGER);
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

function normalizeRegistry(raw: unknown): Registry | null {
  if (!isObj(raw) || !Array.isArray(raw.sections) || !Array.isArray(raw.items)) return null;
  const sections = (raw.sections as unknown[])
    .filter(isObj)
    .map((s) => ({ ...s, id: str(s.id) || str(s.key), key: str(s.key) || str(s.id), order: num(s.order), label: isObj(s.label) ? (s.label as Localized) : {} }))
    .filter((s) => s.id)
    .sort((a, b) => a.order - b.order);
  const sectionRank = new Map<string, number>();
  sections.forEach((s, i) => {
    sectionRank.set(s.key, i);
    sectionRank.set(s.id, i);
  });
  const items = (raw.items as unknown[])
    .filter(isObj)
    .map(
      (i) =>
        ({
          ...i,
          id: str(i.id),
          section: str(i.section),
          order: num(i.order),
          kind: str(i.kind),
          storage: str(i.storage),
          sensitivity: (str(i.sensitivity) || "none") as Sensitivity,
          ai_policy: (str(i.ai_policy) || "never") as AiPolicy,
          label: isObj(i.label) ? (i.label as Localized) : {},
        }) as RegistryItem,
    )
    .filter((i) => i.id)
    .sort((a, b) => (sectionRank.get(a.section) ?? Number.MAX_SAFE_INTEGER) - (sectionRank.get(b.section) ?? Number.MAX_SAFE_INTEGER) || a.order - b.order);
  return { meta: isObj(raw.meta) ? raw.meta : {}, sections, items };
}

/**
 * {parent_questionnaire, observation_model} → sorted registries. A registry that the
 * server reports as {} or null (not shipped yet) is left out, so callers render nothing
 * for it instead of failing.
 */
export function normalizeSourceModel(raw: unknown): SourceModel {
  const out: SourceModel = {};
  if (!isObj(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    const reg = normalizeRegistry(value);
    if (reg) out[name] = reg;
  }
  return out;
}

// ---- module cache (one fetch per page load, shared by every hook) ----

type Snapshot = { model: SourceModel | undefined; error: ApiError | null; loading: boolean };

let snapshot: Snapshot = { model: undefined, error: null, loading: false };
let inflight: Promise<SourceModel> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const getSnapshot = () => snapshot;

/**
 * Fetch (once) and cache the registries. Concurrent callers share one request;
 * `force` refetches. Resolves with the normalized model, rejects with ApiError.
 */
export function loadSourceModel(force = false): Promise<SourceModel> {
  if (!force && snapshot.model) return Promise.resolve(snapshot.model);
  if (!force && inflight) return inflight;
  const gen = ++generation;
  publish({ ...snapshot, loading: true, error: null });
  const request = api<unknown>("/api/source-model").then(
    (raw) => {
      const model = normalizeSourceModel(raw);
      if (gen === generation) {
        inflight = null;
        publish({ model, error: null, loading: false });
      }
      return model;
    },
    (e: unknown) => {
      const error = e instanceof ApiError ? e : new ApiError("INTERNAL", String(e), 0);
      if (gen === generation) {
        inflight = null;
        publish({ model: snapshot.model, error, loading: false });
      }
      throw error;
    },
  );
  inflight = request;
  return request;
}

/** Put registries into the cache without a request (tests, or data that is already at hand). */
export function primeSourceModel(raw: unknown) {
  generation++;
  inflight = null;
  publish({ model: normalizeSourceModel(raw), error: null, loading: false });
}

/** Forget the cache; the next useSourceModel() fetches again. Also runs when the session ends (401). */
export function clearSourceModelCache() {
  generation++;
  inflight = null;
  publish({ model: undefined, error: null, loading: false });
}

onUnauthenticated(clearSourceModelCache);

const EMPTY: SourceModel = {};

export type SourceModelApi = {
  model: SourceModel;
  /** True once the registries arrived (also when some are not shipped yet). */
  ready: boolean;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
  registry: (name: RegistryName | string) => Registry | null;
  /** Sections in source order. */
  sections: (name: RegistryName | string) => RegistrySection[];
  /** Items in source order, optionally only those of one section (by key or id). */
  items: (name: RegistryName | string, section?: string) => RegistryItem[];
  item: (name: RegistryName | string, id: string) => RegistryItem | undefined;
  section: (name: RegistryName | string, keyOrId: string) => RegistrySection | undefined;
  /** Label in the UI language (falls back to en, then the key or id); never source_he. */
  label: (entry: { label?: Localized; key?: unknown; id?: unknown } | null | undefined) => string;
};

/**
 * Cached GET /api/source-model for signed-in users. Every component may call it;
 * there is one request per page load (or until reload()).
 */
export function useSourceModel(): SourceModelApi {
  const auth = useContext(AuthContext);
  const signedIn = !!auth?.user;
  const { locale } = useI18n();
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    // A failed load is retried when the next component mounts (or on reload()).
    if (signedIn && !snapshot.model && !inflight) loadSourceModel().catch(() => undefined);
  }, [signedIn]);

  const reload = useCallback(() => {
    loadSourceModel(true).catch(() => undefined);
  }, []);

  return useMemo(() => {
    const model = snap.model ?? EMPTY;
    const registry = (name: string) => model[name] ?? null;
    const sections = (name: string) => registry(name)?.sections ?? [];
    const section = (name: string, keyOrId: string) => sections(name).find((s) => s.key === keyOrId || s.id === keyOrId);
    const items = (name: string, sec?: string) => {
      const all = registry(name)?.items ?? [];
      if (sec === undefined) return all;
      const s = section(name, sec);
      const refs = new Set([sec, s?.key, s?.id].filter(Boolean));
      return all.filter((i) => refs.has(i.section));
    };
    const item = (name: string, id: string) => registry(name)?.items.find((i) => i.id === id);
    const label = (entry: { label?: Localized; key?: unknown; id?: unknown } | null | undefined) =>
      entry ? pick(entry.label, locale) || str(entry.key) || str(entry.id) : "";
    return { model, ready: !!snap.model, loading: snap.loading, error: snap.error, reload, registry, sections, items, item, section, label };
  }, [snap, locale, reload]);
}
