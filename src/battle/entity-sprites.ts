/**
 * 시트 자산 코드(`A-01` …) ↔ 스프라이트 키(`tf-ally-01` …) 매핑 — **이 파일이 유일한 표다.**
 *
 * ★ 왜 한 곳에만 두는가 ★
 * 예전 `src/battle/shapes/index.ts`가 하던 일과 같다: 코드가 `identity.ts`의 정체성 데이터와
 * 실제 그림을 1:1로 묶어두지 않으면, 데이터만 바뀌고 화면은 그대로인 상태(= 이 프로젝트에서
 * 실제로 났던 사고)를 아무도 못 잡는다. 그림이 도형에서 스프라이트로 바뀌었을 뿐, 표가
 * 필요한 이유는 그대로다.
 *
 * ★★ 매핑은 **순번 기반이지 이름 기반이 아니다** (PLAN 0.1 C-6) ★★
 * 원본 메서드 이름을 한국어 표시 이름과 맞추려 들면 전부 틀린다:
 *   - `allyScout`  는 정찰병이 아니라 **A-02 원거리(호가 통신원)** 다.
 *   - `allyAnchor` 는 타워가 아니라 **A-03 탱커(락업 반장)** 다.
 *   - **T-01 이 "지지선 앵커포"라 `allyAnchor` 와 혼동하기 쉽다.** T-01 의 그림은
 *     `towerBasic`(`tf-tower-01`) 이고 `allyAnchor` 와는 아무 관계가 없다.
 * 아래 표의 각 항목에 근거 주석을 달아 둔 이유가 이것이다.
 *
 * ★ 좌우 반전을 쓰지 않는 이유 ★
 * 원본 그리드는 **이미 전투 방향을 보고 있다**: 아군은 우향(예 `allyRookie` 의 곤봉이
 * x=23~25, 오른쪽), 악당은 좌향(예 `enemyRusher` 의 창이 x=2~6 왼쪽 아래를 향하고,
 * `enemyBlocker` 의 방패가 x=1~5 왼쪽에 있다). 여기서 `flipX` 를 켜면 악당이 자기가 밀고
 * 가는 방향(아군 사옥 = 좌측)의 **반대쪽**을 보게 된다. 그래서 렌더러는 반전하지 않는다.
 */

import { enemyKindsForLane } from '../combat/identity.js';
import type { EntityCode } from '../combat/identity.js';
import type { Enemy, EnemyKind, Lane, TowerKind, UnitKind } from '../combat/types.js';
import type { RenderableSpriteKey } from '../sprites/render/index';

export interface EntitySprite {
  /**
   * 시트 자산 코드. `identity.ts`에 엔트리가 있는 것만 채운다 —
   * 기지 2종은 정체성 표에 없다(PLAN 0.1 C-5).
   */
  readonly codeId: EntityCode | null;
  readonly key: RenderableSpriteKey;
}

// ── 아군 3종 (§04) ────────────────────────────────────────────────
export const ALLY_SPRITES: Readonly<Record<UnitKind, EntitySprite>> = {
  /** A-01 개장벨 사환(근거리) — 원본 `allyRookie`. */
  intern: { codeId: 'A-01', key: 'tf-ally-01' },
  /** A-02 호가 통신원(**원거리**) — 원본 `ally**Scout**`. 이름이 아니라 순번이 근거다. */
  analyst: { codeId: 'A-02', key: 'tf-ally-02' },
  /** A-03 락업 반장(**탱커**) — 원본 `ally**Anchor**`. T-01 "지지선 앵커포"와 다른 것이다. */
  trader: { codeId: 'A-03', key: 'tf-ally-03' },
};

// ── 악당 5종 (§05) ────────────────────────────────────────────────
export const ENEMY_SPRITES: Readonly<Record<EnemyKind, EntitySprite>> = {
  /** E-01 갭하락 첨병 — 원본 `enemyRusher`. */
  gapScout: { codeId: 'E-01', key: 'tf-enemy-01' },
  /** E-02 반대매매 집행관 — 원본 `enemyBlocker`. */
  marginEnforcer: { codeId: 'E-02', key: 'tf-enemy-02' },
  /** E-03 청산 굴착기 — 원본 `enemyTank`. */
  liquidationDigger: { codeId: 'E-03', key: 'tf-enemy-03' },
  /** E-04 루머 연 — 원본 `enemyKite`. 공중 1번. */
  rumorKite: { codeId: 'E-04', key: 'tf-enemy-air-01' },
  /** E-05 패닉 사이렌 — 원본 `enemySiren`. 공중 2번. */
  panicSiren: { codeId: 'E-05', key: 'tf-enemy-air-02' },
};

// ── 타워 3종 (§06) ────────────────────────────────────────────────
export const TOWER_SPRITES: Readonly<Record<TowerKind, EntitySprite>> = {
  /**
   * T-01 지지선 앵커포 — 원본 `towerBasic`(`tf-tower-01`).
   * ⚠️ 이름에 "앵커"가 들어가지만 `allyAnchor`(A-03 탱커)와 **무관하다.**
   */
  basic: { codeId: 'T-01', key: 'tf-tower-01' },
  /** T-02 공시 리피터 — 원본 `towerAA`. */
  antiair: { codeId: 'T-02', key: 'tf-tower-02' },
  /** T-03 물타기 살포기 — 원본 `towerSplash`. */
  splash: { codeId: 'T-03', key: 'tf-tower-03' },
};

// ── 기지·보스 (§07) ───────────────────────────────────────────────
/** 아군 사옥 — 원본 `baseAlly`. `identity.ts`에 엔트리가 없다(PLAN 0.1 C-5). */
export const HQ_SPRITE: EntitySprite = { codeId: null, key: 'tf-base-ally' };
/** 베어 요새 — 원본 `baseEnemy`. 마찬가지로 정체성 표에 없다. */
export const ENEMY_BASE_SPRITE: EntitySprite = { codeId: null, key: 'tf-base-enemy' };
/** B-03 마진콜 심판관 — 원본 `boss`. 마지막 웨이브에만 요새 앞에 선다. */
export const BOSS_SPRITE: EntitySprite = { codeId: 'B-03', key: 'tf-boss' };

/** Step 3 이 화면에 그리는 스프라이트 전량. 커버리지 테스트가 이 목록을 훑는다. */
export const BATTLE_SPRITES: readonly EntitySprite[] = [
  ...Object.values(ALLY_SPRITES),
  ...Object.values(ENEMY_SPRITES),
  ...Object.values(TOWER_SPRITES),
  HQ_SPRITE,
  ENEMY_BASE_SPRITE,
  BOSS_SPRITE,
];

/**
 * 레인별 악당 종류 목록을 **모듈 로드 시 한 번만** 만든다.
 * `enemyKindsForLane`은 매 호출마다 `filter`로 새 배열을 만들므로, 프레임 안에서 부르면
 * 적 60체 × 배열 생성이 된다(PRD §11: 프레임당 할당 0).
 */
const GROUND_KINDS = enemyKindsForLane('ground');
const AIR_KINDS = enemyKindsForLane('air');
const FALLBACK_KIND: EnemyKind = 'gapScout';

/**
 * **폴백**: 종류 필드가 없는 적의 스프라이트를 id로 결정적으로 고른다.
 *
 * 예전에는 이것이 **유일한** 경로였다 — `Enemy`에 종류가 없어 시뮬레이션은 레인과 스탯만으로
 * 돌았고, 종류는 순수한 표현 계층의 구분이었다. 지금은 스폰이 종류를 개체에 실으므로
 * (`combat/waves.ts`) 정상 경로는 `enemyKindOf`다. 이 함수는 시뮬레이션 밖에서 `Enemy`
 * 리터럴을 만드는 곳(`combat-fixtures.ts`)을 위해 남는다.
 *
 * ⚠️ 게임 개체에 이 함수를 직접 쓰지 마라 — **스탯과 그림이 어긋난다.** 개체의 실제 종류가
 * 속공(E-01)인데 id 나머지가 탱커(E-03)를 가리키면, 화면은 굴착기인데 얇고 빠른 적이 된다.
 */
export function enemyKindForId(lane: Lane, id: number): EnemyKind {
  const kinds = lane === 'air' ? AIR_KINDS : GROUND_KINDS;
  if (kinds.length === 0) return FALLBACK_KIND;
  const index = ((id % kinds.length) + kinds.length) % kinds.length;
  return kinds[index] ?? FALLBACK_KIND;
}

/**
 * 적 개체 → 종류. **렌더러가 써야 하는 유일한 진입점이다.**
 *
 * 개체가 종류를 들고 있으면 그것을 쓰고(= 스탯과 그림이 같은 출처에서 나온다), 없으면
 * id 폴백으로 떨어진다. 레인이 어긋난 개체(예: 지상 개체에 공중 종류가 실림)는 폴백으로
 * 되돌린다 — 공중 그림이 지면을 걸어가는 것보다는 종류가 한 번 틀리는 편이 낫다.
 */
export function enemyKindOf(enemy: Enemy): EnemyKind {
  const kind = enemy.kind;
  if (kind !== undefined) {
    const laneKinds = enemy.lane === 'air' ? AIR_KINDS : GROUND_KINDS;
    if (laneKinds.includes(kind)) {
      return kind;
    }
  }
  return enemyKindForId(enemy.lane, enemy.id);
}
