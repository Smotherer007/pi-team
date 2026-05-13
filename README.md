# pi-team — Sprint-Team Extension für pi

**pi-team** ist eine pi-Erweiterung, die auf [`pi-subagents`](https://github.com/nicobailon/pi-subagents) aufbaut.  
Sie bringt **Rollen‑Profile**, **Sprint‑Phasen**, **Shared Memory** und `/team‑start`‑Kommandos mit.

> pi-subagents übernimmt das Agenten‑Spawnen und Chain‑Management.  
> pi‑team stellt den Sprint‑Workflow und die Team‑Infrastruktur bereit.

## Konzept

```
PO (Product Owner)
  ├── UX Designer          – Interaction Flow, Sprache, Layout
  ├── Software Architect   – Systemdesign, API‑Verträge, Technologie‑Entscheidungen
  └── Developer            – Implementierung, Tests, Commit + Push
        ├── CI Engineer       – Build, Test‑Suite, Deployment‑Check
        ├── Security Reviewer – Sicherheits‑Audit, Data Safety
        └── Quality Manager   – Ganzheitlicher Quality Score 1–10
```

- **7 Profile** als Markdown‑Dateien (pi‑subagents‑kompatibel)
- **sprint.json** definiert 8 Phasen (requirements → design → architecture → implementation → ci → security → quality → review)
- **Shared Memory** (`.pi/team/team-memory.md`) trägt Kontext zwischen Agenten
- **`/team-start`**, **`/team-status`**, **`/team-result`** Kommandos

## Abhängigkeiten

```json
"dependencies": {
  "pi-subagents": "^0.24.0"
}
```

pi‑subagents muss zusätzlich als pi‑Package registriert sein (in `~/.pi/agent/settings.json`):

```json
"packages": [
  "npm:pi-subagents",
  …
]
```

## Profile

Profile liegen im pi‑subagents‑Format unter `.pi/agents/team/` (Projekt) oder `~/.pi/agent/agents/team/` (User):

| Agent | Rolle | Model | Tools |
|-------|-------|-------|-------|
| `po` | Product Owner | deepseek‑v4‑flash | read, write, edit, grep, find, ls, bash, web_fetch |
| `ux` | UX Designer | deepseek‑v4‑pro | read, write, edit, grep, find, ls, bash, web_fetch |
| `architect` | Software Architect | deepseek‑v4‑pro | read, write, edit, grep, find, ls, bash, web_fetch |
| `dev` | Developer | deepseek‑v4‑flash | read, write, edit, bash, grep, find, ls, web_fetch |
| `ci` | CI Engineer | deepseek‑v4‑pro | read, write, edit, bash, grep, find, ls, web_fetch |
| `sr` | Security Reviewer | deepseek‑v4‑pro | read, write, edit, bash, grep, find, ls, web_fetch |
| `qa` | Quality Manager | deepseek‑v4‑pro | read, write, edit, bash, grep, find, ls, web_fetch |

Jedes Profil hat `defaultReads: .pi/team/team-memory.md` — dadurch liest jeder Agent automatisch das Shared Memory.

## Sprint‑Phasen (`sprint.json`)

```text
requirements → design → architecture → implementation → ci‑check → security → quality → review
```

Jede Phase definiert: `id`, `role`, `title`, `description`, `steps`.

## Kommandos

| Kommando | Beschreibung |
|----------|-------------|
| `/team-start <file.md>` | Sprint starten: Task parsen, Memory initialisieren, Chain ans LLM senden |
| `/team-status` | Fortschritt des Teams im Shared Memory anzeigen |
| `/team-result` | Komplettes Shared Memory im Editor öffnen |

### Ablauf `/team-start`

1. Task‑Datei parsen (Frontmatter + Body)
2. `sprint.json` laden, Phasen filtern (falls `roles` angegeben)
3. `.pi/team/team-memory.md` initialisieren (Task + DoD‑Checkliste)
4. Dem LLM einen Prompt senden: „Nutze `subagent`‑Tool mit Chain‑Mode“
5. LLM ruft `subagent({ chain: [{ agent: "po", … }, …] })` auf
6. pi‑subagents führt die Agenten **sequentiell** aus
7. Jeder Agent liest/schreibt `team-memory.md` → nächster Agent sieht den aktuellen Stand
8. `/team-status` zeigt den Live‑Fortschritt

## Task‑Datei Format

```markdown
---
roles: po,ux,architect,dev,ci,sr,qa
cwd: ../mein-projekt
---

Implementiere einen OAuth‑Login für die REST‑API.
```

### Beispiel‑Task

Siehe [`tasks/portalgun.md`](tasks/portalgun.md) — ein Portal‑Gun‑Mutator für Unreal Tournament 99.

```
/team-start tasks/portalgun.md
```

## Shared Memory

Datei: `.pi/team/team-memory.md`

Jeder Agent …
1. liest das Memory beim Start (via `defaultReads`)
2. hängt seine Sektion an: `## PO Analysis`, `## UX Review`, `## Architecture`, …
3. der nächste Agent sieht alle vorherigen Sektionen

## Architektur

```text
src/
├── index.ts          – Extension Entry, /team‑start, /team‑status, /team‑result
├── (runner.ts)       – [weggefallen] → ersetzt durch pi‑subagents
├── (orchestrator.ts) – [weggefallen] → ersetzt durch pi‑subagents Chain
├── (planner.ts)      – [weggefallen]
├── (discovery.ts)    – [weggefallen]
├── (types.ts)        – [weggefallen]
├── (format.ts)       – [weggefallen]
├── (renderer.ts)     – [weggefallen]
├── (instructions.ts) – [weggefallen]
└── (memory.ts)       – [weggefallen]
```

```text
profiles/            – Agent‑Profile (pi‑subagents‑Format)
sprint.json          – Sprint‑Phasen
workflows/           – Prompt‑Templates
tasks/               – Beispiel‑Tasks
```

Die bisherigen Module (`runner`, `orchestrator`, …) sind **nicht mehr nötig**, weil pi‑subagents das Agenten‑Management vollständig übernimmt.  
pi‑team ist jetzt eine **dünne Orchestrierungsschicht**: Task → Memory → Chain‑Prompt.

## Installation

```bash
# 1. pi‑subagents als pi‑Package registrieren
pi install npm:pi-subagents

# 2. pi‑team aus lokalem Pfad installieren
pi install /pfad/zu/pi-team
```

Profile und Sprint werden automatisch aus dem Projektverzeichnis geladen (`.pi/agents/team/` und `.pi/team/sprint.json`).

Falls du die Profile global nutzen willst:

```bash
cp profiles/*.md ~/.pi/agent/agents/team/
cp sprint.json ~/.pi/agent/team/
```
