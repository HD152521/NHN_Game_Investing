import { describe, expect, test } from 'vitest';

/**
 * 골드 이동 연출의 **타임라인 계산**을 검증한다.
 *
 * 연출 로직은 DOM과 분리된 순수 함수다 (jsdom 없이 검증 가능해야 한다).
 * DOM 배선은 `gold-flight.ts`가 이 함수들의 결과를 그대로 옮겨 적는다.
 */
import {
  GOLD_FLIGHT_MAX_MS,
  GOLD_FLIGHT_TOTAL_MS,
  clampGoldDisplay,
  countUpTo,
  formatGoldFlightLabel,
  goldFlightToneClass,
  resolveGoldFlightAnnouncement,
  resolveGoldFlightPlan,
  resolveGoldFlightTone,
  sampleGoldFlight,
} from './gold-flight-logic';
import type { FlightPath } from './gold-flight-logic';

/** 차트(상단)에서 골드 HUD(하단 우측)로 날아가는 경로. */
const PATH: FlightPath = { fromX: 200, fromY: 40, toX: 700, toY: 260 };

const MOTION = resolveGoldFlightPlan(false);
const REDUCED = resolveGoldFlightPlan(true);

describe('resolveGoldFlightPlan', () => {
  test('연출 타임라인이 0.8초를 넘지 않는다 (FR-5.10)', () => {
    expect(MOTION.durationMs).toBeLessThanOrEqual(GOLD_FLIGHT_MAX_MS);
    expect(GOLD_FLIGHT_TOTAL_MS).toBeLessThanOrEqual(GOLD_FLIGHT_MAX_MS);
  });

  test('reduced-motion 플랜도 0.8초를 넘지 않는다', () => {
    expect(REDUCED.durationMs).toBeLessThanOrEqual(GOLD_FLIGHT_MAX_MS);
  });

  test('reduced-motion 플랜은 모션을 끈다', () => {
    expect(MOTION.animated).toBe(true);
    expect(REDUCED.animated).toBe(false);
  });

  test('두 플랜 모두 골드 증가를 반드시 알린다', () => {
    expect(MOTION.announces).toBe(true);
    expect(REDUCED.announces).toBe(true);
  });
});

describe('sampleGoldFlight — 모션 플랜', () => {
  test('0ms에는 차트(출발점)에 있다', () => {
    const frame = sampleGoldFlight(MOTION, PATH, 0);
    expect(frame.x).toBeCloseTo(PATH.fromX, 5);
    expect(frame.phase).toBe('launch');
    expect(frame.done).toBe(false);
  });

  test('끝나면 골드 HUD(도착점)에 꽂힌다', () => {
    const frame = sampleGoldFlight(MOTION, PATH, MOTION.durationMs);
    expect(frame.x).toBeCloseTo(PATH.toX, 5);
    expect(frame.y).toBeCloseTo(PATH.toY, 5);
    expect(frame.done).toBe(true);
  });

  test('지속시간을 넘겨 샘플링해도 도착점에서 끝난 상태를 유지한다', () => {
    const frame = sampleGoldFlight(MOTION, PATH, MOTION.durationMs * 3);
    expect(frame.x).toBeCloseTo(PATH.toX, 5);
    expect(frame.done).toBe(true);
    expect(frame.phase).toBe('done');
  });

  test('출발 → 도착 방향으로 단조롭게 이동한다', () => {
    let previous = -Infinity;
    for (let t = 0; t <= MOTION.durationMs; t += 20) {
      const { x } = sampleGoldFlight(MOTION, PATH, t);
      expect(x).toBeGreaterThanOrEqual(previous - 1e-6);
      previous = x;
    }
  });

  test('도착 전에는 골드 숫자가 오르지 않는다', () => {
    expect(sampleGoldFlight(MOTION, PATH, 0).countUpProgress).toBe(0);
    expect(sampleGoldFlight(MOTION, PATH, MOTION.countUpStartMs - 1).countUpProgress).toBe(0);
  });

  test('도착 시점부터 카운트업이 시작돼 끝에서 1이 된다', () => {
    expect(sampleGoldFlight(MOTION, PATH, MOTION.countUpStartMs).countUpProgress).toBe(0);
    const mid = sampleGoldFlight(
      MOTION,
      PATH,
      (MOTION.countUpStartMs + MOTION.durationMs) / 2,
    ).countUpProgress;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(sampleGoldFlight(MOTION, PATH, MOTION.durationMs).countUpProgress).toBe(1);
  });

  test('비행 중에는 화면에 보인다', () => {
    const frame = sampleGoldFlight(MOTION, PATH, MOTION.countUpStartMs / 2);
    expect(frame.opacity).toBeGreaterThan(0);
    expect(frame.phase).toBe('travel');
  });
});

describe('sampleGoldFlight — reduced-motion 플랜', () => {
  test('reduced-motion에서도 골드 증가가 전달된다 (0ms에 이미 카운트업 완료)', () => {
    const frame = sampleGoldFlight(REDUCED, PATH, 0);
    expect(frame.countUpProgress).toBe(1);
    expect(frame.opacity).toBeGreaterThan(0);
  });

  test('위치가 전혀 움직이지 않는다', () => {
    const start = sampleGoldFlight(REDUCED, PATH, 0);
    const mid = sampleGoldFlight(REDUCED, PATH, REDUCED.durationMs / 2);
    expect(mid.x).toBe(start.x);
    expect(mid.y).toBe(start.y);
    expect(mid.scale).toBe(start.scale);
  });

  test('도착점(골드 HUD 옆)에 정지 표시된다', () => {
    const frame = sampleGoldFlight(REDUCED, PATH, 0);
    expect(frame.x).toBe(PATH.toX);
    expect(frame.y).toBe(PATH.toY);
  });

  test('지속시간이 지나면 정리된다', () => {
    expect(sampleGoldFlight(REDUCED, PATH, REDUCED.durationMs).done).toBe(true);
  });
});

describe('countUpTo', () => {
  test('진행도 0에서는 기존 값 그대로다', () => {
    expect(countUpTo(200, 130, 0)).toBe(200);
  });

  test('진행도 1에서는 정확히 목표값이다 (반올림 오차 금지)', () => {
    expect(countUpTo(200, 130, 1)).toBe(330);
  });

  test('중간 진행도는 정수로 올라간다', () => {
    const value = countUpTo(200, 130, 0.5);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThan(200);
    expect(value).toBeLessThan(330);
  });

  test('진행도가 범위를 벗어나도 목표를 넘지 않는다', () => {
    expect(countUpTo(200, 130, 2)).toBe(330);
    expect(countUpTo(200, 130, -1)).toBe(200);
  });
});

describe('resolveGoldFlightTone', () => {
  test('이익 청산은 profit', () => {
    expect(resolveGoldFlightTone('manual', 120)).toBe('profit');
  });

  test('손실 청산은 loss', () => {
    expect(resolveGoldFlightTone('manual', -40)).toBe('loss');
  });

  test('강제 청산은 손익과 무관하게 liquidated', () => {
    expect(resolveGoldFlightTone('liquidated', -400)).toBe('liquidated');
    expect(resolveGoldFlightTone('liquidated', 0)).toBe('liquidated');
  });

  test('스테이지 종료 정리도 손익으로 구분한다', () => {
    expect(resolveGoldFlightTone('stage_end', 10)).toBe('profit');
    expect(resolveGoldFlightTone('stage_end', -10)).toBe('loss');
  });
});

describe('goldFlightToneClass', () => {
  test('톤마다 서로 다른 클래스를 준다', () => {
    const classes = new Set([
      goldFlightToneClass('profit'),
      goldFlightToneClass('loss'),
      goldFlightToneClass('liquidated'),
    ]);
    expect(classes.size).toBe(3);
  });
});

describe('formatGoldFlightLabel', () => {
  test('획득 골드를 +부호와 함께 보여준다', () => {
    expect(formatGoldFlightLabel('profit', 1300)).toBe('+1,300 G');
  });

  test('강제 청산은 별도 문구를 앞에 붙인다 (FR-5.10)', () => {
    expect(formatGoldFlightLabel('liquidated', 0)).toContain('강제 청산');
  });
});

/**
 * CLICK-PATH LOW-3 회귀 방어선.
 * 불변식: **표시 골드는 실제 골드를 넘지 않는다.**
 */
describe('clampGoldDisplay', () => {
  test('실제 골드를 모르면(null) 카운트업 값을 그대로 쓴다', () => {
    expect(clampGoldDisplay(340, null)).toBe(340);
  });

  test('카운트업이 실제 골드보다 낮으면 그대로 둔다 — 연출 중간값은 정상이다', () => {
    expect(clampGoldDisplay(250, 400)).toBe(250);
  });

  test('★ 연출 중 타워를 사면 표시가 실제 골드로 눌린다 (과대 표시 차단)', () => {
    // 200 G에서 +200 청산 연출이 도는 중(목표 400) 120 G 포탑을 샀다 → 실제 280.
    expect(clampGoldDisplay(400, 280)).toBe(280);
  });

  test('실제 골드가 출발값보다 낮아져도 넘겨 표시하지 않는다 — 이동 구간까지 덮는다', () => {
    // 카운트업 시작 전이라 표시 후보는 출발값(200)인데, 이미 160만 남았다.
    expect(clampGoldDisplay(200, 160)).toBe(160);
  });

  test('실제 골드가 0이면 0을 표시한다', () => {
    expect(clampGoldDisplay(400, 0)).toBe(0);
  });
});

describe('resolveGoldFlightAnnouncement', () => {
  test('획득 골드와 최종 보유 골드를 모두 말한다', () => {
    const text = resolveGoldFlightAnnouncement('profit', 130, 330);
    expect(text).toContain('130');
    expect(text).toContain('330');
  });

  test('강제 청산 사실을 말한다', () => {
    expect(resolveGoldFlightAnnouncement('liquidated', 0, 200)).toContain('강제 청산');
  });
});
