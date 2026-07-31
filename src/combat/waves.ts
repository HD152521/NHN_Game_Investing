/**
 * 웨이브별 적 스폰 계획, 기본 수입, AUM 드롭 계산 (PRD FR-6.7, FR-6.8, FR-6.8-a).
 *
 * `spawnPlanFor`는 순수 함수다 — 같은 (wave, params)에는 항상 같은 스펙 배열을 반환한다.
 * 이 배열의 길이가 곧 "웨이브 w의 적 수"이며, AUM 개체당 드롭(FR-6.8-a)과 기본 수입(FR-6.8)
 * 계산이 모두 이 값에 의존하므로 세 함수가 서로 다른 값을 쓰지 않도록 여기 한 곳에 모은다.
 */

import {
  AIR_ENEMY_SHARE,
  AIR_WAVE_NUMBERS,
  ENEMY_SPEED_AIR,
  ENEMY_SPEED_GROUND,
  WAVE_BASE_COUNT,
  WAVE_BASE_HP,
} from './constants';
import type { CombatParams, Lane } from './types';

/** 스폰될 적 1체의 스펙. */
export interface EnemySpec {
  readonly lane: Lane;
  readonly hp: number;
  readonly speed: number;
}

/**
 * 웨이브 `wave`(1-based)의 적 스펙 목록을 만든다.
 * FR-6.7: 적 수 = ceil(baseCount[w] × heat), 적 HP = baseHP[w] × heat.
 * 웨이브 범위를 벗어나면(정의되지 않은 웨이브) 빈 배열을 반환한다.
 */
export function spawnPlanFor(wave: number, params: CombatParams): EnemySpec[] {
  const index = wave - 1;
  const baseCount = WAVE_BASE_COUNT[index];
  const baseHp = WAVE_BASE_HP[index];
  if (baseCount === undefined || baseHp === undefined) {
    return [];
  }

  const count = Math.ceil(baseCount * params.heat);
  const hp = baseHp * params.heat;
  const airCount = AIR_WAVE_NUMBERS.has(wave) ? Math.max(1, Math.round(count * AIR_ENEMY_SHARE)) : 0;
  const groundCount = count - airCount;

  const specs: EnemySpec[] = [];
  for (let i = 0; i < groundCount; i += 1) {
    specs.push({ lane: 'ground', hp, speed: ENEMY_SPEED_GROUND });
  }
  for (let i = 0; i < airCount; i += 1) {
    specs.push({ lane: 'air', hp, speed: ENEMY_SPEED_AIR });
  }
  return specs;
}

/**
 * 웨이브 `wave` 시작 시 지급할 기본 수입(G). FR-6.8 — 총액(`params.totalBaseIncome`)을
 * 먼저 확정하고, 웨이브당 값을 내림 계산한 뒤 마지막 웨이브에서 나머지를 보정한다.
 * 웨이브당 값을 먼저 내림하면 총액이 어긋나므로 반드시 이 순서를 지킨다.
 */
export function waveIncomeFor(wave: number, params: CombatParams): number {
  const perWave = Math.floor(params.totalBaseIncome / params.waveCount);
  if (wave === params.waveCount) {
    return params.totalBaseIncome - perWave * (params.waveCount - 1);
  }
  return perWave;
}

/**
 * 웨이브 `wave`에서 적 1체를 처치했을 때 지급할 AUM. FR-6.8-a — 웨이브당 총량
 * (`params.aumDropPerWave`)을 그 웨이브의 적 수로 나눈다(내림). 기본 수입과 달리
 * 나머지를 보정하지 않는다 — 처치하지 못한 적의 몫과 나눗셈 나머지는 그대로 버려진다.
 */
export function aumDropPerKill(wave: number, params: CombatParams): number {
  const enemyCount = spawnPlanFor(wave, params).length;
  if (enemyCount <= 0) {
    return 0;
  }
  return Math.floor(params.aumDropPerWave / enemyCount);
}
