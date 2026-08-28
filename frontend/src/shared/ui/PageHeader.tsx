import type { HTMLAttributes, ReactNode } from "react";

export type PageHeaderProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  actions?: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  headingLevel?: 1 | 2;
  loading?: boolean;
  title: ReactNode;
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function PageHeader({
  actions,
  className,
  description,
  eyebrow,
  headingLevel = 1,
  loading = false,
  title,
  ...props
}: PageHeaderProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <header
      {...props}
      className={joinClasses("page-heading", className)}
      aria-busy={loading || undefined}
    >
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <Heading>{title}</Heading>
        {description && <p className="muted">{description}</p>}
      </div>
      {actions && <div className="inline-actions">{actions}</div>}
    </header>
  );
}
