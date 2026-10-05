import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Check, ChevronDown, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared control styling (spec 6.14): 48px, radius-md, `surface`, a 1.5px `line-strong`
 * border, 16px text (no iOS zoom). Hover darkens the border; keyboard focus adds the ring
 * and a brand border; invalid is a 2px danger border; disabled and read-only sit on `tray`.
 */
export const controlClass =
  "w-full rounded-md border-[1.5px] border-line-strong bg-surface px-3.5 text-base text-ink placeholder:text-ink-muted transition-colors " +
  "hover:border-ink-muted focus-visible:border-brand " +
  "aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger " +
  "disabled:cursor-not-allowed disabled:border-line disabled:bg-tray disabled:text-ink-muted [&[readonly]]:bg-tray";

/**
 * Text input. Use dir="ltr" for email, username, password and phone fields;
 * free text should use dir="auto".
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(controlClass, "h-12", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, dir = "auto", ...props },
  ref,
) {
  return <textarea ref={ref} rows={rows} dir={dir} className={cn(controlClass, "min-h-24 resize-y py-3 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(controlClass, "h-12 cursor-pointer appearance-none pe-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden />
    </div>
  );
});

export function Label({ className, children, required, ...props }: LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn("block text-sm font-medium text-ink", className)} {...props}>
      {children}
      {required && (
        <span className="text-danger" aria-hidden>
          {" "}
          *
        </span>
      )}
    </label>
  );
}

export type FieldControlProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean; required?: boolean };

/**
 * Label + control + hint/error, wired with ids for screen readers.
 *
 *   <Field label={t("common.name")} error={errors.name}>
 *     {(p) => <Input {...p} value={name} onChange={…} />}
 *   </Field>
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: (props: FieldControlProps) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-caption text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-caption flex items-start gap-1.5 font-medium text-danger" role="alert">
          <CircleAlert className="mt-px size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Checkbox row (≥44px): a 24px box, corner 6, line-strong border; checked is a brand block
 * with an on-brand Check (spec 6.14). The native input keeps the semantics and the focus
 * ring; appearance-none lets it take the block look.
 */
export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-base text-ink", className)}>
      <span className="relative inline-grid size-6 shrink-0">
        <input
          type="checkbox"
          className="peer col-start-1 row-start-1 size-6 cursor-pointer appearance-none rounded-[6px] border-[1.5px] border-line-strong bg-surface checked:border-brand checked:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
          {...props}
        />
        <Check
          className="pointer-events-none col-start-1 row-start-1 size-4 place-self-center text-on-brand opacity-0 peer-checked:opacity-100"
          strokeWidth={3}
          aria-hidden
        />
      </span>
      <span>{label}</span>
    </label>
  );
}
