/**
 * 유닛 렌더 검사 — **그려진 픽셀이 스프라이트 그리드와 같은지**를 본다.
 *
 * 예전 이 파일은 `arc` 개수·바운딩 박스 같은 **벡터 호출 기록**으로 실루엣을 검사했다.
 * 그림이 픽셀 아트로 바뀌면서 그 검사는 의미를 잃었으므로(PLAN Step 3), 이제 소프트웨어
 * 캔버스에 실제로 그린 뒤 픽셀을 읽어 원본 그리드와 대조한다 — "화면이 디자인과 같은가"를
 * 직접 묻는 검사다.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createTheme } from '../design/index.js';
import { spriteGrid } from '../sprites/index.js';
import type { SpriteGrid } from '../sprites/index.js';
import {
  entityAnimFrameAt,
  entityAnimFrameGrid,
  spriteRasters,
  unitAnimFrameAt,
  unitAnimFrameGrid,
  walkAnimId,
  WALKABLE_SPRITE_KEYS,
} from '../sprites/render/index.js';
import type { RenderableSpriteKey } from '../sprites/render/index.js';
import { createSoftwareSurface } from '../sprites/render/testing/software-canvas.js';
import { makeEnemy as enemy, makeUnit as unit } from './combat-fixtures.js';
import {
  allyUnitScreenY,
  attackAnimProgress,
  drawAllies,
  drawEnemies,
  ENEMY_ATTACK_ANIM,
  UNIT_ATTACK_ANIM,
  walkFrameAt,
} from './draw-units.js';
import { ALLY_SPRITES, ENEMY_SPRITES, enemyKindForId } from './entity-sprites.js';
import { createFakeBattleCtx } from './fake-ctx.js';
import { cellRgb, createSpriteBattleSurface, hashRegion, pixelAt } from './sprite-fake-ctx.js';
import type { SpriteBattleSurface } from './sprite-fake-ctx.js';
import { computeBattleLayout, laneY, progressToX } from './layout.js';

const { palette } = createTheme();
const layout = computeBattleLayout(800, 300);

/**
 * Node 에는 `OffscreenCanvas` 도 `<canvas>` 도 없어 게임이 공유하는 `spriteRasters` 가
 * 아무것도 굽지 못한다. 소프트웨어 캔버스를 그 자리에 꽂아 실제 래스터를 만든다.
 */
const scope = globalThis as { OffscreenCanvas?: unknown };
const previousOffscreen = scope.OffscreenCanvas;

beforeAll(() => {
  scope.OffscreenCanvas = function OffscreenCanvasStub(width: number, height: number) {
    return createSoftwareSurface(width, height);
  };
  spriteRasters.clear();
});

afterAll(() => {
  scope.OffscreenCanvas = previousOffscreen;
  spriteRasters.clear();
});

/** 그리드 폭(첫 행 길이). 빈 그리드는 0. */
function gridWidth(key: RenderableSpriteKey): number {
  return spriteGrid(key)[0]?.length ?? 0;
}

/** 배율 s 로 그려진 스프라이트를 각 셀의 **중심 픽셀**로 표본 검사한다(경계 반올림 회피). */
function expectSpriteMatchesGrid(
  target: SpriteBattleSurface,
  key: RenderableSpriteKey,
  originX: number,
  originY: number,
  scale: number,
): void {
  expectGridMatches(target, spriteGrid(key), originX, originY, scale);
}

function expectGridMatches(
  target: SpriteBattleSurface,
  grid: SpriteGrid,
  originX: number,
  originY: number,
  scale: number,
): void {
  const half = Math.floor(scale / 2);
  let painted = 0;

  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];
    if (row === undefined) continue;
    for (let x = 0; x < row.length; x += 1) {
      const cell = row[x];
      if (cell === undefined) continue;
      const expected = cellRgb(palette, cell);
      const pixel = pixelAt(target.surface, originX + x * scale + half, originY + y * scale + half);
      if (expected === null) {
        expect(pixel[3], `투명해야 할 (${x}, ${y})`).toBe(0);
        continue;
      }
      expect([pixel[0], pixel[1], pixel[2]], `(${x}, ${y})`).toEqual([...expected]);
      painted += 1;
    }
  }

  expect(painted).toBeGreaterThan(0);
}

describe('drawAllies — 아군 3종이 원본 스프라이트 그대로 나온다', () => {
  test('개장벨 사환(A-01)의 모든 픽셀이 tf-ally-01 그리드와 일치한다', () => {
    const target = createSpriteBattleSurface(800, 300);
    const ally = unit({ kind: 'intern', id: 0, x: 0.5 });
    drawAllies(target.ctx, palette, layout, [ally]);

    const key = ALLY_SPRITES.intern.key;
    const originX = Math.round(progressToX(ally.x, layout) - gridWidth(key) / 2);
    const originY = Math.round(allyUnitScreenY(ally, layout) - spriteGrid(key).length / 2);

    expectSpriteMatchesGrid(target, key, originX, originY, 1);
  });

  test('락업 반장(A-03)의 모든 픽셀이 tf-ally-03 그리드와 일치한다', () => {
    const target = createSpriteBattleSurface(800, 300);
    const ally = unit({ kind: 'trader', id: 0, x: 0.5 });
    drawAllies(target.ctx, palette, layout, [ally]);

    const key = ALLY_SPRITES.trader.key;
    const originX = Math.round(progressToX(ally.x, layout) - gridWidth(key) / 2);
    const originY = Math.round(allyUnitScreenY(ally, layout) - spriteGrid(key).length / 2);

    expectSpriteMatchesGrid(target, key, originX, originY, 1);
  });

  test('세 종류가 서로 다른 그림으로 나온다', () => {
    const hashes = (['intern', 'analyst', 'trader'] as const).map((kind) => {
      const target = createSpriteBattleSurface(800, 300);
      drawAllies(target.ctx, palette, layout, [unit({ kind, id: 0, x: 0.5 })]);
      return hashRegion(target.surface, 360, 200, 80, 60);
    });

    expect(new Set(hashes).size).toBe(3);
  });

  test('HP 바가 스프라이트 위쪽에 함께 그려진다', () => {
    const ctx = createFakeBattleCtx();
    drawAllies(ctx, palette, layout, [unit({ hp: 25, maxHp: 50 })]);

    const bars = ctx.calls.filter((call) => call.kind === 'fillRect' && call.fillStyle === palette.UP_ALLY);
    expect(bars.length).toBe(1);
  });
});

describe('drawEnemies — 악당 스프라이트가 좌우 반전 없이 나온다', () => {
  /**
   * ★ 반전하지 않는 것이 정답인 근거 ★
   * 원본 그리드가 이미 좌향이다(`enemyRusher` 의 창이 x=2~6 왼쪽, `enemyBlocker` 의 방패가
   * x=1~5 왼쪽). 여기서 뒤집으면 악당이 자기가 밀고 가는 방향(좌측 아군 사옥)의 반대쪽을
   * 본다. 아래 검사는 **뒤집지 않은** 그리드와 픽셀이 일치함을 확인해 그 결정을 못 박는다.
   */
  test('갭하락 첨병(E-01)의 픽셀이 뒤집히지 않은 tf-enemy-01 그리드와 일치한다', () => {
    const target = createSpriteBattleSurface(800, 300);
    // id 0 → 지상 목록의 첫 종류(gapScout).
    const foe = enemy({ id: 0, lane: 'ground', x: 0.5 });
    drawEnemies(target.ctx, palette, layout, [foe]);

    expect(enemyKindForId('ground', 0)).toBe('gapScout');
    const key = ENEMY_SPRITES.gapScout.key;
    const originX = Math.round(progressToX(foe.x, layout) - gridWidth(key) / 2);
    const originY = Math.round(laneY('ground', layout) - spriteGrid(key).length / 2);

    expectSpriteMatchesGrid(target, key, originX, originY, 1);
  });

  test('공중 악당은 공중 레인 y에 그려진다', () => {
    const target = createSpriteBattleSurface(800, 300);
    const foe = enemy({ id: 0, lane: 'air', x: 0.5 });
    drawEnemies(target.ctx, palette, layout, [foe]);

    const key = ENEMY_SPRITES[enemyKindForId('air', 0)].key;
    const originX = Math.round(progressToX(foe.x, layout) - gridWidth(key) / 2);
    const originY = Math.round(laneY('air', layout) - spriteGrid(key).length / 2);

    expectSpriteMatchesGrid(target, key, originX, originY, 1);
  });

  test('HP 바는 적 진영색(ENEMY_DOWN)으로 그린다', () => {
    const ctx = createFakeBattleCtx();
    drawEnemies(ctx, palette, layout, [enemy({ hp: 30, maxHp: 60 })]);

    expect(ctx.calls.some((call) => call.kind === 'fillRect' && call.fillStyle === palette.ENEMY_DOWN)).toBe(true);
  });
});

/**
 * 공격 모션 — 피드백 "그냥 제자리에서 이상한 화살표만 나간다" 의 회귀 방지.
 *
 * 쿨다운만으로 프레임을 역산하므로(`CombatState` 에 필드를 추가하지 않는다), 같은 유닛을
 * **다른 쿨다운 값으로 그리면 다른 그림**이 나와야 한다. 아래가 그것을 픽셀로 고정한다.
 */
describe('drawAllies — 공격 모션', () => {
  const COOLDOWN = 700;
  /** 재생 창은 쿨다운의 70~100% 다. 네 값이 각각 프레임 0/1/2/3 에 떨어진다. */
  const FRAME_RATIOS = [1, 0.9, 0.82, 0.72] as const;
  const RELOADING_RATIO = 0.3;

  function attacking(kind: 'intern' | 'analyst' | 'trader', ratio: number) {
    return unit({ kind, id: 0, x: 0.5, attackCooldownMs: COOLDOWN, cooldownMs: COOLDOWN * ratio });
  }

  function drawnHash(kind: 'intern' | 'analyst' | 'trader', ratio: number): string {
    const target = createSpriteBattleSurface(800, 300);
    drawAllies(target.ctx, palette, layout, [attacking(kind, ratio)]);
    return hashRegion(target.surface, 340, 180, 120, 100);
  }

  test('공격 중에는 쿨다운 값마다 다른 프레임이 나온다', () => {
    const hashes = FRAME_RATIOS.map((ratio) => drawnHash('intern', ratio));
    expect(new Set(hashes).size).toBe(FRAME_RATIOS.length);
  });

  test('재장전 중에는 정지 스프라이트로 돌아온다', () => {
    expect(drawnHash('intern', RELOADING_RATIO)).toBe(drawnHash('intern', 0));
  });

  test('공격 프레임은 정지 스프라이트와 다른 그림이다', () => {
    expect(drawnHash('intern', 1)).not.toBe(drawnHash('intern', 0));
  });

  test('세 종류가 서로 다른 공격 모션을 쓴다', () => {
    const hashes = (['intern', 'analyst', 'trader'] as const).map((kind) => drawnHash(kind, 0.82));
    expect(new Set(hashes).size).toBe(3);
    expect(UNIT_ATTACK_ANIM).toEqual({ intern: 'melee', analyst: 'throw', trader: 'shield' });
  });

  /**
   * ★ 원점 규약 ★ 모션 프레임은 무기가 삐져나온 만큼 캔버스가 넓지만(26→30, 28→34), 몸통
   *   좌표는 정지 스프라이트와 같다. 그래서 **정지 스프라이트 기준 좌상단**에 그려야 몸이
   *   좌우로 튀지 않는다. 아래는 프레임 픽셀이 그 원점에서 원본 그리드와 정확히 맞는지 본다.
   */
  test.each([
    ['intern', 'melee'],
    ['analyst', 'throw'],
    ['trader', 'shield'],
  ] as const)('%s 의 공격 프레임 픽셀이 %s 모션 그리드와 일치한다 (원점은 정지 스프라이트 기준)', (kind, anim) => {
    const ratio = 0.82;
    const target = createSpriteBattleSurface(800, 300);
    const ally = attacking(kind, ratio);
    drawAllies(target.ctx, palette, layout, [ally]);

    const idleKey = ALLY_SPRITES[kind].key;
    const idle = spriteGrid(idleKey);
    const originX = Math.round(progressToX(ally.x, layout) - (idle[0]?.length ?? 0) / 2);
    const originY = Math.round(allyUnitScreenY(ally, layout) - idle.length / 2);

    const progress = attackAnimProgress(ally);
    expect(progress).not.toBeNull();
    const frame = unitAnimFrameGrid(anim, unitAnimFrameAt(anim, progress as number));
    expectGridMatches(target, frame, originX, originY, 1);
  });

  test('attackAnimProgress — 재생 창(쿨다운 70~100%)에서만 값이 나온다', () => {
    expect(attackAnimProgress(attacking('intern', 1))).toBeCloseTo(0, 6);
    expect(attackAnimProgress(attacking('intern', 0.85))).toBeCloseTo(0.5, 6);
    expect(attackAnimProgress(attacking('intern', 0.7))).toBeNull();
    expect(attackAnimProgress(attacking('intern', 0))).toBeNull();
    // 죽은 유닛은 때리지 않는다.
    expect(attackAnimProgress({ ...attacking('intern', 1), hp: 0 })).toBeNull();
  });

  /* ── 적 5종 공격(원본 갱신분 `tf-eatk-01~05`) ─────────────────────── */

  const enemyHash = (overrides: Parameters<typeof enemy>[0]): string => {
    const target = createSpriteBattleSurface(800, 300);
    drawEnemies(target.ctx, palette, layout, [enemy(overrides)]);
    // 공중 레인은 지상보다 위에 있으므로 세로 전체를 훑는다.
    return hashRegion(target.surface, 320, 0, 160, 300);
  };

  test('적도 쿨다운 역산으로 공격 모션을 재생한다 (프레임마다 다른 그림)', () => {
    // 적 기본 주기는 900ms — 재생 창은 쿨다운 630~900ms 구간이다(아군과 같은 규칙).
    const hashes = [900, 830, 750, 690].map((cooldownMs) =>
      enemyHash({ id: 0, lane: 'ground', x: 0.5, cooldownMs }),
    );
    expect(new Set(hashes).size).toBe(4);
  });

  test('재장전 중(창 밖)에는 공격 모션이 나오지 않는다', () => {
    expect(enemyHash({ id: 0, lane: 'ground', x: 0.5, cooldownMs: 600 })).toBe(
      enemyHash({ id: 0, lane: 'ground', x: 0.5, cooldownMs: 0 }),
    );
  });

  test('악당 5종이 서로 다른 공격 모션을 쓴다 (순번 매핑)', () => {
    expect(ENEMY_ATTACK_ANIM).toEqual({
      gapScout: 'eatk-01',
      marginEnforcer: 'eatk-02',
      liquidationDigger: 'eatk-03',
      rumorKite: 'eatk-04',
      panicSiren: 'eatk-05',
    });
    // id 로 종류가 갈리므로, 같은 자리·같은 쿨다운이어도 그림이 달라야 한다.
    const ground = [0, 1, 2].map((id) => enemyHash({ id, lane: 'ground', x: 0.5, cooldownMs: 880 }));
    expect(new Set(ground).size).toBe(3);
    const air = [0, 1].map((id) => enemyHash({ id, lane: 'air', x: 0.5, cooldownMs: 880 }));
    expect(new Set(air).size).toBe(2);
  });

  test('공격 프레임 픽셀이 원본 `eAtk` 그리드와 일치한다 (원점은 정지 스프라이트 기준)', () => {
    const cooldownMs = 880;
    const foe = enemy({ id: 0, lane: 'ground', x: 0.5, cooldownMs });
    const target = createSpriteBattleSurface(800, 300);
    drawEnemies(target.ctx, palette, layout, [foe]);

    const kind = enemyKindForId('ground', 0);
    expect(kind).toBe('gapScout');
    const idle = spriteGrid(ENEMY_SPRITES[kind].key);
    const originX = Math.round(progressToX(foe.x, layout) - (idle[0]?.length ?? 0) / 2);
    const originY = Math.round(laneY('ground', layout) - idle.length / 2);

    const progress = attackAnimProgress(foe);
    expect(progress).not.toBeNull();
    const anim = ENEMY_ATTACK_ANIM[kind];
    const frame = entityAnimFrameGrid(anim, entityAnimFrameAt(anim, progress as number));
    expectGridMatches(target, frame, originX, originY, 1);
  });

  /* ── 걷기(원본 갱신분 `tf-walk-*`) ────────────────────────────────── */

  test('walkFrameAt — 위치가 프레임을 돌리고, 멈추면 프레임도 멈춘다', () => {
    // 트랙 1/160 마다 한 프레임. 같은 x 는 항상 같은 프레임이다(렌더러가 상태를 안 든다).
    expect(walkFrameAt(0, 4)).toBe(0);
    expect(walkFrameAt(1 / 160, 4)).toBe(1);
    expect(walkFrameAt(2 / 160, 4)).toBe(2);
    expect(walkFrameAt(4 / 160, 4)).toBe(0);
    expect(walkFrameAt(0.5, 4)).toBe(walkFrameAt(0.5, 4));
    expect(walkFrameAt(Number.NaN, 4)).toBe(0);
  });

  test('지상 유닛·적은 x 가 달라지면 걷기 프레임이 바뀐다', () => {
    const allyHash = (x: number): string => {
      const target = createSpriteBattleSurface(800, 300);
      drawAllies(target.ctx, palette, layout, [unit({ id: 0, kind: 'intern', x, cooldownMs: 0 })]);
      return hashRegion(target.surface, 0, 150, 800, 140);
    };
    // 같은 화면 위치가 되지 않도록 프레임만 다른 두 지점을 쓰지 말고, 프레임 위상 차이를 본다.
    const frames = [0, 1, 3].map((i) => walkFrameAt(0.5 + i / 160, 4));
    expect(new Set(frames).size).toBe(3);
    expect(allyHash(0.5)).not.toBe(allyHash(0.5 + 1 / 160));
  });

  /**
   * ⚠️ 공중 2종에는 걷기를 붙이지 않았다 — `walk` 은 아래 10px 띠를 다리로 보고 좌우로
   *    미는데, 다리가 없는 연·사이렌은 꼬리가 어긋나 보인다(`entity-anim.ts` 참조).
   */
  test('공중 적은 걷기 모션을 쓰지 않는다', () => {
    for (const key of ['tf-enemy-air-01', 'tf-enemy-air-02'] as const) {
      expect(walkAnimId(key)).toBeNull();
      expect(WALKABLE_SPRITE_KEYS).not.toContain(key);
    }
    expect(WALKABLE_SPRITE_KEYS).toHaveLength(6);
  });
});

describe('스프라이트를 못 그리는 환경', () => {
  test('벡터 전용 컨텍스트에서도 예외 없이 HP 바까지는 그린다', () => {
    const ctx = createFakeBattleCtx();

    expect(() => drawAllies(ctx, palette, layout, [unit()])).not.toThrow();
    expect(() => drawEnemies(ctx, palette, layout, [enemy()])).not.toThrow();
    expect(ctx.calls.some((call) => call.kind === 'fillRect')).toBe(true);
  });

  test('극소 캔버스에서도 크래시하지 않는다', () => {
    const tiny = computeBattleLayout(4, 4);
    const target = createSpriteBattleSurface(4, 4);

    expect(() => drawAllies(target.ctx, palette, tiny, [unit()])).not.toThrow();
    expect(() => drawEnemies(target.ctx, palette, tiny, [enemy()])).not.toThrow();
  });
});
