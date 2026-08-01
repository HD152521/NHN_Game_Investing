/**
 * 스킬 상수표·조회 헬퍼 회귀 테스트 (FR-6.6).
 *
 * 여기서 고정하는 것은 "밸런스 수치가 정확히 얼마인가"가 아니라 **왜 그 값인가의 관계**다 —
 * 예: `S-03`의 AUM 비용이 웨이브 AUM 드롭과 같다는 사실, 실효 비용이 `S-01`의 골드 비용과
 * 같은 급이라는 사실. 수치를 손대면 근거도 같이 손대야 한다는 것을 테스트가 강제한다.
 */

import { describe, expect, test } from 'vitest';

import { SKILL_EFFECT_IDS } from '../fx';
import {
  AUM_DROP_PER_WAVE,
  SKILL_HEAL,
  SKILL_IDS,
  SKILL_SHIELD_DURATION_MS,
  SKILL_SPECS,
  UNIT_HP,
  WAVE_DURATION_MS,
  WAVE_PREP_MS,
} from './constants';
import { GOLD_CONVERSION } from '../position';
import { createSkillCooldowns, isShieldActive, skillCooldownOf, tickSkillCooldowns } from './skills';
import { createCombat } from './simulate';
import { STAGES, sessionTotalStake } from './stages';
import type { CombatParams, CombatState } from './types';

function params(): CombatParams {
  return {
    waveCount: 13,
    waveDurationMs: WAVE_DURATION_MS,
    towerSlots: 6,
    maxBaseHp: 100,
    heat: 1,
    aumDropPerWave: AUM_DROP_PER_WAVE,
    totalBaseIncome: 195,
  };
}

describe('스킬 ID 축', () => {
  test('전투 로직 ID와 이펙트 ID가 정확히 같다 (매핑 테이블이 필요 없는 이유)', () => {
    expect([...SKILL_IDS]).toEqual([...SKILL_EFFECT_IDS]);
  });

  test('3종 전부 상수표에 정의돼 있고 id 필드가 키와 일치한다', () => {
    for (const id of SKILL_IDS) {
      expect(SKILL_SPECS[id].id).toBe(id);
      expect(SKILL_SPECS[id].cost).toBeGreaterThan(0);
      expect(SKILL_SPECS[id].cooldownMs).toBeGreaterThan(0);
    }
  });
});

describe('재화 배분 — 골드 2종 / AUM 1종', () => {
  test('AUM을 쓰는 스킬은 S-03 하나뿐이다', () => {
    const aumSkills = SKILL_IDS.filter((id) => SKILL_SPECS[id].currency === 'aum');
    expect(aumSkills).toEqual(['S-03']);
  });

  test('S-01·S-02는 골드를 쓴다', () => {
    expect(SKILL_SPECS['S-01'].currency).toBe('gold');
    expect(SKILL_SPECS['S-02'].currency).toBe('gold');
  });
});

describe('밸런스 근거 고정', () => {
  test('S-01은 기존 값(200 G / 45초)을 유지한다 — 게이트 회귀 원인을 섞지 않기 위함', () => {
    expect(SKILL_SPECS['S-01'].cost).toBe(200);
    expect(SKILL_SPECS['S-01'].cooldownMs).toBe(45_000);
  });

  test('S-02 비용은 기본 포탑 1기와 같다 — "타워냐 부대냐"가 그대로 선택지가 된다', () => {
    expect(SKILL_SPECS['S-02'].cost).toBe(120);
    expect(SKILL_SPECS['S-02'].cost).toBe(STAGES.R1.startingGold);
  });

  test('S-03 비용은 웨이브 1회분 AUM 드롭과 같다', () => {
    expect(SKILL_SPECS['S-03'].cost).toBe(AUM_DROP_PER_WAVE);
  });

  /**
   * S-03의 실효 골드 비용 `[v1.3 재산출]`.
   *
   * 원금이 재순환하지 않으므로 1 AUM은 세션 동안 **정확히 한 번** 투입된다. 따라서 태운
   * AUM이 포기하게 만드는 골드는 `cost × (1 + ρ) × GOLD_CONVERSION`으로 딱 떨어진다.
   *
   * ⚠️ **알려진 밸런스 이슈**: 예전에는 원금이 5.95회 재순환한다는 가정 위에서 실효 비용을
   * 약 179 G로 계산해 `S-01`(200 G)과 같은 급이라고 봤다. 재순환이 사라지면서 실효 비용이
   * 90 G로 내려가 **`S-03`이 `S-01`의 절반 값이 됐다.** 비용을 300 AUM(웨이브 2개분 드롭)으로
   * 올리면 180 G가 되어 균형이 회복되지만, 그건 이번 개정(정산식·게이트)의 범위 밖이라
   * 손대지 않았다. 봇 시뮬레이터(§10 ⑥)로 실드 남용 여부를 확인한 뒤 결정할 것.
   */
  test('S-03의 실효 골드 비용은 cost × (1 + ρ) × 전환율로 딱 떨어진다 (R1 기준 90 G)', () => {
    const forgoneGold =
      SKILL_SPECS['S-03'].cost * (1 + STAGES.R1.targetReturnRate) * GOLD_CONVERSION;

    expect(forgoneGold).toBe(90);
    expect(forgoneGold).toBeLessThan(SKILL_SPECS['S-01'].cost); // 현재는 S-01보다 싸다
  });

  test('실드를 최대로 돌려도 포기 골드가 R1 필요지출의 25%를 넘지 않는다', () => {
    const stageMs = WAVE_DURATION_MS * 13;
    const maxCasts = Math.floor(stageMs / SKILL_SPECS['S-03'].cooldownMs) + 1;
    const forgoneGold =
      maxCasts * SKILL_SPECS['S-03'].cost * (1 + STAGES.R1.targetReturnRate) * GOLD_CONVERSION;

    // 7회 × 150 AUM = 1,050 AUM → 630 G 포기 = 필요지출 2,700의 23%.
    // 실드에 자원을 다 쏟으면 방어를 살 골드가 사라진다는 트레이드오프가 성립해야 한다.
    expect(forgoneGold / STAGES.R1.requiredSpend).toBeLessThan(0.25);
    expect(forgoneGold / STAGES.R1.requiredSpend).toBeGreaterThan(0.15);
  });

  test('S-03을 최대한 돌려도 실드가 스테이지의 20%를 넘게 덮지는 못한다', () => {
    const stageMs = WAVE_DURATION_MS * 13;
    const maxCasts = Math.floor(stageMs / SKILL_SPECS['S-03'].cooldownMs) + 1;

    // 실드로 본진을 계속 막아 버리는 플레이가 성립하면 전투가 사라진다. 상한은 지속시간이
    // 아니라 쿨다운이 건다 — 이 비율이 올라가면 쿨다운을 다시 봐야 한다.
    expect((maxCasts * SKILL_SHIELD_DURATION_MS) / stageMs).toBeLessThan(0.2);
  });

  test('S-03 최대 소모 AUM은 세션 총 투입 가능액의 30%를 넘지 않는다', () => {
    const stageMs = WAVE_DURATION_MS * 13;
    const maxCasts = Math.floor(stageMs / SKILL_SPECS['S-03'].cooldownMs) + 1;

    // 최대 7회 × 150 = 1,050 AUM. 분모는 시작 AUM이 아니라 **세션 총 투입 가능액 S**다 —
    // 드롭까지 포함한 실제 실탄 총량이 S이므로(v1.3에서 재순환이 사라져 S가 확정값이 됐다),
    // "실드가 매매 자본을 얼마나 먹는가"는 S 대비로 봐야 정확하다. 1,050 / 3,950 = 26.6%.
    expect(maxCasts * SKILL_SPECS['S-03'].cost).toBeLessThanOrEqual(
      sessionTotalStake(STAGES.R1) * 0.3,
    );
  });

  test('S-02 회복량은 저가 유닛을 완전 회복시키고 trader는 절반도 못 채운다', () => {
    expect(SKILL_HEAL).toBeGreaterThanOrEqual(UNIT_HP.intern);
    expect(SKILL_HEAL).toBeGreaterThanOrEqual(UNIT_HP.analyst);
    expect(SKILL_HEAL).toBeLessThan(UNIT_HP.trader / 2);
  });

  test('실드 지속시간은 웨이브 교전 구간의 절반을 넘지 않는다 (웨이브를 통째로 무효화 금지)', () => {
    const battleMs = WAVE_DURATION_MS - WAVE_PREP_MS;
    expect(SKILL_SHIELD_DURATION_MS).toBeLessThan(battleMs / 2);
  });
});

describe('조회 헬퍼', () => {
  test('새 전투는 3종 전부 쿨다운 0, 실드 비활성이다', () => {
    const state = createCombat(params());
    for (const id of SKILL_IDS) {
      expect(skillCooldownOf(state, id)).toBe(0);
    }
    expect(isShieldActive(state)).toBe(false);
  });

  test('skillCooldowns가 없는 상태에서는 S-01만 별칭 필드로 답한다 (렌더러 픽스처 호환)', () => {
    // 렌더러 픽스처처럼 `skillCooldowns` 키 자체가 없는 상태를 만든다
    // (`exactOptionalPropertyTypes`가 켜져 있어 undefined 대입으로는 재현되지 않는다).
    const { skillCooldowns, ...withoutRecord } = createCombat(params());
    const legacy: CombatState = { ...withoutRecord, skillCooldownMs: 4_200 };

    expect(skillCooldownOf(legacy, 'S-01')).toBe(4_200);
    expect(skillCooldownOf(legacy, 'S-02')).toBe(0);
    expect(skillCooldownOf(legacy, 'S-03')).toBe(0);
  });

  test('tickSkillCooldowns는 0 아래로 내려가지 않는다', () => {
    const ticked = tickSkillCooldowns({ 'S-01': 100, 'S-02': 0, 'S-03': 5_000 }, 250);

    expect(ticked['S-01']).toBe(0);
    expect(ticked['S-02']).toBe(0);
    expect(ticked['S-03']).toBe(4_750);
  });

  test('createSkillCooldowns는 호출마다 새 객체를 준다 (공유 참조 금지)', () => {
    expect(createSkillCooldowns()).not.toBe(createSkillCooldowns());
    expect(createSkillCooldowns()).toEqual({ 'S-01': 0, 'S-02': 0, 'S-03': 0 });
  });
});
