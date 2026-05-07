import { forwardRef, SelectHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, required, error, hint, children, className, ...rest },
  ref,
) {
  return (
    <div className="w-full">
      {label && (
        <label className="label-psiclinic">
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}
      <select
        ref={ref}
        className={cn(
          "input-psiclinic w-full appearance-none bg-no-repeat pr-9",
          error && "border-error focus:border-error focus:ring-error/20",
          className,
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>\")",
          backgroundPosition: "right 0.75rem center",
        }}
        {...rest}
      >
        {children}
      </select>
      {error && <p className="text-xs text-error mt-1">{error}</p>}
      {hint && !error && <p className="text-xs text-brand-muted mt-1">{hint}</p>}
    </div>
  );
});
