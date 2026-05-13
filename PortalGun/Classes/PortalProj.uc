//=============================================================================
// PortalProj - projectile fired by PortalGun, places portal on impact
//
// This lightweight projectile flies to the point of impact and delegates
// portal creation to the PortalGunMutator. It deals no damage and carries
// the portal type (blue/orange) to the impact site.
//=============================================================================
class PortalProj extends Projectile;

var byte   PortalType;        // 0=Blue, 1=Orange
var vector PortalColor;       // RGB tint for visual trail
var float  ProjLifeSpan;      // Maximum travel time before self-destruct

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

simulated function PostBeginPlay()
{
    Super.PostBeginPlay();

    // Color the projectile based on portal type
    if (PortalType == 0)
    {
        PortalColor = vect(0.0, 0.0, 1.0);   // Blue
        LightHue = 160;
    }
    else
    {
        PortalColor = vect(1.0, 0.5, 0.0);   // Orange
        LightHue = 32;
    }

    LightType = LT_Steady;
    LightBrightness = 192;
    LightSaturation = 255;
    LightRadius = 4;

    // Safety timeout so projectiles don't fly forever
    LifeSpan = ProjLifeSpan;
}

// ---------------------------------------------------------------------------
// Impact handling
// ---------------------------------------------------------------------------

simulated function HitWall(vector HitNormal, Actor Wall)
{
    // Wall hit: place portal at the impact site
    Explode(Location, HitNormal);
}

simulated function Explode(vector HitLocation, vector HitNormal)
{
    local PortalGunMutator Mut;

    // Ignore invalid surfaces
    if (HitNormal == vect(0,0,0))
    {
        Destroy();
        return;
    }

    // Reject placement in sky zones
    if (Region.Zone != None && Region.Zone.bSkyZone)
    {
        PlaySound(ImpactSound, SLOT_None, 0.5);
        Spawn(class'Botpack.SpriteSmokePuff');
        Destroy();
        return;
    }

    // Find the PortalGunMutator in the mutator chain
    Mut = FindMutator();
    if (Mut != None)
    {
        // Offset the portal slightly away from the surface to prevent Z-fighting
        Mut.PlacePortal(PortalType, HitLocation + HitNormal * 4.0, HitNormal);
    }

    // Spawn a small impact effect
    if (Level.NetMode != NM_DedicatedServer)
        SpawnImpactEffect(HitLocation, HitNormal);

    Destroy();
}

// ---------------------------------------------------------------------------
// Mutator lookup
// ---------------------------------------------------------------------------

simulated function PortalGunMutator FindMutator()
{
    local Mutator M;

    if (Level.Game == None || Level.Game.BaseMutator == None)
        return None;

    M = Level.Game.BaseMutator;
    while (M != None)
    {
        if (PortalGunMutator(M) != None)
            return PortalGunMutator(M);
        M = M.NextMutator;
    }
    return None;
}

// ---------------------------------------------------------------------------
// Visual helpers
// ---------------------------------------------------------------------------

simulated function SpawnImpactEffect(vector HitLocation, vector HitNormal)
{
    local Actor Spark;

    Spark = Spawn(class'Botpack.SpriteSmokePuff', , , HitLocation, rotator(HitNormal));
    if (Spark != None)
    {
        Spark.DrawScale = 0.3;
        Spark.bUnlit = true;
        Spark.Style = STY_Translucent;

        if (PortalType == 0)
            Spark.LightHue = 160;
        else
            Spark.LightHue = 32;

        Spark.LightBrightness = 200;
        Spark.LightType = LT_Steady;
    }
}

// ---------------------------------------------------------------------------
// Tick - visual trail
// ---------------------------------------------------------------------------

simulated function Tick(float DeltaTime)
{
    local Actor Trail;

    Super.Tick(DeltaTime);

    if (Level.NetMode == NM_DedicatedServer)
        return;

    // Spawn a small trailing particle periodically
    if (Frand() < 0.3)
    {
        Trail = Spawn(class'Botpack.SpriteSmokePuff', , , Location, Rotation);
        if (Trail != None)
        {
            Trail.DrawScale = 0.15;
            Trail.bUnlit = true;
            Trail.Style = STY_Translucent;
            Trail.LightHue = LightHue;
            Trail.LightBrightness = 128;
            Trail.LightType = LT_Steady;
        }
    }
}

// ---------------------------------------------------------------------------
// Default properties
// ---------------------------------------------------------------------------

defaultproperties
{
    bNetTemporary=False
    bNetOptional=True
    RemoteRole=ROLE_SimulatedProxy

    Speed=1000.0
    MaxSpeed=1200.0
    Damage=0.0
    MomentumTransfer=0
    bBounce=False
    bDeleteMe=True

    ProjLifeSpan=5.0

    ImpactSound=Sound'BotPack.Enforcer.ShootAlt'

    DrawType=DT_Sprite
    Style=STY_Translucent
    Texture=Texture'Engine.CircleTexture'
    DrawScale=0.25
    bUnlit=True

    LightType=LT_Steady
    LightBrightness=192
    LightHue=160
    LightSaturation=255
    LightRadius=4

    bAlwaysRelevant=True
    bReplicateInstigator=True
}
