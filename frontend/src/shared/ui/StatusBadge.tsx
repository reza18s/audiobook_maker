import type { HTMLAttributes, ReactNode } from "react";

export type StatusBadgeTone = "danger" | "info" | "neutral" | "success" | "warning";

export type StatusBadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  children: ReactNode;
  dot?: boolean;
  live?: "assertive" | "off" | "polite";
  status?: string;
  tone?: StatusBadgeTone;
};

const toneClasses: Record<StatusBadgeTone, string> = {
  danger: "status-failed",
  info: "status-queued",
  neutral: "",
  success: "status-ready",
  warning: "status-running",
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function StatusBadge({
  children,
  className,
  dot = false,
  live = "off",
  status,
  tone = "neutral",
  ...props
}: StatusBadgeProps) {
  return (
    <span
      {...props}
      className={joinClasses("status", status && `status-${status}`, toneClasses[tone], className)}
      role={live === "off" ? undefined : "status"}
      aria-live={live === "off" ? undefined : live}
    >
      {dot && <span className="status-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
