//=============================================================================
// PortalActor - sits on a surface, teleports actors on Touch
//
// Implements the portal marker that detects pawns entering its collision
// volume and teleports them to the paired portal. Velocity is rotated using
// the axis-transform method to preserve direction relative to surface normals.
//=============================================================================
class PortalActor extends Actor;

// Identity
var byte       PortalType;             // 0=Blue, 1=Orange
var vector     SurfaceNormal;          // Normal of surface portal sits on (inward)

// Cross-reference
var PortalActor          PairedPortal; // The other portal in this pair
var PortalGunMutator     MutatorRef;   // Owning mutator

// Configuration
var float PortalRadius;                // Collision and visual radius
var float ExitOffset;                  // Distance from exit portal to place actors

// Effects
var class<Actor> TeleportEffectClass;  // Spawned at entry and exit on teleport
var sound        TeleportSound;        // Played when actor is teleported

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

simulated function PostBeginPlay()
{
    Super.PostBeginPlay();

    SetCollision(true, false, false);
    SetCollisionSize(PortalRadius, PortalRadius);

    if (Level.NetMode != NM_DedicatedServer)
        SpawnVisual();
}

simulated function Destroyed()
{
    // Unlink our paired portal's back-reference
    if (PairedPortal != None && !PairedPortal.bDeleteMe)
    {
        if (PairedPortal.PairedPortal == self)
            PairedPortal.PairedPortal = None;
    }

    // Notify the mutator so it clears its references
    if (MutatorRef != None && !MutatorRef.bDeleteMe)
    {
        if (MutatorRef.PortalBlue == self)
            MutatorRef.PortalBlue = None;
        if (MutatorRef.PortalOrange == self)
            MutatorRef.PortalOrange = None;
    }

    Super.Destroyed();
}

// ---------------------------------------------------------------------------
// Visual setup
// ---------------------------------------------------------------------------

simulated function SpawnVisual()
{
    local Actor Glow;

    // Spawn a single sprite-ball glow as the portal marker
    Glow = Spawn(class'Botpack.SpriteSmokePuff', self);
    if (Glow != None)
    {
        Glow.SetDrawScale(PortalRadius / 24.0);
        Glow.bUnlit = true;
        Glow.Style = STY_Translucent;
        Glow.LightType = LT_Steady;
        Glow.LightBrightness = 160;
        Glow.LightRadius = 6;
        Glow.LightSaturation = 255;

        if (PortalType == 0)          // Blue
            Glow.LightHue = 160;
        else                          // Orange
            Glow.LightHue = 32;
    }
}

// ---------------------------------------------------------------------------
// Touch handling
// ---------------------------------------------------------------------------

simulated function Touch(Actor Other)
{
    local Pawn P;

    if (Other == None || Other.bDeleteMe)
        return;

    // Only teleporting Pawns for now
    P = Pawn(Other);
    if (P == None)
        return;

    // Need a valid paired portal
    if (PairedPortal == None || PairedPortal.bDeleteMe)
        return;

    TeleportToucher(P);
}

simulated function TeleportToucher(Pawn P)
{
    local vector ExitLoc, ExitVel;

    if (P == None)
        return;

    // Calculate exit location in front of the paired portal surface
    ExitLoc = PairedPortal.Location + PairedPortal.SurfaceNormal * ExitOffset;

    // If exit is blocked, cancel teleport
    if (!IsExitClear(ExitLoc))
    {
        P.PlaySound(TeleportSound, SLOT_None, 0.5);
        return;
    }

    // Rotate velocity using axis-transform method
    ExitVel = ComputeExitVelocity(P.Velocity, SurfaceNormal, PairedPortal.SurfaceNormal);

    // Sanity clamp on extreme velocities
    if (VSize(ExitVel) > 2000.0)
        ExitVel = Normal(ExitVel) * 2000.0;

    // Perform the teleport
    P.SetLocation(ExitLoc);
    P.Velocity = ExitVel;
    P.SetRotation(P.Rotation); // keep facing direction unchanged

    // Effects
    if (TeleportEffectClass != None)
    {
        Spawn(TeleportEffectClass, , , Location, rotator(SurfaceNormal));
        Spawn(TeleportEffectClass, , , ExitLoc, rotator(PairedPortal.SurfaceNormal));
    }

    P.PlaySound(TeleportSound, SLOT_None, 1.0);
}

// ---------------------------------------------------------------------------
// Exit clearance check
// ---------------------------------------------------------------------------

function bool IsExitClear(vector TestLoc)
{
    local Actor HitActor;
    local vector HitLoc, HitNorm;

    // Trace a short distance outward from the exit portal surface
    HitActor = Trace(HitLoc, HitNorm,
                     TestLoc + PairedPortal.SurfaceNormal * 64.0,
                     TestLoc, false);

    // Blocked only if we hit something solid
    return (HitActor == None);
}

// ---------------------------------------------------------------------------
// Velocity rotation (axis-transform method)
// ---------------------------------------------------------------------------

function vector ComputeExitVelocity(vector EntryVelocity,
                                     vector EntryNormal,
                                     vector ExitPortalNormal)
{
    local vector EntryX, EntryY, EntryZ;
    local vector ExitX, ExitY, ExitZ;
    local vector LocalVel, ExitVel;
    local rotator EntryRot, ExitRot;

    // Validate normals are non-degenerate
    if (VSize(EntryNormal) < 0.9 || VSize(ExitPortalNormal) < 0.9)
    {
        // Fall back to preserving velocity magnitude and direction
        return EntryVelocity;
    }

    // Entry portal's local axes (normal points INTO the wall)
    EntryRot = rotator(EntryNormal);
    GetAxes(EntryRot, EntryX, EntryY, EntryZ);

    // Exit portal's local axes (we want outward normal for exit)
    ExitRot = rotator(-ExitPortalNormal);
    GetAxes(ExitRot, ExitX, ExitY, ExitZ);

    // Project entry velocity into entry portal's local space
    LocalVel.X = EntryVelocity dot EntryX;
    LocalVel.Y = EntryVelocity dot EntryY;
    LocalVel.Z = EntryVelocity dot EntryZ;

    // Transform back to world space using exit portal's axes
    ExitVel  = ExitX * LocalVel.X;
    ExitVel += ExitY * LocalVel.Y;
    ExitVel += ExitZ * LocalVel.Z;

    return ExitVel;
}

// ---------------------------------------------------------------------------
// Default properties
// ---------------------------------------------------------------------------

defaultproperties
{
    bCollideActors=True
    bBlockActors=False
    bBlockPlayers=False
    bHidden=False
    Physics=PHYS_None
    RemoteRole=ROLE_SimulatedProxy
    DrawType=DT_Sprite
    Style=STY_Translucent
    Texture=Texture'Engine.CircleTexture'
    DrawScale=0.75
    bUnlit=True

    PortalRadius=48.0
    ExitOffset=24.0

    TeleportEffectClass=Class'Botpack.PawnTeleportEffect'
    TeleportSound=Sound'UnrealShare.Eightball.BExplode'
}
