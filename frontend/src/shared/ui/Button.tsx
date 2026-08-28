import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "destructive" | "ghost" | "link" | "outline" | "primary" | "secondary";
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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
  // The project stylesheet currently defines `primary` and `ghost`; the
  // additional names keep the API shadcn-compatible without requiring CSS
  // or Tailwind changes.
  const styleVariant = variant === "default" || variant === "primary" ? "primary" : "ghost";
  const classes = joinClasses(
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
