# pi-team Extension – Anforderungsdokument

## Vision

Eine Pi-Extension, die ein **Team von KI-Agenten** orchestriert. Jeder Agent hat ein Profil (Rolle, Modell, Tools, Verantwortung) und arbeitet mit eigenen Kontext, aber liest/schreibt in ein gemeinsames **Shared Memory** (Markdown-Datei). Eine `reportsTo`-Hierarchie definiert die Ausführungsreihenfolge.

---

## Datenmodell (Data-Oriented)

Alle Daten sind **plain immutable records** – keine Klassen, keine Vererbung, keine versteckten States.

### ProfileConfig

```typescript
type ProfileConfig = {
  readonly role: string;            // Eindeutige Rollen-ID, z.B. "po", "senior-dev"
  readonly displayName: string;     // Anzeigename, z.B. "Product Owner"
  readonly reportsTo: string | null; // Rolle des Vorgesetzten, null = Top-Level
  readonly model: string;           // Modell-ID, z.B. "claude-sonnet-4-5"
  readonly tools: readonly string[]; // Erlaubte Tools
  readonly maxTurns: number;        // Max LLM-Runden (Loop-Schutz)
  readonly systemPrompt: string;    // Rollen-Prompt (Markdown-Body ohne Frontmatter)
  readonly source: "user" | "project"; // Herkunft des Profils
  readonly filePath: string;        // Pfad zur .md-Datei
};
```

### Task

```typescript
type Task = {
  readonly description: string;     // Aufgabenbeschreibung
  readonly assignedRole: string;    // Welche Rolle führt aus
  readonly priority: number;        // Prio (niedriger = wichtiger)
  readonly status: "pending" | "running" | "done" | "failed";
};
```

### AgentResult

```typescript
type AgentResult = {
  readonly role: string;
  readonly task: string;
  readonly exitCode: number;
  readonly finalOutput: string;
  readonly usage: UsageStats;
  readonly messages: readonly Message[];
  readonly stderr: string;
  readonly stopReason?: string;
  readonly errorMessage?: string;
};

type UsageStats = {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly cost: number;
  readonly tokens: number;
  readonly turns: number;
};
```

### SharedMemory

Das Shared Memory ist eine **Markdown-Datei** (`.pi/team-memory.md`) mit definierten Sektionen:

```markdown
# Team Memory

## Task: <Beschreibung>
Gestartet: <Timestamp>

## DoD (Definition of Done)
- [ ] PO: Analyse + User Stories
- [ ] Senior-Dev: Implementierung
- [ ] Reviewer: Code Review ohne Critical Issues

---

## PO Analyse
<!-- Automatisch von PO-Agent geschrieben -->
...

## Senior-Dev Implementierung
<!-- Automatisch von Dev-Agent geschrieben -->
...

## Reviewer Feedback
<!-- Automatisch von Reviewer-Agent geschrieben -->
...
```

Operationen auf Shared Memory sind **reine Funktionen**:

```typescript
type MemoryOps = {
  read: () => string;                              // Liest gesamtes Memory
  appendSection: (role: string, content: string) => void; // Hängt Sektion an
  getDoD: () => readonly DoDItem[];                 // Liest DoD
  checkDoD: (role: string) => void;                 // Markiert Rolle als done
};

type DoDItem = {
  readonly role: string;
  readonly description: string;
  readonly done: boolean;
};
```

---

## Ausführungslogik (Pure Functions)

### Team Orchestrator

Die Kernlogik ist eine Pipeline aus puren Funktionen:

```
Task-Beschreibung
  │
  ▼
buildExecutionPlan(profiles, task)
  → readonly Task[]    // Baut Plan basierend auf reportsTo-Hierarchie
  │
  ▼
executePlan(tasks, profiles, sharedMemory, signal)
  → readonly AgentResult[]  // Führt Tasks sequentiell aus
  │
  ▼
formatTeamOutput(results)
  → ToolResult       // Für Pi's Tool-Interface
```

### Plan-Building (reine Funktion)

```typescript
function buildExecutionPlan(
  profiles: readonly ProfileConfig[],
  taskDescription: string
): readonly Task[] {
  // 1. Finde Wurzel (reportsTo: null) → PO
  // 2. Baue Baum via reportsTo
  // 3. Flache zu sequentieller Liste (Tiefensuche)
  // 4. Priorisiere: 0 = Root, 1 = direkte Reports, ...
}
```

**Regel:** Agenten mit `reportsTo` werden NACH ihrem Vorgesetzten ausgeführt. Kein Ping-Pong.

### Agent Runner (pure function + side effects am Rand)

```typescript
async function runAgent(
  profile: ProfileConfig,
  task: string,
  sharedMemory: string,     // Aktueller Memory-Inhalt
  signal: AbortSignal
): Promise<AgentResult> {
  // 1. Baue Prompt aus Profil + Task + Shared Memory
  // 2. Spawne pi-Prozess mit --mode json -p --no-session
  // 3. Parse JSON-Line-Stream
  // 4. Tracke Turns → wenn maxTurns erreicht: SIGTERM
  // 5. Extrahiere finales Output
  // 6. Schreibe Output ins Shared Memory
}
```

### Loop-Schutz (maxTurns)

- **Nicht** der Main-Orchestrator zählt Runden.
- Der **Subprozess selbst** hat `--max-turns` (falls Pi das supported) oder der Spawner zählt `message_end` Events und killt bei Überschreitung.
- Failsafe: Nach `maxTurns * 30s` ein totaler Timeout.

---

## Profil-Dateien

### Format (Markdown + YAML Frontmatter)

```markdown
---
role: po
displayName: Product Owner
reportsTo: null
model: claude-sonnet-4-5
tools: read, grep, find, ls
maxTurns: 5
---

Du bist der Product Owner des Teams. Deine Aufgaben:

1. Analysiere die Anforderung aus dem Shared Memory
2. Schreibe User Stories mit Akzeptanzkriterien
3. Definiere die Definition of Done
4. Dokumentiere alles im Shared Memory unter "## PO Analyse"

Arbeite strukturiert und präzise. Keine Implementierung – das macht der Senior Developer.

**Wichtig:** Nach deiner Analyse ist dein Job erledigt. Formuliere klar,
was der nächste Agent (Senior-Dev) tun soll.
```

### Speicherorte

| Scope | Pfad |
|-------|------|
| User (global) | `~/.pi/agent/team/profiles/*.md` |
| Project (repo) | `.pi/team/profiles/*.md` |

Project-Profiles überschreiben User-Profiles bei gleicher `role`.

---

## Tool-Interface (Pi-Extension)

### Registriertes Tool: `team`

```typescript
// Aufruf durch LLM:
team({
  task: "Implementiere OAuth-Login",
  roles: ["po", "senior-dev", "reviewer"],  // Optional, sonst alle
  model: "claude-haiku-4-5"                 // Optional, override global
})
```

### Rendering

- **Collapsed:** Status-Icons pro Rolle + Usage-Summary
- **Expanded (Ctrl+O):** Komplettes Shared Memory als Markdown + Einzelergebnisse

---

## Dateistruktur

```
pi-team/src/
├── types.ts          # Alle readonly-Types (ProfileConfig, Task, AgentResult, ...)
├── discovery.ts      # Profil-Discovery (liest .md-Dateien, parst Frontmatter)
├── memory.ts         # Shared Memory Operationen (read, appendSection, parseDoD)
├── planner.ts        # buildExecutionPlan (pure function)
├── runner.ts         # runAgent (spawn + stream + maxTurns enforcement)
├── orchestrator.ts   # executePlan (sequentiell, Memory-Updates)
├── renderer.ts       # renderCall + renderResult (TUI-Darstellung)
├── format.ts         # formatUsageStats, formatToolCall, formatTokens
└── index.ts          # Extension-Entry: pi.registerTool("team", ...)

pi-team/profiles/     # Beispiel-Profile (werden nach ~/.pi/agent/team/ verlinkt)
├── po.md
├── senior-dev.md
├── reviewer.md
└── scout.md

pi-team/workflows/    # Prompt-Templates
└── sprint.md
```

---

## Abgrenzung: Was wir NICHT bauen

- **Kein** paralleler Modus (erstmal nur sequentiell via reportsTo)
- **Kein** RPC-Modus (Subprozess per spawn ist gut genug)
- **Kein** dynamisches Nachsteuern (One-Shot pro Agent, kein Dialog)
- **Keine** Echtzeit-Kollaboration (Agenten laufen strikt nacheinander)

---

## Clean Code Prinzipien

1. **Single Responsibility:** Jede Datei macht genau eine Sache
2. **Pure Functions:** Plan-Building, Formatting – alles pure
3. **Side Effects isoliert:** Nur `runner.ts` und `memory.ts` haben I/O
4. **Data Validation:** Typebox-Schemas an den Systemgrenzen
5. **No Classes:** Nur Types + Functions (DOP)
6. **Immutability:** Alle Daten sind `readonly`
7. **Naming:** Aussagekräftig, keine Abkürzungen außer "DoD"

---

## Nächste Schritte

1. `types.ts` – Datentypen definieren
2. `discovery.ts` – Profil-Ladung + Parsing
3. `memory.ts` – Shared Memory Funktionen
4. `planner.ts` – buildExecutionPlan
5. `runner.ts` – runAgent
6. `orchestrator.ts` – executePlan
7. `format.ts` + `renderer.ts` – Darstellung
8. `index.ts` – Tool-Registrierung
9. Beispiel-Profile + Workflow-Prompts
