import type { HTMLAttributes, ReactNode } from "react";

export type ProgressBarProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  disabled?: boolean;
  label?: ReactNode;
  loading?: boolean;
  max?: number;
  showValue?: boolean;
  value?: number;
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ProgressBar({
  className,
  disabled = false,
  label,
  loading = false,
  max = 100,
  showValue = false,
  value = 0,
  ...props
}: ProgressBarProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Math.min(safeMax, Math.max(0, Number.isFinite(value) ? value : 0));
  const percent = (safeValue / safeMax) * 100;
  const valueText = `${Math.round(percent)}%`;
  const ariaLabel = props["aria-label"] ?? (typeof label === "string" ? label : "Progress");

  return (
    <div className="progress-wrapper">
      {(label || showValue) && (
        <div className="progress-heading">
          <span>{label}</span>
          {showValue && <span>{loading ? "Loading…" : valueText}</span>}
        </div>
      )}
      <div
        {...props}
        className={joinClasses("progress", loading && "progress-loading", className)}
        role="progressbar"
        aria-busy={loading || undefined}
        aria-disabled={disabled || undefined}
        aria-label={ariaLabel}
        aria-valuemax={loading ? undefined : safeMax}
        aria-valuemin={loading ? undefined : 0}
        aria-valuenow={loading ? undefined : safeValue}
        aria-valuetext={loading ? "Loading" : valueText}
      >
        <span style={{ width: `${loading ? 35 : percent}%` }} />
      </div>
    </div>
  );
}
