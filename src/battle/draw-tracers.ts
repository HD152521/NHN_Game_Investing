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
import { impactKindForProjectile, projectileKindForTower } from '../fx/index.js';
import type { ImpactKind, ProjectileKind } from '../fx/index.js';
import { drawSprite, snapScale, spriteRasters } from '../sprites/render/index.js';
import type { RenderableSpriteKey, SpriteRasterCache } from '../sprites/render/index.js';
import { spriteCtxOf } from './draw-background.js';
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

/* ------------------------------------------------------------------ *
 * 발사체 · 피격 스프라이트 (시트 §08 / PLAN Step 6)
 *
 * 발사체 종류 배정은 `src/fx/projectiles.ts`(순수 함수)가 이미 정했다. 여기서는 그
 * 결과를 시트 키로 옮기기만 한다 — 렌더러가 색·종류를 즉흥으로 고르지 않는다.
 * ------------------------------------------------------------------ */

/** 유닛 스프라이트(`draw-units.ts`의 1×)와 같은 배율이라야 탄이 유닛보다 커 보이지 않는다. */
export const PROJECTILE_SPRITE_SCALE = 1;

/** 발사체 종류 → 시트 키. `tf-w-04`는 피격 전용이라 여기 없다. */
const PROJECTILE_SPRITE_KEY = {
  ally_flare: 'tf-w-01',
  anchor_bolt: 'tf-w-02',
  enemy_arrow: 'tf-w-03',
} as const satisfies Record<ProjectileKind, RenderableSpriteKey>;

/** 피격 스프라이트 — 원본 `proj(4)`는 **3종을 한 장에 나란히** 담은 시트다. */
const IMPACT_SPRITE_KEY: RenderableSpriteKey = 'tf-w-04';

/**
 * 피격 3종의 원본 x 구간(px). 원본 `proj(4)`가 적색 디스크(중심 7) · 청색(17) · 무채(25)를
 * 한 장에 늘어놓았으므로, 필요한 한 종만 잘라 쓴다. 구간은 스파이크(반지름 5)까지 포함한다.
 */
const IMPACT_REGION_X = { ally: 0, enemy: 12, neutral: 22 } as const satisfies Record<ImpactKind, number>;
const IMPACT_REGION_W = { ally: 13, enemy: 11, neutral: 6 } as const satisfies Record<ImpactKind, number>;

/**
 * 이 비율 이상 날아갔을 때만 피격을 그린다. 발사 직후부터 표적에 파열이 떠 있으면
 * "날아가서 맞았다"가 아니라 "처음부터 맞아 있었다"로 읽힌다.
 */
const IMPACT_TRAVEL_AT = 0.5;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * 쿨다운 → 비행 진행도(0~1).
 *
 * `justFired` 창(쿨다운 최댓값의 70~100%) 안에서만 호출되므로, 그 창을 0~1로 편다.
 * 발사 순간(쿨다운 = 최댓값)이 0, 창의 끝이 1이다 — 상태를 새로 추가하지 않고
 * 기존 쿨다운만으로 탄이 실제로 **날아가는** 그림이 나온다.
 */
export function projectileTravel(cooldownMs: number, maxCooldownMs: number, firedRatio: number): number {
  const window = maxCooldownMs * (1 - firedRatio);
  if (window <= 0) return 1;
  return clampUnit((maxCooldownMs - cooldownMs) / window);
}

/** 발사체 스프라이트를 `(cx, cy)` 중심에 그린다. 그릴 수 없으면 `false`(호출부가 폴백). */
export function drawProjectileSprite(
  ctx: BattleCtx,
  rasters: SpriteRasterCache,
  kind: ProjectileKind,
  cx: number,
  cy: number,
  facingLeft: boolean,
): boolean {
  const target = spriteCtxOf(ctx);
  if (target === null) return false;
  const raster = rasters.ofKey(PROJECTILE_SPRITE_KEY[kind]);
  if (raster === null) return false;

  const step = snapScale(PROJECTILE_SPRITE_SCALE);
  drawSprite(target, raster, cx - (raster.width * step) / 2, cy - (raster.height * step) / 2, step, facingLeft);
  return true;
}

/**
 * 피격 스프라이트 한 종만 잘라 `(cx, cy)` 중심에 그린다.
 *
 * 사각 클립으로 원하는 구간만 남기고 시트 전체를 그 뒤에 얹는다 — 그리드를 복사하지
 * 않으므로 `src/sprites`를 건드리지 않는다.
 */
export function drawImpactSprite(
  ctx: BattleCtx,
  rasters: SpriteRasterCache,
  kind: ImpactKind,
  cx: number,
  cy: number,
): boolean {
  const target = spriteCtxOf(ctx);
  if (target === null) return false;
  const raster = rasters.ofKey(IMPACT_SPRITE_KEY);
  if (raster === null) return false;

  const step = snapScale(PROJECTILE_SPRITE_SCALE);
  const width = IMPACT_REGION_W[kind] * step;
  const height = raster.height * step;
  const left = Math.round(cx - width / 2);
  const top = Math.round(cy - height / 2);

  target.save();
  target.beginPath();
  target.rect(left, top, width, height);
  target.clip();
  drawSprite(target, raster, left - IMPACT_REGION_X[kind] * step, top, step);
  target.restore();
  return true;
}

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

/**
 * 시트 스프라이트로 "탄이 날아가고 → 맞는다"를 그린다. 그릴 수 없으면 `false` —
 * 호출부가 벡터 예광선으로 넘어간다(배경 `drawSkySprites`와 같은 계약).
 */
function drawShotSprites(
  ctx: BattleCtx,
  rasters: SpriteRasterCache,
  tower: Tower,
  from: Point,
  to: Point,
): boolean {
  const projectile = projectileKindForTower(tower.kind);
  const travel = projectileTravel(tower.cooldownMs, TOWER_COOLDOWN_MS[tower.kind], JUST_FIRED_COOLDOWN_RATIO);
  const x = from.x + (to.x - from.x) * travel;
  const y = from.y + (to.y - from.y) * travel;

  if (!drawProjectileSprite(ctx, rasters, projectile, x, y, to.x < from.x)) return false;
  if (travel >= IMPACT_TRAVEL_AT) drawImpactSprite(ctx, rasters, impactKindForProjectile(projectile), to.x, to.y);
  return true;
}

function drawTracerToTarget(
  ctx: BattleCtx,
  palette: Palette,
  from: Point,
  enemy: Enemy,
  layout: BattleLayout,
  tower: Tower,
  rasters: SpriteRasterCache,
): void {
  const to = targetPoint(enemy, layout);
  if (drawShotSprites(ctx, rasters, tower, from, to)) return;
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
export function drawTracers(
  ctx: BattleCtx,
  palette: Palette,
  layout: BattleLayout,
  state: CombatState,
  rasters: SpriteRasterCache = spriteRasters,
): void {
  const towerSlots = state.towerSlots;
  if (towerSlots <= 0) return;

  for (const tower of state.towers) {
    if (!justFired(tower)) continue;

    const candidates = candidatesFor(tower, state.enemies);
    if (candidates.length === 0) continue;

    const from = muzzlePoint(tower, layout, towerSlots);

    if (tower.kind === 'splash') {
      for (const enemy of candidates) {
        drawTracerToTarget(ctx, palette, from, enemy, layout, tower, rasters);
      }
      continue;
    }

    const target = pickPriorityTarget(candidates);
    if (target === null) continue;
    drawTracerToTarget(ctx, palette, from, target, layout, tower, rasters);
  }
}
