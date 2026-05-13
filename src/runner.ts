/**
 * pi-team – Agent Runner
 *
 * Spawns a `pi` subprocess for a single agent, streams JSON-line events,
 * enforces maxTurns, and returns a structured AgentResult.
 *
 * This is the only module with process-level side effects.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Message } from "@earendil-works/pi-ai";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { buildTaskInstructions } from "./instructions";
import type { AgentProgress, AgentResult, ProfileConfig, UsageStats } from "./types";
import { MAX_TURNS_HARD_LIMIT, TOTAL_TIMEOUT_BUFFER_SECONDS, TURN_TIMEOUT_SECONDS } from "./types";

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run a single agent as a pi subprocess.
 *
 * @param profile – The agent's profile configuration
 * @param task – Task description for this agent
 * @param sharedMemoryContent – Current shared memory content (injected into the prompt)
 * @param cwd – Working directory
 * @param signal – AbortSignal for cancellation
 * @returns Structured result
 */
export async function runAgent(
  profile: ProfileConfig,
  task: string,
  sharedMemoryContent: string,
  cwd: string,
  signal?: AbortSignal,
  onProgress?: (progress: AgentProgress) => void,
): Promise<AgentResult> {
  const maxTurns = profile.maxTurns === 0
    ? Infinity
    : Math.min(profile.maxTurns, MAX_TURNS_HARD_LIMIT);
  const totalTimeoutMs =
    maxTurns === Infinity
      ? 30 * 60 * 1000 // 30 minute hard cap for unlimited
      : (maxTurns * TURN_TIMEOUT_SECONDS + TOTAL_TIMEOUT_BUFFER_SECONDS) * 1000;

  // Build the full system prompt
  const fullSystemPrompt = buildAgentPrompt(profile, task, sharedMemoryContent);

  // Write prompt to temp file
  let tmpDir: string | null = null;
  let tmpPromptPath: string | null = null;

  try {
    const tmp = await writeTempPrompt(profile.role, fullSystemPrompt);
    tmpDir = tmp.dir;
    tmpPromptPath = tmp.filePath;

    // Build pi arguments
    const args = buildPiArgs(profile, tmpPromptPath, task);

    // Spawn and collect
    return await spawnAndCollect(profile, task, args, cwd, maxTurns, totalTimeoutMs, signal, onProgress);
  } finally {
    // Cleanup temp files
    if (tmpPromptPath) {
      try { fs.unlinkSync(tmpPromptPath); } catch { /* ignore */ }
    }
    if (tmpDir) {
      try { fs.rmdirSync(tmpDir); } catch { /* ignore */ }
    }
  }
}

// ─── Prompt Building ────────────────────────────────────────────────────────

function buildAgentPrompt(
  profile: ProfileConfig,
  task: string,
  sharedMemoryContent: string,
): string {
  const lines: string[] = [];

  lines.push(profile.systemPrompt);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Task");
  lines.push(task);
  lines.push("");

  if (sharedMemoryContent.trim()) {
    lines.push("## Shared Team Memory");
    lines.push("This is the team's shared memory. Read it carefully.");
    lines.push("Previous team members have already added information here.");
    lines.push("");
    lines.push(sharedMemoryContent);
    lines.push("");
  }

  lines.push(
    buildTaskInstructions(
      {
        displayName: profile.displayName,
        role: profile.role,
        reportsTo: profile.reportsTo,
      },
      "execute",
    ),
  );

  return lines.join("\n");
}

// ─── Temp File Management ───────────────────────────────────────────────────

async function writeTempPrompt(
  role: string,
  content: string,
): Promise<{ dir: string; filePath: string }> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-team-"));
  const safeName = role.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(tmpDir, `prompt-${safeName}.md`);

  await withFileMutationQueue(filePath, async () => {
    await fs.promises.writeFile(filePath, content, { encoding: "utf-8", mode: 0o600 });
  });

  return { dir: tmpDir, filePath };
}

// ─── Pi Invocation ──────────────────────────────────────────────────────────

function buildPiArgs(
  profile: ProfileConfig,
  promptPath: string,
  task: string,
): string[] {
  // pi --mode json -p --no-session --model <model> --append-system-prompt <file> --max-turns <n>
  // Note: --max-turns is a soft request; we enforce it ourselves as well
  const args: string[] = [
    "--mode", "json",
    "-p",
    "--no-session",
    "--model", profile.model,
  ];

  if (profile.tools.length > 0) {
    args.push("--tools", profile.tools.join(","));
  }

  args.push("--append-system-prompt", promptPath);
  // Pass the task as the user prompt (last positional argument)
  args.push(task);

  return args;
}

// ─── Determine Pi Binary ────────────────────────────────────────────────────
// Simplified: always use "pi" from PATH (consistent with pi-subagents approach).
// On Linux/macOS pi is always available via PATH when the extension is loaded.

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  return { command: "pi", args };
}

// ─── Spawn & Collect ────────────────────────────────────────────────────────

function spawnAndCollect(
  profile: ProfileConfig,
  task: string,
  piArgs: string[],
  cwd: string,
  maxTurns: number,
  totalTimeoutMs: number,
  signal?: AbortSignal,
  onProgress?: (progress: AgentProgress) => void,
): Promise<AgentResult> {
  return new Promise((resolve) => {
    const invocation = getPiInvocation(piArgs);
    const proc = spawn(invocation.command, invocation.args, {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const messages: Message[] = [];
    let stderr = "";
    let turns = 0;
    let finalOutput = "";
    let stopReason: string | undefined;
    let errorMessage: string | undefined;
    let wasAborted = false;
    let wasTimedOut = false;
    let turnTimedOut = false;

    const usage: UsageStats = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      tokens: 0,
      turns: 0,
    };

    // ── Progress Tracking ───────────────────────────────────────────────

    const startedAt = Date.now();
    let currentTool: string | undefined;
    let currentToolArgs: string | undefined;
    let currentToolStartedAt: number | undefined;
    let currentPath: string | undefined;
    let lastActivityAt: number | undefined;
    const recentTools: AgentProgress["recentTools"] = [];

    function emitProgress(): void {
      if (!onProgress) return;
      onProgress({
        agent: profile.role,
        status: "running",
        currentTool,
        currentToolArgs,
        currentToolStartedAt,
        currentPath,
        recentTools,
        turnCount: turns,
        tokens: usage.input + usage.output,
        lastActivityAt,
        startedAt,
      });
    }

    // ── Timeout ──────────────────────────────────────────────────────────

    const totalTimer = setTimeout(() => {
      wasTimedOut = true;
      killProcess(proc);
    }, totalTimeoutMs);

    // Track per-turn timeout
    let turnTimer: NodeJS.Timeout | null = null;

    function resetTurnTimer(): void {
      if (turnTimer) clearTimeout(turnTimer);
      turnTimer = setTimeout(() => {
        turnTimedOut = true;
        killProcess(proc);
      }, TURN_TIMEOUT_SECONDS * 1000);
    }

    function clearTurnTimer(): void {
      if (turnTimer) {
        clearTimeout(turnTimer);
        turnTimer = null;
      }
    }

    // ── Signal Handling ──────────────────────────────────────────────────

    if (signal) {
      const onAbort = () => {
        wasAborted = true;
        killProcess(proc);
      };

      if (signal.aborted) {
        // Already aborted before we started
        clearTimeout(totalTimer);
        resolve(buildAbortedResult(profile, task));
        return;
      }

      signal.addEventListener("abort", onAbort, { once: true });
    }

    // ── Stdout Parsing ───────────────────────────────────────────────────

    let buffer = "";

    function processLine(line: string): void {
      if (!line.trim()) return;

      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        // Non-JSON output: could be a progress line or error
        return;
      }

      // ── Tool execution tracking ────────────────────────────────────────

      if (event.type === "tool_execution_start") {
        currentTool = event.toolName;
        currentToolStartedAt = Date.now();
        lastActivityAt = currentToolStartedAt;

        // Build short args string and extract path
        if (event.args) {
          currentToolArgs = JSON.stringify(event.args).slice(0, 120);
          currentPath = event.args.path || event.args.file || event.args.filePath || currentPath;
        }
        emitProgress();
        return;
      }

      if (event.type === "tool_execution_end") {
        if (currentTool) {
          recentTools.push({
            tool: currentTool,
            args: currentToolArgs || "",
            endMs: Date.now(),
          });
          // Keep only last 10 recent tools
          if (recentTools.length > 10) recentTools.shift();
        }
        currentTool = undefined;
        currentToolArgs = undefined;
        currentToolStartedAt = undefined;
        emitProgress();
      }

      // ── Message tracking ───────────────────────────────────────────────
      if (event.type === "message_end" && event.message) {
        const msg = event.message as Message;
        messages.push(msg);

        if (msg.role === "assistant") {
          turns++;
          usage.turns = turns;

          // Accumulate usage
          const msgUsage = msg.usage;
          if (msgUsage) {
            usage.input += msgUsage.input || 0;
            usage.output += msgUsage.output || 0;
            usage.cacheRead = Math.max(usage.cacheRead, msgUsage.cacheRead || 0);
            usage.cacheWrite += msgUsage.cacheWrite || 0;
            usage.cost += msgUsage.cost?.total || 0;
            usage.tokens = msgUsage.totalTokens || 0;
          }

          // Capture final text output (or thinking content for models that use it)
          let hasTextOutput = false;
          for (const part of msg.content) {
            if (part.type === "text") {
              finalOutput = part.text;
              hasTextOutput = true;
            }
          }
          // Fallback: if no text output, try thinking content
          if (!hasTextOutput) {
            for (const part of msg.content) {
              if (part.type === "thinking" && part.thinking) {
                finalOutput = part.thinking;
                break;
              }
            }
          }

          if (msg.stopReason) stopReason = msg.stopReason;
          if (msg.errorMessage) errorMessage = msg.errorMessage;

          // Reset turn timer after each assistant message
          resetTurnTimer();

          // Enforce maxTurns (0 = unlimited)
          if (maxTurns !== Infinity && turns >= maxTurns) {
            stopReason = "max_turns";
            killProcess(proc);
          }
        }
      }

      // Track tool result messages (for full context)
      if (event.type === "tool_result_end" && event.message) {
        messages.push(event.message as Message);
      }
    }

    proc.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        processLine(line);
      }
    });

    // ── Stderr ───────────────────────────────────────────────────────────

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    // ── Process End ──────────────────────────────────────────────────────

    proc.on("close", (code) => {
      clearTimeout(totalTimer);
      clearTurnTimer();

      // Process any remaining buffer
      if (buffer.trim()) {
        processLine(buffer);
      }

      const exitCode = code ?? 1;

      const progress: AgentProgress = {
        agent: profile.role,
        status: wasAborted ? "failed" : exitCode === 0 ? "completed" : "failed",
        currentTool,
        currentToolArgs,
        currentToolStartedAt,
        currentPath,
        recentTools,
        turnCount: turns,
        tokens: usage.input + usage.output,
        lastActivityAt,
        startedAt,
        error: wasTimedOut ? "timeout" : turnTimedOut ? "turn_timeout" : undefined,
      };

      if (wasAborted) {
        resolve({
          role: profile.role,
          task,
          exitCode: 1,
          finalOutput: finalOutput || "(aborted)",
          messages,
          stderr,
          usage,
          stopReason: "aborted",
          errorMessage: "Agent was aborted",
          progress,
        });
        return;
      }

      if (wasTimedOut) {
        resolve({
          role: profile.role,
          task,
          exitCode: 1,
          finalOutput: finalOutput || "(timeout)",
          messages,
          stderr,
          usage,
          stopReason: "timeout",
          errorMessage: `Total timeout of ${totalTimeoutMs}ms exceeded`,
          progress,
        });
        return;
      }

      if (turnTimedOut) {
        resolve({
          role: profile.role,
          task,
          exitCode: 1,
          finalOutput: finalOutput || "(turn timeout)",
          messages,
          stderr,
          usage,
          stopReason: "timeout",
          errorMessage: `Turn timeout of ${TURN_TIMEOUT_SECONDS}s exceeded`,
          progress,
        });
        return;
      }

      resolve({
        role: profile.role,
        task,
        exitCode,
        finalOutput,
        messages,
        stderr,
        usage,
        stopReason,
        errorMessage,
        progress,
      });
    });

    // ── Process Error ────────────────────────────────────────────────────

    proc.on("error", (err) => {
      clearTimeout(totalTimer);
      clearTurnTimer();

      resolve({
        role: profile.role,
        task,
        exitCode: 1,
        finalOutput: "",
        messages,
        stderr: stderr || err.message,
        usage,
        stopReason: "error",
        errorMessage: err.message,
        progress: {
          agent: profile.role,
          status: "failed",
          turnCount: turns,
          tokens: usage.input + usage.output,
          recentTools: [],
          startedAt,
          error: err.message,
        },
      });
    });

    // Start the first turn timer
    resetTurnTimer();
  });
}

// ─── Process Kill Helper ────────────────────────────────────────────────────

function killProcess(proc: import("node:child_process").ChildProcess): void {
  proc.kill("SIGTERM");
  // Escalate to SIGKILL after 5 seconds
  setTimeout(() => {
    if (!proc.killed) {
      proc.kill("SIGKILL");
    }
  }, 5000);
}

// ─── Result Helpers ─────────────────────────────────────────────────────────

function buildAbortedResult(profile: ProfileConfig, task: string): AgentResult {
  return {
    role: profile.role,
    task,
    exitCode: 1,
    finalOutput: "",
    messages: [],
    stderr: "",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      tokens: 0,
      turns: 0,
    },
    stopReason: "aborted",
    errorMessage: "Agent was aborted before execution",
    progress: {
      agent: profile.role,
      status: "failed",
      turnCount: 0,
      tokens: 0,
      recentTools: [],
      startedAt: Date.now(),
      error: "aborted",
    },
  };
}
