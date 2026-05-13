/**
 * Tests for format.ts — pure formatting utilities
 */

import { describe, expect, it } from "vitest";
import {
  aggregateUsage,
  formatTokens,
  formatUsageStats,
  resultIcon,
  statusIcon,
  truncate,
  truncateLines,
} from "../src/format";

describe("formatTokens", () => {
  it("returns string for numbers under 1000", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(42)).toBe("42");
    expect(formatTokens(999)).toBe("999");
  });

  it("formats thousands with one decimal", () => {
    expect(formatTokens(1000)).toBe("1.0k");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(9999)).toBe("10.0k");
  });

  it("formats ten-thousands as rounded", () => {
    expect(formatTokens(10000)).toBe("10k");
    expect(formatTokens(50000)).toBe("50k");
    expect(formatTokens(999999)).toBe("1000k");
  });

  it("formats millions", () => {
    expect(formatTokens(1000000)).toBe("1.0M");
    expect(formatTokens(2500000)).toBe("2.5M");
  });
});

describe("formatUsageStats", () => {
  it("shows turns", () => {
    const result = formatUsageStats({
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
      cost: 0, tokens: 0, turns: 3,
    });
    expect(result).toContain("3 turns");
  });

  it("shows input/output tokens", () => {
    const result = formatUsageStats({
      input: 2000, output: 500, cacheRead: 0, cacheWrite: 0,
      cost: 0, tokens: 0, turns: 1,
    });
    expect(result).toContain("↑2.0k");
    expect(result).toContain("↓500");
  });

  it("shows cache reads/writes", () => {
    const result = formatUsageStats({
      input: 0, output: 0, cacheRead: 3000, cacheWrite: 1000,
      cost: 0, tokens: 0, turns: 0,
    });
    expect(result).toContain("R3.0k");
    expect(result).toContain("W1.0k");
  });

  it("shows cost", () => {
    const result = formatUsageStats({
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
      cost: 0.0234, tokens: 0, turns: 0,
    });
    expect(result).toContain("$0.0234");
  });

  it("shows context tokens", () => {
    const result = formatUsageStats({
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
      cost: 0, tokens: 15000, turns: 0,
    });
    expect(result).toContain("ctx:15.0k");
  });

  it("shows model if provided", () => {
    const result = formatUsageStats({
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
      cost: 0, tokens: 0, turns: 0,
    }, "deepseek-v4-pro");
    expect(result).toContain("deepseek-v4-pro");
  });

  it("returns empty string for zero usage", () => {
    const result = formatUsageStats({
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
      cost: 0, tokens: 0, turns: 0,
    });
    expect(result).toBe("");
  });
});

describe("aggregateUsage", () => {
  it("sums all fields across multiple stats", () => {
    const result = aggregateUsage([
      { input: 100, output: 50, cacheRead: 20, cacheWrite: 10, cost: 0.01, tokens: 5000, turns: 2 },
      { input: 200, output: 100, cacheRead: 30, cacheWrite: 20, cost: 0.02, tokens: 8000, turns: 3 },
    ]);
    expect(result.input).toBe(300);
    expect(result.output).toBe(150);
    expect(result.cacheRead).toBe(30);
    expect(result.cacheWrite).toBe(30);
    expect(result.cost).toBe(0.03);
    expect(result.tokens).toBe(13000);
    expect(result.turns).toBe(5);
  });

  it("returns zeros for empty array", () => {
    const result = aggregateUsage([]);
    expect(result.input).toBe(0);
    expect(result.turns).toBe(0);
  });
});

describe("statusIcon", () => {
  it("returns success for exit code 0", () => {
    expect(statusIcon({ exitCode: 0 })).toBe("success");
  });

  it("returns warning for max_turns stop reason", () => {
    expect(statusIcon({ exitCode: 1, stopReason: "max_turns" })).toBe("warning");
  });

  it("returns error for non-zero exit", () => {
    expect(statusIcon({ exitCode: 1 })).toBe("error");
    expect(statusIcon({ exitCode: 2 })).toBe("error");
  });
});

describe("resultIcon", () => {
  it("returns text labels", () => {
    expect(resultIcon("success")).toBe("OK");
    expect(resultIcon("error")).toBe("FAIL");
    expect(resultIcon("warning")).toBe("WARN");
  });
});

describe("truncate", () => {
  it("returns full text when short enough", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates with ellipsis", () => {
    expect(truncate("hello world this is long", 14)).toBe("hello worl...");
  });
});

describe("truncateLines", () => {
  it("returns all lines when under limit", () => {
    expect(truncateLines("line1\nline2", 3)).toBe("line1\nline2");
  });

  it("truncates to max lines", () => {
    const result = truncateLines("a\nb\nc\nd\ne", 3);
    expect(result).toBe("a\nb\nc\n...");
  });
});
