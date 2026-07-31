/**
 * 차트가 실제로 사용하는 Canvas 2D 메서드만 구조적 인터페이스로 좁힌 것.
 *
 * `src/render/surface.ts`(`Draw2D`)와 같은 패턴이다: DOM의 `CanvasRenderingContext2D`를
 * 직접 import하지 않고 구조적으로 선언해두면, 헤드리스 테스트에서 가짜 컨텍스트를
 * 주입해 캔들·거래량·진행바 그리기를 픽셀 없이 검증할 수 있다. 실제
 * `CanvasRenderingContext2D`는 이 인터페이스를 그대로 만족한다.
 *
 * `fillStyle`/`strokeStyle`은 실제 Canvas API 타입(`string | CanvasGradient |
 * CanvasPattern`)과 동일하게 넓혀 두었다 — 우리는 항상 문자열(HEX/rgba)만 대입하지만,
 * 실제 컨텍스트가 이 인터페이스를 만족하려면 프로퍼티 타입이 일치해야 하기 때문이다.
 */
export interface ChartCtx {
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
  fillText(text: string, x: number, y: number): void;
}
