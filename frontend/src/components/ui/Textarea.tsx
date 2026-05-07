import { forwardRef, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { label, required, error, hint, className, rows = 4, ...rest },
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
      <textarea
        ref={ref}
        rows={rows}
        className={cn(
          "input-psiclinic w-full !h-auto py-2.5 leading-relaxed",
          error && "border-error focus:border-error focus:ring-error/20",
          className,
        )}
        {...rest}
      />
      {error && <p className="text-xs text-error mt-1">{error}</p>}
      {hint && !error && <p className="text-xs text-brand-muted mt-1">{hint}</p>}
    </div>
  );
});
