---
description: Lightweight workflow — Dev implements, Security audits, QA checks, PO reviews
---

# Workflow: PR

**Purpose:** Implement a change quickly with essential quality gates — security audit, quality check, and PO sign-off — without the full overhead of UX review, architecture planning, and CI pipeline checks.

**When to use:** Use this workflow for small-to-medium changes where UX impact is minimal and the architecture is already defined (e.g. bug fixes, refactors, internal tooling, additions within an existing pattern). Requires `## PO Analysis` to already be present in shared memory from a prior `/analyze` run. Use `/sprint` for new user-facing features or changes that require a full quality gate.

**Prerequisite:** Shared memory must contain `## PO Analysis`. If it does not, run `/analyze $@` first.

---

## Execution

Run as a team with roles: `["dev", "sr", "qa"]` and `teamReview: true`

---

### Step 1 — dev (Implementation)

**Reads:** `## PO Analysis` (required), `## Architecture` if present

**Stops with `## Blockers` if:** `## PO Analysis` is missing, requirements are unclear, or the architecture has a design issue that prevents implementation.

**Produces:** `## Developer Implementation` in shared memory, containing:
- Changed files with line ranges and one-sentence descriptions
- Solution summary (2–4 sentences on the approach and non-obvious decisions)
- Commit hash
- AC satisfaction checklist: `AC1: satisfied by [function] in [file] line [X]`

**Code standards enforced:**
- Clean code: single-purpose functions, descriptive names, no duplication, explicit error handling, early returns
- Data-oriented programming: `readonly` types, pure functions, no hidden mutable state, explicit type definitions, boundary validation only
- TypeScript: `"strict": true`, no `any`, no unexplained non-null assertions
- Tests: every new exported function has tests covering happy path and edge cases (`null`, `undefined`, empty, error, timeout); all tests must pass before committing

**Git:** conventional commit format (`type: summary` + release notes), then `git push`. No commit if tests fail.

---

### Step 2 — sr (Security Reviewer)

**Reads:** `## Developer Implementation` (required), inspects changed files directly

**Stops with `## Blockers` if:** `## Developer Implementation` is missing.

**Produces:** `## Security Audit` in shared memory, containing:
- Findings by severity (Critical / High / Medium / Low), each with `file:line`, impact description, and concrete fix
- Release recommendation: `✅ SAFE TO RELEASE` / `⚠️ RELEASE WITH MITIGATIONS` / `❌ DO NOT RELEASE`

**Audits:** input validation, data leakage in logs/errors, command injection in shell calls, subprocess safety (timeouts, escaping), new dependencies (npm audit), new attack surface.

---

### Step 3 — qa (Quality Manager)

**Reads:** all available shared memory sections, inspects source files directly

**Produces:** `## QA Report` in shared memory, containing:
- Quality scores (1–10) for: Code / Tests / Docs / Consistency / Overall
- Top 3 recommendations ordered by impact, each with `file:line` reference
- Any issues not raised by other agents, marked `🚨 NEW FINDING`
- Release recommendation: `✅ READY FOR RELEASE` / `⚠️ RELEASE WITH CAUTION` / `❌ NOT READY`

---

### Final Review — po (teamReview)

**Reads:** all shared memory sections

**Produces:** `## PO Review` in shared memory, containing:
- Per-AC verdict: `✅ Met` / `❌ Not met` / `⚠️ Partially met` + one-sentence reason
- Overall status: `✅ ACCEPTED` / `❌ REWORK NEEDED` / `⚠️ CONDITIONAL ACCEPT`
- If REWORK NEEDED: specific changes required with AC numbers and file references

**Rule:** If Security returns `❌ DO NOT RELEASE` or QA returns `❌ NOT READY`, the PO must conclude `❌ REWORK NEEDED`.

---

## Output

All findings are written to: `.pi/team/team-memory.md`

The Developer additionally commits and pushes code to the repository.

---

## Completion Criteria

The workflow is complete when all of the following are present in shared memory:
- `## Developer Implementation` — commit hash and AC checklist
- `## Security Audit` — findings by severity and release recommendation
- `## QA Report` — quality scores and release recommendation
- `## PO Review` — per-AC verdict and overall status

---

## Failure Handling

- Any agent that encounters a missing required input writes `## Blockers` and stops. Subsequent agents wait.
- If the Developer's tests fail, no commit is made and a `## Blockers` section is written. Fix the failures before re-running.
- A stopped workflow with a clear blocker is preferable to a completed workflow with hidden quality debt.

---

## Differences from /sprint

| Aspect | /pr | /sprint |
|--------|-----|---------|
| PO analysis | ⚠️ Requires prior `/analyze` | ✅ Included |
| Architecture | ⚠️ Requires prior `/analyze` | ✅ Included |
| UX review | ❌ Skipped | ✅ Included |
| CI pipeline check | ❌ Skipped | ✅ Included |
| Security audit | ✅ Included | ✅ Included |
| QA assessment | ✅ Included | ✅ Included |
| PO final review | ✅ Included | ✅ Included |
| Best for | Bug fixes, refactors | New features, significant changes |
