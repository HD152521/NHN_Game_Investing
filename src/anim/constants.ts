/**
 * Every tunable number for the parts animation system.
 *
 * Rig space: origin at the hip, +x forward (the character faces +x before any
 * facing flip), +y downward to match the Canvas 2D coordinate system. Lengths
 * are "rig units" — the renderer scales them to on-screen pixels.
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Rig geometry
// ---------------------------------------------------------------------------

/** Distance from the ground line up to the hip origin, in rig units. */
export const HIP_HEIGHT = 46;

export const SHOULDER_Y = -26;
export const SHOULDER_X_FAR = 1;
export const SHOULDER_X_NEAR = 5;
export const ELBOW_LENGTH = 16;
export const HAND_LENGTH = 14;
export const GRIP_X = 2;

export const HIP_X_FAR = -2;
export const HIP_X_NEAR = 2;
export const HIP_Y = 2;
export const THIGH_LENGTH = 20;

/** Arms hang slightly behind the shoulder at rest; the weapon points forward. */
export const REST_UPPER_ARM = 6 * DEG;
export const REST_FOREARM = 8 * DEG;
export const REST_WEAPON = -70 * DEG;

// ---------------------------------------------------------------------------
// Walk cycle
// ---------------------------------------------------------------------------

/** Seconds for one full two-step gait. */
export const WALK_CYCLE_SECONDS = 0.72;
export const WALK_THIGH_SWING = 26 * DEG;
/** The knee only bends one way, so the calf term is offset and clamped at 0. */
export const WALK_CALF_BEND = 30 * DEG;
export const WALK_CALF_PHASE = 0.25 * TAU;
/** Arms counter-swing against the legs on the same side. */
export const WALK_ARM_SWING = 18 * DEG;
export const WALK_FOREARM_SWING = 9 * DEG;
export const WALK_TORSO_LEAN = 4 * DEG;
/** The hip rises twice per gait cycle. */
export const WALK_BOB_AMPLITUDE = 1.6;
export const WALK_BOB_HARMONIC = 2;

// ---------------------------------------------------------------------------
// Attack
// ---------------------------------------------------------------------------

export const ATTACK_DURATION_SECONDS = 0.45;
/** Fraction of the clip spent winding up before the strike begins. */
export const ATTACK_WINDUP_RATIO = 0.35;
export const ATTACK_WINDUP_ARM = -55 * DEG;
export const ATTACK_STRIKE_ARM = 75 * DEG;
export const ATTACK_WINDUP_FOREARM = -40 * DEG;
export const ATTACK_STRIKE_FOREARM = 25 * DEG;
/** Fraction of the strike phase spent reaching peak extension before recovery. */
export const ATTACK_STRIKE_PEAK_RATIO = 0.4;
export const ATTACK_WEAPON_SWING = 35 * DEG;
export const ATTACK_TORSO_TWIST = 10 * DEG;
/** Off-hand counter-rotates for balance. */
export const ATTACK_OFF_ARM_RATIO = -0.35;

/** Peak squash & stretch. 0.18 => torso reaches 1.18x tall / 0.85x wide. */
export const SQUASH_STRETCH_AMOUNT = 0.18;
/** Volume-preservation exponent: x scale moves as (1/yScale) ** this. */
export const SQUASH_VOLUME_EXPONENT = 0.85;

// ---------------------------------------------------------------------------
// Hit flash (art guide R5: tint only, no extra frames)
// ---------------------------------------------------------------------------

export const HIT_FLASH_SECONDS = 0.18;
export const HIT_FLASH_PEAK = 1;
/** Small backward recoil of the torso while the flash is active. */
export const HIT_RECOIL_ROTATION = -7 * DEG;

// ---------------------------------------------------------------------------
// Idle
// ---------------------------------------------------------------------------

export const IDLE_CYCLE_SECONDS = 2.4;
export const IDLE_BREATH_AMOUNT = 0.02;
export const IDLE_ARM_SWAY = 2.5 * DEG;
