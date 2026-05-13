---
description: Lightweight workflow — analysis and planning only, no implementation
---

# Workflow: Analyze

**Purpose:** Understand a requirement and produce a PO-ready user story plus a concrete architectural direction — without writing or modifying any code.

**When to use:** Use this workflow when you need to assess scope, align on requirements, or plan architecture before committing to implementation. Use `/sprint` or `/pr` when you are ready to implement.

**Input:** `$@` — the raw requirement, feature description, or bug report passed as an argument.

---

## Execution

Run as a team with roles: `["po", "architect"]`

---

### Step 1 — po (Requirements Analysis)

**Reads:** raw input `$@`

**Produces:** `## PO Analysis` in shared memory, containing:
- User story in the format: `As a [specific role] I want [concrete feature] so that [measurable benefit]`
- 3–5 acceptance criteria (AC1–AC5), each verifiable as yes/no without additional context
- Priority: `HIGH` / `MEDIUM` / `LOW` with a one-sentence justification
- Out-of-scope items (at least 1–2, to prevent scope creep)

**Stops with `## Blockers` if:** the input `$@` is empty, too vague to write testable acceptance criteria, or contradictory.

---

### Step 2 — architect (Architecture Planning)

**Reads:** `## PO Analysis` from shared memory (required — stops with `## Blockers` if missing)

**Produces:** `## Architecture` in shared memory, containing:
- Component diagram (text-based, using `→` to show relationships)
- Data flow: step-by-step description of how data moves through the system, using concrete type names
- API design: function signatures and interfaces the Developer must implement
- Technology recommendations: each with version, reason, and rejected alternative
- Key architecture decisions: what was chosen, what was rejected, and why
- Technical risks: likelihood, impact, and mitigation per risk
- Developer handoff: recommended file structure, implementation order, and definition of done

**Stops with `## Blockers` if:** the PO Analysis is incomplete, or a requirement is technically impossible or contradictory.

---

## Output

All findings are written to: `.pi/team/team-memory.md`

No files are created, modified, or deleted outside of shared memory. No `git` operations are performed.

---

## Completion Criteria

The workflow is complete when:
- `## PO Analysis` is present with a user story, 3–5 ACs, and priority
- `## Architecture` is present with component design, API contracts, and a developer handoff section
- No source code has been changed

---

## Failure Handling

- If `$@` is missing or too vague, the `po` agent writes `## Blockers` and the workflow stops. Provide a clearer requirement and re-run.
- If the `architect` agent finds the requirements technically impossible or contradictory, it writes `## Blockers` describing the conflict. The PO must revise the requirements before the architect continues.
- If the feature is entirely new (no existing code affected), the architect notes this explicitly and describes what needs to be created from scratch.
