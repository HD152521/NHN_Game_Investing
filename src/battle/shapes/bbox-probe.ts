/**
 * 그리기 호출 기록에서 **실제로 그려진 바운딩 박스**를 뽑아내는 테스트 전용 프로브.
 *
 * ★ 테스트 전용이다 — `fake-ctx.ts`·`combat-fixtures.ts`와 같은 성격으로 프로덕션 코드에서는
 *   절대 import하지 않는다.
 *
 * 왜 필요한가: "사환 < 통신원 < 반장", "리피터가 가장 높고 얇다" 같은 시트의 요구는
 * 상수 값을 비교해서는 검증이 안 된다(상수와 실제 경로가 갈라질 수 있다). 캔버스에 나간
 * 좌표를 그대로 모아 크기를 재야 그림이 실제로 그 서열을 갖는지 말할 수 있다.
 */

import type { BattleCall } from '../fake-ctx.js';

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

const EMPTY: Bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };

/** 호출 기록 전체를 감싸는 사각형. 좌표를 만들지 않는 호출(save/fill 등)은 무시한다. */
export function boundsOf(calls: readonly BattleCall[]): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let seen = false;

  const include = (x: number, y: number): void => {
    seen = true;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  for (const call of calls) {
    if (call.kind === 'moveTo' || call.kind === 'lineTo') {
      include(call.x, call.y);
    } else if (call.kind === 'arc') {
      include(call.x - call.radius, call.y - call.radius);
      include(call.x + call.radius, call.y + call.radius);
    } else if (call.kind === 'fillRect' || call.kind === 'strokeRect') {
      include(call.x, call.y);
      include(call.x + call.w, call.y + call.h);
    }
  }

  if (!seen) return EMPTY;
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

/** 세로/가로 비율 — 값이 클수록 "높고 얇다", 작을수록 "낮고 뭉툭하다". */
export function aspectRatio(bounds: Bounds): number {
  return bounds.width > 0 ? bounds.height / bounds.width : 0;
}

/** 원(`arc`)을 한 번이라도 그렸는가 — 둥근 실루엣(`rounded`)의 구조적 신호. */
export function hasArc(calls: readonly BattleCall[]): boolean {
  return calls.some((call) => call.kind === 'arc');
}
