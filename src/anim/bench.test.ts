import { describe, expect, test } from 'vitest';

import { SkeletonBatch } from './batch.js';
import { createHumanoidRig } from './rig.js';
import type { ClipId } from './types.js';

/**
 * Headless CPU benchmark for the pose pipeline.
 *
 * Scope note: this measures the CPU side only — clip sampling plus skeleton
 * solving for a full battle's worth of entities. It deliberately does NOT
 * measure GPU work, canvas state changes or texture uploads, none of which can
 * be observed outside a browser. The number below is therefore a lower bound
 * on frame cost, and the useful reading is how much of the 16.6 ms budget is
 * left over for drawing.
 */

// PRD 11: 동시 유닛 60체 + 타워 8기 기준 60 FPS.
const UNIT_COUNT = 60;
const TOWER_COUNT = 8;
const ENTITY_COUNT = UNIT_COUNT + TOWER_COUNT;

const TARGET_FPS = 60;
const FRAME_BUDGET_MS = 1000 / TARGET_FPS;

const WARMUP_FRAMES = 200;
const MEASURED_FRAMES = 1000;

const rig = createHumanoidRig();

const CLIPS: readonly ClipId[] = ['walk', 'attack', 'idle', 'hit'];

/**
 * Long-lived entity records, exactly as a real game would hold them. Building
 * them up front is the point: the benchmark measures steady-state frame cost,
 * not setup.
 */
interface BenchEntity {
  state: { clip: ClipId; clipTime: number; hitTime: number; phaseOffset: number };
  transform: { x: number; y: number; facing: 'left' | 'right'; scale: number };
}

function buildEntities(): BenchEntity[] {
  const entities: BenchEntity[] = [];
  for (let i = 0; i < ENTITY_COUNT; i += 1) {
    const isTower = i >= UNIT_COUNT;
    entities.push({
      state: {
        clip: CLIPS[i % CLIPS.length] as ClipId,
        clipTime: i * 0.031,
        // A third of the crowd is flashing, so the tint path is exercised too.
        hitTime: i % 3 === 0 ? 0.02 : Number.POSITIVE_INFINITY,
        phaseOffset: (i % 17) / 17,
      },
      transform: {
        x: 40 + i * 19,
        y: isTower ? 380 : 520,
        facing: i % 2 === 0 ? 'right' : 'left',
        scale: isTower ? 1.4 : 1,
      },
    });
  }
  return entities;
}

function runFrame(batch: SkeletonBatch, entities: readonly BenchEntity[], dt: number): void {
  for (let i = 0; i < entities.length; i += 1) {
    const entity = entities[i] as BenchEntity;
    entity.state.clipTime += dt;
    entity.state.hitTime += dt;
    batch.solveEntity(i, entity.state, entity.transform);
  }
}

function measure(
  batch: SkeletonBatch,
  entities: readonly BenchEntity[],
  frames: number,
): { totalMs: number; perFrameMs: number } {
  const dt = 1 / TARGET_FPS;
  const start = performance.now();
  for (let frame = 0; frame < frames; frame += 1) {
    runFrame(batch, entities, dt);
  }
  const totalMs = performance.now() - start;
  return { totalMs, perFrameMs: totalMs / frames };
}

describe('pose calculation performance', () => {
  test(`${ENTITY_COUNT} entities (${UNIT_COUNT} units + ${TOWER_COUNT} towers) fit the 60 FPS CPU budget`, () => {
    const batch = new SkeletonBatch(rig, ENTITY_COUNT);
    const entities = buildEntities();

    measure(batch, entities, WARMUP_FRAMES);
    const { perFrameMs } = measure(batch, entities, MEASURED_FRAMES);

    const perEntityUs = (perFrameMs / ENTITY_COUNT) * 1000;
    const budgetPct = (perFrameMs / FRAME_BUDGET_MS) * 100;

    report([
      `entities                 ${ENTITY_COUNT} (${UNIT_COUNT} units + ${TOWER_COUNT} towers)`,
      `parts per entity         ${rig.parts.length}`,
      `part transforms / frame  ${ENTITY_COUNT * rig.parts.length}`,
      `frames measured          ${MEASURED_FRAMES}`,
      `pose calc / frame        ${perFrameMs.toFixed(4)} ms`,
      `pose calc / entity       ${perEntityUs.toFixed(2)} us`,
      `share of 16.6 ms budget  ${budgetPct.toFixed(2)} %`,
      `headroom for rendering   ${(FRAME_BUDGET_MS - perFrameMs).toFixed(3)} ms`,
    ]);

    expect(perFrameMs).toBeLessThan(FRAME_BUDGET_MS);
  });

  test('cost scales linearly with entity count, so headroom is predictable', () => {
    const small = new SkeletonBatch(rig, ENTITY_COUNT);
    const large = new SkeletonBatch(rig, ENTITY_COUNT * 4);
    const entities = buildEntities();
    const manyEntities = [entities, entities, entities, entities].flat();

    measure(small, entities, WARMUP_FRAMES);
    measure(large, manyEntities, WARMUP_FRAMES);

    const one = measure(small, entities, MEASURED_FRAMES).perFrameMs;
    const four = measure(large, manyEntities, MEASURED_FRAMES).perFrameMs;

    report([
      `${ENTITY_COUNT} entities   ${one.toFixed(4)} ms/frame`,
      `${ENTITY_COUNT * 4} entities  ${four.toFixed(4)} ms/frame`,
      `scaling factor  ${(four / one).toFixed(2)}x for 4x the entities`,
    ]);

    // Generous bounds: this asserts "no accidental quadratic", not a precise ratio.
    expect(four / one).toBeGreaterThan(2);
    expect(four / one).toBeLessThan(8);
  });

  test('steady-state solving does not allocate per frame', () => {
    const batch = new SkeletonBatch(rig, ENTITY_COUNT);
    const entities = buildEntities();
    const frames = 20_000;

    measure(batch, entities, WARMUP_FRAMES);
    const before = process.memoryUsage().heapUsed;
    measure(batch, entities, frames);
    const grownMb = (process.memoryUsage().heapUsed - before) / 1024 / 1024;

    report([
      `frames                   ${frames}`,
      `solveEntity calls        ${frames * ENTITY_COUNT}`,
      `heap growth              ${grownMb.toFixed(2)} MB`,
    ]);

    // One small object per entity per frame would be ~1.36M objects here and
    // would show up as either large retained growth or heavy GC churn.
    expect(grownMb).toBeLessThan(8);
  });
});

/** The measurement is the deliverable, so it is printed rather than discarded. */
function report(lines: readonly string[]): void {
  console.info(`\n  [bench] ${lines.join('\n  [bench] ')}\n`);
}

