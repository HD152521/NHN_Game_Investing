import { describe, expect, test } from 'vitest';

import { SKILL_EFFECT_DURATION_MS, SKILL_FX_SLOT_COUNT } from './constants.js';
import {
  createSkillFxField,
  skillFxIdAt,
  skillFxProgress,
  skillFxX,
  skillFxY,
  triggerSkillEffect,
} from './skill-effects.js';

describe('SkillFxField — 트리거 인터페이스 (선할당 풀)', () => {
  test('새 버퍼는 활성 이펙트가 하나도 없다', () => {
    const field = createSkillFxField();
    for (let slot = 0; slot < SKILL_FX_SLOT_COUNT; slot += 1) {
      expect(skillFxIdAt(field, slot, 0)).toBeNull();
    }
  });

  test('트리거하면 그 이펙트가 활성이 된다', () => {
    const field = createSkillFxField();
    triggerSkillEffect(field, 'S-01', 100, 200, 1_000);

    expect(skillFxIdAt(field, 0, 1_000)).toBe('S-01');
    expect(skillFxX(field, 0)).toBe(100);
    expect(skillFxY(field, 0)).toBe(200);
  });

  test('진행도는 시작 0 → 만료 직전 1로 간다', () => {
    const field = createSkillFxField();
    triggerSkillEffect(field, 'S-02', 0, 0, 5_000);
    const duration = SKILL_EFFECT_DURATION_MS['S-02'];

    expect(skillFxProgress(field, 0, 5_000)).toBe(0);
    expect(skillFxProgress(field, 0, 5_000 + duration / 2)).toBeCloseTo(0.5);
    expect(skillFxProgress(field, 0, 5_000 + duration)).toBe(1);
  });

  test('지속시간이 지나면 자동으로 비활성이 된다 (해제 호출 불필요)', () => {
    const field = createSkillFxField();
    triggerSkillEffect(field, 'S-03', 0, 0, 0);

    expect(skillFxIdAt(field, 0, SKILL_EFFECT_DURATION_MS['S-03'] - 1)).toBe('S-03');
    expect(skillFxIdAt(field, 0, SKILL_EFFECT_DURATION_MS['S-03'] + 1)).toBeNull();
  });

  test('연속 트리거는 서로 다른 슬롯에 들어간다 (동시 재생)', () => {
    const field = createSkillFxField();
    triggerSkillEffect(field, 'S-01', 0, 0, 0);
    triggerSkillEffect(field, 'S-02', 0, 0, 0);

    expect(skillFxIdAt(field, 0, 0)).toBe('S-01');
    expect(skillFxIdAt(field, 1, 0)).toBe('S-02');
  });

  test('슬롯을 다 쓰면 가장 오래된 것을 덮어쓴다 (링 버퍼 · 할당 없음)', () => {
    const field = createSkillFxField();
    for (let i = 0; i < SKILL_FX_SLOT_COUNT; i += 1) {
      triggerSkillEffect(field, 'S-01', 0, 0, 0);
    }
    triggerSkillEffect(field, 'S-03', 0, 0, 0);

    expect(skillFxIdAt(field, 0, 0)).toBe('S-03');
  });

  test('범위 밖 슬롯 조회는 크래시하지 않고 비활성으로 답한다', () => {
    const field = createSkillFxField();
    expect(skillFxIdAt(field, -1, 0)).toBeNull();
    expect(skillFxIdAt(field, SKILL_FX_SLOT_COUNT, 0)).toBeNull();
    expect(skillFxProgress(field, 999, 0)).toBe(0);
  });

  test('트리거 이전 시각으로 조회해도 진행도가 음수가 되지 않는다', () => {
    const field = createSkillFxField();
    triggerSkillEffect(field, 'S-01', 0, 0, 1_000);
    expect(skillFxProgress(field, 0, 0)).toBe(0);
  });
});
