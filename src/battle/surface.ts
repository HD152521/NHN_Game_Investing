/**
 * 전장이 실제로 쓰는 Canvas 2D 메서드만 구조적 인터페이스로 좁힌 것.
 *
 * `src/chart/surface.ts`(`ChartCtx`)와 같은 패턴이다: 실제 `CanvasRenderingContext2D`를
 * 직접 import하지 않고 구조적으로 선언해두면, 헤드리스 테스트에서 가짜 컨텍스트를
 * 주입해 그리기 호출을 픽셀 없이 검증할 수 있다. 실제 `CanvasRenderingContext2D`는
 * 이 인터페이스를 그대로 만족한다.
 */
export interface BattleCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;

  save(): void;
  restore(): void;

  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  closePath(): void;
  stroke(): void;
  fill(): void;
  setLineDash(segments: number[]): void;

  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}
