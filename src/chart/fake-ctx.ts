/**
 * 테스트 전용 `ChartCtx` 스파이.
 *
 * 픽셀 비교 대신 "무엇을 어떤 인자로 호출했는가"를 기록해 검증한다.
 * `src/render/renderer.test.ts`의 `FakeCtx` 패턴과 동일한 아이디어를 차트 쪽에 맞게
 * 재사용 가능한 형태로 뽑아냈다. 프로덕션 코드에서는 절대 import하지 않는다.
 */

import type { ChartCtx } from './surface.js';

export type ChartCall =
  | { kind: 'save' }
  | { kind: 'restore' }
  | { kind: 'beginPath' }
  | { kind: 'closePath' }
  | { kind: 'stroke'; strokeStyle: string; lineWidth: number; dash: readonly number[] }
  | { kind: 'fill'; fillStyle: string }
  | { kind: 'moveTo'; x: number; y: number }
  | { kind: 'lineTo'; x: number; y: number }
  | { kind: 'arc'; x: number; y: number; radius: number }
  | { kind: 'setLineDash'; segments: readonly number[] }
  | { kind: 'fillRect'; x: number; y: number; w: number; h: number; fillStyle: string }
  | { kind: 'fillText'; text: string; x: number; y: number; fillStyle: string };

/** 문자열이 아닌 `fillStyle`/`strokeStyle`(그라디언트 등)은 테스트에서 쓰지 않으므로 문자열로 강제한다. */
function asString(value: string | CanvasGradient | CanvasPattern): string {
  return typeof value === 'string' ? value : '(non-string style)';
}

export interface FakeChartCtx extends ChartCtx {
  readonly calls: readonly ChartCall[];
}

/** 빈 호출 기록을 가진 `ChartCtx` 스파이를 만든다. */
export function createFakeChartCtx(): FakeChartCtx {
  const calls: ChartCall[] = [];
  let currentDash: readonly number[] = [];

  const ctx: FakeChartCtx = {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',

    save(): void {
      calls.push({ kind: 'save' });
    },
    restore(): void {
      calls.push({ kind: 'restore' });
    },
    beginPath(): void {
      calls.push({ kind: 'beginPath' });
    },
    closePath(): void {
      calls.push({ kind: 'closePath' });
    },
    moveTo(x: number, y: number): void {
      calls.push({ kind: 'moveTo', x, y });
    },
    lineTo(x: number, y: number): void {
      calls.push({ kind: 'lineTo', x, y });
    },
    arc(x: number, y: number, radius: number): void {
      calls.push({ kind: 'arc', x, y, radius });
    },
    stroke(): void {
      calls.push({
        kind: 'stroke',
        strokeStyle: asString(ctx.strokeStyle),
        lineWidth: ctx.lineWidth,
        dash: currentDash,
      });
    },
    fill(): void {
      calls.push({ kind: 'fill', fillStyle: asString(ctx.fillStyle) });
    },
    setLineDash(segments: number[]): void {
      currentDash = [...segments];
      calls.push({ kind: 'setLineDash', segments: currentDash });
    },
    fillRect(x: number, y: number, w: number, h: number): void {
      calls.push({ kind: 'fillRect', x, y, w, h, fillStyle: asString(ctx.fillStyle) });
    },
    fillText(text: string, x: number, y: number): void {
      calls.push({ kind: 'fillText', text, x, y, fillStyle: asString(ctx.fillStyle) });
    },
  };

  return ctx;
}
