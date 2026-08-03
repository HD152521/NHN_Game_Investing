import { describe, expect, test } from 'vitest';

/**
 * 챌린지 모드 판정 — 시드 공유 · 일일 챌린지.
 *
 * 핵심은 **공정성 불변식**이다: 챌린지는 heat를 1로 고정해야 한다. 그렇지 않으면 같은
 * 시드라도 진도가 앞선 사람이 더 어려운 판을 받아, 랭킹이 조용히 불공정해진다.
 */
import {
  CHALLENGE_TERRITORIES,
  MAX_SEED,
  MIN_SEED,
  challengeLabelOf,
  challengeModeOf,
  dailyLabelFor,
  dailySeedFor,
  isValidSeed,
  parseSeedInput,
  shareLineOf,
} from './challenge';

const TODAY = new Date(2026, 7, 3); // 2026-08-03 (month는 0-based)

describe('★ 공정성 불변식 — 챌린지는 heat를 1로 고정한다', () => {
  test('점령 수가 0이다', () => {
    // 이 값을 바꾸면 진도가 앞선 사람이 같은 시드에서 더 어려운 판을 받는다
    // (heat = 1 + 점령 수 × 0.04). 랭킹 비교가 성립하지 않는다.
    expect(CHALLENGE_TERRITORIES).toBe(0);
  });
});

describe('dailySeedFor — 날짜 그대로 숫자로 쓴다', () => {
  test('2026-08-03 → 20260803', () => {
    expect(dailySeedFor(TODAY)).toBe(20260803);
  });

  test('한 자리 월·일도 자리를 지킨다', () => {
    expect(dailySeedFor(new Date(2026, 0, 9))).toBe(20260109);
  });

  test('날짜가 다르면 시드가 다르다 — 매일 새 판이 나온다', () => {
    const a = dailySeedFor(new Date(2026, 7, 3));
    const b = dailySeedFor(new Date(2026, 7, 4));
    expect(a).not.toBe(b);
  });

  test('같은 날짜면 항상 같은 시드다 — 전 유저가 같은 차트를 받는 근거', () => {
    expect(dailySeedFor(new Date(2026, 7, 3))).toBe(dailySeedFor(new Date(2026, 7, 3)));
  });

  test('시드가 유효 범위 안이다', () => {
    expect(isValidSeed(dailySeedFor(TODAY))).toBe(true);
  });
});

describe('dailyLabelFor — 시드만 보고 언제 판인지 읽힌다', () => {
  test('20260803 → 2026-08-03', () => {
    expect(dailyLabelFor(20260803)).toBe('2026-08-03');
  });

  test('한 자리 월·일에 0을 채운다', () => {
    expect(dailyLabelFor(20260109)).toBe('2026-01-09');
  });

  test('일일 시드가 아니면 null', () => {
    expect(dailyLabelFor(1)).toBeNull();
    expect(dailyLabelFor(42)).toBeNull();
  });

  test('월·일이 말이 안 되면 null', () => {
    expect(dailyLabelFor(20261301)).toBeNull(); // 13월
    expect(dailyLabelFor(20260800)).toBeNull(); // 0일
    expect(dailyLabelFor(20260832)).toBeNull(); // 32일
  });

  test('정수가 아니면 null', () => {
    expect(dailyLabelFor(20260803.5)).toBeNull();
  });
});

describe('isValidSeed', () => {
  test.each([
    ['경계 하한', MIN_SEED, true],
    ['경계 상한', MAX_SEED, true],
    ['0', 0, false],
    ['음수', -1, false],
    ['상한 초과', MAX_SEED + 1, false],
    ['소수', 1.5, false],
    ['NaN', Number.NaN, false],
    ['Infinity', Number.POSITIVE_INFINITY, false],
  ])('%s → %s', (_label, value, expected) => {
    expect(isValidSeed(value)).toBe(expected);
  });
});

describe('parseSeedInput — 카드에서 긁어 붙인 문자열이 그대로 먹혀야 한다', () => {
  test('숫자 문자열', () => {
    expect(parseSeedInput('20260803')).toBe(20260803);
  });

  test('★ 하이픈 날짜를 그대로 붙여도 먹는다 — 가장 흔한 사용법이다', () => {
    expect(parseSeedInput('2026-08-03')).toBe(20260803);
  });

  test('공백·쉼표를 허용한다', () => {
    expect(parseSeedInput('  2026 08 03 ')).toBe(20260803);
    expect(parseSeedInput('20,260,803')).toBe(20260803);
  });

  test.each([['빈 문자열', ''], ['공백만', '   '], ['글자', 'abc'], ['혼합', '2026a'], ['0', '0']])(
    '%s → null',
    (_label, raw) => {
      expect(parseSeedInput(raw)).toBeNull();
    },
  );

  test('범위를 넘으면 null', () => {
    expect(parseSeedInput('99999999999')).toBeNull();
  });
});

describe('challengeModeOf — 오늘 시드일 때만 daily다', () => {
  test('오늘 시드면 daily', () => {
    expect(challengeModeOf(20260803, TODAY, false)).toBe('daily');
  });

  test('★ 어제 시드를 손으로 넣은 판은 daily가 아니다 — 오늘 랭킹에 올라가면 안 된다', () => {
    expect(challengeModeOf(20260802, TODAY, true)).toBe('seed');
  });

  test('사용자가 고른 임의 시드는 seed', () => {
    expect(challengeModeOf(777, TODAY, true)).toBe('seed');
  });

  test('그냥 시작한 판은 free', () => {
    expect(challengeModeOf(1, TODAY, false)).toBe('free');
  });

  test('오늘 시드는 사용자가 직접 넣었어도 daily다 — 같은 판이면 같은 취급', () => {
    expect(challengeModeOf(20260803, TODAY, true)).toBe('daily');
  });
});

describe('문구 — 시드가 반드시 들어간다', () => {
  test('일일 챌린지는 날짜를 보여준다', () => {
    expect(challengeLabelOf('daily', 20260803)).toContain('2026-08-03');
  });

  test('시드 대결은 시드 번호를 보여준다', () => {
    expect(challengeLabelOf('seed', 777)).toContain('777');
  });

  test('자유 플레이도 시드를 숨기지 않는다 — 언제든 공유할 수 있어야 한다', () => {
    expect(challengeLabelOf('free', 42)).toContain('42');
  });

  test('★ 공유 문자열에는 항상 시드가 있다 — 받는 사람이 같은 판을 열 수 있어야 한다', () => {
    for (const mode of ['free', 'seed', 'daily'] as const) {
      expect(shareLineOf(mode, 20260803, 'R1')).toContain('20260803');
      expect(shareLineOf(mode, 20260803, 'R1')).toContain('R1');
    }
  });
});
