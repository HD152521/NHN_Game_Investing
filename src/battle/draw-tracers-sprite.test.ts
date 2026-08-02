/**
 * 발사체·피격 스프라이트 렌더 검사 (PLAN Step 6) — 실제로 그려진 픽셀을 읽는다.
 *
 * `draw-tracers.test.ts` · `draw-unit-tracers.test.ts`는 호출 기록으로 **벡터 폴백**
 * (표적 선정·사거리 규칙)을 검사한다. 여기서는 소프트웨어 캔버스를 물려 **스프라이트
 * 경로**만 본다 — "어느 상황에 시트의 어떤 탄이 나가는가"가 이 파일의 질문이다.
 *
 * 시트 §08 배정(= `src/fx/projectiles.ts`의 순수 함수):
 *   basic·antiair → `W-01` 아군 신호탄(적색) → 피격 적색
 *   splash        → `W-02` 앵커 탄(무채)     → 피격 무채
 *   적 근접·원거리 → `W-03` 적 하강 화살(청색) → 피격 청색
 */

import { describe, expect, test } from 'vitest';

import { TOWER_COOLDOWN_MS } from '../combat/index.js';
import type { Enemy, TowerKind, Unit } from '../combat/types.js';
import { createTheme, parseHex } from '../design/index.js';
import { SPRITE_PALETTE, TRANSPARENT, spriteGrid } from '../sprites/index.js';
import type { SpriteCell } from '../sprites/index.js';
import { ADDITIVE_INK_FLOOR } from '../sprites/render/index.js';
import type { RenderableSpriteKey } from '../sprites/render/index.js';
import { makeCombatState, makeEnemy, makeTower, makeUnit } from './combat-fixtures.js';
import { drawTracers } from './draw-tracers.js';
import { drawUnitTracers } from './draw-unit-tracers.js';
import { computeBattleLayout, progressToX } from './layout.js';
import { createSoftwareRasterCache, createSpriteBattleSurface } from './sprite-fake-ctx.js';
import type { SpriteBattleSurface } from './sprite-fake-ctx.js';

const { palette } = createTheme();
const WIDTH = 1024;
const HEIGHT = 300;
const LAYOUT = computeBattleLayout(WIDTH, HEIGHT);

/** 방금 발사한 직후(비행 진행도 0) — 발사체만 있고 피격은 아직 없다. */
const FRESH = 1;
/** 비행 진행도가 절반을 넘은 시점 — 피격까지 함께 그려진다. */
const ARRIVING = 0.8;
/** 가장 짧은 사거리(splash 0.26) 안에도 들어오는 표적 위치. */
const TARGET_X = 0.2;

function surfaceOf(): SpriteBattleSurface {
  return createSpriteBattleSurface(WIDTH, HEIGHT);
}

/** 스프라이트 문자 → 화면에 남는 RGB. 가산 바닥(`ADDITIVE_INK_FLOOR`) 미만은 안 남는다. */
function inkOf(cell: SpriteCell): readonly [number, number, number] | null {
  if (cell === TRANSPARENT) return null;
  const { r, g, b } = parseHex(palette[SPRITE_PALETTE[cell]]);
  if (Math.max(r, g, b) < ADDITIVE_INK_FLOOR) return null;
  return [r, g, b];
}

function colorKey(rgb: readonly [number, number, number]): string {
  return rgb.join(',');
}

interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly centerX: number;
}

/** 화면에 뭔가 찍힌 가로 범위. 아무것도 없으면 `null`. */
function paintedBounds(target: SpriteBattleSurface): Bounds | null {
  const { data, width, height } = target.surface;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (r === 0 && g === 0 && b === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  if (minX > maxX) return null;
  return { minX, maxX, centerX: (minX + maxX) / 2 };
}

/** 화면에 실제로 찍힌 색 전부(투명 제외). */
function paintedColors(target: SpriteBattleSurface): Set<string> {
  const seen = new Set<string>();
  const { data, width, height } = target.surface;
  for (let i = 0; i < width * height; i += 1) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    if (r === 0 && g === 0 && b === 0) continue;
    seen.add(`${r},${g},${b}`);
  }
  return seen;
}

/** 스프라이트 한 장이 남길 수 있는 색 전부. */
function gridColors(key: RenderableSpriteKey): Set<string> {
  const seen = new Set<string>();
  for (const row of spriteGrid(key)) {
    for (const cell of row) {
      const rgb = inkOf(cell);
      if (rgb !== null) seen.add(colorKey(rgb));
    }
  }
  return seen;
}

function towerShot(kind: TowerKind, ratio: number): SpriteBattleSurface {
  const target = surfaceOf();
  const state = makeCombatState({
    towers: [makeTower({ kind, cooldownMs: TOWER_COOLDOWN_MS[kind] * ratio })],
    enemies: [makeEnemy({ lane: kind === 'antiair' ? 'air' : 'ground', x: TARGET_X })],
  });
  drawTracers(target.ctx, palette, LAYOUT, state, createSoftwareRasterCache());
  return target;
}

/** 진영 신호색 — "작게 보여도 진영색이 먼저 읽혀야 한다"(시트 §08)를 색으로 검사한다. */
const ALLY_INK = colorKey([parseHex(palette.UP_ALLY).r, parseHex(palette.UP_ALLY).g, parseHex(palette.UP_ALLY).b]);
const ENEMY_INK = colorKey([
  parseHex(palette.ENEMY_DOWN).r,
  parseHex(palette.ENEMY_DOWN).g,
  parseHex(palette.ENEMY_DOWN).b,
]);

describe('발사체 스프라이트 — 타워 종류가 시트의 탄으로 이어진다', () => {
  test.each([
    ['basic', 'tf-w-01'],
    ['antiair', 'tf-w-01'],
    ['splash', 'tf-w-02'],
  ] as const)('%s 타워는 %s 를 쏜다', (kind, key) => {
    const painted = paintedColors(towerShot(kind, FRESH));
    expect(painted.size).toBeGreaterThan(0);

    const allowed = gridColors(key);
    expect({ kind, stray: [...painted].filter((color) => !allowed.has(color)) }).toMatchObject({ stray: [] });
  });

  test('발사 직후에는 발사체 한 장만 그린다 (아직 안 맞았다)', () => {
    expect(towerShot('basic', FRESH).surface.stats.drawImage).toBe(1);
  });

  test('표적에 다다르면 피격까지 두 장이 된다', () => {
    expect(towerShot('basic', ARRIVING).surface.stats.drawImage).toBe(2);
  });

  test('아군 탄은 적색으로 읽힌다 — 청색이 한 픽셀도 섞이지 않는다', () => {
    const painted = paintedColors(towerShot('basic', ARRIVING));
    expect({ hasAlly: painted.has(ALLY_INK), hasEnemy: painted.has(ENEMY_INK) }).toMatchObject({
      hasAlly: true,
      hasEnemy: false,
    });
  });

  test('앵커 탄(splash)은 무채라 진영색이 하나도 나오지 않는다', () => {
    const painted = paintedColors(towerShot('splash', ARRIVING));
    expect({ hasAlly: painted.has(ALLY_INK), hasEnemy: painted.has(ENEMY_INK) }).toMatchObject({
      hasAlly: false,
      hasEnemy: false,
    });
  });

  test('재장전 중인 타워는 아무것도 그리지 않는다', () => {
    expect(towerShot('basic', 0.1).surface.stats.drawImage).toBe(0);
  });
});

/**
 * ★ 피드백 "제자리에서 이상한 화살표만 나간다" 의 회귀 방지 ★
 *
 * 예전에는 유닛·적 전원이 타워용 화살(`tf-w-01`/`tf-w-03`)을 쐈다. 그런데 `intern`·`trader`
 * 와 적 5종은 전부 **밀착 근접**이다(`UNIT_MELEE_RANGE`, `combat/waves.ts`). 이제:
 *   근접 → 날아가는 탄 없음, 접촉 타격(피격 스프라이트)만
 *   원거리(analyst) → **캔**(`canFrame`)이 회전하며 날아가고, 도달하면 피격이 뜬다
 */
describe('발사체 스프라이트 — 유닛·적 공격 (근접은 탄이 없다)', () => {
  const UNIT_COOLDOWN = 700;
  const ENEMY_COOLDOWN = 900;
  const UNIT_X = 0.4;
  /** intern 사거리(0.05) 안. */
  const MELEE_TARGET_X = 0.42;
  /** analyst 사거리(0.2) 안이면서 근접보다 훨씬 멀다 — 캔의 비행이 눈에 보이는 거리다. */
  const RANGED_TARGET_X = 0.55;

  function fight(unit: Partial<Unit>, foe: Partial<Enemy>): SpriteBattleSurface {
    const target = surfaceOf();
    drawUnitTracers(
      target.ctx,
      palette,
      LAYOUT,
      makeCombatState({ units: [makeUnit(unit)], enemies: [makeEnemy(foe)] }),
      createSoftwareRasterCache(),
    );
    return target;
  }

  function meleeShot(ratio: number): SpriteBattleSurface {
    return fight(
      { kind: 'intern', x: UNIT_X, cooldownMs: UNIT_COOLDOWN * ratio },
      { lane: 'ground', x: MELEE_TARGET_X, cooldownMs: 0 },
    );
  }

  function rangedShot(ratio: number): SpriteBattleSurface {
    return fight(
      { kind: 'analyst', range: 0.2, x: UNIT_X, cooldownMs: UNIT_COOLDOWN * ratio },
      { lane: 'ground', x: RANGED_TARGET_X, cooldownMs: 0 },
    );
  }

  function enemyShot(ratio: number): SpriteBattleSurface {
    return fight(
      { kind: 'intern', x: UNIT_X, cooldownMs: 0 },
      { lane: 'ground', x: MELEE_TARGET_X, cooldownMs: ENEMY_COOLDOWN * ratio },
    );
  }

  test('근접 유닛은 발사 직후에도 도달 시점에도 그림이 한 장뿐이다 (날아가는 탄이 없다)', () => {
    expect(meleeShot(FRESH).surface.stats.drawImage).toBe(1);
    expect(meleeShot(ARRIVING).surface.stats.drawImage).toBe(1);
  });

  test('근접 유닛의 타격은 표적 위에만 나온다 — 유닛 자리에서 출발하지 않는다', () => {
    const bounds = paintedBounds(meleeShot(FRESH));
    const targetX = progressToX(MELEE_TARGET_X, LAYOUT);
    expect(bounds).not.toBeNull();
    expect(Math.abs((bounds as Bounds).centerX - targetX)).toBeLessThanOrEqual(2);
  });

  test('원거리 유닛은 캔을 던진다 — 발사 직후 캔 한 장, 도달하면 캔 + 피격 두 장', () => {
    expect(rangedShot(FRESH).surface.stats.drawImage).toBe(1);
    expect(rangedShot(ARRIVING).surface.stats.drawImage).toBe(2);
  });

  test('던진 캔이 실제로 날아간다 — 진행도가 커지면 그림이 표적 쪽으로 옮겨간다', () => {
    // 두 시점 모두 비행 진행도 < 0.5 라 피격은 아직 없다(= 캔 한 장씩만 비교한다).
    const early = paintedBounds(rangedShot(0.98));
    const late = paintedBounds(rangedShot(0.87));
    expect(early).not.toBeNull();
    expect(late).not.toBeNull();
    expect((late as Bounds).centerX).toBeGreaterThan((early as Bounds).centerX + 10);
    expect((early as Bounds).centerX).toBeGreaterThanOrEqual(progressToX(UNIT_X, LAYOUT) - 2);
    expect((late as Bounds).centerX).toBeLessThan(progressToX(RANGED_TARGET_X, LAYOUT));
  });

  test('아군 공격은 적색으로 읽힌다 — 청색이 한 픽셀도 섞이지 않는다', () => {
    const painted = paintedColors(meleeShot(ARRIVING));
    expect({ hasAlly: painted.has(ALLY_INK), hasEnemy: painted.has(ENEMY_INK) }).toMatchObject({
      hasAlly: true,
      hasEnemy: false,
    });
  });

  test('적 공격은 화살 없이 접촉 타격 한 장이고 청색으로만 읽힌다', () => {
    const shot = enemyShot(ARRIVING);
    expect(shot.surface.stats.drawImage).toBe(1);
    const painted = paintedColors(shot);
    expect({ hasAlly: painted.has(ALLY_INK), hasEnemy: painted.has(ENEMY_INK) }).toMatchObject({
      hasAlly: false,
      hasEnemy: true,
    });
  });

  test('아무도 공격하지 않으면 스프라이트를 그리지 않는다', () => {
    expect(
      fight({ x: UNIT_X, cooldownMs: 0 }, { lane: 'ground', x: MELEE_TARGET_X, cooldownMs: 0 }).surface.stats.drawImage,
    ).toBe(0);
  });
});

describe('피격 스프라이트 — 시트 한 장에서 필요한 한 종만 잘라 쓴다', () => {
  test('적색 피격을 그릴 때 같은 시트의 청색 디스크가 딸려오지 않는다', () => {
    // `tf-w-04`는 적색·청색·무채 파열을 한 장에 나란히 담고 있다. 클립이 없으면
    // 아군 피격 한 번에 청색까지 화면에 뜬다.
    const painted = paintedColors(towerShot('basic', ARRIVING));
    const impactColors = gridColors('tf-w-04');
    expect(impactColors.has(ENEMY_INK)).toBe(true);
    expect(painted.has(ENEMY_INK)).toBe(false);
  });
});

describe('발사체 스프라이트 — 방어', () => {
  test('스프라이트를 굽지 못하면(=캐시가 빈 경우) 크래시하지 않는다', () => {
    const target = surfaceOf();
    const cache = createSoftwareRasterCache();
    cache.clear();
    expect(() =>
      drawTracers(
        target.ctx,
        palette,
        LAYOUT,
        makeCombatState({
          towers: [makeTower({ cooldownMs: TOWER_COOLDOWN_MS.basic })],
          enemies: [makeEnemy({ x: TARGET_X })],
        }),
        cache,
      ),
    ).not.toThrow();
  });
});
