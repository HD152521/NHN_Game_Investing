import { SPRITE_PART_KEYS } from '../anim/rig.js';
import type { SpritePartKey } from '../anim/types.js';
import type { DrawableImage } from './surface.js';

/**
 * One sprite rectangle inside the packed atlas.
 *
 * `anchorX`/`anchorY` mark the joint inside the frame — the elbow for a
 * forearm, the grip for a weapon. The rig places a part's origin at its joint,
 * so the renderer draws the frame at `(-anchorX, -anchorY)` and the pivot
 * lands exactly on the bone. Keeping the anchor here rather than in the rig
 * means re-packing or re-cropping the art never touches the animation code.
 */
export interface AtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

/**
 * Coordinate manifest for a part sheet produced by art prompt E-02.
 *
 * Plain data with no image handle, so tooling and tests can work with it
 * without a Canvas.
 */
export interface AtlasManifest {
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly frames: Readonly<Partial<Record<SpritePartKey, AtlasFrame>>>;
}

/** A manifest bound to a loaded image. */
export interface SpriteAtlas {
  readonly image: DrawableImage;
  readonly manifest: AtlasManifest;
}

export function frameFor(manifest: AtlasManifest, key: SpritePartKey): AtlasFrame | undefined {
  return manifest.frames[key];
}

/**
 * Returns a list of human-readable problems, empty when the manifest is sound.
 *
 * Runs at load time rather than per frame: an atlas that silently disagrees
 * with the rig produces limbs drawn at the wrong scale, which is far harder to
 * diagnose from the rendered result than from a startup message.
 */
export function validateManifest(manifest: AtlasManifest): string[] {
  const problems: string[] = [];

  for (const key of SPRITE_PART_KEYS) {
    const frame = manifest.frames[key];
    if (frame === undefined) {
      problems.push(`missing frame for sprite part "${key}"`);
      continue;
    }
    problems.push(...describeFrameProblems(key, frame, manifest));
  }

  return problems;
}

function describeFrameProblems(
  key: SpritePartKey,
  frame: AtlasFrame,
  manifest: AtlasManifest,
): string[] {
  const problems: string[] = [];

  if (frame.w <= 0 || frame.h <= 0) {
    problems.push(`frame "${key}" has a non-positive size (${frame.w}x${frame.h})`);
    return problems;
  }
  if (frame.x < 0 || frame.y < 0) {
    problems.push(`frame "${key}" has a negative origin (${frame.x},${frame.y})`);
  }
  if (frame.x + frame.w > manifest.imageWidth || frame.y + frame.h > manifest.imageHeight) {
    problems.push(
      `frame "${key}" extends past the atlas image (${manifest.imageWidth}x${manifest.imageHeight})`,
    );
  }

  return problems;
}
