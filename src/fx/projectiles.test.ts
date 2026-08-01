import { describe, expect, test } from 'vitest';

import { impactKindForProjectile, projectileKindForTower } from './projectiles.js';

describe('projectileKindForTower — 진영색이 먼저 읽히는 발사체 배정 (시트 W-01)', () => {
  test('광역 타워는 무거운 앵커 탄을 쏜다', () => {
    expect(projectileKindForTower('splash')).toBe('anchor_bolt');
  });

  test('단일표적·대공 타워는 아군 신호탄을 쏜다', () => {
    expect(projectileKindForTower('basic')).toBe('ally_flare');
    expect(projectileKindForTower('antiair')).toBe('ally_flare');
  });
});

describe('impactKindForProjectile — 피격 3종(적/청/무채)', () => {
  test('아군 신호탄은 적색 피격', () => {
    expect(impactKindForProjectile('ally_flare')).toBe('ally');
  });

  test('적 하강 화살은 청색 피격', () => {
    expect(impactKindForProjectile('enemy_arrow')).toBe('enemy');
  });

  test('앵커 탄은 무채 피격 — 쇠못이라 진영색을 쓰지 않는다', () => {
    expect(impactKindForProjectile('anchor_bolt')).toBe('neutral');
  });
});
