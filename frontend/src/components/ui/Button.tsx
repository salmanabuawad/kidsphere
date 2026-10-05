import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "soft";
/** md and larger are ≥44px touch targets; sm grows to 44px on coarse pointers. */
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[background-color,color,box-shadow,filter] select-none whitespace-nowrap disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-ink shadow-sm hover:bg-brand-strong active:brightness-95",
  secondary: "bg-ink text-white hover:bg-stone-800",
  outline: "border border-line bg-card text-ink hover:bg-stone-50 hover:border-stone-300",
  ghost: "text-ink hover:bg-stone-100",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  soft: "bg-brand-soft text-brand hover:bg-brand/15",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm pointer-coarse:h-11",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
  xl: "h-16 px-8 text-xl rounded-2xl",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Leading icon (e.g. <Plus />); hidden while loading. */
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
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
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

/** Square icon-only button; `label` is required for screen readers. */
export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "children" | "icon"> & { label: string; children: ReactNode }>(
  function IconButton({ label, variant = "ghost", size = "md", className, children, ...props }, ref) {
    const square = { sm: "w-9 px-0 pointer-coarse:w-11", md: "w-11 px-0", lg: "w-12 px-0", xl: "w-16 px-0" }[size];
    return (
      <Button ref={ref} variant={variant} size={size} aria-label={label} title={label} className={cn(square, className)} {...props}>
        {children}
      </Button>
    );
  },
);
