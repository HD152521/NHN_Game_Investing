/**
 * 합성 분류 — PLAN 0.1 C-1 ("불투명 배경") 의 해답.
 *
 * 43키 중 24개는 `1`(BG_0) 로 캔버스를 꽉 채운 **시트 전시용 스와치**다. 그대로
 * `drawImage` 하면 발사체가 28×14 검은 상자로 날아간다. 시트 03/08 이 이미
 * `screen / additive blend`, "검정 배경 · 가산 합성용 단일 프레임" 을 지정하고 있으므로
 * 분류를 **데이터로** 두고 렌더 API 가 그것을 읽는다 (렌더 코드에 키 분기 금지).
 *
 * ★ 그런데 "가산이면 검정은 기여하지 않는다" 는 **자동으로 참이 아니다.**
 *   `1` = `BG_0` 는 완전 검정이 아니라 (7, 10, 18) 이다. `lighter` 로 그려도 스프라이트
 *   사각 영역 전체가 그만큼 밝아져 **경계선이 보인다** (실측 ΔRGB 18 ≥ 가시 임계 7).
 *   `0` = `LINE` (5, 7, 12) 도 마찬가지다 (실측 Δ12).
 *   실측은 `composite-evidence.test.ts` 에 있다. 그래서 가산 분류는 `lighter` 에 더해
 *   **`inkFloor` 미만의 색을 굽는 단계에서 알파 0 으로 만든다.**
 *   Step 1 의 그리드 데이터는 건드리지 않는다 — 래스터 시점에만 빠진다.
 */

import type { SpriteKey } from '../index';

/** 스프라이트를 화면에 얹는 방식. */
export type CompositeClass = 'additive' | 'opaque' | 'alpha';

/** 캔버스 `globalCompositeOperation` 중 이 계층이 쓰는 두 가지. */
export type CompositeMode = 'source-over' | 'lighter';

/**
 * 가산 합성에서 "빛" 으로 인정하는 최소 채널값(0-255, 최대 채널 기준).
 *
 * 이보다 어두운 색은 화면을 밝히지 못하면서 스프라이트 사각형 자국만 남긴다.
 * 팔레트에서 이 밑에 걸리는 색은 `LINE`(최대 채널 12) 과 `BG_0`(18) 둘뿐이고,
 * 바로 위는 `BG_1`(36) 이다 — 즉 24 는 "검정 계열" 과 "실제로 그려진 색" 사이의
 * 빈 구간 한가운데다. 색약 모드 오버라이드 4색은 전부 이보다 훨씬 밝아 영향이 없다.
 */
export const ADDITIVE_INK_FLOOR = 24;

export interface CompositeSpec {
  readonly mode: CompositeMode;
  /**
   * 최대 채널이 이 값 미만인 색을 알파 0 으로 굽는다. `null` 이면 전부 그린다.
   * 값이 아니라 **임계**로 둔 이유는 색약 모드에서도 같은 규칙이 성립해야 하기 때문이다.
   */
  readonly inkFloor: number | null;
}

export const COMPOSITE_SPECS = {
  /** 날씨 · 스킬FX · 발사체 — 시트가 지정한 가산 합성. 검정 계열은 굽는 시점에 뺀다. */
  additive: { mode: 'lighter', inkFloor: ADDITIVE_INK_FLOOR },
  /** UI 프레임 · 배경 · 발판 — 원래 불투명 패널이다. */
  opaque: { mode: 'source-over', inkFloor: null },
  /** 유닛 · 타워 · 기지 — 그리드에 `.` 투명이 이미 있다. */
  alpha: { mode: 'source-over', inkFloor: null },
} as const satisfies Record<CompositeClass, CompositeSpec>;

/**
 * 렌더 대상이 아닌 키. `tf-ally-parts` 는 부품 참조 시트라서 게임 화면에 그리면 안 된다
 * (PLAN 0.1 C-5). 주석으로는 못 막으므로 **타입에서 뺀다.**
 */
export const NON_RENDERABLE_SPRITE_KEYS = ['tf-ally-parts'] as const;

export type NonRenderableSpriteKey = (typeof NON_RENDERABLE_SPRITE_KEYS)[number];

/** 화면에 그려도 되는 키. Step 3~6 의 배선은 이 타입만 받는다. */
export type RenderableSpriteKey = Exclude<SpriteKey, NonRenderableSpriteKey>;

/**
 * 키 → 합성 분류. **데이터다** — 렌더 코드는 이 표를 읽기만 하고 키로 분기하지 않는다.
 * `satisfies` 가 42키 전수 대응을 컴파일 타임에 강제한다.
 */
export const SPRITE_COMPOSITE = {
  'tf-ally-01': 'alpha',
  'tf-ally-02': 'alpha',
  'tf-ally-03': 'alpha',
  'tf-enemy-01': 'alpha',
  'tf-enemy-02': 'alpha',
  'tf-enemy-03': 'alpha',
  'tf-enemy-air-01': 'alpha',
  'tf-enemy-air-02': 'alpha',
  'tf-tower-01': 'alpha',
  'tf-tower-02': 'alpha',
  'tf-tower-03': 'alpha',
  'tf-base-ally': 'alpha',
  'tf-base-enemy': 'alpha',
  'tf-boss': 'alpha',
  'tf-bg-r1-far': 'opaque',
  'tf-bg-r1-mid': 'opaque',
  'tf-bg-r2-far': 'opaque',
  'tf-bg-r2-mid': 'opaque',
  'tf-bg-r3-far': 'opaque',
  'tf-bg-r3-mid': 'opaque',
  'tf-gnd-r1': 'opaque',
  'tf-gnd-r2': 'opaque',
  'tf-gnd-r3': 'opaque',
  'tf-gnd-s1': 'opaque',
  'tf-gnd-s2': 'opaque',
  'tf-gnd-s3': 'opaque',
  'tf-gnd-slot': 'opaque',
  'tf-wx-01': 'additive',
  'tf-wx-02': 'additive',
  'tf-wx-03': 'additive',
  'tf-wx-04': 'additive',
  'tf-fx-01': 'additive',
  'tf-fx-02': 'additive',
  'tf-fx-03': 'additive',
  'tf-w-01': 'additive',
  'tf-w-02': 'additive',
  'tf-w-03': 'additive',
  'tf-w-04': 'additive',
  'tf-ui-chart': 'opaque',
  'tf-ui-btn': 'opaque',
  'tf-ui-icons': 'opaque',
  'tf-ui-reveal': 'opaque',
} as const satisfies Record<RenderableSpriteKey, CompositeClass>;

export const RENDERABLE_SPRITE_KEYS = Object.keys(SPRITE_COMPOSITE) as readonly RenderableSpriteKey[];

/** 파라메트릭 그리드(예: `ground(2, 2)`) 도 같은 분류를 쓸 수 있게 노출한다. */
export function compositeSpec(kind: CompositeClass): CompositeSpec {
  return COMPOSITE_SPECS[kind];
}
