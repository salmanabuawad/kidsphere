import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-ink-muted">
      <Loader2 className={cn("size-5 animate-spin", className)} aria-hidden />
      {label ? <span className="text-sm">{label}</span> : <span className="sr-only">…</span>}
    </span>
  );
}

/** Centered spinner for whole-page loading (auth check, route data). */
export function FullPageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center" aria-busy="true">
      <Spinner className="size-7 text-brand" label={label} />
    </div>
  );
}

/** Loading placeholder: a static tray block (teacher screens have no idle or looping animation, spec 4.4). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-md bg-tray", className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-9 w-56" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
