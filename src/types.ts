/**
 * pi-team – Data Types (Data-Oriented Programming)
 *
 * All types are plain immutable records. No classes, no inheritance, no hidden state.
 * Data flows transparently through pure functions.
 */

import type { Message } from "@earendil-works/pi-ai";

// ─── Profile ────────────────────────────────────────────────────────────────

export type ProfileConfig = {
  readonly role: string; // Unique role ID, e.g. "po", "senior-dev"
  readonly displayName: string; // Human-readable name, e.g. "Product Owner"
  readonly reportsTo: string | null; // Role this one reports to; null = top-level
  readonly model: string; // Model ID, e.g. "claude-sonnet-4-5"
  readonly tools: readonly string[]; // Allowed tool names
  readonly maxTurns: number; // Hard turn limit (loop guard)
  readonly systemPrompt: string; // The markdown body (without frontmatter)
  readonly source: "user" | "project"; // Where the profile was loaded from
  readonly filePath: string; // Absolute path to the .md file
};

// ─── Task ───────────────────────────────────────────────────────────────────

export type TaskStatus = "pending" | "running" | "done" | "failed";

export type Task = {
  readonly description: string;
  readonly assignedRole: string;
  readonly priority: number; // Lower = more important
  readonly status: TaskStatus;
};

// ─── Agent Execution Result ─────────────────────────────────────────────────

export type UsageStats = {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly cost: number;
  readonly tokens: number;
  readonly turns: number;
};

export type AgentResult = {
  readonly role: string;
  readonly task: string;
  readonly exitCode: number;
  readonly finalOutput: string;
  readonly messages: readonly Message[];
  readonly stderr: string;
  readonly usage: UsageStats;
  readonly stopReason?: string;
  readonly errorMessage?: string;
};

// ─── Shared Memory ──────────────────────────────────────────────────────────

/** A single Definition-of-Done checklist item. */
export type DoDItem = {
  readonly role: string;
  readonly description: string;
  readonly done: boolean;
};

/** Shape of the shared team-memory.md file. */
export type SharedMemory = {
  readonly taskDescription: string;
  readonly dod: readonly DoDItem[];
  readonly sections: readonly MemorySection[];
  readonly rawContent: string; // The full markdown text
};

export type MemorySection = {
  readonly role: string;
  readonly content: string;
};

// ─── Orchestrator Input / Output ────────────────────────────────────────────

export type TeamInput = {
  readonly task: string;
  readonly roles?: readonly string[]; // If omitted: all available roles
  readonly model?: string; // Override per-profile models
  readonly agentScope?: "user" | "project" | "both";
  readonly confirmProjectProfiles?: boolean;
};

export type TeamDetails = {
  readonly results: readonly AgentResult[];
  readonly sharedMemoryPath: string | null;
  readonly plan: readonly Task[];
};

// ─── Profile Discovery ──────────────────────────────────────────────────────

export type ProfileDiscoveryResult = {
  readonly profiles: readonly ProfileConfig[];
  readonly projectProfilesDir: string | null;
};

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum concurrent subprocesses (for future parallel support). */
export const MAX_TURNS_HARD_LIMIT = 20;

/** Default timeout per agent turn in seconds. */
export const TURN_TIMEOUT_SECONDS = 120;

/** Total timeout buffer (maxTurns * TURN_TIMEOUT + this). */
export const TOTAL_TIMEOUT_BUFFER_SECONDS = 60;
