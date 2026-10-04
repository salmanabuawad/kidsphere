"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  Globe2,
  Home,
  KeyRound,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  School,
  ScrollText,
  Settings,
  Shapes,
  ShieldCheck,
  Sparkles,
  Users,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./locale-switcher";
import { NotificationsBell } from "./notifications-bell";

const ICONS = {
  dashboard: LayoutDashboard,
  classes: School,
  weekly: CalendarDays,
  library: BookOpen,
  studio: Sparkles,
  home: Home,
  account: UserRound,
  orgs: Building2,
  kindergartens: Building2,
  adminClasses: Shapes,
  children: Users,
  users: Users,
  assignments: Link2,
  languages: Globe2,
  templates: ClipboardList,
  permissions: KeyRound,
  settings: Settings,
  ai: Sparkles,
  audit: ScrollText,
  shield: ShieldCheck,
  chart: BarChart3,
} satisfies Record<string, LucideIcon>;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean };

export function AppShell({
  nav,
  user,
  roleLabel,
  children,
  variant = "staff",
}: {
  nav: NavItem[];
  user: { name: string };
  roleLabel: string;
  children: ReactNode;
  variant?: "staff" | "parent";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/"));

  async function signOut() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  const links = (onNavigate?: () => void) =>
    nav.map((item) => {
      const Icon = ICONS[item.icon];
      const active = isActive(item);
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
            active ? "bg-brand/10 text-brand" : "hover:text-ink text-stone-600 hover:bg-stone-100",
          )}
        >
          <Icon className="size-[18px] shrink-0" aria-hidden />
          {item.label}
        </Link>
      );
    });

  const brand = (
    <Link href={nav[0]?.href ?? "/"} className="flex items-center gap-2.5 px-2">
      <span className="bg-brand flex size-9 items-center justify-center rounded-xl text-lg text-white" aria-hidden>
        ✦
      </span>
      <span className="text-lg font-semibold tracking-tight">{t("common.appName")}</span>
    </Link>
  );

  const footer = (
    <div className="border-line space-y-2 border-t pt-3">
      <div className="px-3">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="text-muted text-xs">{roleLabel}</p>
      </div>
      <LocaleSwitcher className="w-full" />
      <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-stone-600 hover:bg-stone-100">
        <LogOut className="size-4 rtl:rotate-180" aria-hidden />
        {t("common.signOut")}
      </button>
    </div>
  );

  if (variant === "parent") {
    // Phone-first: top bar + bottom tab bar.
    return (
      <div className="min-h-screen pb-20 md:pb-0">
        <header className="border-line bg-surface/90 sticky top-0 z-30 border-b backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-4">
            {brand}
            <div className="flex items-center gap-1">
              <NotificationsBell />
              <LocaleSwitcher compact />
              <button onClick={signOut} aria-label={t("common.signOut")} className="text-muted rounded-lg p-2 hover:bg-stone-100">
                <LogOut className="size-5 rtl:rotate-180" />
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
        <nav className="border-line fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 backdrop-blur md:hidden" aria-label="Main">
          <div className="mx-auto flex max-w-3xl justify-around">
            {nav.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-brand" : "text-muted")}
                >
                  <Icon className="size-5" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    );
  }

  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-line sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-4 border-e bg-white/70 p-3 lg:flex">
        <div className="py-2">{brand}</div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto" aria-label="Main">
          {links()}
        </nav>
        {footer}
      </aside>

      <header className="border-line bg-surface/90 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Menu" className="rounded-lg p-2 hover:bg-stone-100">
          <Menu className="size-5" />
        </button>
        {brand}
        <NotificationsBell />
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 flex w-72 flex-col gap-4 bg-white p-3 shadow-xl">
            <div className="flex items-center justify-between py-2">
              {brand}
              <button onClick={() => setOpen(false)} aria-label={t("common.close")} className="rounded-lg p-2 hover:bg-stone-100">
                <X className="size-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto">{links(() => setOpen(false))}</nav>
            {footer}
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="hidden h-14 items-center justify-end gap-2 px-8 lg:flex">
          <NotificationsBell />
        </div>
        <main className="mx-auto max-w-6xl px-4 pt-4 pb-16 md:px-8 lg:pt-0">{children}</main>
      </div>
    </div>
  );
}
