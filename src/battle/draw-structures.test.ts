/**
 * 기지 2종 (아트 프로덕션 시트 v1.1 §07) 검사.
 *
 * 시트가 사옥에 요구한 유일한 동적 표현이 "피격 시 창 조명이 하나씩 꺼진다"이므로,
 * 그 규칙이 실제로 HP에 반응하는지를 그림 호출로 확인한다.
 */

import { describe, expect, test } from 'vitest';

import { createTheme } from '../design/index.js';
import { makeCombatState as combatState } from './combat-fixtures.js';
import { drawEnemyBase, drawHq } from './draw-structures.js';
import { createFakeBattleCtx } from './fake-ctx.js';
import type { FakeBattleCtx } from './fake-ctx.js';
import { computeBattleLayout } from './layout.js';
import { boundsOf, hasArc } from './shapes/bbox-probe.js';
import { HQ_WINDOW_TOTAL, litWindowCount } from './shapes/base-shapes.js';

const { palette } = createTheme();
const layout = computeBattleLayout(800, 300);

function hqWithHp(baseHp: number): FakeBattleCtx {
  const ctx = createFakeBattleCtx();
  drawHq(ctx, palette, layout, combatState({ baseHp, maxBaseHp: 100 }));
  return ctx;
}

function litWindows(ctx: FakeBattleCtx): number {
  return ctx.calls.filter((call) => call.kind === 'fillRect' && call.fillStyle === palette.GOLD).length;
}

describe('litWindowCount — HP 비율이 창 조명 수를 정한다', () => {
  test('만피면 전부 켜지고 0이면 전부 꺼진다', () => {
    expect(litWindowCount(1)).toBe(HQ_WINDOW_TOTAL);
    expect(litWindowCount(0)).toBe(0);
  });

  test('비율이 낮아질수록 켜진 창이 줄어든다(단조 감소)', () => {
    expect(litWindowCount(1)).toBeGreaterThan(litWindowCount(0.5));
    expect(litWindowCount(0.5)).toBeGreaterThan(litWindowCount(0.1));
  });

  test('범위를 벗어난 비율도 안전하게 잘린다', () => {
    expect(litWindowCount(5)).toBe(HQ_WINDOW_TOTAL);
    expect(litWindowCount(-1)).toBe(0);
  });
});

describe('drawHq — 아군 사옥(B-01)', () => {
  test('피격이 누적되면 켜진 창(GOLD)의 수가 실제로 줄어든다', () => {
    const full = litWindows(hqWithHp(100));
    const half = litWindows(hqWithHp(50));
    const dead = litWindows(hqWithHp(0));

    expect(full).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(dead);
    expect(dead).toBe(0);
  });

  test('둥근 첨탑 관(arc)을 그린다 — 아군은 rounded 진영', () => {
    expect(hasArc(hqWithHp(100).calls)).toBe(true);
  });

  test('사옥 실루엣이 사옥 영역 안에서 위로 자란다', () => {
    const bounds = boundsOf(hqWithHp(100).calls);
    expect(bounds.minY).toBeGreaterThanOrEqual(layout.hqRect.y - 1);
    expect(bounds.maxY).toBeLessThanOrEqual(layout.hqRect.y + layout.hqRect.h + 1);
  });
});

describe('drawEnemyBase — 베어 요새(B-02)', () => {
  test('원을 전혀 쓰지 않는다 — 적은 angular 진영', () => {
    const ctx = createFakeBattleCtx();
    drawEnemyBase(ctx, palette, layout);

    expect(hasArc(ctx.calls)).toBe(false);
  });

  test('상단 실루엣이 왼쪽에서 오른쪽으로 꺾여 내려간다(하강 차트선)', () => {
    const ctx = createFakeBattleCtx();
    drawEnemyBase(ctx, palette, layout);

    const bounds = boundsOf(ctx.calls);
    const topPoints = ctx.calls.filter(
      (call) => (call.kind === 'moveTo' || call.kind === 'lineTo') && call.y < bounds.minY + bounds.height * 0.4,
    );
    const leftTop = Math.min(...topPoints.map((c) => (c.kind === 'moveTo' || c.kind === 'lineTo' ? c.x : 0)));
    const highest = ctx.calls.reduce(
      (best, call) =>
        (call.kind === 'moveTo' || call.kind === 'lineTo') && call.y < best.y ? { x: call.x, y: call.y } : best,
      { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
    );

    // 가장 높은 지점이 요새의 왼쪽 절반에 있어야 "오른쪽으로 내려가는" 선이 된다.
    expect(topPoints.length).toBeGreaterThan(0);
    expect(highest.x).toBeLessThan(leftTop + bounds.width / 2);
  });
});

describe('극단 입력', () => {
  test('폭·높이 0 캔버스에서 기지를 그려도 예외가 없다', () => {
    const zero = computeBattleLayout(0, 0);
    const ctx = createFakeBattleCtx();

    expect(() => drawHq(ctx, palette, zero, combatState())).not.toThrow();
    expect(() => drawEnemyBase(ctx, palette, zero)).not.toThrow();
  });

  test('극소 캔버스에서는 창을 그리지 않아도 크래시하지 않는다', () => {
    const tiny = computeBattleLayout(12, 12);
    const ctx = createFakeBattleCtx();

    expect(() => drawHq(ctx, palette, tiny, combatState())).not.toThrow();
    expect(litWindows(ctx)).toBe(0);
  });
});
