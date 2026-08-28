import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "onChange" | "value" | "aria-describedby"> & {
  label: ReactNode;
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  description?: ReactNode;
  helpText?: string;
  error?: ReactNode;
};

export function TextField({
  label,
  value,
  onValueChange,
  description,
  helpText,
  error,
  id,
  name,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? name ?? `field-${generatedId}`;
  const descriptionId = description || helpText ? `${fieldId}-help` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <label className="field" htmlFor={fieldId}>
      <span>{label}</span>
      <input
        {...props}
        name={name}
        id={fieldId}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
      />
      {(description || helpText) && <span className="field-help" id={descriptionId}>{description ?? helpText}</span>}
      {error && <span className="field-help error-text" id={errorId} role="alert">{error}</span>}
    </label>
  );
}
