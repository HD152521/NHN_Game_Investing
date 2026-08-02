import { describe, expect, test } from 'vitest';

import { AUM_SETTLEMENT_RATIO, MIN_PROFIT_CLOSES_FOR_AUM_CREDIT } from '../position';
import type { SettlementInput } from './settlement';
import {
  computeSettlement,
  gradeOf,
  resolveStageOutcome,
  settlementRows,
  settlementTitle,
} from './settlement';

/**
 * FR-8 정산은 **화면에 처음 붙는 기능**이다(감사 리포트: "FR-8.1 정산이 셸에 아예 없다").
 * 수식은 PRD 를 그대로 옮긴 것이므로, 여기서는 PRD 수용 기준을 그대로 케이스로 쓴다.
 */

function baseInput(overrides: Partial<SettlementInput> = {}): SettlementInput {
  return {
    outcome: 'cleared',
    remainingGold: 0,
    remainingAum: 0,
    totalGoldEarned: 1000,
    closeCount: 0,
    profitCloseCount: 0,
    baseHp: 100,
    maxBaseHp: 100,
    enemyBaseDestroyed: false,
    ...overrides,
  };
}

describe('resolveStageOutcome — 결과 판정', () => {
  test('전투가 스스로 끝나면 그 결과를 따른다', () => {
    expect(
      resolveStageOutcome({ phase: 'cleared', marketClosed: true, overtimeRemainingMs: 0 }),
    ).toBe('cleared');
    expect(
      resolveStageOutcome({ phase: 'defeated', marketClosed: false, overtimeRemainingMs: 5 }),
    ).toBe('defeated');
  });

  /**
   * ★ CLICK-PATH-001 의 핵심 ★
   * 재생 종료(390초)와 전투 종료는 같은 사건이 될 수 없다. 장이 마감돼도 연장이 남아 있으면
   * 아직 결과가 아니다 — 전투를 계속 굴려야 한다.
   */
  test('장이 마감돼도 연장이 남아 있으면 아직 결과가 아니다', () => {
    expect(
      resolveStageOutcome({ phase: 'running', marketClosed: true, overtimeRemainingMs: 12_000 }),
    ).toBeNull();
  });

  test('연장까지 소진되면 unresolved — baseHp > 0 만으로 클리어를 선언하지 않는다 (FR-6.10)', () => {
    expect(
      resolveStageOutcome({ phase: 'running', marketClosed: true, overtimeRemainingMs: 0 }),
    ).toBe('unresolved');
  });

  test('평소 프레임에는 결과가 없다', () => {
    expect(
      resolveStageOutcome({ phase: 'running', marketClosed: false, overtimeRemainingMs: 0 }),
    ).toBeNull();
  });
});

describe('computeSettlement — FR-8.1 · FR-8.2', () => {
  test('PRD 수용 기준: 골드율 25% · 적중률 68% · HP 95% → 6점 S등급', () => {
    const settlement = computeSettlement(
      baseInput({
        remainingGold: 250,
        totalGoldEarned: 1000,
        closeCount: 25,
        profitCloseCount: 17, // 68%
        baseHp: 95,
      }),
    );

    expect(settlement.score).toBe(6);
    expect(settlement.grade).toBe('S');
    expect(settlement.gradeMultiplier).toBeCloseTo(1.6);
  });

  test('적중률 보너스는 상위 구간만 적용된다 (중복 아님)', () => {
    const mid = computeSettlement(baseInput({ closeCount: 10, profitCloseCount: 6, baseHp: 99 }));
    const high = computeSettlement(baseInput({ closeCount: 10, profitCloseCount: 7, baseHp: 99 }));

    expect(mid.bonusMultiplier).toBeCloseTo(1.15);
    expect(high.bonusMultiplier).toBeCloseTo(1.3);
  });

  test('본진 HP 만점이면 +0.20 이 붙는다', () => {
    const full = computeSettlement(baseInput({ baseHp: 100, maxBaseHp: 100 }));
    const chipped = computeSettlement(baseInput({ baseHp: 99, maxBaseHp: 100 }));

    expect(full.bonusMultiplier).toBeCloseTo(1.2);
    expect(chipped.bonusMultiplier).toBeCloseTo(1.0);
  });

  test('aumGate — 이익 청산이 모자라면 잔여 AUM 은 자본금이 되지 않는다', () => {
    const blocked = computeSettlement(
      baseInput({
        remainingAum: 2000,
        closeCount: MIN_PROFIT_CLOSES_FOR_AUM_CREDIT,
        profitCloseCount: MIN_PROFIT_CLOSES_FOR_AUM_CREDIT - 1,
      }),
    );
    const opened = computeSettlement(
      baseInput({
        remainingAum: 2000,
        closeCount: MIN_PROFIT_CLOSES_FOR_AUM_CREDIT,
        profitCloseCount: MIN_PROFIT_CLOSES_FOR_AUM_CREDIT,
      }),
    );

    expect(blocked.aumCredit).toBe(0);
    expect(opened.aumCredit).toBe(Math.floor(2000 * AUM_SETTLEMENT_RATIO));
  });

  /** FR-6.9 — "패배 시 정산 없음, 자본금 0". 지표는 보여주되 자본금은 준다고 하지 않는다. */
  test('패배는 자본금 0 (FR-6.9)', () => {
    const settlement = computeSettlement(
      baseInput({ outcome: 'defeated', remainingGold: 900, baseHp: 0 }),
    );
    expect(settlement.capital).toBe(0);
    expect(settlement.goldRatio).toBeGreaterThan(0); // 지표 자체는 계산된다
  });

  /** PRD 에 없는 상태 — FR-6.10 승리 조건을 못 채웠으므로 보수적으로 보상 없음. */
  test('unresolved 도 자본금 0 이다', () => {
    expect(computeSettlement(baseInput({ outcome: 'unresolved', remainingGold: 900 })).capital).toBe(
      0,
    );
  });

  test('클리어는 기본 자본금 × 보너스 × 등급 배수를 내림한 값이다', () => {
    const settlement = computeSettlement(
      baseInput({ outcome: 'cleared', remainingGold: 300, totalGoldEarned: 1000, baseHp: 100 }),
    );
    // 골드율 30% → 2점, 적중률 0 → 0점, HP 100% → 2점 = 4점 A(1.3), 보너스 1.2
    expect(settlement.grade).toBe('A');
    expect(settlement.capital).toBe(Math.floor(300 * 1.2 * 1.3));
  });

  test('청산이 한 번도 없으면 적중률은 0이고 나눗셈이 터지지 않는다', () => {
    const settlement = computeSettlement(baseInput({ closeCount: 0, profitCloseCount: 0 }));
    expect(settlement.accuracy).toBe(0);
  });

  test('총 획득 골드가 0이면 잔여골드율은 0이다', () => {
    expect(computeSettlement(baseInput({ totalGoldEarned: 0 })).goldRatio).toBe(0);
  });
});

describe('gradeOf — FR-8.2 등급 경계', () => {
  test('S 6점 / A 4~5 / B 2~3 / C 0~1', () => {
    expect(gradeOf(7)).toBe('S');
    expect(gradeOf(6)).toBe('S');
    expect(gradeOf(5)).toBe('A');
    expect(gradeOf(4)).toBe('A');
    expect(gradeOf(3)).toBe('B');
    expect(gradeOf(2)).toBe('B');
    expect(gradeOf(1)).toBe('C');
    expect(gradeOf(0)).toBe('C');
  });
});

describe('결과 표시', () => {
  test('세 결과가 서로 다른 제목을 갖는다 (무음 종료가 없다)', () => {
    const titles = new Set(
      (['cleared', 'defeated', 'unresolved'] as const).map((o) => settlementTitle(o)),
    );
    expect(titles.size).toBe(3);
    for (const title of titles) {
      expect(title.length).toBeGreaterThan(0);
    }
  });

  test('정산 항목에 잔여 골드·AUM·자본금이 반드시 들어간다', () => {
    const settlement = computeSettlement(baseInput({ remainingGold: 250, remainingAum: 40 }));
    const rows = settlementRows(
      settlement,
      { gold: 250, aum: 40 },
      { closeCount: 3, profitCloseCount: 2 },
    );
    const labels = rows.map((row) => row.label);

    expect(labels).toContain('잔여 골드');
    expect(labels).toContain('잔여 AUM');
    expect(labels).toContain('자본금');
    expect(rows.find((row) => row.label === '잔여 골드')?.value).toContain('250');
    expect(rows.find((row) => row.label === '적중률')?.value).toContain('(2/3)');
  });
});
