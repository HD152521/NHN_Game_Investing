/**
 * 테스트 전용 `BattleCtx` 스파이.
 *
 * 픽셀 비교 대신 "무엇을 어떤 인자로 호출했는가"를 기록해 검증한다.
 * `src/chart/fake-ctx.ts`의 `FakeChartCtx`와 같은 아이디어이지만, 디렉터리 경계를
 * 지키기 위해 import하지 않고 이 파일 안에서 독립적으로 구현한다.
 * 프로덕션 코드에서는 절대 import하지 않는다.
 */

import type { BattleCtx } from './surface.js';

export type BattleCall =
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
  | { kind: 'strokeRect'; x: number; y: number; w: number; h: number; strokeStyle: string }
  | { kind: 'fillText'; text: string; x: number; y: number; fillStyle: string };

/** 문자열이 아닌 `fillStyle`/`strokeStyle`(그라디언트 등)은 테스트에서 쓰지 않으므로 문자열로 강제한다. */
function asString(value: string | CanvasGradient | CanvasPattern): string {
  return typeof value === 'string' ? value : '(non-string style)';
}

export interface FakeBattleCtx extends BattleCtx {
  readonly calls: readonly BattleCall[];
}

/** 빈 호출 기록을 가진 `BattleCtx` 스파이를 만든다. */
export function createFakeBattleCtx(): FakeBattleCtx {
  const calls: BattleCall[] = [];
  let currentDash: readonly number[] = [];

  const ctx: FakeBattleCtx = {
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
    strokeRect(x: number, y: number, w: number, h: number): void {
      calls.push({ kind: 'strokeRect', x, y, w, h, strokeStyle: asString(ctx.strokeStyle) });
    },
    fillText(text: string, x: number, y: number): void {
      calls.push({ kind: 'fillText', text, x, y, fillStyle: asString(ctx.fillStyle) });
    },
  };

  return ctx;
}
