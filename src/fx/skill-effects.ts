/**
 * 스킬 이펙트 트리거 인터페이스 — **선할당 링 버퍼**.
 *
 * ★ `src/weather/field.ts`의 `WeatherField`와 같은 원칙이다: 앱 수명 동안 버퍼를 한 번만
 *   만들고, 매 프레임 위치·진행도를 `시작 시각 + 현재 시각`으로 **계산**한다. 프레임마다
 *   이펙트 객체를 배열에 push/splice 하면 60 FPS 예산(PRD §11)을 GC가 먹는다.
 *
 * ★ 여기가 유일한 예외적 가변 상태다 — 트리거는 본질적으로 "언제 눌렸는지"를 기록해야
 *   하므로 버퍼 슬롯을 제자리에서 덮어쓴다. 그 대신 **조회는 전부 순수 함수**이고
 *   (같은 field·slot·timeMs면 항상 같은 답), 만료 처리도 시각 비교로만 이뤄져
 *   "해제(release)" 호출이 필요 없다 — 상태 누수가 생길 자리가 없다.
 *
 * ⚠️ 이 모듈은 어떤 ID든 재생할 수 있는 **재생 장치**일 뿐, 스킬의 존재 여부나 효과를
 *    결정하지 않는다. 3종 전부 실제 스킬이 된 지금도 마찬가지다 — 무엇을 언제 재생할지는
 *    시전에 성공한 쪽(`src/app/stage.ts`)이 정한다.
 */

import { SKILL_EFFECT_DURATION_MS, SKILL_FX_SLOT_COUNT } from './constants.js';
import { SKILL_EFFECT_IDS } from './types.js';
import type { SkillEffectId } from './types.js';

/** 빈 슬롯 표식. `Int8Array`의 기본값 0이 유효한 ID 인덱스와 겹치지 않도록 -1을 쓴다. */
const EMPTY_SLOT = -1;

export interface SkillFxField {
  /** 슬롯별 `SKILL_EFFECT_IDS` 인덱스. -1이면 빈 슬롯. */
  readonly id: Int8Array;
  /** 슬롯별 트리거 시각(ms). `Float64Array`라야 `performance.now()` 정밀도를 잃지 않는다. */
  readonly startMs: Float64Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** 다음에 덮어쓸 슬롯(링 커서). 이 필드만 가변이다. */
  cursor: number;
}

/** 버퍼를 한 번 만든다. 앱 수명 동안 한 개만 존재하면 된다. */
export function createSkillFxField(): SkillFxField {
  const id = new Int8Array(SKILL_FX_SLOT_COUNT);
  id.fill(EMPTY_SLOT);
  return {
    id,
    startMs: new Float64Array(SKILL_FX_SLOT_COUNT),
    x: new Float32Array(SKILL_FX_SLOT_COUNT),
    y: new Float32Array(SKILL_FX_SLOT_COUNT),
    cursor: 0,
  };
}

/**
 * 이펙트 하나를 재생 대기시킨다 — 슬롯을 제자리에서 덮어쓰므로 할당이 없다.
 *
 * 슬롯이 전부 차 있으면 링 커서가 가리키는(=가장 오래 전에 쓰인) 슬롯을 덮어쓴다.
 * 이펙트가 잘리는 것이 이펙트 하나 때문에 새 배열을 만드는 것보다 낫다.
 *
 * @param x 화면 픽셀 x — 이펙트 중심.
 * @param y 화면 픽셀 y — 이펙트 중심.
 */
export function triggerSkillEffect(
  field: SkillFxField,
  id: SkillEffectId,
  x: number,
  y: number,
  timeMs: number,
): void {
  const slot = field.cursor % SKILL_FX_SLOT_COUNT;
  field.id[slot] = SKILL_EFFECT_IDS.indexOf(id);
  field.startMs[slot] = timeMs;
  field.x[slot] = x;
  field.y[slot] = y;
  field.cursor = (slot + 1) % SKILL_FX_SLOT_COUNT;
}

/** 슬롯이 지금 재생 중인 이펙트 ID. 비었거나 만료됐으면 `null`. */
export function skillFxIdAt(field: SkillFxField, slot: number, timeMs: number): SkillEffectId | null {
  const index = field.id[slot] ?? EMPTY_SLOT;
  if (index === EMPTY_SLOT) return null;

  const id = SKILL_EFFECT_IDS[index];
  if (id === undefined) return null;

  const elapsed = timeMs - (field.startMs[slot] ?? 0);
  return elapsed <= SKILL_EFFECT_DURATION_MS[id] ? id : null;
}

/**
 * 슬롯의 진행도(0~1). 0 = 피크 임팩트 순간, 1 = 완전 소멸.
 *
 * 비활성 슬롯이나 트리거 이전 시각은 0이다 — 렌더러가 음수 진행도를 방어할 필요가 없다.
 */
export function skillFxProgress(field: SkillFxField, slot: number, timeMs: number): number {
  const id = skillFxIdAt(field, slot, timeMs);
  if (id === null) return 0;

  const duration = SKILL_EFFECT_DURATION_MS[id];
  if (duration <= 0) return 1;

  const elapsed = timeMs - (field.startMs[slot] ?? 0);
  if (elapsed <= 0) return 0;
  return Math.min(1, elapsed / duration);
}

/** 슬롯의 중심 x(px). 범위 밖이면 0. */
export function skillFxX(field: SkillFxField, slot: number): number {
  return field.x[slot] ?? 0;
}

/** 슬롯의 중심 y(px). 범위 밖이면 0. */
export function skillFxY(field: SkillFxField, slot: number): number {
  return field.y[slot] ?? 0;
}
