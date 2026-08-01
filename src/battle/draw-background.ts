/**
 * 배경 레이어 — 클로드 디자인 스프라이트(`tf-bg-r{1,2,3}-{far,mid}`)로 그린다 (PLAN Step 4).
 *
 * 원경(far)·중경(mid) 2레이어를 서로 다른 비율로 흘려 패럴랙스를 만든다. 두 레이어 모두
 * 폭 104 의 타일이라 그대로 이어붙이면 이음새가 보이므로(PLAN 0.1 C-4) `drawSpriteBand`
 * 의 **교차 미러링**으로 깐다 — 원본 픽셀은 건드리지 않는다.
 *
 * ★ 지역(Region)
 *   게임 상태에는 아직 지역 개념이 없다. 그래서 기본값 R1 로 두되 `region` 을 옵션으로
 *   열어둔다 — 지역이 생기면 호출부에서 넘기기만 하면 된다(여기는 안 바뀐다).
 *
 * ★ 폴백이 남아 있는 이유
 *   Step 2 의 수용 기준이 "캔버스 미지원 환경에서 크래시하지 않는다" 이다. `OffscreenCanvas`
 *   도 `<canvas>` 도 없는 환경(Node·구형 브라우저)에서는 래스터가 `null` 이라 스프라이트를
 *   그릴 수 없다. 그때는 예전의 결정적 스카이라인을 그려 화면이 비지 않게 한다.
 */

import type { Palette } from '../design/index.js';
import type { Region } from '../sprites/index.js';
import { drawSpriteBand, snapScale, spriteRasters } from '../sprites/render/index.js';
import type { RasterContext2D, RenderableSpriteKey, SpriteRasterCache } from '../sprites/render/index.js';
import type { BattleLayout } from './layout.js';
import type { BattleCtx } from './surface.js';

/** 중경 스카이라인 건물 개수(스프라이트를 못 쓰는 환경의 폴백 전용). */
const SKYLINE_COUNT = 7;
/** 건물 높이 변화 폭 — 전장 높이 대비 비율. */
const SKYLINE_HEIGHT_RATIO = 0.22;
/** 건물 최소 높이 — 전장 높이 대비 비율(변화 폭과 더해져 실제 높이가 된다). */
const SKYLINE_BASE_RATIO = 0.08;
/**
 * 지면(BG_2) 층이 지상 레인 위로 얼마나 올라오는지(px).
 *
 * ★ 이 값이 곧 **발판 상단 모서리**의 위치다. 발판 상태 렌더러(`draw-ground.ts`)가
 *   림 라이트를 같은 선에 놓아야 하므로 export 한다 — 두 파일이 각자 18을 들고 있으면
 *   한쪽만 바뀌었을 때 지면선과 발판이 어긋난다.
 */
export const GROUND_BAND_RISE = 18;

/** 지역이 정해지지 않았을 때 쓰는 기본 지역. */
export const DEFAULT_REGION: Region = 1;

/**
 * 타일 한 장(원본 폭 104px)을 화면에서 대략 몇 px 로 보이게 할지.
 *
 * 배경·발판·(슬롯을 뺀) 모든 타일 밴드가 **같은 배율**을 써야 픽셀 크기가 어긋나지 않는다.
 * 1024 폭에서 배율 3(타일 312px)이 나온다.
 */
const TILE_TARGET_PX = 320;

/** 원경이 중경보다 얼마나 위로 올라앉는지 — 원경 높이 대비 비율. 겹치는 아래쪽은 중경이 덮는다. */
const FAR_RISE_RATIO = 0.5;

/** 패럴랙스 계수 — 원경이 가장 느리다. 카메라 스크롤이 0 이면 아무 효과도 없다. */
const FAR_PARALLAX = 0.25;
const MID_PARALLAX = 0.55;

const BG_FAR_KEYS = {
  1: 'tf-bg-r1-far',
  2: 'tf-bg-r2-far',
  3: 'tf-bg-r3-far',
} as const satisfies Record<Region, RenderableSpriteKey>;

const BG_MID_KEYS = {
  1: 'tf-bg-r1-mid',
  2: 'tf-bg-r2-mid',
  3: 'tf-bg-r3-mid',
} as const satisfies Record<Region, RenderableSpriteKey>;

/** 스프라이트를 그릴 수 있는 컨텍스트. 실제 `CanvasRenderingContext2D` 는 두 인터페이스를 모두 만족한다. */
export type SpriteBattleCtx = BattleCtx & RasterContext2D;

/**
 * 컨텍스트가 래스터 연산을 지원하는지 확인한다.
 *
 * `BattleCtx` 는 벡터 연산만 선언한 좁은 표면이라 스프라이트를 그리려면 `drawImage`·`clip`
 * 이 실제로 있어야 한다. 시그니처를 바꾸지 않고(호출부 `battle.ts` 를 못 고친다) 능력만
 * 런타임에 확인한다.
 */
export function spriteCtxOf(ctx: BattleCtx): SpriteBattleCtx | null {
  const candidate = ctx as Partial<RasterContext2D>;
  const usable = typeof candidate.drawImage === 'function' && typeof candidate.clip === 'function';
  return usable ? (ctx as SpriteBattleCtx) : null;
}

/** 타일 밴드 공용 배율. 배경과 발판이 같은 픽셀 크기를 갖게 하는 단 하나의 계산이다. */
export function tileBandScale(layout: BattleLayout): number {
  return snapScale(layout.width / TILE_TARGET_PX);
}

/** 발판 상단 모서리의 y(px) — 지면선. 배경·발판·데칼이 모두 이 선을 기준으로 정렬된다. */
export function groundSurfaceY(layout: BattleLayout): number {
  return Math.max(layout.battlefieldTop, layout.groundY - GROUND_BAND_RISE);
}

export interface BackgroundOptions {
  /** 지역 1~3. 기본 R1. */
  readonly region?: Region;
  /** 카메라 스크롤(px). 원경·중경이 서로 다른 비율로 흐른다. */
  readonly scrollX?: number;
  /** 래스터 캐시 주입구(테스트용). 기본은 게임이 공유하는 `spriteRasters`. */
  readonly rasters?: SpriteRasterCache;
}

/** 기본 옵션 상수 — 매 프레임 `{}` 를 새로 만들지 않기 위한 것이다. */
const NO_OPTIONS: BackgroundOptions = {};

/**
 * 중경 밴드의 y — 스프라이트 아래끝이 지면선에 닿는다.
 *
 * 지면선을 정수로 반올림한 뒤에 밴드를 쌓는다. 그래야 밴드의 y 와 배율이 모두 정수가 되어
 * 픽셀 격자가 어긋나지 않는다(원본 `paint()` 도 정수 배율만 쓴다).
 *
 * ★ 객체를 만들지 않는다 — 매 프레임 호출되므로 스칼라 함수 두 개로 나눠 둔다.
 */
export function skyMidY(layout: BattleLayout, spriteHeight: number): number {
  return Math.round(groundSurfaceY(layout)) - spriteHeight * tileBandScale(layout);
}

/** 원경 밴드의 y — 중경보다 위로 올라앉고, 겹치는 아래쪽은 중경이 덮는다. */
export function skyFarY(layout: BattleLayout, spriteHeight: number): number {
  const height = spriteHeight * tileBandScale(layout);
  return skyMidY(layout, spriteHeight) - Math.round(height * FAR_RISE_RATIO);
}

/** 원경·중경을 스프라이트로 깐다. 그릴 수 없으면 `false` — 호출부가 폴백으로 넘어간다. */
function drawSkySprites(ctx: BattleCtx, layout: BattleLayout, options: BackgroundOptions): boolean {
  const spriteCtx = spriteCtxOf(ctx);
  if (spriteCtx === null || layout.width <= 0) return false;
  if (groundSurfaceY(layout) <= layout.battlefieldTop) return false;

  const rasters = options.rasters ?? spriteRasters;
  const region = options.region ?? DEFAULT_REGION;
  const far = rasters.ofKey(BG_FAR_KEYS[region]);
  const mid = rasters.ofKey(BG_MID_KEYS[region]);
  if (far === null || mid === null) return false;

  const scale = tileBandScale(layout);
  const scroll = options.scrollX ?? 0;

  // 원경 먼저 — 중경이 불투명이라 겹치는 아래쪽을 덮는다(그래서 깊이가 생긴다).
  drawSpriteBand(spriteCtx, far, 0, skyFarY(layout, far.height), layout.width, scale, scroll * FAR_PARALLAX);
  drawSpriteBand(spriteCtx, mid, 0, skyMidY(layout, mid.height), layout.width, scale, scroll * MID_PARALLAX);
  return true;
}

/** 건물 인덱스로부터 결정적 높이 비율(0~1)을 뽑아낸다 — 시드 랜덤 대신 사인 곡선. */
function skylineHeightRatio(index: number): number {
  return Math.abs(Math.sin(index * 1.9 + 0.5));
}

/** 스프라이트를 굽지 못하는 환경의 중경 실루엣. 밋밋한 단색 배경만 남는 것을 막는다. */
function drawSkylineFallback(ctx: BattleCtx, palette: Palette, layout: BattleLayout): void {
  const bandTop = layout.battlefieldTop;
  const bandBottom = layout.groundY;
  const bandHeight = Math.max(0, bandBottom - bandTop);
  if (bandHeight <= 0 || layout.width <= 0) return;

  ctx.fillStyle = palette.BG_1;
  const buildingWidth = layout.width / SKYLINE_COUNT;
  for (let i = 0; i < SKYLINE_COUNT; i += 1) {
    const heightRatio = SKYLINE_BASE_RATIO + skylineHeightRatio(i) * SKYLINE_HEIGHT_RATIO;
    const buildingHeight = bandHeight * heightRatio;
    ctx.fillRect(i * buildingWidth, bandBottom - buildingHeight, buildingWidth, buildingHeight);
  }
}

export function drawBackground(
  ctx: BattleCtx,
  palette: Palette,
  layout: BattleLayout,
  options: BackgroundOptions = NO_OPTIONS,
): void {
  // 하늘 바탕 — 캔버스 전체. 스프라이트 밴드가 덮지 못하는 위쪽이 여기로 남는다.
  ctx.fillStyle = palette.BG_0;
  ctx.fillRect(0, 0, layout.width, layout.height);

  if (!drawSkySprites(ctx, layout, options)) drawSkylineFallback(ctx, palette, layout);

  // 지면 바탕 — 발판 스프라이트('3' = BG_2)와 같은 색이라 발판 아래로 이음새 없이 이어진다.
  const groundTop = groundSurfaceY(layout);
  const groundHeight = Math.max(0, layout.height - groundTop);
  if (groundHeight > 0) {
    ctx.fillStyle = palette.BG_2;
    ctx.fillRect(0, groundTop, layout.width, groundHeight);
  }
}
