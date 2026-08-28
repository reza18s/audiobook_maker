import type { HTMLAttributes, ReactNode } from "react";

export type EmptyStateProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  action?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  title: ReactNode;
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function EmptyState({
  action,
  className,
  description,
  icon = "◌",
  loading = false,
  loadingLabel = "Loading…",
  title,
  ...props
}: EmptyStateProps) {
  return (
    <div
      {...props}
      className={joinClasses("settings-empty", className)}
      aria-busy={loading || undefined}
    >
      <span className="settings-empty-icon" aria-hidden="true">{icon}</span>
      <div>
        <strong>{title}</strong>
        {description && <p>{description}</p>}
        {loading ? <p role="status">{loadingLabel}</p> : action}
      </div>
    </div>
  );
}
