---
description: Full sprint - PO analysis, UX design, architecture, implementation, CI check, security audit, QA signoff, PO final review
---

# Workflow: Sprint

**Purpose:** Run a complete, gated software development sprint from raw requirement to reviewed, committed, and quality-assured implementation - with all quality gates active.

**When to use:** Use this workflow for new user-facing features, significant refactors, or any change that requires the full quality bar. Use `/pr` for smaller changes (bug fixes, refactors) where speed matters more than full coverage.

**Input:** `$@` - the raw requirement, feature description, or user story passed as an argument.

---

## Execution

Run as a team with roles: `["po", "ux", "architect", "dev", "ci", "sr", "qa"]` and `teamReview: true`

Each agent reads from shared memory before starting and writes its output section when done. No agent proceeds if a required input section is missing - it writes `## Blockers` and stops.

---

### Step 1 - po (Requirements Analysis)

**Reads:** raw input `$@`

**Produces:** `## PO Analysis` in shared memory:
- User story: `As a [specific role] I want [concrete feature] so that [measurable benefit]`
- 3–5 acceptance criteria (AC1–AC5), each verifiable as yes/no
- Priority: `HIGH` / `MEDIUM` / `LOW` with one-sentence justification
- Out-of-scope items (minimum 1–2)

**Stops with `## Blockers` if:** input is empty, too vague, or contradictory.

---

### Step 2 - ux (UX Design)

**Reads:** `## PO Analysis` (required)

**Produces:** `## UX Review` in shared memory:
- Target user and environment (role, terminal constraints, technical level)
- Interaction flow: step-by-step description of what the user does and sees
- Language & messaging: required wording for error messages, labels, and output strings
- Layout & readability requirements: line width, hierarchy, color usage
- Flags any UX constraint that directly affects an acceptance criterion: `[WARN] UX Risk: AC[N]...`

**Stops with `## Blockers` if:** `## PO Analysis` is missing or the user role is too vague to define an interaction flow.

---

### Step 3 - architect (Architecture Design)

**Reads:** `## PO Analysis` (required), `## UX Review` (required)

**Produces:** `## Architecture` in shared memory:
- Component diagram (text-based, `→` for relationships)
- Data flow: step-by-step with concrete type names
- API design: function signatures and interfaces the Developer must implement
- Technology recommendations: version, reason, rejected alternative per choice
- Architecture decisions: what was chosen, what was rejected, why
- Technical risks: likelihood, impact, mitigation per risk
- Developer handoff: file structure, implementation order, key constraints, definition of done

**Stops with `## Blockers` if:** requirements are technically impossible, contradictory, or the UX constraints cannot be satisfied by any feasible architecture.

---

### Step 4 - dev (Implementation)

**Reads:** `## PO Analysis` (required), `## Architecture` (required), `## UX Review` (required)

**Produces:** `## Developer Implementation` in shared memory:
- Changed files with line ranges and one-sentence descriptions
- Solution summary (2–4 sentences)
- Commit hash
- AC satisfaction checklist: `AC1: satisfied by [function] in [file] line [X]`

**Code standards enforced:**
- Clean code: single-purpose functions, descriptive names, no duplication, explicit error handling, early returns
- Data-oriented programming: `readonly` types, pure functions, no hidden mutable state, explicit type definitions, boundary validation only
- TypeScript: `"strict": true`, no `any`, no unexplained non-null assertions
- Tests: every new exported function has tests for happy path and edge cases; all tests pass before committing

**Git:** conventional commit format (`type: summary` + release notes), then `git push`. No commit if tests fail.

**Stops with `## Blockers` if:** any required input section is missing, requirements are unclear, or the architecture cannot be implemented as designed.

---

### Step 5 - ci (CI Engineer)

**Reads:** `## Developer Implementation` (required)

**Runs (read-only):** `npm test`, `npm run build`, `npm run lint`, `npx tsc --noEmit`

**Produces:** `## CI Review` in shared memory:
- Pipeline status table: each check as [PASS] passed / [FAIL] failed / [WARN] not configured - with exact error output for failures
- Test coverage gaps: changed files with no corresponding test file
- Configuration quality: `package.json` scripts, `tsconfig.json` strict mode, CI config presence
- Deployment readiness: conventional commit check, breaking changes, version bump need
- Top 3 CI recommendations ordered by impact
- Overall status: `[PASS] RELEASABLE` or `[FAIL] NOT RELEASABLE`

**Stops with `## Blockers` if:** `## Developer Implementation` is missing or contains no commit hash.

---

### Step 6 - sr (Security Reviewer)

**Reads:** `## Developer Implementation` (required), inspects changed files directly

**Produces:** `## Security Audit` in shared memory:
- Findings by severity (Critical / High / Medium / Low), each with `file:line`, impact, and concrete fix
- Release recommendation: `[PASS] SAFE TO RELEASE` / `[WARN] RELEASE WITH MITIGATIONS` / `[FAIL] DO NOT RELEASE`

**Audits:** input validation, data leakage, command injection, subprocess safety, new dependencies, new attack surface.

**Stops with `## Blockers` if:** `## Developer Implementation` is missing.

---

### Step 7 - qa (Quality Manager)

**Reads:** all shared memory sections, inspects source files directly

**Produces:** `## QA Report` in shared memory:
- Quality scores (1–10) for: Code / Tests / Docs / Consistency / Overall
- Cross-check: each AC from `## PO Analysis` verified against implementation and review findings
- Any issue not raised by other agents, marked `[NEW] NEW FINDING`
- Top 3 recommendations ordered by impact, each with `file:line`
- Release recommendation: `[PASS] READY FOR RELEASE` / `[WARN] RELEASE WITH CAUTION` / `[FAIL] NOT READY`

---

### Final Review - po (teamReview)

**Reads:** all shared memory sections

**Produces:** `## PO Review` in shared memory:
- Per-AC verdict: `[PASS] Met` / `[FAIL] Not met` / `[WARN] Partially met` + one-sentence reason
- Overall status: `[PASS] ACCEPTED` / `[FAIL] REWORK NEEDED` / `[WARN] CONDITIONAL ACCEPT`
- If REWORK NEEDED: specific changes required with AC numbers and file references

**Rule:** If CI returns `[FAIL] NOT RELEASABLE`, Security returns `[FAIL] DO NOT RELEASE`, or QA returns `[FAIL] NOT READY`, the PO must conclude `[FAIL] REWORK NEEDED`.

---

## Output

All findings are written to: `.pi/team/team-memory.md`

The Developer additionally commits and pushes code to the repository.

---

## Completion Criteria

The workflow is complete when all of the following are present in shared memory:
- `## PO Analysis` - user story, ACs, priority
- `## UX Review` - interaction flow, language requirements, UX risks
- `## Architecture` - component design, API contracts, developer handoff
- `## Developer Implementation` - commit hash, AC checklist
- `## CI Review` - pipeline status and overall releasability
- `## Security Audit` - findings by severity and release recommendation
- `## QA Report` - quality scores and release recommendation
- `## PO Review` - per-AC verdict and overall status

---

## Failure Handling

- Any agent that encounters a missing required input writes `## Blockers` and stops. All subsequent agents wait until the blocker is resolved.
- If the Developer's tests fail, no commit is made. A `## Blockers` section is written and the workflow stops.
- If CI, Security, or QA returns a negative release recommendation, the PO Review still runs but must conclude `[FAIL] REWORK NEEDED`.
- A stopped workflow with a clear blocker is preferable to a completed workflow with hidden quality debt.

---

## Differences from /pr

| Aspect | /sprint | /pr |
|--------|---------|-----|
| PO analysis | [PASS] Included | [WARN] Requires prior `/analyze` |
| UX design | [PASS] Included | [FAIL] Skipped |
| Architecture | [PASS] Included | [WARN] Requires prior `/analyze` |
| CI pipeline check | [PASS] Included | [FAIL] Skipped |
| Security audit | [PASS] Included | [PASS] Included |
| QA assessment | [PASS] Included | [PASS] Included |
| PO final review | [PASS] Included | [PASS] Included |
| Best for | New features, significant changes | Bug fixes, refactors |
