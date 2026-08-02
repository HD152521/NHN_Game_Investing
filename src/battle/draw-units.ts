/**
 * 적 · 아군 유닛 그리기 — 각자 위치에 스프라이트 + HP 바.
 *
 * ★ 이 파일은 "무엇을 어디에 그릴지"만 정한다. 실제 그림은 전부 `src/sprites/**` 의
 *   이식본이다 — 디자인 원본(`docs/design-reference/ticker-front-sprites.js`)의 드로잉
 *   코드를 문자 단위로 옮긴 것이라, 화면에 나오는 유닛이 디자인 원본과 같은 그림이다.
 *   예전에는 `src/battle/shapes/**` 에서 아트 시트의 *글로 된 묘사*만 보고 도형을 새로
 *   발명했는데, 그래서 "디자인이 다 다르다"는 상태가 됐다(PLAN Step 3).
 *
 * ★ 좌우 반전을 쓰지 않는다 ★ 원본 그리드가 이미 전투 방향을 보고 있다.
 *   근거와 실측은 `entity-sprites.ts` 머리말에 있다.
 *
 * ★ 적의 종류 선택: `Enemy`에는 종류 필드가 없다(시뮬레이션은 레인과 스탯만으로 돈다).
 *   렌더러가 id로 결정적으로 고르므로(`enemyKindForId`) 같은 적은 매 프레임 같은 모습이고,
 *   한 화면에 지상 3종 · 공중 2종이 섞여 보인다.
 */

import type { EnemyKind } from '../combat/identity.js';
import type { Combatant, Enemy, Unit, UnitKind } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import {
  entityAnimFrameAt,
  entityAnimFrameCount,
  entityAnimFrameRaster,
  spriteRasters,
  unitAnimFrameAt,
  unitAnimFrameRaster,
  walkAnimId,
} from '../sprites/render/index.js';
import type { EntityAnimId, RenderableSpriteKey, SpriteRaster, UnitAnimId } from '../sprites/render/index.js';
import { drawUnitSprite, syncSpriteColorMode } from './draw-sprite.js';
import { drawHpBar } from './draw-hp-bar.js';
import { ALLY_SPRITES, ENEMY_SPRITES, enemyKindForId } from './entity-sprites.js';
import type { BattleLayout } from './layout.js';
import { laneY, progressToX } from './layout.js';
import type { BattleCtx } from './surface.js';

const HP_BAR_WIDTH = 26;
const HP_BAR_HEIGHT = 4;
/** 가장 큰 스프라이트(34 px 높이)의 머리 위로 넉넉히 띄운다. */
const HP_BAR_OFFSET_Y = 32;
/** 같은 지점에 겹치는 아군 유닛을 살짝 흩어 보이게 하는 세로 지터(px) — id 기반 결정적 패턴. */
const UNIT_Y_JITTER = 9;

/**
 * 유닛 스프라이트 배율.
 *
 * 원본 그리드가 26~30 × 34 px 라, 1× 가 예전 도형 실루엣(반높이 `UNIT_RADIUS` 12 × 0.85~1.3
 * = 높이 20~31 px)과 거의 같은 화면 크기다. 즉 레이아웃 상수(레인 간격 · `HP_BAR_OFFSET_Y`)를
 * 하나도 건드리지 않고 그림만 교체할 수 있다. 2× 로 키우면 지상 유닛이 공중 레인까지 닿는다.
 */
const UNIT_SPRITE_SCALE = 1;

/* ------------------------------------------------------------------ *
 * 공격 모션 (원본 갱신분 `tf-melee-loop` / `tf-throw-loop` / `tf-shield-loop`)
 *
 * 피드백: "그냥 제자리에서 이상한 화살표만 나간다." 유닛이 정지 스프라이트로 서 있고
 * 발사체만 날아가서 **때리는 동작이 없었다.**
 *
 * ★ 상태를 새로 만들지 않는다 ★ `CombatState` 에 "지금 몇 번째 프레임" 같은 필드를 넣지
 *   않고, 예광선(`draw-tracers.ts` / `draw-unit-tracers.ts`)과 **같은 방식**으로 쿨다운에서
 *   역산한다: `cooldownMs` 가 막 최댓값으로 리셋된 직후가 곧 공격 모션 재생 구간이다.
 *   두 계층이 같은 창(70~100%)을 쓰므로 모션과 탄이 어긋나지 않는다.
 * ------------------------------------------------------------------ */

/** 쿨다운이 최댓값의 이 비율을 넘으면 "막 공격함" — 예광선과 같은 규칙이라야 그림이 맞는다. */
const ATTACK_ANIM_COOLDOWN_RATIO = 0.7;

/**
 * 유닛 종류 → 공격 모션. **근거는 원본 프레임 그림이다**(이름이 아니다):
 *
 *  - `intern`(A-01 근거리, `tf-ally-01` = `allyRookie`) → `meleeFrame`.
 *    원본 `meleeFrame` 의 몸통은 `allyRookie` 와 좌표까지 같고(`rect(8,26,4,6,'2')` …),
 *    거기에 `lean` 과 칼 4프레임이 붙어 있다. 같은 유닛의 공격 자세다.
 *  - `analyst`(A-02 원거리, `tf-ally-02` = `allyScout`) → `throwFrame`.
 *    원본 `throwFrame` 의 몸통은 `allyScout` 과 좌표까지 같고(`disc(5,18,4,'m')` 어깨 원반,
 *    `rect(8,13,11,13,'3')` 몸통), 팔이 캔을 던지는 4프레임이다.
 *  - `trader`(A-03 탱커, `tf-ally-03` = `allyAnchor`) → `shieldFrame`.
 *    원본 `shieldFrame` 의 몸통은 `allyAnchor` 와 좌표까지 같고(`disc(6,14,4,'3')` 어깨),
 *    `allyAnchor` 의 세로 방패(`rect(21,10,6,19,'m')`)가 `push` 만큼 앞으로 나간다.
 *
 * (적 5종은 아래 `ENEMY_ATTACK_ANIM` 이 맡는다 — 원본 갱신으로 `tf-eatk-01~05` 가 들어왔다.)
 */
export const UNIT_ATTACK_ANIM: Readonly<Record<UnitKind, UnitAnimId>> = {
  intern: 'melee',
  analyst: 'throw',
  trader: 'shield',
};

/**
 * 악당 종류 → 공격 모션. **근거는 순번이다**(이름이 아니다):
 * 원본 `sheets()` 가 `tf-eatk-01~03 = eAtk(1~3)`(지상 3종), `tf-eatk-04~05 = eAirAtk(1~2)`
 * (공중 2종)을 §05 악당 순번(E-01~E-05) 그대로 늘어놓았다.
 * `ENEMY_SPRITES` 의 정지 스프라이트 순번과 1:1 로 맞물린다.
 */
export const ENEMY_ATTACK_ANIM: Readonly<Record<EnemyKind, EntityAnimId>> = {
  /** E-01 갭하락 첨병 — `eAtk(1)` 창 찌르기. */
  gapScout: 'eatk-01',
  /** E-02 반대매매 집행관 — `eAtk(2)` 망치. */
  marginEnforcer: 'eatk-02',
  /** E-03 청산 굴착기 — `eAtk(3)` 집게. */
  liquidationDigger: 'eatk-03',
  /** E-04 루머 연 — `eAirAtk(1)`. */
  rumorKite: 'eatk-04',
  /** E-05 패닉 사이렌 — `eAirAtk(2)`. */
  panicSiren: 'eatk-05',
};

/* ------------------------------------------------------------------ *
 * 걷기 모션 (원본 갱신분 `tf-walk-ally` / `tf-walk-tank` / `tf-walk-enemy`)
 *
 * ★ 상태를 새로 만들지 않는다 ★ `CombatState` 에 "이동 중" 플래그도, 이전 프레임의 x 도
 *   없다. 대신 **위치 자체를 위상으로 쓴다**: 프레임 번호를 `x`(0~1 진행도)에서 뽑으면
 *
 *     - 이동 중이면 `x` 가 계속 변하므로 프레임이 자동으로 돌아간다,
 *     - 막혀 서 있으면 `x` 가 멈추므로 프레임도 멈춘다(제자리 걸음이 안 생긴다),
 *     - 렌더러가 이전 프레임을 기억할 필요가 없다(프레임당 할당 0, id별 Map 불필요).
 *
 *   즉 "이동 여부"를 따로 역산할 필요 자체가 없어진다. 걸음 간격은 아래 상수 하나다.
 * ------------------------------------------------------------------ */

/**
 * 트랙(진행도 0→1) 하나를 지나는 동안 넘기는 걷기 프레임 수.
 *
 * 유닛 속도 0.05/트랙·초 → 160 × 0.05 = 초당 8프레임 = 4프레임 루프가 2회/초.
 * 사람 걸음 정도의 보폭이고, 가장 느린 적(1/22 ≈ 0.045)에서도 7.3프레임/초라 끊겨 보이지 않는다.
 */
export const WALK_FRAMES_PER_TRACK = 160;

/** 진행도 → 걷기 프레임 번호. `x` 가 멈추면 프레임도 멈춘다. */
export function walkFrameAt(x: number, frameCount: number): number {
  if (!Number.isFinite(x) || frameCount <= 0) return 0;
  const step = Math.floor(x * WALK_FRAMES_PER_TRACK);
  return ((step % frameCount) + frameCount) % frameCount;
}

/**
 * 걷기 프레임 래스터. 걷기가 없는 스프라이트(공중 2종)나 굽기 실패 시 `null`.
 * 공중을 뺀 이유는 `sprites/render/entity-anim.ts` 의 `WALK_BASES` 주석에 있다.
 */
function walkFrameRaster(key: RenderableSpriteKey, x: number): SpriteRaster | null {
  const anim = walkAnimId(key);
  if (anim === null) return null;
  return entityAnimFrameRaster(spriteRasters, anim, walkFrameAt(x, entityAnimFrameCount(anim)));
}

/**
 * 공격 모션 재생 진행도(0~1). 재생 구간이 아니면 `null`.
 *
 * `cooldownMs` 는 공격 직후 `attackCooldownMs` 로 리셋되고 0 을 향해 줄어든다. 그래서
 * 경과 = `attackCooldownMs - cooldownMs` 이고, 재생 창은 그 경과가 창 길이
 * (`attackCooldownMs × (1 - 비율)`) 미만인 동안이다.
 */
export function attackAnimProgress(entity: Combatant): number | null {
  if (entity.hp <= 0) return null;
  const window = entity.attackCooldownMs * (1 - ATTACK_ANIM_COOLDOWN_RATIO);
  if (window <= 0) return null;
  const elapsed = entity.attackCooldownMs - entity.cooldownMs;
  if (elapsed < 0 || elapsed >= window) return null;
  return elapsed / window;
}

/** 지금 이 유닛이 보여야 할 공격 프레임 래스터. 공격 중이 아니거나 못 구우면 `null`. */
function attackFrameRaster(unit: Unit): SpriteRaster | null {
  const progress = attackAnimProgress(unit);
  if (progress === null) return null;
  const anim = UNIT_ATTACK_ANIM[unit.kind];
  return unitAnimFrameRaster(spriteRasters, anim, unitAnimFrameAt(anim, progress));
}

/** 지금 이 악당이 보여야 할 공격 프레임 래스터. 아군과 **같은 쿨다운 역산**을 쓴다. */
function enemyAttackFrameRaster(enemy: Enemy, kind: EnemyKind): SpriteRaster | null {
  const progress = attackAnimProgress(enemy);
  if (progress === null) return null;
  const anim = ENEMY_ATTACK_ANIM[kind];
  return entityAnimFrameRaster(spriteRasters, anim, entityAnimFrameAt(anim, progress));
}

/**
 * 이 개체가 지금 보여야 할 프레임 — **공격이 걷기보다 우선**이다.
 * 둘 다 아니면 `null`(정지 스프라이트).
 */
function motionFrame(attack: SpriteRaster | null, key: RenderableSpriteKey, x: number): SpriteRaster | null {
  return attack ?? walkFrameRaster(key, x);
}

function hpBarRect(cx: number, cy: number): { x: number; y: number; w: number; h: number } {
  return { x: cx - HP_BAR_WIDTH / 2, y: cy - HP_BAR_OFFSET_Y, w: HP_BAR_WIDTH, h: HP_BAR_HEIGHT };
}

export function drawEnemies(ctx: BattleCtx, palette: Palette, layout: BattleLayout, enemies: readonly Enemy[]): void {
  syncSpriteColorMode(palette);

  for (const enemyUnit of enemies) {
    const cx = progressToX(enemyUnit.x, layout);
    const cy = laneY(enemyUnit.lane, layout);

    const kind = enemyKindForId(enemyUnit.lane, enemyUnit.id);
    const key = ENEMY_SPRITES[kind].key;
    const frame = motionFrame(enemyAttackFrameRaster(enemyUnit, kind), key, enemyUnit.x);
    // 정지 스프라이트 원점을 그대로 쓴다 — 프레임이 더 넓어도 몸이 좌우로 튀지 않는다.
    drawUnitSprite(ctx, key, frame, cx, cy, UNIT_SPRITE_SCALE);

    const bar = hpBarRect(cx, cy);
    drawHpBar(ctx, { ...bar, hp: enemyUnit.hp, maxHp: enemyUnit.maxHp, color: palette.ENEMY_DOWN, palette });
  }
}

/** id 기반 결정적 세로 지터 — 같은 x에 겹치는 아군 유닛이 완전히 포개지지 않게 한다. */
function jitterFor(id: number): number {
  const bucket = ((id % 3) + 3) % 3;
  return (bucket - 1) * UNIT_Y_JITTER;
}

/**
 * 아군 유닛이 실제로 그려지는 화면 y(지상 고정 + id 기반 지터).
 *
 * 예광선(`draw-unit-tracers.ts`)이 공격선의 시작점을 이 스프라이트의 실제 위치와 맞추려면
 * 같은 지터 계산을 재사용해야 한다 — 여기서 export해 중복 계산을 막는다.
 */
export function allyUnitScreenY(unit: Unit, layout: BattleLayout): number {
  return layout.groundY + jitterFor(unit.id);
}

export function drawAllies(ctx: BattleCtx, palette: Palette, layout: BattleLayout, units: readonly Unit[]): void {
  syncSpriteColorMode(palette);

  for (const unit of units) {
    const cx = progressToX(unit.x, layout);
    const cy = allyUnitScreenY(unit, layout);

    const key = ALLY_SPRITES[unit.kind].key;
    drawUnitSprite(ctx, key, motionFrame(attackFrameRaster(unit), key, unit.x), cx, cy, UNIT_SPRITE_SCALE);

    const bar = hpBarRect(cx, cy);
    drawHpBar(ctx, { ...bar, hp: unit.hp, maxHp: unit.maxHp, color: palette.UP_ALLY, palette });
  }
}
