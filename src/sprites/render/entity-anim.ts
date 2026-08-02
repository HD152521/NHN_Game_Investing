/**
 * 엔티티 모션 프레임의 래스터 배선 — 적 공격 · 걷기 · 타워 발사 · 보스 · 기지 피격.
 *
 * `anim.ts`(아군 공격 4종)와 같은 규약을 따른다:
 *
 * ★ 스트립 시트를 잘라 쓰지 않는다 ★
 *   원본 `strip()` 은 `stamp` 를 거치며 팔레트 문자를 **그 시점의 기본 팔레트 HEX 로
 *   구워버린다**. 구워진 시트를 화면에 쓰면 색약 모드에서 그 모션이 재생되는 순간에만
 *   원래 색으로 튄다. 그래서 화면에는 프레임 생성기의 **문자 그리드**를 직접 굽는다.
 *   타워 발사는 원본 생성기 자체가 몸통을 구우므로 문자를 보존하는 `towerFireFrame` 을
 *   쓴다 — 두 경로가 같은 그림이라는 것은 `sprites/tower-anim.test.ts` 가 고정한다.
 *
 * ★ 프레임당 할당 0 ★
 *   프레임 소스(`SpriteSource`)는 처음 쓸 때 한 번만 만들어 배열에 넣어 둔다.
 *
 * ★ 합성 분류는 시트 키에서 물려받는다 ★ 분류를 두 번 정하지 않는다.
 */

import { allyAnchor, allyRookie, allyScout } from '../ally';
import { ANIM_FRAMES, type AnimFrame } from '../anim';
import { baseAllyDamage } from '../base-anim';
import { bossFrame } from '../boss-anim';
import { enemyBlocker, enemyRusher, enemyTank } from '../enemy';
import { eAirAtk, eAtk } from '../enemy-anim';
import type { SpriteGrid } from '../grid';
import { towerFireFrame } from '../tower-anim';
import { walk, type SpriteBase } from '../walk';
import type { SpriteRaster, SpriteRasterCache, SpriteSource } from './cache';
import { SPRITE_COMPOSITE, type CompositeClass, type RenderableSpriteKey } from './composite';

interface EntityAnimDef {
  /** 원본 대조용 시트 키. 합성 분류를 여기서 그대로 물려받는다. */
  readonly sheet: RenderableSpriteKey;
  readonly builders: readonly (() => SpriteGrid)[];
  /** 프레임 소스 메모(가변). 캐시와 같은 성격이라 예외적으로 제자리 갱신한다. */
  readonly sources: (SpriteSource | null)[];
}

function frames(build: (frame: AnimFrame) => SpriteGrid): readonly (() => SpriteGrid)[] {
  return ANIM_FRAMES.map((frame) => () => build(frame));
}

function emptySources(): (SpriteSource | null)[] {
  return ANIM_FRAMES.map(() => null);
}

function def(sheet: RenderableSpriteKey, build: (frame: AnimFrame) => SpriteGrid): EntityAnimDef {
  return { sheet, builders: frames(build), sources: emptySources() };
}

/**
 * 걷기는 **파라메트릭**이다 — 원본 키 3장(`tf-walk-ally` = `allyRookie`,
 * `tf-walk-tank` = `allyAnchor`, `tf-walk-enemy` = `enemyBlocker`)은 `walk(base, f)` 의
 * 별칭일 뿐이라, 키가 없는 유닛도 자기 정지 스프라이트로 걷게 만들 수 있다
 * (`ground(2, 2)` 처럼 원본 키에 없는 조합을 만드는 것과 같은 근거다).
 * 그 편이 "다른 유닛의 몸통으로 걷는" 것보다 정확하다.
 *
 * ⚠️ 공중 2종(`tf-enemy-air-*`)은 여기 없다. `walk` 은 아래 10px 띠를 다리로 보고 좌우로
 *    미는데, 다리가 없는 연·사이렌은 꼬리가 어긋나 보인다. 공중은 정지 스프라이트를 쓴다.
 */
const WALK_BASES: Readonly<Partial<Record<RenderableSpriteKey, SpriteBase>>> = {
  'tf-ally-01': allyRookie,
  'tf-ally-02': allyScout,
  'tf-ally-03': allyAnchor,
  'tf-enemy-01': enemyRusher,
  'tf-enemy-02': enemyBlocker,
  'tf-enemy-03': enemyTank,
};

/** 걷기 프레임의 합성 분류·원본 대조 출처. 어떤 몸통이든 `walk` 의 성질은 같다. */
const WALK_SHEET: RenderableSpriteKey = 'tf-walk-ally';

const ENTITY_ANIMS = {
  // ── 적 5종 공격 (원본 `tf-eatk-01~05` 와 같은 순서)
  'eatk-01': def('tf-eatk-01', (f) => eAtk(1, f)),
  'eatk-02': def('tf-eatk-02', (f) => eAtk(2, f)),
  'eatk-03': def('tf-eatk-03', (f) => eAtk(3, f)),
  'eatk-04': def('tf-eatk-04', (f) => eAirAtk(1, f)),
  'eatk-05': def('tf-eatk-05', (f) => eAirAtk(2, f)),

  // ── 걷기 (정지 스프라이트 키별)
  'walk:tf-ally-01': def(WALK_SHEET, (f) => walk(allyRookie, f)),
  'walk:tf-ally-02': def(WALK_SHEET, (f) => walk(allyScout, f)),
  'walk:tf-ally-03': def('tf-walk-tank', (f) => walk(allyAnchor, f)),
  'walk:tf-enemy-01': def('tf-walk-enemy', (f) => walk(enemyRusher, f)),
  'walk:tf-enemy-02': def('tf-walk-enemy', (f) => walk(enemyBlocker, f)),
  'walk:tf-enemy-03': def('tf-walk-enemy', (f) => walk(enemyTank, f)),

  // ── 타워 발사. 레벨 2 는 같은 프레임 위에 금색 장식(`t2`)이 얹힌 파라메트릭 조합이다
  //    (원본 키 `tf-t2-*` 는 그중 f 0 한 장이다).
  'tfire-01-l1': def('tf-tfire-01', (f) => towerFireFrame(1, f, false)),
  'tfire-02-l1': def('tf-tfire-02', (f) => towerFireFrame(2, f, false)),
  'tfire-03-l1': def('tf-tfire-03', (f) => towerFireFrame(3, f, false)),
  'tfire-01-l2': def('tf-t2-01', (f) => towerFireFrame(1, f, true)),
  'tfire-02-l2': def('tf-t2-02', (f) => towerFireFrame(2, f, true)),
  'tfire-03-l2': def('tf-t2-03', (f) => towerFireFrame(3, f, true)),

  // ── 보스 패턴 2종
  'boss-p1': def('tf-boss-p1', (f) => bossFrame(1, f)),
  'boss-p2': def('tf-boss-p2', (f) => bossFrame(2, f)),

  // ── 기지 피격 (프레임 번호 = 피해 단계. 루프가 아니다)
  'basedmg-ally': def('tf-basedmg-ally', baseAllyDamage),
} as const satisfies Record<string, EntityAnimDef>;

/** 엔티티 모션 한 종의 id. */
export type EntityAnimId = keyof typeof ENTITY_ANIMS;

export const ENTITY_ANIM_IDS = Object.keys(ENTITY_ANIMS) as readonly EntityAnimId[];

/** 정지 스프라이트 키 → 걷기 모션 id. 걷기가 없는 키(공중 2종)는 `null`. */
export function walkAnimId(key: RenderableSpriteKey): EntityAnimId | null {
  const id = `walk:${key}`;
  return id in ENTITY_ANIMS ? (id as EntityAnimId) : null;
}

/** 공중 2종에 걷기를 붙이지 않았다는 사실을 호출부가 확인할 수 있게 노출한다. */
export const WALKABLE_SPRITE_KEYS = Object.keys(WALK_BASES) as readonly RenderableSpriteKey[];

/** 모션 한 종의 프레임 수. */
export function entityAnimFrameCount(id: EntityAnimId): number {
  return ENTITY_ANIMS[id].builders.length;
}

/** 모션 한 종의 원본 시트 키(합성 분류·원본 대조의 출처). */
export function entityAnimSheetKey(id: EntityAnimId): RenderableSpriteKey {
  return ENTITY_ANIMS[id].sheet;
}

/** 모션 프레임의 합성 분류. 시트 키의 분류를 그대로 쓴다. */
export function entityAnimComposite(id: EntityAnimId): CompositeClass {
  return SPRITE_COMPOSITE[ENTITY_ANIMS[id].sheet];
}

function clampFrame(index: number, count: number): number {
  if (!Number.isFinite(index)) return 0;
  const floored = Math.floor(index);
  if (floored < 0) return 0;
  return floored > count - 1 ? count - 1 : floored;
}

/** 프레임 한 장의 문자 그리드. 팔레트 문자가 살아 있어 색약 모드를 따라간다. */
export function entityAnimFrameGrid(id: EntityAnimId, index: number): SpriteGrid {
  const anim = ENTITY_ANIMS[id];
  const builder = anim.builders[clampFrame(index, anim.builders.length)];
  return builder === undefined ? [] : builder();
}

/** 프레임 한 장의 굽기 요청. 최초 1회만 만들어 재사용한다(프레임당 할당 0). */
export function entityAnimFrameSource(id: EntityAnimId, index: number): SpriteSource {
  const anim = ENTITY_ANIMS[id];
  const i = clampFrame(index, anim.builders.length);
  const memo = anim.sources[i];
  if (memo !== null && memo !== undefined) return memo;

  const created: SpriteSource = {
    id: `entity:${id}#${i}`,
    grid: entityAnimFrameGrid(id, i),
    composite: SPRITE_COMPOSITE[anim.sheet],
  };
  anim.sources[i] = created;
  return created;
}

/** 프레임 한 장의 래스터. 못 구우면 `null`(호출부가 정지 스프라이트로 폴백). */
export function entityAnimFrameRaster(
  cache: SpriteRasterCache,
  id: EntityAnimId,
  index: number,
): SpriteRaster | null {
  return cache.raster(entityAnimFrameSource(id, index));
}

/** 재생 진행도(0~1) → 프레임 번호. 진행도 1 은 마지막 프레임에 붙는다. */
export function entityAnimFrameAt(id: EntityAnimId, progress: number): number {
  const count = entityAnimFrameCount(id);
  if (!Number.isFinite(progress)) return 0;
  return clampFrame(progress * count, count);
}
