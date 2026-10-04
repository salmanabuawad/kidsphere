import { cookies } from "next/headers";
import { open } from "@/lib/route";
import { parseBody } from "@/lib/api";
import { getActor } from "@/lib/auth/session";
import { LOCALE_COOKIE } from "@/lib/auth/cookies";
import { db } from "@/lib/db";
import { setLocaleSchema } from "@/server/validators";

/** Switch UI language. Invalid locales are rejected by the schema (400). */
export const POST = open(async (req) => {
  const { locale } = await parseBody(req, setLocaleSchema);
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, httpOnly: false, secure: process.env.COOKIE_SECURE === "true" });
  const actor = await getActor();
  if (actor) await db.user.update({ where: { id: actor.userId }, data: { uiLocale: locale } });
  return { locale };
});
