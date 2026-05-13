/**
 * Tests for instructions.ts - sprint phase loading and task instruction building
 */

import { describe, expect, it } from "vitest";
import { buildTaskInstructions, getSprint } from "../src/instructions";

const testProfile = {
  displayName: "Test Agent",
  role: "test",
  reportsTo: null as string | null,
};

describe("buildTaskInstructions", () => {
  it("generates structured instructions with title", () => {
    // Tests against the default sprint (always available)
    const result = buildTaskInstructions(testProfile, "execute");
    expect(result).toContain("## Your Task");
    expect(result).toContain("Read the shared memory");
  });

  it("replaces template variables", () => {
    const result = buildTaskInstructions(
      { displayName: "Product Owner", role: "po", reportsTo: null },
      "execute",
    );
    expect(result).toContain("Product Owner");
    expect(result).not.toContain("{displayName}");
  });

  it("handles missing template variables gracefully", () => {
    const result = buildTaskInstructions(
      { displayName: "PO", role: "po", reportsTo: null },
      "requirements",
    );
    // Should not contain unresolved templates
    expect(result).not.toContain("{reportsTo}");
  });

  it("generates review phase instructions", () => {
    const result = buildTaskInstructions(testProfile, "review");
    expect(result).toContain("## Review Phase");
    expect(result).toContain("Read the complete shared memory");
  });

  it("accepts overrides", () => {
    const result = buildTaskInstructions(testProfile, "execute", {
      title: "Custom Title",
      steps: ["Step A", "Step B"],
    });
    expect(result).toContain("## Custom Title");
    expect(result).toContain("1. Step A");
    expect(result).toContain("2. Step B");
  });

  it("falls back for unknown phase ID", () => {
    const result = buildTaskInstructions(testProfile, "nonexistent");
    // Should still produce something
    expect(result).toBeTruthy();
    expect(result).toContain("##");
  });
});

describe("getSprint", () => {
  it("returns a valid sprint config with phases", () => {
    const sprint = getSprint();
    expect(sprint.phases.length).toBeGreaterThanOrEqual(2);
    expect(sprint.phases.every((p) => typeof p.id === "string")).toBe(true);
    expect(sprint.phases.every((p) => Array.isArray(p.steps))).toBe(true);
  });
});
