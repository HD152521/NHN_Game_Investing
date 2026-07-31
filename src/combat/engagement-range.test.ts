/**
 * 유닛 역할 분화(근거리/원거리/탱커) 검증 테스트.
 *
 * `applyEngagement`의 사거리 기반 교전 규칙(mechanics.ts 참고)과 `constants.ts`의 스탯
 * 테이블이 기획 요구사항("근거리·원거리·탱커 역할 분화")을 실제로 구현하는지 확인한다.
 * `mechanics.test.ts`의 기본 교전 규칙 테스트와 분리해 파일 크기를 관리한다.
 */

import { describe, expect, test } from 'vitest';

import { UNIT_DAMAGE, UNIT_HP, UNIT_MELEE_RANGE, UNIT_RANGE } from './constants';
import { applyEngagement } from './mechanics';
import type { Enemy, Unit } from './types';

function makeEnemy(overrides: Partial<Enemy> & Pick<Enemy, 'id' | 'lane'>): Enemy {
  return { x: 0.1, hp: 100, maxHp: 100, speed: 0, ...overrides };
}

function makeUnit(overrides: Partial<Unit> & Pick<Unit, 'id' | 'kind'>): Unit {
  return { x: 0, hp: 100, maxHp: 100, cooldownMs: 0, ...overrides };
}

describe('유닛 스탯 — 역할 분화 (기획 요구사항)', () => {
  test('trader(탱커)는 intern(근거리)보다 HP와 데미지가 모두 높다', () => {
    expect(UNIT_HP.trader).toBeGreaterThan(UNIT_HP.intern);
    expect(UNIT_DAMAGE.trader).toBeGreaterThan(UNIT_DAMAGE.intern);
  });

  test('analyst(원거리)의 사거리는 intern·trader(근거리·탱커)보다 뚜렷하게 길다', () => {
    expect(UNIT_RANGE.analyst).toBeGreaterThan(UNIT_RANGE.intern);
    expect(UNIT_RANGE.analyst).toBeGreaterThan(UNIT_RANGE.trader);
  });

  test('근거리·탱커의 사거리는 밀착 거리와 같다(밀착해야만 교전)', () => {
    expect(UNIT_RANGE.intern).toBe(UNIT_MELEE_RANGE);
    expect(UNIT_RANGE.trader).toBe(UNIT_MELEE_RANGE);
  });
});

describe('applyEngagement — 원거리 유닛의 일방적 사격 구간', () => {
  test('analyst는 밀착 전(사거리 안, 밀착 밖)에도 적에게 피해를 준다 — 적은 반격하지 못한다', () => {
    // gap = 0.15, UNIT_MELEE_RANGE(0.05) < gap ≤ UNIT_RANGED_RANGE(0.2)
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.15, hp: 100, maxHp: 100 })];
    const units: Unit[] = [makeUnit({ id: 1, kind: 'analyst', x: 0, hp: 100, maxHp: 100 })];

    const result = applyEngagement(enemies, units, 1000);

    // 유닛은 전진을 멈추고 공격하지만, 적은 밀착 거리 밖이라 반격하지 못하고 멈추지도 않는다.
    expect(result.blockedUnitIds.has(1)).toBe(true);
    expect(result.blockedEnemyIds.has(1)).toBe(false);
    expect(result.enemies[0]?.hp).toBe(100 - UNIT_DAMAGE.analyst);
    expect(result.units[0]?.hp).toBe(100); // 무피해 — 일방적 사격 구간
  });

  test('근거리(intern)는 같은 거리에서는 사거리 밖이라 아무 교전도 일어나지 않는다', () => {
    // gap = 0.15 > UNIT_RANGE.intern(UNIT_MELEE_RANGE=0.05) — 근거리는 이 거리에서 무력하다.
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.15, hp: 100, maxHp: 100 })];
    const units: Unit[] = [makeUnit({ id: 1, kind: 'intern', x: 0, hp: 100, maxHp: 100 })];

    const result = applyEngagement(enemies, units, 1000);

    expect(result.blockedUnitIds.has(1)).toBe(false);
    expect(result.blockedEnemyIds.has(1)).toBe(false);
    expect(result.enemies[0]?.hp).toBe(100);
    expect(result.units[0]?.hp).toBe(100);
  });

  test('analyst도 공중 적은 공격하지 못한다(FR-6.2, 원거리도 예외 없음)', () => {
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'air', x: 0.1, hp: 100, maxHp: 100 })];
    const units: Unit[] = [makeUnit({ id: 1, kind: 'analyst', x: 0, hp: 100, maxHp: 100 })];

    const result = applyEngagement(enemies, units, 1000);

    expect(result.blockedUnitIds.size).toBe(0);
    expect(result.enemies[0]?.hp).toBe(100);
  });
});

describe('applyEngagement — 탱커가 원거리 유닛을 보호하는 구도', () => {
  test('탱커가 원거리보다 앞서 있으면(x가 더 큼) 적은 탱커와만 짝지어지고, 원거리는 밀착하지 않는다', () => {
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.9, hp: 1000, maxHp: 1000 })];
    const units: Unit[] = [
      makeUnit({ id: 1, kind: 'trader', x: 0.86, hp: 100, maxHp: 100 }), // 탱커가 더 전진해 있다
      makeUnit({ id: 2, kind: 'analyst', x: 0.5, hp: 100, maxHp: 100 }),
    ];

    const result = applyEngagement(enemies, units, 1000);

    // 적은 1체뿐이라 min(1,2)=1쌍만 형성되고, x가 더 큰(전진한) 탱커가 그 쌍을 차지한다.
    expect(result.blockedUnitIds.has(1)).toBe(true); // 탱커는 밀착 거리(gap=0.04) 안 — 교전 중
    expect(result.blockedUnitIds.has(2)).toBe(false); // 원거리는 아예 짝지어지지 않아 자유
    expect(result.units.find((u) => u.id === 2)?.hp).toBe(100); // 원거리는 무피해
  });

  test('유닛들이 같은 x에 있으면(동시 소환) 사거리가 짧은 탱커가 짝짓기 우선순위를 갖는다', () => {
    // gap이 둘 다 0.04로 동일 — 사거리만으로는 구분 안 되니 짝짓기 순서(tie-break)로 검증한다.
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.04, hp: 1000, maxHp: 1000 })];
    const units: Unit[] = [
      makeUnit({ id: 1, kind: 'analyst', x: 0, hp: 100, maxHp: 100 }),
      makeUnit({ id: 2, kind: 'trader', x: 0, hp: 100, maxHp: 100 }),
    ];

    const result = applyEngagement(enemies, units, 1000);

    // 탱커(id 2)가 밀착 교전에 들어가고, analyst(id 1)는 짝지어지지 않아 피해를 주고받지 않는다.
    expect(result.blockedUnitIds.has(2)).toBe(true);
    expect(result.blockedUnitIds.has(1)).toBe(false);
    expect(result.units.find((u) => u.id === 1)?.hp).toBe(100);
  });
});
