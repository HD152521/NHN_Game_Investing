import { HIT_FLASH_PEAK, HIT_FLASH_SECONDS, HIT_RECOIL_ROTATION } from '../constants.js';
import { clamp01 } from '../easing.js';
import { partIndex } from '../rig.js';
import type { Pose, Rig } from '../types.js';

/**
 * Damage feedback without a single extra sprite frame (art guide R5).
 *
 * The clip produces one scalar, `pose.tintStrength`, which the renderer turns
 * into a colour overlay. The only skeletal change is a small torso recoil, so
 * the flash can be layered on top of walking or attacking without fighting the
 * clip underneath it.
 */
export function applyHitFlash(rig: Rig, hitTime: number, pose: Pose): void {
  const strength = hitFlashStrength(hitTime);
  pose.tintStrength = strength;

  if (strength === 0) {
    return;
  }

  const torso = partIndex(rig, 'torso');
  pose.rotation[torso] = (pose.rotation[torso] as number) + strength * HIT_RECOIL_ROTATION;
}

/** Linear decay from `HIT_FLASH_PEAK` at impact to 0 once the window closes. */
export function hitFlashStrength(hitTime: number): number {
  if (!Number.isFinite(hitTime) || hitTime < 0 || hitTime >= HIT_FLASH_SECONDS) {
    return 0;
  }
  return clamp01(1 - hitTime / HIT_FLASH_SECONDS) * HIT_FLASH_PEAK;
}
