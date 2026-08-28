import { useEffect, useId, useRef } from "react";
import type { HTMLAttributes, KeyboardEvent, ReactNode } from "react";

export type DrawerCloseReason = "backdrop" | "close-button" | "escape";

export type DrawerProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  children: ReactNode;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  description?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  modal?: boolean;
  onClose: (reason: DrawerCloseReason) => void;
  open: boolean;
  title: ReactNode;
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Drawer({
  children,
  className,
  closeLabel = "Close drawer",
  closeOnBackdrop = true,
  closeOnEscape = true,
  description,
  disabled = false,
  loading = false,
  loadingLabel = "Loading…",
  modal = true,
  onClose,
  open,
  title,
  ...props
}: DrawerProps) {
  const generatedId = useId();
  const titleId = `drawer-${generatedId}-title`;
  const descriptionId = description ? `drawer-${generatedId}-description` : undefined;
  const drawerRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    drawerRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const closeOnKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !closeOnEscape || disabled) return;
      event.preventDefault();
      onCloseRef.current("escape");
    };

    window.addEventListener("keydown", closeOnKeyDown);
    return () => window.removeEventListener("keydown", closeOnKeyDown);
  }, [closeOnEscape, disabled, open]);

  if (!open) return null;

  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    props.onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (!modal || event.key !== "Tab") return;

    const focusable = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    if (!focusable.length) {
      event.preventDefault();
      drawerRef.current?.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnBackdrop && !disabled) onClose("backdrop");
      }}
    >
      <aside
        {...props}
        ref={drawerRef}
        className={joinClasses("narration-sidebar", "drawer", className)}
        role="dialog"
        aria-modal={modal || undefined}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={loading || undefined}
        aria-disabled={disabled || undefined}
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <header className="narration-sidebar-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button
            className="settings-sliders"
            type="button"
            aria-label={closeLabel}
            disabled={disabled}
            onClick={() => onClose("close-button")}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="drawer-content">
          {loading ? <div className="muted" role="status">{loadingLabel}</div> : children}
        </div>
      </aside>
    </div>
  );
}
