import { describe, expect, test } from 'vitest';

import type { Bar, ChartSet } from '../market';
import type { CodexCard } from './codex';
import {
  CODEX_CAPACITY,
  THUMBNAIL_BARS,
  buildCodexBodyMarkup,
  cardDescription,
  cardTitle,
  categoryOf,
  codexFilterFor,
  codexTotal,
  compressBars,
  dateLabelFromSeed,
  filterCards,
  formatChange,
  formatDuration,
  legendaryCount,
  mintCard,
  rarityOf,
  sortCards,
} from './codex';

function bar(t: number, o: number, c: number): Bar {
  return { t, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1000 };
}

/** 시가 100에서 시작해 종가 `end`로 선형 이동하는 `count`봉. */
function rampBars(count: number, start: number, end: number): Bar[] {
  const step = (end - start) / count;
  return Array.from({ length: count }, (_, i) => bar(i, start + step * i, start + step * (i + 1)));
}

function chartOf(bars: readonly Bar[], events: ChartSet['events'] = []): ChartSet {
  return {
    id: 'opaque',
    bars,
    sigma30: 0.4,
    archetype: 'range',
    events,
    volumeMultiple: 1.2,
  };
}

function cardOf(overrides: Partial<CodexCard> = {}): CodexCard {
  return {
    id: 'seed-R1',
    stageId: 'R1',
    seed: 1,
    grade: 'B',
    changeRate: 2,
    hasEvent: false,
    durationMs: 60_000,
    baseHp: 50,
    maxBaseHp: 100,
    accuracy: 0.6,
    bars: [{ o: 100, c: 102 }],
    ...overrides,
  };
}

describe('희귀도', () => {
  test('등급이 희귀도의 유일한 입력이다', () => {
    expect(rarityOf('S')).toBe('legendary');
    expect(rarityOf('A')).toBe('epic');
    expect(rarityOf('B')).toBe('rare');
    expect(rarityOf('C')).toBe('common');
  });
});

describe('분류', () => {
  test('시장 이벤트가 있으면 등락 방향과 무관하게 공시로 분류된다', () => {
    expect(categoryOf(cardOf({ hasEvent: true, changeRate: 12 }))).toBe('disclosure');
    expect(categoryOf(cardOf({ hasEvent: true, changeRate: -12 }))).toBe('disclosure');
  });

  test('이벤트가 없으면 등락 부호로 나뉜다', () => {
    expect(categoryOf(cardOf({ changeRate: 0.2 }))).toBe('surge');
    expect(categoryOf(cardOf({ changeRate: -0.2 }))).toBe('plunge');
  });

  test('경계값 0은 급등으로 떨어진다 (분류에 빈 구멍이 없어야 한다)', () => {
    expect(categoryOf(cardOf({ changeRate: 0 }))).toBe('surge');
  });
});

describe('제목 — 차트가 정한다', () => {
  test('등급이 달라도 같은 차트면 같은 제목이다', () => {
    const s = cardOf({ grade: 'S', changeRate: 29.8 });
    const c = cardOf({ grade: 'C', changeRate: 29.8 });
    expect(cardTitle(s)).toBe(cardTitle(c));
  });

  test('목업 네 장의 제목이 규칙에서 그대로 나온다', () => {
    expect(cardTitle(cardOf({ changeRate: 29.8 }))).toBe('상한가의 날');
    expect(cardTitle(cardOf({ changeRate: -18.2, hasEvent: true }))).toBe('패닉 셀');
    expect(cardTitle(cardOf({ changeRate: 6.4 }))).toBe('완만한 회복');
    expect(cardTitle(cardOf({ changeRate: 0.3 }))).toBe('보합');
  });

  test('상승 이벤트는 FOMO 랠리다', () => {
    expect(cardTitle(cardOf({ changeRate: 8, hasEvent: true }))).toBe('FOMO 랠리');
  });
});

describe('설명 — 플레이가 정한다', () => {
  test('무피해 방어가 가장 먼저 읽힌다', () => {
    expect(cardDescription(cardOf({ baseHp: 100, maxBaseHp: 100 }))).toContain('한 번도 내주지 않고');
  });

  test('체력이 거의 없으면 남은 수치를 그대로 말한다', () => {
    expect(cardDescription(cardOf({ baseHp: 4, maxBaseHp: 100 }))).toBe(
      '사옥 체력 4를 남기고 버텼다.',
    );
  });

  test('적중률이 높으면 정확했다고 말한다', () => {
    expect(cardDescription(cardOf({ baseHp: 61, accuracy: 0.946 }))).toBe('지루했지만 정확했던 하루.');
  });

  test('보합이면 아무 일도 없었다고 말한다', () => {
    expect(cardDescription(cardOf({ baseHp: 88, accuracy: 0.6, changeRate: 0.3 }))).toBe(
      '아무 일도 일어나지 않았다.',
    );
  });
});

describe('합성 날짜', () => {
  test('같은 시드는 항상 같은 날짜다', () => {
    expect(dateLabelFromSeed(4321)).toBe(dateLabelFromSeed(4321));
  });

  test('YYYY.MM.DD 형식이며 월·일이 달력 범위 안이다', () => {
    for (const seed of [0, 1, 7, 99, 1234, 999_999]) {
      const label = dateLabelFromSeed(seed);
      expect(label).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
      const parts = label.split('.').map(Number);
      expect(parts[1]).toBeGreaterThanOrEqual(1);
      expect(parts[1]).toBeLessThanOrEqual(12);
      expect(parts[2]).toBeGreaterThanOrEqual(1);
      expect(parts[2]).toBeLessThanOrEqual(28);
    }
  });

  test('음수 시드에도 형식이 무너지지 않는다', () => {
    expect(dateLabelFromSeed(-42)).toMatch(/^\d{4}\.\d{2}\.\d{2}$/);
  });
});

describe('표시 포맷', () => {
  test('경과 시간은 MM:SS다', () => {
    expect(formatDuration(492_000)).toBe('08:12');
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(-5)).toBe('00:00');
  });

  test('등락률은 부호를 항상 붙인다', () => {
    expect(formatChange(29.84)).toBe('+29.8%');
    expect(formatChange(-18.24)).toBe('-18.2%');
    expect(formatChange(0)).toBe('+0.0%');
  });
});

describe('봉 압축', () => {
  test('요청한 개수만큼 나오고 방향이 보존된다', () => {
    const compressed = compressBars(rampBars(390, 100, 130));
    expect(compressed).toHaveLength(THUMBNAIL_BARS);
    // 단조 상승 차트라 모든 구간이 상승이어야 한다.
    for (const item of compressed) {
      expect(item.c).toBeGreaterThan(item.o);
    }
  });

  test('빈 입력에도 던지지 않는다', () => {
    expect(compressBars([])).toEqual([]);
    expect(compressBars(rampBars(10, 100, 110), 0)).toEqual([]);
  });

  test('봉보다 압축 개수가 많아도 던지지 않는다', () => {
    expect(compressBars(rampBars(3, 100, 110), 9).length).toBeGreaterThan(0);
  });
});

describe('카드 생성', () => {
  const chart = chartOf(rampBars(390, 100, 130));

  test('ID는 시드와 지역으로만 결정된다 — 같은 판을 다시 깨도 같은 카드다', () => {
    const first = mintCard({
      stageId: 'R1',
      seed: 7,
      grade: 'S',
      chart,
      durationMs: 1000,
      baseHp: 100,
      maxBaseHp: 100,
      accuracy: 0.9,
    });
    const second = mintCard({
      stageId: 'R1',
      seed: 7,
      grade: 'C',
      chart,
      durationMs: 9999,
      baseHp: 1,
      maxBaseHp: 100,
      accuracy: 0.1,
    });
    expect(first.id).toBe(second.id);
  });

  test('등락률은 changePercent에서 온다 (직접 계산하지 않는다)', () => {
    const card = mintCard({
      stageId: 'R1',
      seed: 1,
      grade: 'A',
      chart,
      durationMs: 1000,
      baseHp: 50,
      maxBaseHp: 100,
      accuracy: 0.5,
    });
    expect(card.changeRate).toBeCloseTo(30, 0);
  });

  test('이벤트가 있는 차트는 hasEvent가 선다', () => {
    const withEvent = chartOf(rampBars(390, 100, 90), [{ atMs: 1000, kind: 'panic_sell' }]);
    const card = mintCard({
      stageId: 'R2',
      seed: 2,
      grade: 'B',
      chart: withEvent,
      durationMs: 1000,
      baseHp: 10,
      maxBaseHp: 100,
      accuracy: 0.5,
    });
    expect(card.hasEvent).toBe(true);
    expect(categoryOf(card)).toBe('disclosure');
  });

  test('범위를 벗어난 입력을 정규화한다', () => {
    const card = mintCard({
      stageId: 'R1',
      seed: 1,
      grade: 'C',
      chart,
      durationMs: -500,
      baseHp: -10,
      maxBaseHp: 0,
      accuracy: 5,
    });
    expect(card.durationMs).toBe(0);
    expect(card.baseHp).toBe(0);
    expect(card.maxBaseHp).toBe(1);
    expect(card.accuracy).toBe(1);
  });
});

describe('컬렉션 질의', () => {
  const cards: readonly CodexCard[] = [
    cardOf({ id: 'a', seed: 1, grade: 'C', changeRate: 1 }),
    cardOf({ id: 'b', seed: 2, grade: 'S', changeRate: -5 }),
    cardOf({ id: 'c', seed: 3, grade: 'A', hasEvent: true }),
    cardOf({ id: 'd', seed: 4, grade: 'S', changeRate: 9 }),
  ];

  test('정원은 하한이지 상한이 아니다 — 넘치면 분모가 올라간다', () => {
    expect(codexTotal(cards)).toBe(CODEX_CAPACITY);
    const many = Array.from({ length: CODEX_CAPACITY + 5 }, (_, i) => cardOf({ id: `x${i}` }));
    expect(codexTotal(many)).toBe(CODEX_CAPACITY + 5);
  });

  test('전설 수를 센다', () => {
    expect(legendaryCount(cards)).toBe(2);
  });

  test('필터가 분류와 일치한다', () => {
    expect(filterCards(cards, 'all')).toHaveLength(4);
    expect(filterCards(cards, 'disclosure')).toHaveLength(1);
    expect(filterCards(cards, 'plunge')).toHaveLength(1);
    expect(filterCards(cards, 'surge')).toHaveLength(2);
  });

  test('희귀도 내림차순, 같으면 최근 시드 먼저', () => {
    const sorted = sortCards(cards);
    expect(sorted.map((card) => card.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  test('정렬이 입력 배열을 변형하지 않는다', () => {
    const input = [...cards];
    sortCards(input);
    expect(input.map((card) => card.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('모르는 필터 값은 전체로 떨어진다', () => {
    expect(codexFilterFor('surge')).toBe('surge');
    expect(codexFilterFor('nope')).toBe('all');
    expect(codexFilterFor(undefined)).toBe('all');
  });
});

describe('마크업', () => {
  test('빈 도감에도 그리드가 서고 안내 문구가 나온다', () => {
    const html = buildCodexBodyMarkup([]);
    expect(html).toContain('수집 0 / 120');
    expect(html).toContain('첫 클리어로 획득');
  });

  test('선택된 탭만 aria-pressed=true다', () => {
    const html = buildCodexBodyMarkup([], { filter: 'plunge' });
    expect(html).toContain('data-filter="plunge"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  test('카드의 수치가 전부 화면에 나온다', () => {
    const html = buildCodexBodyMarkup([
      cardOf({ grade: 'S', changeRate: 29.8, durationMs: 492_000, baseHp: 4, accuracy: 0.881 }),
    ]);
    expect(html).toContain('LEGENDARY');
    expect(html).toContain('+29.8%');
    expect(html).toContain('08:12');
    expect(html).toContain('4 / 100');
    expect(html).toContain('88.1%');
    expect(html).toContain('RANK S');
  });

  test('썸네일 봉 개수가 카드의 봉 수와 같다', () => {
    const card = cardOf({ bars: [{ o: 1, c: 2 }, { o: 2, c: 1 }, { o: 1, c: 3 }] });
    const html = buildCodexBodyMarkup([card]);
    expect(html.match(/class="codex-bar/g)).toHaveLength(3);
  });

  test('봉 값이 모두 같아도 높이 계산이 터지지 않는다 (0으로 나누기)', () => {
    const card = cardOf({ bars: [{ o: 100, c: 100 }, { o: 100, c: 100 }] });
    const html = buildCodexBodyMarkup([card]);
    expect(html).not.toContain('NaN');
  });
});
