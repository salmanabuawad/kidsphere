"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/misc";

type Key = "overview" | "parent" | "observations" | "profile" | "goals" | "content" | "progress";

export function ChildTabs({ childId, labels, pending }: { childId: string; labels: Record<Key, string>; pending: number }) {
  const pathname = usePathname();
  const base = `/teacher/children/${childId}`;
  const keys: Key[] = ["overview", "parent", "observations", "profile", "goals", "content", "progress"];
  const active = keys.find((k) => k !== "overview" && pathname.startsWith(`${base}/${k}`)) ?? "overview";
  return (
    <TabNav
      active={active}
      tabs={keys.map((k) => ({ key: k, label: labels[k], href: k === "overview" ? base : `${base}/${k}`, count: k === "profile" ? pending : undefined }))}
    />
  );
}
