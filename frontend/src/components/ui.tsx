import { useId, useState } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "../lib/utils";
import { describeError } from "../lib/errors";
import type { Tone } from "../lib/presentation";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "sm";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime";

/** Shared class names so links can look like buttons without nesting a button in an anchor. */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-lime text-lime-ink hover:bg-lime-deep",
    secondary: "border border-line-strong bg-surface-2 text-ink hover:border-lime/50 hover:bg-surface-3",
    ghost: "bg-transparent text-ink-soft hover:bg-surface-3 hover:text-ink",
    danger: "bg-red-700 text-white hover:bg-red-600",
  };
  const sizes: Record<ButtonSize, string> = {
    md: "min-h-10 px-3.5 py-2 text-sm",
    sm: "min-h-8 px-2.5 py-1 text-xs",
  };
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    FOCUS_RING,
    variants[variant],
    sizes[size],
  );
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={cn(buttonClasses(variant, size), className)} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface/90 p-5 shadow-[0_22px_60px_-32px_rgba(0,0,0,0.9)]",
        className,
      )}
      {...props}
    />
  );
}

/** Compact filter or status chip. Active uses lime because that marks human selection. */
export function Chip({
  active,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-8 items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
        FOCUS_RING,
        active
          ? "bg-lime text-lime-ink"
          : "border border-line-strong bg-surface-2 text-ink-soft hover:border-violet/50 hover:text-ink",
        className,
      )}
      aria-pressed={active}
      {...props}
    >
      {children}
    </button>
  );
}

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-ink-soft ring-line",
  good: "bg-lime/15 text-lime ring-lime/30",
  warn: "bg-amber-400/15 text-amber-200 ring-amber-300/30",
  bad: "bg-red-500/15 text-red-200 ring-red-400/30",
  info: "bg-violet/15 text-violet ring-violet/40",
};

/** Badges always carry their meaning in text. Colour is only reinforcement. */
export function Badge({
  children,
  tone = "neutral",
  title,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const CONTROL =
  "w-full rounded-lg border border-line-strong bg-canvas/80 px-3 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus-visible:border-lime focus-visible:ring-2 focus-visible:ring-lime/30 disabled:bg-surface-3 disabled:text-faint aria-[invalid=true]:border-red-400";

export type ControlProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean };

/**
 * Labelled form field. Pass a function child to receive the generated id and described by wiring,
 * or pass plain children to keep the label wrapping the control.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode | ((props: ControlProps) => ReactNode);
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");
  const labelClass = "font-medium text-ink";
  if (typeof children === "function") {
    return (
      <div className={cn("block space-y-1 text-sm", className)}>
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        {children({
          id,
          "aria-describedby": describedBy || undefined,
          "aria-invalid": error ? true : undefined,
        })}
        {hint ? (
          <p id={hintId} className="text-xs leading-5 text-muted">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} role="alert" className="text-xs font-medium text-red-300">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <label className={cn("block space-y-1 text-sm", className)}>
      <span className={labelClass}>{label}</span>
      {children}
      {hint ? <span className="block text-xs leading-5 text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, "pr-8", className)} {...props} />;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  titleTestId,
  display = false,
  className,
  /** Lets a long display title use the row beside its actions. Other pages keep the narrower column. */
  roomy = false,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  titleTestId?: string;
  display?: boolean;
  className?: string;
  roomy?: boolean;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-4",
        roomy && "lg:flex-nowrap lg:items-start lg:gap-x-6",
        className,
      )}
    >
      <div className={cn("min-w-0", roomy ? "lg:flex-1" : "max-w-3xl")}>
        {eyebrow ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-violet">{eyebrow}</p>
        ) : null}
        <h1
          className={cn(
            "mt-2 font-semibold text-ink",
            display ? "display-title text-4xl sm:text-5xl" : "text-3xl tracking-tight",
            roomy && "lg:text-[2.9rem] lg:leading-[1.08]",
          )}
          data-testid={titleTestId}
        >
          {title}
        </h1>
        {description ? <div className="mt-3 max-w-2xl text-sm leading-7 text-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="border-dashed border-line-strong bg-surface-2/60 text-center text-muted shadow-none">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </Card>
  );
}

/**
 * Honest failure state. A failed request is shown as a failure with an optional retry,
 * never as zero results.
 */
export function ErrorState({
  title = "This data could not be loaded",
  error,
  message,
  onRetry,
  retrying = false,
  compact = false,
}: {
  title?: string;
  error?: unknown;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}) {
  const described = error !== undefined ? describeError(error) : null;
  const summary = message ?? described?.summary ?? "Something went wrong.";
  const detail = described?.detail ?? null;
  const canRetry = Boolean(onRetry) && (described ? described.retryable : true);
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border border-red-400/40 bg-red-950/50 text-red-100",
        compact ? "p-3" : "p-5",
      )}
    >
      <h2 className={cn("font-semibold", compact ? "text-sm" : "text-base")}>{title}</h2>
      <p className="mt-1 text-sm leading-6">{summary}</p>
      {detail ? <p className="mt-1 text-xs text-red-200/80">Technical detail: {detail}</p> : null}
      {canRetry ? (
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>
            {retrying ? "Retrying" : "Try again"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Inline notice for partial or stale data. */
export function DegradedNotice({
  children,
  onRetry,
  retrying,
}: {
  children: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
    >
      <p>{children}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>
          {retrying ? "Retrying" : "Try again"}
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-surface-3", className)} />;
}

export function LoadingState({ label = "Loading", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={index === 0 ? "h-20" : "h-12"} />
      ))}
    </div>
  );
}

/** A technical identifier that wraps, truncates safely and can be copied. */
export function TechnicalId({ label, value }: { label: string; value: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 1800);
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="font-medium text-muted">{label}</span>
      <code className="min-w-0 break-all rounded bg-surface-2 px-1.5 py-0.5 text-ink">{value}</code>
      <button
        type="button"
        onClick={copy}
        className={cn("rounded px-1.5 py-0.5 text-muted underline hover:text-lime", FOCUS_RING)}
        aria-label={`Copy ${label}`}
      >
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
      </button>
    </div>
  );
}

/** Small uppercase label used above values and sections. */
export function Eyebrow({ children, tone = "violet" }: { children: ReactNode; tone?: "violet" | "lime" }) {
  return (
    <p
      className={cn(
        "text-[11px] font-medium uppercase tracking-[0.18em]",
        tone === "lime" ? "text-lime" : "text-violet",
      )}
    >
      {children}
    </p>
  );
}
