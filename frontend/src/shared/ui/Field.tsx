import { cloneElement, useId } from "react";
import type { AriaAttributes, ReactElement, ReactNode } from "react";

type FieldControlProps = {
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  "aria-busy"?: AriaAttributes["aria-busy"];
  "aria-describedby"?: string;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
};

export type FieldProps = {
  children: ReactElement<FieldControlProps>;
  className?: string;
  description?: ReactNode;
  disabled?: boolean;
  error?: ReactNode;
  id?: string;
  label: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  required?: boolean;
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Field({
  children,
  className,
  description,
  disabled = false,
  error,
  id,
  label,
  loading = false,
  loadingLabel = "Loading…",
  required = false,
}: FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? children.props.id ?? children.props.name ?? `field-${generatedId}`;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const loadingId = loading ? `${fieldId}-loading` : undefined;
  const describedBy = [children.props["aria-describedby"], descriptionId, errorId, loadingId]
    .filter(Boolean)
    .join(" ") || undefined;

  const control = cloneElement(children, {
    id: fieldId,
    disabled: disabled || loading || children.props.disabled,
    required: required || children.props.required,
    "aria-busy": loading || children.props["aria-busy"] || undefined,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : children.props["aria-invalid"],
  });

  return (
    <label className={joinClasses("field", className)} htmlFor={fieldId}>
      <span>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </span>
      {control}
      {description && <span className="field-help" id={descriptionId}>{description}</span>}
      {loading && <span className="field-help" id={loadingId} role="status">{loadingLabel}</span>}
      {error && <span className="field-help error-text" id={errorId} role="alert">{error}</span>}
    </label>
  );
}
