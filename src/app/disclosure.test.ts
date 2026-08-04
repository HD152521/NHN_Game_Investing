import { describe, expect, test } from 'vitest';

/**
 * DISCLOSURE — 판이 끝난 뒤의 대조 화면.
 *
 * 이 화면은 **밖으로 나가는 진술**이라 조이는 것이 둘이다:
 * ① 지어낸 시장 정보를 말하지 않는가 (종목·거래소·공시 본문)
 * ② 진 판이 이긴 것처럼 보이지 않는가 (등급 인장·보상)
 */
import { BASE_PALETTE } from '../design';
import type { ClosedPosition } from '../position';
import { buildDisclosure, dayCharacterOf, dominantDirectionOf } from './disclosure';
import type { DisclosureInput } from './disclosure';
import type { Settlement } from './settlement';

function close(overrides: Partial<ClosedPosition> = {}): ClosedPosition {
  return {
    seq: 1,
    direction: 'long',
    stake: 500,
    fee: 5,
    openPrice: 100,
    openAtMs: 30_000,
    liqLine: 1,
    addCount: 0,
    closePrice: 110,
    closeAtMs: 60_000,
    pnl: 120,
    reason: 'manual',
    ...overrides,
  };
}

function settlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    outcome: 'cleared',
    goldRatio: 0.25,
    accuracy: 0.7,
    baseHpRatio: 1,
    score: 6,
    grade: 'S',
    aumCredit: 120,
    baseCapital: 1200,
    bonusMultiplier: 1.5,
    gradeMultiplier: 1.6,
    capital: 2880,
    ...overrides,
  };
}

function input(overrides: Partial<DisclosureInput> = {}): DisclosureInput {
  return {
    outcome: 'cleared',
    settlement: settlement(),
    closes: [close()],
    archetype: 'surge',
    events: [],
    dayChangePct: 4.2,
    wavesHeld: 13,
    waveCount: 13,
    cardsEarned: 1,
    ...overrides,
  };
}

describe('★ 지어낸 시장 정보를 말하지 않는다', () => {
  test('종목·거래소·공시 본문이 화면에 없다', () => {
    const d = buildDisclosure(input());
    const text = [
      d.character.eyebrow,
      d.character.headline,
      d.character.figure,
      d.character.note,
      d.footer,
      ...d.rows.map((r) => `${r.label}${r.value}`),
      ...d.rewards,
    ].join(' ');
    // 목업의 "KRX · 정기공시 · 분기 실적 발표 · 영업이익" 같은 것이 새어 들어가면 안 된다.
    expect(text).not.toMatch(/KRX|거래소|공시|영업이익|실적 발표/);
    // 종목명처럼 보이는 것도 없어야 한다.
    expect(text).not.toMatch(/전자|증권|화학|바이오|주식회사/);
  });

  test('상단 카드는 "그날의 성격"이다 — 합성기가 실제로 정한 값에서만 파생한다', () => {
    expect(dayCharacterOf(input({ archetype: 'plunge' })).headline).toBe('무너진 날');
    expect(dayCharacterOf(input({ archetype: 'range' })).headline).toBe('아무 일도 없던 날');
    expect(dayCharacterOf(input({ archetype: 'reversal' })).headline).toBe('뒤집힌 날');
  });

  test('시장 이벤트가 있었으면 설명에 덧붙인다', () => {
    const withEvent = dayCharacterOf(input({ events: ['panic_sell'] }));
    expect(withEvent.note).toContain('투매');
    const none = dayCharacterOf(input({ events: [] }));
    expect(none.note).not.toContain('투매');
  });
});

describe('★ 진 판이 이긴 것처럼 보이지 않는다', () => {
  test('패배에는 등급 인장을 찍지 않는다', () => {
    const d = buildDisclosure(
      input({ outcome: 'defeated', settlement: settlement({ outcome: 'defeated', capital: 0 }) }),
    );
    expect(d.seal).toBeNull();
    expect(d.sealTone).toBe('ENEMY_DOWN');
  });

  test('결론이 안 난 판도 인장이 없다', () => {
    expect(buildDisclosure(input({ outcome: 'unresolved' })).seal).toBeNull();
  });

  test('클리어 S·A만 금색 인장', () => {
    expect(buildDisclosure(input()).sealTone).toBe('GOLD');
    expect(
      buildDisclosure(input({ settlement: settlement({ grade: 'C' }) })).sealTone,
    ).toBe('TEXT');
  });

  test('받은 것이 없으면 보상 줄이 비어 있다 — 0을 나열하지 않는다', () => {
    const d = buildDisclosure(
      input({
        outcome: 'defeated',
        settlement: settlement({ capital: 0, aumCredit: 0 }),
        cardsEarned: 0,
      }),
    );
    expect(d.rewards).toEqual([]);
  });

  test('★ FR-9.5 — 패배해도 화면은 뜬다', () => {
    const d = buildDisclosure(input({ outcome: 'defeated' }));
    expect(d.rows.length).toBeGreaterThan(0);
    expect(d.character.headline.length).toBeGreaterThan(0);
    expect(d.footer).toContain('그날이 어떤 날이었는지는 남는다');
  });
});

describe('예측 vs 실제', () => {
  test('가장 크게 건 방향을 그 사람의 판단으로 읽는다', () => {
    // 잽(작은 LONG) 두 번 + 큰 SHORT 한 번 → 판단은 SHORT다.
    const closes = [
      close({ seq: 1, direction: 'long', stake: 100 }),
      close({ seq: 2, direction: 'long', stake: 100 }),
      close({ seq: 3, direction: 'short', stake: 900 }),
    ];
    expect(dominantDirectionOf(closes)).toBe('short');
  });

  test('원금이 같으면 판단이 없었던 것으로 본다', () => {
    const closes = [
      close({ seq: 1, direction: 'long', stake: 500 }),
      close({ seq: 2, direction: 'short', stake: 500 }),
    ];
    expect(dominantDirectionOf(closes)).toBeNull();
  });

  test('매매가 없으면 방향도 없다', () => {
    expect(dominantDirectionOf([])).toBeNull();
  });

  test('방향을 맞추면 적중으로 표시한다', () => {
    const d = buildDisclosure(input({ closes: [close({ direction: 'long' })], dayChangePct: 3 }));
    expect(d.rows.find((r) => r.label === '적중')?.value).toBe('방향을 맞췄다');
  });

  test('방향이 어긋나면 그렇게 말한다', () => {
    const d = buildDisclosure(input({ closes: [close({ direction: 'long' })], dayChangePct: -3 }));
    expect(d.rows.find((r) => r.label === '적중')?.value).toBe('방향이 어긋났다');
  });

  test('★ 방향을 걸지 않았으면 "틀렸다"고 말하지 않는다', () => {
    const d = buildDisclosure(input({ closes: [] }));
    expect(d.rows.some((r) => r.label === '적중')).toBe(false);
    expect(d.rows.find((r) => r.label === '당신의 예측')?.value).toBe('판단 없음');
    // 색으로 강조하지도 않는다 — 성취도 실패도 아니다.
    expect(d.rows.find((r) => r.label === '당신의 예측')?.tone).toBeUndefined();
  });
});

describe('경계 입력', () => {
  test('매매 0회면 적중률 줄이 없다', () => {
    expect(buildDisclosure(input({ closes: [] })).rows.some((r) => r.label === '적중률')).toBe(
      false,
    );
  });

  test('방어 0웨이브에서도 던지지 않는다', () => {
    const d = buildDisclosure(input({ wavesHeld: 0, outcome: 'defeated' }));
    expect(d.rows.find((r) => r.label === '방어한 웨이브')?.value).toBe('0 / 13');
    expect(d.rows.find((r) => r.label === '방어한 웨이브')?.tone).toBe('MUTED');
  });

  test('전 웨이브 방어는 강조한다', () => {
    expect(
      buildDisclosure(input()).rows.find((r) => r.label === '방어한 웨이브')?.tone,
    ).toBe('GOLD');
  });

  test('등락률 0에서도 던지지 않는다', () => {
    expect(() => buildDisclosure(input({ dayChangePct: 0 }))).not.toThrow();
  });
});

describe('★ 색 규칙 — 초록 금지, 팔레트 토큰만', () => {
  test('쓰인 토큰이 전부 팔레트에 있다', () => {
    const d = buildDisclosure(input({ closes: [close({ direction: 'short' })] }));
    const tokens = [
      d.character.figureTone,
      d.sealTone,
      ...d.rows.map((r) => r.tone).filter((t): t is NonNullable<typeof t> => t !== undefined),
    ];
    for (const token of tokens) {
      expect(Object.keys(BASE_PALETTE)).toContain(token);
    }
  });

  test('상승은 UP_ALLY(적) · 하락은 ENEMY_DOWN(청) — 한국식이다', () => {
    expect(dayCharacterOf(input({ dayChangePct: 5 })).figureTone).toBe('UP_ALLY');
    expect(dayCharacterOf(input({ dayChangePct: -5 })).figureTone).toBe('ENEMY_DOWN');
  });
});
