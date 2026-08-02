/**
 * 공격 모션 프레임의 래스터 배선.
 *
 * ★ 왜 스트립 시트(`tf-melee-loop` …)를 잘라 쓰지 않는가 ★
 *   원본 `strip()` 은 `stamp` 를 거치면서 팔레트 문자를 **그 시점의 기본 팔레트 HEX 로
 *   구워버린다**(`sprites/strip.ts` 머리말). 구워진 시트를 화면에 쓰면 색약 모드를 켰을 때
 *   서 있는 유닛(`tf-ally-01`, 문자 그리드)만 색이 바뀌고 **때리는 순간에만 원래 색으로
 *   되돌아간다.** 그래서 게임 화면에는 프레임 생성기(`sprites/anim.ts`)의 문자 그리드를
 *   직접 굽는다 — 스트립 시트는 원본 대조·참조용으로만 남는다.
 *   두 경로가 같은 그림이라는 것은 `sprites/strip.test.ts` 가 픽셀 단위로 고정한다.
 *
 * ★ 프레임당 할당 0 ★
 *   프레임 소스(`SpriteSource`)는 **처음 쓸 때 한 번만** 만들고 배열에 넣어 둔다. 그 다음
 *   부터는 배열 인덱스 조회 + 캐시 적중뿐이라 객체·문자열을 만들지 않는다.
 */

import { ANIM_FRAMES, canFrame, meleeFrame, shieldFrame, throwFrame, type AnimFrame } from '../anim';
import type { SpriteGrid } from '../grid';
import type { SpriteRaster, SpriteRasterCache, SpriteSource } from './cache';
import { SPRITE_COMPOSITE, type CompositeClass, type RenderableSpriteKey } from './composite';

/** 유닛 공격 모션 4종. `can` 은 유닛이 아니라 **원거리 유닛이 던지는 캔**이다. */
export type UnitAnimId = 'melee' | 'throw' | 'shield' | 'can';

export const UNIT_ANIM_IDS: readonly UnitAnimId[] = ['melee', 'throw', 'shield', 'can'];

interface UnitAnimDef {
  readonly id: UnitAnimId;
  /** 원본 대조용 시트 키. 합성 분류를 이 키에서 그대로 물려받는다(분류를 두 번 정하지 않는다). */
  readonly sheet: RenderableSpriteKey;
  readonly builders: readonly (() => SpriteGrid)[];
  /** 프레임 소스 메모(가변). 캐시와 같은 성격이라 예외적으로 제자리 갱신한다. */
  readonly sources: (SpriteSource | null)[];
}

function frameBuilders(build: (frame: AnimFrame) => SpriteGrid): readonly (() => SpriteGrid)[] {
  return ANIM_FRAMES.map((frame) => () => build(frame));
}

function emptySources(): (SpriteSource | null)[] {
  return ANIM_FRAMES.map(() => null);
}

const UNIT_ANIMS: Readonly<Record<UnitAnimId, UnitAnimDef>> = {
  melee: { id: 'melee', sheet: 'tf-melee-loop', builders: frameBuilders(meleeFrame), sources: emptySources() },
  throw: { id: 'throw', sheet: 'tf-throw-loop', builders: frameBuilders(throwFrame), sources: emptySources() },
  shield: { id: 'shield', sheet: 'tf-shield-loop', builders: frameBuilders(shieldFrame), sources: emptySources() },
  can: { id: 'can', sheet: 'tf-can-spin', builders: frameBuilders(canFrame), sources: emptySources() },
};

/** 모션 한 종의 프레임 수. */
export function unitAnimFrameCount(id: UnitAnimId): number {
  return UNIT_ANIMS[id].builders.length;
}

/** 모션 한 종의 원본 시트 키(합성 분류·원본 대조의 출처). */
export function unitAnimSheetKey(id: UnitAnimId): RenderableSpriteKey {
  return UNIT_ANIMS[id].sheet;
}

/** 모션 프레임의 합성 분류. 시트 키의 분류를 그대로 쓴다. */
export function unitAnimComposite(id: UnitAnimId): CompositeClass {
  return SPRITE_COMPOSITE[UNIT_ANIMS[id].sheet];
}

function clampFrame(index: number, count: number): number {
  if (!Number.isFinite(index)) return 0;
  const floored = Math.floor(index);
  if (floored < 0) return 0;
  return floored > count - 1 ? count - 1 : floored;
}

/** 프레임 한 장의 문자 그리드. 팔레트 문자가 살아 있어 색약 모드를 따라간다. */
export function unitAnimFrameGrid(id: UnitAnimId, index: number): SpriteGrid {
  const def = UNIT_ANIMS[id];
  const builder = def.builders[clampFrame(index, def.builders.length)];
  return builder === undefined ? [] : builder();
}

/** 프레임 한 장의 굽기 요청. 최초 1회만 만들어 재사용한다(프레임당 할당 0). */
export function unitAnimFrameSource(id: UnitAnimId, index: number): SpriteSource {
  const def = UNIT_ANIMS[id];
  const i = clampFrame(index, def.builders.length);
  const memo = def.sources[i];
  if (memo !== null && memo !== undefined) return memo;

  const created: SpriteSource = {
    id: `anim:${def.id}#${i}`,
    grid: unitAnimFrameGrid(id, i),
    composite: SPRITE_COMPOSITE[def.sheet],
  };
  def.sources[i] = created;
  return created;
}

/** 프레임 한 장의 래스터. 못 구우면 `null`(호출부가 정지 스프라이트로 폴백). */
export function unitAnimFrameRaster(cache: SpriteRasterCache, id: UnitAnimId, index: number): SpriteRaster | null {
  return cache.raster(unitAnimFrameSource(id, index));
}

/**
 * 재생 진행도(0~1) → 프레임 번호. 진행도 1 은 마지막 프레임에 붙는다.
 * 상태를 새로 만들지 않고 쿨다운에서 역산한 값을 그대로 넣는 자리다.
 */
export function unitAnimFrameAt(id: UnitAnimId, progress: number): number {
  const count = unitAnimFrameCount(id);
  if (!Number.isFinite(progress)) return 0;
  return clampFrame(progress * count, count);
}
