/**
 * 전투 개체(Enemy/Unit/Tower) · 전투 상태(CombatState) 테스트 픽스처 팩토리.
 *
 * ★ 테스트 전용이다 — `fake-ctx.ts`와 같은 성격으로, 프로덕션 코드에서는 절대 import하지
 *   않는다. `src/combat/types.ts`의 계약이 바뀔 때(예: 개체 스탯이 전역 상수 테이블에서
 *   개체 필드로 이동한 사건) 같은 리터럴을 여러 테스트 파일에 흩어 두면 파일마다 따로
 *   고쳐야 한다 — 기본값을 이 파일 한 곳에 모아 다음 계약 변경 때 한 곳만 고치면 되게 한다.
 *
 * 값은 `combat/constants.ts`의 실제 밸런스 수치와 무관하다. 렌더링 검증에 영향을 주지
 * 않는 합리적인 기본값일 뿐이며, 필요하면 `overrides`로 얼마든지 바꿔 쓴다.
 */

import type { CombatState, Enemy, Tower, Unit } from '../combat/types.js';

const DEFAULT_ENEMY_ATTACK_COOLDOWN_MS = 900;
const DEFAULT_ENEMY_RANGE = 0.05;
const DEFAULT_UNIT_ATTACK_COOLDOWN_MS = 700;
const DEFAULT_UNIT_RANGE = 0.05;

/** `Enemy` 리터럴의 필수 필드를 전부 채운 기본값 + `overrides`로 덮어쓴 결과. */
export function makeEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 1,
    lane: 'ground',
    x: 0.3,
    hp: 50,
    maxHp: 100,
    speed: 0.02,
    damage: 5,
    range: DEFAULT_ENEMY_RANGE,
    attackCooldownMs: DEFAULT_ENEMY_ATTACK_COOLDOWN_MS,
    cooldownMs: 0,
    ...overrides,
  };
}

/** `Unit` 리터럴의 필수 필드를 전부 채운 기본값 + `overrides`로 덮어쓴 결과. */
export function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 1,
    kind: 'intern',
    x: 0.4,
    hp: 50,
    maxHp: 50,
    speed: 0.05,
    damage: 7,
    range: DEFAULT_UNIT_RANGE,
    attackCooldownMs: DEFAULT_UNIT_ATTACK_COOLDOWN_MS,
    cooldownMs: 0,
    ...overrides,
  };
}

/** `Tower` 리터럴 기본값 + `overrides`. */
export function makeTower(overrides: Partial<Tower> = {}): Tower {
  return { slot: 0, kind: 'basic', level: 1, cooldownMs: 0, ...overrides };
}

/** `CombatState` 기본값(빈 전장) + `overrides`. */
export function makeCombatState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    phase: 'running',
    wave: 1,
    waveCount: 5,
    waveElapsedMs: 0,
    // 렌더링 테스트 기본값은 "교전 중" — 준비 구간 표시를 검증하는 테스트만 덮어쓴다.
    prepRemainingMs: 0,
    enemies: [],
    units: [],
    towers: [],
    baseHp: 100,
    enemyBaseHp: 600,
  maxEnemyBaseHp: 600,
  maxBaseHp: 100,
    towerSlots: 6,
    skillCooldownMs: 0,
    ...overrides,
  };
}
