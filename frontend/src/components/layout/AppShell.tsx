import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { LogOut, Menu, type LucideIcon } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Dialog } from "@/components/ui/Dialog";
import { AccountIcon, BrandMarkIcon, ObserveAddIcon } from "@/icons";
import { useI18n } from "@/i18n/I18nProvider";
import { paths } from "@/lib/paths";
import { navFor, type NavItem } from "@/lib/routing";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./LocaleSwitcher";

/** Bottom bar shows at most this many regular items; the rest live in the menu sheet. */
const BOTTOM_MAX = 4;

/*
 * Nav icon states (spec 5.2): inactive = an `ink-muted` outline with no paint; active =
 * an `ink` outline with its designated primitive "coloured in" with `brand`. Custom
 * KidSphere icons read the paint from --icon-paint; lucide icons simply ignore it.
 */
const ICON_IDLE = "[--icon-paint:transparent]";
const ICON_ACTIVE = "[--icon-paint:var(--brand)]";

/**
 * The primary action always draws the observe-add lens block (spec kid signal 6), whatever
 * glyph its route registered: it is the control a teacher reaches for all day.
 */
const actionIcon = (i: NavItem): LucideIcon => (i.action ? ObserveAddIcon : i.icon);

function isActivePath(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** The brand mark (a child's first tower) and the wordmark in the display face. */
export function Brand({ to = "/", className }: { to?: string; className?: string }) {
  const { t } = useI18n();
  return (
    <Link to={to} className={cn("inline-flex min-h-11 items-center gap-2.5 rounded-md px-1", className)}>
      <BrandMarkIcon className="size-9 shrink-0" />
      <span className="font-display text-title font-semibold text-ink">{t("common.appName")}</span>
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
          "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors",
          isActive ? cn("bg-brand-soft font-semibold text-brand", ICON_ACTIVE) : cn("font-medium text-ink-muted hover:bg-tray hover:text-ink", ICON_IDLE),
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn("size-6 shrink-0", isActive && "text-ink")} aria-hidden />
          {label}
        </>
      )}
    </NavLink>
  );
}

function BottomLink({ to, label, icon: Icon, active }: { to: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-caption flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1",
        active ? cn("font-semibold text-brand", ICON_ACTIVE) : cn("font-medium text-ink-muted hover:text-ink", ICON_IDLE),
      )}
    >
      <span className={cn("flex h-7 w-12 items-center justify-center rounded-md transition-colors", active && "bg-brand-soft text-ink")}>
        <Icon className="size-6" aria-hidden />
      </span>
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

/** The raised centre action: a 56px brand block lifted out of the bar on a ground ring. */
function CentreAction({ item, label }: { item: NavItem; label: string }) {
  const Icon = actionIcon(item);
  return (
    <Link
      to={item.to}
      className="group text-caption flex min-w-0 flex-1 flex-col items-center justify-end gap-1 pb-1.5 font-semibold text-brand [--icon-paint:transparent]"
    >
      <span
        className={cn(
          "ks-press -mt-6 flex size-14 items-center justify-center rounded-md bg-brand text-on-brand",
          "shadow-[0_0_0_4px_var(--ground),var(--lip-brand)] group-hover:bg-brand-strong",
          "group-active:translate-y-0.5 group-active:shadow-[0_0_0_4px_var(--ground),var(--lip-brand-pressed)]",
        )}
        aria-hidden
      >
        <Icon className="size-7" />
      </span>
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

/**
 * Signed-in layout (spec 6.13).
 * - lg and up: a side nav on `ground` (brand, the primary action, nav, user block,
 *   language, sign out).
 * - below lg: a solid top bar (brand, language, avatar menu) and a `surface` bottom bar
 *   with up to 4 nav items around the raised centre action (nav item with `action: true`).
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
  const ActionIcon = action && actionIcon(action);
  const links = items.filter((i) => !i.action);
  const bottom = links.length > BOTTOM_MAX ? links.slice(0, BOTTOM_MAX - 1) : links;
  const overflow = links.length > BOTTOM_MAX;
  const split = Math.ceil(bottom.length / 2);
  const hasBottomBar = bottom.length > 0 || !!action;
  const roleLabel = user ? t(`common.roles.${user.role}`) : "";
  const onAccount = isActivePath(pathname, paths.account());

  async function signOut() {
    await logout();
    navigate(paths.login(), { replace: true });
  }

  const userBlock = user && (
    <Link
      to={paths.account()}
      aria-current={onAccount ? "page" : undefined}
      className={cn("flex min-h-11 items-center gap-3 rounded-md px-2 py-2 transition-colors", onAccount ? "bg-brand-soft" : "hover:bg-tray")}
    >
      <Avatar name={user.name} size="sm" className="size-9" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink" dir="auto">
          {user.name}
        </span>
        <span className="text-caption block text-ink-muted">{roleLabel}</span>
      </span>
    </Link>
  );

  const signOutButton = (
    <button
      type="button"
      onClick={signOut}
      className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-tray hover:text-ink"
    >
      <LogOut className="size-[18px] rtl:-scale-x-100" aria-hidden />
      {t("common.signOut")}
    </button>
  );

  return (
    <div className="min-h-dvh bg-ground lg:flex">
      {/* Desktop side nav */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 border-e border-line bg-ground p-3 lg:flex">
        <div className="pt-1">
          <Brand />
        </div>
        {action && (
          <Link
            to={action.to}
            className="ks-press flex h-12 items-center justify-center gap-2 rounded-md bg-brand px-5 text-base font-semibold text-on-brand shadow-lip-brand transition-colors hover:bg-brand-strong active:translate-y-0.5 active:shadow-lip-brand-pressed [--icon-paint:transparent]"
          >
            {ActionIcon && <ActionIcon className="size-5" aria-hidden />}
            {t(action.labelKey)}
          </Link>
        )}
        <nav className="flex-1 space-y-1 overflow-y-auto" aria-label={t("nav.main")}>
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

      {/* Phone / tablet top bar: solid ground, no blur */}
      <header className="sticky top-0 z-30 border-b border-line bg-ground pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-3">
          <Brand />
          <div className="flex items-center gap-1">
            <LocaleSwitcher variant="compact" />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label={t("nav.menu")}
              title={t("nav.menu")}
              aria-haspopup="dialog"
              className="inline-flex size-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-tray"
            >
              {user ? <Avatar name={user.name} size="sm" /> : <Menu className="size-5" />}
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
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
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
                className="text-caption flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 font-medium text-ink-muted hover:text-ink"
              >
                <span className="flex h-7 w-12 items-center justify-center">
                  <Menu className="size-6" aria-hidden />
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
            <nav className="space-y-1" aria-label={t("nav.main")}>
              {links.map((item) => (
                <SideLink key={item.to} item={item} label={t(item.labelKey)} onNavigate={() => setMenuOpen(false)} />
              ))}
            </nav>
          )}
          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-sm font-medium text-ink">{t("common.uiLanguage")}</p>
            <LocaleSwitcher variant="segmented" />
          </div>
          <div className="space-y-1 border-t border-line pt-3">
            <Link
              to={paths.account()}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                onAccount ? cn("bg-brand-soft text-brand", ICON_ACTIVE) : cn("text-ink-muted hover:bg-tray hover:text-ink", ICON_IDLE),
              )}
            >
              <AccountIcon className={cn("size-6", onAccount && "text-ink")} aria-hidden />
              {t("nav.account")}
            </Link>
            {signOutButton}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
