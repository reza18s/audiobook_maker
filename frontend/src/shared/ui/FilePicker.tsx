import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { Input } from "./Input";

type FilePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
  buttonLabel?: string;
  description?: ReactNode;
  fileName?: string;
  label: ReactNode;
};

export function FilePicker({
  buttonLabel = "Choose file",
  description,
  fileName,
  id,
  disabled = false,
  label,
  ...props
}: FilePickerProps) {
  const generatedId = useId();
  const inputId = id ?? `file-picker-${generatedId}`;
  const labelId = `${inputId}-label`;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const labelledBy = [props["aria-labelledby"], labelId].filter(Boolean).join(" ");
  const describedBy = [props["aria-describedby"], descriptionId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="file-field">
      <span className="file-field-label" id={labelId}>{label}</span>
      <div className={cn("file-picker", disabled && "file-picker-disabled")}>
        <span className="file-picker-button" aria-hidden="true">{buttonLabel}</span>
        <span className={cn("file-picker-name", fileName ? "file-picker-selected" : "file-picker-empty")} title={fileName}>
          {fileName ?? "No file selected"}
        </span>
        <Input
          {...props}
          id={inputId}
          type="file"
          disabled={disabled}
          className="file-picker-input"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
        />
      </div>
      {description && <span className="field-help" id={descriptionId}>{description}</span>}
    </div>
  );
}
