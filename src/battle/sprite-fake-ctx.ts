/**
 * 테스트 전용 — 스프라이트를 **실제로 굽고 그려서 픽셀을 읽을 수 있는** `BattleCtx`.
 *
 * `fake-ctx.ts`(호출 기록 스파이)로는 Step 4 의 수용 기준을 확인할 수 없다. "타일 경계
 * 픽셀이 일치하는가", "9조합이 서로 다른가" 는 **그려진 픽셀을 봐야만** 답이 나온다.
 * 그래서 `src/sprites/render/testing/software-canvas.ts` 의 소프트웨어 래스터라이저를
 * `BattleCtx` 모양으로 감싼다. 벡터 연산(stroke·fillText 등)은 폴백 경로 전용이라
 * 픽셀 검증에 관여하지 않으므로 형태만 만족시키는 no-op 이다.
 *
 * ⚠️ 프로덕션 코드에서는 절대 import 하지 않는다.
 */

import { parseHex } from '../design/index.js';
import type { Palette } from '../design/index.js';
import { SPRITE_PALETTE, TRANSPARENT } from '../sprites/index.js';
import type { SpriteCell } from '../sprites/index.js';
import { createSoftwareSurface, createSoftwareSurfaceFactory } from '../sprites/render/testing/software-canvas.js';
import type { SoftwareSurface } from '../sprites/render/testing/software-canvas.js';
import { createSpriteRasterCache } from '../sprites/render/index.js';
import type { SpriteRasterCache } from '../sprites/render/index.js';
import type { SpriteBattleCtx } from './draw-background.js';

export { pixelAt } from '../sprites/render/testing/software-canvas.js';

export interface SpriteBattleSurface {
  readonly ctx: SpriteBattleCtx;
  readonly surface: SoftwareSurface;
}

/** 소프트웨어 캔버스 한 장과 그것을 그리는 `BattleCtx`. */
export function createSpriteBattleSurface(width: number, height: number): SpriteBattleSurface {
  const surface = createSoftwareSurface(width, height);
  const raster = surface.getContext('2d');
  if (raster === null) throw new Error('소프트웨어 캔버스가 2D 컨텍스트를 주지 못했습니다.');

  const noop = (): void => {};

  const ctx: SpriteBattleCtx = {
    get fillStyle(): string {
      return raster.fillStyle;
    },
    set fillStyle(value: string) {
      raster.fillStyle = value;
    },
    get globalCompositeOperation(): string {
      return raster.globalCompositeOperation;
    },
    set globalCompositeOperation(value: string) {
      raster.globalCompositeOperation = value;
    },
    get imageSmoothingEnabled(): boolean {
      return raster.imageSmoothingEnabled;
    },
    set imageSmoothingEnabled(value: boolean) {
      raster.imageSmoothingEnabled = value;
    },

    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',

    save: () => raster.save(),
    restore: () => raster.restore(),
    translate: (x, y) => raster.translate(x, y),
    scale: (x, y) => raster.scale(x, y),
    beginPath: () => raster.beginPath(),
    rect: (x, y, w, h) => raster.rect(x, y, w, h),
    clip: () => raster.clip(),
    fillRect: (x, y, w, h) => raster.fillRect(x, y, w, h),
    drawImage: (image, dx, dy, dw, dh) => raster.drawImage(image, dx, dy, dw, dh),
    getImageData: (x, y, w, h) => raster.getImageData(x, y, w, h),

    // 폴백(벡터) 전용 표면 — 스프라이트 경로에서는 호출되지 않는다.
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    closePath: noop,
    stroke: noop,
    fill: noop,
    setLineDash: noop,
    strokeRect: noop,
    fillText: noop,
  };

  return { ctx, surface };
}

/** 소프트웨어 캔버스로 굽는 래스터 캐시. 테스트마다 새로 만들어 서로 오염되지 않게 한다. */
export function createSoftwareRasterCache(): SpriteRasterCache {
  return createSpriteRasterCache({ createSurface: createSoftwareSurfaceFactory() });
}

/** 스프라이트 문자 → 실제 그려질 RGB. 투명(`.`)이면 `null`. */
export function cellRgb(palette: Palette, cell: SpriteCell): readonly [number, number, number] | null {
  if (cell === TRANSPARENT) return null;
  const { r, g, b } = parseHex(palette[SPRITE_PALETTE[cell]]);
  return [r, g, b];
}

/** 화면 일부의 내용 해시(FNV-1a). "서로 다른 그림인가"를 값 하나로 비교하기 위한 것이다. */
export function hashRegion(surface: SoftwareSurface, x: number, y: number, w: number, h: number): string {
  let hash = 0x811c9dc5;
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      const index = (py * surface.width + px) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        hash ^= surface.data[index + channel] as number;
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
    }
  }
  return hash.toString(16);
}
