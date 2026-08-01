/**
 * 발사체 · 피격 배정 판정 (시트 §08 `W-01`) — 순수 함수.
 *
 * 시트 요구: "작게 보여도 **진영색이 먼저 읽혀야** 한다." 그래서 색을 렌더러가 즉흥으로
 * 고르지 않고, "어떤 발사체인가 → 어떤 피격인가"를 여기서 먼저 확정한다.
 */

import type { TowerKind } from '../combat/types.js';
import type { ImpactKind, ProjectileKind } from './types.js';

/**
 * 타워 종류 → 발사체 종류.
 *
 * 광역(splash)만 앵커 탄이다 — 시트의 "무거운 쇠못, 회전 없음"이라는 무게감이
 * 넓게 때리는 저연사 타워와 맞고, 나머지 두 타워와 실루엣이 확실히 갈린다.
 */
export function projectileKindForTower(kind: TowerKind): ProjectileKind {
  return kind === 'splash' ? 'anchor_bolt' : 'ally_flare';
}

/**
 * 발사체 종류 → 피격 종류.
 *
 * 앵커 탄만 무채다 — 쇠못은 진영색을 띠지 않는 물리 타격이라 피격도 무채로 간다.
 * 덕분에 "적색/청색/무채" 피격 3종이 실제로 전부 화면에 나온다.
 */
export function impactKindForProjectile(kind: ProjectileKind): ImpactKind {
  switch (kind) {
    case 'ally_flare':
      return 'ally';
    case 'enemy_arrow':
      return 'enemy';
    case 'anchor_bolt':
      return 'neutral';
  }
}
