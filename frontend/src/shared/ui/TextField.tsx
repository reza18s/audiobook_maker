import type { InputHTMLAttributes, ReactNode } from "react";
import { Field } from "./Field";
import { Input } from "./Input";

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
  return (
    <Field
      label={label}
      id={id}
      description={description || helpText}
      error={error}
      required={props.required}
    >
      <Input
        {...props}
        name={name}
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
    </Field>
  );
}
