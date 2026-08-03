import { describe, expect, test } from 'vitest';

import type { CodexCard } from './codex';
import { dateLabelFromSeed } from './codex';

/**
 * 공개 연출 판정 — 전건.
 *
 * 특히 **경계 입력**을 조인다: 한 번도 매매하지 않은 판 · 강제 청산만 있는 판 · 패배.
 * FR-9.5가 "패배해도 보여준다"이므로 패배 경로가 죽어 있으면 안 된다.
 */
import type { ClosedPosition } from '../position';
import {
  PLAYABLE_STAGES,
  REVEAL_STAGES,
  codexLines,
  REVEAL_TOTAL_MS,
  pendingStageNotices,
  revealFrame,
  revealTitleFor,
  skipToNextStage,
  summaryLines,
  tradeMarkers,
} from './reveal';
import type { RevealInput } from './reveal';
import type { Settlement } from './settlement';

const STAGE_MS = 390_000;

function close(overrides: Partial<ClosedPosition> = {}): ClosedPosition {
  return {
    seq: 1,
    direction: 'long',
    stake: 500,
    fee: 5,
    openPrice: 100,
    openAtMs: 39_000,
    liqLine: 1,
    addCount: 0,
    closePrice: 110,
    closeAtMs: 78_000,
    pnl: 120,
    reason: 'manual',
    ...overrides,
  };
}

function settlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    outcome: 'cleared',
    goldRatio: 0.2,
    accuracy: 0.5,
    baseHpRatio: 1,
    score: 5,
    grade: 'A',
    aumCredit: 0,
    baseCapital: 1000,
    bonusMultiplier: 1.2,
    gradeMultiplier: 1.3,
    capital: 1560,
    ...overrides,
  };
}

function input(overrides: Partial<RevealInput> = {}): RevealInput {
  return {
    outcome: 'cleared',
    settlement: settlement(),
    closes: [close()],
    stageDurationMs: STAGE_MS,
    ohlcv: { open: 100, high: 118, low: 96, close: 112, volumeMultiple: 1.8 },
    ...overrides,
  };
}

describe('시퀀스 골격 — 6단계 자리를 잡되 만들 수 있는 것만 재생한다', () => {
  test('FR-9.2의 6단계가 전부 정의돼 있다', () => {
    expect(REVEAL_STAGES.map((s) => s.id)).toEqual([
      'zoomout',
      'identity',
      'headlines',
      'trades',
      'summary',
      'codex',
    ]);
  });

  test('★ 지금 재생되는 것은 4·5·6단계다 — 남은 셋은 실데이터 선행', () => {
    // 6단계(도감)는 도감이 구현되면서 열렸다. 나머지 셋은 여전히 실데이터가 없어 막혀 있다.
    expect(PLAYABLE_STAGES.map((s) => s.id)).toEqual(['trades', 'summary', 'codex']);
  });

  test('못 만드는 단계에는 이유가 적혀 있다 — 다음 사람이 다시 조사하지 않게', () => {
    for (const stage of REVEAL_STAGES.filter((s) => !s.available)) {
      expect(stage.blockedBy).toBeTruthy();
    }
    // 남은 차단은 zoomout · identity · headlines 셋 — 전부 실데이터 미연결이다.
    expect(pendingStageNotices()).toHaveLength(3);
  });

  test('건너뛰는 단계는 시간도 소비하지 않는다 — 빈 화면 1.5초는 버그로 읽힌다', () => {
    expect(REVEAL_TOTAL_MS).toBe(1_500 + 2_000 + 1_500);
  });
});

describe('④ 매매 되짚기 — ClosedPosition만으로 지금 만들 수 있다', () => {
  test('진입·청산 시각이 0~1 진행도로 정규화된다 (픽셀은 렌더러가 정한다)', () => {
    const [marker] = tradeMarkers([close({ openAtMs: 39_000, closeAtMs: 195_000 })], STAGE_MS);
    expect(marker?.openAt).toBeCloseTo(0.1, 5);
    expect(marker?.closeAt).toBeCloseTo(0.5, 5);
  });

  test('재생 밖 시각(연장 중 강제 청산)은 1로 잘린다', () => {
    const [marker] = tradeMarkers([close({ closeAtMs: STAGE_MS + 20_000 })], STAGE_MS);
    expect(marker?.closeAt).toBe(1);
  });

  test('LONG은 ▲, SHORT는 ▼', () => {
    expect(tradeMarkers([close({ direction: 'long' })], STAGE_MS)[0]?.glyph).toBe('▲');
    expect(tradeMarkers([close({ direction: 'short' })], STAGE_MS)[0]?.glyph).toBe('▼');
  });

  test('★ 색 규칙 — 이익 GOLD / 손실 ENEMY_DOWN / 강제청산 UP_ALLY. 초록은 없다', () => {
    expect(tradeMarkers([close({ pnl: 120 })], STAGE_MS)[0]?.tone).toBe('GOLD');
    expect(tradeMarkers([close({ pnl: -80 })], STAGE_MS)[0]?.tone).toBe('ENEMY_DOWN');
    expect(
      tradeMarkers([close({ pnl: -500, reason: 'liquidated' })], STAGE_MS)[0]?.tone,
    ).toBe('UP_ALLY');
  });

  test('강제 청산은 손실이지만 별도 색이다 — "졌다"와 "터졌다"는 다른 사건', () => {
    const loss = tradeMarkers([close({ pnl: -80 })], STAGE_MS)[0];
    const liq = tradeMarkers([close({ pnl: -500, reason: 'liquidated' })], STAGE_MS)[0];
    expect(liq?.tone).not.toBe(loss?.tone);
    expect(liq?.liquidated).toBe(true);
    expect(loss?.liquidated).toBe(false);
  });

  test('청산이 없으면 마커도 없다 (던지지 않는다)', () => {
    expect(tradeMarkers([], STAGE_MS)).toEqual([]);
  });

  test('재생 길이가 0이어도 던지지 않는다', () => {
    expect(() => tradeMarkers([close()], 0)).not.toThrow();
  });
});

describe('⑤ 요약 — OHLCV + N번 중 M번 적중', () => {
  test('상승은 UP_ALLY(적), 하락은 ENEMY_DOWN(청) — 한국식', () => {
    const up = summaryLines(input({ ohlcv: { open: 100, high: 120, low: 99, close: 112, volumeMultiple: 1 } }));
    const down = summaryLines(input({ ohlcv: { open: 100, high: 101, low: 80, close: 88, volumeMultiple: 1 } }));
    expect(up[0]?.tone).toBe('UP_ALLY');
    expect(down[0]?.tone).toBe('ENEMY_DOWN');
    expect(up[0]?.value).toContain('+');
    expect(down[0]?.value).toContain('-');
  });

  test('적중 횟수를 실제 청산에서 센다', () => {
    const lines = summaryLines(
      input({
        closes: [close({ pnl: 100 }), close({ seq: 2, pnl: -50 }), close({ seq: 3, pnl: 30 })],
      }),
    );
    expect(lines.find((l) => l.label === '적중')?.value).toBe('3번 중 2번');
  });

  test('★ 한 번도 매매하지 않은 판 — "0번 중 0번"은 성적이 아니라 오류로 읽힌다', () => {
    const lines = summaryLines(input({ closes: [] }));
    expect(lines.find((l) => l.label === '매매')?.value).toContain('진입하지 않았다');
    expect(lines.some((l) => l.label === '적중')).toBe(false);
    expect(lines.some((l) => l.label === '적중률')).toBe(false);
  });

  test('강제 청산은 있을 때만 줄이 생긴다 (리스크 관리 지표, O-15)', () => {
    expect(summaryLines(input()).some((l) => l.label === '강제 청산')).toBe(false);
    const withLiq = summaryLines(
      input({ closes: [close({ pnl: -500, reason: 'liquidated' })] }),
    );
    expect(withLiq.find((l) => l.label === '강제 청산')?.value).toBe('1번');
  });

  test('시가가 0인 비정상 입력에서도 던지지 않는다 (0으로 나누기 방어)', () => {
    const lines = summaryLines(
      input({ ohlcv: { open: 0, high: 0, low: 0, close: 0, volumeMultiple: 0 } }),
    );
    // 0에는 부호를 붙이지 않는다 — `stage-dom.ts`의 `formatSignedPercent`와 같은 규약이다
    // (`> 0`일 때만 '+'). NaN이 새지 않는지가 이 테스트의 요점이다.
    expect(lines[0]?.value).toBe('0.00%');
  });
});

describe('재생 — 경과 시간 → 표시 내용', () => {
  test('시작 직후에는 ④단계이고 마커를 준다', () => {
    const frame = revealFrame(input(), 0);
    expect(frame.stage).toBe('trades');
    expect(frame.markers).toHaveLength(1);
    expect(frame.summary).toEqual([]);
  });

  test('④가 끝나면 ⑤로 넘어가고 요약을 준다', () => {
    const frame = revealFrame(input(), 1_600);
    expect(frame.stage).toBe('summary');
    expect(frame.summary.length).toBeGreaterThan(0);
    expect(frame.markers).toEqual([]);
  });

  test('총 길이를 넘으면 끝난다', () => {
    const frame = revealFrame(input(), REVEAL_TOTAL_MS + 1);
    expect(frame.finished).toBe(true);
    expect(frame.stage).toBeNull();
    expect(frame.progress).toBe(1);
  });

  test('진행도는 0에서 1로 단조 증가한다', () => {
    const points = [0, 500, 1_500, 2_500, REVEAL_TOTAL_MS];
    const values = points.map((ms) => revealFrame(input(), ms).progress);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]!);
    }
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(1);
  });

  test('음수·NaN 경과에도 던지지 않는다', () => {
    expect(revealFrame(input(), -100).stage).toBe('trades');
    expect(revealFrame(input(), Number.NaN).stage).toBe('trades');
  });
});

describe('★ FR-9.5 — 패배해도 공개 연출은 보여준다', () => {
  test('패배에서도 화면이 뜨고 마커가 나온다', () => {
    const frame = revealFrame(input({ outcome: 'defeated' }), 0);
    expect(frame.stage).toBe('trades');
    expect(frame.markers).toHaveLength(1);
  });

  test('결과별로 제목이 다르지만 셋 다 비어 있지 않다', () => {
    const titles = (['cleared', 'defeated', 'unresolved'] as const).map(revealTitleFor);
    expect(new Set(titles).size).toBe(3);
    for (const title of titles) {
      expect(title.length).toBeGreaterThan(0);
    }
  });

  test('결론이 나지 않은 판에서도 요약이 나온다', () => {
    const frame = revealFrame(input({ outcome: 'unresolved' }), 1_600);
    expect(frame.summary.length).toBeGreaterThan(0);
  });
});

describe('단계 스킵 — 각 단계를 개별적으로 건너뛴다 (FR-9.2)', () => {
  test('④ 도중 스킵하면 ⑤의 시작으로 간다', () => {
    expect(skipToNextStage(500)).toBe(1_500);
    expect(revealFrame(input(), skipToNextStage(500)).stage).toBe('summary');
  });

  test('마지막 단계에서 스킵하면 시퀀스가 끝난다', () => {
    // 마지막 단계(codex)는 3,500ms에서 시작한다 — 그 안의 시각에서 스킵해야 끝난다.
    const at = skipToNextStage(4_000);
    expect(at).toBe(REVEAL_TOTAL_MS);
    expect(revealFrame(input(), at).finished).toBe(true);
  });

  test('이미 끝난 뒤 스킵해도 총 길이를 넘지 않는다', () => {
    expect(skipToNextStage(REVEAL_TOTAL_MS + 5_000)).toBe(REVEAL_TOTAL_MS);
  });
});


// ── ⑥ 도감 단계 (도감 구현으로 열린 단계) ──────────────────────

describe('⑥ 도감 — 이 판이 무엇으로 남는가', () => {
  const card: CodexCard = {
    id: '7-R1',
    stageId: 'R1',
    seed: 7,
    grade: 'S',
    changeRate: 12.5,
    hasEvent: false,
    durationMs: 60_000,
    baseHp: 100,
    maxBaseHp: 100,
    accuracy: 0.8,
    bars: [{ o: 100, c: 110 }],
  };

  test('★ 카드가 없어도 빈 화면을 내지 않는다 — 왜 없는지를 말한다', () => {
    const lines = codexLines(input());
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.map((line) => line.value).join(' ')).toContain('기록으로 남지 않는다');
  });

  test('카드가 있으면 제목·등급·날짜를 말한다', () => {
    const lines = codexLines({ ...input(), card });
    const text = lines.map((line) => `${line.label} ${line.value}`).join(' | ');
    expect(text).toContain('LEGENDARY');
    expect(text).toContain('RANK S');
    expect(text).toContain(dateLabelFromSeed(7));
  });

  test('수집 수를 넘기면 진척이 함께 나온다', () => {
    const lines = codexLines({ ...input(), card, collected: 37 });
    expect(lines.some((line) => line.value.includes('37 /'))).toBe(true);
  });

  test('수집 수를 넘기지 않으면 진척 줄이 없다 (0 / 120이라 거짓말하지 않는다)', () => {
    const lines = codexLines({ ...input(), card });
    expect(lines.some((line) => line.label === '수집')).toBe(false);
  });

  test('마지막 단계의 프레임이 도감 내용을 싣는다', () => {
    // trades(1500) + summary(2000) 이후가 codex 구간이다.
    const frame = revealFrame({ ...input(), card }, 4_000);
    expect(frame.stage).toBe('codex');
    expect(frame.summary.length).toBeGreaterThan(0);
    expect(frame.subtitle).toBe('이 판이 무엇으로 남는가');
  });
});
