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

  /**
   * ── 시간대·하늘 18키 — 전부 `alpha` 다. 이름이 아니라 **그리드를 세어서** 정했다:
   *
   *  1. 18키 모두 `.` 투명이 실제로 있다(3.9%~9.9%). 위치도 전부 같다 — 하늘 아래끝과
   *     지면 밴드 사이, 즉 **실루엣 건물 사이의 틈**이다. `opaque`("사각형을 꽉 채우는
   *     패널") 로 표시하면 거짓말이 된다. 뒤가 비쳐야 하는 구멍이 진짜로 있다.
   *  2. `additive` 는 배제된다. 이 분류는 `inkFloor`(24) 밑을 굽는 시점에 지우는데,
   *     `tf-sky-night`·`tf-r{1,2,3}-night` 는 잉크의 33~38% 가 그 밑이다(최대 채널 16).
   *     가산으로 그리면 밤하늘이 통째로 사라진다. 게다가 시트가 가산을 지정한 것은
   *     날씨/FX/발사체뿐이고, 이 18키는 발광체가 아니라 배경이다.
   *  3. `alpha` 와 `opaque` 는 스펙이 같으므로(`source-over` + `inkFloor: null`) 픽셀은
   *     어느 쪽이든 동일하다. 그래서 **의도를 정확히 적는 쪽**을 골랐다.
   *
   * ★ `tf-sky-scrim` 은 이름과 달리 반투명 덮개가 **아니다.** 원본 `scrimCompare()` 는
   *   왼쪽 60×40 에 원본 씬, 오른쪽 60×40 에 `darken(…, 0.5)` 결과를 나란히 놓고 가운데
   *   2열(밝은 선 + 어두운 선)로 가른 **before/after 비교 시트**다. 알파 채널이 있는
   *   오버레이가 아니라 이미 어둡게 구워진 불투명 픽셀이므로 덮어 그리는 용도로 쓰면 안 된다.
   *   실제 스크림이 필요하면 `darkenGrid(grid, 0.5)` 로 그리드를 변환해라.
   * ★ `tf-sky-wide` 는 유닛·보스까지 박힌 1장짜리 구도 시트다. 배경으로 타일링하지 마라.
   */
  'tf-sky-dawn': 'alpha',
  'tf-sky-noon': 'alpha',
  'tf-sky-dusk': 'alpha',
  'tf-sky-night': 'alpha',
  'tf-sky-rain': 'alpha',
  'tf-sky-snow': 'alpha',
  'tf-sky-dust': 'alpha',
  'tf-sky-scrim': 'alpha',
  'tf-sky-wide': 'alpha',
  'tf-r1-noon': 'alpha',
  'tf-r1-dusk': 'alpha',
  'tf-r1-night': 'alpha',
  'tf-r2-noon': 'alpha',
  'tf-r2-dusk': 'alpha',
  'tf-r2-night': 'alpha',
  'tf-r3-noon': 'alpha',
  'tf-r3-dusk': 'alpha',
  'tf-r3-dust': 'alpha',

  /**
   * ── 공격 모션 · 스킬 시퀀스 11키 — 이름이 아니라 **그리드를 실제로 세어서** 정했다.
   *   (수치는 `docs/design-reference/grids.json` 실측. "잉크" = 투명이 아닌 셀,
   *    "어두운 잉크" = 최대 채널이 `ADDITIVE_INK_FLOOR`(24) 미만인 셀.)
   *
   *  1. 유닛 모션 7키(`tf-melee-*` · `tf-throw-loop` · `tf-shield-*` · `tf-can-*`):
   *     투명 43.8~65.6%, 어두운 잉크 19.1~25.9%. 기준점인 `tf-ally-01`(투명 46.8% /
   *     어두운 잉크 20.4%)·`tf-ally-03`(31.7% / 19.1%) 과 **같은 분포**다 — 실루엣 주위가
   *     진짜로 비어 있는 유닛 그림이므로 `alpha`.
   *     `additive` 는 배제된다: 굽는 시점에 24 미만을 지우므로 외곽선(`'0'`, 최대 채널 12)이
   *     통째로 날아가 유닛 테두리가 사라진다.
   *  2. `tf-fx-seq-01~03`: 프레임이 `rect(0, 0, 44, 40, '1')` 로 꽉 차 있어 투명은 스트립
   *     여백 14.1%(= 10248 − 5×1760)뿐이고, 어두운 잉크가 90.2 / 94.0 / 91.3% 다. 이 어두움이
   *     바로 **버려야 할 검정 배경**이다 — `tf-fx-01~03`(투명 0% / 어두운 잉크 84.8 · 91.7 ·
   *     96.1%) 과 같은 성질이고 시트도 FX 를 가산으로 지정했으므로 `additive`.
   *  3. `tf-fx-screen`: 투명 0%, 어두운 잉크 36.6% — `tf-ui-btn`(0% / 36.5%) 과 판박이다.
   *     발광체가 아니라 **불투명 패널 3장**이라 `opaque`.
   *
   * ★★ `tf-fx-screen` 은 `tf-sky-scrim` 과 같은 부류의 **비교 시트**다 — 직접 blit 금지 ★★
   *   28px 패널 3개(기본 / 금색 틴트 + 방사선 / 스캔라인)를 나란히 놓고 여백으로 가른
   *   견본이다. 전장에 통째로 그리면 화면에 작은 차트 패널 세 개가 떠 있는 그림이 된다.
   *   화면 연출이 필요하면 이 시트를 **참고해** 효과를 따로 구현해라(`fx-seq.ts` 머리말).
   */
  'tf-melee-loop': 'alpha',
  'tf-melee-hold': 'alpha',
  'tf-can-idle': 'alpha',
  'tf-can-spin': 'alpha',
  'tf-throw-loop': 'alpha',
  'tf-shield-idle': 'alpha',
  'tf-shield-loop': 'alpha',
  'tf-fx-seq-01': 'additive',
  'tf-fx-seq-02': 'additive',
  'tf-fx-seq-03': 'additive',
  'tf-fx-screen': 'opaque',

  /**
   * ── 적공격·이동·구조물·화면 22키 — 이름이 아니라 **그리드를 실제로 세어서** 정했다.
   *   (수치는 `docs/design-reference/grids.json` 실측. "투명" = `.` 셀 비율,
   *    "잉크 중 어두움" = 투명이 아닌 셀 중 최대 채널이 `ADDITIVE_INK_FLOOR`(24) 미만인 비율.
   *    측정·기준점은 `composite-evidence.test.ts` 가 다시 계산해 고정한다.)
   *
   *  1. 적 공격 5키 `tf-eatk-01~05`: 투명 54.8 / 57.1 / 60.6 / 65.4 / 73.1%,
   *     잉크 중 어두움 21.3~38.7%. 기준점 `tf-enemy-01`(37.0% / 22.4%)·
   *     `tf-enemy-air-01`(58.5% / 28.0%) 과 같은 분포 — 실루엣 주위가 진짜로 비어 있다 → `alpha`.
   *  2. 걷기 3키 `tf-walk-*`: 투명 48.5~60.6% / 어두움 18.7~23.5%. 원본 유닛을 그대로 옮긴
   *     그림이므로 당연히 유닛과 같은 분포다 → `alpha`.
   *  3. 사망 2키 `tf-death-*`: 투명 73.8 / 77.3% — 22키 중 가장 비어 있다(f 3 은 파편 14개뿐).
   *     `opaque` 로 두면 그 빈 자리가 전부 검은 사각형이 된다 → `alpha`.
   *  4. 타워 발사 3키 `tf-tfire-*` · 티어2 3키 `tf-t2-*`: 투명 60.8~73.3% / 어두움 18.1~23.9%.
   *     기준점 `tf-tower-01`(47.4% / 21.4%)·`tf-tower-02`(37.7% / 24.5%) 와 같은 분포 → `alpha`.
   *  5. 보스 2키 `tf-boss-p*`: 투명 48.4 / 50.4% / 어두움 18.6~19.9%.
   *     기준점 `tf-boss`(26.8% / 15.6%) 와 같은 계열(무기가 뻗어 캔버스가 넓어 투명이 더 많다) → `alpha`.
   *  6. 기지 피격 2키 `tf-basedmg-*`: 투명 41.6 / 48.8% / 어두움 19.5 / 26.4%.
   *     기준점 `tf-base-ally`(46.9% / 14.6%)·`tf-base-enemy`(28.9% / 14.8%) 와 같은 계열 → `alpha`.
   *  7. `tf-title`: 투명 5.9% / 어두움 7.1%, 셀의 94.1% 가 생 색(`darken` + `stamp` 로 구워졌다).
   *     기준점 `tf-sky-wide`(9.9% / 2.0%)·`tf-sky-dusk`(6.3% / 0.0%) 와 판박이다 — 씬 그리드라
   *     실루엣 사이에 진짜 구멍이 있다(투명 행은 y 51~67, 스카이라인 아래 · 지면 밴드 위) → `alpha`.
   *  8. `tf-reveal`: 투명 0% / 어두움 77.8%, 전부 팔레트 문자.
   *     기준점 `tf-ui-reveal`(0% / 87.2%)·`tf-ui-icons`(0% / 83.4%) 와 같은 **불투명 UI 판**이다.
   *     `additive` 는 배제된다 — 굽는 시점에 24 미만을 지우면 화면의 77.8% 가 사라진다 → `opaque`.
   *
   * ★★ `tf-title` · `tf-reveal` 은 **전장에 blit 금지** ★★
   *   다만 `tf-fx-screen`·`tf-sky-scrim` 같은 "패널 여러 개 + 구분선" 비교 시트는 **아니다.**
   *   실측 근거: `tf-fx-screen` 은 위아래로 균일한 열이 9개(x = 0,1,30,31,32,64,65,94,95),
   *   `tf-sky-scrim` 은 2개(x = 60,61)로 패널을 가르는데, `tf-title`·`tf-reveal` 은 **0개**다.
   *   같은 렌더를 두 번 이상 반복하는 구조도 없다. 즉 둘은 168×76 짜리 **화면 목업 1장**이며
   *   (`tf-sky-wide` 와 같은 부류), 전장 좌표에 얹으면 화면 안에 화면이 생긴다.
   *   타이틀/공개 화면이 생기면 그때 화면 단위로 쓰면 된다(`sprites/screens.ts` 머리말).
   */
  'tf-eatk-01': 'alpha',
  'tf-eatk-02': 'alpha',
  'tf-eatk-03': 'alpha',
  'tf-eatk-04': 'alpha',
  'tf-eatk-05': 'alpha',
  'tf-walk-ally': 'alpha',
  'tf-walk-tank': 'alpha',
  'tf-walk-enemy': 'alpha',
  'tf-death-ally': 'alpha',
  'tf-death-enemy': 'alpha',
  'tf-tfire-01': 'alpha',
  'tf-tfire-02': 'alpha',
  'tf-tfire-03': 'alpha',
  'tf-t2-01': 'alpha',
  'tf-t2-02': 'alpha',
  'tf-t2-03': 'alpha',
  'tf-boss-p1': 'alpha',
  'tf-boss-p2': 'alpha',
  'tf-basedmg-ally': 'alpha',
  'tf-basedmg-enemy': 'alpha',
  'tf-title': 'alpha',
  'tf-reveal': 'opaque',
} as const satisfies Record<RenderableSpriteKey, CompositeClass>;

/**
 * 전장(`src/battle/**`)에 통째로 그리면 안 되는 시트.
 *
 * 렌더는 가능하다(화면 단위로는 정상적인 그림이다) — 금지되는 것은 **전장 좌표에 얹는 것**이다.
 * 타입으로는 못 막으므로(`RenderableSpriteKey` 에서 빼면 굽지도 못한다) 목록으로 두고
 * `composite-evidence.test.ts` 가 `src/battle/**` 안에서의 참조를 막는다.
 */
export const SCREEN_ONLY_SPRITE_KEYS = ['tf-sky-wide', 'tf-sky-scrim', 'tf-fx-screen', 'tf-title', 'tf-reveal'] as const;

export type ScreenOnlySpriteKey = (typeof SCREEN_ONLY_SPRITE_KEYS)[number];

export const RENDERABLE_SPRITE_KEYS = Object.keys(SPRITE_COMPOSITE) as readonly RenderableSpriteKey[];

/** 파라메트릭 그리드(예: `ground(2, 2)`) 도 같은 분류를 쓸 수 있게 노출한다. */
export function compositeSpec(kind: CompositeClass): CompositeSpec {
  return COMPOSITE_SPECS[kind];
}
