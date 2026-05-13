/**
 * pi-team – Orchestrator
 *
 * Coordinates the team execution: builds the plan, initializes shared memory,
 * runs agents sequentially, updates memory after each agent, checks DoD,
 * and optionally runs a review phase where root agents review all outputs.
 *
 * This is the main pipeline that orchestrates the team workflow.
 */

import { buildTaskInstructions, getSprint } from "./instructions";
import type { AgentProgress, AgentResult, ProfileConfig, Task, TeamDetails } from "./types";
import { buildDoDFromPlan, buildExecutionPlan } from "./planner";
import {
  appendMemorySection,
  buildDoDItems,
  initializeMemory,
  markDoDComplete,
  readMemoryRaw,
} from "./memory";
import { runAgent } from "./runner";

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Execute a team task.
 *
 * Pipeline:
 *   1. Discover profiles (caller responsibility)
 *   2. Build execution plan
 *   3. Initialize shared memory with DoD
 *   4. For each task in plan:
 *      a. Run agent with current memory
 *      b. Append agent output to memory
 *      c. Mark DoD item complete
 *      d. If failed and critical, abort pipeline
 *   5. If teamReview: re-run root profiles to review all outputs
 *   6. Return full results
 */
export async function executeTeam(
  profiles: readonly ProfileConfig[],
  taskDescription: string,
  cwd: string,
  requestedRoles?: readonly string[],
  modelOverride?: string,
  signal?: AbortSignal,
  teamReview?: boolean,
  onProgress?: (role: string, progress: AgentProgress) => void,
): Promise<{
  results: readonly AgentResult[];
  memoryPath: string | null;
  plan: readonly Task[];
}> {
  // 1. Build plan – use sprint.json phases if available, else reportsTo
  const sprint = getSprint();
  const hasCustomSprint = sprint.phases.length > 2; // More than default execute+review

  let plan: Task[];
  if (hasCustomSprint) {
    plan = buildSprintPlan(sprint, profiles, taskDescription, requestedRoles);
  } else {
    plan = buildExecutionPlan(profiles, taskDescription, requestedRoles);
  }

  if (plan.length === 0) {
    return { results: [], memoryPath: null, plan: [] };
  }

  // 2. Apply model override
  const effectiveProfiles = modelOverride
    ? profiles.map((p) => ({ ...p, model: modelOverride }))
    : profiles;

  const profileMap = new Map(effectiveProfiles.map((p) => [p.role, p]));

  // 3. Build DoD and initialize memory
  const dodRoles = buildDoDFromPlan(plan, effectiveProfiles);
  const dodItems = buildDoDItems(dodRoles);
  const memoryPath = initializeMemory(cwd, taskDescription, dodItems);

  // 4. Execute each task in order (main phase)
  const mainResults: AgentResult[] = [];

  for (const task of plan) {
    if (signal?.aborted) {
      mainResults.push(buildSkippedResult(task, "aborted"));
      break;
    }

    const profile = profileMap.get(task.assignedRole);
    if (!profile) {
      mainResults.push(buildSkippedResult(task, `Profile not found: ${task.assignedRole}`));
      continue;
    }

    const memoryContent = readMemoryRaw(cwd);
    const phaseId = hasCustomSprint
      ? sprint.phases.find((p) => p.role === task.assignedRole)?.id ?? "execute"
      : "execute";
    const agentTask = buildAgentTask(task.description, profile, phaseId);

    const result = await runAgent(
      profile,
      agentTask,
      memoryContent,
      cwd,
      signal,
      (progress) => onProgress?.(task.assignedRole, progress),
    );

    if (result.finalOutput) {
      appendMemorySection(cwd, profile.role, profile.displayName, result.finalOutput);
    }

    markDoDComplete(cwd, task.assignedRole);
    mainResults.push(result);

    if (result.exitCode !== 0 && result.stopReason !== "max_turns") {
      break;
    }
  }

  // 5. Review phase: re-run root profiles to review all outputs
  let reviewResults: AgentResult[] = [];

  if (teamReview && !signal?.aborted) {
    const rootProfiles = effectiveProfiles.filter((p) => p.reportsTo === null);

    for (const rootProfile of rootProfiles) {
      if (signal?.aborted) break;

      // Build a review-specific task
      const reviewTask = buildAgentTask(taskDescription, rootProfile, "review");
      const memoryContent = readMemoryRaw(cwd);

      const result = await runAgent(
        rootProfile,
        reviewTask,
        memoryContent,
        cwd,
        signal,
        (progress) => onProgress?.(rootProfile.role, progress),
      );

      // Mark as review result
      const reviewResult: AgentResult = {
        ...result,
        stopReason: result.stopReason ?? "review",
      };

      if (result.finalOutput) {
        appendMemorySection(
          cwd,
          `${rootProfile.role}-review`,
          `${rootProfile.displayName} (Review)`,
          result.finalOutput,
        );
      }

      reviewResults.push(reviewResult);
    }
  }

  const allResults = [...mainResults, ...reviewResults];
  return { results: allResults, memoryPath, plan };
}

// ─── Task Builders ──────────────────────────────────────────────────────────

function buildSprintPlan(
  sprint: ReturnType<typeof getSprint>,
  profiles: readonly ProfileConfig[],
  taskDescription: string,
  requestedRoles?: readonly string[],
): Task[] {
  const profileMap = new Map(profiles.map((p) => [p.role, p]));
  const roleSet = requestedRoles && requestedRoles.length > 0
    ? new Set(requestedRoles)
    : null;

  return sprint.phases
    .filter((phase) => !roleSet || roleSet.has(phase.role))
    .filter((phase) => profileMap.has(phase.role))
    .map((phase, i) => ({
      description: taskDescription,
      assignedRole: phase.role,
      priority: i,
      status: "pending" as const,
    }));
}

function buildAgentTask(
  teamTask: string,
  profile: ProfileConfig,
  phaseId: string,
): string {
  const lines: string[] = [];

  lines.push(`Team Task: ${teamTask}`);
  lines.push(`Phase: ${phaseId}`);
  lines.push("");
  lines.push(
    buildTaskInstructions(
      {
        displayName: profile.displayName,
        role: profile.role,
        reportsTo: profile.reportsTo,
      },
      phaseId,
    ),
  );

  return lines.join("\n");
}

// ─── Skipped Result ─────────────────────────────────────────────────────────

function buildSkippedResult(task: Task, reason: string): AgentResult {
  return {
    role: task.assignedRole,
    task: task.description,
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
    stopReason: "skipped",
    errorMessage: reason,
  };
}
