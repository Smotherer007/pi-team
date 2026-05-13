/**
 * pi-team – Shared Memory Operations
 *
 * Pure functions operating on the team-memory.md file.
 * All mutations are well-defined and happen at the boundary.
 *
 * Memory format:
 *   # Team Memory
 *   ## Task: <description>
 *   ## DoD
 *   - [x] role: description
 *   - [ ] role: description
 *   ---
 *   ## <Role> <DisplayName>
 *   content...
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { DoDItem, MemorySection, SharedMemory } from "./types";

// ─── Section Markers ────────────────────────────────────────────────────────

const TASK_HEADER = "## Task:";
const DOD_HEADER = "## DoD";
const SECTION_SEPARATOR = "\n---\n";

// ─── Initialize Memory ──────────────────────────────────────────────────────

/**
 * Create the initial shared memory file for a new task.
 * Overwrites any existing memory in the target directory.
 */
export function initializeMemory(
  cwd: string,
  taskDescription: string,
  dodItems: readonly DoDItem[],
): string {
  const memoryPath = getMemoryPath(cwd);
  const content = buildMemoryContent(taskDescription, dodItems, []);
  fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
  fs.writeFileSync(memoryPath, content, "utf-8");
  return memoryPath;
}

// ─── Read Memory ────────────────────────────────────────────────────────────

/**
 * Read and parse the shared memory file. Returns null if it doesn't exist.
 */
export function readMemory(cwd: string): SharedMemory | null {
  const memoryPath = getMemoryPath(cwd);
  if (!fs.existsSync(memoryPath)) return null;

  const rawContent = fs.readFileSync(memoryPath, "utf-8");
  return parseMemoryContent(rawContent);
}

/**
 * Read just the raw content. Returns empty string if the file doesn't exist.
 */
export function readMemoryRaw(cwd: string): string {
  const memoryPath = getMemoryPath(cwd);
  if (!fs.existsSync(memoryPath)) return "";
  return fs.readFileSync(memoryPath, "utf-8");
}

// ─── Append Section ─────────────────────────────────────────────────────────

/**
 * Append a role's output section to the shared memory file.
 */
export function appendMemorySection(
  cwd: string,
  role: string,
  displayName: string,
  content: string,
): void {
  const memoryPath = getMemoryPath(cwd);
  if (!fs.existsSync(memoryPath)) {
    throw new Error(`Shared memory not found at ${memoryPath}`);
  }

  const section = formatMemorySection(role, displayName, content);
  fs.appendFileSync(memoryPath, `\n${section}\n`, "utf-8");
}

// ─── DoD Operations ─────────────────────────────────────────────────────────

/**
 * Build DoD items from profile roles.
 * Every role starts as unchecked.
 */
export function buildDoDItems(roles: readonly { role: string; displayName: string }[]): DoDItem[] {
  return roles.map((r) => ({
    role: r.role,
    description: `${r.displayName}: Complete task`,
    done: false,
  }));
}

/**
 * Mark a role's DoD item as complete in the memory file.
 * Returns the updated DoD items.
 */
export function markDoDComplete(cwd: string, role: string): DoDItem[] {
  const memory = readMemory(cwd);
  if (!memory) return [];

  const updatedItems = memory.dod.map((item) =>
    item.role === role ? { ...item, done: true } : item,
  );

  // Rebuild the entire file (simple approach; alternative: regex replace)
  const newContent = buildMemoryContent(
    memory.taskDescription,
    updatedItems,
    memory.sections,
  );

  fs.writeFileSync(getMemoryPath(cwd), newContent, "utf-8");
  return updatedItems;
}

/**
 * Check if all DoD items are complete.
 */
export function isDoDComplete(items: readonly DoDItem[]): boolean {
  return items.length > 0 && items.every((item) => item.done);
}

// ─── Pure Content Builders ──────────────────────────────────────────────────

function buildMemoryContent(
  taskDescription: string,
  dodItems: readonly DoDItem[],
  sections: readonly MemorySection[],
): string {
  const lines: string[] = [];

  lines.push("# Team Memory");
  lines.push("");
  lines.push(`${TASK_HEADER} ${taskDescription}`);
  lines.push("");
  lines.push(DOD_HEADER);

  for (const item of dodItems) {
    const checkbox = item.done ? "x" : " ";
    lines.push(`- [${checkbox}] ${item.role}: ${item.description}`);
  }

  lines.push("");
  lines.push(SECTION_SEPARATOR.trim());

  for (const section of sections) {
    lines.push("");
    lines.push(formatMemorySection(section.role, section.role, section.content));
  }

  return lines.join("\n") + "\n";
}

function formatMemorySection(role: string, _displayName: string, content: string): string {
  return `## ${role}\n${content}`;
}

function parseMemoryContent(raw: string): SharedMemory {
  const lines = raw.split("\n");

  let taskDescription = "";
  const dodItems: DoDItem[] = [];
  const sections: MemorySection[] = [];

  let currentSection: { role: string; lines: string[] } | null = null;
  let inDoD = false;
  let afterDoD = false;

  for (const line of lines) {
    // Task header
    if (line.startsWith(TASK_HEADER)) {
      taskDescription = line.slice(TASK_HEADER.length).trim();
      continue;
    }

    // DoD header
    if (line.trim() === DOD_HEADER) {
      inDoD = true;
      continue;
    }

    // DoD items
    if (inDoD && line.match(/^-\s*\[([ x])\]\s*(.+)$/)) {
      const match = line.match(/^-\s*\[([ x])\]\s*(.+)$/)!;
      const done = match[1] === "x";
      const rest = match[2];
      // Role is the first word before ":"
      const colonIdx = rest.indexOf(":");
      const role = colonIdx >= 0 ? rest.slice(0, colonIdx).trim() : rest.trim();
      const description = colonIdx >= 0 ? rest.slice(colonIdx + 1).trim() : "";
      dodItems.push({ role, description, done });
      continue;
    }

    // Section separator ends DoD
    if (inDoD && line.trim() === "---") {
      inDoD = false;
      afterDoD = true;
      continue;
    }

    // Section headers
    if (afterDoD && line.startsWith("## ")) {
      // Flush current section
      if (currentSection) {
        sections.push({
          role: currentSection.role,
          content: currentSection.lines.join("\n").trim(),
        });
      }
      currentSection = {
        role: line.slice(3).trim(),
        lines: [],
      };
      continue;
    }

    // Section content
    if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  // Flush last section
  if (currentSection) {
    sections.push({
      role: currentSection.role,
      content: currentSection.lines.join("\n").trim(),
    });
  }

  return {
    taskDescription,
    dod: dodItems,
    sections,
    rawContent: raw,
  };
}

// ─── Path Helper ────────────────────────────────────────────────────────────

function getMemoryPath(cwd: string): string {
  return path.join(cwd, ".pi", "team", "team-memory.md");
}
