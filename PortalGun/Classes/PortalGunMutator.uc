//=============================================================================
// PortalGunMutator - central manager for portal lifecycle
//
// Handles weapon replacement, portal creation/overwrite, and paired-portal
// lookup. Acts as a level-persistent singleton so portals survive player
// deaths and weapon drops.
//=============================================================================
class PortalGunMutator extends Mutator;

// Configuration
var() config class<Weapon> WeaponToReplace;  // Stock weapon to replace (default: Redeemer)
var() config bool          bInfiniteAmmo;    // Portal gun never runs out of ammo
var() config float         PortalExpireTime; // Seconds before portal auto-destructs (0=never)
var() config bool          bGiveToAll;       // Give PortalGun to all players on spawn

// Internal state
var PortalActor PortalBlue;
var PortalActor PortalOrange;

// ---------------------------------------------------------------------------
// Mutator lifecycle
// ---------------------------------------------------------------------------

function PostBeginPlay()
{
    Super.PostBeginPlay();

    if (bGiveToAll)
        RegisterPortalGunActor();
}

function bool CheckReplacement(Actor Other, out byte bSuperRelevant)
{
    local Weapon W;

    // Replace the configured weapon with the PortalGun
    W = Weapon(Other);
    if (W != None && W.Class == WeaponToReplace)
    {
        ReplaceWith(Other, "PortalGun.PortalGun");
        return false;  // Don't spawn the original weapon
    }

    return Super.CheckReplacement(Other, bSuperRelevant);
}

function ModifyPlayer(Pawn Other)
{
    local Inventory Inv;

    Super.ModifyPlayer(Other);

    // Give PortalGun to player if they don't already have it
    if (Other == None || Other.IsA('Bot'))
        return;

    Inv = Other.FindInventoryType(class'PortalGun.PortalGun');
    if (Inv == None)
    {
        Spawn(class'PortalGun.PortalGun', Other, , Other.Location, Other.Rotation);
    }
}

// ---------------------------------------------------------------------------
// Portal management
// ---------------------------------------------------------------------------

function PlacePortal(byte PortalType, vector Location, vector HitNormal)
{
    local PortalActor OldPortal, NewPortal;

    // Destroy the existing portal of the same type
    if (PortalType == 0)
    {
        OldPortal = PortalBlue;
    }
    else
    {
        OldPortal = PortalOrange;
    }

    if (OldPortal != None && !OldPortal.bDeleteMe)
    {
        // Clear the paired portal's link before destroying
        if (OldPortal.PairedPortal != None && !OldPortal.PairedPortal.bDeleteMe)
            OldPortal.PairedPortal.PairedPortal = None;

        OldPortal.Destroy();
    }

    // Spawn the new portal actor
    NewPortal = Spawn(class'PortalGun.PortalActor', , , Location, rotator(HitNormal));
    if (NewPortal == None)
        return;

    // Configure the new portal
    NewPortal.PortalType = PortalType;
    NewPortal.SurfaceNormal = HitNormal;
    NewPortal.MutatorRef = self;

    // Store reference
    if (PortalType == 0)
        PortalBlue = NewPortal;
    else
        PortalOrange = NewPortal;

    // Set expiry timer if configured
    if (PortalExpireTime > 0.0)
        NewPortal.LifeSpan = PortalExpireTime;

    // Cross-link portal pairs
    LinkPortalPair(NewPortal, PortalType);
}

function LinkPortalPair(PortalActor NewPortal, byte PortalType)
{
    local PortalActor OtherPortal;

    // Find the other portal in the pair
    if (PortalType == 0)
        OtherPortal = PortalOrange;
    else
        OtherPortal = PortalBlue;

    // Clear existing references on both sides
    if (NewPortal.PairedPortal != None)
        NewPortal.PairedPortal = None;

    if (OtherPortal != None && !OtherPortal.bDeleteMe)
    {
        if (OtherPortal.PairedPortal != None)
            OtherPortal.PairedPortal = None;

        // Cross-link
        NewPortal.PairedPortal = OtherPortal;
        OtherPortal.PairedPortal = NewPortal;
    }
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

function PortalActor GetOtherPortal(PortalActor SelfPortal)
{
    if (SelfPortal == None)
        return None;

    if (SelfPortal.PairedPortal != None && !SelfPortal.PairedPortal.bDeleteMe)
        return SelfPortal.PairedPortal;

    return None;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function RegisterPortalGunActor()
{
    // Give the weapon to the game type's default inventory list
    // so it appears for all players including bots
    if (Level.Game != None)
        Level.Game.DefaultWeapon = class'PortalGun.PortalGun';
}

// ---------------------------------------------------------------------------
// Default properties
// ---------------------------------------------------------------------------

defaultproperties
{
    // Which weapon gets replaced
    WeaponToReplace=Class'BotPack.WarheadLauncher'
    bInfiniteAmmo=True
    PortalExpireTime=0.0
    bGiveToAll=True

    // Mutator list information
    FriendlyName="Portal Gun"
    Description="Adds the Portal Gun weapon. Place blue and orange portals on surfaces and teleport between them."

    bAddToServerPackages=True
    bAlwaysRelevant=True
    RemoteRole=ROLE_SimulatedProxy
}
