import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./cn";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ className, ...props }, ref) {
  return <input {...props} ref={ref} type="checkbox" className={cn("ui-checkbox", className)} />;
});

Checkbox.displayName = "Checkbox";
