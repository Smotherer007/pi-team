/**
 * pi-team – TUI Renderer
 *
 * Custom rendering for the `team` tool: matches subagent quality with
 * collapsed/expanded views, tool call tracking, Markdown output,
 * per-agent usage stats, and review phase indication.
 *
 * Uses pi-tui components (Text, Container, Markdown, Spacer).
 */

import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import type { AgentProgress, AgentResult, TeamDetails } from "./types";
import {
  aggregateUsage,
  formatProgress,
  formatUsageStats,
  resultIcon,
  statusIcon,
  truncate,
  truncateLines,
} from "./format";

const COLLAPSED_ITEM_COUNT = 10;

// ─── Render Tool Call ───────────────────────────────────────────────────────

export function renderTeamCall(args: Record<string, unknown>, theme: any): Text {
  const task = (args.task as string) || "...";
  const roles = args.roles as string[] | undefined;
  const preview = truncate(task, 60);

  let text = theme.fg("toolTitle", theme.bold("team "));
  text += theme.fg("dim", preview);

  if (roles && roles.length > 0) {
    text += `\n  ${theme.fg("muted", `roles: ${roles.slice(0, 3).join(", ")}${roles.length > 3 ? ` +${roles.length - 3}` : ""}`)}`;
  }

  return new Text(text, 0, 0);
}

// ─── Render Tool Result ─────────────────────────────────────────────────────

export function renderTeamResult(
  result: { content: Array<{ type: string; text?: string }>; details?: TeamDetails },
  options: { expanded: boolean },
  theme: any,
): Container | Text {
  const details = result.details;

  if (!details || details.results.length === 0) {
    const text = result.content[0];
    return new Text(text?.type === "text" ? text.text : "(no output)", 0, 0);
  }

  const { results } = details;
  const mdTheme = getMarkdownThemeCompat();

  if (options.expanded) {
    return renderExpanded(details, theme, mdTheme);
  }

  return renderCollapsed(details, theme);
}

// ─── Display Items ──────────────────────────────────────────────────────────

type DisplayItem =
  | { type: "text"; text: string }
  | { type: "toolCall"; name: string; args: Record<string, any> };

function getDisplayItems(messages: readonly any[]): DisplayItem[] {
  const items: DisplayItem[] = [];
  for (const msg of messages) {
    if (msg.role === "assistant") {
      for (const part of msg.content) {
        if (part.type === "text") items.push({ type: "text", text: part.text });
        else if (part.type === "toolCall")
          items.push({ type: "toolCall", name: part.name, args: part.arguments });
      }
    }
  }
  return items;
}

function renderDisplayItems(
  items: DisplayItem[],
  limit: number | undefined,
  theme: any,
): string {
  const toShow = limit ? items.slice(-limit) : items;
  const skipped = limit && items.length > limit ? items.length - limit : 0;
  let text = "";
  if (skipped > 0) text += theme.fg("muted", `... ${skipped} earlier items\n`);
  for (const item of toShow) {
    if (item.type === "text") {
      text += `${theme.fg("toolOutput", truncateLines(item.text, 3))}\n`;
    } else {
      text += `${theme.fg("muted", "> ")}${theme.fg("accent", item.name)}${theme.fg("dim", " " + JSON.stringify(item.args).slice(0, 40))}\n`;
    }
  }
  return text.trimEnd();
}

// ─── Collapsed View ─────────────────────────────────────────────────────────

function renderCollapsed(details: TeamDetails, theme: any): Text {
  const { results } = details;
  const reviewResults = results.filter((r) => r.stopReason === "review");
  const mainResults = results.filter((r) => r.stopReason !== "review");
  const allDone = results.every((r) => r.exitCode === 0);

  const overallStatus = allDone
    ? "success"
    : results.every((r) => r.exitCode !== 0)
      ? "error"
      : "warning";

  const icon = resultIcon(overallStatus);
  const doneCount = results.filter((r) => r.exitCode === 0).length;

  let text = `${theme.fg(overallStatus, icon)} `;
  text += theme.fg("toolTitle", theme.bold("team "));
  text += theme.fg("accent", `${doneCount}/${results.length} agents`);

  // ── Main phase ────────────────────────────────────────────────────────

  if (mainResults.length > 0) {
    text += `\n${theme.fg("muted", "Phase 1: Execution")}`;

    for (const r of mainResults) {
      const status = statusIcon(r);
      const iconChar = resultIcon(status);
      const displayItems = getDisplayItems(r.messages);

      text += `\n\n${theme.fg(status, iconChar)} ${theme.fg("accent", theme.bold(r.role))}`;

      if (r.stopReason && r.stopReason !== "end_turn") {
        text += ` ${theme.fg("muted", `[${r.stopReason}]`)}`;
      }

      // Show live progress (tool + path) like pi-subagents
      if (r.progress && r.progress.currentTool) {
        const progStr = formatProgress(r.progress);
        if (progStr) text += ` ${theme.fg("dim", `[${progStr}]`)}`;
      }

      if (displayItems.length === 0) {
        text += `\n${theme.fg("muted", r.exitCode === 0 ? "(no output)" : r.errorMessage || "(error)")}`;
      } else {
        text += `\n${renderDisplayItems(displayItems, COLLAPSED_ITEM_COUNT, theme)}`;
        if (displayItems.length > COLLAPSED_ITEM_COUNT) {
          text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
        }
      }

      const usageStr = formatUsageStats(r.usage);
      if (usageStr) {
        text += `\n${theme.fg("dim", usageStr)}`;
      }
    }
  }

  // ── Review phase ───────────────────────────────────────────────────────

  if (reviewResults.length > 0) {
    text += `\n\n${theme.fg("muted", "Phase 2: Review")}`;

    for (const r of reviewResults) {
      const status = statusIcon(r);
      const iconChar = resultIcon(status);
      const displayItems = getDisplayItems(r.messages);

      text += `\n\n${theme.fg(status, iconChar)} ${theme.fg("accent", theme.bold(r.role))} ${theme.fg("muted", "(review)")}`;

      if (displayItems.length === 0) {
        text += `\n${theme.fg("muted", "(no findings)")}`;
      } else {
        text += `\n${renderDisplayItems(displayItems, 5, theme)}`;
      }

      const usageStr = formatUsageStats(r.usage);
      if (usageStr) {
        text += `\n${theme.fg("dim", usageStr)}`;
      }
    }
  }

  // ── Totals ─────────────────────────────────────────────────────────────

  const totalUsage = aggregateUsage(results.map((r) => r.usage));
  const totalStr = formatUsageStats(totalUsage);
  if (totalStr) {
    text += `\n\n${theme.fg("dim", `Total: ${totalStr}`)}`;
  }

  if (details.sharedMemoryPath) {
    text += `\n${theme.fg("muted", `Memory: ${details.sharedMemoryPath}`)}`;
  }

  if (mainResults.length > COLLAPSED_ITEM_COUNT || reviewResults.length > 0) {
    text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
  }

  return new Text(text, 0, 0);
}

// ─── Expanded View ──────────────────────────────────────────────────────────

function renderExpanded(details: TeamDetails, theme: any, mdTheme: any): Container {
  const { results, plan } = details;
  const reviewResults = results.filter((r) => r.stopReason === "review");
  const mainResults = results.filter((r) => r.stopReason !== "review");

  const container = new Container();

  // ── Header ─────────────────────────────────────────────────────────────

  const allDone = results.every((r) => r.exitCode === 0);
  const overallStatus = allDone
    ? "success"
    : results.every((r) => r.exitCode !== 0)
      ? "error"
      : "warning";

  const icon = resultIcon(overallStatus);
  const doneCount = results.filter((r) => r.exitCode === 0).length;

  container.addChild(
    new Text(
      `${theme.fg(overallStatus, icon)} ${theme.fg("toolTitle", theme.bold("team "))}${theme.fg("accent", `${doneCount}/${results.length} agents`)}`,
      0,
      0,
    ),
  );

  // ── Execution Plan ─────────────────────────────────────────────────────

  if (plan.length > 0) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("muted", "Plan"), 0, 0));
    for (const task of plan) {
      container.addChild(
        new Text(
          `  ${theme.fg("accent", task.assignedRole)} ${theme.fg("dim", `(${task.status})`)}`,
          0,
          0,
        ),
      );
    }
  }

  // ── Main phase ─────────────────────────────────────────────────────────

  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("muted", "Phase 1: Execution"), 0, 0));

  for (const r of mainResults) {
    const status = statusIcon(r);
    const iconChar = resultIcon(status);
    const displayItems = getDisplayItems(r.messages);

    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        `${theme.fg(status, iconChar)} ${theme.fg("accent", theme.bold(r.role))}`,
        0,
        0,
      ),
    );

    // Task description
    container.addChild(
      new Text(theme.fg("muted", "Task: ") + theme.fg("dim", truncate(r.task, 120)), 0, 0),
    );

    // Stop reason
    if (r.stopReason && r.stopReason !== "end_turn") {
      container.addChild(
        new Text(theme.fg("muted", `Stop: ${r.stopReason}`), 0, 0),
      );
    }

    // Error
    if (r.errorMessage && r.exitCode !== 0) {
      container.addChild(
        new Text(theme.fg("error", `Error: ${r.errorMessage}`), 0, 0),
      );
    }

    // Tool calls
    for (const item of displayItems) {
      if (item.type === "toolCall") {
        container.addChild(
          new Text(
            theme.fg("muted", "> ") +
              theme.fg("accent", item.name) +
              theme.fg("dim", " " + JSON.stringify(item.args).slice(0, 60)),
            0,
            0,
          ),
        );
      }
    }

    // Final output as Markdown
    if (r.finalOutput) {
      container.addChild(new Spacer(1));
      if (mdTheme) {
        container.addChild(new Markdown(r.finalOutput.trim(), 0, 0, mdTheme));
      } else {
        container.addChild(new Text(r.finalOutput.trim(), 0, 0));
      }
    }

    // Usage
    const usageStr = formatUsageStats(r.usage);
    if (usageStr) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
    }
  }

  // ── Review phase ───────────────────────────────────────────────────────

  if (reviewResults.length > 0) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("muted", "Phase 2: Review"), 0, 0));

    for (const r of reviewResults) {
      const status = statusIcon(r);
      const iconChar = resultIcon(status);
      const displayItems = getDisplayItems(r.messages);

      container.addChild(new Spacer(1));
      container.addChild(
        new Text(
          `${theme.fg(status, iconChar)} ${theme.fg("accent", theme.bold(r.role))} ${theme.fg("muted", "(review)")}`,
          0,
          0,
        ),
      );

      // Review output as Markdown
      if (r.finalOutput) {
        container.addChild(new Spacer(1));
        if (mdTheme) {
          container.addChild(new Markdown(r.finalOutput.trim(), 0, 0, mdTheme));
        } else {
          container.addChild(new Text(r.finalOutput.trim(), 0, 0));
        }
      }

      const usageStr = formatUsageStats(r.usage);
      if (usageStr) {
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
      }
    }
  }

  // ── Totals ─────────────────────────────────────────────────────────────

  const totalUsage = aggregateUsage(results.map((r) => r.usage));
  const totalStr = formatUsageStats(totalUsage);
  if (totalStr) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("dim", `Total: ${totalStr}`), 0, 0));
  }

  return container;
}

// ─── Markdown Theme ─────────────────────────────────────────────────────────

function getMarkdownThemeCompat(): any {
  try {
    const pi = require("@earendil-works/pi-coding-agent");
    if (typeof pi.getMarkdownTheme === "function") {
      return pi.getMarkdownTheme();
    }
  } catch {
    // Not available
  }
  return undefined;
}
