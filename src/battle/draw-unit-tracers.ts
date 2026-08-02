/**
 * 유닛 · 적 공격 예광선 + 원거리 유닛 사거리 은은한 표시 — 순수 렌더링 파생값.
 *
 * 기획 피드백: "원거리는 멀리서 공격하는 게 아니야? 화면에서 안 보인다." — 개체 스탯이
 * `Combatant`(combat/types.ts)로 이동하면서 유닛·적도 타워처럼 `attackCooldownMs` /
 * `cooldownMs`를 갖게 됐다. 타워 예광선(`draw-tracers.ts`)과 동일한 방식으로 "쿨다운이
 * 막 최댓값으로 리셋된 직후"를 "방금 공격함"으로 역산해, 유닛·적의 공격도 눈에 보이게 한다.
 *
 * ★ 타워 예광선과 구분: 타워는 GOLD를 쓴다(draw-tracers.ts). 유닛·적 공격선은 진영 색의
 *   음영 토큰(UP_DEEP/ENEMY_DEEP)을 얇은 굵기로 써서 "타워가 아니라 유닛/적이 쐈다"는
 *   것과 "누구 편이 쐈다"는 것을 색만으로 구분할 수 있게 한다(§색 규칙: 아군=빨강/적=파랑).
 *
 * ★ 사거리 차이의 가시화: intern/trader(근접, range 0.05)와 analyst(원거리, range 0.20)는
 *   실제 표적까지 그려지는 예광선 길이 자체가 사거리에 정비례하므로, 원거리 유닛이 훨씬
 *   먼 표적을 쏘는 그림이 자연히 나온다. 여기에 더해 analyst류(원거리) 유닛에는 평소에도
 *   아주 옅은 사거리 안내선을 그려 "이 유닛은 이만큼 멀리 닿는다"를 공격 순간이 아니어도
 *   짐작할 수 있게 한다 — 화면이 지저분해지지 않도록 원거리 유닛에만 한정한다(절제).
 *
 * 표적 선정은 렌더링 전용 근사치다: `combat/mechanics.ts`의 실제 교전 페어링(정렬 기반
 * 1:1 매칭)까지 재현하지 않고, "사거리 안에서 가장 가까운 상대"만 고른다 — 시뮬레이션과
 * 완전히 동일한 표적을 보장하진 않지만, 렌더링이 매 프레임 상태만으로 그럴듯한 공격
 * 방향을 보여주면 충분하다(타워 예광선처럼 상태에 새 필드를 추가하지 않는다는 원칙 유지).
 */

import { UNIT_MELEE_RANGE } from '../combat/index.js';
import type { CombatState, Enemy, Unit } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import type { ImpactKind } from '../fx/index.js';
import { spriteRasters, unitAnimFrameAt, unitAnimFrameRaster } from '../sprites/render/index.js';
import type { SpriteRasterCache } from '../sprites/render/index.js';
import { drawRasterCentered } from './draw-sprite.js';
import { drawImpactSprite, projectileTravel, PROJECTILE_SPRITE_SCALE } from './draw-tracers.js';
import { allyUnitScreenY } from './draw-units.js';
import type { BattleLayout } from './layout.js';
import { laneY, progressToX } from './layout.js';
import { rgba } from './style.js';
import type { BattleCtx } from './surface.js';

/** 쿨다운이 최댓값의 이 비율을 넘으면 "막 리셋됨(=방금 공격함)"으로 간주한다(타워와 동일 규칙). */
const JUST_ATTACKED_COOLDOWN_RATIO = 0.7;
/** 타워 예광선(2.5px, GOLD)보다 얇게 잡아 시각적으로 구분한다. */
const ATTACK_TRACER_LINE_WIDTH = 1.4;
const ATTACK_TRACER_ALPHA = 0.85;
/** 원거리 유닛 사거리 안내선 — 항상 켜져 있어도 거슬리지 않도록 매우 옅게 잡는다. */
const RANGE_HINT_ALPHA = 0.12;
const RANGE_HINT_LINE_WIDTH = 1;
const RANGE_HINT_DASH: readonly number[] = [4, 3];

/**
 * ★ 발사체 수정 (피드백: "제자리에서 이상한 화살표만 나간다") ★
 *
 * 예전에는 유닛·적 **전원**이 타워용 발사체 시트(`ally_flare` = `tf-w-01` 붉은 화살,
 * `enemy_arrow` = `tf-w-03` 푸른 화살)를 썼다. 그런데:
 *
 *   - `intern`·`trader` 는 사거리 0.05 = **밀착 근접**이다(`UNIT_MELEE_RANGE`).
 *   - 적 5종도 전부 근접이다(`combat/waves.ts`: `range: UNIT_MELEE_RANGE`, 주석에
 *     "근접이므로 유닛의 밀착 거리와 같다").
 *
 * 즉 화면의 화살표 대부분이 **근접 개체가 쏜 것**이었다. 이제 근접 개체는 탄을 그리지 않고
 * 접촉 타격(피격 스프라이트)만 그린다 — 때리는 동작은 `draw-units.ts` 의 공격 모션이 맡는다.
 * 남은 원거리 유닛(`analyst`)의 탄도 화살이 아니라 **캔**이다: 원본 `throwFrame` 의 손에서
 * 떠나는 물건이 `canFrame`(`tf-can-idle` / `tf-can-spin`)이고, 날아가는 동안 회전한다.
 *
 * `tf-w-01`/`tf-w-03` 은 여전히 **타워**가 쓴다(`draw-tracers.ts`) — 시트가 죽지 않는다.
 */
const ALLY_IMPACT: ImpactKind = 'ally';
const ENEMY_IMPACT: ImpactKind = 'enemy';

/**
 * 원거리 공격자인지 — 종류 이름이 아니라 **개체에 실린 사거리**로 판정한다.
 * (스탯은 개체에 실린다: `combat/types.ts` `Combatant` 주석. 부서 업그레이드로 사거리가
 * 달라져도 이 판정은 그대로 맞는다.)
 */
function isRangedAttacker(unit: Unit): boolean {
  return unit.range > UNIT_MELEE_RANGE;
}

/** 타워 예광선과 같은 규칙 — 이만큼 날아간 뒤에야 피격이 뜬다. */
const IMPACT_TRAVEL_AT = 0.5;

interface Point {
  readonly x: number;
  readonly y: number;
}

/** 공격 개체 공통 필드만 뽑아 쓴다 — `Unit`/`Enemy` 양쪽에 그대로 적용된다. */
interface Attacker {
  readonly cooldownMs: number;
  readonly attackCooldownMs: number;
  readonly hp: number;
}

/** 방금 공격했는지 — cooldownMs가 막 최댓값으로 리셋된 상태인지를 역산한다. */
function justAttacked(entity: Attacker): boolean {
  if (entity.hp <= 0) return false;
  return entity.cooldownMs > entity.attackCooldownMs * JUST_ATTACKED_COOLDOWN_RATIO;
}

/** 사거리 안에서 가장 가까운 지상 적을 고른다 — 유닛은 지상 적하고만 교전한다(FR-6.2). */
function closestGroundEnemyInRange(unit: Unit, enemies: readonly Enemy[]): Enemy | null {
  let best: Enemy | null = null;
  let bestGap = Number.POSITIVE_INFINITY;

  for (const enemy of enemies) {
    if (enemy.lane !== 'ground' || enemy.hp <= 0) continue;
    const gap = Math.abs(enemy.x - unit.x);
    if (gap > unit.range) continue;
    if (gap < bestGap) {
      best = enemy;
      bestGap = gap;
    }
  }

  return best;
}

/** 사거리 안에서 가장 가까운 유닛을 고른다 — 공중 적은 유닛과 절대 교전하지 않는다(FR-6.2). */
function closestUnitInRange(enemy: Enemy, units: readonly Unit[]): Unit | null {
  if (enemy.lane !== 'ground') return null;

  let best: Unit | null = null;
  let bestGap = Number.POSITIVE_INFINITY;

  for (const unit of units) {
    if (unit.hp <= 0) continue;
    const gap = Math.abs(unit.x - enemy.x);
    if (gap > enemy.range) continue;
    if (gap < bestGap) {
      best = unit;
      bestGap = gap;
    }
  }

  return best;
}

function drawTracerLine(ctx: BattleCtx, from: Point, to: Point, strokeStyle: string): void {
  ctx.save();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = ATTACK_TRACER_LINE_WIDTH;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

/**
 * 날아가는 캔 한 발. 비행 진행도로 `canFrame` 4프레임을 골라 **회전하는 그림**을 만든다
 * (원본 `canSpin()` 이 보여주는 그 회전이다). 그릴 수 없으면 `false`.
 */
function drawFlyingCan(
  ctx: BattleCtx,
  rasters: SpriteRasterCache,
  x: number,
  y: number,
  travel: number,
  facingLeft: boolean,
): boolean {
  const raster = unitAnimFrameRaster(rasters, 'can', unitAnimFrameAt('can', travel));
  if (raster === null) return false;
  return drawRasterCentered(ctx, raster, x, y, PROJECTILE_SPRITE_SCALE, facingLeft);
}

/**
 * 아군 유닛 한 체의 공격 그림. 그릴 수 없으면 `false` — 호출부가 벡터 공격선으로 넘어간다.
 * 진행도는 타워와 같은 규칙(쿨다운 역산)이라 두 계층이 서로 다른 속도로 움직이지 않는다.
 */
function drawUnitShot(
  ctx: BattleCtx,
  rasters: SpriteRasterCache,
  unit: Unit,
  from: Point,
  to: Point,
): boolean {
  // 근접: 밀착해서 때린다. 날아가는 탄이 없고, 접촉 순간부터 피격이 뜬다.
  if (!isRangedAttacker(unit)) return drawImpactSprite(ctx, rasters, ALLY_IMPACT, to.x, to.y);

  const travel = projectileTravel(unit.cooldownMs, unit.attackCooldownMs, JUST_ATTACKED_COOLDOWN_RATIO);
  const x = from.x + (to.x - from.x) * travel;
  const y = from.y + (to.y - from.y) * travel;

  if (!drawFlyingCan(ctx, rasters, x, y, travel, to.x < from.x)) return false;
  if (travel >= IMPACT_TRAVEL_AT) drawImpactSprite(ctx, rasters, ALLY_IMPACT, to.x, to.y);
  return true;
}

/** 방금 공격한 아군 유닛마다 사거리 내 가장 가까운 지상 적에게 공격선을 그린다. */
function drawUnitAttackTracers(
  ctx: BattleCtx,
  palette: Palette,
  layout: BattleLayout,
  units: readonly Unit[],
  enemies: readonly Enemy[],
  rasters: SpriteRasterCache,
): void {
  const strokeStyle = rgba(palette.UP_DEEP, ATTACK_TRACER_ALPHA);

  for (const unit of units) {
    if (!justAttacked(unit)) continue;
    const target = closestGroundEnemyInRange(unit, enemies);
    if (target === null) continue;

    const from: Point = { x: progressToX(unit.x, layout), y: allyUnitScreenY(unit, layout) };
    const to: Point = { x: progressToX(target.x, layout), y: laneY(target.lane, layout) };
    if (drawUnitShot(ctx, rasters, unit, from, to)) continue;
    drawTracerLine(ctx, from, to, strokeStyle);
  }
}

/** 방금 공격한 지상 적마다 사거리 내 가장 가까운 유닛에게 공격선을 그린다. */
function drawEnemyAttackTracers(
  ctx: BattleCtx,
  palette: Palette,
  layout: BattleLayout,
  enemies: readonly Enemy[],
  units: readonly Unit[],
  rasters: SpriteRasterCache,
): void {
  const strokeStyle = rgba(palette.ENEMY_DEEP, ATTACK_TRACER_ALPHA);

  for (const enemy of enemies) {
    if (!justAttacked(enemy)) continue;
    const target = closestUnitInRange(enemy, units);
    if (target === null) continue;

    const from: Point = { x: progressToX(enemy.x, layout), y: laneY(enemy.lane, layout) };
    const to: Point = { x: progressToX(target.x, layout), y: allyUnitScreenY(target, layout) };
    // 적 5종은 전부 근접이다 — 화살을 날리지 않고 접촉 타격만 그린다.
    if (drawImpactSprite(ctx, rasters, ENEMY_IMPACT, to.x, to.y)) continue;
    drawTracerLine(ctx, from, to, strokeStyle);
  }
}

/** 원거리 유닛(analyst)의 실제 사거리만큼 앞으로 뻗는 아주 옅은 안내선. */
function drawRangeHint(ctx: BattleCtx, palette: Palette, layout: BattleLayout, unit: Unit): void {
  const y = allyUnitScreenY(unit, layout);
  const fromX = progressToX(unit.x, layout);
  const toX = progressToX(Math.min(1, unit.x + unit.range), layout);
  if (toX <= fromX) return;

  ctx.save();
  ctx.strokeStyle = rgba(palette.UP_DEEP, RANGE_HINT_ALPHA);
  ctx.lineWidth = RANGE_HINT_LINE_WIDTH;
  ctx.setLineDash([...RANGE_HINT_DASH]);
  ctx.beginPath();
  ctx.moveTo(fromX, y);
  ctx.lineTo(toX, y);
  ctx.stroke();
  ctx.restore();
}

function drawRangedUnitRangeHints(ctx: BattleCtx, palette: Palette, layout: BattleLayout, units: readonly Unit[]): void {
  for (const unit of units) {
    if (!isRangedAttacker(unit) || unit.hp <= 0) continue;
    drawRangeHint(ctx, palette, layout, unit);
  }
}

/**
 * 유닛·적의 공격 예광선(방금 공격한 개체 → 사거리 내 가장 가까운 상대) + 원거리 유닛
 * 사거리 안내선을 그린다. 배틀 렌더 순서상 타워 예광선(`drawTracers`)과 함께, 실루엣을
 * 전부 그린 뒤 마지막에 호출한다.
 */
export function drawUnitTracers(
  ctx: BattleCtx,
  palette: Palette,
  layout: BattleLayout,
  state: CombatState,
  rasters: SpriteRasterCache = spriteRasters,
): void {
  drawRangedUnitRangeHints(ctx, palette, layout, state.units);
  drawUnitAttackTracers(ctx, palette, layout, state.units, state.enemies, rasters);
  drawEnemyAttackTracers(ctx, palette, layout, state.enemies, state.units, rasters);
}
