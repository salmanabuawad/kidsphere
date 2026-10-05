import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { LogOut, Menu, Sprout, UserRound, type LucideIcon } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Dialog } from "@/components/ui/Dialog";
import { useI18n } from "@/i18n/I18nProvider";
import { paths } from "@/lib/paths";
import { navFor, type NavItem } from "@/lib/routing";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./LocaleSwitcher";

/** Bottom bar shows at most this many regular items; the rest live in the menu sheet. */
const BOTTOM_MAX = 4;

function isActivePath(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function Brand({ to = "/", className }: { to?: string; className?: string }) {
  const { t } = useI18n();
  return (
    <Link to={to} className={cn("inline-flex min-h-11 items-center gap-2.5 rounded-xl px-1", className)}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-white shadow-sm" aria-hidden>
        <Sprout className="size-5" />
      </span>
      <span className="text-lg font-semibold tracking-tight text-ink">{t("common.appName")}</span>
    </Link>
  );
}

function SideLink({ item, label, onNavigate }: { item: NavItem; label: string; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
          isActive ? "bg-brand-soft text-brand" : "text-stone-600 hover:bg-stone-100 hover:text-ink",
        )
      }
    >
      <Icon className="size-[18px] shrink-0" aria-hidden />
      {label}
    </NavLink>
  );
}

function BottomLink({ to, label, icon: Icon, active }: { to: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium",
        active ? "text-brand" : "text-muted hover:text-ink",
      )}
    >
      <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-brand-soft")}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

function CentreAction({ item, label }: { item: NavItem; label: string }) {
  const Icon = item.icon;
  return (
    <Link to={item.to} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1 pb-1.5 text-[11px] font-semibold text-brand">
      <span
        className="-mt-6 flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-[var(--shadow-raised)] ring-4 ring-surface transition-transform group-active:scale-95"
        aria-hidden
      >
        <Icon className="size-7" strokeWidth={2.25} />
      </span>
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

/**
 * Signed-in layout.
 * - lg and up: sidebar (brand, primary action, nav, user block, language, sign out).
 * - below lg: top bar (brand, language, menu) and a bottom bar with up to 4 nav
 *   items around a raised centre action (nav item with `action: true`).
 * Nav comes from route metadata (see lib/routing.ts) filtered by the user's role.
 */
export function AppShell({ nav, children }: { nav: NavItem[]; children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  const items = navFor(nav, user?.role);
  const action = items.find((i) => i.action);
  const links = items.filter((i) => !i.action);
  const bottom = links.length > BOTTOM_MAX ? links.slice(0, BOTTOM_MAX - 1) : links;
  const overflow = links.length > BOTTOM_MAX;
  const split = Math.ceil(bottom.length / 2);
  const hasBottomBar = bottom.length > 0 || !!action;
  const roleLabel = user ? t(`common.roles.${user.role}`) : "";

  async function signOut() {
    await logout();
    navigate(paths.login(), { replace: true });
  }

  const userBlock = user && (
    <Link
      to={paths.account()}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-stone-100",
        isActivePath(pathname, paths.account()) && "bg-brand-soft",
      )}
    >
      <Avatar name={user.name} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink" dir="auto">
          {user.name}
        </span>
        <span className="block text-xs text-muted">{roleLabel}</span>
      </span>
    </Link>
  );

  const signOutButton = (
    <button
      type="button"
      onClick={signOut}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-stone-600 hover:bg-stone-100 hover:text-ink"
    >
      <LogOut className="size-4 rtl:rotate-180" aria-hidden />
      {t("common.signOut")}
    </button>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 border-e border-line bg-white/70 p-3 lg:flex">
        <div className="pt-1">
          <Brand />
        </div>
        {action && (
          <Link
            to={action.to}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong"
          >
            <action.icon className="size-5" aria-hidden />
            {t(action.labelKey)}
          </Link>
        )}
        <nav className="flex-1 space-y-0.5 overflow-y-auto" aria-label={t("nav.main")}>
          {links.map((item) => (
            <SideLink key={item.to} item={item} label={t(item.labelKey)} />
          ))}
        </nav>
        <div className="space-y-1 border-t border-line pt-3">
          {userBlock}
          <LocaleSwitcher className="w-full" />
          {signOutButton}
        </div>
      </aside>

      {/* Phone / tablet top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-3">
          <Brand />
          <div className="flex items-center gap-1">
            <LocaleSwitcher variant="compact" />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label={t("nav.menu")}
              aria-haspopup="dialog"
              className="inline-flex size-11 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-100"
            >
              {user ? <Avatar name={user.name} size="sm" className="ring-0" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </header>

      <div className="min-w-0 flex-1">
        <main className={cn("mx-auto max-w-6xl px-4 pt-5 md:px-8 lg:pt-8 lg:pb-12", hasBottomBar ? "pb-32" : "pb-12")}>{children}</main>
      </div>

      {/* Phone / tablet bottom bar */}
      {hasBottomBar && (
        <nav
          aria-label={t("nav.main")}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          <div className="mx-auto flex max-w-xl items-stretch px-2">
            {bottom.slice(0, split).map((i) => (
              <BottomLink key={i.to} to={i.to} label={t(i.labelKey)} icon={i.icon} active={isActivePath(pathname, i.to)} />
            ))}
            {action && <CentreAction item={action} label={t(action.labelKey)} />}
            {bottom.slice(split).map((i) => (
              <BottomLink key={i.to} to={i.to} label={t(i.labelKey)} icon={i.icon} active={isActivePath(pathname, i.to)} />
            ))}
            {overflow && (
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium text-muted hover:text-ink"
              >
                <span className="flex h-7 w-12 items-center justify-center">
                  <Menu className="size-5" aria-hidden />
                </span>
                {t("nav.more")}
              </button>
            )}
          </div>
        </nav>
      )}

      {/* Phone / tablet menu sheet */}
      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title={t("nav.menu")} size="sm">
        <div className="space-y-4">
          {userBlock}
          {links.length > 0 && (
            <nav className="space-y-0.5" aria-label={t("nav.main")}>
              {links.map((item) => (
                <SideLink key={item.to} item={item} label={t(item.labelKey)} onNavigate={() => setMenuOpen(false)} />
              ))}
            </nav>
          )}
          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-sm font-medium text-ink">{t("common.uiLanguage")}</p>
            <LocaleSwitcher variant="segmented" />
          </div>
          <div className="space-y-0.5 border-t border-line pt-3">
            <Link to={paths.account()} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-stone-600 hover:bg-stone-100">
              <UserRound className="size-4" aria-hidden />
              {t("nav.account")}
            </Link>
            {signOutButton}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
