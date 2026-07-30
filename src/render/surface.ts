/**
 * The slice of Canvas 2D the skeleton renderer actually uses.
 *
 * Declaring it structurally rather than importing `CanvasRenderingContext2D`
 * keeps the renderer testable in a headless runner and leaves the door open for
 * a different backend later (PRD 11: 게임 로직과 렌더러 완전 분리). A real
 * `CanvasRenderingContext2D` satisfies this interface as-is.
 */
export interface Draw2D {
  globalAlpha: number;
  globalCompositeOperation: string;
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  drawImage(
    image: DrawableImage,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}

/**
 * Anything Canvas 2D can blit. Kept opaque so this module pulls in no DOM
 * types at runtime and stays usable under Node for tests.
 */
export type DrawableImage = object;
