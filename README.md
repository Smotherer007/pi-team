# pi-team – Team Agent Orchestration for pi

Eine Pi-Extension, die ein **Team von KI-Agenten** mit rollenbasierten Profilen, gemeinsamem Gedächtnis und hierarchischer Ausführungsreihenfolge orchestriert.

## Konzept

```
Du (Tech Lead)
  │
  ├── PO (Product Owner)        – Anforderungsanalyse, User Stories
  ├── Scout (Code Scout)         – Codebase-Recherche
  ├── Senior-Dev                 – Implementierung, Architektur
  └── Reviewer                   – Code Review, Qualität
```

- **Profile** definieren Rolle, Modell, Tools, maxTurns, System-Prompt
- **reportsTo** legt die Ausführungsreihenfolge fest (PO → Dev → Reviewer)
- **Shared Memory** (`.pi/team-memory.md`) ist das gemeinsame Gedächtnis
- **DoD** (Definition of Done) trackt den Fortschritt
- **maxTurns** verhindert Endlos-Loops

## Installation

```bash
# Extension verlinken
mkdir -p ~/.pi/agent/extensions/pi-team
ln -sf ~/Documents/workspaces/pi-team/src/index.ts ~/.pi/agent/extensions/pi-team/index.ts
ln -sf ~/Documents/workspaces/pi-team/src/discovery.ts ~/.pi/agent/extensions/pi-team/discovery.ts
ln -sf ~/Documents/workspaces/pi-team/src/memory.ts ~/.pi/agent/extensions/pi-team/memory.ts
ln -sf ~/Documents/workspaces/pi-team/src/planner.ts ~/.pi/agent/extensions/pi-team/planner.ts
ln -sf ~/Documents/workspaces/pi-team/src/runner.ts ~/.pi/agent/extensions/pi-team/runner.ts
ln -sf ~/Documents/workspaces/pi-team/src/orchestrator.ts ~/.pi/agent/extensions/pi-team/orchestrator.ts
ln -sf ~/Documents/workspaces/pi-team/src/format.ts ~/.pi/agent/extensions/pi-team/format.ts
ln -sf ~/Documents/workspaces/pi-team/src/renderer.ts ~/.pi/agent/extensions/pi-team/renderer.ts
ln -sf ~/Documents/workspaces/pi-team/src/types.ts ~/.pi/agent/extensions/pi-team/types.ts

# Profile installieren
mkdir -p ~/.pi/agent/team/profiles
ln -sf ~/Documents/workspaces/pi-team/profiles/po.md ~/.pi/agent/team/profiles/po.md
ln -sf ~/Documents/workspaces/pi-team/profiles/senior-dev.md ~/.pi/agent/team/profiles/senior-dev.md
ln -sf ~/Documents/workspaces/pi-team/profiles/reviewer.md ~/.pi/agent/team/profiles/reviewer.md
ln -sf ~/Documents/workspaces/pi-team/profiles/scout.md ~/.pi/agent/team/profiles/scout.md

# Workflow-Prompts installieren
mkdir -p ~/.pi/agent/prompts
ln -sf ~/Documents/workspaces/pi-team/workflows/sprint.md ~/.pi/agent/prompts/sprint.md
ln -sf ~/Documents/workspaces/pi-team/workflows/analyze.md ~/.pi/agent/prompts/analyze.md
```

## Verwendung

### Natürlichsprachlich

> Team: Analysiere die Auth-Module und mach einen Verbesserungsplan

> Team mit PO und Senior-Dev: Implementiere Zwei-Faktor-Authentifizierung

### Workflow-Prompts

> /sprint Implementiere OAuth-Login

> /analyze Finde alle Sicherheitslücken im Auth-Code

### Gezielte Rollen

> Nur den Reviewer auf den letzten Commit ansetzen

## Profil-Format

```markdown
---
role: meinde                     # Eindeutige ID
displayName: Mein Developer       # Anzeigename
reportsTo: po                     # Wem berichtet diese Rolle?
model: claude-sonnet-4-5          # Modell
tools: read, write, edit, bash    # Erlaubte Tools
maxTurns: 10                      # Max LLM-Runden (Loop-Schutz)
---

System-Prompt für den Agenten...
```

### reportsTo-Hierarchie

```
po (reportsTo: null)          ← startet zuerst
  ├── scout (reportsTo: po)   ← nach PO
  └── senior-dev (reportsTo: po)
        └── reviewer (reportsTo: senior-dev)  ← zuletzt
```

Nur Rollen mit `reportsTo: null` sind Top-Level. Alle anderen laufen nach ihrem Vorgesetzten.

## Shared Memory

Die Datei `.pi/team-memory.md` im Projektverzeichnis:

```markdown
# Team Memory

## Task: OAuth-Login implementieren

## DoD
- [x] po: Analyse + User Stories
- [ ] senior-dev: Implementierung
- [ ] reviewer: Review ohne Critical Issues

---

## po
User Story: Als Nutzer will ich mich mit Google anmelden...
```

Jeder Agent liest das Memory vor der Ausführung und schreibt seine Ergebnisse hinein.

## Architektur

```
src/
├── types.ts          # Alle Datentypen (readonly, keine Klassen)
├── discovery.ts      # Profil-Ladung aus .md-Dateien
├── planner.ts        # buildExecutionPlan (pure function)
├── memory.ts         # Shared Memory Operationen
├── runner.ts         # Agent-Subprozess (spawn + stream + maxTurns)
├── orchestrator.ts   # executeTeam (Pipeline)
├── format.ts         # Formatierungsfunktionen (pure)
├── renderer.ts       # TUI-Rendering
└── index.ts          # Extension-Einstieg, Tool-Registrierung
```

### Clean Code Prinzipien

- **Data-Oriented Programming:** Alle Daten sind plain immutable records, keine Klassen
- **Pure Functions:** Planner, Formatter – alle pure; nur Runner und Memory haben I/O
- **Single Responsibility:** Jedes Modul macht genau eine Sache
- **Keine Vererbung:** Keine Klassenhierarchien, nur Types + Functions

## Sicherheit

- **User-Profiles** aus `~/.pi/agent/team/profiles/` sind immer aktiv
- **Project-Profiles** aus `.pi/team/profiles/` erfordern Bestätigung
- Jeder Agent läuft als isolierter `pi`-Subprozess mit eigenem Context-Window
- `maxTurns` verhindert Endlos-Loops pro Agent

## Beispiel: Kompletter Sprint

1. **PO** analysiert die Anforderung → schreibt User Stories ins Memory
2. **Scout** durchsucht die Codebase → dokumentiert relevante Dateien
3. **Senior-Dev** implementiert → schreibt Änderungen ins Memory
4. **Reviewer** prüft den Code → gibt strukturiertes Feedback

Alle Ergebnisse landen in `.pi/team-memory.md` – eine vollständige Projektdokumentation.
