import { useId } from "react";
import type { HTMLAttributes, ReactNode } from "react";

export type CardProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  actions?: ReactNode;
  as?: "article" | "div" | "section";
  description?: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  title?: ReactNode;
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Card({
  actions,
  as: Component = "article",
  children,
  className,
  description,
  footer,
  loading = false,
  loadingLabel = "Loading…",
  title,
  ...props
}: CardProps) {
  const generatedId = useId();
  const titleId = title ? `card-${generatedId}-title` : undefined;
  const descriptionId = description ? `card-${generatedId}-description` : undefined;

  return (
    <Component
      {...props}
      className={joinClasses("panel", "card", className)}
      aria-busy={loading || undefined}
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
    >
      {(title || description || actions) && (
        <header className="settings-panel-heading">
          <div>
            {title && <h2 id={titleId}>{title}</h2>}
            {description && <p className="muted" id={descriptionId}>{description}</p>}
          </div>
          {actions && <div className="inline-actions">{actions}</div>}
        </header>
      )}
      {loading ? <div className="muted" role="status">{loadingLabel}</div> : children}
      {footer && <footer className="inline-actions">{footer}</footer>}
    </Component>
  );
}
