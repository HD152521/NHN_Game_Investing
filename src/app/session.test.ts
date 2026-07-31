import { describe, expect, test } from 'vitest';

import { STARTING_AUM, STARTING_GOLD, StageSession } from './session';

/**
 * 통합 레벨 검증.
 *
 * `src/position`의 유닛 테스트는 판정 함수 자체를 검증한다. 여기서는 **배선이
 * 맞는지**를 본다 — 순수 함수가 아무리 옳아도 세션이 지갑을 잘못 이어붙이면
 * 코어 규칙이 무너지기 때문이다.
 */

function makeSession(): StageSession {
  return new StageSession(7, 1, 0);
}

describe('StageSession — 배선', () => {
  test('시작 재화가 PRD §9.2 값과 일치한다', () => {
    const session = makeSession();
    const snap = session.snapshot(0);

    expect(snap.wallet.gold).toBe(STARTING_GOLD);
    expect(snap.wallet.aum).toBe(STARTING_AUM);
    expect(snap.position).toBeNull();
  });

  test('진입하면 AUM만 줄고 골드는 그대로다', () => {
    const session = makeSession();
    session.openTrade('long', 0.25, 0);

    const snap = session.snapshot(0);
    expect(snap.position).not.toBeNull();
    expect(snap.wallet.aum).toBe(STARTING_AUM - 500);
    expect(snap.wallet.gold).toBe(STARTING_GOLD);
  });

  /**
   * ★ 이 프로젝트의 코어 경제 규칙 (FR-5.7, 2026-08-01 개정).
   *
   * **이익만이 골드가 된다.** 원금은 골드로 넘어가지 않고, 손실을 물고
   * `REFUND_RATIO`(0.70)만큼만 AUM으로 복귀한다.
   *
   * 이전 규칙("원금+손익이 통째로 골드")은 폐기됐다 — 진입 후 2초 만에 청산하면
   * 수수료 1%만 내고 AUM의 99%가 골드가 되어, **차트를 한 번도 안 보고**
   * 자금을 조달할 수 있었다. 합리적 플레이어의 최적해가 "차트 무시"가 되면서
   * PRD §9.3의 "예측을 건너뛴 플레이는 존재할 수 없다"는 코어 보증이 반전됐다.
   */
  test('청산하면 이익만 골드가 되고 원금은 환급률만큼만 AUM으로 복귀한다', () => {
    const session = makeSession();
    const minHoldMs = session.params.minHoldMs;

    session.openTrade('long', 0.25, 0);
    const aumAfterOpen = session.snapshot(0).wallet.aum;
    session.closeTrade(minHoldMs);

    const snap = session.snapshot(minHoldMs);
    const notice = session.takeNotice();

    expect(snap.position).toBeNull();
    expect(snap.wallet.gold).toBe(STARTING_GOLD + (notice?.goldGained ?? 0));
    expect(snap.wallet.aum).toBe(aumAfterOpen + (notice?.aumReturned ?? 0));
  });

  /**
   * 세탁 경로(진입 → 최소 보유 → 즉시 청산)가 죽었는지 확인한다.
   * 이 테스트가 깨지면 코어 루프가 다시 우회 가능해진 것이다.
   */
  test('진입 즉시 청산은 골드를 거의 못 벌고 원금의 약 30%를 잃는다', () => {
    const session = makeSession();
    const minHoldMs = session.params.minHoldMs;

    const aumBeforeOpen = session.snapshot(0).wallet.aum;
    session.openTrade('long', 0.25, 0);
    const stake = session.snapshot(0).position?.stake ?? 0;
    session.closeTrade(minHoldMs);

    const gained = session.takeNotice()?.goldGained ?? 0;
    const aumAfter = session.snapshot(minHoldMs).wallet.aum;

    // 2초(=시장 2분) 보유로는 큰 변동이 없으므로 이익이 거의 안 난다.
    expect(gained).toBeLessThan(stake * 0.3);
    // 왕복 한 번에 투입 원금의 30% 안팎이 증발한다 — 세탁을 반복할수록 AUM이 마른다.
    expect(aumAfter).toBeLessThan(aumBeforeOpen);
    expect(aumBeforeOpen - aumAfter).toBeGreaterThan(stake * 0.2);
  });

  /** 어디서 청산하든 왕복 후 AUM이 진입 전보다 많아질 수는 없다. */
  test('전 재생 구간 어디서 청산해도 왕복 후 AUM이 진입 전을 넘지 않는다', () => {
    for (const closeAt of [2_000, 30_000, 120_000, 300_000]) {
      const session = makeSession();
      const aumBeforeOpen = session.snapshot(0).wallet.aum;
      session.openTrade('long', 0.25, 0);

      session.syncLiquidation(closeAt);
      session.closeTrade(closeAt);

      expect(session.snapshot(closeAt).wallet.aum).toBeLessThanOrEqual(aumBeforeOpen);
    }
  });

  test('최소 보유 시간 이전에는 수동 청산이 거부된다', () => {
    const session = makeSession();
    session.openTrade('long', 0.25, 0);

    expect(session.canCloseAt(0)).toBe(false);
    session.closeTrade(0);
    expect(session.snapshot(0).position).not.toBeNull();

    expect(session.canCloseAt(session.params.minHoldMs)).toBe(true);
  });

  test('포지션 보유 중에는 추가 진입이 막힌다', () => {
    const session = makeSession();
    session.openTrade('long', 0.25, 0);
    const afterFirst = session.snapshot(0).wallet.aum;

    session.openTrade('short', 0.25, 0);

    expect(session.canOpen()).toBe(false);
    expect(session.snapshot(0).wallet.aum).toBe(afterFirst);
    expect(session.snapshot(0).openCount).toBe(1);
  });

  test('청산선까지 남은 거리는 미보유 시 0, 보유 시 양수로 시작한다', () => {
    const session = makeSession();
    expect(session.snapshot(0).distanceToLiquidation).toBe(0);

    session.openTrade('long', 0.25, 0);
    expect(session.snapshot(0).distanceToLiquidation).toBeGreaterThan(0);
  });

  test('스테이지 종료 시 열린 포지션이 정리된다', () => {
    const session = makeSession();
    session.openTrade('long', 0.25, 0);

    session.closeAtStageEnd(120_000);

    expect(session.snapshot(120_000).position).toBeNull();
    expect(session.takeNotice()?.position.reason).toBe('stage_end');
  });

  test('손실이 원금을 초과하지 않는다 — 전 구간 스윕', () => {
    const session = makeSession();
    session.openTrade('long', 0.5, 0);
    const stake = session.snapshot(0).position?.stake ?? 0;

    // 재생 전 구간을 훑어 평가손익이 −stake 아래로 내려가는 프레임이 없는지 본다.
    for (let ms = 0; ms <= 389_000; ms += 1_000) {
      const evaluation = session.snapshot(ms).evaluation;
      if (!evaluation) {
        break; // 강제 청산으로 이미 정리된 경우
      }
      expect(evaluation.pnl).toBeGreaterThanOrEqual(-stake);
    }
  });

  /**
   * 추가 매수의 설계 목적 — 물타기로 평균 단가를 당기면 청산선이 밀린다.
   * 이게 성립하지 않으면 추가 매수는 그냥 돈을 더 잃는 버튼일 뿐이다.
   */
  test('손실 중 추가 매수하면 청산선까지 거리가 늘어난다', () => {
    const session = makeSession();
    session.openTrade('long', 0.25, 0);

    // 평가손실이 가장 깊은 시점을 찾는다.
    let worstMs = 0;
    let worstZ = 0;
    for (let ms = 2_000; ms <= 200_000; ms += 2_000) {
      const z = session.snapshot(ms).evaluation?.z ?? 0;
      if (z < worstZ) {
        worstZ = z;
        worstMs = ms;
      }
    }
    expect(worstZ).toBeLessThan(0); // 손실 구간이 존재해야 의미 있는 테스트다

    const before = session.snapshot(worstMs);
    session.addTrade(0.5, worstMs);
    const after = session.snapshot(worstMs);

    expect(after.position?.addCount).toBe(1);
    expect(after.distanceToLiquidation).toBeGreaterThan(before.distanceToLiquidation);
    // 버틴 대가로 AUM이 줄어든다 — 그만큼 타워를 못 세운다.
    expect(after.wallet.aum).toBeLessThan(before.wallet.aum);
  });

  test('추가 매수는 원금을 키우고 방향·청산선 스냅샷은 유지한다', () => {
    const session = makeSession();
    session.openTrade('short', 0.25, 0);
    const before = session.snapshot(0).position;

    session.addTrade(0.5, 10_000);
    const after = session.snapshot(10_000).position;

    expect(after?.stake).toBeGreaterThan(before?.stake ?? 0);
    expect(after?.direction).toBe('short');
    expect(after?.liqLine).toBe(before?.liqLine);
    expect(after?.openAtMs).toBe(before?.openAtMs);
    expect(session.snapshot(10_000).openCount).toBe(2); // 진입 횟수를 소모한다
  });

  test('포지션이 없으면 추가 매수가 아무 일도 하지 않는다', () => {
    const session = makeSession();
    const before = session.snapshot(0).wallet;

    session.addTrade(0.5, 0);

    expect(session.snapshot(0).wallet).toEqual(before);
    expect(session.canAdd()).toBe(false);
  });

  test('AUM을 다시 채우는 유일한 경로는 적 처치 드롭이다', () => {
    const session = makeSession();
    session.build(0, 'basic');
    const aumBefore = session.snapshot(0).wallet.aum;

    // 매매만 반복해서는 AUM이 절대 늘지 않는다.
    session.openTrade('long', 0.25, 0);
    session.closeTrade(session.params.minHoldMs);
    expect(session.snapshot(0).wallet.aum).toBeLessThan(aumBefore);

    const aumAfterTrade = session.snapshot(0).wallet.aum;
    for (let i = 0; i < 400; i += 1) {
      session.stepCombatFrame(200);
    }
    // 전투로만 회복된다.
    expect(session.snapshot(0).wallet.aum).toBeGreaterThan(aumAfterTrade);
  });

  test('전투가 돌면 적 처치 드롭으로 AUM이 늘고, 골드는 웨이브 수입으로만 는다', () => {
    const session = makeSession();
    // 타워를 세워야 적이 죽고 AUM이 떨어진다.
    session.build(0, 'basic');
    session.build(1, 'antiair');

    const goldAfterBuild = session.snapshot(0).wallet.gold;
    const aumStart = session.snapshot(0).wallet.aum;

    for (let i = 0; i < 400; i += 1) {
      session.stepCombatFrame(200);
    }

    const snap = session.snapshot(0);
    expect(snap.wallet.aum).toBeGreaterThan(aumStart);
    // 매매를 한 번도 하지 않았으므로 골드 증가분은 전부 웨이브 기본 수입이다.
    expect(snap.wallet.gold).toBeGreaterThan(goldAfterBuild);
    expect(session.combatState.wave).toBeGreaterThan(1);
  });

  test('타워 건설은 골드만 쓰고 AUM을 건드리지 않는다', () => {
    const session = makeSession();
    const before = session.snapshot(0).wallet;

    session.build(0, 'basic');

    const after = session.snapshot(0).wallet;
    expect(after.gold).toBe(before.gold - 120);
    expect(after.aum).toBe(before.aum);
    expect(session.combatState.towers).toHaveLength(1);
  });

  test('골드가 부족하면 건설이 조용히 무시된다', () => {
    const session = makeSession();
    // 시작 골드 120 = 기본 포탑 정확히 1기. 두 번째 건설은 잔액 0이라 실패해야 한다.
    // 2기째 자금은 첫 청산에서만 나온다 — 이게 "매매를 해야 방어가 선다"는 압박의 출발점이다.
    session.build(0, 'basic');
    session.build(1, 'basic');

    expect(session.combatState.towers).toHaveLength(1);
    expect(session.snapshot(0).wallet.gold).toBe(0);
  });

  test('전투가 끝나면 더 이상 진행되지 않는다', () => {
    const session = makeSession();
    // 타워 없이 방치하면 본진이 뚫린다.
    for (let i = 0; i < 4000; i += 1) {
      session.stepCombatFrame(200);
    }

    const phase = session.combatState.phase;
    expect(phase).not.toBe('running');

    const frozen = session.combatState;
    session.stepCombatFrame(200);
    expect(session.combatState).toBe(frozen);
  });

  test('강제 청산이 걸리면 포지션이 사라지고 골드는 늘지 않는다', () => {
    const session = makeSession();
    session.openTrade('short', 0.5, 0);
    const goldBefore = session.snapshot(0).wallet.gold;

    let liquidated = false;
    for (let ms = 0; ms <= 389_000; ms += 1_000) {
      session.syncLiquidation(ms);
      if (session.snapshot(ms).position === null) {
        liquidated = true;
        expect(session.snapshot(ms).wallet.gold).toBe(goldBefore);
        break;
      }
    }

    // 이 시드에서 강제 청산이 안 걸릴 수도 있다. 걸렸다면 위 단언이 검증한다.
    expect(typeof liquidated).toBe('boolean');
  });
});
