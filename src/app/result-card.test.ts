import { describe, expect, test } from 'vitest';

/**
 * 결과 카드 내용 — 공유되는 성적표.
 *
 * 카드는 **밖으로 나가는 산출물**이라 거짓말을 하면 안 된다. 그래서 조이는 것은 둘이다:
 * ① 패배한 판이 성취처럼 보이지 않는가 ② 시드가 반드시 실려 나가는가(같은 판을 열 수 있어야).
 */
import { buildResultCard, gradeToneOf } from './result-card';
import type { ResultCardInput } from './result-card';
import type { Settlement } from './settlement';

function settlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    outcome: 'cleared',
    goldRatio: 0.25,
    accuracy: 0.7,
    baseHpRatio: 1,
    score: 6,
    grade: 'S',
    aumCredit: 100,
    baseCapital: 1200,
    bonusMultiplier: 1.5,
    gradeMultiplier: 1.6,
    capital: 2880,
    ...overrides,
  };
}

function input(overrides: Partial<ResultCardInput> = {}): ResultCardInput {
  return {
    outcome: 'cleared',
    settlement: settlement(),
    stageId: 'R1',
    stageName: '여의도',
    seed: 20260803,
    mode: 'daily',
    closeCount: 10,
    liquidatedCount: 0,
    remainingBaseHp: 100,
    maxBaseHp: 100,
    ...overrides,
  };
}

describe('★ 카드는 거짓말하지 않는다', () => {
  test('패배는 등급과 무관하게 ENEMY_DOWN — 자본금 0인데 금색이면 거짓말이다', () => {
    expect(gradeToneOf('S', 'defeated')).toBe('ENEMY_DOWN');
    expect(gradeToneOf('S', 'unresolved')).toBe('ENEMY_DOWN');
  });

  test('클리어 S·A만 GOLD다', () => {
    expect(gradeToneOf('S', 'cleared')).toBe('GOLD');
    expect(gradeToneOf('A', 'cleared')).toBe('GOLD');
    expect(gradeToneOf('B', 'cleared')).toBe('TEXT');
    expect(gradeToneOf('C', 'cleared')).toBe('MUTED');
  });

  test('패배해도 카드가 만들어진다 — 숨기지 않는다', () => {
    const card = buildResultCard(
      input({ outcome: 'defeated', settlement: settlement({ outcome: 'defeated', capital: 0 }) }),
    );
    expect(card.headline).toBe('본진 함락');
    expect(card.gradeTone).toBe('ENEMY_DOWN');
  });

  test('결과별 문구가 셋 다 다르다', () => {
    const heads = (['cleared', 'defeated', 'unresolved'] as const).map(
      (outcome) => buildResultCard(input({ outcome })).headline,
    );
    expect(new Set(heads).size).toBe(3);
  });

  test('자본금 0이면 금색으로 강조하지 않는다', () => {
    const card = buildResultCard(input({ settlement: settlement({ capital: 0 }) }));
    expect(card.stats.find((s) => s.label === '자본금')?.tone).toBe('MUTED');
  });
});

describe('★ 시드가 반드시 실려 나간다 (공유의 전제)', () => {
  test('정체 자리에 지역 + 시드가 들어간다 — 실데이터가 붙으면 종목·날짜가 온다', () => {
    const card = buildResultCard(input());
    expect(card.identity).toContain('R1');
    expect(card.identity).toContain('여의도');
    expect(card.identity).toContain('20260803');
  });

  test('공유 문자열에 시드가 있다', () => {
    expect(buildResultCard(input()).shareLine).toContain('20260803');
  });

  test('파일명에도 시드가 들어간다 — 저장해 둔 카드에서 판을 복원할 수 있다', () => {
    const card = buildResultCard(input());
    expect(card.fileName).toContain('20260803');
    expect(card.fileName).toContain('R1');
    // 파일명에 공백·특수문자가 없어야 한다.
    expect(card.fileName).toMatch(/^[\w-]+$/);
  });

  test('자유 플레이 카드에도 시드가 있다', () => {
    expect(buildResultCard(input({ mode: 'free', seed: 7 })).shareLine).toContain('7');
  });
});

describe('경계 입력', () => {
  test('한 번도 매매하지 않았으면 적중률 대신 "매매 없음"', () => {
    const card = buildResultCard(input({ closeCount: 0 }));
    const stat = card.stats.find((s) => s.label === '적중률');
    expect(stat?.value).toBe('매매 없음');
    expect(stat?.tone).toBe('MUTED');
  });

  test('강제 청산은 있을 때만 실린다 — 0을 보여주면 잡음이다', () => {
    expect(buildResultCard(input()).stats.some((s) => s.label === '강제 청산')).toBe(false);
    const withLiq = buildResultCard(input({ liquidatedCount: 2 }));
    expect(withLiq.stats.find((s) => s.label === '강제 청산')?.value).toBe('2번');
    expect(withLiq.stats.find((s) => s.label === '강제 청산')?.tone).toBe('UP_ALLY');
  });

  test('본진 만피는 강조하고 아니면 하지 않는다', () => {
    expect(buildResultCard(input()).stats.find((s) => s.label === '본진')?.tone).toBe('GOLD');
    expect(
      buildResultCard(input({ remainingBaseHp: 40 })).stats.find((s) => s.label === '본진')?.tone,
    ).toBeUndefined();
  });

  test('본진 0에서도 던지지 않는다', () => {
    expect(() => buildResultCard(input({ remainingBaseHp: 0 }))).not.toThrow();
  });
});

describe('단일 출처 — 카드가 수치를 새로 계산하지 않는다', () => {
  test('자본금은 Settlement의 값을 그대로 쓴다', () => {
    const card = buildResultCard(input({ settlement: settlement({ capital: 1234 }) }));
    expect(card.stats.find((s) => s.label === '자본금')?.value).toBe('1234');
  });

  test('적중률도 Settlement에서 온다', () => {
    const card = buildResultCard(input({ settlement: settlement({ accuracy: 0.625 }) }));
    expect(card.stats.find((s) => s.label === '적중률')?.value).toBe('62.5%');
  });

  test('등급도 그대로 실린다', () => {
    expect(buildResultCard(input({ settlement: settlement({ grade: 'B' }) })).grade).toBe('B');
  });
});
