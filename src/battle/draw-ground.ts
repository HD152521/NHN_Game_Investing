/**
 * 발판 3단계 — 클로드 디자인 스프라이트 `ground(region, state)` 로 그린다 (PLAN Step 4).
 *
 * ★ 판정은 여기 없다. 상태(`intact`/`cracked`/`collapsed`)는 `src/ground`(순수 함수)가
 *   이미 정해서 넘겨준다. 이 파일이 하는 일은 그 상태를 **스프라이트 인자로 옮기는 것**뿐이다.
 *
 * ★ PLAN 0.1 C-2 — 43키로는 못 한다
 *   원본 키에는 R1 의 상태 변형(`tf-gnd-s1~s3`)과 R1~R3 의 정상 발판(`tf-gnd-r1~r3`)밖에
 *   없다. R2·R3 의 균열/함몰 발판 키는 **존재하지 않는다.** 그래서 별칭 키가 아니라
 *   파라메트릭 `ground(region, state)` 를 직접 호출해 9조합을 만든다.
 *
 * ★ PLAN 0.1 C-4 — 타일 이음새
 *   원본 루프 주기(8·34·6·14…)가 폭 104 의 약수가 아니라 단순 반복하면 이음새가 보인다.
 *   `drawSpriteBand` 의 교차 미러링으로 경계 열을 맞춘다. 원본 픽셀은 손대지 않는다.
 *
 * ★ 폴백: 캔버스를 못 만드는 환경에서는 예전의 벡터 균열·잔광을 그대로 그린다.
 *   발판 상태는 장식이 아니라 전황 표시라서, 그림이 통째로 사라지면 안 된다.
 */

import type { Palette } from '../design/index.js';
import type { ColorMode } from '../design/index.js';
import type { GroundState } from '../ground/index.js';
import { ground } from '../sprites/index.js';
import type { GroundState as SpriteGroundState, Region } from '../sprites/index.js';
import { drawSpriteBand, spriteRasters } from '../sprites/render/index.js';
import type { SpriteRaster, SpriteRasterCache } from '../sprites/render/index.js';
import { DEFAULT_REGION, groundSurfaceY, spriteCtxOf, tileBandScale } from './draw-background.js';
import type { BattleLayout } from './layout.js';
import { rgba } from './style.js';
import type { BattleCtx } from './surface.js';

export { groundSurfaceY };

/**
 * ★ 상태 배선 — `src/ground` 의 판정값 → 원본 `ground()` 의 `state` 인자.
 *
 * 원본은 `state >= 2` 에서 균열을, `state >= 3` 에서 함몰(청색 잔광 `b`/`n` 포함)을 덧그린다.
 * 즉 1/2/3 이 그대로 정상/균열/함몰이다. 이 표가 판정과 그림을 잇는 **유일한 지점**이다.
 */
const GROUND_STATE_TO_SPRITE = {
  intact: 1,
  cracked: 2,
  collapsed: 3,
} as const satisfies Record<GroundState, SpriteGroundState>;

/**
 * 지역×상태 9조합의 캐시 id. 매 프레임 템플릿 문자열을 만들지 않으려고 상수로 굳힌다.
 */
const GROUND_RASTER_IDS = {
  1: { 1: 'gnd:1:1', 2: 'gnd:1:2', 3: 'gnd:1:3' },
  2: { 1: 'gnd:2:1', 2: 'gnd:2:2', 3: 'gnd:2:3' },
  3: { 1: 'gnd:3:1', 2: 'gnd:3:2', 3: 'gnd:3:3' },
} as const satisfies Record<Region, Record<SpriteGroundState, string>>;

/**
 * 원본 `ground()` 에서 상단 모서리(`c.rect(0, 4, 104, 1, 'm')`)가 놓인 행.
 * 이 행을 지면선(`groundSurfaceY`)에 맞춰야 유닛의 발과 발판이 어긋나지 않는다.
 */
const GROUND_RIM_ROW = 4;

/**
 * 파라메트릭 그리드용 메모.
 *
 * `SpriteRasterCache.raster()` 는 그리드를 **인자로** 받으므로, 캐시 적중이어도 호출부가
 * `ground(r, s)` 를 매번 만들게 된다(프레임당 104×16 문자 배열 할당). 그래서 캐시 앞에
 * id → 래스터 메모를 한 겹 둔다. 색약 토글로 캐시가 비워지면 `mode` 가 달라지므로 그때
 * 같이 버린다 — 안 그러면 옛 팔레트로 구운 발판이 남는다.
 */
interface RasterMemo {
  mode: ColorMode;
  readonly byId: Map<string, SpriteRaster | null>;
}

const groundMemos = new WeakMap<SpriteRasterCache, RasterMemo>();

function memoOf(cache: SpriteRasterCache): RasterMemo {
  const hit = groundMemos.get(cache);
  if (hit === undefined) {
    const created: RasterMemo = { mode: cache.mode, byId: new Map() };
    groundMemos.set(cache, created);
    return created;
  }
  if (hit.mode !== cache.mode) {
    hit.byId.clear();
    hit.mode = cache.mode;
  }
  return hit;
}

/** 지역×상태 한 조합의 래스터. 굽기는 조합당 1회뿐이다. */
export function groundRaster(
  cache: SpriteRasterCache,
  region: Region,
  state: SpriteGroundState,
): SpriteRaster | null {
  const memo = memoOf(cache);
  const id = GROUND_RASTER_IDS[region][state];
  const hit = memo.byId.get(id);
  if (hit !== undefined) return hit;

  const built = cache.raster({ id, grid: ground(region, state), composite: 'opaque' });
  memo.byId.set(id, built);
  return built;
}

/** `src/ground` 판정값 → 원본 `state` 인자. 배선을 테스트에서도 그대로 확인할 수 있게 노출한다. */
export function spriteGroundState(state: GroundState): SpriteGroundState {
  return GROUND_STATE_TO_SPRITE[state];
}

/**
 * 발판 띠의 y — 스프라이트의 모서리 행(4)이 지면선에 오도록 위로 끌어올린다.
 * 배율은 배경과 공유하는 `tileBandScale` 이다(같은 픽셀 크기여야 원근이 맞는다).
 */
export function groundBandY(layout: BattleLayout): number {
  return Math.round(groundSurfaceY(layout)) - GROUND_RIM_ROW * tileBandScale(layout);
}

/** 발판 띠를 스프라이트로 깐다. 그릴 수 없으면 `false` — 호출부가 폴백으로 넘어간다. */
function drawGroundSprite(
  ctx: BattleCtx,
  layout: BattleLayout,
  state: GroundState,
  options: GroundOptions,
): boolean {
  const spriteCtx = spriteCtxOf(ctx);
  if (spriteCtx === null || layout.width <= 0) return false;

  const cache = options.rasters ?? spriteRasters;
  const region = options.region ?? DEFAULT_REGION;
  const raster = groundRaster(cache, region, GROUND_STATE_TO_SPRITE[state]);
  if (raster === null) return false;

  drawSpriteBand(
    spriteCtx,
    raster,
    0,
    groundBandY(layout),
    layout.width,
    tileBandScale(layout),
    options.scrollX ?? 0,
  );
  return true;
}

// ---------------------------------------------------------------------------
// 폴백 (캔버스 미지원) — 예전 벡터 구현. 스프라이트를 구울 수 있으면 실행되지 않는다.
// ---------------------------------------------------------------------------

/** 지면선(림 라이트) 굵기 — 시트가 못 박은 1px. */
const RIM_LINE_WIDTH = 1;
const RIM_ALPHA = 0.55;

/** 균열 개수. 폭 전체에 고르게 흩어진다. */
const CRACK_COUNT = 9;
/** 균열 한 줄의 꺾임 수 — 각지게 보이려면 곡선이 아니라 짧은 직선 몇 개여야 한다. */
const CRACK_SEGMENTS = 3;
/** 균열이 발판 아래로 얼마나 깊게 내려가는지 — 발판 띠 높이 대비 비율. */
const CRACK_DEPTH_RATIO = 0.72;
/** 균열 가로 흔들림 폭(px). */
const CRACK_SWAY = 7;
const CRACK_CORE_WIDTH = 2;
const CRACK_CORE_ALPHA = 0.85;
const CRACK_EDGE_WIDTH = 1;
const CRACK_EDGE_ALPHA = 0.4;
const CRACK_EDGE_OFFSET = 1.5;

/** 함몰 잔광 굵기 — 균열보다 굵게 번져 "스며든다"로 읽히게 한다. */
const GLOW_LINE_WIDTH = 5;
const GLOW_ALPHA_MIN = 0.18;
const GLOW_ALPHA_SPAN = 0.22;
/** 잔광 맥동 1주기(ms). */
const GLOW_PULSE_PERIOD_MS = 1_800;

/** 인덱스 → 0~1 결정적 해시. 시드 RNG 없이 매 프레임 같은 균열 배치를 재현한다. */
function hash01(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** 균열 한 줄의 시작 x(px). */
function crackStartX(index: number, width: number): number {
  const even = ((index + 0.5) / CRACK_COUNT) * width;
  return even + (hash01(index, 1) - 0.5) * (width / CRACK_COUNT) * 0.8;
}

/** 균열 한 줄을 경로로 깐다(획은 호출자가 긋는다). */
function traceCrack(ctx: BattleCtx, index: number, width: number, top: number, depth: number, offsetX: number): void {
  const startX = crackStartX(index, width);
  ctx.beginPath();
  ctx.moveTo(startX + offsetX, top);

  for (let segment = 1; segment <= CRACK_SEGMENTS; segment += 1) {
    const t = segment / CRACK_SEGMENTS;
    const sway = (hash01(index, segment + 2) - 0.5) * 2 * CRACK_SWAY;
    ctx.lineTo(startX + offsetX + sway, top + depth * t);
  }
}

/** 균열 전체를 한 번 훑는다 — 획 스타일만 바꿔 코어/하이라이트/잔광에 재사용한다. */
function strokeAllCracks(
  ctx: BattleCtx,
  strokeStyle: string,
  lineWidth: number,
  offsetX: number,
  width: number,
  top: number,
  depth: number,
): void {
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  for (let index = 0; index < CRACK_COUNT; index += 1) {
    traceCrack(ctx, index, width, top, depth, offsetX);
    ctx.stroke();
  }
}

/** 함몰 잔광 알파 — reduced-motion이면 맥동 중간값으로 고정한다. */
function glowAlpha(timeMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return GLOW_ALPHA_MIN + GLOW_ALPHA_SPAN / 2;
  const phase = (timeMs % GLOW_PULSE_PERIOD_MS) / GLOW_PULSE_PERIOD_MS;
  return GLOW_ALPHA_MIN + GLOW_ALPHA_SPAN * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
}

/** 발판 상단 모서리 1px 림 라이트 — 스프라이트의 `'m'` 행에 대응한다. */
function drawRimLight(ctx: BattleCtx, palette: Palette, width: number, surfaceY: number): void {
  ctx.save();
  ctx.strokeStyle = rgba(palette.TEXT, RIM_ALPHA);
  ctx.lineWidth = RIM_LINE_WIDTH;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(0, surfaceY);
  ctx.lineTo(width, surfaceY);
  ctx.stroke();
  ctx.restore();
}

function drawGroundFallback(
  ctx: BattleCtx,
  palette: Palette,
  layout: BattleLayout,
  state: GroundState,
  reducedMotion: boolean,
  timeMs: number,
): void {
  const surfaceY = groundSurfaceY(layout);
  const bandHeight = Math.max(0, layout.height - surfaceY);

  if (state !== 'intact' && bandHeight > 0) {
    const depth = bandHeight * CRACK_DEPTH_RATIO;

    ctx.save();
    ctx.setLineDash([]);
    // 함몰 잔광은 균열 **아래**에 깔아, 균열이 잔광에 잠기지 않고 위에 또렷이 남게 한다.
    if (state === 'collapsed') {
      const alpha = glowAlpha(timeMs, reducedMotion);
      strokeAllCracks(ctx, rgba(palette.ENEMY_DOWN, alpha), GLOW_LINE_WIDTH, 0, layout.width, surfaceY, depth);
    }
    strokeAllCracks(
      ctx,
      rgba(palette.MUTED, CRACK_EDGE_ALPHA),
      CRACK_EDGE_WIDTH,
      CRACK_EDGE_OFFSET,
      layout.width,
      surfaceY,
      depth,
    );
    strokeAllCracks(ctx, rgba(palette.LINE, CRACK_CORE_ALPHA), CRACK_CORE_WIDTH, 0, layout.width, surfaceY, depth);
    ctx.restore();
  }

  drawRimLight(ctx, palette, layout.width, surfaceY);
}

export interface GroundOptions {
  /** 지역 1~3. 기본 R1. 게임에 지역이 생기면 여기로 넘어온다. */
  readonly region?: Region;
  /** 카메라 스크롤(px). 배경과 다른 속도로 흘려 원근을 만든다. */
  readonly scrollX?: number;
  /** 래스터 캐시 주입구(테스트용). */
  readonly rasters?: SpriteRasterCache;
}

const NO_OPTIONS: GroundOptions = {};

/**
 * 발판 한 프레임을 그린다. 배경(`drawBackground`)이 지면 바탕을 깐 **직후**에 호출한다 —
 * 유닛·타워보다 먼저 그려야 발이 지면선 위에 서 보인다.
 *
 * @param state         `src/ground`의 `classifyGroundState` 결과. → `ground()` 의 `state` 인자.
 * @param reducedMotion 폴백 경로의 맥동만 멈춘다. 스프라이트 경로는 원래 정지 그림이다.
 * @param timeMs        폴백 잔광 맥동 위상용 시각.
 */
export function drawGroundState(
  ctx: BattleCtx,
  palette: Palette,
  layout: BattleLayout,
  state: GroundState,
  reducedMotion: boolean,
  timeMs: number,
  options: GroundOptions = NO_OPTIONS,
): void {
  if (layout.width <= 0 || layout.height <= 0) return;
  if (drawGroundSprite(ctx, layout, state, options)) return;
  drawGroundFallback(ctx, palette, layout, state, reducedMotion, timeMs);
}
