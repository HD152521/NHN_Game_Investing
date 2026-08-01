import { describe, expect, test } from 'vitest';

import { createTheme } from '../design/index.js';
import { makeEnemy as enemy, makeUnit as unit } from './combat-fixtures.js';
import { drawAllies, drawEnemies } from './draw-units.js';
import { computeBattleLayout } from './layout.js';
import { createFakeBattleCtx } from './fake-ctx.js';
import type { FakeBattleCtx } from './fake-ctx.js';
import { boundsOf, hasArc } from './shapes/bbox-probe.js';
import { enemyKindForId } from './shapes/index.js';

const { palette } = createTheme();
const layout = computeBattleLayout(800, 300);

function allyCalls(kind: 'intern' | 'analyst' | 'trader'): FakeBattleCtx {
  const ctx = createFakeBattleCtx();
  drawAllies(ctx, palette, layout, [unit({ kind })]);
  return ctx;
}

function maxStrokeWidth(ctx: FakeBattleCtx): number {
  return ctx.calls.reduce((widest, call) => (call.kind === 'stroke' ? Math.max(widest, call.lineWidth) : widest), 0);
}

describe('drawAllies — 시트 §04 아군 3종', () => {
  test('크기 서열이 시트와 같다: 사환 < 통신원 < 반장', () => {
    const intern = boundsOf(allyCalls('intern').calls);
    const analyst = boundsOf(allyCalls('analyst').calls);
    const trader = boundsOf(allyCalls('trader').calls);

    expect(intern.height).toBeLessThan(analyst.height);
    expect(analyst.height).toBeLessThan(trader.height);
    expect(intern.width).toBeLessThan(trader.width);
  });

  test('개장벨 사환(A-01)은 종 모양 머리(반원)와 벨 채 곤봉(선 + 끝 원)을 그린다', () => {
    const ctx = allyCalls('intern');
    const arcs = ctx.calls.filter((c) => c.kind === 'arc');

    // 종 돔 · 몸통 · 곤봉 끝 채 — 곡선 부품이 최소 셋이다.
    expect(arcs.length).toBeGreaterThanOrEqual(3);
    expect(ctx.calls.some((c) => c.kind === 'lineTo')).toBe(true);
  });

  test('호가 통신원(A-02)은 등의 릴(원형 백팩)을 몸통 뒤쪽(-x)에 그린다', () => {
    const ctx = allyCalls('analyst');
    const cx = boundsOf(ctx.calls).minX + boundsOf(ctx.calls).width / 2;
    const arcs = ctx.calls.filter((c) => c.kind === 'arc');
    const behindBody = arcs.some((c) => c.kind === 'arc' && c.x < cx);

    expect(behindBody).toBe(true);
    // 접이식 집게 안테나 — 모든 곡선 부품(머리 포함)보다 위(작은 y)까지 뻗는 선이 있다.
    const highestCurveTop = arcs.reduce((top, c) => (c.kind === 'arc' ? Math.min(top, c.y - c.radius) : top), Number.POSITIVE_INFINITY);
    const highestLine = ctx.calls.reduce((top, c) => (c.kind === 'lineTo' ? Math.min(top, c.y) : top), Number.POSITIVE_INFINITY);
    expect(highestLine).toBeLessThan(highestCurveTop);
  });

  test('락업 반장(A-03)은 가장 두꺼운 외곽선의 큰 원형 방패를 가진다', () => {
    const traderCtx = allyCalls('trader');
    const internCtx = allyCalls('intern');

    expect(maxStrokeWidth(traderCtx)).toBeGreaterThan(maxStrokeWidth(internCtx));

    const internMaxRadius = internCtx.calls.reduce((r, c) => (c.kind === 'arc' ? Math.max(r, c.radius) : r), 0);
    const traderMaxRadius = traderCtx.calls.reduce((r, c) => (c.kind === 'arc' ? Math.max(r, c.radius) : r), 0);
    expect(traderMaxRadius).toBeGreaterThan(internMaxRadius);
  });

  test('아군 3종 모두 둥근 실루엣(원)을 포함한다 — 색약 모드의 진영 신호', () => {
    expect(hasArc(allyCalls('intern').calls)).toBe(true);
    expect(hasArc(allyCalls('analyst').calls)).toBe(true);
    expect(hasArc(allyCalls('trader').calls)).toBe(true);
  });
});

describe('drawEnemies — 시트 §05 악당', () => {
  test('지상 적 실루엣에 LINE 색 외곽선이 그려진다', () => {
    const ctx = createFakeBattleCtx();
    drawEnemies(ctx, palette, layout, [enemy({ lane: 'ground' })]);

    expect(ctx.calls.some((c) => c.kind === 'stroke' && c.strokeStyle === palette.LINE)).toBe(true);
  });

  test('공중 적 실루엣에 LINE 색 외곽선이 그려진다', () => {
    const ctx = createFakeBattleCtx();
    drawEnemies(ctx, palette, layout, [enemy({ lane: 'air' })]);

    expect(ctx.calls.some((c) => c.kind === 'stroke' && c.strokeStyle === palette.LINE)).toBe(true);
  });

  test('적 실루엣에는 원이 없다 — 각진 진영 신호(시트 00 이중 인코딩)', () => {
    const ground = createFakeBattleCtx();
    drawEnemies(ground, palette, layout, [enemy({ id: 0 }), enemy({ id: 1 }), enemy({ id: 2 })]);
    const air = createFakeBattleCtx();
    drawEnemies(air, palette, layout, [enemy({ id: 0, lane: 'air' }), enemy({ id: 1, lane: 'air' })]);

    expect(hasArc(ground.calls)).toBe(false);
    expect(hasArc(air.calls)).toBe(false);
  });

  test('id가 다르면 다른 종류의 실루엣이 나오고, 같은 id는 항상 같은 종류다', () => {
    expect(enemyKindForId('ground', 0)).not.toBe(enemyKindForId('ground', 1));
    expect(enemyKindForId('ground', 7)).toBe(enemyKindForId('ground', 7));
    expect(enemyKindForId('air', 0)).not.toBe(enemyKindForId('air', 1));
  });

  test('음수 id도 유효한 종류로 접힌다(크래시 방지)', () => {
    expect(enemyKindForId('ground', -5)).toBeTruthy();
    expect(enemyKindForId('air', -1)).toBeTruthy();
  });
});

describe('아군 실루엣 — 배경과의 분리(가시성)', () => {
  test('사환 몸통에 LINE 색 외곽선이 그려진다', () => {
    expect(allyCalls('intern').calls.some((c) => c.kind === 'stroke' && c.strokeStyle === palette.LINE)).toBe(true);
  });

  test('통신원 몸통에 LINE 색 외곽선이 그려진다', () => {
    expect(allyCalls('analyst').calls.some((c) => c.kind === 'stroke' && c.strokeStyle === palette.LINE)).toBe(true);
  });

  test('반장 몸통에 LINE 색 외곽선이 그려진다', () => {
    expect(allyCalls('trader').calls.some((c) => c.kind === 'stroke' && c.strokeStyle === palette.LINE)).toBe(true);
  });
});
