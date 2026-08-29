import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "./cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, ...props }, ref) {
  return <select {...props} ref={ref} className={cn("ui-select", className)} />;
});

Select.displayName = "Select";
