/**
 * 래스터 계층이 실제로 쓰는 Canvas 2D 의 **최소 표면**만 구조적으로 선언한다.
 *
 * `CanvasRenderingContext2D` 를 직접 import 하지 않는 이유는 `src/render/surface.ts`
 * 와 같다 — 헤드리스(Node) 에서 검증 가능해야 하고, DOM 타입에 묶이면 안 된다.
 * 실제 `CanvasRenderingContext2D` / `OffscreenCanvasRenderingContext2D` 는
 * 이 인터페이스를 그대로 만족한다.
 */

/** `getImageData` 결과. 실제 `ImageData` 가 구조적으로 만족한다. */
export interface RasterImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** `drawImage` 에 넘길 수 있는 것. 런타임 DOM 타입을 끌어오지 않으려고 불투명하게 둔다. */
export type DrawableSurface = object;

/** 래스터·드로잉이 건드리는 컨텍스트 연산 전부. 이 목록 밖은 쓰지 않는다. */
export interface RasterContext2D {
  fillStyle: string;
  globalCompositeOperation: string;
  imageSmoothingEnabled: boolean;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  clip(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  drawImage(image: DrawableSurface, dx: number, dy: number, dw: number, dh: number): void;
  getImageData(x: number, y: number, width: number, height: number): RasterImageData;
}

/** 오프스크린 캔버스 한 장. `OffscreenCanvas` 와 `<canvas>` 둘 다 만족한다. */
export interface RasterSurface {
  readonly width: number;
  readonly height: number;
  getContext(contextId: '2d'): RasterContext2D | null;
}

/** 캔버스 생성기. 만들 수 없는 환경이면 `null` 을 돌려준다(크래시 금지). */
export type SurfaceFactory = (width: number, height: number) => RasterSurface | null;

interface OffscreenScope {
  readonly OffscreenCanvas?: new (width: number, height: number) => RasterSurface;
  readonly document?: { createElement(tag: string): unknown };
}

/** 가변 폭·높이를 가진 `<canvas>` 엘리먼트의 필요한 부분만. */
interface MutableSurface {
  width: number;
  height: number;
  getContext(contextId: '2d'): RasterContext2D | null;
}

/**
 * 기본 캔버스 생성기 — `OffscreenCanvas` 우선, 없으면 `<canvas>`, 둘 다 없으면 `null`.
 *
 * Node(테스트)처럼 어느 쪽도 없는 환경에서 **예외를 던지지 않고** `null` 을 돌려주는 것이
 * 이 함수의 계약이다. 호출부(`cache.ts`)가 그 `null` 을 캐시에 굳혀 매 프레임 재시도를 막는다.
 */
export function createDomSurface(width: number, height: number): RasterSurface | null {
  const scope = globalThis as unknown as OffscreenScope;

  const Offscreen = scope.OffscreenCanvas;
  if (typeof Offscreen === 'function') return new Offscreen(width, height);

  const doc = scope.document;
  if (doc === undefined || typeof doc.createElement !== 'function') return null;

  const element = doc.createElement('canvas') as MutableSurface | null;
  if (element === null || typeof element.getContext !== 'function') return null;
  element.width = width;
  element.height = height;
  return element;
}
