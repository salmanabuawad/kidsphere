"use client";

import { useRouter } from "next/navigation";
import type { ContentBody } from "@/lib/ai/schemas";
import { ContentPlayer, type PlayerCharacter } from "@/features/player/content-player";

export function PlayerScreen({
  body,
  narrations,
  characters,
}: {
  body: ContentBody;
  narrations: { sceneId: string | null; url: string }[];
  characters: PlayerCharacter[];
}) {
  const router = useRouter();
  return <ContentPlayer body={body} narrations={narrations} characters={characters} onHome={() => router.push("/play")} />;
}
