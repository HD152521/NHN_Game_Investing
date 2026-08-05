import { describe, expect, test } from 'vitest';

/**
 * 부서 업그레이드 검증 (FR-11).
 *
 * 세 가지를 집중해서 본다:
 * ① **합연산**인가 (FR-11.3) — 곱연산이 섞이면 레벨이 오를수록 실효 증가폭이 커진다.
 * ② 표시 문자열과 실제 효과가 **같은 값을 말하는가** — 이 파일에서 유일하게 이중 출처가
 *    될 수 있는 자리다.
 * ③ 수용 기준(FR-11.2 하단)이 실제로 성립하는가.
 * ④ **법무팀이 숙련자에게도 0이 아닌가** (GAME.md §16-6 실측이 남긴 계약) — 맨 아래 블록.
 */
import { DEFAULT_POSITION_PARAMS, GOLD_CONVERSION } from '../position';
import { STAGES } from '../combat';
import {
  DEPARTMENTS,
  DEPARTMENT_ORDER,
  MAX_DEPARTMENT_LEVEL,
  applyUpgrade,
  baseDepartments,
  canUpgrade,
  companyRank,
  departmentSpec,
  liquidationLineFor,
  normalizeDepartments,
  settlementBonusFor,
  shortfall,
  startingAumFor,
  totalLevels,
  towerDamageMultiplier,
  tradeFeeRateFor,
  unitHpMultiplier,
  upgradeCost,
} from './departments';
import type { DepartmentId, DepartmentLevel, DepartmentLevels } from './departments';

const at = (id: DepartmentId, level: DepartmentLevel): DepartmentLevels => ({
  ...baseDepartments(),
  [id]: level,
});

describe('부서 표', () => {
  test('5종이다', () => {
    expect(DEPARTMENTS).toHaveLength(5);
    expect(DEPARTMENT_ORDER).toEqual(['desk', 'rnd', 'hr', 'legal', 'ir']);
  });

  test('기본은 전부 Lv1이다 — Lv0은 없다', () => {
    for (const id of DEPARTMENT_ORDER) {
      expect(baseDepartments()[id]).toBe(1);
    }
  });

  test('부서마다 비용이 정확히 2개다 (Lv1→2, Lv2→3)', () => {
    for (const dept of DEPARTMENTS) {
      expect(dept.costs).toHaveLength(2);
      expect(dept.costs[0]).toBeLessThan(dept.costs[1]);
    }
  });

  test('PRD FR-11.2의 비용표와 일치한다', () => {
    const expected: Readonly<Record<DepartmentId, readonly [number, number]>> = {
      desk: [1200, 3000],
      rnd: [800, 2000],
      hr: [800, 2000],
      legal: [1500, 3500],
      ir: [1000, 2500],
    };
    for (const dept of DEPARTMENTS) {
      expect(dept.costs).toEqual(expected[dept.id]);
    }
  });
});

describe('★ 표시 문자열과 실제 효과가 같은 값을 말한다', () => {
  test('R&D 표시(+0/+8/+16%)가 배수와 맞는다', () => {
    expect(towerDamageMultiplier(at('rnd', 1))).toBeCloseTo(1.0);
    expect(towerDamageMultiplier(at('rnd', 2))).toBeCloseTo(1.08);
    expect(towerDamageMultiplier(at('rnd', 3))).toBeCloseTo(1.16);
  });

  test('인사팀 표시(+0/+10/+20%)가 배수와 맞는다', () => {
    expect(unitHpMultiplier(at('hr', 1))).toBeCloseTo(1.0);
    expect(unitHpMultiplier(at('hr', 2))).toBeCloseTo(1.1);
    expect(unitHpMultiplier(at('hr', 3))).toBeCloseTo(1.2);
  });

  test('법무팀 표시(1.00/1.15/1.30)가 청산선과 맞는다', () => {
    expect(liquidationLineFor(at('legal', 1))).toBeCloseTo(1.0);
    expect(liquidationLineFor(at('legal', 2))).toBeCloseTo(1.15);
    expect(liquidationLineFor(at('legal', 3))).toBeCloseTo(1.3);
  });

  test('IR팀 표시(+0/+5/+10%)가 가산분과 맞는다', () => {
    expect(settlementBonusFor(at('ir', 1))).toBeCloseTo(0);
    expect(settlementBonusFor(at('ir', 2))).toBeCloseTo(0.05);
    expect(settlementBonusFor(at('ir', 3))).toBeCloseTo(0.1);
  });

  test('법무팀 Lv1은 기본 상수를 그대로 따른다 (표에 적힌 1.00을 다시 적지 않는다)', () => {
    expect(liquidationLineFor(baseDepartments())).toBe(DEFAULT_POSITION_PARAMS.liquidationLine);
  });

  test('법무팀 Lv1의 수수료도 기본 상수 그대로다', () => {
    expect(tradeFeeRateFor(baseDepartments())).toBe(DEFAULT_POSITION_PARAMS.feeRate);
  });

  test('법무팀 수수료가 1.0% / 0.6% / 0.2%다', () => {
    expect(tradeFeeRateFor(at('legal', 1))).toBeCloseTo(0.01);
    expect(tradeFeeRateFor(at('legal', 2))).toBeCloseTo(0.006);
    expect(tradeFeeRateFor(at('legal', 3))).toBeCloseTo(0.002);
  });

  test('★ 화면이 부서의 절반을 숨기지 않는다 — 효과 문구가 두 축을 다 말한다', () => {
    // 청산선만 적어 두면 "왜 이걸 사지?"에 대한 답이 조건부 보험 하나로 보인다(§16-6).
    const effect = departmentSpec('legal').effect;
    expect(effect).toContain('청산선');
    expect(effect).toContain('수수료');
  });
});

/**
 * ★★ 이 파일의 핵심 계약 — 법무팀은 숙련자에게도 0이 아니다 (GAME.md §16-6) ★★
 *
 * 실측: 손절 규율을 쓰면 강제청산율이 0.1% → 0.0%이고 ρ는 청산선 1.00/1.15/1.30에서
 * 전부 +2.2%로 **완전히 동일**했다. 청산선 완화는 강제청산이 일어나야만 지불되는
 * 조건부 보험이라, 손절을 익힌 플레이어에게는 효과가 정확히 0이다.
 *
 * 아래 테스트는 **강제청산이 한 번도 없는 세션**을 모형화한다. 그 세션에서 청산선은
 * 손익식에 한 번도 등장하지 않으므로, 남아서 값을 하는 것은 상시 비용(수수료)뿐이다.
 * 이 블록이 깨진다면 법무팀이 다시 "잘하면 죽는 부서"로 돌아간 것이다 —
 * **수치를 맞추려 테스트를 지우지 말고 부서 효과를 다시 설계해라.**
 */
describe('★★ 법무팀 — 숙련자 가치 0 문제 (§16-6)', () => {
  /**
   * 강제청산 0회 세션의 총 투입액. R1 기준 `S = 시작 AUM 2,000 + 150 × 13 = 3,950`,
   * 봇 실측 소진율 93% → 3,674. AUM은 일방통행 파이프라 `Σstake ≤ S`가 못 박혀 있고,
   * **손절을 하든 안 하든 이 총액은 같다** — 그래서 수수료 절감은 전략과 무관하다.
   */
  const SESSION_STAKE = 3674;

  /** 청산선이 한 번도 닿지 않은 세션에서 법무팀이 만들어내는 골드 이득. */
  function goldGainWithoutAnyLiquidation(level: DepartmentLevel): number {
    const feeSaved =
      SESSION_STAKE * (tradeFeeRateFor(at('legal', 1)) - tradeFeeRateFor(at('legal', level)));
    // 청산 대금은 `GOLD_CONVERSION` 비율로만 골드가 된다 — 아낀 수수료도 같은 파이프를 탄다.
    return feeSaved * GOLD_CONVERSION;
  }

  test('★ 강제청산이 0회여도 레벨을 올리면 이득이 남는다 (이것이 계약이다)', () => {
    expect(goldGainWithoutAnyLiquidation(1)).toBe(0);
    expect(goldGainWithoutAnyLiquidation(2)).toBeGreaterThan(0);
    expect(goldGainWithoutAnyLiquidation(3)).toBeGreaterThan(goldGainWithoutAnyLiquidation(2));
  });

  test('상시 이득의 크기가 "소액"이되 눈에 띄는 자리에 있다 (Lv3 ≈ +15 G/판)', () => {
    // 아래로 새면 사실상 0이고, 위로 새면 조건부 보험이 아니라 이쪽이 본체가 된다.
    expect(goldGainWithoutAnyLiquidation(3)).toBeGreaterThan(10);
    expect(goldGainWithoutAnyLiquidation(3)).toBeLessThan(40);
  });

  test('★ 수수료는 어떤 레벨에서도 0보다 크다 — `E[ρ] ≤ −feeRate` 정리를 지킨다', () => {
    // 0이 되면 "마팅게일 경로에서 매매는 기대적으로 손해"(§19-11)가 무너진다.
    for (const level of [1, 2, 3] as const) {
      expect(tradeFeeRateFor(at('legal', level))).toBeGreaterThan(0);
    }
  });

  test('레벨이 오를수록 수수료가 엄격히 낮아진다 (역전·정체 없음)', () => {
    expect(tradeFeeRateFor(at('legal', 2))).toBeLessThan(tradeFeeRateFor(at('legal', 1)));
    expect(tradeFeeRateFor(at('legal', 3))).toBeLessThan(tradeFeeRateFor(at('legal', 2)));
  });

  test('수수료 감면 폭이 레벨마다 일정하다 (FR-11.3 곱연산 금지)', () => {
    const step1 = tradeFeeRateFor(at('legal', 1)) - tradeFeeRateFor(at('legal', 2));
    const step2 = tradeFeeRateFor(at('legal', 2)) - tradeFeeRateFor(at('legal', 3));
    expect(step1).toBeCloseTo(step2);
  });

  test('청산선 완화는 그대로 살아 있다 — 초보 보험을 없애 바꾼 것이 아니다', () => {
    // 실측에서 강제청산율 28.4% → 17.5%, 총골드 2,118 → 2,171을 만든 효과다.
    expect(liquidationLineFor(at('legal', 3))).toBeGreaterThan(liquidationLineFor(at('legal', 1)));
  });

  test('수수료 효과는 법무팀에만 붙는다 — 다른 부서를 올려도 요율이 그대로다', () => {
    for (const id of ['desk', 'rnd', 'hr', 'ir'] as const) {
      expect(tradeFeeRateFor(at(id, 3))).toBe(tradeFeeRateFor(baseDepartments()));
    }
  });

  test('손상된 저장값에서도 요율이 유한하고 양수다', () => {
    const levels = normalizeDepartments({ legal: 99 });
    expect(Number.isFinite(tradeFeeRateFor(levels))).toBe(true);
    expect(tradeFeeRateFor(levels)).toBeGreaterThan(0);
  });
});

describe('트레이딩 데스크 — 가산분이지 절대값이 아니다', () => {
  test('Lv1은 지역 기본값 그대로다', () => {
    for (const id of ['R1', 'R2', 'R3'] as const) {
      expect(startingAumFor(id, baseDepartments())).toBe(STAGES[id].startingAum);
    }
  });

  test('★ 지역마다 다른 기본값 위에 같은 가산분이 얹힌다 — 지역 난이도가 덮이지 않는다', () => {
    for (const id of ['R1', 'R2', 'R3'] as const) {
      expect(startingAumFor(id, at('desk', 2))).toBe(STAGES[id].startingAum + 400);
      expect(startingAumFor(id, at('desk', 3))).toBe(STAGES[id].startingAum + 800);
    }
  });

  test('수용 기준: 데스크 Lv2 · R3 진입 → 기본 + 400', () => {
    expect(startingAumFor('R3', at('desk', 2))).toBe(STAGES.R3.startingAum + 400);
  });
});

describe('★ 합연산이다 (FR-11.3 곱연산 금지)', () => {
  test('R&D 레벨 증가분이 일정하다 — 위로 휘지 않는다', () => {
    const step1 = towerDamageMultiplier(at('rnd', 2)) - towerDamageMultiplier(at('rnd', 1));
    const step2 = towerDamageMultiplier(at('rnd', 3)) - towerDamageMultiplier(at('rnd', 2));
    expect(step1).toBeCloseTo(step2);
  });

  test('인사팀 레벨 증가분이 일정하다', () => {
    const step1 = unitHpMultiplier(at('hr', 2)) - unitHpMultiplier(at('hr', 1));
    const step2 = unitHpMultiplier(at('hr', 3)) - unitHpMultiplier(at('hr', 2));
    expect(step1).toBeCloseTo(step2);
  });

  test('부서는 서로 독립이다 — 한 부서를 올려도 다른 효과가 변하지 않는다', () => {
    const onlyRnd = at('rnd', 3);
    expect(unitHpMultiplier(onlyRnd)).toBe(unitHpMultiplier(baseDepartments()));
    expect(liquidationLineFor(onlyRnd)).toBe(liquidationLineFor(baseDepartments()));
    expect(settlementBonusFor(onlyRnd)).toBe(settlementBonusFor(baseDepartments()));
  });
});

describe('업그레이드 비용과 가용성', () => {
  test('Lv1에서는 첫 비용, Lv2에서는 둘째 비용이다', () => {
    expect(upgradeCost('rnd', at('rnd', 1))).toBe(800);
    expect(upgradeCost('rnd', at('rnd', 2))).toBe(2000);
  });

  test('★ 최대 레벨이면 null이다 — 0이 아니다', () => {
    expect(upgradeCost('rnd', at('rnd', MAX_DEPARTMENT_LEVEL))).toBeNull();
    // 0을 돌려주면 화면이 "0원으로 업그레이드"라는 눌리는 버튼을 그린다.
    expect(canUpgrade('rnd', at('rnd', 3), 999_999)).toBe(false);
  });

  test('자본금이 정확히 비용과 같으면 살 수 있다 (경계값)', () => {
    expect(canUpgrade('rnd', baseDepartments(), 800)).toBe(true);
    expect(canUpgrade('rnd', baseDepartments(), 799)).toBe(false);
  });

  test('부족액을 정확히 말한다 (FR-11.4)', () => {
    expect(shortfall('legal', baseDepartments(), 0)).toBe(1500);
    expect(shortfall('legal', baseDepartments(), 1400)).toBe(100);
    expect(shortfall('legal', baseDepartments(), 1500)).toBe(0);
  });

  test('최대 레벨의 부족액은 0이다 — 살 것이 없지 부족한 것이 아니다', () => {
    expect(shortfall('rnd', at('rnd', 3), 0)).toBe(0);
  });
});

describe('업그레이드 적용 — 불변, 환불 없음', () => {
  test('성공하면 레벨이 오르고 자본금이 줄어든다', () => {
    const result = applyUpgrade('rnd', baseDepartments(), 1000);
    expect(result.ok).toBe(true);
    expect(result.levels.rnd).toBe(2);
    expect(result.capital).toBe(200);
  });

  test('★ 자본금이 모자라면 아무것도 바꾸지 않는다 (조용한 실패 금지)', () => {
    const before = baseDepartments();
    const result = applyUpgrade('legal', before, 100);
    expect(result.ok).toBe(false);
    expect(result.levels).toBe(before); // 같은 참조 — 새 객체조차 만들지 않는다
    expect(result.capital).toBe(100);
  });

  test('최대 레벨에서 더 올려도 자본금이 빠지지 않는다', () => {
    const result = applyUpgrade('rnd', at('rnd', 3), 5000);
    expect(result.ok).toBe(false);
    expect(result.capital).toBe(5000);
  });

  test('원본을 변형하지 않는다', () => {
    const before = baseDepartments();
    applyUpgrade('rnd', before, 1000);
    expect(before.rnd).toBe(1);
  });

  test('다른 부서는 건드리지 않는다', () => {
    const result = applyUpgrade('rnd', baseDepartments(), 1000);
    expect(result.levels.hr).toBe(1);
    expect(result.levels.legal).toBe(1);
  });

  test('두 번 올리면 Lv3이고 두 비용이 모두 빠진다', () => {
    const once = applyUpgrade('rnd', baseDepartments(), 3000);
    const twice = applyUpgrade('rnd', once.levels, once.capital);
    expect(twice.levels.rnd).toBe(3);
    expect(twice.capital).toBe(3000 - 800 - 2000);
  });
});

describe('회사 등급 — 파생값이다', () => {
  test('전부 Lv1이면 C, 전부 Lv3이면 S다', () => {
    expect(totalLevels(baseDepartments())).toBe(5);
    expect(companyRank(baseDepartments())).toBe('C');

    const maxed = DEPARTMENT_ORDER.reduce<DepartmentLevels>(
      (levels, id) => ({ ...levels, [id]: 3 }),
      baseDepartments(),
    );
    expect(totalLevels(maxed)).toBe(15);
    expect(companyRank(maxed)).toBe('S');
  });

  test('등급이 단조 증가한다', () => {
    const ranks = ['C', 'B', 'A', 'S'];
    let previous = -1;
    for (const total of [5, 8, 11, 14]) {
      // 총합을 맞추는 임의 배분 — 등급은 총합에서만 파생하므로 배분은 무관하다.
      const levels: DepartmentLevels = {
        desk: Math.min(3, Math.max(1, total - 4)) as DepartmentLevel,
        rnd: 1,
        hr: 1,
        legal: 1,
        ir: 1,
      };
      const filled = { ...levels, desk: levels.desk };
      const index = ranks.indexOf(companyRank({ ...filled }));
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = Math.max(previous, index);
    }
  });
});

describe('손상 입력 방어', () => {
  test('객체가 아니면 전부 기본이다', () => {
    expect(normalizeDepartments(null)).toEqual(baseDepartments());
    expect(normalizeDepartments('nope')).toEqual(baseDepartments());
    expect(normalizeDepartments([1, 2, 3])).toEqual(baseDepartments());
    expect(normalizeDepartments(undefined)).toEqual(baseDepartments());
  });

  test('★ 깨진 부서만 1로 떨어지고 나머지는 살아남는다', () => {
    const levels = normalizeDepartments({ rnd: 3, hr: 99, legal: 'two', ir: 2.5, desk: 2 });
    expect(levels.rnd).toBe(3);
    expect(levels.desk).toBe(2);
    expect(levels.hr).toBe(1);
    expect(levels.legal).toBe(1);
    expect(levels.ir).toBe(1);
  });

  test('모르는 키는 무시된다', () => {
    expect(normalizeDepartments({ marketing: 3 })).toEqual(baseDepartments());
  });

  test('정규화 결과는 항상 효과 함수에 안전하다 (NaN이 새지 않는다)', () => {
    const levels = normalizeDepartments({ rnd: -1, hr: 0, legal: 4 });
    expect(Number.isFinite(towerDamageMultiplier(levels))).toBe(true);
    expect(Number.isFinite(unitHpMultiplier(levels))).toBe(true);
    expect(Number.isFinite(liquidationLineFor(levels))).toBe(true);
    expect(Number.isFinite(startingAumFor('R1', levels))).toBe(true);
  });
});
