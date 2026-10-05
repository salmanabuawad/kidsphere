/**
 * Generated content API (WP-11, backend/app/routers/content.py + feedback.py).
 *
 *   POST /api/children/{id}/content/generate → {content} | {items, pack_id} (+ fallback_reason)
 *   GET  /api/children/{id}/content?status&pack_id → {content: ContentSummary[]}
 *   GET  /api/packs/{packId} → {pack_id, child_id, items: ContentDetail[]}
 *   GET/PUT /api/content/{id}; POST …/approve | regenerate | duplicate | share | archive | feedback; DELETE (drafts)
 *   POST …/feedback → 201 {feedback, content}; 200 with the first save for a repeated client_request_id
 *
 * Parents get only shared, approved/completed rows and none of the staff fields.
 */
import type { GameTemplate, VideoStatus } from "@/features/player";
import { api } from "@/lib/api";

export type ContentType = "story" | "video" | "digital_game" | "real_world_activity";
export type GenerateType = ContentType | "pack";
export type Mode = "strength_builder" | "growth_support";
export type ContentStatus = "draft" | "approved" | "completed" | "archived";
export type FeedbackResult = "worked_well" | "partly" | "did_not_work";
export type FeedbackSupport = "independent" | "some_support" | "significant_support";

export const CONTENT_TYPES: ContentType[] = ["story", "video", "digital_game", "real_world_activity"];
export const GENERATE_TYPES: GenerateType[] = ["story", "video", "digital_game", "real_world_activity", "pack"];
export const MODES: Mode[] = ["strength_builder", "growth_support"];
export const STATUS_ORDER: ContentStatus[] = ["draft", "approved", "completed", "archived"];
export const RESULTS: FeedbackResult[] = ["worked_well", "partly", "did_not_work"];
export const RESULT_EMOJI: Record<FeedbackResult, string> = { worked_well: "🌟", partly: "🌤️", did_not_work: "🌧️" };
export const FEEDBACK_SUPPORT: FeedbackSupport[] = ["independent", "some_support", "significant_support"];
/** Order of the parts of a small pack. */
export const PACK_ORDER: Record<ContentType, number> = { story: 0, real_world_activity: 1, digital_game: 2, video: 3 };

export type LabelItem = { key?: string | null; label: string };

/** The allow-listed AI input stored with the row (staff only). */
export type GenerationInput = {
  mode?: Mode | null;
  content_type?: string;
  template?: string | null;
  language?: string;
  strengths?: LabelItem[];
  interests?: LabelItem[];
  what_helps?: LabelItem[];
  focus?: { title?: string | null; category?: string | null } | null;
  target_strength?: LabelItem | null;
  instruction?: string | null;
  variant?: number;
};

export type ContentSummary = {
  id: string;
  child_id?: string;
  pack_id?: string | null;
  content_type?: ContentType | string | null;
  template?: GameTemplate | string | null;
  language?: string | null;
  title: string;
  status?: ContentStatus | string | null;
  created_at?: string | null;
  updated_at?: string | null;
  approved_at?: string | null;
  video_status?: VideoStatus | null;
  video_url?: string | null;
  // staff only
  mode?: Mode | null;
  focus_area_id?: string | null;
  focus_area_title?: string | null;
  shared_with_parent?: boolean;
  is_template?: boolean;
  ai_provider?: string | null;
  ai_model?: string | null;
  variant?: number;
  video_provider?: string | null;
  last_feedback_result?: FeedbackResult | null;
};

export type HelpItem = { key?: string; custom?: string };

export type ContentFeedback = {
  id: string;
  result: FeedbackResult;
  support_level: string | null;
  observation: string | null;
  what_helped: HelpItem[] | null;
  created_at: string;
  by_name: string | null;
};

export type ContentDetail = ContentSummary & {
  content?: Record<string, unknown> | null;
  generation_input?: GenerationInput | null;
  approved_by?: { id: string; name: string | null } | null;
  created_by?: { id: string; name: string | null } | null;
  feedback?: ContentFeedback[];
};

export type GenerateBody = {
  mode: Mode;
  content_type: GenerateType;
  template?: GameTemplate;
  focus_area_id?: string;
  target_strength?: string;
  language?: string;
  include_video?: boolean;
};

export type GenerateResponse = { content?: ContentDetail; items?: ContentDetail[]; pack_id?: string; fallback_reason?: string | null };
export type ContentResponse = { content: ContentDetail };
export type ContentListResponse = { content: ContentSummary[] };
export type PackResponse = { pack_id: string; child_id: string; items: ContentDetail[] };
/** `client_request_id`: one id per feedback, resent on every retry until a save succeeds (the backend answers a repeat with the first save, 200). */
export type FeedbackBody = {
  result: FeedbackResult;
  support_level?: FeedbackSupport;
  observation?: string;
  what_helped?: (string | { custom: string })[];
  client_request_id?: string;
};

const enc = encodeURIComponent;
export const contentListUrl = (childId: string) => `/api/children/${enc(childId)}/content`;
export const contentUrl = (id: string) => `/api/content/${enc(id)}`;
export const packUrl = (packId: string) => `/api/packs/${enc(packId)}`;

export const generateContent = (childId: string, body: GenerateBody) =>
  api<GenerateResponse>(`/api/children/${enc(childId)}/content/generate`, { method: "POST", body });
export const updateContent = (id: string, body: { title?: string; content?: Record<string, unknown> }) =>
  api<ContentResponse>(contentUrl(id), { method: "PUT", body });
export const approveContent = (id: string) => api<ContentResponse>(`${contentUrl(id)}/approve`, { method: "POST" });
export const regenerateContent = (id: string, instruction?: string) =>
  api<ContentResponse>(`${contentUrl(id)}/regenerate`, { method: "POST", body: instruction ? { instruction } : {} });
export const duplicateContent = (id: string) => api<ContentResponse>(`${contentUrl(id)}/duplicate`, { method: "POST" });
export const shareContent = (id: string, shared: boolean) => api<ContentResponse>(`${contentUrl(id)}/share`, { method: "POST", body: { shared } });
export const archiveContent = (id: string) => api<ContentResponse>(`${contentUrl(id)}/archive`, { method: "POST" });
export const deleteContent = (id: string) => api<void>(contentUrl(id), { method: "DELETE" });
export const sendFeedback = (id: string, body: FeedbackBody) =>
  api<{ feedback: ContentFeedback; content: ContentDetail }>(`${contentUrl(id)}/feedback`, { method: "POST", body });

// ----------------------------------------------------------------------------- lifecycle (PLAN-ADJUSTMENTS B9)

export const isUsable = (s?: string | null) => s === "approved" || s === "completed";
export const canEdit = (s?: string | null) => s === "draft" || s === "approved";
export const canDelete = (s?: string | null) => s === "draft";
export const canShare = isUsable;

export function isContentType(v: unknown): v is ContentType {
  return typeof v === "string" && (CONTENT_TYPES as string[]).includes(v);
}

/** Group items by pack: [{packId, items}] keeps the input order of the first item of each group. */
export function groupByPack<T extends ContentSummary>(items: T[]): { packId: string | null; items: T[] }[] {
  const out: { packId: string | null; items: T[] }[] = [];
  const index = new Map<string, { packId: string | null; items: T[] }>();
  for (const it of items) {
    if (!it.pack_id) {
      out.push({ packId: null, items: [it] });
      continue;
    }
    let g = index.get(it.pack_id);
    if (!g) {
      g = { packId: it.pack_id, items: [] };
      index.set(it.pack_id, g);
      out.push(g);
    }
    g.items.push(it);
  }
  for (const g of out) g.items.sort((a, b) => order(a) - order(b));
  return out;
}

const order = (c: ContentSummary) => (isContentType(c.content_type) ? PACK_ORDER[c.content_type] : 9);

/** Discussion prompts of a pack story (stored in the story row's content). */
export function discussionPrompts(content: unknown): string[] {
  const v = content && typeof content === "object" ? (content as { discussion_prompts?: unknown }).discussion_prompts : undefined;
  return Array.isArray(v) ? v.filter((p): p is string => typeof p === "string" && p.trim() !== "") : [];
}

/** UNSAFE_CONTENT details → the list of issues. */
export function unsafeIssues(details: unknown): string[] {
  const issues = details && typeof details === "object" ? (details as { issues?: unknown }).issues : undefined;
  return Array.isArray(issues) ? issues.filter((i): i is string => typeof i === "string") : [];
}
