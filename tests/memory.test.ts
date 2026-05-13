/**
 * Tests for memory.ts — shared memory operations
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendMemorySection,
  buildDoDItems,
  initializeMemory,
  isDoDComplete,
  markDoDComplete,
  readMemory,
} from "../src/memory";

describe("initializeMemory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-team-test-"));
    fs.mkdirSync(path.join(tmpDir, ".pi", "team"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates memory file with task and DoD", () => {
    const dodItems = [
      { role: "po", description: "Analyze", done: false },
      { role: "dev", description: "Implement", done: false },
    ];

    initializeMemory(tmpDir, "build login", dodItems);

    const memory = readMemory(tmpDir);
    expect(memory).not.toBeNull();
    expect(memory!.taskDescription).toBe("build login");
    expect(memory!.dod).toHaveLength(2);
    expect(memory!.dod[0].role).toBe("po");
    expect(memory!.dod[0].done).toBe(false);
  });

  it("returns null when memory file doesn't exist", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-team-empty-"));
    const memory = readMemory(emptyDir);
    expect(memory).toBeNull();
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});

describe("appendMemorySection", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-team-test-"));
    fs.mkdirSync(path.join(tmpDir, ".pi", "team"), { recursive: true });
    initializeMemory(tmpDir, "task", [
      { role: "po", description: "Analyze", done: false },
    ]);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends a section to existing memory", () => {
    appendMemorySection(tmpDir, "po", "Product Owner", "User story here...");

    const memory = readMemory(tmpDir);
    expect(memory).not.toBeNull();
    expect(memory!.sections).toHaveLength(1);
    expect(memory!.sections[0].role).toBe("po");
    expect(memory!.sections[0].content).toBe("User story here...");
  });

  it("appends multiple sections in order", () => {
    appendMemorySection(tmpDir, "po", "PO", "analysis");
    appendMemorySection(tmpDir, "dev", "Dev", "implementation");

    const memory = readMemory(tmpDir);
    expect(memory!.sections).toHaveLength(2);
    expect(memory!.sections[0].content).toBe("analysis");
    expect(memory!.sections[1].content).toBe("implementation");
  });

  it("throws if memory doesn't exist", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-team-empty-"));
    expect(() =>
      appendMemorySection(emptyDir, "po", "PO", "content"),
    ).toThrow("not found");
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });
});

describe("buildDoDItems", () => {
  it("builds items from role definitions", () => {
    const items = buildDoDItems([
      { role: "po", displayName: "Product Owner" },
      { role: "dev", displayName: "Developer" },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].role).toBe("po");
    expect(items[0].description).toContain("Product Owner");
    expect(items[0].done).toBe(false);
  });
});

describe("markDoDComplete", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-team-test-"));
    fs.mkdirSync(path.join(tmpDir, ".pi", "team"), { recursive: true });
    initializeMemory(tmpDir, "task", [
      { role: "po", description: "Analyze", done: false },
      { role: "dev", description: "Implement", done: false },
    ]);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("marks a DoD item as complete", () => {
    const updated = markDoDComplete(tmpDir, "po");
    expect(updated).toHaveLength(2);
    expect(updated[0].done).toBe(true);
    expect(updated[1].done).toBe(false);

    // Verify persisted
    const memory = readMemory(tmpDir);
    expect(memory!.dod[0].done).toBe(true);
  });

  it("preserves other items", () => {
    markDoDComplete(tmpDir, "po");
    const memory = readMemory(tmpDir);
    expect(memory!.dod[1].done).toBe(false);
  });
});

describe("isDoDComplete", () => {
  it("returns true when all items done", () => {
    expect(isDoDComplete([{ role: "po", description: "", done: true }])).toBe(
      true,
    );
  });

  it("returns false when any item not done", () => {
    expect(
      isDoDComplete([
        { role: "po", description: "", done: true },
        { role: "dev", description: "", done: false },
      ]),
    ).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(isDoDComplete([])).toBe(false);
  });
});
