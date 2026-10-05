import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared control styling: 44px tall, calm border, brand focus. */
export const controlClass =
  "w-full rounded-xl border border-line bg-white px-3.5 text-base text-ink placeholder:text-stone-400 shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)] transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-stone-50 disabled:text-muted aria-[invalid=true]:border-rose-400 sm:text-sm";

/**
 * Text input. Use dir="ltr" for email, username, password and phone fields;
 * free text should use dir="auto".
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(controlClass, "h-11", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, dir = "auto", ...props },
  ref,
) {
  return <textarea ref={ref} rows={rows} dir={dir} className={cn(controlClass, "min-h-11 py-2.5 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(controlClass, "h-11 cursor-pointer appearance-none pe-10", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
});

export function Label({ className, children, required, ...props }: LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn("block text-sm font-medium text-ink", className)} {...props}>
      {children}
      {required && (
        <span className="text-rose-600" aria-hidden>
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
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-rose-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink", className)}>
      <input type="checkbox" className="size-5 shrink-0 rounded border-line accent-[var(--brand)]" {...props} />
      <span>{label}</span>
    </label>
  );
}
