import { describe, expect, test } from 'vitest';

import { MAT_STRIDE } from '../anim/matrix.js';
import { createHumanoidRig, createPose, createWorldBuffer, partIndex } from '../anim/rig.js';
import { samplePose } from '../anim/sample.js';
import { setRootTransform, solveWorld } from '../anim/solve.js';
import type { AnimState } from '../anim/types.js';
import { frameFor, validateManifest } from './atlas.js';
import { drawSkeleton } from './renderer.js';
import type { AtlasManifest, SpriteAtlas } from './atlas.js';
import type { SpritePalette } from './palette.js';
import type { Draw2D } from './surface.js';

const rig = createHumanoidRig();

const MANIFEST: AtlasManifest = {
  imageWidth: 256,
  imageHeight: 256,
  frames: {
    torso: { x: 0, y: 0, w: 40, h: 60, anchorX: 20, anchorY: 40 },
    upperArm: { x: 40, y: 0, w: 12, h: 22, anchorX: 6, anchorY: 3 },
    forearm: { x: 52, y: 0, w: 12, h: 24, anchorX: 6, anchorY: 3 },
    thigh: { x: 64, y: 0, w: 14, h: 26, anchorX: 7, anchorY: 3 },
    calf: { x: 78, y: 0, w: 14, h: 28, anchorX: 7, anchorY: 3 },
    weapon: { x: 92, y: 0, w: 40, h: 10, anchorX: 4, anchorY: 5 },
  },
};

// Deliberately odd values: if any of these show up in a draw call we know the
// renderer used the injected palette instead of a hardcoded constant.
const PALETTE: SpritePalette = {
  farLimbAlpha: 0.37,
  hitFlashAlpha: 0.83,
  hitFlashComposite: 'test-composite',
};

type Call =
  | { kind: 'setTransform'; m: readonly number[] }
  | { kind: 'drawImage'; args: readonly number[]; alpha: number; composite: string }
  | { kind: 'alpha'; value: number }
  | { kind: 'composite'; value: string }
  | { kind: 'save' }
  | { kind: 'restore' };

class FakeCtx implements Draw2D {
  readonly calls: Call[] = [];
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';

  save(): void {
    this.calls.push({ kind: 'save' });
  }

  restore(): void {
    this.calls.push({ kind: 'restore' });
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.calls.push({ kind: 'setTransform', m: [a, b, c, d, e, f] });
  }

  drawImage(
    _image: unknown,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void {
    this.calls.push({ kind: 'alpha', value: this.globalAlpha });
    this.calls.push({ kind: 'composite', value: this.globalCompositeOperation });
    this.calls.push({
      kind: 'drawImage',
      args: [sx, sy, sw, sh, dx, dy, dw, dh],
      alpha: this.globalAlpha,
      composite: this.globalCompositeOperation,
    });
  }
}

const IMAGE = { placeholder: true };

function makeAtlas(manifest: AtlasManifest = MANIFEST): SpriteAtlas {
  return { image: IMAGE, manifest };
}

function solved(animState: AnimState) {
  const pose = createPose(rig);
  const world = createWorldBuffer(rig);
  const root = new Float64Array(MAT_STRIDE);
  samplePose(rig, animState, pose);
  setRootTransform(root, { x: 100, y: 200, facing: 'right', scale: 1 });
  solveWorld(rig, pose, world, root);
  return { pose, world };
}

function idleState(overrides: Partial<AnimState> = {}): AnimState {
  return {
    clip: 'idle',
    clipTime: 0,
    hitTime: Number.POSITIVE_INFINITY,
    phaseOffset: 0,
    ...overrides,
  };
}

function drawCalls(ctx: FakeCtx): Call[] {
  return ctx.calls.filter((call) => call.kind === 'drawImage');
}

describe('atlas manifest', () => {
  test('validateManifest accepts a complete in-bounds manifest', () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
  });

  test('validateManifest reports frames that fall outside the image', () => {
    const problems = validateManifest({
      ...MANIFEST,
      frames: { ...MANIFEST.frames, weapon: { x: 250, y: 0, w: 40, h: 10, anchorX: 0, anchorY: 0 } },
    });

    expect(problems.length).toBe(1);
    expect(problems[0]).toContain('weapon');
  });

  test('validateManifest reports missing sprite parts', () => {
    const frames = { ...MANIFEST.frames };
    delete frames.weapon;
    const problems = validateManifest({ ...MANIFEST, frames });

    expect(problems.some((p) => p.includes('weapon'))).toBe(true);
  });

  test('validateManifest rejects non-positive frame sizes', () => {
    const problems = validateManifest({
      ...MANIFEST,
      frames: { ...MANIFEST.frames, calf: { x: 0, y: 0, w: 0, h: 10, anchorX: 0, anchorY: 0 } },
    });

    expect(problems.some((p) => p.includes('calf'))).toBe(true);
  });

  test('validateManifest reports a negative frame origin', () => {
    const problems = validateManifest({
      ...MANIFEST,
      frames: { ...MANIFEST.frames, thigh: { x: -4, y: 0, w: 14, h: 26, anchorX: 7, anchorY: 3 } },
    });

    expect(problems.some((p) => p.includes('thigh') && p.includes('negative'))).toBe(true);
  });

  test('frameFor returns undefined instead of throwing for an absent part', () => {
    const frames = { ...MANIFEST.frames };
    delete frames.weapon;

    expect(frameFor({ ...MANIFEST, frames }, 'weapon')).toBeUndefined();
    expect(frameFor(MANIFEST, 'torso')).toEqual(MANIFEST.frames.torso);
  });
});

describe('drawSkeleton', () => {
  test('draws every rig part exactly once', () => {
    const ctx = new FakeCtx();
    const { pose, world } = solved(idleState());

    drawSkeleton(ctx, rig, world, pose.tintStrength, makeAtlas(), PALETTE);

    expect(drawCalls(ctx).length).toBe(rig.parts.length);
  });

  test('draws in painter order — far limbs before the torso, weapon last', () => {
    const ctx = new FakeCtx();
    const { pose, world } = solved(idleState());

    drawSkeleton(ctx, rig, world, pose.tintStrength, makeAtlas(), PALETTE);

    const sourceX = drawCalls(ctx).map((call) =>
      call.kind === 'drawImage' ? (call.args[0] as number) : -1,
    );
    const torsoX = MANIFEST.frames.torso?.x ?? -1;
    const weaponX = MANIFEST.frames.weapon?.x ?? -1;

    expect(sourceX.indexOf(torsoX)).toBe(4);
    expect(sourceX[sourceX.length - 1]).toBe(weaponX);
  });

  test('uses the solved world matrix for each part', () => {
    const ctx = new FakeCtx();
    const { pose, world } = solved(idleState());

    drawSkeleton(ctx, rig, world, pose.tintStrength, makeAtlas(), PALETTE);

    const torsoOffset = partIndex(rig, 'torso') * MAT_STRIDE;
    const expected = Array.from(world.subarray(torsoOffset, torsoOffset + MAT_STRIDE));
    const transforms = ctx.calls.filter((call) => call.kind === 'setTransform');

    expect(transforms.some((call) => call.kind === 'setTransform' && sameMatrix(call.m, expected))).toBe(
      true,
    );
  });

  test('positions the sprite so the joint anchor sits on the part origin', () => {
    const ctx = new FakeCtx();
    const { pose, world } = solved(idleState());

    drawSkeleton(ctx, rig, world, pose.tintStrength, makeAtlas(), PALETTE);

    const torsoFrame = MANIFEST.frames.torso;
    const call = drawCalls(ctx).find(
      (c) => c.kind === 'drawImage' && c.args[0] === torsoFrame?.x && c.args[1] === torsoFrame?.y,
    );

    expect(call?.kind === 'drawImage' ? call.args.slice(4) : undefined).toEqual([
      -(torsoFrame?.anchorX ?? 0),
      -(torsoFrame?.anchorY ?? 0),
      torsoFrame?.w,
      torsoFrame?.h,
    ]);
  });

  test('shades far-side limbs with the injected alpha and leaves near-side opaque', () => {
    const ctx = new FakeCtx();
    const { pose, world } = solved(idleState());

    drawSkeleton(ctx, rig, world, pose.tintStrength, makeAtlas(), PALETTE);

    const alphas = ctx.calls.filter((c) => c.kind === 'alpha').map((c) => c.value);
    const farCount = rig.parts.filter((p) => p.side === 'far').length;

    expect(alphas.filter((a) => a === PALETTE.farLimbAlpha).length).toBe(farCount);
    expect(alphas.filter((a) => a === 1).length).toBe(rig.parts.length - farCount);
  });

  test('skips parts whose sprite is missing from the manifest', () => {
    const ctx = new FakeCtx();
    const frames = { ...MANIFEST.frames };
    delete frames.weapon;
    const { pose, world } = solved(idleState());

    drawSkeleton(ctx, rig, world, pose.tintStrength, makeAtlas({ ...MANIFEST, frames }), PALETTE);

    expect(drawCalls(ctx).length).toBe(rig.parts.length - 1);
  });

  test('emits no flash pass when the unit is not hit', () => {
    const ctx = new FakeCtx();
    const { pose, world } = solved(idleState());

    drawSkeleton(ctx, rig, world, pose.tintStrength, makeAtlas(), PALETTE);

    const composites = ctx.calls.filter((c) => c.kind === 'composite').map((c) => c.value);
    expect(composites.every((value) => value === 'source-over')).toBe(true);
  });

  test('adds one flash pass per part using the injected composite and alpha', () => {
    const ctx = new FakeCtx();
    const { pose, world } = solved(idleState({ hitTime: 0 }));

    expect(pose.tintStrength).toBeGreaterThan(0);
    drawSkeleton(ctx, rig, world, pose.tintStrength, makeAtlas(), PALETTE);

    expect(drawCalls(ctx).length).toBe(rig.parts.length * 2);

    const flashAlphas = ctx.calls
      .filter((c) => c.kind === 'composite' && c.value === PALETTE.hitFlashComposite)
      .length;
    expect(flashAlphas).toBe(rig.parts.length);

    const alphas = ctx.calls.filter((c) => c.kind === 'alpha').map((c) => c.value);
    expect(alphas).toContain(pose.tintStrength * PALETTE.hitFlashAlpha);
  });

  test('the flash pass scales with tint strength, not a fixed value', () => {
    const strong = new FakeCtx();
    const weak = new FakeCtx();
    const a = solved(idleState({ hitTime: 0 }));
    const b = solved(idleState({ hitTime: 0.12 }));

    drawSkeleton(strong, rig, a.world, a.pose.tintStrength, makeAtlas(), PALETTE);
    drawSkeleton(weak, rig, b.world, b.pose.tintStrength, makeAtlas(), PALETTE);

    const flashAlpha = (ctx: FakeCtx): number =>
      Math.max(
        ...drawCalls(ctx)
          .filter((c) => c.kind === 'drawImage' && c.composite === PALETTE.hitFlashComposite)
          .map((c) => (c.kind === 'drawImage' ? c.alpha : 0)),
      );

    expect(flashAlpha(strong)).toBeGreaterThan(flashAlpha(weak));
    expect(flashAlpha(weak)).toBeGreaterThan(0);
  });

  test('balances every save with a restore', () => {
    const ctx = new FakeCtx();
    const { pose, world } = solved(idleState({ hitTime: 0 }));

    drawSkeleton(ctx, rig, world, pose.tintStrength, makeAtlas(), PALETTE);

    const saves = ctx.calls.filter((c) => c.kind === 'save').length;
    const restores = ctx.calls.filter((c) => c.kind === 'restore').length;
    expect(saves).toBe(restores);
    expect(saves).toBeGreaterThan(0);
  });

  test('a left-facing unit needs no extra sprites — same manifest, mirrored transforms', () => {
    const right = new FakeCtx();
    const left = new FakeCtx();
    const pose = createPose(rig);
    const world = createWorldBuffer(rig);
    const root = new Float64Array(MAT_STRIDE);
    samplePose(rig, idleState(), pose);

    setRootTransform(root, { x: 0, y: 0, facing: 'right', scale: 1 });
    solveWorld(rig, pose, world, root);
    drawSkeleton(right, rig, world, pose.tintStrength, makeAtlas(), PALETTE);

    setRootTransform(root, { x: 0, y: 0, facing: 'left', scale: 1 });
    solveWorld(rig, pose, world, root);
    drawSkeleton(left, rig, world, pose.tintStrength, makeAtlas(), PALETTE);

    expect(drawCalls(left)).toEqual(drawCalls(right));
  });
});

function sameMatrix(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, i) => Math.abs(value - (b[i] as number)) < 1e-12);
}
