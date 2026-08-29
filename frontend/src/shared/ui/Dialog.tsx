import { useEffect, useId, useRef } from "react";
import type { HTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./cn";

export type DialogCloseReason = "backdrop" | "close-button" | "escape";

export type DialogProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  children: ReactNode;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  description?: ReactNode;
  disabled?: boolean;
  footer?: ReactNode;
  onClose: (reason: DialogCloseReason) => void;
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

export function Dialog({
  children,
  className,
  closeLabel = "Close dialog",
  closeOnBackdrop = true,
  closeOnEscape = true,
  description,
  disabled = false,
  footer,
  onClose,
  open,
  title,
  onKeyDown,
  ...props
}: DialogProps) {
  const generatedId = useId();
  const titleId = `dialog-${generatedId}-title`;
  const descriptionId = description ? `dialog-${generatedId}-description` : undefined;
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();
    return () => previousFocusRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const closeOnKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || disabled) return;
      event.preventDefault();
      onCloseRef.current("escape");
    };
    window.addEventListener("keydown", closeOnKeyDown);
    return () => window.removeEventListener("keydown", closeOnKeyDown);
  }, [closeOnEscape, disabled, open]);

  if (!open) return null;

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    if (!focusable.length) {
      event.preventDefault();
      dialogRef.current?.focus();
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
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnBackdrop && !disabled) onClose("backdrop");
      }}
    >
      <div
        {...props}
        ref={dialogRef}
        className={cn("dialog", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={disabled || undefined}
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <header className="dialog-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <Button variant="ghost" size="icon" aria-label={closeLabel} disabled={disabled} onClick={() => onClose("close-button")}>
            <span aria-hidden="true">×</span>
          </Button>
        </header>
        <div className="dialog-content">{children}</div>
        {footer && <footer className="dialog-footer">{footer}</footer>}
      </div>
    </div>
  );
}
