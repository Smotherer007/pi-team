/**
 * pi-team – Profile Discovery
 *
 * Pure discovery logic: reads .md files from user/project directories,
 * parses YAML frontmatter, returns immutable ProfileConfig records.
 *
 * No side effects except filesystem reads at well-defined boundaries.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import type { ProfileConfig, ProfileDiscoveryResult } from "./types";

// ─── Frontmatter Schema ─────────────────────────────────────────────────────

type RawFrontmatter = {
  role?: string;
  displayName?: string;
  reportsTo?: string;
  model?: string;
  tools?: string;
  maxTurns?: string;
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Discover team profiles from user and/or project directories.
 *
 * @param cwd – Working directory (used to find nearest .pi/team/profiles)
 * @param scope – Which directories to scan
 * @returns Resolved profiles (project profiles override user profiles by name)
 */
export function discoverProfiles(cwd: string, scope: "user" | "project" | "both"): ProfileDiscoveryResult {
  const userDir = path.join(getAgentDir(), "team", "profiles");
  const projectProfilesDir = findNearestProjectProfilesDir(cwd);

  const userProfiles = scope === "project" ? [] : loadProfilesFromDir(userDir, "user");
  const projectProfiles =
    scope === "user" || !projectProfilesDir ? [] : loadProfilesFromDir(projectProfilesDir, "project");

  // Merge: later sources override earlier by role
  const profileMap = new Map<string, ProfileConfig>();

  for (const profile of userProfiles) {
    profileMap.set(profile.role, profile);
  }
  for (const profile of projectProfiles) {
    profileMap.set(profile.role, profile);
  }

  return {
    profiles: Array.from(profileMap.values()),
    projectProfilesDir,
  };
}

// ─── Directory Traversal ────────────────────────────────────────────────────

function findNearestProjectProfilesDir(cwd: string): string | null {
  let currentDir = cwd;
  while (true) {
    const candidate = path.join(currentDir, ".pi", "team", "profiles");
    if (isDirectory(candidate)) return candidate;

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// ─── Profile Loading ────────────────────────────────────────────────────────

function loadProfilesFromDir(dir: string, source: "user" | "project"): ProfileConfig[] {
  if (!fs.existsSync(dir)) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const profiles: ProfileConfig[] = [];

  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = path.join(dir, entry.name);
    const profile = parseProfileFile(filePath, source);
    if (profile) profiles.push(profile);
  }

  return profiles;
}

function parseProfileFile(filePath: string, source: "user" | "project"): ProfileConfig | null {
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }

  const { frontmatter, body } = parseFrontmatter<RawFrontmatter>(content);

  // Validate required fields
  if (!frontmatter.role || !frontmatter.displayName) return null;

  const role = frontmatter.role;
  const displayName = frontmatter.displayName;
  const reportsTo = frontmatter.reportsTo ?? null;
  const model = frontmatter.model ?? "claude-sonnet-4-5";
  const tools = parseToolsList(frontmatter.tools);
  const maxTurns = parseMaxTurns(frontmatter.maxTurns);
  const systemPrompt = body.trim();

  // Normalize reportsTo: null string to actual null
  const normalizedReportsTo =
    reportsTo === null || reportsTo === "null" || reportsTo === "" ? null : reportsTo;

  return {
    role,
    displayName,
    reportsTo: normalizedReportsTo,
    model,
    tools,
    maxTurns,
    systemPrompt,
    source,
    filePath,
  };
}

// ─── Parsing Helpers ─────────────────────────────────────────────────────────

function parseToolsList(raw: string | undefined): string[] {
  if (!raw) return []; // Empty = all default tools
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseMaxTurns(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 10; // Sensible default
  const parsed = Number(raw);
  // 0 = unlimited, negative = invalid → default
  if (parsed === 0) return 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}
