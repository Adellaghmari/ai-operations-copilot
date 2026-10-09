import { afterEach, vi } from "vitest";
import {
  NOT_AVAILABLE,
  NOT_RECORDED,
  formatDate,
  formatDuration,
  formatExactTime,
  formatModelLabel,
  formatOutcome,
  formatRelative,
  humanize,
  percent,
  pluralize,
  scenarioLabel,
} from "./utils";

const DASH = /[\u2013\u2014]|\s-\s/;

describe("copy helpers never return a dash placeholder", () => {
  const placeholders = [
    formatDate(null),
    formatDate(undefined),
    formatRelative(null),
    percent(null),
    percent(undefined),
    formatDuration(null),
    formatModelLabel(null),
    humanize(null),
    humanize(""),
    formatOutcome(null),
  ];

  it.each(placeholders)("%s has no dash", (value) => {
    expect(value).not.toMatch(DASH);
    expect(value.trim()).not.toBe("");
  });

  it("uses plain language for missing values", () => {
    expect(formatDate(null)).toBe(NOT_RECORDED);
    expect(percent(null)).toBe(NOT_AVAILABLE);
    expect(formatDuration(undefined)).toBe(NOT_RECORDED);
    expect(formatOutcome(null)).toBe("No analysis yet");
  });
});

describe("formatting", () => {
  it("humanizes machine values", () => {
    expect(humanize("waiting_on_human")).toBe("Waiting on human");
    expect(formatOutcome("BLOCKED_BY_EVIDENCE")).toBe("Blocked by evidence");
  });

  it("formats durations from measured milliseconds", () => {
    expect(formatDuration(420)).toBe("420 ms");
    expect(formatDuration(1840)).toBe("1.8 s");
    expect(formatDuration(125000)).toBe("2 min 5 s");
  });

  it("keeps a zero rate distinct from a missing rate", () => {
    expect(percent(0)).toBe("0%");
    expect(percent(null)).toBe(NOT_AVAILABLE);
  });

  it("labels scenarios and models for readers", () => {
    expect(scenarioLabel("security_bypass")).toBe("Security risk");
    expect(formatModelLabel("gpt-5-mini")).toBe("GPT 5 Mini");
  });
});

describe("timestamps stay 24 hour and do not invent stored instants", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels today and yesterday in 24 hour time without AM or PM", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 9, 16, 48, 0));
    expect(formatDate(new Date(2026, 9, 9, 16, 48, 0).toISOString())).toBe("Today · 16:48");
    expect(formatDate(new Date(2026, 9, 8, 21, 12, 0).toISOString())).toBe("Yesterday · 21:12");
    expect(formatDate(new Date(2026, 9, 7, 19, 32, 0).toISOString())).toBe("2 days ago · 19:32");
    expect(formatDate(new Date(2026, 9, 9, 16, 48, 0).toISOString())).not.toMatch(/\b(?:AM|PM)\b/i);
  });

  it("relabels the same stored instant when the local day changes", () => {
    vi.useFakeTimers();
    const stored = new Date(2026, 9, 9, 17, 37, 0);
    vi.setSystemTime(new Date(2026, 9, 9, 18, 0, 0));
    expect(formatDate(stored.toISOString())).toBe("Today · 17:37");
    vi.setSystemTime(new Date(2026, 9, 10, 9, 18, 0));
    expect(formatDate(stored.toISOString())).toBe("Yesterday · 17:37");
    expect(formatExactTime(stored.toISOString())).toBe("9 Oct 2026 · 17:37");
  });

  it("keeps an older stored instant as an absolute 24 hour clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 9, 16, 48, 0));
    const stored = new Date(2026, 9, 1, 8, 0, 0);
    expect(formatDate(stored.toISOString())).toBe("1 Oct 2026 · 08:00");
    expect(formatExactTime(stored.toISOString())).toBe("1 Oct 2026 · 08:00");
    expect(formatExactTime(stored.toISOString())).not.toMatch(/\b(?:AM|PM)\b/i);
  });
});

describe("pluralize", () => {
  it("keeps counts grammatical", () => {
    expect(pluralize(0, "chunk")).toBe("0 chunks");
    expect(pluralize(1, "chunk")).toBe("1 chunk");
    expect(pluralize(2, "chunk")).toBe("2 chunks");
    expect(pluralize(2, "entry", "entries")).toBe("2 entries");
  });
});
