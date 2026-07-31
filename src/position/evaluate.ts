/**
 * 포지션 평가 — "지금 청산하면 얼마인가"를 계산하는 순수 함수 (PRD FR-5.5, FR-5.6).
 *
 * 서버가 매 틱마다 이 함수로 강제 청산 여부를 확인하고, 클라이언트가 청산 버튼을 눌렀을 때도
 * 같은 함수로 손익을 확정한다 — 판정 경로가 하나뿐이어야 클라이언트 조작이 끼어들 여지가 없다.
 */

import { LIQ_WARN_RATIO } from './constants';
import type { OpenPosition, PositionEval, PositionParams } from './types';

/** 값을 [min, max] 범위로 자른다. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 보유 포지션을 `currentPrice`(서버가 계산한 해당 재생 시각의 가격) 기준으로 평가한다.
 *
 * `sigma`가 0이거나 `openPrice`가 0인 비정상 입력에서 나눗셈이 NaN/Infinity로 새면
 * 청산선 비교(`r <= -liqLine`)가 항상 false가 되어 강제 청산이 무력화될 수 있으므로,
 * 이 두 경우 모두 `deltaPct`/`z`를 0으로 방어한다. (stats.ts의 `SIGMA_FLOOR_PCT`가
 * 정상 경로에서는 sigma를 항상 양수로 보장하지만, 이 모듈은 그 불변식에 기대지 않는다.)
 */
export function evaluatePosition(
  position: OpenPosition,
  currentPrice: number,
  params: PositionParams,
): PositionEval {
  const sign = position.direction === 'long' ? 1 : -1;

  const deltaPct =
    position.openPrice === 0 ? 0 : sign * ((currentPrice - position.openPrice) / position.openPrice) * 100;

  const z = params.sigma === 0 ? 0 : deltaPct / params.sigma;

  const r = params.payoutBase * clamp(z, -params.zMax, params.zMax);

  // 골드/AUM은 정수 재화이므로 여기서 정수로 반올림한다 — 이 모듈 전체에서 유일한
  // 반올림 지점이다(이후 trade.ts의 정산은 이미 반올림된 이 값만 사용한다).
  // 원금 초과 손실은 없으므로(FR-5.6) −stake를 하한으로 다시 한번 자른다.
  const rawPnl = position.stake * r - position.fee;
  const pnl = Math.max(Math.round(rawPnl), -position.stake);

  const liquidated = r <= -position.liqLine;
  const warning = r <= -position.liqLine * LIQ_WARN_RATIO;

  return { deltaPct, z, r, pnl, liquidated, warning };
}
