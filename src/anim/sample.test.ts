import { describe, expect, test } from 'vitest';

import { ATTACK_DURATION_SECONDS, IDLE_CYCLE_SECONDS, WALK_CYCLE_SECONDS } from './constants.js';
import { MAT_STRIDE, applyToX, applyToY, createMatrixBuffer } from './matrix.js';
import { createHumanoidRig, createPose, createWorldBuffer } from './rig.js';
import { samplePose } from './sample.js';
import { setRootTransform, solveWorld } from './solve.js';
import type { AnimState, ClipId, EntityTransform, Pose } from './types.js';

const rig = createHumanoidRig();

function state(overrides: Partial<AnimState> = {}): AnimState {
  return {
    clip: 'idle',
    clipTime: 0,
    hitTime: Number.POSITIVE_INFINITY,
    phaseOffset: 0,
    ...overrides,
  };
}

function snapshot(pose: Pose): number[] {
  return [
    ...pose.rotation,
    ...pose.scaleX,
    ...pose.scaleY,
    ...pose.offsetX,
    ...pose.offsetY,
    pose.tintStrength,
  ];
}

function sampledSnapshot(animState: AnimState): number[] {
  const pose = createPose(rig);
  samplePose(rig, animState, pose);
  return snapshot(pose);
}

describe('samplePose purity', () => {
  test('the same input yields the same output on independent buffers', () => {
    const animState = state({ clip: 'walk', clipTime: 0.313, hitTime: 0.05, phaseOffset: 0.42 });

    expect(sampledSnapshot(animState)).toEqual(sampledSnapshot(animState));
  });

  test('reusing one pose buffer gives the same result as a fresh buffer', () => {
    const animState = state({ clip: 'attack', clipTime: 0.21, phaseOffset: 0.9 });
    const shared = createPose(rig);

    samplePose(rig, state({ clip: 'walk', clipTime: 5 }), shared);
    samplePose(rig, animState, shared);

    expect(snapshot(shared)).toEqual(sampledSnapshot(animState));
  });

  test('sampling does not mutate the rig or the input state', () => {
    const animState = state({ clip: 'walk', clipTime: 1.5 });
    const rigJson = JSON.stringify(rig.parts);
    const stateJson = JSON.stringify(animState);

    samplePose(rig, animState, createPose(rig));

    expect(JSON.stringify(rig.parts)).toBe(rigJson);
    expect(JSON.stringify(animState)).toBe(stateJson);
  });

  test('no ambient clock leaks in — repeated calls across time are stable', async () => {
    const animState = state({ clip: 'walk', clipTime: 0.4 });
    const first = sampledSnapshot(animState);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(sampledSnapshot(animState)).toEqual(first);
  });
});

describe('cycle periodicity', () => {
  const cases: ReadonlyArray<{ clip: ClipId; period: number }> = [
    { clip: 'walk', period: WALK_CYCLE_SECONDS },
    { clip: 'idle', period: IDLE_CYCLE_SECONDS },
    { clip: 'attack', period: ATTACK_DURATION_SECONDS },
  ];

  for (const { clip, period } of cases) {
    test(`${clip} at t matches t + one period`, () => {
      for (const fraction of [0, 0.17, 0.33, 0.5, 0.81]) {
        const t = period * fraction;
        const a = sampledSnapshot(state({ clip, clipTime: t }));
        const b = sampledSnapshot(state({ clip, clipTime: t + period }));

        a.forEach((value, i) => {
          expect(value).toBeCloseTo(b[i] as number, 8);
        });
      }
    });
  }

  test('walk stays periodic across many cycles', () => {
    const a = sampledSnapshot(state({ clip: 'walk', clipTime: 0.2 }));
    const b = sampledSnapshot(state({ clip: 'walk', clipTime: 0.2 + WALK_CYCLE_SECONDS * 40 }));

    a.forEach((value, i) => {
      expect(value).toBeCloseTo(b[i] as number, 6);
    });
  });

  test('phaseOffset shifts the walk cycle rather than changing its shape', () => {
    const offset = 0.25;
    const a = sampledSnapshot(state({ clip: 'walk', clipTime: 0, phaseOffset: offset }));
    const b = sampledSnapshot(
      state({ clip: 'walk', clipTime: WALK_CYCLE_SECONDS * offset, phaseOffset: 0 }),
    );

    a.forEach((value, i) => {
      expect(value).toBeCloseTo(b[i] as number, 8);
    });
  });
});

describe('facing mirror symmetry', () => {
  function worldFor(facing: EntityTransform['facing'], animState: AnimState): Float64Array {
    const pose = createPose(rig);
    const world = createWorldBuffer(rig);
    const root = createMatrixBuffer(1);

    samplePose(rig, animState, pose);
    setRootTransform(root, { x: 0, y: 0, facing, scale: 1 });
    solveWorld(rig, pose, world, root);
    return world;
  }

  test('a left-facing unit mirrors a right-facing one about the entity origin', () => {
    const animState = state({ clip: 'walk', clipTime: 0.19 });
    const right = worldFor('right', animState);
    const left = worldFor('left', animState);
    const probes: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [10, 0],
      [0, 10],
      [-7, 3],
    ];

    for (let i = 0; i < rig.parts.length; i += 1) {
      const offset = i * MAT_STRIDE;
      for (const [px, py] of probes) {
        expect(applyToX(left, offset, px, py)).toBeCloseTo(-applyToX(right, offset, px, py));
        expect(applyToY(left, offset, px, py)).toBeCloseTo(applyToY(right, offset, px, py));
      }
    }
  });

  test('mirroring is applied at the root only, so the sampled pose is identical', () => {
    const animState = state({ clip: 'attack', clipTime: 0.2 });
    const pose = createPose(rig);
    samplePose(rig, animState, pose);

    expect(snapshot(pose)).toEqual(sampledSnapshot(animState));
  });

  test('the entity translation is respected under both facings', () => {
    const animState = state({ clip: 'idle', clipTime: 0 });
    const pose = createPose(rig);
    const world = createWorldBuffer(rig);
    const root = createMatrixBuffer(1);
    samplePose(rig, animState, pose);

    setRootTransform(root, { x: 300, y: 120, facing: 'left', scale: 2 });
    solveWorld(rig, pose, world, root);

    expect(applyToX(world, 0, 0, 0)).toBeCloseTo(300);
    expect(applyToY(world, 0, 0, 0)).toBeCloseTo(120);
  });
});

describe('clip dispatch', () => {
  test('an unknown-length clip time never produces NaN', () => {
    const clips: readonly ClipId[] = ['idle', 'walk', 'attack', 'hit'];
    for (const clip of clips) {
      for (const clipTime of [0, 0.001, 3.7, 900]) {
        const pose = createPose(rig);
        samplePose(rig, state({ clip, clipTime, hitTime: 0.02 }), pose);
        for (const value of snapshot(pose)) {
          expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
  });

  test('the hit flash overlays any clip', () => {
    const pose = createPose(rig);
    samplePose(rig, state({ clip: 'walk', clipTime: 0.3, hitTime: 0 }), pose);
    expect(pose.tintStrength).toBeGreaterThan(0);
  });
});
