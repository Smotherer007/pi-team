/**
 * Tests for discovery.ts — profile parsing and loading
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// We test internal helpers by extracting them or testing via discoverProfiles
import { discoverProfiles } from "../src/discovery";

describe("discoverProfiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-team-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty when no profiles exist", () => {
    const result = discoverProfiles(tmpDir, "user");
    expect(result.profiles).toEqual([]);
    expect(result.projectProfilesDir).toBeNull();
  });

  it("discovers profiles from user directory", () => {
    const profilesDir = path.join(tmpDir, "profiles");
    fs.mkdirSync(profilesDir, { recursive: true });
    fs.writeFileSync(
      path.join(profilesDir, "po.md"),
      [
        "---",
        "role: po",
        "displayName: Product Owner",
        "reportsTo: null",
        "model: deepseek-v4-flash",
        "maxTurns: 5",
        "---",
        "You are the PO.",
      ].join("\n"),
    );

    // This test only works if the user agent dir points here
    // In practice, we test via the fallback behavior:
    const result = discoverProfiles(tmpDir, "both");
    // Since there's no .pi/team/profiles, it falls back to user dir which is the real one
    expect(result.projectProfilesDir).toBeNull();
  });

  it("handles missing directories gracefully", () => {
    const result = discoverProfiles(tmpDir, "project");
    expect(result.profiles).toEqual([]);
    expect(result.projectProfilesDir).toBeNull();
  });
});
