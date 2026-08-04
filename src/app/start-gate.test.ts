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
import { TITLE_BUILD_LABEL, TITLE_HEAD, TITLE_SUBTITLE, TITLE_TAIL } from './title-art';

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

  /**
   * 타이틀은 **두 조각으로 쪼개져 있다** — `TICKER`는 기본색, `FRONT`는 골드(목업 `home`).
   * 그래서 `GAME_TITLE`('TICKER FRONT')이 연속 문자열로는 마크업에 없다.
   * 두 조각이 다 있고 합치면 게임 이름이 된다는 것이 지금의 계약이다.
   */
  test('게임 이름을 두 조각으로 노출한다 (색이 다르다)', () => {
    expect(markup).toContain(`>${TITLE_HEAD}<`);
    expect(markup).toContain(`>${TITLE_TAIL}<`);
    expect(`${TITLE_HEAD} ${TITLE_TAIL}`).toBe(GAME_TITLE);
  });

  test('목업이 규정한 부제를 노출한다', () => {
    expect(markup).toContain(TITLE_SUBTITLE);
  });

  test('하단에 빌드 표기가 있다', () => {
    expect(markup).toContain(TITLE_BUILD_LABEL);
  });

  test('★ 티커 자리는 비어 있다 — 문구는 셸이 진행도에서 채운다', () => {
    // 마크업에 가짜 지수를 박아 두면 진행도와 무관한 거짓 정보가 화면에 고정된다.
    expect(markup).not.toMatch(/KOSPI|코스피/);
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
