import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { CHILD_COOKIE } from "@/lib/auth/cookies";
import { AppError } from "@/lib/errors";
import { type ChildSessionInfo, resolveChildSession } from "@/server/services/child-mode";

export const getChildSession = cache(async (): Promise<ChildSessionInfo | null> => {
  const jar = await cookies();
  return resolveChildSession(jar.get(CHILD_COOKIE)?.value);
});

export async function requireChildSession(): Promise<ChildSessionInfo> {
  const s = await getChildSession();
  if (!s) throw new AppError("UNAUTHENTICATED", "Child mode is not active");
  return s;
}
