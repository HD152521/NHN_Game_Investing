/**
 * 전투 시뮬레이션 내부 상태 — `CombatState`(렌더러와 공유하는 계약, types.ts)에 시뮬레이션
 * 전용 부기 필드를 얹은 타입이다.
 *
 * `types.ts`는 수정 금지 대상이라 여기 필드를 추가할 수 없다. 대신 `CombatStateInternal`을
 * `CombatState`의 확장으로 두고, `simulate.ts`/`actions.ts`가 공개 시그니처(`CombatState`)로
 * 받은 상태를 내부적으로 이 타입으로 다뤄 스폰 진행도·ID 발급기 등을 추적한다.
 * `CombatStateInternal`은 항상 `CombatState`의 상위 집합이므로 외부에는 `CombatState`로
 * 그대로 노출해도 안전하다 — 이 타입은 barrel(index.ts)에 내보내지 않는 구현 세부사항이다.
 */

import type { CombatState } from './types';
import type { WaveMode } from './wave-clock';

export interface CombatStateInternal extends CombatState {
  /**
   * 웨이브 시계의 모드(준비/교전). `prepRemainingMs > 0`으로는 대체할 수 없다 —
   * Space로 준비를 건너뛰면 남은 시간은 0이지만 아직 웨이브는 시작되지 않은 상태이며,
   * 그 한 프레임을 구분하지 못하면 웨이브 시작(기본 수입·스폰 계획)이 통째로 누락된다.
   */
  readonly waveMode: WaveMode;
  /** 현재 웨이브에서 이미 스폰된 적 수(웨이브 전환 시 0으로 리셋). */
  readonly spawnedInWave: number;
  /** 현재 웨이브에 예정된 총 적 수. 스폰 스케줄과 AUM 개체당 드롭 계산에 쓴다. */
  readonly waveEnemyTotal: number;
  /** 다음에 발급할 `Enemy.id`. */
  readonly nextEnemyId: number;
  /** 다음에 발급할 `Unit.id`. */
  readonly nextUnitId: number;
}
