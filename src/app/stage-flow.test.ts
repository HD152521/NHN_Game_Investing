import { describe, expect, test } from 'vitest';

import type { CombatPhase } from '../combat';
import {
  decideFrame,
  formatActionLog,
  resolveSpeedChange,
  shouldSkipPrep,
} from './stage-flow';

/**
 * ★ 이 파일이 막는 것 ★
 * click-path 감사가 찾은 결함 5건은 전부 "버튼을 누르면 실제로 무슨 일이 일어나는가"가
 * CI 에서 한 번도 검증되지 않았기 때문에 살아남았다(jsdom 없음 → DOM 배선 테스트 0건).
 * 아래 테스트는 그 판정들을 순수 함수 수준에서 고정한다.
 */

const PHASES: readonly CombatPhase[] = ['running', 'cleared', 'defeated'];

describe('decideFrame — 재생 종료가 판을 지우지 않는다 (CLICK-PATH-001)', () => {
  /**
   * 회귀의 본체. 예전 셸은 이 조합에서 `seed += 1; session = null`을 실행해
   * 골드 120·웨이브 0·타워 0 으로 **무음 재시작**했다.
   */
  test('재생이 끝난 프레임은 장 마감이지 리셋이 아니다', () => {
    const decision = decideFrame({
      phase: 'running',
      replayFinished: true,
      marketClosed: false,
      overtimeRemainingMs: 0,
    });
    expect(decision.kind).toBe('close-market');
  });

  test('어떤 입력에도 세션을 버리는 결정은 나오지 않는다', () => {
    for (const phase of PHASES) {
      for (const replayFinished of [false, true]) {
        for (const marketClosed of [false, true]) {
          for (const overtimeRemainingMs of [0, 30_000]) {
            const decision = decideFrame({
              phase,
              replayFinished,
              marketClosed,
              overtimeRemainingMs,
            });
            expect(['run', 'close-market', 'overtime', 'finish']).toContain(decision.kind);
            // 재생이 끝났는데 '평소 프레임'으로 흘려보내는 경로가 없어야 한다.
            if (replayFinished && !marketClosed && phase === 'running') {
              expect(decision.kind).toBe('close-market');
            }
          }
        }
      }
    }
  });

  test('장 마감 후에는 전투가 결론에 닿을 때까지 연장으로 계속 돈다', () => {
    expect(
      decideFrame({
        phase: 'running',
        replayFinished: true,
        marketClosed: true,
        overtimeRemainingMs: 15_000,
      }).kind,
    ).toBe('overtime');
  });

  test('연장이 소진되면 결과를 낸다 — 조용히 끝나지 않는다', () => {
    const decision = decideFrame({
      phase: 'running',
      replayFinished: true,
      marketClosed: true,
      overtimeRemainingMs: 0,
    });
    expect(decision).toEqual({ kind: 'finish', outcome: 'unresolved' });
  });

  test('전투가 먼저 끝나면 재생이 남아 있어도 결과 화면으로 간다', () => {
    expect(
      decideFrame({
        phase: 'cleared',
        replayFinished: false,
        marketClosed: false,
        overtimeRemainingMs: 0,
      }),
    ).toEqual({ kind: 'finish', outcome: 'cleared' });

    expect(
      decideFrame({
        phase: 'defeated',
        replayFinished: false,
        marketClosed: false,
        overtimeRemainingMs: 0,
      }),
    ).toEqual({ kind: 'finish', outcome: 'defeated' });
  });

  test('평소 프레임은 그대로 흐른다', () => {
    expect(
      decideFrame({
        phase: 'running',
        replayFinished: false,
        marketClosed: false,
        overtimeRemainingMs: 0,
      }).kind,
    ).toBe('run');
  });
});

describe('resolveSpeedChange — 배속이 진행 중 판을 지우지 않는다 (CLICK-PATH-002)', () => {
  test('세션이 없으면 그냥 바뀐다', () => {
    const result = resolveSpeedChange({ requested: 4, current: 1, armed: null, hasSession: false });
    expect(result).toMatchObject({ speed: 4, restart: false, armed: null });
  });

  /** 감사가 지적한 무음 파괴. 첫 클릭은 절대 판을 건드리지 않는다. */
  test('진행 중 첫 클릭은 판을 건드리지 않고 무슨 일이 벌어질지 말한다', () => {
    const result = resolveSpeedChange({ requested: 4, current: 1, armed: null, hasSession: true });

    expect(result.restart).toBe(false);
    expect(result.speed).toBe(1); // 배속도 아직 안 바뀐다
    expect(result.armed).toBe(4);
    expect(result.message).toContain('4x');
    expect(result.message.length).toBeGreaterThan(0);
  });

  test('같은 버튼을 한 번 더 누르면 그때 적용되고 재시작을 명시한다', () => {
    const result = resolveSpeedChange({ requested: 4, current: 1, armed: 4, hasSession: true });

    expect(result).toMatchObject({ speed: 4, restart: true, armed: null });
    expect(result.message).toContain('새 스테이지');
  });

  test('다른 배속을 누르면 예고가 그쪽으로 옮겨간다 (실수로 재시작되지 않는다)', () => {
    const result = resolveSpeedChange({ requested: 2, current: 1, armed: 4, hasSession: true });
    expect(result.restart).toBe(false);
    expect(result.armed).toBe(2);
  });

  test('현재 배속을 다시 누르는 것은 아무 일도 아니다', () => {
    const result = resolveSpeedChange({ requested: 2, current: 2, armed: 4, hasSession: true });
    expect(result).toMatchObject({ speed: 2, restart: false, armed: null });
  });
});

describe('shouldSkipPrep — Space 가 정상 동선에서 먹힌다 (CLICK-PATH-005)', () => {
  const ready = { hasSession: true, prepRemainingMs: 4_000 } as const;

  /**
   * 준비 5초는 정확히 빌드바 버튼을 누르는 구간이다. 클릭 직후 포커스가 버튼에 남아 있는
   * 것이 **정상 동선**이며, 예전 구현은 이 경우 Space 를 통째로 버렸다.
   */
  test('마우스 클릭으로 포커스만 남은 버튼에서는 Space 가 준비를 끝낸다', () => {
    expect(shouldSkipPrep({ ...ready, focusKind: 'button', keyboardFocused: false })).toBe(true);
  });

  test('키보드로 이동해 온 버튼에서는 Space 를 양보한다 (접근성 회귀 방지)', () => {
    expect(shouldSkipPrep({ ...ready, focusKind: 'button', keyboardFocused: true })).toBe(false);
  });

  test('텍스트/폼 컨트롤에서는 절대 가로채지 않는다', () => {
    expect(shouldSkipPrep({ ...ready, focusKind: 'text-field', keyboardFocused: false })).toBe(
      false,
    );
    expect(shouldSkipPrep({ ...ready, focusKind: 'text-field', keyboardFocused: true })).toBe(false);
  });

  test('포커스 대상이 없으면 그냥 먹는다', () => {
    expect(shouldSkipPrep({ ...ready, focusKind: 'none', keyboardFocused: false })).toBe(true);
  });

  test('준비 구간이 아니거나 세션이 없으면 아무 일도 하지 않는다', () => {
    expect(
      shouldSkipPrep({
        hasSession: true,
        prepRemainingMs: 0,
        focusKind: 'none',
        keyboardFocused: false,
      }),
    ).toBe(false);
    expect(
      shouldSkipPrep({
        hasSession: false,
        prepRemainingMs: 4_000,
        focusKind: 'none',
        keyboardFocused: false,
      }),
    ).toBe(false);
  });
});

describe('formatActionLog — 실패를 성공이라 말하지 않는다 (CLICK-PATH-003)', () => {
  test('성공 로그에는 지출이 적힌다', () => {
    const log = formatActionLog({ ok: true, verb: '업그레이드', displayName: '기본 포탑', cost: 60 });
    expect(log).toContain('기본 포탑');
    expect(log).toContain('60G');
    expect(log).not.toContain('부족');
  });

  test('실패 로그는 지출을 사실로 말하지 않는다', () => {
    const log = formatActionLog({ ok: false, verb: '업그레이드', displayName: '기본 포탑', cost: 60 });
    expect(log).toContain('부족');
    expect(log).toContain('60G');
  });

  test('성공과 실패 문구가 서로 다르다', () => {
    const args = { verb: '건설', displayName: '대공 포대', cost: 150 } as const;
    expect(formatActionLog({ ...args, ok: true })).not.toBe(
      formatActionLog({ ...args, ok: false }),
    );
  });
});
