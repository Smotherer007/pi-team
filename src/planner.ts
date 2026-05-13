/**
 * pi-team – Execution Planner
 *
 * Pure functions that build an ordered execution plan from profiles.
 * Uses the reportsTo hierarchy to determine execution order.
 *
 * Rules:
 * - Root profiles (reportsTo: null) execute first
 * - Each profile executes AFTER the one it reports to
 * - Cyclic dependencies are detected and rejected
 * - If specific roles are requested, only those + their ancestors run
 */

import type { ProfileConfig, Task } from "./types";

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Build an ordered task list from profiles and a filter.
 *
 * @param profiles – All available profiles
 * @param taskDescription – The team task
 * @param requestedRoles – If provided, only these roles (and their dependency chains) run
 * @returns Ordered task list (root first, leaf last)
 */
export function buildExecutionPlan(
  profiles: readonly ProfileConfig[],
  taskDescription: string,
  requestedRoles?: readonly string[],
): Task[] {
  if (profiles.length === 0) return [];

  // Determine which roles participate
  const activeRoles = resolveActiveRoles(profiles, requestedRoles);

  // Filter profiles to active roles
  const activeProfiles = profiles.filter((p) => activeRoles.has(p.role));

  // Detect cycles
  const cycle = detectCycle(activeProfiles);
  if (cycle) {
    throw new Error(
      `Cyclic reportsTo dependency detected: ${cycle.join(" → ")}`,
    );
  }

  // Topological sort by reportsTo
  const sorted = topologicalSort(activeProfiles);

  // Build tasks
  return sorted.map((profile, index) => ({
    description: taskDescription,
    assignedRole: profile.role,
    priority: index,
    status: "pending" as const,
  }));
}

/**
 * Build the DoD (Definition of Done) checklist from a task list.
 */
export function buildDoDFromPlan(plan: Task[], profiles: readonly ProfileConfig[]): {
  role: string;
  displayName: string;
}[] {
  const profileMap = new Map(profiles.map((p) => [p.role, p]));

  return plan.map((task) => {
    const profile = profileMap.get(task.assignedRole);
    return {
      role: task.assignedRole,
      displayName: profile?.displayName ?? task.assignedRole,
    };
  });
}

/**
 * Determine the execution order chain for display purposes.
 * Returns roles in execution order.
 */
export function describePlan(plan: Task[], profiles: readonly ProfileConfig[]): string {
  const profileMap = new Map(profiles.map((p) => [p.role, p]));

  return plan
    .map((task) => {
      const profile = profileMap.get(task.assignedRole);
      const name = profile?.displayName ?? task.assignedRole;
      const reportsTo = profile?.reportsTo;
      const parent = reportsTo
        ? ` ← ${profileMap.get(reportsTo)?.displayName ?? reportsTo}`
        : "";
      return `${name} (${task.assignedRole})${parent}`;
    })
    .join("\n  → ");
}

// ─── Role Resolution ────────────────────────────────────────────────────────

function resolveActiveRoles(
  profiles: readonly ProfileConfig[],
  requestedRoles?: readonly string[],
): Set<string> {
  if (!requestedRoles || requestedRoles.length === 0) {
    // All roles participate
    return new Set(profiles.map((p) => p.role));
  }

  // Start with requested roles
  const active = new Set(requestedRoles);

  // For each requested role, trace up the reportsTo chain
  const profileMap = new Map(profiles.map((p) => [p.role, p]));

  for (const role of requestedRoles) {
    let current: string | null = role;
    while (current) {
      const profile = profileMap.get(current);
      if (!profile) break; // Role not found in profiles (will error later)
      active.add(current);
      current = profile.reportsTo;
    }
  }

  return active;
}

// ─── Cycle Detection ────────────────────────────────────────────────────────

function detectCycle(profiles: readonly ProfileConfig[]): string[] | null {
  const profileMap = new Map(profiles.map((p) => [p.role, p]));
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(role: string): boolean {
    if (inStack.has(role)) {
      // Found cycle: extract the cycle portion
      const cycleStart = path.indexOf(role);
      return true; // Signal cycle found
    }
    if (visited.has(role)) return false;

    visited.add(role);
    inStack.add(role);
    path.push(role);

    const profile = profileMap.get(role);
    if (profile?.reportsTo) {
      if (dfs(profile.reportsTo)) return true;
    }

    path.pop();
    inStack.delete(role);
    return false;
  }

  for (const profile of profiles) {
    if (dfs(profile.role)) {
      // Extract the cycle from path
      const cycleIdx = path.indexOf(path[path.length - 1]);
      // Actually, let's find the exact cycle
      return findCyclePath(profileMap);
    }
  }

  return null;
}

function findCyclePath(profileMap: Map<string, ProfileConfig>): string[] {
  // Floyd's algorithm to find one cycle
  const visited = new Set<string>();

  for (const [role] of profileMap) {
    if (visited.has(role)) continue;

    let slow: string | null = role;
    let fast: string | null = role;

    // Find meeting point
    do {
      visited.add(slow!);
      slow = profileMap.get(slow!)?.reportsTo ?? null;
      fast = profileMap.get(fast!)?.reportsTo ?? null;
      if (fast) fast = profileMap.get(fast)?.reportsTo ?? null;
    } while (slow && fast && slow !== fast);

    if (slow && fast && slow === fast) {
      // Found cycle, reconstruct path
      const cycle: string[] = [];
      let current = slow;
      do {
        cycle.push(current);
        current = profileMap.get(current)?.reportsTo ?? null;
      } while (current && current !== slow);
      cycle.push(slow); // Close the cycle
      return cycle;
    }
  }

  return [];
}

// ─── Topological Sort ───────────────────────────────────────────────────────

function topologicalSort(profiles: readonly ProfileConfig[]): ProfileConfig[] {
  const profileMap = new Map(profiles.map((p) => [p.role, p]));
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  // Initialize
  for (const p of profiles) {
    inDegree.set(p.role, 0);
    children.set(p.role, []);
  }

  // Build graph (parent → children)
  for (const p of profiles) {
    if (p.reportsTo) {
      const parent = p.reportsTo;
      // Only count edges within the active set
      if (profileMap.has(parent)) {
        inDegree.set(p.role, (inDegree.get(p.role) ?? 0) + 1);
        const childList = children.get(parent) ?? [];
        childList.push(p.role);
        children.set(parent, childList);
      }
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [role, degree] of inDegree) {
    if (degree === 0) queue.push(role);
  }

  const sorted: ProfileConfig[] = [];
  while (queue.length > 0) {
    // Sort queue by role name for deterministic output
    queue.sort();
    const role = queue.shift()!;
    const profile = profileMap.get(role)!;
    sorted.push(profile);

    for (const child of children.get(role) ?? []) {
      const newDegree = (inDegree.get(child) ?? 1) - 1;
      inDegree.set(child, newDegree);
      if (newDegree === 0) queue.push(child);
    }
  }

  return sorted;
}
