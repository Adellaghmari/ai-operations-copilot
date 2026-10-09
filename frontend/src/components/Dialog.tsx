import { useEffect, useId, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/utils";
import { Button } from "./ui";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true",
  );
}

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** `modal` is centred. `drawer` slides from the right and fills the height. */
  variant?: "modal" | "drawer";
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
  /** Element to focus when the dialog opens. Defaults to the dialog panel itself. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeLabel?: string;
  closeTestId?: string;
  /** Extra header actions rendered next to the close button, for example Print. */
  headerActions?: ReactNode;
};

/**
 * Accessible modal dialog and drawer.
 *
 * - role dialog, aria-modal, labelled by its title
 * - initial focus moves inside, Tab and Shift Tab are trapped
 * - Escape and a backdrop click close it
 * - focus returns to the element that opened it
 * - the page behind is inert and does not scroll
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  variant = "modal",
  children,
  footer,
  testId,
  initialFocusRef,
  closeLabel = "Close",
  closeTestId,
  headerActions,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const appRoot = document.getElementById("root");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    appRoot?.setAttribute("inert", "");

    const target = initialFocusRef?.current ?? panelRef.current;
    target?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = focusableWithin(panelRef.current);
      if (items.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!panelRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      appRoot?.removeAttribute("inert");
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  return createPortal(
    <div
      className={cn(
        "dialog-backdrop fixed inset-0 z-50 flex bg-black/70 motion-safe:animate-[fade-in_150ms_ease-out]",
        variant === "drawer" ? "justify-end" : "items-center justify-center p-3 sm:p-6",
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
      data-testid={testId ? `${testId}-backdrop` : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        data-testid={testId}
        className={cn(
          "dialog-panel flex flex-col bg-surface shadow-xl outline-none",
          variant === "drawer"
            ? "h-full w-full max-w-xl motion-safe:animate-[slide-in_180ms_ease-out]"
            : "max-h-full w-full max-w-3xl rounded-xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            {headerActions}
            <Button
              variant="secondary"
              size="sm"
              data-testid={closeTestId}
              onClick={() => onCloseRef.current()}
              aria-label={`${closeLabel} ${title}`}
            >
              {closeLabel}
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
