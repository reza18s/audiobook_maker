import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, ...props }, ref) {
  return <textarea {...props} ref={ref} className={cn("ui-textarea", className)} />;
});

Textarea.displayName = "Textarea";
