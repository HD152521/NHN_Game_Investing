import { describe, expect, test } from 'vitest';

import { SKILL_SPECS } from '../combat';
import {
  SKILL_AUM_CLASS,
  SKILL_BAR_ENTRIES,
  SKILL_READY_LABEL,
  buildSkillBarMarkup,
  buildSkillButton,
  formatSkillCooldown,
  formatSkillCost,
  resolveSkillButtonState,
  skillButtonClass,
  skillIdFor,
} from './skill-bar-logic';

describe('스킬 바 — 재화 구분', () => {
  test('비용 문자열에 재화 단위가 반드시 붙는다', () => {
    expect(formatSkillCost(SKILL_SPECS['S-01'])).toBe('200 G');
    expect(formatSkillCost(SKILL_SPECS['S-02'])).toBe('120 G');
    expect(formatSkillCost(SKILL_SPECS['S-03'])).toBe('150 AUM');
  });

  test('AUM 스킬만 보라 수식 클래스를 받는다 (시트 §08 — 색이 곧 정보)', () => {
    expect(skillButtonClass(SKILL_SPECS['S-03'])).toContain(SKILL_AUM_CLASS);
    expect(skillButtonClass(SKILL_SPECS['S-01'])).not.toContain(SKILL_AUM_CLASS);
    expect(skillButtonClass(SKILL_SPECS['S-02'])).not.toContain(SKILL_AUM_CLASS);
  });

  test('마크업에 스킬 3종이 전부 있고 data-currency로도 재화가 읽힌다', () => {
    const markup = buildSkillBarMarkup();

    for (const spec of SKILL_BAR_ENTRIES) {
      expect(markup).toContain(`data-skill="${spec.id}"`);
      expect(markup).toContain(formatSkillCost(spec));
    }
    expect(markup).toContain('data-currency="aum"');
    expect(markup.match(/data-currency="gold"/g)).toHaveLength(2);
  });

  test('버튼 마크업이 정체 한 줄을 title과 data-flavor 양쪽에 싣는다', () => {
    const markup = buildSkillButton(SKILL_SPECS['S-03']);
    expect(markup).toContain(SKILL_SPECS['S-03'].displayName);
    expect(markup).toContain(`title="${SKILL_SPECS['S-03'].flavor}"`);
    expect(markup).toContain(`data-flavor="${SKILL_SPECS['S-03'].flavor}"`);
  });
});

describe('쿨다운 표기', () => {
  test('준비 완료면 READY', () => {
    expect(formatSkillCooldown(0)).toBe(SKILL_READY_LABEL);
    expect(formatSkillCooldown(-10)).toBe(SKILL_READY_LABEL);
  });

  test('남은 시간은 올림한다 — 0.4초 남았는데 0s로 보이면 안 된다', () => {
    expect(formatSkillCooldown(400)).toBe('1s');
    expect(formatSkillCooldown(1_000)).toBe('1s');
    expect(formatSkillCooldown(1_001)).toBe('2s');
    expect(formatSkillCooldown(45_000)).toBe('45s');
  });
});

describe('버튼 활성 판정 — castSkill 거부 조건과 같은 규칙', () => {
  test('골드가 충분하고 쿨다운이 없으면 활성', () => {
    const state = resolveSkillButtonState({
      spec: SKILL_SPECS['S-01'],
      remainingMs: 0,
      gold: 200,
      aum: 0,
    });

    expect(state.disabled).toBe(false);
    expect(state.unaffordable).toBe(false);
    expect(state.cooldownLabel).toBe(SKILL_READY_LABEL);
  });

  test('S-03은 AUM 잔액을 본다 — 골드가 아무리 많아도 AUM이 모자라면 비활성', () => {
    const state = resolveSkillButtonState({
      spec: SKILL_SPECS['S-03'],
      remainingMs: 0,
      gold: 99_999,
      aum: 149,
    });

    expect(state.disabled).toBe(true);
    expect(state.unaffordable).toBe(true);
  });

  test('쿨다운 중이면 잔액이 충분해도 비활성 (원인은 재화 부족이 아니다)', () => {
    const state = resolveSkillButtonState({
      spec: SKILL_SPECS['S-02'],
      remainingMs: 12_000,
      gold: 99_999,
      aum: 99_999,
    });

    expect(state.disabled).toBe(true);
    expect(state.unaffordable).toBe(false);
    expect(state.cooldownLabel).toBe('12s');
  });
});

describe('skillIdFor', () => {
  test('알려진 ID만 되읽는다', () => {
    expect(skillIdFor('S-02')).toBe('S-02');
    expect(skillIdFor('S-99')).toBeNull();
    expect(skillIdFor(undefined)).toBeNull();
  });
});
