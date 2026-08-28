import { cloneElement, createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, MouseEvent, ReactElement, ReactNode } from "react";

type MenuContextValue = {
  close: () => void;
};

const MenuContext = createContext<MenuContextValue | null>(null);

export type MenuProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  loading?: boolean;
  loadingLabel?: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  trigger: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>;
};

export type MenuItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  closeOnSelect?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  onSelect?: () => void;
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Menu({
  children,
  className,
  disabled = false,
  label,
  loading = false,
  loadingLabel = "Loading…",
  onOpenChange,
  open,
  trigger,
  ...props
}: MenuProps) {
  const generatedId = useId();
  const menuId = `menu-${generatedId}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const controlled = open !== undefined;

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  const setOpen = useCallback((next: boolean) => {
    if (!controlled) setInternalOpen(next);
    onOpenChangeRef.current?.(next);
  }, [controlled]);

  const focusTrigger = useCallback(() => wrapRef.current?.querySelector<HTMLElement>("button")?.focus(), []);
  const close = useCallback(() => {
    setOpen(false);
    focusTrigger();
  }, [focusTrigger, setOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: globalThis.MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    menuRef.current?.querySelector<HTMLElement>("[role='menuitem']:not([disabled])")?.focus();

    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [isOpen, setOpen]);

  const triggerElement = cloneElement(trigger, {
    "aria-controls": isOpen ? menuId : undefined,
    "aria-expanded": isOpen,
    "aria-haspopup": "menu",
    disabled: disabled || loading || trigger.props.disabled,
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      trigger.props.onClick?.(event);
      if (!event.defaultPrevented) setOpen(!isOpen);
    },
    type: trigger.props.type ?? "button",
  });

  const moveFocus = (direction: "first" | "last" | "next" | "previous") => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])") ?? []);
    if (!items.length) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = direction === "first"
      ? 0
      : direction === "last"
        ? items.length - 1
        : direction === "next"
          ? (currentIndex + 1) % items.length
          : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex].focus();
  };

  return (
    <div ref={wrapRef} className="action-menu-wrap">
      {triggerElement}
      {isOpen && (
        <MenuContext.Provider value={{ close }}>
          <div
            {...props}
            ref={menuRef}
            id={menuId}
            className={joinClasses("action-menu", className)}
            role="menu"
            aria-label={label}
            aria-busy={loading || undefined}
            onKeyDown={(event) => {
              props.onKeyDown?.(event);
              if (event.defaultPrevented) return;
              if (event.key === "Escape") {
                event.preventDefault();
                close();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                moveFocus("next");
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveFocus("previous");
              } else if (event.key === "Home") {
                event.preventDefault();
                moveFocus("first");
              } else if (event.key === "End") {
                event.preventDefault();
                moveFocus("last");
              } else if (event.key === "Tab") {
                setOpen(false);
              }
            }}
          >
            {loading ? <div className="muted" role="status">{loadingLabel}</div> : children}
          </div>
        </MenuContext.Provider>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  className,
  closeOnSelect = true,
  disabled,
  loading = false,
  loadingLabel = "Loading…",
  onClick,
  onSelect,
  type = "button",
  ...props
}: MenuItemProps) {
  const menu = useContext(MenuContext);

  return (
    <button
      {...props}
      className={className}
      type={type}
      role="menuitem"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-disabled={disabled || loading || undefined}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        onSelect?.();
        if (closeOnSelect) menu?.close();
      }}
    >
      {loading && <span className="button-spinner" aria-hidden="true" />}
      {loading ? loadingLabel : children}
    </button>
  );
}
