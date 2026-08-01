/**
 * 테스트 전용 소프트웨어 캔버스.
 *
 * Node 에는 `OffscreenCanvas` 도 `<canvas>` 도 없다. 그런데 이번 단계의 핵심 질문
 * ("가산 합성으로 그리면 실제 픽셀이 어떻게 되는가") 은 **실제로 그려서 읽어야만** 답이
 * 나온다. 그래서 `RasterContext2D` 가 쓰는 연산만 정확히 구현한 소프트웨어 래스터라이저를
 * 둔다. 합성 공식은 Canvas 2D 명세 그대로다:
 *   source-over : out = src·sa + dst·(1-sa)
 *   lighter     : out = src·sa + dst·da   (채널별 255 포화)
 *
 * 변환은 이 계층이 실제로 쓰는 것(평행이동 + 축 스케일, `scale(-1, 1)` 포함) 만 지원한다.
 * 회전·기울임은 렌더 API 가 쓰지 않으므로 넣지 않는다.
 *
 * ⚠️ 프로덕션 코드가 아니다. 테스트에서만 import 한다.
 */

import { parseHex } from '../../../design/color';
import { BASE_PALETTE } from '../../../design/palette';
import type { DrawableSurface, RasterContext2D, RasterImageData, RasterSurface, SurfaceFactory } from '../surface';

const CHANNELS = 4;
const OPAQUE = 255;

/** 호출 횟수 스파이. "프레임당 `fillRect` 0회" 같은 수용 기준을 세는 데 쓴다. */
export interface SurfaceStats {
  fillRect: number;
  drawImage: number;
}

export interface SoftwareSurface extends RasterSurface {
  readonly data: Uint8ClampedArray;
  readonly stats: SurfaceStats;
}

export function createSurfaceStats(): SurfaceStats {
  return { fillRect: 0, drawImage: 0 };
}

interface DrawState {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  clipX0: number;
  clipY0: number;
  clipX1: number;
  clipY1: number;
  fillStyle: string;
  composite: string;
  smoothing: boolean;
}

interface PendingClip {
  active: boolean;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Backing {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  readonly stats: SurfaceStats;
  readonly stack: DrawState[];
  readonly pendingClip: PendingClip;
  state: DrawState;
}

const colorCache = new Map<string, readonly [number, number, number]>();

/** `#RRGGBB` → 채널 3개. 대형 그리드에서 같은 색을 수천 번 파싱하지 않도록 캐시한다. */
function channelsOf(hex: string): readonly [number, number, number] {
  const hit = colorCache.get(hex);
  if (hit !== undefined) return hit;
  const { r, g, b } = parseHex(hex);
  const parsed: readonly [number, number, number] = [r, g, b];
  colorCache.set(hex, parsed);
  return parsed;
}

function isSoftwareSurface(image: DrawableSurface): image is SoftwareSurface {
  return 'data' in image && 'width' in image && 'height' in image;
}

/** Canvas 2D 합성 공식. `Uint8ClampedArray` 대입이 0-255 포화(명세의 클리핑)를 대신한다. */
function blend(backing: Backing, index: number, r: number, g: number, b: number, alpha: number): void {
  const { data, state } = backing;
  if (alpha === 0) return;
  if (state.composite === 'lighter') {
    data[index] = (data[index] as number) + (r * alpha) / OPAQUE;
    data[index + 1] = (data[index + 1] as number) + (g * alpha) / OPAQUE;
    data[index + 2] = (data[index + 2] as number) + (b * alpha) / OPAQUE;
    data[index + 3] = (data[index + 3] as number) + alpha;
    return;
  }
  const sa = alpha / OPAQUE;
  const inv = 1 - sa;
  data[index] = r * sa + (data[index] as number) * inv;
  data[index + 1] = g * sa + (data[index + 1] as number) * inv;
  data[index + 2] = b * sa + (data[index + 2] as number) * inv;
  data[index + 3] = alpha + (data[index + 3] as number) * inv;
}

/** 로컬 사각형 → 장치 사각형. 반전(음수 스케일) 이면 `x1 < x0` 대신 플래그로 알린다. */
function deviceBounds(backing: Backing, x: number, y: number, w: number, h: number) {
  const { state } = backing;
  const ax = state.offsetX + state.scaleX * x;
  const bx = state.offsetX + state.scaleX * (x + w);
  const ay = state.offsetY + state.scaleY * y;
  const by = state.offsetY + state.scaleY * (y + h);
  return {
    x0: Math.round(Math.min(ax, bx)),
    x1: Math.round(Math.max(ax, bx)),
    y0: Math.round(Math.min(ay, by)),
    y1: Math.round(Math.max(ay, by)),
    flipX: bx < ax,
    flipY: by < ay,
  };
}

function fillRectOn(backing: Backing, x: number, y: number, w: number, h: number): void {
  backing.stats.fillRect += 1;
  const { state } = backing;
  const [r, g, b] = channelsOf(state.fillStyle);
  const box = deviceBounds(backing, x, y, w, h);
  const top = Math.max(box.y0, state.clipY0, 0);
  const bottom = Math.min(box.y1, state.clipY1, backing.height);
  const left = Math.max(box.x0, state.clipX0, 0);
  const right = Math.min(box.x1, state.clipX1, backing.width);
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      blend(backing, (py * backing.width + px) * CHANNELS, r, g, b, OPAQUE);
    }
  }
}

/** 최근접 샘플링 blit. `imageSmoothingEnabled` 는 항상 꺼진 것으로 취급한다. */
function blitOn(backing: Backing, image: SoftwareSurface, dx: number, dy: number, dw: number, dh: number): void {
  const { state } = backing;
  const box = deviceBounds(backing, dx, dy, dw, dh);
  const spanX = box.x1 - box.x0;
  const spanY = box.y1 - box.y0;
  if (spanX <= 0 || spanY <= 0) return;

  const top = Math.max(box.y0, state.clipY0, 0);
  const bottom = Math.min(box.y1, state.clipY1, backing.height);
  const left = Math.max(box.x0, state.clipX0, 0);
  const right = Math.min(box.x1, state.clipX1, backing.width);

  for (let py = top; py < bottom; py += 1) {
    const v = box.flipY ? box.y1 - 1 - py : py - box.y0;
    const sy = Math.floor((v * image.height) / spanY);
    for (let px = left; px < right; px += 1) {
      const u = box.flipX ? box.x1 - 1 - px : px - box.x0;
      const sx = Math.floor((u * image.width) / spanX);
      const from = (sy * image.width + sx) * CHANNELS;
      const alpha = image.data[from + 3] as number;
      blend(
        backing,
        (py * backing.width + px) * CHANNELS,
        image.data[from] as number,
        image.data[from + 1] as number,
        image.data[from + 2] as number,
        alpha,
      );
    }
  }
}

function readPixels(backing: Backing, x: number, y: number, w: number, h: number): RasterImageData {
  const out = new Uint8ClampedArray(w * h * CHANNELS);
  for (let row = 0; row < h; row += 1) {
    const sy = y + row;
    if (sy < 0 || sy >= backing.height) continue;
    for (let column = 0; column < w; column += 1) {
      const sx = x + column;
      if (sx < 0 || sx >= backing.width) continue;
      const from = (sy * backing.width + sx) * CHANNELS;
      const to = (row * w + column) * CHANNELS;
      for (let channel = 0; channel < CHANNELS; channel += 1) {
        out[to + channel] = backing.data[from + channel] as number;
      }
    }
  }
  return { width: w, height: h, data: out };
}

function makeContext(backing: Backing): RasterContext2D {
  const clip = backing.pendingClip;
  return {
    get fillStyle() {
      return backing.state.fillStyle;
    },
    set fillStyle(value: string) {
      backing.state.fillStyle = value;
    },
    get globalCompositeOperation() {
      return backing.state.composite;
    },
    set globalCompositeOperation(value: string) {
      backing.state.composite = value;
    },
    get imageSmoothingEnabled() {
      return backing.state.smoothing;
    },
    set imageSmoothingEnabled(value: boolean) {
      backing.state.smoothing = value;
    },
    save: () => {
      backing.stack.push({ ...backing.state });
    },
    restore: () => {
      const previous = backing.stack.pop();
      if (previous !== undefined) backing.state = previous;
    },
    translate: (x, y) => {
      backing.state.offsetX += backing.state.scaleX * x;
      backing.state.offsetY += backing.state.scaleY * y;
    },
    scale: (x, y) => {
      backing.state.scaleX *= x;
      backing.state.scaleY *= y;
    },
    beginPath: () => {
      clip.active = false;
    },
    rect: (x, y, w, h) => {
      const box = deviceBounds(backing, x, y, w, h);
      clip.x0 = box.x0;
      clip.x1 = box.x1;
      clip.y0 = box.y0;
      clip.y1 = box.y1;
      clip.active = true;
    },
    clip: () => {
      if (!clip.active) return;
      const { state } = backing;
      state.clipX0 = Math.max(state.clipX0, clip.x0);
      state.clipY0 = Math.max(state.clipY0, clip.y0);
      state.clipX1 = Math.min(state.clipX1, clip.x1);
      state.clipY1 = Math.min(state.clipY1, clip.y1);
    },
    fillRect: (x, y, w, h) => fillRectOn(backing, x, y, w, h),
    drawImage: (image, dx, dy, dw, dh) => {
      backing.stats.drawImage += 1;
      if (!isSoftwareSurface(image)) throw new TypeError('SoftwareSurface 만 그릴 수 있습니다.');
      blitOn(backing, image, dx, dy, dw, dh);
    },
    getImageData: (x, y, w, h) => readPixels(backing, x, y, w, h),
  };
}

export function createSoftwareSurface(width: number, height: number, stats = createSurfaceStats()): SoftwareSurface {
  const backing: Backing = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * CHANNELS),
    stats,
    stack: [],
    pendingClip: { active: false, x0: 0, y0: 0, x1: 0, y1: 0 },
    state: {
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
      clipX0: 0,
      clipY0: 0,
      clipX1: width,
      clipY1: height,
      fillStyle: BASE_PALETTE.LINE,
      composite: 'source-over',
      smoothing: true,
    },
  };
  const ctx = makeContext(backing);
  return { width, height, data: backing.data, stats, getContext: () => ctx };
}

/** `createSpriteRasterCache({ createSurface })` 에 꽂을 팩토리. */
export function createSoftwareSurfaceFactory(stats = createSurfaceStats()): SurfaceFactory {
  return (width, height) => createSoftwareSurface(width, height, stats);
}

/** 캔버스를 아예 못 만드는 환경(캔버스 미지원) 재현용. */
export const unsupportedSurfaceFactory: SurfaceFactory = () => null;

/** 캔버스는 있는데 2D 컨텍스트를 못 주는 환경 재현용. */
export const contextlessSurfaceFactory: SurfaceFactory = (width, height) => ({
  width,
  height,
  getContext: () => null,
});

/** 캔버스 생성 자체가 던지는 환경(일부 jsdom) 재현용. */
export const throwingSurfaceFactory: SurfaceFactory = (width, height) => ({
  width,
  height,
  getContext: () => {
    throw new Error('2d context unavailable');
  },
});

/** 화면 픽셀 하나를 읽는다. 반환은 `[r, g, b, a]`. */
export function pixelAt(surface: SoftwareSurface, x: number, y: number): readonly [number, number, number, number] {
  const index = (y * surface.width + x) * CHANNELS;
  return [
    surface.data[index] as number,
    surface.data[index + 1] as number,
    surface.data[index + 2] as number,
    surface.data[index + 3] as number,
  ];
}

/** 두 픽셀의 채널별 최대 차이. "눈에 띄는가" 판정의 척도(ΔRGB). */
export function channelDelta(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}
