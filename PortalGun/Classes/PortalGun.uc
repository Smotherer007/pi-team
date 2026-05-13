//=============================================================================
// PortalGun - weapon with two fire modes for placing blue/orange portals
//
// Primary Fire: launches a PortalProj carrying PortalType=0 (blue)
// Secondary Fire: launches a PortalProj carrying PortalType=1 (orange)
//
// The PortalGun delegates portal placement to the PortalGunMutator, which
// manages portal lifecycle and pairing.
//=============================================================================
class PortalGun extends TournamentWeapon;

var() class<PortalProj> PortalProjectileClass;

// ---------------------------------------------------------------------------
// Fire modes
// ---------------------------------------------------------------------------

function Fire(float F)
{
    local PortalProj Proj;

    if (AmmoType != None && AmmoType.AmmoAmount < 1 && !bInfiniteAmmo)
        return;

    // If infinite ammo is enabled, ensure we always have at least 1 round
    if (bInfiniteAmmo && AmmoType != None && AmmoType.AmmoAmount < 1)
        AmmoType.AmmoAmount = 1;

    Proj = SpawnPortalProjectile(0);

    PlaySound(FireSound, SLOT_None, 1.0);
    GotoState('NormalFire');
    bPointing = True;
    bCanClientFire = True;
    ClientFire(F);
}

function AltFire(float F)
{
    local PortalProj Proj;

    if (AmmoType != None && AmmoType.AmmoAmount < 1 && !bInfiniteAmmo)
        return;

    if (bInfiniteAmmo && AmmoType != None && AmmoType.AmmoAmount < 1)
        AmmoType.AmmoAmount = 1;

    Proj = SpawnPortalProjectile(1);

    PlaySound(AltFireSound, SLOT_None, 1.0);
    GotoState('AltFire');
    bPointing = True;
    bCanClientFire = True;
    ClientAltFire(F);
}

// ---------------------------------------------------------------------------
// Projectile spawning
// ---------------------------------------------------------------------------

function PortalProj SpawnPortalProjectile(byte PortalType)
{
    local PortalProj Proj;
    local vector StartLoc;
    local rotator AimRot;

    StartLoc = Instigator.Location + Instigator.EyePosition();
    AimRot = Instigator.GetViewRotation();

    // Adjust aim for bot accuracy / player skill
    AimRot = AdjustAim(ProjectileSpeed, AimRot, 0.0, 0.0, StartLoc);

    Proj = PortalProj(Spawn(PortalProjectileClass, self, , StartLoc, AimRot));

    if (Proj != None)
    {
        Proj.PortalType = PortalType;
        Proj.Speed = ProjectileSpeed;
        Proj.MaxSpeed = ProjectileSpeed * 1.2;
        Proj.Velocity = vector(AimRot) * ProjectileSpeed;

        if (Instigator != None)
            Proj.Instigator = Instigator;
    }

    return Proj;
}

// ---------------------------------------------------------------------------
// Firing states
// ---------------------------------------------------------------------------

state NormalFire
{
    function BeginState()
    {
        // The actual fire logic is in Fire() which is called by PlayerController.
        // This state handles animation timing and cooldown.
        if (PlayerPawn(Instigator) != None)
            PlayerPawn(Instigator).ShakeView(ShakeMag, ShakeTime, ShakeVert);

        GoToState('FinishFire');
    }
}

state AltFire
{
    function BeginState()
    {
        if (PlayerPawn(Instigator) != None)
            PlayerPawn(Instigator).ShakeView(ShakeMag, ShakeTime, ShakeVert);

        GoToState('FinishFire');
    }
}

// ---------------------------------------------------------------------------
// Weapon info
// ---------------------------------------------------------------------------

simulated function float RateSelf(out byte bUpgradeLevel)
{
    // Baseline rating so bots will pick it up
    return 0.5;
}

// ---------------------------------------------------------------------------
// Default properties
// ---------------------------------------------------------------------------

defaultproperties
{
    PortalProjectileClass=Class'PortalGun.PortalProj'

    // Weapon identification
    ItemName="Portal Gun"
    Description="Primary Fire: place blue portal.|Secondary Fire: place orange portal."

    // Pickup
    bShowChargingBar=False
    bAmbientGlow=False
    bRotatingPickup=False
    PickupAmmoCount=1
    bInfiniteAmmo=True

    // Firing
    FireSound=Sound'BotPack.Enforcer.ShootAlt'
    AltFireSound=Sound'BotPack.Enforcer.ShootAlt'
    SelectSound=Sound'BotPack.Enforcer.Select'

    // Projectile
    ProjectileClass=Class'PortalGun.PortalProj'
    AltProjectileClass=Class'PortalGun.PortalProj'
    ProjectileSpeed=1000.0

    // Animation
    BobDamping=0.975
    FireRate=0.8
    AltFireRate=0.8
    PutDownTime=0.3
    BringUpTime=0.4
    ShakeMag=100.0
    ShakeTime=0.2
    ShakeVert=5.0
    AimError=0.0

    // Ammo
    AmmoName=None
    bNoAmmo=True
    bNeverThrow=True
    bAlwaysRelevant=True

    // Draw
    DrawType=DT_StaticMesh
    PickupViewMesh=LodMesh'BotPack.LPRailGunPickUp'
    ThirdPersonMesh=LodMesh'BotPack.LPRailGun3rd'
    PlayerViewMesh=LodMesh'BotPack.LPRailGun1st'
    PlayerViewScale=0.1
    PickupSound=Sound'BotPack.Pickups.AmmoInst'
    Icon=Texture'BotPack.Icons.iAmEnforcer'
}
