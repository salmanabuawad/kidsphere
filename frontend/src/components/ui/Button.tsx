import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * primary: brand block with a hard lip (one per view). secondary: a surface block with a
 * line-strong border ("outline" is its old name, kept as an alias). soft: brand-soft, for
 * second-rank actions. ghost: transparent (Cancel, toolbars). danger: only the confirm
 * button of a delete dialog; elsewhere Delete is a ghost button with a danger label.
 */
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "soft";
/** md and larger are ≥44px touch targets; sm grows to 44px whenever any pointer is coarse (touch laptops too). */
export type ButtonSize = "sm" | "md" | "lg" | "xl";

/** Rubik in every language (never the display face inside a control); a 20px leading icon. */
const base =
  "ks-press inline-flex items-center justify-center gap-2 rounded-md font-semibold leading-none select-none whitespace-nowrap [&_svg]:shrink-0 " +
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none " +
  "aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:shadow-none";

const secondary = "border-[1.5px] border-line-strong bg-surface text-ink shadow-lip hover:bg-tray active:translate-y-0.5 active:shadow-none";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand shadow-lip-brand hover:bg-brand-strong active:translate-y-0.5 active:shadow-lip-brand-pressed",
  secondary,
  outline: secondary,
  soft: "bg-brand-soft text-brand hover:text-brand-strong hover:ring-[1.5px] hover:ring-brand hover:ring-inset active:translate-y-px",
  ghost: "text-ink-muted hover:bg-tray hover:text-ink active:bg-tray",
  danger:
    "bg-danger text-on-brand shadow-lip hover:bg-[color-mix(in_oklab,var(--danger)_90%,var(--ink))] active:translate-y-0.5 active:shadow-none",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm any-pointer-coarse:h-11 [&_svg]:size-4",
  md: "h-11 px-4 text-base [&_svg]:size-5",
  lg: "h-12 px-5 text-base [&_svg]:size-5",
  xl: "h-16 px-8 text-xl leading-7 rounded-lg [&_svg]:size-5",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Leading icon (e.g. <ObserveAddIcon />); replaced by a spinner while loading. */
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, disabled, className, children, icon, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export type ButtonLinkProps = LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode };

/** A react-router Link styled as a button. */
export function ButtonLink({ variant = "primary", size = "md", className, icon, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}

/**
 * Square icon-only button (44px, 48 on coarse pointers; sm 36 → 44); `label` is required
 * and becomes aria-label and title. `aria-pressed` shows the toggled state.
 */
export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "children" | "icon"> & { label: string; children: ReactNode }>(
  function IconButton({ label, variant = "ghost", size = "md", className, children, ...props }, ref) {
    const square = {
      sm: "w-9 px-0 any-pointer-coarse:w-11 [&_svg]:size-[18px]",
      md: "w-11 px-0 any-pointer-coarse:h-12 any-pointer-coarse:w-12 [&_svg]:size-5",
      lg: "w-12 px-0",
      xl: "w-16 px-0",
    }[size];
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        aria-label={label}
        title={label}
        className={cn(square, "aria-pressed:border-2 aria-pressed:border-brand aria-pressed:bg-brand-soft aria-pressed:text-brand", className)}
        {...props}
      >
        {children}
      </Button>
    );
  },
);
