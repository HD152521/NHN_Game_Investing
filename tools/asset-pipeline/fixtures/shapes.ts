import type { Shape, SynthSubject } from './synth.js';
import type { Rgba } from '../types.js';

/**
 * 합성 픽스처용 실루엣 빌더.
 * 실제 에셋을 대신하는 것이 목적이 아니라, 후처리 파이프라인이 다뤄야 할
 * 특성(둥근 경계 · 각진 경계 · 얇은 파츠 · 서로 다른 발밑 높이)을 만들어냅니다.
 */

const rect = (x: number, y: number, width: number, height: number): Shape => ({
  kind: 'rect',
  x,
  y,
  width,
  height,
});

const ellipse = (cx: number, cy: number, rx: number, ry: number): Shape => ({
  kind: 'ellipse',
  cx,
  cy,
  rx,
  ry,
});

export interface FigureOptions {
  readonly centerX: number;
  /** 발밑이 놓일 y좌표. 라인업 안에서 일부러 서로 다르게 줍니다. */
  readonly baselineY: number;
  readonly scale: number;
  readonly body: Rgba;
  readonly accent: Rgba;
}

/** 아군 유닛 — 둥근 실루엣 (아트가이드 §1.3 이중 인코딩). */
export function roundedFigure(options: FigureOptions): SynthSubject[] {
  const { centerX: cx, baselineY, scale: s, body, accent } = options;
  const legHeight = 22 * s;
  const torsoHeight = 26 * s;
  const torsoWidth = 18 * s;
  const headRadius = 10 * s;
  const torsoBottom = baselineY - legHeight;
  const torsoTop = torsoBottom - torsoHeight;

  return [
    {
      color: body,
      shapes: [
        ellipse(cx, torsoTop + torsoHeight / 2, torsoWidth / 2, torsoHeight / 2),
        rect(cx - torsoWidth / 2 + 1, torsoBottom, 6 * s, legHeight),
        rect(cx + torsoWidth / 2 - 6 * s - 1, torsoBottom, 6 * s, legHeight),
        ellipse(cx + torsoWidth / 2 + 3 * s, torsoTop + torsoHeight * 0.45, 4 * s, 9 * s),
      ],
    },
    { color: accent, shapes: [ellipse(cx, torsoTop - headRadius * 0.7, headRadius, headRadius)] },
  ];
}

/** 적군 유닛 — 각진 실루엣. 사선/뾰족한 끝이 프린지 테스트에 유리합니다. */
export function angularFigure(options: FigureOptions): SynthSubject[] {
  const { centerX: cx, baselineY, scale: s, body, accent } = options;
  const legHeight = 20 * s;
  const torsoHeight = 28 * s;
  const torsoWidth = 20 * s;
  const torsoBottom = baselineY - legHeight;
  const torsoTop = torsoBottom - torsoHeight;

  return [
    {
      color: body,
      shapes: [
        rect(cx - torsoWidth / 2, torsoTop, torsoWidth, torsoHeight),
        rect(cx - torsoWidth / 2 + 1, torsoBottom, 7 * s, legHeight),
        rect(cx + torsoWidth / 2 - 7 * s - 1, torsoBottom, 7 * s, legHeight),
        // 어깨 스파이크 — 얇고 뾰족한 파츠
        ellipse(cx - torsoWidth / 2 - 2 * s, torsoTop + 4 * s, 5 * s, 2.5 * s),
        rect(cx + torsoWidth / 2 + 1, torsoTop - 6 * s, 2.5 * s, 34 * s),
      ],
    },
    {
      color: accent,
      shapes: [rect(cx - 7 * s, torsoTop - 13 * s, 14 * s, 13 * s)],
    },
  ];
}

export interface TurretOptions {
  readonly centerX: number;
  readonly baselineY: number;
  readonly scale: number;
  readonly body: Rgba;
  readonly accent: Rgba;
  /** 포신 각도 대신 길이/두께로 3종을 구분합니다. */
  readonly barrelLength: number;
  readonly barrelThickness: number;
}

/** 타워 — 받침대 + 포탑 + 포신. */
export function turret(options: TurretOptions): SynthSubject[] {
  const { centerX: cx, baselineY, scale: s, body, accent } = options;
  const baseHeight = 6 * s;
  const baseWidth = 26 * s;
  const domeRadius = 11 * s;
  const baseTop = baselineY - baseHeight;

  return [
    {
      color: body,
      shapes: [
        rect(cx - baseWidth / 2, baseTop, baseWidth, baseHeight),
        ellipse(cx, baseTop - domeRadius * 0.6, domeRadius, domeRadius),
        rect(
          cx + domeRadius * 0.5,
          baseTop - domeRadius * 0.6 - options.barrelThickness / 2,
          options.barrelLength,
          options.barrelThickness,
        ),
      ],
    },
    {
      color: accent,
      shapes: [rect(cx - baseWidth / 2 + 2 * s, baseTop + 1 * s, baseWidth - 4 * s, 3 * s)],
    },
  ];
}

/** HUD 아이콘 — 둥근 배지 + 안쪽 표식. 발밑 개념이 없습니다. */
export function icon(cx: number, cy: number, radius: number, body: Rgba, accent: Rgba): SynthSubject[] {
  return [
    { color: body, shapes: [ellipse(cx, cy, radius, radius)] },
    {
      color: accent,
      shapes: [rect(cx - radius * 0.35, cy - radius * 0.45, radius * 0.7, radius * 0.9)],
    },
  ];
}
