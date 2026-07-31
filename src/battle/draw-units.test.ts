import { describe, expect, test } from 'vitest';

import { createTheme } from '../design/index.js';
import { makeEnemy as enemy, makeUnit as unit } from './combat-fixtures.js';
import { drawAllies, drawEnemies } from './draw-units.js';
import { computeBattleLayout } from './layout.js';
import { createFakeBattleCtx } from './fake-ctx.js';

const { palette } = createTheme();
const layout = computeBattleLayout(800, 300);

describe('drawAllies — 역할별 실루엣이 서로 다르다', () => {
  test('intern(근접)은 몸통(원) + 무기선을 그린다', () => {
    const ctx = createFakeBattleCtx();
    drawAllies(ctx, palette, layout, [unit({ kind: 'intern' })]);

    expect(ctx.calls.some((c) => c.kind === 'arc')).toBe(true);
    expect(ctx.calls.some((c) => c.kind === 'lineTo')).toBe(true);
  });

  test('analyst(원거리)는 몸통(사각) + 무기선 + 몸통에서 멀리 떨어진 발사체(점)를 그린다', () => {
    const ctx = createFakeBattleCtx();
    drawAllies(ctx, palette, layout, [unit({ kind: 'analyst' })]);

    const bodyRect = ctx.calls.find((c) => c.kind === 'fillRect');
    const arcs = ctx.calls.filter((c) => c.kind === 'arc');

    expect(bodyRect).toBeDefined();
    expect(arcs.length).toBeGreaterThan(0);
    if (bodyRect?.kind === 'fillRect' && arcs[0]?.kind === 'arc') {
      const bodyCenterX = bodyRect.x + bodyRect.w / 2;
      expect(Math.abs(arcs[0].x - bodyCenterX)).toBeGreaterThan(bodyRect.w);
    }
  });

  test('trader(탱커)는 다각형 실루엣 + 다른 유닛보다 두꺼운 외곽선을 가진다', () => {
    const internCtx = createFakeBattleCtx();
    drawAllies(internCtx, palette, layout, [unit({ kind: 'intern' })]);
    const internStroke = internCtx.calls.find((c) => c.kind === 'stroke');

    const traderCtx = createFakeBattleCtx();
    drawAllies(traderCtx, palette, layout, [unit({ kind: 'trader' })]);
    const traderStroke = traderCtx.calls.find((c) => c.kind === 'stroke');
    const traderLineToCount = traderCtx.calls.filter((c) => c.kind === 'lineTo').length;

    expect(internStroke).toBeDefined();
    expect(traderStroke).toBeDefined();
    expect(traderLineToCount).toBeGreaterThanOrEqual(4);
    if (traderStroke?.kind === 'stroke' && internStroke?.kind === 'stroke') {
      expect(traderStroke.lineWidth).toBeGreaterThan(internStroke.lineWidth);
    }
  });

  test('trader는 intern보다 몸체가 커서 더 넓은 범위에 그려진다', () => {
    const internCtx = createFakeBattleCtx();
    drawAllies(internCtx, palette, layout, [unit({ kind: 'intern' })]);
    const internArc = internCtx.calls.find((c) => c.kind === 'arc');

    const traderCtx = createFakeBattleCtx();
    drawAllies(traderCtx, palette, layout, [unit({ kind: 'trader' })]);
    const traderLines = traderCtx.calls.filter((c) => c.kind === 'lineTo' || c.kind === 'moveTo');
    const traderYs = traderLines.map((c) => (c.kind === 'lineTo' || c.kind === 'moveTo' ? c.y : 0));
    const traderSpanY = Math.max(...traderYs) - Math.min(...traderYs);

    expect(internArc).toBeDefined();
    if (internArc?.kind === 'arc') {
      expect(traderSpanY).toBeGreaterThan(internArc.radius * 2);
    }
  });
});

describe('가시성 수정 — 모든 실루엣에 LINE 토큰 외곽선이 둘러진다', () => {
  test('지상 적(마름모)에 LINE 색 외곽선이 그려진다', () => {
    const ctx = createFakeBattleCtx();
    drawEnemies(ctx, palette, layout, [enemy({ lane: 'ground' })]);

    const outline = ctx.calls.some((c) => c.kind === 'stroke' && c.strokeStyle === palette.LINE);
    expect(outline).toBe(true);
  });

  test('공중 적(쐐기)에 LINE 색 외곽선이 그려진다', () => {
    const ctx = createFakeBattleCtx();
    drawEnemies(ctx, palette, layout, [enemy({ lane: 'air' })]);

    const outline = ctx.calls.some((c) => c.kind === 'stroke' && c.strokeStyle === palette.LINE);
    expect(outline).toBe(true);
  });

  test('intern 몸통에 LINE 색 외곽선이 그려진다', () => {
    const ctx = createFakeBattleCtx();
    drawAllies(ctx, palette, layout, [unit({ kind: 'intern' })]);

    const outline = ctx.calls.some((c) => c.kind === 'stroke' && c.strokeStyle === palette.LINE);
    expect(outline).toBe(true);
  });

  test('analyst 몸통에 LINE 색 외곽선(strokeRect)이 그려진다', () => {
    const ctx = createFakeBattleCtx();
    drawAllies(ctx, palette, layout, [unit({ kind: 'analyst' })]);

    const outline = ctx.calls.some((c) => c.kind === 'strokeRect' && c.strokeStyle === palette.LINE);
    expect(outline).toBe(true);
  });
});
