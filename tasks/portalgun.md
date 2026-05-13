---
roles:
  - po
  - ux
  - architect
  - dev
model: deepseek-v4-pro
teamReview: true
---

# Portal Gun Mutator für Unreal Tournament 99

Entwickle einen **Portal Gun Mutator** für UT99 (UnrealScript, Unreal Engine 1), der dem Spieler eine Waffe gibt, mit der er zwei Portale platzieren kann — ähnlich dem Konzept aus Portal/Portal 2, angepasst an die UT99-Mechaniken und -Engine.

## Kernidee
- Eine neue Waffe (ersetzt z. B. den Redeemer oder kommt als Zusatzwaffe) mit zwei Feuermodi:
  - **Primary Fire**: Platziert Portal A (z. B. blau/orange)
  - **Secondary Fire**: Platziert Portal B
- Portale werden an Wänden/Decken/Böden platziert (wo die Kugel einschlägt)
- Wenn ein Spieler, Bot oder Projektil in ein Portal läuft/fliegt, kommt es am anderen Portal wieder heraus (mit gleicher Geschwindigkeit und Richtung relativ zur Portal-Oberfläche)
- Maximal 2 Portale gleichzeitig — ein neues überschreibt das alte desselben Typs
- Portale sind optisch erkennbar (farbige Textur/Effekt)

## Technischer Kontext
- **Sprache**: UnrealScript (UT99 / Unreal Engine 1)
- **Plattform**: UT99 v436 oder v469
- **Dateien**: `.u` Packages (kompiliert aus `.uc` UnrealScript)
- Portale können über `WarpZoneInfo` oder per `Touch`-Event + `SetLocation` realisiert werden
- UT99 hat kein natives Portal-System wie spätere Engines — es muss kreativ gelöst werden

## Anforderungen im Detail

### Waffe
- Neue Waffenklasse (z. B. `PortalGun`), abgeleitet von `TournamentWeapon`
- Primary/Secondary Fire feuern Projektil ab, das beim Aufprall ein Portal öffnet
- Visuelle Rückmeldung beim Schießen (Muzzle Flash, Sound)

### Portale
- Zwei Portal-Typen (Entry/Exit oder A/B), optisch unterscheidbar
- Portale sind Actor-Instanzen, die `Touch`-Events verarbeiten
- Spieler/Bot der ein Portal betritt, wird zum anderen Portal teleportiert
- Geschwindigkeitsvektor wird entsprechend rotiert (Ein/Ausgangs-Orientierung)
- Projektile können ebenfalls durch Portale fliegen

### Mutator-Integration
- Als standard UT99-Mutator lauffähig (`Mutator`-Basisklasse)
- In der Mutator-Liste auswählbar
- Konfigurierbar: Portal ersetzt Welche Waffe? Portale zeitlich begrenzt?
- Funktioniert mit Bots (Bots sollten zumindest nicht abstürzen)

### UX / HUD
- Kleines HUD-Icon für die Portal Gun
- Anzeige welche Portale aktiv sind (z. B. kleine Indikatoren)
- Ammo-Anzeige (begrenzte Portal-Platzierungen oder unendlich)

## Abnahmekriterien
1. Mutator kompiliert fehlerfrei mit `ucc make`
2. Im Spiel als Mutator auswählbar und aktivierbar
3. Primary Fire platziert blaues Portal, Secondary Fire platziert orangenes Portal
4. Spieler wird korrekt zwischen Portalen teleportiert (Geschwindigkeit + Richtung bleibt relativ erhalten)
5. Nur zwei Portale gleichzeitig existent
6. Bots stürzen nicht ab (Basis-Kompatibilität)
7. Mindestens ein funktionierender Sound-Effekt pro Aktion

## Scope
- **Phase 1 (dieser Task)**: Funktionierender Basis-Mutator mit Kernmechanik
- Später optional: Bot-KI für Portale, grafische Portal-Texturen, Projektil-Durchgang, Konfigurationsmenü
