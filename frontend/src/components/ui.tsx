import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "../lib/utils";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-stone-900 text-amber-50 hover:bg-stone-800",
    secondary: "bg-white text-stone-900 border border-stone-300 hover:bg-stone-50",
    ghost: "bg-transparent text-stone-700 hover:bg-stone-200/60",
    danger: "bg-red-800 text-white hover:bg-red-700",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-stone-200 bg-white p-5 shadow-sm", className)} {...props} />;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const tones = {
    neutral: "bg-stone-100 text-stone-700",
    good: "bg-emerald-50 text-emerald-800",
    warn: "bg-amber-50 text-amber-900",
    bad: "bg-red-50 text-red-800",
  };
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-stone-700">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none ring-stone-400 focus:ring-2"
      {...props}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none ring-stone-400 focus:ring-2"
      {...props}
    />
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="text-center text-stone-600">
      <h2 className="text-base font-semibold text-stone-900">{title}</h2>
      <p className="mt-2 text-sm">{body}</p>
    </Card>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border-red-200 bg-red-50 text-red-900">
      <h2 className="font-semibold">Something went wrong</h2>
      <p className="mt-2 text-sm whitespace-pre-wrap">{message}</p>
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-stone-200", className)} />;
}
