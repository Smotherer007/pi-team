# pi-team — Team Agent Orchestration for pi

A pi extension that orchestrates a **team of AI agents** with role-based profiles, shared memory, sprint phases, and structured handoffs between agents.

## Concept

```
PO (Product Owner)
  ├── UX Designer          — Interaction flow, language, layout
  ├── Software Architect   — System design, API contracts, technology choices
  └── Developer            — Implementation, tests, commit + push
        ├── CI Engineer       — Pipeline, build, test verification
        ├── Security Reviewer — Vulnerability audit, data safety
        └── Quality Manager   — Holistic quality score 1-10
```

- **7 profiles** defined as Markdown files with YAML frontmatter
- **sprint.json** defines 8 ordered phases (requirements → design → architecture → implementation → ci → security → quality → review)
- **Shared memory** (`.pi/team/team-memory.md`) carries context between agents
- **Background execution** — teams run non-blocking, results injected as follow-up
- **`/team-start`**, **`/team-status`**, **`/team-result`** commands
- **3 workflow prompts**: `/sprint`, `/pr`, `/analyze`

## Profiles

| Profile | Role | Model | reportsTo |
|---------|------|-------|-----------|
| `po.md` | Product Owner | deepseek-v4-flash | null |
| `ux.md` | UX Designer | deepseek-v4-pro | po |
| `architect.md` | Software Architect | deepseek-v4-pro | po |
| `dev.md` | Developer | deepseek-v4-pro | po |
| `ci.md` | CI Engineer | deepseek-v4-pro | dev |
| `security.md` | Security Reviewer (sr) | deepseek-v4-pro | dev |
| `qa.md` | Quality Manager | deepseek-v4-pro | dev |

Profiles are loaded from `~/.pi/agent/team/profiles/` (user) or `.pi/team/profiles/` (project).

## Sprint Phases (`sprint.json`)

```
requirements → design → architecture → implementation → ci-check → security → quality → review
```

Each phase defines: `id`, `role`, `title`, `description`, `steps`. Edit `~/.pi/agent/team/sprint.json` to customize.

## Commands

| Command | Description |
|---------|-------------|
| `/team-start <file.md>` | Start team from task file with frontmatter |
| `/team-status` | List all running and completed teams |
| `/team-result <id>` | Load full result into editor |

## Workflows

| Workflow | Roles | When to use |
|----------|-------|-------------|
| `/sprint` | po, ux, architect, dev, ci, sr, qa | New features, full quality gates |
| `/pr` | dev, sr, qa | Bug fixes, small changes |
| `/analyze` | po, architect | Requirements + architecture only |

## Task File Format

```markdown
---
roles: po,architect,dev,sr,qa
model: deepseek-v4-flash
teamReview: true
---

Fix timeout bugs in the IMAP client...
```

## Shared Memory

Written to `.pi/team/team-memory.md`. Each agent reads all previous sections and appends its own.

## Architecture

```
src/
├── types.ts          — All data types (readonly, no classes)
├── discovery.ts      — Profile loading from .md files
├── instructions.ts   — Sprint phase loader (reads sprint.json)
├── planner.ts        — buildExecutionPlan (topological sort by reportsTo)
├── memory.ts         — Shared memory CRUD operations
├── runner.ts         — Agent subprocess (spawn + stream + timeout)
├── orchestrator.ts   — executeTeam pipeline
├── format.ts         — Token/usage formatting utilities
├── renderer.ts       — TUI collapsed/expanded views
└── index.ts          — Extension entry, tool registration, commands
```

### Principles
- **Data-Oriented Programming**: All data as plain immutable records, no classes
- **Clean Code**: Single responsibility per module, pure functions, isolated side effects
- **No inheritance**: Only types + functions, composition over inheritance

## Installation

```bash
mkdir -p ~/.pi/agent/extensions/pi-team
for f in index.ts discovery.ts memory.ts planner.ts runner.ts orchestrator.ts format.ts renderer.ts types.ts instructions.ts; do
  ln -sf ~/Documents/workspaces/pi-team/src/$f ~/.pi/agent/extensions/pi-team/$f
done

mkdir -p ~/.pi/agent/team/profiles
for f in ~/Documents/workspaces/pi-team/profiles/*.md; do
  ln -sf "$f" ~/.pi/agent/team/profiles/$(basename "$f")
done

cp ~/Documents/workspaces/pi-team/sprint.json ~/.pi/agent/team/sprint.json

mkdir -p ~/.pi/agent/prompts
for f in ~/Documents/workspaces/pi-team/workflows/*.md; do
  ln -sf "$f" ~/.pi/agent/prompts/$(basename "$f")
done
```
