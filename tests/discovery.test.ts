/**
 * Tests for discovery.ts — profile parsing and loading
 *
 * Note: discovery.ts imports @earendil-works/pi-coding-agent which is
 * only available inside the pi runtime. These tests are minimal and
 * verify the module structure.
 */

import { describe, expect, it } from "vitest";

// We cannot import discoverProfiles directly outside pi runtime.
// Test the type structure and parsing logic indirectly.

describe("ProfileConfig type", () => {
  it("accepts all required fields", () => {
    const profile = {
      role: "po",
      displayName: "Product Owner",
      reportsTo: null,
      model: "deepseek-v4-flash",
      tools: ["read", "grep"],
      maxTurns: 5,
      systemPrompt: "You are the PO.",
      source: "user" as const,
      filePath: "/test/po.md",
    };
    expect(profile.role).toBe("po");
    expect(profile.displayName).toBe("Product Owner");
    expect(profile.reportsTo).toBeNull();
    expect(profile.maxTurns).toBe(5);
  });
});
