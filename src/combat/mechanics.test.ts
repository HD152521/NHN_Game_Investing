import { describe, expect, test } from 'vitest';

import { applyEngagement, applyTowerFire, collectDeaths, collectLeaks } from './mechanics';
import type { Enemy, Tower, Unit } from './types';

function makeEnemy(overrides: Partial<Enemy> & Pick<Enemy, 'id' | 'lane'>): Enemy {
  return { x: 0.1, hp: 100, maxHp: 100, speed: 0, ...overrides };
}

function makeTower(overrides: Partial<Tower> & Pick<Tower, 'slot' | 'kind'>): Tower {
  return { level: 1, cooldownMs: 0, ...overrides };
}

function makeUnit(overrides: Partial<Unit> & Pick<Unit, 'id' | 'kind'>): Unit {
  return { x: 0, hp: 100, maxHp: 100, cooldownMs: 0, ...overrides };
}

describe('applyTowerFire — FR-6.2 레인 표적 제한', () => {
  test('antiair는 지상 적을 공격하지 못하고, basic은 공중 적을 공격하지 못한다', () => {
    const towers: Tower[] = [makeTower({ slot: 0, kind: 'antiair' }), makeTower({ slot: 1, kind: 'basic' })];
    const enemies: Enemy[] = [
      makeEnemy({ id: 1, lane: 'ground', x: 0.1, hp: 1000, maxHp: 1000 }),
      makeEnemy({ id: 2, lane: 'air', x: 0.1, hp: 1000, maxHp: 1000 }),
    ];

    const result = applyTowerFire(towers, enemies, 1000);

    const ground = result.enemies.find((e) => e.id === 1);
    const air = result.enemies.find((e) => e.id === 2);

    // basic이 지상을 때렸으니 지상 hp만 깎이고, air는 antiair가 때려 air hp만 깎인다.
    expect(ground?.hp).toBe(1000 - 20);
    expect(air?.hp).toBe(1000 - 34);
  });

  test('splash는 사거리 내 지상 적 전원에게 피해를 주고, 사거리 밖은 건드리지 않는다', () => {
    const towers: Tower[] = [makeTower({ slot: 0, kind: 'splash' })];
    const enemies: Enemy[] = [
      makeEnemy({ id: 1, lane: 'ground', x: 0.1, hp: 100, maxHp: 100 }),
      makeEnemy({ id: 2, lane: 'ground', x: 0.2, hp: 100, maxHp: 100 }),
      makeEnemy({ id: 3, lane: 'ground', x: 0.9, hp: 100, maxHp: 100 }), // splash 사거리(0.3) 밖
    ];

    const result = applyTowerFire(towers, enemies, 1400);

    expect(result.enemies.find((e) => e.id === 1)?.hp).toBe(90);
    expect(result.enemies.find((e) => e.id === 2)?.hp).toBe(90);
    expect(result.enemies.find((e) => e.id === 3)?.hp).toBe(100);
  });

  test('사거리 내 표적이 없으면 쿨다운을 쓰지 않고 대기한다', () => {
    const towers: Tower[] = [makeTower({ slot: 0, kind: 'basic' })];
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.9, hp: 100, maxHp: 100 })];

    const result = applyTowerFire(towers, enemies, 500);

    expect(result.towers[0]?.cooldownMs).toBe(0);
    expect(result.enemies[0]?.hp).toBe(100);
  });

  test('쿨다운이 남아 있으면 사거리 내 표적이 있어도 쏘지 않는다', () => {
    const towers: Tower[] = [makeTower({ slot: 0, kind: 'basic', cooldownMs: 500 })];
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.1, hp: 100, maxHp: 100 })];

    const result = applyTowerFire(towers, enemies, 200);

    expect(result.towers[0]?.cooldownMs).toBe(300);
    expect(result.enemies[0]?.hp).toBe(100);
  });
});

describe('applyEngagement — FR-6.5 유닛-적 교전', () => {
  test('밀착 거리 안의 유닛-적 쌍은 서로 피해를 주고받는다', () => {
    // gap = 0.1 - 0.06 = 0.04 ≤ UNIT_MELEE_RANGE(0.05) — 밀착 거리.
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.1, hp: 100, maxHp: 100 })];
    const units: Unit[] = [makeUnit({ id: 1, kind: 'analyst', x: 0.06, hp: 100, maxHp: 100, cooldownMs: 0 })];

    const result = applyEngagement(enemies, units, 1000);

    expect(result.blockedEnemyIds.has(1)).toBe(true);
    expect(result.blockedUnitIds.has(1)).toBe(true);
    // analyst 데미지 13(쿨다운 0이라 즉시 발사), 적 근접 dps 9 × 1초 = 9
    expect(result.enemies[0]?.hp).toBe(87);
    expect(result.units[0]?.hp).toBe(91);
  });

  test('공중 적은 유닛과 교전하지 않는다', () => {
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'air', x: 0.1, hp: 100, maxHp: 100 })];
    const units: Unit[] = [makeUnit({ id: 1, kind: 'trader', x: 0.5, hp: 100, maxHp: 100 })];

    const result = applyEngagement(enemies, units, 1000);

    expect(result.blockedEnemyIds.size).toBe(0);
    expect(result.blockedUnitIds.size).toBe(0);
    expect(result.enemies[0]?.hp).toBe(100);
    expect(result.units[0]?.hp).toBe(100);
  });

  test('유닛 쿨다운이 남아 있으면 이번 틱에 적을 때리지 못하지만 밀착 상태면 적의 공격은 계속 받는다', () => {
    // gap = 0.1 - 0.06 = 0.04 ≤ UNIT_MELEE_RANGE(0.05) — 밀착 거리.
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.1, hp: 100, maxHp: 100 })];
    const units: Unit[] = [makeUnit({ id: 1, kind: 'intern', x: 0.06, hp: 100, maxHp: 100, cooldownMs: 500 })];

    const result = applyEngagement(enemies, units, 200);

    expect(result.enemies[0]?.hp).toBe(100); // 유닛 쿨다운(500) > dtMs(200)라 아직 못 쏨
    expect(result.units[0]?.cooldownMs).toBe(300);
    expect(result.units[0]?.hp).toBeCloseTo(100 - 9 * 0.2);
  });

  test('사거리 밖(교전 전)이면 서로 이동만 하고 피해를 주고받지 않는다', () => {
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.5, hp: 100, maxHp: 100 })];
    const units: Unit[] = [makeUnit({ id: 1, kind: 'trader', x: 0.1, hp: 100, maxHp: 100 })];

    const result = applyEngagement(enemies, units, 1000);

    expect(result.blockedEnemyIds.size).toBe(0);
    expect(result.blockedUnitIds.size).toBe(0);
    expect(result.enemies[0]?.hp).toBe(100);
    expect(result.units[0]?.hp).toBe(100);
  });
});

describe('collectLeaks / collectDeaths', () => {
  test('x<=0에 도달한 적은 누출로 집계되고 본진 피해를 낸다', () => {
    const enemies: Enemy[] = [
      makeEnemy({ id: 1, lane: 'ground', x: 0, hp: 100, maxHp: 100 }),
      makeEnemy({ id: 2, lane: 'ground', x: 0.1, hp: 100, maxHp: 100 }),
    ];

    const result = collectLeaks(enemies);

    expect(result.leakCount).toBe(1);
    expect(result.survivors).toHaveLength(1);
    expect(result.survivors[0]?.id).toBe(2);
    expect(result.baseDamage).toBeGreaterThan(0);
  });

  test('hp<=0인 적은 처치로 집계되고 개체당 aumPerKill만큼 AUM을 지급한다', () => {
    const enemies: Enemy[] = [
      makeEnemy({ id: 1, lane: 'ground', x: 0.1, hp: 0, maxHp: 100 }),
      makeEnemy({ id: 2, lane: 'ground', x: 0.1, hp: -5, maxHp: 100 }),
      makeEnemy({ id: 3, lane: 'ground', x: 0.1, hp: 10, maxHp: 100 }),
    ];

    const result = collectDeaths(enemies, 21);

    expect(result.kills).toBe(2);
    expect(result.aumDropped).toBe(42);
    expect(result.survivors).toHaveLength(1);
    expect(result.survivors[0]?.id).toBe(3);
  });

  test('처치가 없으면 AUM 드롭도 0이다', () => {
    const enemies: Enemy[] = [makeEnemy({ id: 1, lane: 'ground', x: 0.1, hp: 10, maxHp: 100 })];
    const result = collectDeaths(enemies, 21);
    expect(result.kills).toBe(0);
    expect(result.aumDropped).toBe(0);
  });
});
