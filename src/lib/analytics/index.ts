/**
 * Product analytics with sanitized events only.
 *
 * Event names are a closed set (no child data in names) and properties are
 * restricted to enums / numbers / booleans. Events are stored internally; an
 * external sink can be attached via `setAnalyticsSink` and will receive the
 * same sanitized payload.
 */
import { db } from "@/lib/db";

export type AnalyticsEventName =
  | "questionnaire_started"
  | "questionnaire_submitted"
  | "observation_created"
  | "content_generated"
  | "content_regenerated"
  | "content_edited"
  | "content_approved"
  | "content_published"
  | "outcome_recorded"
  | "goal_created"
  | "child_mode_launched";

type Primitive = string | number | boolean | null;
export type AnalyticsProps = Record<string, Primitive>;

/** Keys allowed in properties — anything else is dropped. */
const ALLOWED_KEYS = new Set([
  "contentType",
  "language",
  "kind",
  "durationMs",
  "durationSeconds",
  "provider",
  "repaired",
  "result",
  "domain",
  "editedFields",
  "mode",
  "role",
  "sectionCount",
]);

export type AnalyticsSink = (name: AnalyticsEventName, props: AnalyticsProps) => void | Promise<void>;
let externalSink: AnalyticsSink | null = null;
export function setAnalyticsSink(sink: AnalyticsSink | null) {
  externalSink = sink;
}

export function sanitize(props: Record<string, unknown>): AnalyticsProps {
  const out: AnalyticsProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
    else if (typeof v === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(v)) out[k] = v;
  }
  return out;
}

export async function track(name: AnalyticsEventName, organizationId: string | null, props: Record<string, unknown> = {}) {
  const clean = sanitize(props);
  try {
    await db.analyticsEvent.create({ data: { name, organizationId, properties: clean } });
    await externalSink?.(name, clean);
  } catch {
    // Analytics must never break a user flow.
  }
}
