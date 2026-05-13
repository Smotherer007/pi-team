/**
 * pi-team – Sprint Instructions
 *
 * Reads sprint phases from sprint.json. Each phase maps a role to
 * a title, description, and ordered steps. Template variables:
 * {displayName}, {role}, {reportsTo}
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ─── Types ─────────────────────────────────────────────────────────────────

export type PhaseDefinition = {
  readonly id: string;
  readonly role: string;
  readonly title: string;
  readonly description: string;
  readonly steps: readonly string[];
};

export type SprintConfig = {
  readonly phases: readonly PhaseDefinition[];
};

// ─── Default Sprint (falls back if no sprint.json found) ───────────────────

const DEFAULT_SPRINT: SprintConfig = {
  phases: [
    {
      id: "execute",
      role: "*",
      title: "Your Task",
      description: "Execute your assigned task.",
      steps: [
        "Read the shared memory",
        "Execute your task as {displayName}",
        "Document your results in structured shared memory format",
        "When done, write a clear summary for the next agent",
      ],
    },
    {
      id: "review",
      role: "*",
      title: "Review Phase",
      description: "Review all outputs.",
      steps: [
        "Read the complete shared memory carefully",
        "Check whether all acceptance criteria are met",
        "Assess the quality of the implementation",
        "Provide structured feedback",
      ],
    },
  ],
};

// ─── Loader ────────────────────────────────────────────────────────────────

let _cached: SprintConfig | null = null;

function findSprintFile(): string | null {
  const candidates = [
    path.join(process.cwd(), ".pi", "team", "sprint.json"),
    path.join(process.cwd(), ".pi", "sprint.json"),
  ];

  const homeDir = process.env.HOME || process.env.USERPROFILE || "~";
  candidates.push(path.join(homeDir, ".pi", "agent", "team", "sprint.json"));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function loadSprint(): SprintConfig {
  const filePath = findSprintFile();
  if (!filePath) return DEFAULT_SPRINT;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);

    if (parsed && Array.isArray(parsed.phases)) {
      for (const phase of parsed.phases) {
        if (
          typeof phase.id === "string" &&
          typeof phase.role === "string" &&
          typeof phase.title === "string" &&
          Array.isArray(phase.steps)
        ) {
          // valid phase
        } else {
          return DEFAULT_SPRINT; // invalid structure
        }
      }
      return parsed as SprintConfig;
    }
  } catch {
    // Invalid JSON – use fallback
  }

  return DEFAULT_SPRINT;
}

export function getSprint(): SprintConfig {
  if (!_cached) {
    _cached = loadSprint();
  }
  return _cached;
}

export function getPhaseForRole(role: string): PhaseDefinition | undefined {
  const sprint = getSprint();
  return sprint.phases.find(
    (p) => p.role === role || p.role === "*",
  );
}

// ─── Builder ────────────────────────────────────────────────────────────────

export function buildTaskInstructions(
  profile: { displayName: string; role: string; reportsTo: string | null },
  phaseId: string,
  overrides?: Partial<PhaseDefinition>,
): string {
  const sprint = getSprint();
  const phase = sprint.phases.find((p) => p.id === phaseId);

  // Phase not in custom sprint? Check default sprint
  const defaultPhase = DEFAULT_SPRINT.phases.find((p) => p.id === phaseId);
  if (defaultPhase) {
    return buildFromPhase(defaultPhase, profile, overrides);
  }

  // Last resort: find any wildcard phase
  const wildcard = sprint.phases.find((p) => p.role === "*");
  if (wildcard) {
    return buildFromPhase(wildcard, profile, overrides);
  }

  return "## Task\nExecute your task.";

  return buildFromPhase(phase, profile, overrides);
}

function buildFromPhase(
  phase: PhaseDefinition,
  profile: { displayName: string; role: string; reportsTo: string | null },
  overrides?: Partial<PhaseDefinition>,
): string {
  const title = overrides?.title ?? phase.title;
  const steps = overrides?.steps ?? phase.steps;

  const lines: string[] = [];
  lines.push(`## ${title}`);

  if (phase.description) {
    lines.push("");
    lines.push(phase.description);
  }

  lines.push("");

  steps.forEach((step, i) => {
    const filled = step
      .replace("{displayName}", profile.displayName)
      .replace("{role}", profile.role)
      .replace("{reportsTo}", profile.reportsTo ?? "none");
    lines.push(`${i + 1}. ${filled}`);
  });

  return lines.join("\n");
}
