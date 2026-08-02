/**
 * 측정용 로드아웃 목록 — **스탯 공간을 가르는 축들**을 하나씩 분리해 둔 표다.
 *
 * 목표는 "어떤 조합이 이기는가"를 보는 것이 아니라, **선택이 결과를 가르는가**를 보는 것이다.
 * 그래서 목록이 다음 축을 각각 독립적으로 흔든다:
 *
 *   ① 타워 종류      — 단일 도배(basic/antiair/splash) vs 혼합
 *   ② 공중 대비      — 대공 0기 / 1기 / 2기
 *   ③ 타워 vs 유닛   — 타워만 / 유닛만 / 혼합(비중 3단)
 *   ④ 유닛 종류      — intern / analyst / trader 단일
 *   ⑤ 업그레이드     — 6기 Lv1 vs 4기 Lv2
 *
 * 어떤 축을 흔들어도 결과가 같으면 그 축은 **죽은 결정**이다 — 그게 이 표가 잡으려는 것이다.
 */

import { TOWER_SLOTS } from '../../src/combat/index.js';
import type { TowerKind, UnitKind } from '../../src/combat/index.js';
import type { Loadout } from './engine.js';

/** 동시에 유지할 유닛 수 상한의 기본값. 전장 폭(진행도 0~1)에 6체면 충분히 빽빽하다. */
const DEFAULT_UNIT_CAP = 6;

function fill(kind: TowerKind, count: number): readonly TowerKind[] {
  return Array.from({ length: Math.min(count, TOWER_SLOTS) }, () => kind);
}

/**
 * 지상·대공 혼합. `antiairCount`기를 **뒤쪽 슬롯**(적 본진 쪽)에 둔다 — 공중 적이 지상보다
 * 빠르므로 더 일찍 잡기 시작해야 한다는 `TOWER_RANGE` 주석의 의도와 같은 방향이다.
 */
function mixed(ground: TowerKind, antiairCount: number, total = TOWER_SLOTS): readonly TowerKind[] {
  const towers: TowerKind[] = [];
  for (let i = 0; i < total; i += 1) {
    towers.push(i >= total - antiairCount ? 'antiair' : ground);
  }
  return towers;
}

function loadout(
  id: string,
  label: string,
  towers: readonly TowerKind[],
  upgrade: boolean,
  unit: UnitKind | null,
  unitCap = DEFAULT_UNIT_CAP,
): Loadout {
  return { id, label, towers, upgrade, unit, unitCap };
}

export const LOADOUTS: readonly Loadout[] = [
  // ① 타워만 — 종류별 도배. 사용자가 말한 "포탑만 만들어두면 이김"의 직접 측정.
  loadout('t-basic6', '타워만 · 기본 6기', fill('basic', 6), false, null),
  loadout('t-aa6', '타워만 · 대공 6기', fill('antiair', 6), false, null),
  loadout('t-splash6', '타워만 · 광역 6기', fill('splash', 6), false, null),
  loadout('t-mix', '타워만 · 기본4+대공2', mixed('basic', 2), false, null),
  loadout('t-mix-up', '타워만 · 기본4+대공2 Lv2', mixed('basic', 2), true, null),
  loadout('t-splashmix', '타워만 · 광역4+대공2', mixed('splash', 2), false, null),

  // ② 공중 대비 축 — 대공 0/1/2기. 대공을 빼면 공중 웨이브에서 뚫려야 한다.
  loadout('t-aa0', '대공 0기 (기본 6)', fill('basic', 6), true, null),
  loadout('t-aa1', '대공 1기 (기본5+대공1)', mixed('basic', 1), true, null),
  loadout('t-aa2', '대공 2기 (기본4+대공2)', mixed('basic', 2), true, null),

  // ③ 타워 vs 유닛 — 예산 배분 축.
  loadout('u-only-intern', '유닛만 · 사환', [], false, 'intern', 8),
  loadout('u-only-analyst', '유닛만 · 통신원', [], false, 'analyst', 8),
  loadout('u-only-trader', '유닛만 · 반장', [], false, 'trader', 6),
  loadout('m-2t', '혼합 · 타워2 + 사환', mixed('basic', 1, 2), false, 'intern'),
  loadout('m-4t', '혼합 · 타워4 + 사환', mixed('basic', 1, 4), false, 'intern'),
  loadout('m-6t', '혼합 · 타워6 + 사환', mixed('basic', 2), false, 'intern'),

  // ④ 유닛 종류 축 — 같은 타워 위에서 유닛만 바꾼다.
  loadout('m-analyst', '혼합 · 타워4 + 통신원', mixed('basic', 1, 4), false, 'analyst'),
  loadout('m-trader', '혼합 · 타워4 + 반장', mixed('basic', 1, 4), false, 'trader'),

  // ⑤ 업그레이드 축 — 같은 돈을 폭(6기)에 쓸까 깊이(4기 Lv2)에 쓸까.
  loadout('t-wide', '폭 · 기본6 Lv1', mixed('basic', 2), false, null),
  loadout('t-deep', '깊이 · 기본4 Lv2', mixed('basic', 1, 4), true, null),
];

/** 예산 소진율 축 — 같은 조합을 예산 50 / 75 / 100%로. */
export const SPEND_RATIOS: readonly number[] = [0.5, 0.75, 1.0];
