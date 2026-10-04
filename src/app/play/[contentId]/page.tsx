import { notFound, redirect } from "next/navigation";
import { getChildSession } from "@/lib/child-session";
import { isAppError } from "@/lib/errors";
import { childContentItem } from "@/server/services/child-mode";
import { PlayerScreen } from "@/features/child-mode/player-screen";

export default async function PlayContent({ params }: PageProps<"/play/[contentId]">) {
  const session = await getChildSession();
  if (!session) redirect("/login");
  const { contentId } = await params;
  let item;
  try {
    // Server-side gate: PUBLISHED + belongs to this child + child-facing kind.
    item = await childContentItem(session, contentId);
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }
  return <PlayerScreen body={item.body} narrations={item.narrations} characters={item.characters} />;
}
