/**
 * 랜덤워크 스케일링 회귀 테스트.
 *
 * synth.ts의 합성 1분봉이 "오래 들고 있을수록 이동폭이 커지는" 정상적인 랜덤워크
 * 성질을 지키는지 검증한다. 과거 버그(봉 사이 잡음이 기준선 대비 독립적으로 얹혀서
 * 2분 이동이 30분 이동보다 커지던 문제)의 회귀를 잡아내는 것이 이 파일의 목적이다.
 *
 * 통계 테스트라 시드를 40개(1~40) × 아키타입 4종으로 고정해 결정론적으로 만든다
 * (generateChartSet은 순수 함수라 같은 입력엔 항상 같은 결과를 낸다 — 플래키하지 않다).
 */

import { describe, expect, test } from 'vitest';

import { generateChartSet } from './synth';
import { SIGMA_FLOOR_PCT } from './stats';
import type { Archetype, Bar, ChartSet } from './types';

const ARCHETYPES: readonly Archetype[] = ['surge', 'plunge', 'range', 'reversal'];
const SEED_COUNT = 40;
const SEEDS: readonly number[] = Array.from({ length: SEED_COUNT }, (_, i) => i + 1);

/**
 * 강제 청산선 z값. `src/position/evaluate.ts`의 손익 공식(r = 0.90 × clamp(z, ±3),
 * r ≤ −1.0이면 강제 청산)에서 그대로 유도한다. `src/position`을 import하지 않기 위해
 * 계약을 이루는 상수 두 개(R_FORCE_LIQUIDATION, Z_TO_R_MULTIPLIER)만 여기 복제한다.
 */
const R_FORCE_LIQUIDATION = -1.0;
const Z_TO_R_MULTIPLIER = 0.9;
const FORCE_LIQUIDATION_Z = R_FORCE_LIQUIDATION / Z_TO_R_MULTIPLIER;

/** 모든 (아키타입 × 시드) 조합의 ChartSet을 미리 만들어 재사용한다. */
function allChartSets(): ChartSet[] {
  const sets: ChartSet[] = [];
  for (const archetype of ARCHETYPES) {
    for (const seed of SEEDS) {
      sets.push(generateChartSet(seed, archetype));
    }
  }
  return sets;
}

/** 봉 배열에서 `k`봉 간격의 모든 이동폭(%)을 뽑는다. `((close[i+k]-close[i])/close[i])*100`. */
function kBarDeltasPct(bars: readonly Bar[], k: number): number[] {
  const deltas: number[] = [];
  for (let i = 0; i + k < bars.length; i += 1) {
    const start = bars[i];
    const end = bars[i + k];
    if (!start || !end || start.c === 0) {
      continue;
    }
    deltas.push(((end.c - start.c) / start.c) * 100);
  }
  return deltas;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const lower = sorted[mid - 1];
  const upper = sorted[mid];
  if (sorted.length % 2 === 0 && lower !== undefined && upper !== undefined) {
    return (lower + upper) / 2;
  }
  const middle = sorted[mid];
  return middle ?? 0;
}

function standardDeviation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

describe('랜덤워크 스케일링 — k봉 이동폭은 k에 따라 단조 증가한다', () => {
  test('2봉 < 10봉 < 30봉 < 60봉 순으로 이동폭 표준편차가 커진다', () => {
    const sets = allChartSets();
    const holdingPeriods = [2, 10, 30, 60] as const;

    const stdByK = holdingPeriods.map((k) => {
      const allDeltas = sets.flatMap((set) => kBarDeltasPct(set.bars, k));
      return standardDeviation(allDeltas);
    });

    for (let i = 1; i < stdByK.length; i += 1) {
      const previous = stdByK[i - 1];
      const current = stdByK[i];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous === undefined || current === undefined) continue;
      expect(current).toBeGreaterThan(previous);
    }
  });

  test('아키타입별로도 2봉 < 30봉 이동폭 표준편차 순서가 지켜진다', () => {
    for (const archetype of ARCHETYPES) {
      const sets = SEEDS.map((seed) => generateChartSet(seed, archetype));
      const deltas2 = sets.flatMap((set) => kBarDeltasPct(set.bars, 2));
      const deltas30 = sets.flatMap((set) => kBarDeltasPct(set.bars, 30));
      expect(standardDeviation(deltas30)).toBeGreaterThan(standardDeviation(deltas2));
    }
  });
});

describe('랜덤워크 스케일링 — 보유시간별 z-score 목표 특성', () => {
  test('2봉(2분) 보유 시 |deltaPct/sigma30| 중앙값이 0.4 미만이다', () => {
    const sets = allChartSets();
    const z2 = sets.flatMap((set) => kBarDeltasPct(set.bars, 2).map((delta) => Math.abs(delta) / set.sigma30));
    expect(median(z2)).toBeLessThan(0.4);
  });

  test('30봉(30분) 보유 시 |deltaPct/sigma30| 중앙값이 0.6~1.8 범위에 든다', () => {
    const sets = allChartSets();
    const z30 = sets.flatMap((set) => kBarDeltasPct(set.bars, 30).map((delta) => Math.abs(delta) / set.sigma30));
    const medianZ30 = median(z30);
    expect(medianZ30).toBeGreaterThanOrEqual(0.6);
    expect(medianZ30).toBeLessThanOrEqual(1.8);
  });
});

describe('랜덤워크 스케일링 — 즉시 강제 청산률', () => {
  test('임의 시점 진입 후 2봉 뒤 z <= 강제청산선 비율이 전체 표본의 2% 미만이다', () => {
    const sets = allChartSets();
    let liquidatedCount = 0;
    let sampleCount = 0;

    for (const set of sets) {
      const deltas = kBarDeltasPct(set.bars, 2);
      for (const delta of deltas) {
        sampleCount += 1;
        const z = delta / set.sigma30;
        if (z <= FORCE_LIQUIDATION_Z) {
          liquidatedCount += 1;
        }
      }
    }

    expect(sampleCount).toBeGreaterThan(0);
    const liquidationRate = liquidatedCount / sampleCount;
    expect(liquidationRate).toBeLessThan(0.02);
  });
});

describe('랜덤워크 스케일링 — sigma30 하한 미발동', () => {
  test('40개 시드 × 4개 아키타입 어느 조합도 SIGMA_FLOOR_PCT에 걸리지 않는다', () => {
    const sets = allChartSets();
    for (const set of sets) {
      expect(set.sigma30).toBeGreaterThan(SIGMA_FLOOR_PCT);
    }
  });
});
