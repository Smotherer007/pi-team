/**
 * pi-team – Formatting Utilities
 *
 * Pure formatting functions. No side effects, no I/O.
 */

import type { AgentProgress, UsageStats } from "./types";

// ─── Token Formatting ───────────────────────────────────────────────────────

export function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  return `${(count / 1000000).toFixed(1)}M`;
}

// ─── Usage Stats ────────────────────────────────────────────────────────────

export function formatUsageStats(usage: UsageStats, model?: string): string {
  const parts: string[] = [];

  if (usage.turns > 0) parts.push(`${usage.turns} turn${usage.turns > 1 ? "s" : ""}`);
  if (usage.input > 0) parts.push(`↑${formatTokens(usage.input)}`);
  if (usage.output > 0) parts.push(`↓${formatTokens(usage.output)}`);
  if (usage.cacheRead > 0) parts.push(`R${formatTokens(usage.cacheRead)}`);
  if (usage.cacheWrite > 0) parts.push(`W${formatTokens(usage.cacheWrite)}`);
  if (usage.cost > 0) parts.push(`$${usage.cost.toFixed(4)}`);
  if (usage.tokens > 0) parts.push(`ctx:${formatTokens(usage.tokens)}`);
  if (model) parts.push(model);

  return parts.join(" ");
}

// ─── Aggregate Usage ────────────────────────────────────────────────────────

export function aggregateUsage(usages: readonly UsageStats[]): UsageStats {
  const total: UsageStats = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    tokens: 0,
    turns: 0,
  };

  for (const u of usages) {
    total.input += u.input;
    total.output += u.output;
    total.cacheRead += u.cacheRead;
    total.cacheWrite += u.cacheWrite;
    total.cost += u.cost;
    total.tokens += u.tokens;
    total.turns += u.turns;
  }

  return total;
}

// ─── Status Icon ────────────────────────────────────────────────────────────

export function statusIcon(result: {
  exitCode: number;
  stopReason?: string;
}): "success" | "error" | "warning" {
  if (result.exitCode === 0) return "success";
  if (result.stopReason === "max_turns") return "warning";
  return "error";
}

// ─── Display Icons ──────────────────────────────────────────────────────────

export function resultIcon(status: "success" | "error" | "warning"): string {
  switch (status) {
    case "success":
      return "OK";
    case "error":
      return "FAIL";
    case "warning":
      return "WARN";
  }
}

// ─── Text Truncation ────────────────────────────────────────────────────────

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export function truncateLines(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join("\n") + "\n...";
}

// ─── Progress Formatting ───────────────────────────────────────────────────

/** Format live agent progress for /team-status display (pi-subagents style). */
export function formatProgress(progress: AgentProgress): string {
  const parts: string[] = [];

  // Current tool
  if (progress.currentTool) {
    let toolStr = progress.currentTool;
    if (progress.currentPath) {
      toolStr += ` ${truncate(progress.currentPath, 30)}`;
    }
    parts.push(toolStr);
  }

  // Turn count
  if (progress.turnCount > 0) {
    parts.push(`t${progress.turnCount}`);
  }

  // Tokens
  if (progress.tokens > 0) {
    parts.push(formatTokens(progress.tokens));
  }

  // Last activity
  if (progress.lastActivityAt) {
    const idleSec = Math.floor((Date.now() - progress.lastActivityAt) / 1000);
    if (idleSec > 5 && !progress.currentTool) {
      parts.push(`idle:${idleSec}s`);
    }
  }

  return parts.join(" ");
}
