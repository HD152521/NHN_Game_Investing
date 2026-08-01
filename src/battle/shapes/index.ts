/**
 * 실루엣 레지스트리 — 시트 자산 코드(`A-01`…`T-03`)와 실제 드로잉 함수를 잇는 단 하나의 표.
 *
 * ★ 왜 표가 따로 필요한가 ★
 * `src/combat/identity.ts`는 이름·플레이버·실루엣 **분류값**의 단일 출처다. 하지만 분류값이
 * `rounded`인데 그림에 곡선이 하나도 없으면 데이터와 화면이 조용히 갈라진다 —
 * 실제로 그런 상태였다(분류만 들어가고 드로잉은 예전 도형 그대로).
 * 이 표가 코드↔드로잉을 1:1로 묶어주므로, 테스트가 "분류값 `rounded` ⇒ 그림에 `arc`가 있다,
 * `angular` ⇒ `arc`가 없다"를 전수 검사할 수 있다.
 */

import { enemyKindsForLane } from '../../combat/identity.js';
import type { EnemyKind, EntityCode } from '../../combat/identity.js';
import type { Lane, TowerKind, UnitKind } from '../../combat/types.js';
import { drawAnalystShape, drawInternShape, drawTraderShape } from './ally-shapes.js';
import { drawPanicSirenShape, drawRumorKiteShape } from './enemy-air-shapes.js';
import {
  drawGapScoutShape,
  drawLiquidationDiggerShape,
  drawMarginEnforcerShape,
} from './enemy-ground-shapes.js';
import type { UnitShapeDrawer } from './primitives.js';
import {
  drawAnchorTowerShape,
  drawRepeaterTowerShape,
  drawSprayTowerShape,
} from './tower-shapes.js';
import type { TowerShapeDrawer } from './tower-shapes.js';

export interface UnitSilhouette {
  /** 시트 자산 코드 — `identity.ts`의 같은 코드와 짝을 이룬다. */
  readonly codeId: EntityCode;
  readonly draw: UnitShapeDrawer;
}

export interface TowerSilhouette {
  readonly codeId: EntityCode;
  readonly draw: TowerShapeDrawer;
}

export const ALLY_SHAPES: Readonly<Record<UnitKind, UnitSilhouette>> = {
  intern: { codeId: 'A-01', draw: drawInternShape },
  analyst: { codeId: 'A-02', draw: drawAnalystShape },
  trader: { codeId: 'A-03', draw: drawTraderShape },
};

export const ENEMY_SHAPES: Readonly<Record<EnemyKind, UnitSilhouette>> = {
  gapScout: { codeId: 'E-01', draw: drawGapScoutShape },
  marginEnforcer: { codeId: 'E-02', draw: drawMarginEnforcerShape },
  liquidationDigger: { codeId: 'E-03', draw: drawLiquidationDiggerShape },
  rumorKite: { codeId: 'E-04', draw: drawRumorKiteShape },
  panicSiren: { codeId: 'E-05', draw: drawPanicSirenShape },
};

export const TOWER_SHAPES: Readonly<Record<TowerKind, TowerSilhouette>> = {
  basic: { codeId: 'T-01', draw: drawAnchorTowerShape },
  antiair: { codeId: 'T-02', draw: drawRepeaterTowerShape },
  splash: { codeId: 'T-03', draw: drawSprayTowerShape },
};

/**
 * 레인별 악당 종류 목록을 **모듈 로드 시 한 번만** 만든다.
 * `enemyKindsForLane`은 매 호출마다 `filter`로 새 배열을 만들므로, 프레임 안에서 부르면
 * 적 60체 × 배열 생성이 된다(PRD §11: 프레임당 할당 0).
 */
const GROUND_KINDS = enemyKindsForLane('ground');
const AIR_KINDS = enemyKindsForLane('air');
const FALLBACK_KIND: EnemyKind = 'gapScout';

/**
 * `Enemy`에는 종류 필드가 없다(시뮬레이션은 레인과 스탯만으로 돈다 — `identity.ts` 주석).
 * 그래서 렌더러가 id로 결정적으로 실루엣을 고른다: 같은 적은 매 프레임 같은 모습이고,
 * 한 화면에 여러 종류가 섞여 보인다.
 */
export function enemyKindForId(lane: Lane, id: number): EnemyKind {
  const kinds = lane === 'air' ? AIR_KINDS : GROUND_KINDS;
  if (kinds.length === 0) return FALLBACK_KIND;
  const index = ((id % kinds.length) + kinds.length) % kinds.length;
  return kinds[index] ?? FALLBACK_KIND;
}

export { ALLY_SCALE } from './ally-shapes.js';
export { AIR_ENEMY_SCALE } from './enemy-air-shapes.js';
export { GROUND_ENEMY_SCALE } from './enemy-ground-shapes.js';
export { HQ_WINDOW_TOTAL, drawBearFortressShape, drawHqShape, litWindowCount } from './base-shapes.js';
export { UNIT_RADIUS } from './primitives.js';
export type { UnitShapeDrawer } from './primitives.js';
export type { TowerShapeDrawer } from './tower-shapes.js';
