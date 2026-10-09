import {
  NOT_AVAILABLE,
  NOT_RECORDED,
  formatDate,
  formatDuration,
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

describe("pluralize", () => {
  it("keeps counts grammatical", () => {
    expect(pluralize(0, "chunk")).toBe("0 chunks");
    expect(pluralize(1, "chunk")).toBe("1 chunk");
    expect(pluralize(2, "chunk")).toBe("2 chunks");
    expect(pluralize(2, "entry", "entries")).toBe("2 entries");
  });
});
