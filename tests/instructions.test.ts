/**
 * Tests for instructions.ts — sprint phase loading and task instruction building
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildTaskInstructions, getSprint } from "../src/instructions";

const testProfile = {
  displayName: "Test Agent",
  role: "test",
  reportsTo: null as string | null,
};

describe("buildTaskInstructions", () => {
  it("generates structured instructions with title", () => {
    const result = buildTaskInstructions(testProfile, "execute");
    expect(result).toContain("## Your Task");
    expect(result).toContain("1. Read the shared memory");
    expect(result).toContain("Test Agent");
  });

  it("replaces template variables", () => {
    const result = buildTaskInstructions(
      { displayName: "Product Owner", role: "po", reportsTo: null },
      "execute",
    );
    expect(result).toContain("Product Owner");
    expect(result).not.toContain("{displayName}");
  });

  it("replaces reportsTo with 'none' when null", () => {
    const result = buildTaskInstructions(
      { displayName: "PO", role: "po", reportsTo: null },
      "execute",
    );
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
  it("returns default sprint when no sprint.json exists", () => {
    // Save and remove any existing sprint.json in cwd
    const cwd = process.cwd();
    const sprintPath = path.join(cwd, ".pi", "team", "sprint.json");
    const backupPath = path.join(cwd, ".pi", "team", "sprint.json.bak");

    let backup: string | null = null;
    try {
      if (fs.existsSync(sprintPath)) {
        backup = fs.readFileSync(sprintPath, "utf-8");
        fs.renameSync(sprintPath, backupPath);
      }

      const sprint = getSprint();
      expect(sprint.phases.length).toBeGreaterThanOrEqual(2);
      expect(sprint.phases[0].id).toBe("execute");
      expect(sprint.phases[1].id).toBe("review");
    } finally {
      // Restore
      try {
        if (backup !== null) {
          fs.mkdirSync(path.dirname(sprintPath), { recursive: true });
          fs.writeFileSync(sprintPath, backup);
          fs.rmSync(backupPath, { force: true });
        }
      } catch {
        // ignore
      }
    }
  });
});
