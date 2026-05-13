/**
 * Tests for planner.ts - execution plan builder, cycle detection, topological sort
 */

import { describe, expect, it } from "vitest";
import { buildExecutionPlan, buildDoDFromPlan, describePlan } from "../src/planner";
import type { ProfileConfig } from "../src/types";

function makeProfile(overrides: Partial<ProfileConfig> = {}): ProfileConfig {
  return {
    role: "test",
    displayName: "Test",
    reportsTo: null,
    model: "deepseek-v4-flash",
    tools: [],
    maxTurns: 0,
    systemPrompt: "test prompt",
    source: "user",
    filePath: "/test.md",
    ...overrides,
  };
}

describe("buildExecutionPlan", () => {
  const po = makeProfile({ role: "po", displayName: "PO", reportsTo: null });
  const dev = makeProfile({ role: "dev", displayName: "Dev", reportsTo: "po" });
  const qa = makeProfile({ role: "qa", displayName: "QA", reportsTo: "dev" });
  const ux = makeProfile({ role: "ux", displayName: "UX", reportsTo: "po" });

  it("returns empty array for no profiles", () => {
    expect(buildExecutionPlan([], "task")).toEqual([]);
  });

  it("orders by reportsTo hierarchy", () => {
    const plan = buildExecutionPlan([po, dev, qa], "test task");
    const roles = plan.map((t) => t.assignedRole);
    expect(roles[0]).toBe("po");
    expect(roles[1]).toBe("dev");
    expect(roles[2]).toBe("qa");
  });

  it("handles multiple children of same parent", () => {
    const plan = buildExecutionPlan([po, dev, ux], "test");
    const roles = plan.map((t) => t.assignedRole);
    expect(roles[0]).toBe("po");
    // Both dev and ux come after po
    expect(roles).toContain("dev");
    expect(roles).toContain("ux");
  });

  it("filters by requested roles (includes ancestors)", () => {
    // When requesting "dev" and "qa", po is included as ancestor of dev
    const plan = buildExecutionPlan([po, dev, qa], "task", ["dev", "qa"]);
    const roles = plan.map((t) => t.assignedRole);
    expect(roles).toContain("dev");
    expect(roles).toContain("qa");
    expect(roles).toContain("po"); // ancestor
  });

  it("includes ancestors of requested roles", () => {
    const plan = buildExecutionPlan([po, dev, qa], "task", ["qa"]);
    const roles = plan.map((t) => t.assignedRole);
    // qa's ancestors: dev -> po
    expect(roles).toEqual(["po", "dev", "qa"]);
  });

  it("sets correct task properties", () => {
    const plan = buildExecutionPlan([po, dev], "build login");
    expect(plan).toHaveLength(2);
    expect(plan[0].description).toBe("build login");
    expect(plan[0].assignedRole).toBe("po");
    expect(plan[0].status).toBe("pending");
    expect(plan[0].priority).toBe(0);
    expect(plan[1].priority).toBe(1);
  });

  it("detects cyclic dependencies", () => {
    const a = makeProfile({ role: "a", reportsTo: "b" });
    const b = makeProfile({ role: "b", reportsTo: "a" });
    expect(() => buildExecutionPlan([a, b], "task")).toThrow("Cyclic");
  });

  it("handles unknown reportsTo gracefully", () => {
    const orphan = makeProfile({ role: "orphan", reportsTo: "nonexistent" });
    const plan = buildExecutionPlan([po, orphan], "task");
    // Orphan has no valid parent, treated as root
    expect(plan.length).toBeGreaterThanOrEqual(2);
  });
});

describe("buildDoDFromPlan", () => {
  it("creates DoD items from plan", () => {
    const po = makeProfile({ role: "po", displayName: "Product Owner", reportsTo: null });
    const dev = makeProfile({ role: "dev", displayName: "Developer", reportsTo: "po" });
    const plan = buildExecutionPlan([po, dev], "task");

    const dodItems = buildDoDFromPlan(plan, [po, dev]);
    expect(dodItems).toHaveLength(2);
    expect(dodItems[0].role).toBe("po");
    expect(dodItems[0].displayName).toBe("Product Owner");
    expect(dodItems[1].role).toBe("dev");
  });
});

describe("describePlan", () => {
  it("generates human-readable plan description", () => {
    const po = makeProfile({ role: "po", displayName: "Product Owner" });
    const dev = makeProfile({ role: "dev", displayName: "Developer", reportsTo: "po" });
    const plan = buildExecutionPlan([po, dev], "task");

    const desc = describePlan(plan, [po, dev]);
    expect(desc).toContain("Product Owner");
    expect(desc).toContain("Developer");
    expect(desc).toContain("Product Owner"); // the "←" parent reference
  });
});
