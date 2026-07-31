import { describe, expect, test } from 'vitest';

/**
 * 타이틀/시작 게이트의 **카피와 마크업 계약**을 검증한다.
 *
 * jsdom이 없으므로 마크업 생성은 순수 문자열 함수로 두고 여기서 검증한다.
 * (DOM 배선은 stage.ts, 정지 상태 보장은 frame-loop.test.ts가 담당)
 */
import {
  GAME_TITLE,
  GATE_FLOW_STEPS,
  GATE_GOAL,
  GATE_START_ACTION,
  START_BUTTON_LABEL,
  buildStartGateMarkup,
} from './start-gate';

describe('한 문장 목표 (GATE_GOAL)', () => {
  test('한 문장이다', () => {
    expect(GATE_GOAL.split('.').filter((part) => part.trim() !== '')).toHaveLength(1);
  });

  test('차트 → 자금 → 방어의 인과가 이 순서로 들어 있다', () => {
    const chart = GATE_GOAL.indexOf('차트');
    const money = GATE_GOAL.indexOf('자금');
    const defend = GATE_GOAL.indexOf('막아');

    expect(chart).toBeGreaterThanOrEqual(0);
    expect(money).toBeGreaterThan(chart);
    expect(defend).toBeGreaterThan(money);
  });

  test('처음 보는 사람이 한 호흡에 읽을 길이다', () => {
    expect(GATE_GOAL.length).toBeLessThanOrEqual(60);
  });
});

describe('buildStartGateMarkup', () => {
  const markup = buildStartGateMarkup();

  test('게임 이름을 노출한다', () => {
    expect(markup).toContain(GAME_TITLE);
  });

  test('한 문장 목표를 노출한다', () => {
    expect(markup).toContain(GATE_GOAL);
  });

  test('시작 버튼을 노출한다', () => {
    expect(markup).toContain(`data-action="${GATE_START_ACTION}"`);
    expect(markup).toContain(START_BUTTON_LABEL);
  });

  test('인과 3단계를 문서 순서대로 렌더한다', () => {
    const positions = GATE_FLOW_STEPS.map((step) => markup.indexOf(step));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test('오버레이가 다이얼로그로 읽힌다 (스크린리더)', () => {
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
  });

  test('생짜 색을 쓰지 않는다 (팔레트 토큰만)', () => {
    expect(markup).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });
});
