/**
 * pi-team Extension – Entry Point
 *
 * Team orchestration built on pi-subagents.
 * pi-team provides the sprint workflow, shared memory, and commands.
 * pi-subagents handles agent spawning, chain execution, and progress.
 *
 * Commands:
 *   /team-start <file.md>  - Initialize team memory and show sprint chain
 *   /team-status            - Show team memory status
 *   /team-result            - Open team memory in editor
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ─── Constants ──────────────────────────────────────────────────────────────

const MEMORY_PATH = ".pi/team/team-memory.md";
const SPRINT_PATHS = [".pi/team/sprint.json", "sprint.json"];

// ─── Sprint Phase ───────────────────────────────────────────────────────────

type SprintPhase = {
  id: string;
  role: string;
  title: string;
  description: string;
  steps: string[];
};

type Sprint = {
  phases: SprintPhase[];
};

function loadSprint(cwd: string): Sprint | null {
  for (const relPath of SPRINT_PATHS) {
    const sprintFile = path.join(cwd, relPath);
    if (!fs.existsSync(sprintFile)) continue;
    try {
      return JSON.parse(fs.readFileSync(sprintFile, "utf-8")) as Sprint;
    } catch {
      continue;
    }
  }
  return null;
}

// ─── Task File Parser ──────────────────────────────────────────────────────

type TaskFrontmatter = {
  roles?: string;
  model?: string;
  cwd?: string;
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

// ─── Memory Operations ─────────────────────────────────────────────────────

function writeMemory(cwd: string, task: string, phases: SprintPhase[]): void {
  const memoryFile = path.join(cwd, MEMORY_PATH);
  const dir = path.dirname(memoryFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const lines: string[] = [];
  lines.push("# Team Memory");
  lines.push("");
  lines.push(`## Task: ${task}`);
  lines.push("");
  lines.push("## DoD");
  for (const phase of phases) {
    lines.push(`- [ ] ${phase.role}: ${phase.title}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  fs.writeFileSync(memoryFile, lines.join("\n"), "utf-8");
}

function readMemoryStatus(cwd: string): string {
  const memoryFile = path.join(cwd, MEMORY_PATH);
  if (!fs.existsSync(memoryFile)) return "No team memory found. Use /team-start first.";

  const content = fs.readFileSync(memoryFile, "utf-8");
  const lines = content.split("\n");

  // Extract DoD items and check status
  const dodItems: string[] = [];
  let inDoD = false;

  for (const line of lines) {
    if (line.trim() === "## DoD") {
      inDoD = true;
      continue;
    }
    if (inDoD && line.startsWith("- [")) {
      dodItems.push(line.trim());
    }
    if (inDoD && line.trim() === "---") break;
  }

  const done = dodItems.filter((l) => l.startsWith("- [x]")).length;
  const total = dodItems.length;

  return [
    `Team Progress: ${done}/${total} phases complete`,
    "",
    ...dodItems,
  ].join("\n");
}

// ─── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── /team-start <file.md> ─────────────────────────────────────────────

  pi.registerCommand("team-start", {
    description: "Initialize team memory from a task file and show the sprint chain command.",
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

      // Load sprint
      const sprint = loadSprint(ctx.cwd);
      if (!sprint || sprint.phases.length === 0) {
        ctx.ui.notify(
          `No sprint.json found. Looked in: ${SPRINT_PATHS.join(", ")}`,
          "error",
        );
        return;
      }

      // Parse task file
      let content: string;
      try {
        content = fs.readFileSync(resolved, "utf-8");
      } catch (err: any) {
        ctx.ui.notify(`Failed to read task file: ${err.message}`, "error");
        return;
      }

      const { frontmatter, body } = parseTaskFile(content);
      const task = body.trim();
      if (!task) {
        ctx.ui.notify("Task file is empty.", "error");
        return;
      }

      // Filter phases by roles if specified
      let phases = sprint.phases;
      if (frontmatter.roles) {
        const roleSet = new Set(frontmatter.roles.split(",").map((r) => r.trim()));
        phases = phases.filter((p) => roleSet.has(p.role));
        if (phases.length === 0) {
          ctx.ui.notify(`None of the requested roles match sprint phases. Available: ${sprint.phases.map(p => p.role).join(", ")}`, "error");
          return;
        }
      }

      // Write team memory
      writeMemory(ctx.cwd, task, phases);

      // Build chain steps for the LLM
      const targetCwd = frontmatter.cwd || undefined;
      const phaseList = phases.map((p) => `  ${p.role}: ${p.title}`).join("\n");
      const chainSteps = phases.map((p, i) => {
        const phaseTask = i === 0
          ? `Read .pi/team/team-memory.md. Complete: ${p.title}. Append output.`
          : `Read .pi/team/team-memory.md and complete ${p.title}. Append output.`;
        const cwdPart = targetCwd ? `, cwd: "${targetCwd}"` : "";
        return `{ agent: "${p.role}", task: "${phaseTask}"${cwdPart} }`;
      }).join(",\n");

      // Trigger LLM to run the chain via subagent tool
      const prompt = [
        `Run the team sprint chain for this task using the subagent tool: ${task}`,
        ``,
        `Chain steps (${phases.length} phases):`,
        phaseList,
        targetCwd ? `Working directory: ${targetCwd}` : "",
        ``,
        `Use subagent with chain mode: subagent({ chain: [`,
        chainSteps,
        `] })`,
        ``,
        `Each agent reads/writes .pi/team/team-memory.md. Run all steps sequentially.`,
      ].filter(Boolean).join("\n");

      ctx.ui.notify(
        `Team memory initialized: ${MEMORY_PATH}\n\nPhases (${phases.length}):\n${phaseList}\n\nSprint chain starting via subagent tool...`,
        "info",
      );

      // Send as user message to trigger the LLM turn
      pi.sendUserMessage(prompt);
    },
  });

  // ── /team-status ──────────────────────────────────────────────────────

  pi.registerCommand("team-status", {
    description: "Show team memory status and phase progress.",
    handler: async (_args, ctx) => {
      const status = readMemoryStatus(ctx.cwd);
      ctx.ui.notify(status, "info");
    },
  });

  // ── /team-result ──────────────────────────────────────────────────────

  pi.registerCommand("team-result", {
    description: "Open team memory in the editor for inspection.",
    handler: async (_args, ctx) => {
      const memoryFile = path.join(ctx.cwd, MEMORY_PATH);
      if (!fs.existsSync(memoryFile)) {
        ctx.ui.notify("No team memory found. Use /team-start first.", "error");
        return;
      }

      const content = fs.readFileSync(memoryFile, "utf-8");
      ctx.ui.setEditorText(content);
      ctx.ui.notify(`Team memory loaded into editor (${memoryFile}).`, "info");
    },
  });
}
