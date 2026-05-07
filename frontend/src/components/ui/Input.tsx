import { forwardRef, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  required?: boolean;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, required, error, leftIcon, rightIcon, hint, className, ...rest },
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
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            "input-psiclinic w-full",
            leftIcon && "pl-10",
            rightIcon && "pr-10",
            error && "border-error focus:border-error focus:ring-error/20",
            className,
          )}
          {...rest}
        />
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted">
            {rightIcon}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-error mt-1">{error}</p>}
      {hint && !error && <p className="text-xs text-brand-muted mt-1">{hint}</p>}
    </div>
  );
});
