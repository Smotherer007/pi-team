/**
 * pi-team Extension – Entry Point
 *
 * Registers the `team` tool with pi. Teams run in background (non-blocking).
 *
 * Commands:
 *   /team-start <file.md>  - Start team from task file
 *   /team-status            - List running/completed teams
 *   /team-result <id>       - Show full result in editor
 *
 * Results are injected as follow-up messages when complete.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { discoverProfiles } from "./discovery";
import { aggregateUsage, formatProgress, formatUsageStats, resultIcon, statusIcon, truncate } from "./format";
import { executeTeam } from "./orchestrator";
import { buildExecutionPlan, describePlan } from "./planner";
import { renderTeamCall, renderTeamResult } from "./renderer";
import type { AgentProgress, AgentResult, AgentScope, TeamDetails } from "./types";

// ─── Background Team State ─────────────────────────────────────────────────

type TeamRun = {
  id: number;
  task: string;
  status: "running" | "done" | "failed";
  startedAt: string;
  results?: readonly AgentResult[];
  memoryPath?: string | null;
  error?: string;
  progress: Map<string, AgentProgress>;
};

let nextTeamId = 1;
const teamRuns = new Map<number, TeamRun>();

// ─── Task File Parser ──────────────────────────────────────────────────────

type TaskFrontmatter = {
  agentScope?: string;
  roles?: string;
  model?: string;
  teamReview?: string;
};

function parseTaskFile(content: string): { frontmatter: TaskFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const raw = match[1];
  const body = match[2];
  const frontmatter: TaskFrontmatter = {};

  for (const line of raw.split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) frontmatter[kv[1] as keyof TaskFrontmatter] = kv[2].trim();
  }

  return { frontmatter, body };
}

// ─── Shared Start Function ─────────────────────────────────────────────────

async function startTeam(
  ctx: any,
  pi: ExtensionAPI,
  task: string,
  agentScope: AgentScope,
  roles?: string[],
  model?: string,
  teamReview?: boolean,
): Promise<void> {
  // Discover profiles
  const discovery = discoverProfiles(ctx.cwd, agentScope);

  if (discovery.profiles.length === 0) {
    ctx.ui.notify(
      `No team profiles found. Create them in ~/.pi/agent/team/profiles/ or .pi/team/profiles/`,
      "error",
    );
    return;
  }

  // Validate roles
  if (roles && roles.length > 0) {
    const profileRoles = new Set(discovery.profiles.map((p) => p.role));
    const unknown = roles.filter((r) => !profileRoles.has(r));
    if (unknown.length > 0) {
      const available = discovery.profiles.map((p) => `${p.role} (${p.displayName})`).join(", ");
      ctx.ui.notify(`Unknown role(s): ${unknown.join(", ")}.\nAvailable: ${available}`, "error");
      return;
    }
  }

  // Plan
  const planDescription = describePlan(
    buildPlanForDisplay(discovery.profiles, task, roles),
    discovery.profiles,
  );

  // Create run
  const runId = nextTeamId++;
  const run: TeamRun = { id: runId, task, status: "running", startedAt: new Date().toISOString(), progress: new Map() };
  teamRuns.set(runId, run);

  ctx.ui.notify(
    `Team #${runId} started - ${planDescription}\n/team-status to check progress.`,
    "info",
  );

  // Background execution
  const cwd = ctx.cwd;

  executeTeam(discovery.profiles, task, cwd, roles, model, undefined, teamReview, (role, progress) => {
      run.progress.set(role, progress);
    })
    .then(({ results, memoryPath }) => {
      run.status = results.every((r) => r.exitCode === 0) ? "done" : "failed";
      run.results = results;
      run.memoryPath = memoryPath;

      const doneCount = results.filter((r) => r.exitCode === 0).length;
      pi.sendMessage(
        {
          customType: "team-result",
          content: `Team #${runId} done: ${doneCount}/${results.length} agents. /team-result ${runId} for details.`,
          display: true,
          details: { results, sharedMemoryPath: memoryPath, plan: [] } satisfies TeamDetails,
        },
        { deliverAs: "followUp", triggerTurn: true },
      );
    })
    .catch((err) => {
      run.status = "failed";
      run.error = String(err);
      pi.sendMessage(
        {
          customType: "team-result",
          content: `Team #${runId} failed: ${err}`,
          display: true,
        },
        { deliverAs: "followUp", triggerTurn: true },
      );
    });
}

// ─── Tool Parameter Schema ──────────────────────────────────────────────────

const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
  description: 'Which profile directories to use. Default: "user". Use "both" to include project profiles.',
  default: "user",
});

const TeamParams = Type.Object({
  task: Type.String({
    description:
      "The task for the team. Be specific. E.g. 'Implement OAuth login' or 'Analyze the auth module'",
  }),
  roles: Type.Optional(
    Type.Array(Type.String(), {
      description: "Which roles to involve. Omit to run all in reportsTo order. E.g. ['po', 'dev']",
    }),
  ),
  model: Type.Optional(
    Type.String({
      description: "Override the model for ALL agents. E.g. 'deepseek-v4-flash'",
    }),
  ),
  agentScope: Type.Optional(AgentScopeSchema),
  confirmProjectProfiles: Type.Optional(
    Type.Boolean({
      description: "Prompt before running project profiles. Default: true.",
      default: true,
    }),
  ),
  teamReview: Type.Optional(
    Type.Boolean({
      description: "Run a review phase after execution. Default: false.",
      default: false,
    }),
  ),
});

// ─── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── /team-start <file.md> ─────────────────────────────────────────────

  pi.registerCommand("team-start", {
    description: "Start a team from a task file. Usage: /team-start path/to/task.md",
    handler: async (args, ctx) => {
      const filePath = args.trim();
      if (!filePath) {
        ctx.ui.notify("Usage: /team-start path/to/task.md", "error");
        return;
      }

      const resolved = path.isAbsolute(filePath)
        ? filePath
        : path.join(ctx.cwd, filePath);

      if (!fs.existsSync(resolved)) {
        ctx.ui.notify(`File not found: ${resolved}`, "error");
        return;
      }

      try {
        const content = fs.readFileSync(resolved, "utf-8");
        const { frontmatter, body } = parseTaskFile(content);
        const task = body.trim();

        if (!task) {
          ctx.ui.notify("Task file is empty.", "error");
          return;
        }

        const agentScope: AgentScope =
          (frontmatter.agentScope as AgentScope) ?? "user";
        const roles = frontmatter.roles
          ? frontmatter.roles.split(",").map((r) => r.trim()).filter(Boolean)
          : undefined;
        const model = frontmatter.model || undefined;
        const teamReview = frontmatter.teamReview === "true";

        await startTeam(ctx, pi, task, agentScope, roles, model, teamReview);
      } catch (err: any) {
        ctx.ui.notify(`Failed to read task file: ${err.message}`, "error");
      }
    },
  });

  // ── /team-status ──────────────────────────────────────────────────────

  pi.registerCommand("team-status", {
    description: "Show running and completed team runs",
    handler: async (_args, ctx) => {
      if (teamRuns.size === 0) {
        ctx.ui.notify("No team runs yet. Use /team-start or the team tool.", "info");
        return;
      }

      const lines: string[] = [];
      const sorted = [...teamRuns.values()].sort((a, b) => b.id - a.id);

      for (const run of sorted) {
        const icon = run.status === "running" ? "..." : run.status === "done" ? "OK" : "FAIL";
        const taskPreview = truncate(run.task, 60);
        const doneCount = run.results?.filter((r) => r.exitCode === 0).length ?? 0;
        const totalCount = run.results?.length ?? "?";

        lines.push(
          `${icon} #${run.id} [${run.status}] ${doneCount}/${totalCount} agents - ${taskPreview}`,
        );

        if (run.results) {
          const ri: Record<string, string> = { success: "OK", error: "FAIL", warning: "WARN" };
          for (const r of run.results) {
            const preview = truncate(r.finalOutput || r.errorMessage || "(no output)", 50);
            lines.push(`    ${ri[statusIcon(r)]} ${r.role}: ${preview}`);
          }
          const total = aggregateUsage(run.results.map((r) => r.usage));
          if (total.turns > 0) lines.push(`    ∑ ${formatUsageStats(total)}`);
        } else if (run.status === "running" && run.progress.size > 0) {
          // Show live progress for running agents
          for (const [role, prog] of run.progress) {
            const progStr = formatProgress(prog);
            lines.push(`    ... ${role}: ${progStr}`);
          }
        }

        if (run.memoryPath) lines.push(`    Memory: ${run.memoryPath}`);
      }

      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  // ── /team-result <id> ─────────────────────────────────────────────────

  pi.registerCommand("team-result", {
    description: "Show full result of a team run. Usage: /team-result <id>",
    handler: async (args, ctx) => {
      const id = parseInt(args.trim(), 10);
      if (!id || !teamRuns.has(id)) {
        ctx.ui.notify(`Team #${args.trim()} not found. Use /team-status.`, "error");
        return;
      }

      const run = teamRuns.get(id)!;
      if (run.status === "running") {
        ctx.ui.notify(`Team #${id} is still running...`, "warning");
        return;
      }

      ctx.ui.setEditorText(buildTeamResultText(run));
      ctx.ui.notify(`Team #${id} loaded into editor.`, "info");
    },
  });

  // ── Tool Registration ─────────────────────────────────────────────────

  pi.registerTool({
    name: "team",
    label: "Team",
    description: [
      "Orchestrate a team of AI agents with role-based profiles.",
      "Teams run in BACKGROUND (non-blocking). Check /team-status for progress.",
      "Use /team-start <file.md> to start from a task file.",
      'Profiles: ~/.pi/agent/team/profiles/*.md (user) or .pi/team/profiles/*.md (project).',
      "Results are injected as follow-up messages when complete.",
    ].join(" "),
    promptSnippet: "Delegate work to a team of role-based agents (runs in background)",
    promptGuidelines: [
      "Use the team tool when the task benefits from multiple perspectives.",
      "The team runs in background. Use /team-status to check progress.",
      "Use /team-start path/to/task.md for task files with frontmatter.",
      "Set teamReview: true to have root profiles review all outputs.",
      "The team writes to .pi/team/team-memory.md – read it for agent outputs.",
    ],
    parameters: TeamParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const task = params.task;
      const agentScope: AgentScope = params.agentScope ?? "user";
      const roles: string[] | undefined = params.roles;
      const model: string | undefined = params.model;
      const teamReview = params.teamReview ?? false;

      // Profile discovery
      const discovery = discoverProfiles(ctx.cwd, agentScope);

      if (discovery.profiles.length === 0) {
        const scopeInfo =
          agentScope === "user"
            ? "~/.pi/agent/team/profiles/"
            : agentScope === "both"
              ? "~/.pi/agent/team/profiles/ or .pi/team/profiles/"
              : ".pi/team/profiles/";
        return {
          content: [
            {
              type: "text",
              text: `No profiles found in ${scopeInfo}\n\nCreate a profile:\n\`\`\`markdown\n---\nrole: po\ndisplayName: Product Owner\nreportsTo: null\nmodel: deepseek-v4-pro\ntools: read, grep, find, ls\nmaxTurns: 0\n---\n\nSystem prompt...\n\`\`\``,
            },
          ],
          details: { results: [], sharedMemoryPath: null, plan: [] } satisfies TeamDetails,
        };
      }

      // Validate roles
      if (roles && roles.length > 0) {
        const profileRoles = new Set(discovery.profiles.map((p) => p.role));
        const unknown = roles.filter((r) => !profileRoles.has(r));
        if (unknown.length > 0) {
          const available = discovery.profiles.map((p) => `${p.role} (${p.displayName})`).join(", ");
          return {
            content: [{ type: "text", text: `Unknown roles: ${unknown.join(", ")}.\nAvailable: ${available}` }],
            details: { results: [], sharedMemoryPath: null, plan: [] } satisfies TeamDetails,
          };
        }
      }

      // Confirm project profiles
      const confirmProject = params.confirmProjectProfiles ?? true;
      if ((agentScope === "project" || agentScope === "both") && confirmProject && ctx.hasUI) {
        const projectProfiles = discovery.profiles.filter((p) => p.source === "project");
        if (projectProfiles.length > 0) {
          const names = projectProfiles.map((p) => `${p.displayName} (${p.role})`).join(", ");
          const ok = await ctx.ui.confirm("Run project-local team profiles?", `Profiles: ${names}`);
          if (!ok) {
            return {
              content: [{ type: "text", text: "Canceled: project profiles not approved." }],
              details: { results: [], sharedMemoryPath: null, plan: [] } satisfies TeamDetails,
            };
          }
        }
      }

      // Plan
      const planDescription = describePlan(
        buildPlanForDisplay(discovery.profiles, task, roles),
        discovery.profiles,
      );

      // Create run
      const runId = nextTeamId++;
      const run: TeamRun = { id: runId, task, status: "running", startedAt: new Date().toISOString(), progress: new Map() };
      teamRuns.set(runId, run);

      // Start background execution
      const cwd = ctx.cwd;
      executeTeam(discovery.profiles, task, cwd, roles, model, undefined, teamReview, (role, progress) => {
          run.progress.set(role, progress);
        })
        .then(({ results, memoryPath }) => {
          run.status = results.every((r) => r.exitCode === 0) ? "done" : "failed";
          run.results = results;
          run.memoryPath = memoryPath;

          const doneCount = results.filter((r) => r.exitCode === 0).length;
          pi.sendMessage(
            {
              customType: "team-result",
              content: `Team #${runId} done: ${doneCount}/${results.length} agents. /team-result ${runId}`,
              display: true,
              details: { results, sharedMemoryPath: memoryPath, plan: [] } satisfies TeamDetails,
            },
            { deliverAs: "followUp", triggerTurn: true },
          );
        })
        .catch((err) => {
          run.status = "failed";
          run.error = String(err);
          pi.sendMessage(
            { customType: "team-result", content: `Team #${runId} failed: ${err}`, display: true },
            { deliverAs: "followUp", triggerTurn: true },
          );
        });

      return {
        content: [
          {
            type: "text",
            text: `Team #${runId} started in background.\nPlan: ${planDescription}\nCheck /team-status for progress.`,
          },
        ],
        details: { results: [], sharedMemoryPath: null, plan: [] } satisfies TeamDetails,
      };
    },

    renderCall: renderTeamCall,
    renderResult: renderTeamResult,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildPlanForDisplay(
  profiles: readonly import("./types").ProfileConfig[],
  task: string,
  roles?: readonly string[],
): import("./types").Task[] {
  try {
    return buildExecutionPlan(profiles, task, roles);
  } catch {
    return [];
  }
}

function buildTeamResultText(run: TeamRun): string {
  const lines: string[] = [];
  lines.push(`# Team #${run.id} - ${run.status.toUpperCase()}`);
  lines.push(`Task: ${run.task}`);
  lines.push(`Started: ${run.startedAt}`);
  lines.push("");

  if (run.error) {
    lines.push(`Error: ${run.error}`);
    return lines.join("\n");
  }

  if (run.results) {
    for (const r of run.results) {
      const icon = r.exitCode === 0 ? "OK" : "FAIL";
      lines.push(`## ${icon} ${r.role}`);
      lines.push("");
      if (r.finalOutput) lines.push(r.finalOutput);
      if (r.errorMessage) lines.push(`\nError: ${r.errorMessage}`);
      if (r.usage.turns > 0) lines.push(`\nUsage: ${formatUsageStats(r.usage)}`);
      lines.push("");
    }

    const total = aggregateUsage(run.results.map((r) => r.usage));
    if (total.turns > 0) lines.push(`---\nTotal: ${formatUsageStats(total)}`);
  }

  return lines.join("\n");
}
