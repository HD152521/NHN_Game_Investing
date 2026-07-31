import { describe, expect, test } from 'vitest';

import { createTheme } from '../design/index.js';
import { makeCombatState as combatState, makeTower } from './combat-fixtures.js';
import { drawTowers } from './draw-towers.js';
import { computeBattleLayout } from './layout.js';
import { createFakeBattleCtx } from './fake-ctx.js';

const { palette } = createTheme();
const layout = computeBattleLayout(1024, 300);

function fillTexts(ctx: ReturnType<typeof createFakeBattleCtx>): string[] {
  return ctx.calls.filter((c) => c.kind === 'fillText').map((c) => (c.kind === 'fillText' ? c.text : ''));
}

describe('drawTowers — 슬롯 받침 · 슬롯 번호(가시성 수정)', () => {
  test('빈 슬롯마다 1-based 슬롯 번호 텍스트가 그려진다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towerSlots: 3, towers: [] });

    drawTowers(ctx, palette, layout, state, null, null);

    const texts = fillTexts(ctx);
    expect(texts).toContain('1');
    expect(texts).toContain('2');
    expect(texts).toContain('3');
  });

  test('슬롯마다 어두운 받침(LINE 토큰, 불투명) fillRect가 그려진다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towerSlots: 4, towers: [] });

    drawTowers(ctx, palette, layout, state, null, null);

    const platformFills = ctx.calls.filter((c) => c.kind === 'fillRect' && c.fillStyle === palette.LINE);
    expect(platformFills.length).toBeGreaterThanOrEqual(4);
  });

  test('받침은 지어진 타워가 있는 슬롯에도 그려진다(항상 슬롯 자리를 표시)', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [makeTower()] });

    drawTowers(ctx, palette, layout, state, null, null);

    const platformFills = ctx.calls.filter((c) => c.kind === 'fillRect' && c.fillStyle === palette.LINE);
    expect(platformFills.length).toBeGreaterThan(0);
  });

  test('빈 슬롯 기본 윤곽선은 TEXT 토큰(밝은 중립색)을 쓴다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [] });

    drawTowers(ctx, palette, layout, state, null, null);

    const outlineStrokes = ctx.calls.filter((c) => c.kind === 'strokeRect' && c.strokeStyle === palette.TEXT);
    expect(outlineStrokes.length).toBeGreaterThan(0);
  });

  test('받침이 있어도 빈 슬롯 미리보기(rgba) 판정은 그대로 동작한다(회귀 방지)', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [] });

    drawTowers(ctx, palette, layout, state, null, 'splash');

    const hasPreviewFill = ctx.calls.some(
      (call) => (call.kind === 'fill' || call.kind === 'fillRect') && call.fillStyle.startsWith('rgba('),
    );
    expect(hasPreviewFill).toBe(false);
  });
});
