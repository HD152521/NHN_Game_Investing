import { describe, expect, test } from 'vitest';

import { createTheme, parseHex } from '../design/index.js';
import type { HexColor } from '../design/index.js';
import { createFakeBattleCtx } from './fake-ctx.js';
import { drawGroundState, groundSurfaceY } from './draw-ground.js';
import { computeBattleLayout } from './layout.js';

const { palette } = createTheme();
const layout = computeBattleLayout(1024, 300);

/** `style.ts`의 `rgba()` 출력 접두사 — 어떤 토큰으로 그렸는지 알파와 무관하게 판별한다. */
function rgbPrefix(hex: HexColor): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}`;
}

function strokeStyles(ctx: ReturnType<typeof createFakeBattleCtx>): string[] {
  return ctx.calls.filter((c) => c.kind === 'stroke').map((c) => (c.kind === 'stroke' ? c.strokeStyle : ''));
}

function countStrokesWith(ctx: ReturnType<typeof createFakeBattleCtx>, prefix: string): number {
  return strokeStyles(ctx).filter((style) => style.startsWith(prefix)).length;
}

function draw(state: 'intact' | 'cracked' | 'collapsed', reducedMotion = false) {
  const ctx = createFakeBattleCtx();
  drawGroundState(ctx, palette, layout, state, reducedMotion, 0);
  return ctx;
}

describe('drawGroundState — 지면선(1px 림 라이트)', () => {
  test('발판 상단 모서리에 1px 림 라이트를 그린다', () => {
    const ctx = draw('intact');
    const rim = ctx.calls.find((c) => c.kind === 'stroke' && c.strokeStyle.startsWith(rgbPrefix(palette.TEXT)));
    expect(rim).toBeDefined();
    expect(rim?.kind === 'stroke' ? rim.lineWidth : 0).toBe(1);
  });

  test('림 라이트는 발판 상단 y(groundSurfaceY)에 놓인다 — 모든 발이 이 선 위에 정렬된다', () => {
    const ctx = draw('intact');
    const surfaceY = groundSurfaceY(layout);
    const onSurface = ctx.calls.some((c) => c.kind === 'moveTo' && Math.abs(c.y - surfaceY) < 0.001);
    expect(onSurface).toBe(true);
  });

  test('세 상태 모두 림 라이트를 유지한다', () => {
    for (const state of ['intact', 'cracked', 'collapsed'] as const) {
      expect(countStrokesWith(draw(state), rgbPrefix(palette.TEXT))).toBeGreaterThan(0);
    }
  });
});

describe('drawGroundState — 3단계가 화면에서 구분된다', () => {
  test('정상에서는 균열을 그리지 않는다', () => {
    expect(countStrokesWith(draw('intact'), rgbPrefix(palette.LINE))).toBe(0);
  });

  test('균열에서는 균열선이 덧깔린다', () => {
    expect(countStrokesWith(draw('cracked'), rgbPrefix(palette.LINE))).toBeGreaterThan(0);
  });

  test('정상·균열 어디에도 청색 잔광은 없다 (함몰 전용)', () => {
    expect(countStrokesWith(draw('intact'), rgbPrefix(palette.ENEMY_DOWN))).toBe(0);
    expect(countStrokesWith(draw('cracked'), rgbPrefix(palette.ENEMY_DOWN))).toBe(0);
  });

  test('함몰은 균열 위에 청색 잔광만 더한다', () => {
    const ctx = draw('collapsed');
    expect(countStrokesWith(ctx, rgbPrefix(palette.LINE))).toBeGreaterThan(0);
    expect(countStrokesWith(ctx, rgbPrefix(palette.ENEMY_DOWN))).toBeGreaterThan(0);
  });

  test('함몰에 적색(아군색)이 섞이지 않는다 — 잔광은 청색만', () => {
    expect(countStrokesWith(draw('collapsed'), rgbPrefix(palette.UP_ALLY))).toBe(0);
  });
});

describe('drawGroundState — reduced-motion에서도 상태가 식별된다', () => {
  test('reduced-motion에서도 균열이 그대로 그려진다 (장식이 아니라 전황 표시)', () => {
    expect(countStrokesWith(draw('cracked', true), rgbPrefix(palette.LINE))).toBeGreaterThan(0);
  });

  test('reduced-motion에서도 함몰의 청색 잔광이 남는다', () => {
    expect(countStrokesWith(draw('collapsed', true), rgbPrefix(palette.ENEMY_DOWN))).toBeGreaterThan(0);
  });

  test('reduced-motion은 시각이 달라도 같은 그림을 낸다 (모션만 멈춘다)', () => {
    const ctxA = createFakeBattleCtx();
    const ctxB = createFakeBattleCtx();
    drawGroundState(ctxA, palette, layout, 'collapsed', true, 0);
    drawGroundState(ctxB, palette, layout, 'collapsed', true, 12_345);
    expect(ctxB.calls).toEqual(ctxA.calls);
  });

  test('모션이 켜져 있으면 시각에 따라 잔광 세기가 달라진다', () => {
    const ctxA = createFakeBattleCtx();
    const ctxB = createFakeBattleCtx();
    drawGroundState(ctxA, palette, layout, 'collapsed', false, 0);
    drawGroundState(ctxB, palette, layout, 'collapsed', false, 900);
    expect(ctxB.calls).not.toEqual(ctxA.calls);
  });
});

describe('drawGroundState — 방어', () => {
  test('캔버스 크기 0에서도 크래시하지 않고 아무것도 그리지 않는다', () => {
    const ctx = createFakeBattleCtx();
    const empty = computeBattleLayout(0, 0);
    expect(() => drawGroundState(ctx, palette, empty, 'collapsed', false, 0)).not.toThrow();
    expect(ctx.calls.length).toBe(0);
  });

  test('그림 안에 읽히는 글자·숫자를 넣지 않는다 (시트 공통 금지)', () => {
    for (const state of ['intact', 'cracked', 'collapsed'] as const) {
      expect(draw(state).calls.some((c) => c.kind === 'fillText')).toBe(false);
    }
  });
});
