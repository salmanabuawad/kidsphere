import { z } from "zod";
import { authed } from "@/lib/route";
import { parseQuery } from "@/lib/api";
import { listLibrary } from "@/server/services/content";
import { CONTENT_TYPE_VALUES, DOMAIN_VALUES, localeSchema } from "@/server/validators";

const q = z.object({
  language: localeSchema.optional(),
  type: z.enum(CONTENT_TYPE_VALUES).optional(),
  status: z.enum(["DRAFT", "TEACHER_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"]).optional(),
  domain: z.enum(DOMAIN_VALUES).optional(),
  goalId: z.string().optional(),
  classId: z.string().optional(),
  createdById: z.string().optional(),
  ageBand: z.string().max(10).optional(),
  childId: z.string().optional(),
});
export const GET = authed(async (req, actor) => listLibrary(actor, parseQuery(req, q)));
