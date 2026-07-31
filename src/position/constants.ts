/**
 * 포지션 시스템 기본 상수 — PRD §9.1 예측 파라미터.
 *
 * "전부 서버 컨피그로 관리한다. 클라이언트 하드코딩 금지"(§9. 밸런스 상수표 서두)라는
 * 원칙에 따라, 여기 값들은 어디까지나 **기본값**이며 실제 배포에서는 서버 컨피그가
 * 이 값을 덮어써야 한다. `sigma`는 스테이지(ChartSet)마다 달라지므로 여기 포함하지 않는다.
 */

import type { PositionParams } from './types';

/** `sigma`를 제외한 매매 파라미터 기본값. §9.1. */
export const DEFAULT_POSITION_PARAMS: Omit<PositionParams, 'sigma'> = {
  payoutBase: 0.9,
  zMax: 3.0,
  feeRate: 0.01,
  liquidationLine: 1.0,
  minHoldMs: 2000,
  maxPositions: 24,
};

/** 청산선의 이 비율에 도달하면 UI가 적색 경고로 전환된다 (FR-5.6). */
export const LIQ_WARN_RATIO = 0.8;

/** 진입 UI에 노출되는 투입 비율 프리셋: 10% / 25% / 50% / 전액 (FR-5.1). */
export const STAKE_PRESETS: readonly number[] = [0.1, 0.25, 0.5, 1.0];
