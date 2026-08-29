import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "destructive" | "ghost" | "link" | "outline" | "primary" | "secondary";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  children,
  className,
  disabled,
  fullWidth = false,
  loading = false,
  loadingLabel = "Loading…",
  size = "default",
  type = "button",
  variant = "default",
  ...props
}, ref) {
  const styleVariant = variant === "default" || variant === "primary"
    ? "primary"
    : variant === "destructive"
      ? "destructive"
      : variant === "secondary"
        ? "secondary"
        : "ghost";
  const classes = cn(
    "button",
    styleVariant,
    `button-${variant}`,
    `button-size-${size}`,
    fullWidth && "wide",
    className,
  );

  return (
    <button
      {...props}
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      type={type}
      aria-busy={loading || undefined}
      aria-disabled={disabled || loading || undefined}
    >
      {loading && <span className="button-spinner" aria-hidden="true" />}
      {loading ? loadingLabel : children}
    </button>
  );
});
