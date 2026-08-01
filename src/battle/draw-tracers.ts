/**
 * 타워 발사 예광선(트레이서) + 피격 히트 플래시 — 순수 렌더링 파생값.
 *
 * 플레이테스트 피드백: "발사체가 없다 — 타워가 쏘는 게 안 보여서 전투가 일어나는지
 * 알 수 없다."
 *
 * ★ 설계 결정: `CombatEvents`(combat/types.ts)에는 "이번 틱에 어느 타워가 쐈는지"가
 *   없다 — kills/aumDropped 등 집계값만 있다. 전투 시뮬(`src/combat`)을 순수하게
 *   유지하기 위해 발사 이벤트를 상태에 새로 추가하지 않기로 하고(§전체 지침 "상태를
 *   추가하지 않고 기존 상태에서 유도"), 대신 `Tower.cooldownMs`가 막 최댓값으로
 *   리셋된 직후라는 신호로 "방금 쐈다"를 역산한다. `applyTowerFire`(combat/mechanics.ts)
 *   가 발사에 성공하면 `cooldownMs`를 `TOWER_COOLDOWN_MS[kind]`로 리셋하는 동작에
 *   기대는 파생 로직이다 — 재장전 중(리셋 직후가 아닌 낮은 값)에는 그려지지 않는다.
 *
 * 표적 선정은 `mechanics.ts`의 `applyTowerFire`와 동일한 규칙(담당 레인 + 사거리 내 +
 * x가 가장 작은=가장 위협적인 적)을 그대로 재현해, "왜 이 방향으로 쐈는지"가 실제
 * 전투 판정과 어긋나지 않게 한다.
 */

import { TOWER_COOLDOWN_MS, TOWER_RANGE, towerX } from '../combat/index.js';
import type { CombatState, Enemy, Lane, Tower, TowerKind } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import type { BattleLayout } from './layout.js';
import { laneY, progressToX, slotRect } from './layout.js';
import { rgba } from './style.js';
import type { BattleCtx } from './surface.js';

/** 쿨다운이 최댓값의 이 비율을 넘으면 "막 리셋됨(=방금 발사함)"으로 간주한다. */
const JUST_FIRED_COOLDOWN_RATIO = 0.7;
const TRACER_LINE_WIDTH = 2.5;
const TRACER_ALPHA = 0.9;
const HIT_FLASH_RADIUS = 6;
const HIT_FLASH_ALPHA = 0.55;
const FULL_CIRCLE_START = 0;
const FULL_CIRCLE_END = Math.PI * 2;

/** 타워 종류별 포신 높이 비율 — draw-towers.ts 실루엣의 포신 위치와 맞춘 발사 원점. */
const MUZZLE_Y_RATIO: Readonly<Record<TowerKind, number>> = {
  basic: 0.35,
  antiair: 0,
  splash: 0.1,
};

/** antiair만 공중, 나머지는 지상(FR-6.2, mechanics.ts와 동일 규칙). */
function laneForKind(kind: TowerKind): Lane {
  return kind === 'antiair' ? 'air' : 'ground';
}

/** 방금 발사한 타워인지 — cooldownMs가 막 최댓값으로 리셋된 상태인지를 역산한다. */
function justFired(tower: Tower): boolean {
  return tower.cooldownMs > TOWER_COOLDOWN_MS[tower.kind] * JUST_FIRED_COOLDOWN_RATIO;
}

/** mechanics.ts `pickPriorityTarget`과 동일한 규칙 — 사거리 내에서 x가 가장 작은(가장
 * 위협적인) 적을 고른다. 전투 판정과 렌더링이 서로 다른 표적을 가리키지 않게 한다. */
function pickPriorityTarget(candidates: readonly Enemy[]): Enemy | null {
  let best: Enemy | null = null;
  for (const enemy of candidates) {
    if (best === null || enemy.x < best.x) best = enemy;
  }
  return best;
}

/**
 * mechanics.ts `applyTowerFire`와 동일한 사거리 판정 — 담당 레인 + **타워 자기 위치 기준**
 * 상대 거리(`enemy.x - towerX(slot) <= range`). 절대좌표(`enemy.x <= range`)로 재면 앞 슬롯
 * 타워가 실제로는 맞히는 적에게 예광선을 안 그려, 화면과 판정이 어긋난다.
 */
function candidatesFor(tower: Tower, enemies: readonly Enemy[]): readonly Enemy[] {
  const lane = laneForKind(tower.kind);
  const range = TOWER_RANGE[tower.kind];
  const originX = towerX(tower.slot);
  return enemies.filter((enemy) => enemy.lane === lane && enemy.x - originX <= range);
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function muzzlePoint(tower: Tower, layout: BattleLayout, towerSlots: number): Point {
  const rect = slotRect(tower.slot, layout, towerSlots);
  const ratio = MUZZLE_Y_RATIO[tower.kind];
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h * ratio };
}

function targetPoint(enemy: Enemy, layout: BattleLayout): Point {
  return { x: progressToX(enemy.x, layout), y: laneY(enemy.lane, layout) };
}

function drawTracerLine(ctx: BattleCtx, palette: Palette, from: Point, to: Point): void {
  ctx.save();
  ctx.strokeStyle = rgba(palette.GOLD, TRACER_ALPHA);
  ctx.lineWidth = TRACER_LINE_WIDTH;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

function drawHitFlash(ctx: BattleCtx, palette: Palette, at: Point): void {
  ctx.save();
  ctx.fillStyle = rgba(palette.GOLD, HIT_FLASH_ALPHA);
  ctx.beginPath();
  ctx.arc(at.x, at.y, HIT_FLASH_RADIUS, FULL_CIRCLE_START, FULL_CIRCLE_END);
  ctx.fill();
  ctx.restore();
}

function drawTracerToTarget(ctx: BattleCtx, palette: Palette, from: Point, enemy: Enemy, layout: BattleLayout): void {
  const to = targetPoint(enemy, layout);
  drawTracerLine(ctx, palette, from, to);
  drawHitFlash(ctx, palette, to);
}

/**
 * 방금 발사한 타워마다 담당 레인의 유효 표적(들)에게 예광선 + 히트 플래시를 그린다.
 * `splash`는 사거리 내 전원에게(범위 피해와 동일한 규칙), `basic`/`antiair`는
 * 가장 위협적인 표적 한 명에게만 그린다. 사거리 내 표적이 없으면 그리지 않는다
 * (mechanics.ts가 이 경우 쿨다운을 소모하지 않는 것과 동일하게, 렌더링도 "오발"을
 * 만들지 않는다).
 */
export function drawTracers(ctx: BattleCtx, palette: Palette, layout: BattleLayout, state: CombatState): void {
  const towerSlots = state.towerSlots;
  if (towerSlots <= 0) return;

  for (const tower of state.towers) {
    if (!justFired(tower)) continue;

    const candidates = candidatesFor(tower, state.enemies);
    if (candidates.length === 0) continue;

    const from = muzzlePoint(tower, layout, towerSlots);

    if (tower.kind === 'splash') {
      for (const enemy of candidates) {
        drawTracerToTarget(ctx, palette, from, enemy, layout);
      }
      continue;
    }

    const target = pickPriorityTarget(candidates);
    if (target === null) continue;
    drawTracerToTarget(ctx, palette, from, target, layout);
  }
}
