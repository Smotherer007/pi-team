---
roles:
  - po
  - ux
  - architect
  - dev
model: deepseek-v4-pro
teamReview: true
---

> 💡 This is the **example task** for pi-team. Use it as a reference for creating your own task files or as a first test run.

# Portal Gun Mutator for Unreal Tournament 99

Develop a **Portal Gun Mutator** for UT99 (UnrealScript, Unreal Engine 1) that gives the player a weapon capable of placing two portals — similar to the concept from Portal/Portal 2, adapted to UT99 mechanics and engine constraints.

## Core Idea
- A new weapon (replaces e.g. the Redeemer or added as an extra weapon) with two fire modes:
  - **Primary Fire**: Places Portal A (e.g. blue)
  - **Secondary Fire**: Places Portal B (e.g. orange)
- Portals are placed on walls/ceilings/floors where the projectile impacts
- When a player, bot, or projectile enters one portal, they exit from the other portal (preserving speed and direction relative to the portal surface)
- Maximum 2 portals at any time — placing a new one of the same type overwrites the old one
- Portals are visually distinct (colored texture/effect)

## Technical Context
- **Language**: UnrealScript (UT99 / Unreal Engine 1)
- **Platform**: UT99 v436 or v469
- **Files**: `.u` packages (compiled from `.uc` UnrealScript sources)
- Portals can be implemented via `WarpZoneInfo` or `Touch` event + `SetLocation`
- UT99 has no native portal system like later engines — a creative solution is required

## Detailed Requirements

### Weapon
- New weapon class (e.g. `PortalGun`), subclass of `TournamentWeapon`
- Primary/Secondary Fire each launch a projectile that opens a portal on impact
- Visual feedback when firing (muzzle flash, sound)

### Portals
- Two portal types (A/B), visually distinguishable (blue/orange)
- Portals are Actor instances that handle `Touch` events
- Player/bot touching a portal is teleported to the other portal
- Velocity vector is rotated according to portal surface orientation (entry → exit)
- Projectiles can also pass through portals

### Mutator Integration
- Works as a standard UT99 mutator (`Mutator` base class)
- Selectable in the mutator list
- Configurable: which weapon does the portal gun replace? Should portals expire after a time limit?
- Compatible with bots (bots should at minimum not crash)

### UX / HUD
- Small HUD icon for the Portal Gun
- Indicator showing which portals are currently active (e.g. small status icons)
- Ammo display (limited portal placements or infinite)

## Acceptance Criteria
1. Mutator compiles without errors via `ucc make`
2. Selectable and activatable as a mutator in-game
3. Primary Fire places the blue portal, Secondary Fire places the orange portal
4. Player is correctly teleported between portals (velocity and direction preserved relative to surface)
5. Only two portals exist simultaneously
6. Bots do not crash (baseline compatibility)
7. At least one working sound effect per action

## Scope
- **Phase 1 (this task)**: Working base mutator with core mechanic
- Optional later: bot AI for portal usage, graphical portal textures, full projectile passthrough, configuration menu
