/**
 * 웨이브별 적 스폰 계획, 기본 수입, AUM 드롭 계산 (PRD FR-6.7, FR-6.8, FR-6.8-a).
 *
 * `spawnPlanFor`는 순수 함수다 — 같은 (wave, params)에는 항상 같은 스펙 배열을 반환한다.
 * 이 배열의 길이가 곧 "웨이브 w의 적 수"이며, AUM 개체당 드롭(FR-6.8-a)과 기본 수입(FR-6.8)
 * 계산이 모두 이 값에 의존하므로 세 함수가 서로 다른 값을 쓰지 않도록 여기 한 곳에 모은다.
 */

import { isBossWave } from './boss';
import {
  AIR_ENEMY_SHARE,
  BOSS_ATTACK_COOLDOWN_MS,
  BOSS_BASE_DAMAGE,
  BOSS_DAMAGE,
  BOSS_HP_MULTIPLIER,
  BOSS_RANGE,
  BOSS_SPEED,
  DEFAULT_WAVE_TABLE,
  ENEMY_ATTACK_COOLDOWN_MS,
  ENEMY_KIND_STATS,
  UNIT_MELEE_RANGE,
  WAVE_AIR_MIX,
  WAVE_GROUND_MIX,
} from './constants';
import type { CombatParams, EnemyKind, Lane } from './types';

/**
 * 스폰될 적 1체의 스펙.
 *
 * ★ 여기가 **종류 → 스탯** 변환이 일어나는 유일한 지점이다 ★
 * `kind`는 개체에 정체 표시로 실려 나가지만(`Enemy.kind`), 전투 판정은 아래 수치 필드만
 * 읽는다(`types.ts Combatant` 주석의 "스탯은 개체에 실린다"). 즉 상수 테이블
 * (`ENEMY_KIND_STATS`)을 조회하는 코드는 이 파일에만 있어야 하고, 런타임 판정 경로
 * (`mechanics.ts`/`simulate.ts`)는 `kind`로 아무 것도 조회하지 않는다. 부서 업그레이드
 * (FR-11)나 웨이브별 변주가 붙어도 고칠 곳이 여기 하나로 유지되는 이유다.
 */
export interface EnemySpec {
  readonly lane: Lane;
  /** 악당 5종 중 무엇인가. 보스는 생략한다(정체는 `isBoss`가 진다). */
  readonly kind?: EnemyKind | undefined;
  readonly hp: number;
  readonly speed: number;
  /** 공격 1회 피해량. */
  readonly damage: number;
  /** 공격 사거리(진행도 단위). 근접이므로 유닛의 밀착 거리와 같다. */
  readonly range: number;
  /** 공격 주기(ms). */
  readonly attackCooldownMs: number;
  /** 보스(B-03)인가. `Enemy.isBoss`로 그대로 넘어간다. */
  readonly isBoss?: boolean | undefined;
  /** 본진 도달 시 피해. 생략하면 `BASE_DAMAGE_PER_LEAK`. */
  readonly leakDamage?: number | undefined;
}

/** 지상 3종의 고정 순서 — `WAVE_GROUND_MIX` 튜플의 인덱스와 1:1이다. */
const GROUND_KIND_ORDER: readonly EnemyKind[] = ['gapScout', 'marginEnforcer', 'liquidationDigger'];
/** 공중 2종의 고정 순서 — `WAVE_AIR_MIX` 튜플의 인덱스와 1:1이다. */
const AIR_KIND_ORDER: readonly EnemyKind[] = ['rumorKite', 'panicSiren'];

/**
 * 가중치 비율을 실제 개수 `count`로 배분한다 — **최대잉여법(largest remainder)**.
 *
 * 각 종류에 `count × w / Σw`의 몫을 주고 내림한 뒤, 남은 자리를 소수부가 큰 순서로 나눠
 * 준다. 소수부가 같으면 앞 인덱스(= 더 가벼운 종류)가 먼저 가져간다 — 결정론을 위해서다.
 *
 * ★ 왜 반올림이 아니라 최대잉여법인가 ★ 각자 반올림하면 합이 `count`와 어긋난다(예:
 * count 5를 [1,1,1]로 반올림하면 2+2+2=6). 웨이브 적 수는 AUM 드롭(`aumDropPerKill`)의
 * 분모이므로 **한 체도 어긋나면 안 된다.**
 */
function apportion(weights: readonly number[], count: number): number[] {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (count <= 0) {
    return weights.map(() => 0);
  }
  if (totalWeight <= 0) {
    // 가중치가 전부 0인 방어 경로: 전량을 첫 종류에 몰아 합을 지킨다.
    return weights.map((_, index) => (index === 0 ? count : 0));
  }

  const exact = weights.map((weight) => (count * weight) / totalWeight);
  const counts = exact.map((value) => Math.floor(value));
  let remaining = count - counts.reduce((sum, value) => sum + value, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => (b.fraction === a.fraction ? a.index - b.index : b.fraction - a.fraction));

  for (const entry of byRemainder) {
    if (remaining <= 0) {
      break;
    }
    counts[entry.index] = (counts[entry.index] ?? 0) + 1;
    remaining -= 1;
  }
  return counts;
}

/**
 * 종류별 개수를 **번갈아 배치한 스폰 순서**로 편다.
 *
 * ★ 왜 뭉치지 않고 섞는가 ★ `spawnDue`(simulate.ts)는 이 배열을 앞에서부터 교전 시간에
 * 비례해 꺼낸다. 종류별로 뭉쳐 두면 "앞 8초는 속공만, 뒤 8초는 탱커만"처럼 웨이브가 세
 * 토막이 나서, 광역 포탑이 노리는 **겹침**(사거리 안에 여러 체가 동시에 있는 상태)이
 * 종류별로만 생긴다. 번갈아 두면 속도가 다른 종류가 자연히 앞뒤로 벌어지면서 겹침이
 * 웨이브 전체에 퍼진다.
 *
 * 순서는 가벼운 것(속공/정찰)부터다 — 빠른 적이 선두로 나가는 그림이 세계관과도 맞고
 * (§05 "장이 열리자마자 아래로 꽂힌다"), 타워 표적 우선순위(x 최소)와도 어긋나지 않는다.
 */
function interleave(order: readonly EnemyKind[], counts: readonly number[]): EnemyKind[] {
  const remaining = [...counts];
  const result: EnemyKind[] = [];
  let placed = true;
  while (placed) {
    placed = false;
    for (let i = 0; i < order.length; i += 1) {
      if ((remaining[i] ?? 0) > 0) {
        const kind = order[i];
        if (kind !== undefined) {
          result.push(kind);
        }
        remaining[i] = (remaining[i] ?? 0) - 1;
        placed = true;
      }
    }
  }
  return result;
}

/** 웨이브 `wave`의 지상 적 종류 목록(스폰 순서). 보스는 포함하지 않는다. */
function groundKindsFor(wave: number, count: number): EnemyKind[] {
  const mix = WAVE_GROUND_MIX[wave - 1] ?? [1, 1, 1];
  return interleave(GROUND_KIND_ORDER, apportion(mix, count));
}

/** 웨이브 `wave`의 공중 적 종류 목록(스폰 순서). */
function airKindsFor(wave: number, count: number): EnemyKind[] {
  const mix = WAVE_AIR_MIX[wave - 1] ?? [1, 1];
  return interleave(AIR_KIND_ORDER, apportion(mix, count));
}

/** 종류 + 웨이브 기본 HP → 개체에 실릴 스탯. `ENEMY_KIND_STATS`를 읽는 유일한 곳이다. */
function specFor(kind: EnemyKind, lane: Lane, baseHp: number): EnemySpec {
  const stats = ENEMY_KIND_STATS[kind];
  return {
    lane,
    kind,
    hp: baseHp * stats.hpMultiplier,
    speed: stats.speed,
    damage: stats.damage,
    // 사거리는 전 종 공통이다 — 종류별로 벌리면 유닛 전진 한계선과 맞물려 결함이 생긴다
    // (`constants.ts ENEMY_KIND_STATS` 주석의 폐기 기록).
    range: UNIT_MELEE_RANGE,
    attackCooldownMs: ENEMY_ATTACK_COOLDOWN_MS,
    leakDamage: stats.leakDamage,
  };
}

/**
 * 웨이브 `wave`(1-based)의 적 스펙 목록을 만든다.
 * FR-6.7: 적 수 = ceil(baseCount[w] × heat), 적 HP = baseHP[w] × heat.
 * 웨이브 범위를 벗어나면(정의되지 않은 웨이브) 빈 배열을 반환한다.
 */
export function spawnPlanFor(wave: number, params: CombatParams): EnemySpec[] {
  // 스테이지별 테이블을 params에서 읽는다 — 없으면 R1(DEFAULT_WAVE_TABLE). R2/R3 계수는
  // 이 파일을 고치지 않고 `params.waveTable` 주입만으로 붙는다.
  const table = params.waveTable ?? DEFAULT_WAVE_TABLE;
  const index = wave - 1;
  const baseCount = table.baseCount[index];
  const baseHp = table.baseHp[index];
  if (baseCount === undefined || baseHp === undefined) {
    return [];
  }

  const count = Math.ceil(baseCount * params.heat);
  const hp = baseHp * params.heat;
  const airCount = table.airWaves.has(wave) ? Math.max(1, Math.round(count * AIR_ENEMY_SHARE)) : 0;
  const groundCount = count - airCount;

  const specs: EnemySpec[] = [];

  /**
   * ★ 보스는 스폰 계획의 **맨 앞**이다 ★
   * `spawnDue`(simulate.ts)는 계획 배열을 앞에서부터 교전 시간에 비례해 꺼내므로, 앞에 두면
   * 보스가 교전 구간 시작과 동시에 출발한다. 뒤에 두면 25초짜리 교전 구간이 끝날 무렵에야
   * 등장해 "보스가 나오자마자 웨이브가 끝난다"가 된다.
   *
   * 맨 앞이라는 사실은 **전투 규칙과도 맞물린다**: 보스가 선두이므로 언제나 x가 가장 작고,
   * 타워는 x가 가장 작은 적을 쏘므로(`mechanics.ts pickPriorityTarget`) 보스가 자동으로
   * 1순위 표적이 된다. 뒤에 두거나 속도를 늦추면 잡졸이 보스의 방패가 되어 **보스가 한 대도
   * 안 맞고 지나간다**(`constants.ts BOSS_SPEED` 주석의 실측 기록).
   */
  if (isBossWave(wave)) {
    specs.push({
      lane: 'ground',
      hp: hp * BOSS_HP_MULTIPLIER,
      speed: BOSS_SPEED,
      damage: BOSS_DAMAGE,
      range: BOSS_RANGE,
      attackCooldownMs: BOSS_ATTACK_COOLDOWN_MS,
      isBoss: true,
      leakDamage: BOSS_BASE_DAMAGE,
    });
  }

  /**
   * 종류별 스탯을 **여기서 개체에 싣는다.** 웨이브 테이블이 정하는 것은 그 웨이브의 HP
   * "예산"(`hp`)이고, 종류가 그 예산을 배수로 나눠 갖는다 — 그래서 지역 계수(R2 ×1.20 /
   * R3 ×1.30)와 heat가 종류 차등 위에 그대로 곱해진다.
   */
  for (const kind of groundKindsFor(wave, groundCount)) {
    specs.push(specFor(kind, 'ground', hp));
  }
  for (const kind of airKindsFor(wave, airCount)) {
    specs.push(specFor(kind, 'air', hp));
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
