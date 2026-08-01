/**
 * 기지 2종 + 보스 렌더 검사 — 그려진 픽셀을 원본 스프라이트 그리드와 대조한다.
 *
 * ★ 사라진 검사와 그 이유 ★
 * 예전에는 `litWindowCount`(HP 비율 → 켜진 창 수)와 "둥근 첨탑(arc)", "꺾여 내려가는
 * 차트선" 을 검사했다. 그 셋은 전부 **아트 시트의 글 묘사만 보고 새로 발명한 도형**의
 * 성질이었고, 디자인 원본 드로잉 코드(`baseAlly` / `baseEnemy`)에는 존재하지 않는다.
 * 이식은 재해석 금지(PLAN 공통 제약)이므로 그 연출은 사라졌고, 사옥의 피해 표현은
 * **HP 바**가 담당한다 — 아래에서 HP 바가 실제로 HP에 반응하는지 확인한다.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { BOSS_IDENTITY } from '../combat/identity.js';
import { createTheme } from '../design/index.js';
import { spriteGrid } from '../sprites/index.js';
import { spriteRasters } from '../sprites/render/index.js';
import type { RenderableSpriteKey } from '../sprites/render/index.js';
import { createSoftwareSurface } from '../sprites/render/testing/software-canvas.js';
import { makeCombatState as combatState } from './combat-fixtures.js';
import { drawEnemyBase, drawHq } from './draw-structures.js';
import { BOSS_SPRITE, ENEMY_BASE_SPRITE, HQ_SPRITE } from './entity-sprites.js';
import { createFakeBattleCtx } from './fake-ctx.js';
import type { FakeBattleCtx } from './fake-ctx.js';
import { computeBattleLayout } from './layout.js';
import type { Rect } from './layout.js';
import { cellRgb, createSpriteBattleSurface, hashRegion, pixelAt } from './sprite-fake-ctx.js';
import type { SpriteBattleSurface } from './sprite-fake-ctx.js';

const { palette } = createTheme();
const layout = computeBattleLayout(800, 300);

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

/** `drawSpriteStanding` 과 같은 규칙(사각형 안 최대 정수 배율)을 테스트 쪽에서 다시 세운다. */
function standingPlacement(
  key: RenderableSpriteKey,
  rect: Rect,
  baselineY: number,
): { originX: number; originY: number; scale: number } {
  const grid = spriteGrid(key);
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const scale = Math.max(1, Math.min(Math.floor(rect.w / width), Math.floor(rect.h / height)));
  return {
    originX: Math.round(rect.x + (rect.w - width * scale) / 2),
    originY: Math.round(baselineY - height * scale),
    scale,
  };
}

/** 각 셀의 중심 픽셀만 표본으로 비교한다(정수 배율이므로 중심은 항상 정확히 그 셀이다). */
function expectSpriteMatchesGrid(
  target: SpriteBattleSurface,
  key: RenderableSpriteKey,
  rect: Rect,
  baselineY: number,
): void {
  const { originX, originY, scale } = standingPlacement(key, rect, baselineY);
  const grid = spriteGrid(key);
  const half = Math.floor(scale / 2);
  let painted = 0;

  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];
    if (row === undefined) continue;
    for (let x = 0; x < row.length; x += 1) {
      const cell = row[x];
      if (cell === undefined) continue;
      const expected = cellRgb(palette, cell);
      if (expected === null) continue;
      const pixel = pixelAt(target.surface, originX + x * scale + half, originY + y * scale + half);
      expect([pixel[0], pixel[1], pixel[2]], `${key} (${x}, ${y})`).toEqual([...expected]);
      painted += 1;
    }
  }

  expect(painted).toBeGreaterThan(0);
}

function hqWithHp(baseHp: number): FakeBattleCtx {
  const ctx = createFakeBattleCtx();
  drawHq(ctx, palette, layout, combatState({ baseHp, maxBaseHp: 100 }));
  return ctx;
}

describe('drawHq — 아군 사옥(원본 baseAlly)', () => {
  test('픽셀이 tf-base-ally 그리드와 일치하고, 지면선 위에 선다', () => {
    const target = createSpriteBattleSurface(800, 300);
    drawHq(target.ctx, palette, layout, combatState());

    expectSpriteMatchesGrid(target, HQ_SPRITE.key, layout.hqRect, layout.groundY);
  });

  test('사옥은 사옥 영역(hqRect) 안에 들어간다', () => {
    const { originX, originY, scale } = standingPlacement(HQ_SPRITE.key, layout.hqRect, layout.groundY);
    const grid = spriteGrid(HQ_SPRITE.key);

    expect(originX).toBeGreaterThanOrEqual(layout.hqRect.x);
    expect(originX + (grid[0]?.length ?? 0) * scale).toBeLessThanOrEqual(layout.hqRect.x + layout.hqRect.w);
    expect(originY).toBeGreaterThanOrEqual(layout.hqRect.y);
    expect(originY + grid.length * scale).toBeLessThanOrEqual(layout.hqRect.y + layout.hqRect.h);
  });

  test('HP 바 채움 폭이 HP 비율을 따라 줄어든다 — 피해의 유일한 시각 신호', () => {
    const fillWidth = (ctx: FakeBattleCtx): number =>
      ctx.calls.reduce((widest, call) => (call.kind === 'fillRect' && call.fillStyle === palette.UP_ALLY ? call.w : widest), 0);

    const full = fillWidth(hqWithHp(100));
    const half = fillWidth(hqWithHp(50));
    const dead = fillWidth(hqWithHp(0));

    expect(full).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(dead);
    expect(dead).toBe(0);
  });
});

describe('drawEnemyBase — 베어 요새(원본 baseEnemy)', () => {
  test('픽셀이 tf-base-enemy 그리드와 일치한다', () => {
    const target = createSpriteBattleSurface(800, 300);
    drawEnemyBase(target.ctx, palette, layout);

    expectSpriteMatchesGrid(target, ENEMY_BASE_SPRITE.key, layout.baseRect, layout.groundY);
  });

  test('요새에는 HP 바를 그리지 않는다(체력 데이터가 없다)', () => {
    const ctx = createFakeBattleCtx();
    drawEnemyBase(ctx, palette, layout);

    expect(ctx.calls.some((call) => call.kind === 'fillRect')).toBe(false);
  });
});

describe('보스 B-03 마진콜 심판관 — 마지막 웨이브에만 요새 앞에 선다', () => {
  function baseRegion(state: Parameters<typeof drawEnemyBase>[3]): string {
    const target = createSpriteBattleSurface(800, 300);
    drawEnemyBase(target.ctx, palette, layout, state);
    return hashRegion(target.surface, 700, 30, 95, 265);
  }

  test('등장 웨이브 전에는 요새만 보인다', () => {
    expect(baseRegion(combatState({ wave: BOSS_IDENTITY.appearWave - 1 }))).toBe(baseRegion(null));
  });

  test('등장 웨이브부터 보스 스프라이트가 겹쳐 그려진다', () => {
    expect(baseRegion(combatState({ wave: BOSS_IDENTITY.appearWave }))).not.toBe(baseRegion(null));
  });

  test('보스는 요새와 같은 지면선 위에 선다', () => {
    const target = createSpriteBattleSurface(800, 300);
    drawEnemyBase(target.ctx, palette, layout, combatState({ wave: BOSS_IDENTITY.appearWave }));

    // 보스가 요새 위에 덮이므로, 보스 그리드의 불투명 픽셀만 검사한다.
    expectSpriteMatchesGrid(target, BOSS_SPRITE.key, layout.baseRect, layout.groundY);
  });
});

describe('극단 입력', () => {
  test('폭·높이 0 캔버스에서 기지를 그려도 예외가 없다', () => {
    const zero = computeBattleLayout(0, 0);
    const ctx = createFakeBattleCtx();

    expect(() => drawHq(ctx, palette, zero, combatState())).not.toThrow();
    expect(() => drawEnemyBase(ctx, palette, zero)).not.toThrow();
  });

  test('극소 캔버스에서도 크래시하지 않는다', () => {
    const tiny = computeBattleLayout(12, 12);
    const target = createSpriteBattleSurface(12, 12);

    expect(() => drawHq(target.ctx, palette, tiny, combatState())).not.toThrow();
    expect(() => drawEnemyBase(target.ctx, palette, tiny, combatState())).not.toThrow();
  });
});
