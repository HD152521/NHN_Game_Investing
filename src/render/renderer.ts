import { MAT_STRIDE } from '../anim/matrix.js';
import type { Rig, RigPart } from '../anim/types.js';
import { frameFor } from './atlas.js';
import type { AtlasFrame, SpriteAtlas } from './atlas.js';
import type { SpritePalette } from './palette.js';
import type { Draw2D } from './surface.js';

const OPAQUE = 1;
const DEFAULT_COMPOSITE = 'source-over';
const NO_TINT = 0;

/**
 * Draws one already-solved skeleton.
 *
 * Takes solved world matrices plus a tint strength and computes nothing itself:
 * all skeletal maths lives in `src/anim` and is exercised headless. That split
 * is the PRD 11 "게임 로직과 렌더러 완전 분리" requirement — swapping Canvas 2D
 * for another backend touches this file only.
 *
 * `baseOffset` lets a whole `SkeletonBatch` be drawn straight out of its shared
 * matrix buffer, with no per-entity slicing.
 *
 * Allocates nothing per call.
 */
export function drawSkeleton(
  ctx: Draw2D,
  rig: Rig,
  world: Float64Array,
  tintStrength: number,
  atlas: SpriteAtlas,
  palette: SpritePalette,
  baseOffset = 0,
): void {
  const { drawOrder, parts } = rig;

  for (let i = 0; i < drawOrder.length; i += 1) {
    const partIdx = drawOrder[i] as number;
    const part = parts[partIdx] as RigPart;
    const frame = frameFor(atlas.manifest, part.sprite);
    if (frame === undefined) {
      continue;
    }

    const offset = baseOffset + partIdx * MAT_STRIDE;
    drawPart(ctx, world, offset, part, frame, atlas, palette, tintStrength);
  }
}

function drawPart(
  ctx: Draw2D,
  world: Float64Array,
  offset: number,
  part: RigPart,
  frame: AtlasFrame,
  atlas: SpriteAtlas,
  palette: SpritePalette,
  tintStrength: number,
): void {
  ctx.save();
  ctx.setTransform(
    world[offset] as number,
    world[offset + 1] as number,
    world[offset + 2] as number,
    world[offset + 3] as number,
    world[offset + 4] as number,
    world[offset + 5] as number,
  );

  ctx.globalAlpha = part.side === 'far' ? palette.farLimbAlpha : OPAQUE;
  ctx.globalCompositeOperation = DEFAULT_COMPOSITE;
  blit(ctx, atlas, frame);

  if (tintStrength > NO_TINT) {
    // Hit flash (art guide R5): the sprite is re-blitted over itself under an
    // additive composite instead of adding damage frames to the sheet.
    //
    // Limitation worth knowing: because this reuses the sprite's own pixels it
    // brightens toward the sprite's colours rather than toward an arbitrary
    // tint colour. A true colour tint needs an offscreen buffer pass; that is
    // deliberately not built yet because it cannot be verified without a real
    // atlas and a real canvas.
    ctx.globalAlpha = tintStrength * palette.hitFlashAlpha;
    ctx.globalCompositeOperation = palette.hitFlashComposite;
    blit(ctx, atlas, frame);
  }

  ctx.restore();
}

function blit(ctx: Draw2D, atlas: SpriteAtlas, frame: AtlasFrame): void {
  ctx.drawImage(
    atlas.image,
    frame.x,
    frame.y,
    frame.w,
    frame.h,
    -frame.anchorX,
    -frame.anchorY,
    frame.w,
    frame.h,
  );
}
