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

  /**
   * 회귀 방지 — 슬롯에 **불투명한 어두운 받침을 깔지 않는다.**
   *
   * 예전에는 슬롯마다 불투명 `LINE`(#05070C, 거의 검정) 사각형을 먼저 깔았다. 배경이
   * 무엇이든 일정한 바탕을 만들려던 것인데, 타워 스프라이트가 **37~47%가 투명**이라
   * 배경이 비쳐야 할 자리를 그 판이 전부 덮었다 — 플레이 피드백 "포탑 뒤에 배경이
   * 너무 검어서 안 보인다"의 원인이다.
   *
   * 슬롯 위치 표시는 이제 `drawSlotDecals`(디자인 원본 `tf-gnd-slot` 3상태)가 맡는다.
   * 이 단언이 뒤집히면 포탑이 다시 검은 판에 묻힌다.
   */
  test('슬롯에 불투명 LINE 받침을 깔지 않는다 — 포탑이 가려지면 안 된다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towerSlots: 4, towers: [] });

    drawTowers(ctx, palette, layout, state, null, null);

    const opaquePlatform = ctx.calls.filter((c) => c.kind === 'fillRect' && c.fillStyle === palette.LINE);
    expect(opaquePlatform).toHaveLength(0);
  });

  test('지어진 타워가 있는 슬롯에도 불투명 받침이 없다', () => {
    const ctx = createFakeBattleCtx();
    const state = combatState({ towers: [makeTower()] });

    drawTowers(ctx, palette, layout, state, null, null);

    const opaquePlatform = ctx.calls.filter((c) => c.kind === 'fillRect' && c.fillStyle === palette.LINE);
    expect(opaquePlatform).toHaveLength(0);
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
