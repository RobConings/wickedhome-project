import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  label: React.ReactNode;
  /** Must match the `id` of the control passed as child. */
  htmlFor: string;
  description?: React.ReactNode;
  errors?: string[];
  /** Shows "(optional)" after the label. */
  optionalLabel?: string;
  className?: string;
  /** A single form control. It receives `aria-invalid` and `aria-describedby` automatically. */
  children: React.ReactElement<{ "aria-invalid"?: boolean; "aria-describedby"?: string }>;
};

/** Label, control, help text and error messages in a consistent arrangement. */
export function FormField({ label, htmlFor, description, errors, optionalLabel, className, children }: FormFieldProps) {
  const descriptionId = `${htmlFor}-description`;
  const errorId = `${htmlFor}-error`;
  const hasError = Boolean(errors?.length);
  const describedBy = [description && descriptionId, hasError && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {optionalLabel && <span className="font-normal text-muted-foreground">({optionalLabel})</span>}
      </Label>
      {React.cloneElement(children, { "aria-invalid": hasError || undefined, "aria-describedby": describedBy })}
      {description && !hasError && (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {hasError && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {errors?.join(" ")}
        </p>
      )}
    </div>
  );
}
