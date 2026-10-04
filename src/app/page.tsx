import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getActor } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/actor";
import { CHILD_COOKIE } from "@/lib/auth/cookies";

export default async function Root() {
  if ((await cookies()).get(CHILD_COOKIE)?.value) redirect("/play");
  const actor = await getActor();
  redirect(actor ? homePathFor(actor.role) : "/login");
}
