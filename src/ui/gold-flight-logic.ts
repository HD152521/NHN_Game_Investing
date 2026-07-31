/**
 * 골드 이동 연출 타임라인 — **이 게임에서 가장 중요한 3초**의 계산부.
 *
 * 코어 루프는 "차트를 읽어 전쟁 자금을 만든다"인데, 청산 골드가 HUD 숫자로 조용히
 * 바뀌기만 하면 차트(상단)와 전장(하단) 사이에 아무 연결도 보이지 않는다. 그래서
 * 획득 골드를 **차트에서 출발시켜 골드 HUD에 꽂아** 인과를 눈으로 잇는다.
 *
 * 이 파일은 순수 함수만 둔다 (jsdom 없이 검증 가능해야 한다). DOM 배선은
 * `gold-flight.ts`가 여기 결과를 그대로 옮겨 적는다.
 */

import { clamp01, easeInOutSine, easeOutCubic } from '../anim/easing';
import { formatAmount } from './trade-panel-logic';

/** FR-5.10 — 연출은 0.8초 이내. 이 상한을 넘는 플랜은 존재해선 안 된다. */
export const GOLD_FLIGHT_MAX_MS = 800;

/** 차트에서 수치가 솟아오르는 구간. */
export const GOLD_FLIGHT_LAUNCH_MS = 90;
/** 전장·HUD로 날아가는 구간. */
export const GOLD_FLIGHT_TRAVEL_MS = 440;
/** 꽂히고 골드 숫자가 카운트업되는 구간. */
export const GOLD_FLIGHT_IMPACT_MS = 220;
export const GOLD_FLIGHT_TOTAL_MS =
  GOLD_FLIGHT_LAUNCH_MS + GOLD_FLIGHT_TRAVEL_MS + GOLD_FLIGHT_IMPACT_MS;

/** reduced-motion: 움직이지 않고 도착점에 잠깐 떠 있기만 한다. */
export const GOLD_FLIGHT_REDUCED_MS = 600;

/** 발사 순간 살짝 떠오르는 높이(px). */
const LAUNCH_RISE_PX = 14;
/** 비행 궤적의 포물선 높이 = 이동 거리 × 이 비율. */
const ARC_LIFT_RATIO = 0.22;
/** 꽂히는 순간의 최대 확대율. */
const IMPACT_SCALE = 1.28;
/** 발사 시작 크기. */
const LAUNCH_SCALE = 0.62;
/** 임팩트 구간에서 이 지점을 지나야 사라지기 시작한다 (숫자를 읽을 시간). */
const IMPACT_FADE_START = 0.6;

export type GoldFlightTone = 'profit' | 'loss' | 'liquidated';
export type GoldFlightPhase = 'launch' | 'travel' | 'impact' | 'done';

/** `src/position`의 청산 사유와 구조적으로 같은 유니온 (모듈 결합을 피해 로컬 정의). */
export type CloseReason = 'manual' | 'liquidated' | 'stage_end';

export interface FlightPath {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
}

export interface GoldFlightPlan {
  /** false면 위치·크기가 고정된다 (prefers-reduced-motion). */
  readonly animated: boolean;
  readonly durationMs: number;
  /** 골드 숫자가 오르기 시작하는 시각. */
  readonly countUpStartMs: number;
  /** 모션을 껐더라도 골드 증가는 반드시 알린다. */
  readonly announces: boolean;
}

export interface FlightFrame {
  readonly phase: GoldFlightPhase;
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  readonly scale: number;
  /** 0 → 1. HUD 골드 숫자를 얼마나 올렸는지. */
  readonly countUpProgress: number;
  readonly done: boolean;
}

export function resolveGoldFlightPlan(prefersReducedMotion: boolean): GoldFlightPlan {
  if (prefersReducedMotion) {
    // 모션은 끄되 골드가 늘었다는 사실은 즉시(0ms) 전달한다.
    return {
      animated: false,
      durationMs: GOLD_FLIGHT_REDUCED_MS,
      countUpStartMs: 0,
      announces: true,
    };
  }

  return {
    animated: true,
    durationMs: GOLD_FLIGHT_TOTAL_MS,
    countUpStartMs: GOLD_FLIGHT_LAUNCH_MS + GOLD_FLIGHT_TRAVEL_MS,
    announces: true,
  };
}

function staticFrame(plan: GoldFlightPlan, path: FlightPath, elapsedMs: number): FlightFrame {
  const done = elapsedMs >= plan.durationMs;
  return {
    phase: done ? 'done' : 'impact',
    x: path.toX,
    y: path.toY,
    opacity: 1,
    scale: 1,
    countUpProgress: 1,
    done,
  };
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** 경과 시각 하나로 연출의 모든 값을 결정한다 (상태 없음 = 테스트 가능). */
export function sampleGoldFlight(
  plan: GoldFlightPlan,
  path: FlightPath,
  elapsedMs: number,
): FlightFrame {
  if (!plan.animated) {
    return staticFrame(plan, path, elapsedMs);
  }

  const time = Math.max(0, elapsedMs);

  if (time < GOLD_FLIGHT_LAUNCH_MS) {
    const t = easeOutCubic(clamp01(time / GOLD_FLIGHT_LAUNCH_MS));
    return {
      phase: 'launch',
      x: path.fromX,
      y: path.fromY - LAUNCH_RISE_PX * t,
      opacity: t,
      scale: lerp(LAUNCH_SCALE, 1, t),
      countUpProgress: 0,
      done: false,
    };
  }

  if (time < plan.countUpStartMs) {
    const t = clamp01((time - GOLD_FLIGHT_LAUNCH_MS) / GOLD_FLIGHT_TRAVEL_MS);
    const eased = easeInOutSine(t);
    const distance = Math.hypot(path.toX - path.fromX, path.toY - path.fromY);
    const lift = ARC_LIFT_RATIO * distance * Math.sin(Math.PI * t);
    return {
      phase: 'travel',
      x: lerp(path.fromX, path.toX, eased),
      y: lerp(path.fromY - LAUNCH_RISE_PX, path.toY, eased) - lift,
      opacity: 1,
      scale: 1,
      countUpProgress: 0,
      done: false,
    };
  }

  const t = clamp01((time - plan.countUpStartMs) / GOLD_FLIGHT_IMPACT_MS);
  const pop = Math.sin(Math.PI * t);
  const fade = t <= IMPACT_FADE_START ? 0 : (t - IMPACT_FADE_START) / (1 - IMPACT_FADE_START);
  return {
    phase: time >= plan.durationMs ? 'done' : 'impact',
    x: path.toX,
    y: path.toY,
    opacity: 1 - fade,
    scale: 1 + (IMPACT_SCALE - 1) * pop,
    countUpProgress: t,
    done: time >= plan.durationMs,
  };
}

/** 카운트업 표시값. 진행도 1에서 반올림 오차 없이 정확히 목표값이 된다. */
export function countUpTo(from: number, gained: number, progress: number): number {
  const t = clamp01(progress);
  if (t >= 1) {
    return from + gained;
  }
  return Math.round(from + gained * t);
}

export function resolveGoldFlightTone(reason: CloseReason, pnl: number): GoldFlightTone {
  if (reason === 'liquidated') {
    return 'liquidated';
  }
  return pnl >= 0 ? 'profit' : 'loss';
}

/**
 * 톤 → 클래스. 실제 색은 CSS에서 팔레트 토큰(`var(--tf-*)`)으로 준다.
 *
 * 매핑 근거: 이 게임의 색 시스템은 상승/아군=빨강, 하락/적군=파랑이다(아트가이드 §1.3).
 * - profit  → 골드(재화가 들어온다는 사실 자체가 메시지)
 * - loss    → 파랑(하락과 같은 토큰이라 차트와 눈이 이어진다)
 * - liquidated → 고채도 적색 + 별도 문구(FR-5.10)
 */
export function goldFlightToneClass(tone: GoldFlightTone): string {
  return `gold-flight--${tone}`;
}

export function formatGoldFlightLabel(tone: GoldFlightTone, goldGained: number): string {
  const amount = `+${formatAmount(goldGained)} G`;
  return tone === 'liquidated' ? `강제 청산 · ${amount}` : amount;
}

export function resolveGoldFlightAnnouncement(
  tone: GoldFlightTone,
  goldGained: number,
  goldAfter: number,
): string {
  const body = `골드 +${formatAmount(goldGained)} 획득, 보유 ${formatAmount(goldAfter)}`;
  return tone === 'liquidated' ? `강제 청산 — ${body}` : body;
}
