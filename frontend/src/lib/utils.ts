import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Shown when a value was never recorded. Never use a dash as a placeholder. */
export const NOT_RECORDED = "Not recorded";
/** Shown when a value cannot be computed, for example a rate with no decisions yet. */
export const NOT_AVAILABLE = "Not available";

export function formatDate(value: string | null | undefined): string {
  if (!value) return NOT_RECORDED;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return NOT_RECORDED;
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined) return NOT_AVAILABLE;
  return `${Math.round(value * 100)}%`;
}

/** Human readable duration from a measured number of milliseconds. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return NOT_RECORDED;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return `${minutes} min ${rest} s`;
}

/** Recruiter facing labels. Internal deployment names stay unchanged. */
export function formatModelLabel(value: string | null | undefined): string {
  if (!value) return NOT_RECORDED;
  if (value === "gpt-5-mini") return "GPT 5 Mini";
  if (value === "text-embedding-3-small") return "text embedding 3 small";
  return value;
}

/** Turn a machine value such as `waiting_on_human` into `Waiting on human`. */
export function humanize(value: string | null | undefined, fallback = NOT_RECORDED): string {
  if (!value) return fallback;
  const text = value.replaceAll("_", " ").trim().toLowerCase();
  if (!text) return fallback;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatOutcome(value: string | null | undefined): string {
  if (!value) return "No analysis yet";
  return humanize(value);
}

export function scenarioLabel(value: string): string {
  if (value === "security_bypass") return "Security risk";
  if (value === "policy_conflict") return "Conflicting policy";
  if (value === "insufficient_evidence") return "Insufficient evidence";
  if (value === "well_grounded") return "Well grounded";
  return humanize(value);
}

/** Shorten a long technical identifier for display. The full value stays in a title. */
export function shortId(value: string | null | undefined, keep = 8): string {
  if (!value) return NOT_RECORDED;
  return value.length <= keep ? value : `${value.slice(0, keep)}`;
}

/** "1 chunk", "2 chunks". Keeps counts grammatical without guessing at irregular plurals. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
