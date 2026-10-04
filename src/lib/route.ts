import "server-only";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import type { Actor } from "@/lib/auth/actor";
import { requireActor } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { handler } from "@/lib/api";

type Ctx<P> = { params: Promise<P> };

/**
 * Reject cross-site state-changing requests. SameSite=Lax cookies already
 * block most CSRF; this closes the remaining gaps (e.g. same-site subdomains).
 */
export function assertSameOrigin(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new AppError("FORBIDDEN", "Cross-site request blocked");
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("FORBIDDEN", "Cross-site request blocked");
  }
}

/** Authenticated JSON route: authentication + role gate + origin check + safe errors. */
export function authed<P = Record<string, never>>(
  fn: (req: Request, actor: Actor, params: P) => Promise<unknown>,
  options: { roles?: Role[]; status?: number } = {},
) {
  return handler<Ctx<P>>(async (req, ctx) => {
    assertSameOrigin(req);
    const actor = await requireActor(options.roles);
    const params = await ctx.params;
    const result = await fn(req, actor, params);
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? { ok: true }, { status: options.status ?? 200 });
  });
}

/** Unauthenticated JSON route (login, password reset, health). */
export function open<P = Record<string, never>>(fn: (req: Request, params: P) => Promise<unknown>, options: { status?: number } = {}) {
  return handler<Ctx<P>>(async (req, ctx) => {
    assertSameOrigin(req);
    const result = await fn(req, await ctx.params);
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? { ok: true }, { status: options.status ?? 200 });
  });
}

/** Binary response for private files; never cached by shared caches. */
export function fileResponse(data: Buffer, mimeType: string) {
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}

/** Read a multipart upload into memory (files are size-checked by the services). */
export async function readUpload(req: Request, field = "file") {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("UPLOAD_FAILED", "The upload could not be read.");
  }
  const file = form.get(field);
  if (!(file instanceof File)) throw new AppError("UPLOAD_FAILED", "No file was provided.");
  const data = Buffer.from(await file.arrayBuffer());
  return { form, file: { data, type: file.type, size: file.size } };
}
