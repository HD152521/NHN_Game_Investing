/**
 * HUD 아이콘 6종 — `tf-ui-icons` (54×34) 3×2 시트를 칸으로 잘라 쓴다 (PLAN Step 5).
 *
 * ★ 칸 좌표는 **원본 `uiIcons()` 코드에서 읽은 것**이다 (추측 아님).
 *   원본은 중심 좌표로만 그린다: `cx = [9, 27, 45]`, `cy = [9, 25]`.
 *   즉 폭 54 를 3등분(18), 높이 34 를 2등분(17)한 격자의 정중앙들이다.
 *   그려진 모든 도형이 자기 칸 안에 완전히 들어간다(가장 큰 것이 중심 ±6).
 *
 *   | # | 칸 (x, y, w, h) | 원본 도형 | 색 | 뜻 |
 *   |---|---|---|---|---|
 *   | 0 | (0, 0, 18, 17)  | `disc(9,9,4)` + 받침 `rect(5,11,9,2)` | `g` GOLD | 골드 |
 *   | 1 | (18, 0, 18, 17) | `rect(22,6,11,8)` + 손잡이 + 아래꼭짓점 홈 | `p` AUM | AUM |
 *   | 2 | (36, 0, 18, 17) | 역삼각 `poly[(40,4),(50,4),(45,14)]` + 홈 | `r` UP_ALLY | HP |
 *   | 3 | (0, 17, 18, 17) | 좌향 화살 `poly[(13,21),(5,25),(13,29),(10,25)]` | `b` ENEMY_DOWN | 웨이브 |
 *   | 4 | (18, 17, 18, 17)| 16점 링 + 십자선 | `w` TEXT | 정확도 |
 *   | 5 | (36, 17, 18, 17)| `disc(45,25,4)` + 세로 홈 | `m` MUTED | 유지비 |
 *
 *   순서는 **행 우선(row-major)** 이고 시트 09 의 "골드·AUM·HP·웨이브·정확도·유지비" 와
 *   정확히 일치한다.
 *
 * ★ 시트 09 원칙: 아이콘에는 글자가 없다. 숫자는 전부 DOM 텍스트가 얹는다.
 */

import { uiIcons } from '../sprites';
import type { SpriteGrid } from '../sprites';
import { spriteRasters } from '../sprites/render';
import type { ColorMode } from '../design';
import type { SpriteRaster, SpriteRasterCache, SpriteSource } from '../sprites/render';
import { paintRasterToCanvas, sliceSource } from './sprite-slice';
import type { GridRect } from './sprite-slice';

/** 시트 전체 크기 — 원본 `mk(54, 34)`. */
export const UI_ICON_SHEET_WIDTH = 54;
export const UI_ICON_SHEET_HEIGHT = 34;

export const UI_ICON_COLUMNS = 3;
export const UI_ICON_ROWS = 2;

/** 칸 하나의 크기. 54/3, 34/2 — 원본 중심 좌표 격자와 같은 나눗셈이다. */
export const UI_ICON_WIDTH = UI_ICON_SHEET_WIDTH / UI_ICON_COLUMNS;
export const UI_ICON_HEIGHT = UI_ICON_SHEET_HEIGHT / UI_ICON_ROWS;

/** 행 우선 순서. **원본 코드 순서가 진실이고**, 시트 09 문구와 일치한다. */
export const UI_ICON_NAMES = ['gold', 'aum', 'hp', 'wave', 'accuracy', 'upkeep'] as const;

export type UiIconName = (typeof UI_ICON_NAMES)[number];

/** HUD 에서 기본으로 쓰는 배율. 아이콘 18×17 이 12~14px 글자 옆에 그대로 맞는다. */
export const UI_ICON_SCALE = 1;

/** 시트 그리드는 팔레트와 무관하므로 모듈에서 한 번만 만든다. */
const ICON_SHEET: SpriteGrid = uiIcons();

function rectOf(index: number): GridRect {
  return {
    x: (index % UI_ICON_COLUMNS) * UI_ICON_WIDTH,
    y: Math.floor(index / UI_ICON_COLUMNS) * UI_ICON_HEIGHT,
    w: UI_ICON_WIDTH,
    h: UI_ICON_HEIGHT,
  };
}

const ICON_SOURCES: Readonly<Record<UiIconName, SpriteSource>> = Object.freeze(
  Object.fromEntries(
    UI_ICON_NAMES.map((name, index) => [
      name,
      // UI 프레임은 원래 불투명 패널이다 (PLAN 0.1 C-1 분류표).
      sliceSource(`tf-ui-icons/${name}`, ICON_SHEET, rectOf(index), 'opaque'),
    ]),
  ) as Record<UiIconName, SpriteSource>,
);

/** 아이콘 한 칸의 시트 내 좌표. */
export function uiIconRect(name: UiIconName): GridRect {
  return rectOf(UI_ICON_NAMES.indexOf(name));
}

/** 아이콘 한 칸의 문자 그리드(18×17). */
export function uiIconGrid(name: UiIconName): SpriteGrid {
  return ICON_SOURCES[name].grid;
}

/** 아이콘 한 칸의 래스터. 굽지 못하는 환경이면 `null`. */
export function uiIconRaster(
  name: UiIconName,
  cache: SpriteRasterCache = spriteRasters,
): SpriteRaster | null {
  return cache.raster(ICON_SOURCES[name]);
}

export interface UiIconMountOptions {
  readonly rasters?: SpriteRasterCache;
  readonly scale?: number;
  /** 색약 모드. 넘기면 캐시를 그 모드로 맞춘 뒤 굽는다. */
  readonly mode?: ColorMode;
}

/** 아이콘 하나를 `<canvas>` 에 그린다. 그리지 못하면 `false`. */
export function renderUiIcon(
  canvas: HTMLCanvasElement,
  name: UiIconName,
  options: UiIconMountOptions = {},
): boolean {
  const cache = options.rasters ?? spriteRasters;
  if (options.mode !== undefined) cache.setColorMode(options.mode);

  const raster = uiIconRaster(name, cache);
  if (raster === null) return false;
  return paintRasterToCanvas(canvas, raster, options.scale ?? UI_ICON_SCALE);
}

/** 마크업에서 아이콘 자리를 표시하는 속성. */
export const HUD_ICON_ATTR = 'data-hud-icon';

function isIconName(value: string): value is UiIconName {
  return (UI_ICON_NAMES as readonly string[]).includes(value);
}

/**
 * `[data-hud-icon="gold"]` 같은 자리 표시자를 찾아 아이콘 캔버스를 채워 넣는다.
 *
 * 마운트 시 1회만 호출한다 — HUD 숫자는 매 프레임 바뀌지만 아이콘은 바뀌지 않는다.
 * 굽지 못하는 환경(캔버스 없음)에서는 조용히 넘어가고 자리 표시자는 빈 채로 남는다.
 *
 * @returns 실제로 그린 아이콘 수
 */
export function mountHudIcons(root: ParentNode, options: UiIconMountOptions = {}): number {
  const hosts = Array.from(root.querySelectorAll<HTMLElement>(`[${HUD_ICON_ATTR}]`));
  let painted = 0;

  for (const host of hosts) {
    const name = host.getAttribute(HUD_ICON_ATTR);
    if (name === null || !isIconName(name)) continue;

    const canvas = host.ownerDocument.createElement('canvas');
    canvas.className = 'hud__icon-art';
    if (!renderUiIcon(canvas, name, options)) continue;

    host.replaceChildren(canvas);
    painted += 1;
  }

  return painted;
}
