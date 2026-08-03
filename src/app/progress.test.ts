import { describe, expect, test } from 'vitest';

/**
 * 진행도 저장 검증.
 *
 * 대부분이 **손상 입력** 테스트다. 이 모듈의 실패 모드는 "저장이 안 된다"가 아니라
 * **"잘못된 값을 읽고도 성공했다고 판단한다"**이기 때문이다(§15-7이 경고한 바로 그것).
 * 저장소 접근은 가짜 `ProgressStorage`로 주입해 node 환경에서 돈다 — jsdom 불필요.
 */
import {
  PROGRESS_STORAGE_KEY,
  PROGRESS_VERSION,
  clearedCount,
  emptyProgress,
  hasCleared,
  loadProgress,
  parseProgress,
  recordCard,
  recordCleared,
  saveProgress,
  serializeProgress,
  withCard,
  withCleared,
} from './progress';
import type { GameProgress, ProgressStorage } from './progress';
import type { CodexCard } from './codex';

/** 메모리 저장소. `throwOn`으로 차단된 환경(프라이빗 모드·용량 초과)을 흉내 낸다. */
function fakeStorage(
  initial: string | null = null,
  throwOn: 'none' | 'get' | 'set' = 'none',
): ProgressStorage & { value: string | null } {
  return {
    value: initial,
    getItem(key) {
      if (throwOn === 'get') throw new Error('저장소 차단');
      return key === PROGRESS_STORAGE_KEY ? this.value : null;
    },
    setItem(key, next) {
      if (throwOn === 'set') throw new Error('용량 초과');
      if (key === PROGRESS_STORAGE_KEY) this.value = next;
    },
  };
}

const valid = (cleared: readonly string[], capital = 0): string =>
  JSON.stringify({ version: PROGRESS_VERSION, clearedStages: cleared, carriedCapital: capital });

describe('parseProgress — 손상 입력은 전부 빈 진행도로 떨어진다', () => {
  test.each([
    ['null', null],
    ['undefined', undefined],
    ['빈 문자열', ''],
    ['깨진 JSON', '{clearedStages:'],
    ['JSON이지만 객체가 아님 — 숫자', '42'],
    ['JSON이지만 객체가 아님 — 배열', '["R1"]'],
    ['JSON null', 'null'],
    ['버전 없음', JSON.stringify({ clearedStages: ['R1'] })],
    ['알 수 없는 버전', JSON.stringify({ version: 999, clearedStages: ['R1'] })],
    ['버전이 문자열', JSON.stringify({ version: '1', clearedStages: ['R1'] })],
  ])('%s → 빈 진행도 (던지지 않는다)', (_label, raw) => {
    expect(() => parseProgress(raw)).not.toThrow();
    expect(parseProgress(raw)).toEqual(emptyProgress());
  });

  test('★ 알 수 없는 버전은 읽지 않는다 — 진행도를 잃는 편이 잘못된 진행도보다 낫다', () => {
    // 버전만 다르고 내용은 멀쩡해 보여도 신뢰하지 않는다.
    const raw = JSON.stringify({ version: PROGRESS_VERSION + 1, clearedStages: ['R1', 'R2'] });
    expect(parseProgress(raw).clearedStages).toEqual([]);
  });
});

describe('parseProgress — 버전이 맞아도 필드를 다시 검사한다', () => {
  test('모르는 지역 ID는 걸러낸다', () => {
    expect(parseProgress(valid(['R1', 'R99', 'nope'])).clearedStages).toEqual(['R1']);
  });

  test('중복은 제거된다', () => {
    expect(parseProgress(valid(['R1', 'R1', 'R1'])).clearedStages).toEqual(['R1']);
  });

  test('clearedStages가 배열이 아니면 빈 목록으로 본다', () => {
    const raw = JSON.stringify({ version: PROGRESS_VERSION, clearedStages: 'R1' });
    expect(parseProgress(raw).clearedStages).toEqual([]);
  });

  test('지역 아닌 타입(숫자·객체·null)이 섞여 있어도 던지지 않는다', () => {
    const raw = JSON.stringify({
      version: PROGRESS_VERSION,
      clearedStages: [1, null, { id: 'R1' }, 'R1'],
    });
    expect(parseProgress(raw).clearedStages).toEqual(['R1']);
  });

  test.each([
    ['음수', -100],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['문자열', '1000'],
    ['없음', undefined],
  ])('carriedCapital %s → 0', (_label, capital) => {
    const raw = JSON.stringify({
      version: PROGRESS_VERSION,
      clearedStages: [],
      carriedCapital: capital,
    });
    expect(parseProgress(raw).carriedCapital).toBe(0);
  });

  test('carriedCapital 소수는 내림한다 — 골드는 정수 재화다', () => {
    expect(parseProgress(valid([], 1200.9)).carriedCapital).toBe(1200);
  });
});

describe('직렬화 왕복', () => {
  test('저장했다 읽으면 같은 진행도가 나온다', () => {
    const progress: GameProgress = { clearedStages: ['R1', 'R2'], carriedCapital: 1200, tutorialSeen: false, codexCards: [] };
    expect(parseProgress(serializeProgress(progress))).toEqual(progress);
  });

  test('같은 진행도는 항상 같은 문자열이 된다 — 순서가 고정돼 있다', () => {
    const a = withCleared(withCleared(emptyProgress(), 'R2'), 'R1');
    const b = withCleared(withCleared(emptyProgress(), 'R1'), 'R2');
    expect(serializeProgress(a)).toBe(serializeProgress(b));
  });

  test('직렬화 결과에 버전이 실린다', () => {
    expect(JSON.parse(serializeProgress(emptyProgress()))).toHaveProperty(
      'version',
      PROGRESS_VERSION,
    );
  });
});

describe('withCleared — 불변', () => {
  test('원본을 변형하지 않는다', () => {
    const before = emptyProgress();
    const after = withCleared(before, 'R1');
    expect(before.clearedStages).toEqual([]);
    expect(after.clearedStages).toEqual(['R1']);
  });

  test('이미 클리어한 지역이면 같은 참조를 돌려준다 — 불필요한 저장을 막는다', () => {
    const once = withCleared(emptyProgress(), 'R1');
    expect(withCleared(once, 'R1')).toBe(once);
  });

  test('carriedCapital은 보존된다', () => {
    const base: GameProgress = { clearedStages: [], carriedCapital: 500, tutorialSeen: false, codexCards: [] };
    expect(withCleared(base, 'R1').carriedCapital).toBe(500);
  });
});

describe('hasCleared · clearedCount', () => {
  test('클리어 여부와 점령 수를 센다 (heat 입력)', () => {
    const progress = withCleared(withCleared(emptyProgress(), 'R1'), 'R2');
    expect(hasCleared(progress, 'R1')).toBe(true);
    expect(hasCleared(progress, 'R3')).toBe(false);
    expect(clearedCount(progress)).toBe(2);
  });

  test('빈 진행도의 점령 수는 0 — heat가 1이 된다', () => {
    expect(clearedCount(emptyProgress())).toBe(0);
  });
});

describe('저장소 배선 — 어떤 실패에도 던지지 않는다', () => {
  test('저장소가 없으면(null) 빈 진행도이고 저장은 false다', () => {
    expect(loadProgress(null)).toEqual(emptyProgress());
    expect(saveProgress(emptyProgress(), null)).toBe(false);
  });

  test('getItem이 던지는 환경에서도 빈 진행도로 떨어진다', () => {
    const storage = fakeStorage(valid(['R1']), 'get');
    expect(() => loadProgress(storage)).not.toThrow();
    expect(loadProgress(storage)).toEqual(emptyProgress());
  });

  test('setItem이 던지는 환경에서도 false만 돌려준다', () => {
    const storage = fakeStorage(null, 'set');
    expect(() => saveProgress(emptyProgress(), storage)).not.toThrow();
    expect(saveProgress(emptyProgress(), storage)).toBe(false);
  });

  test('정상 저장소에서는 읽고 쓴다', () => {
    const storage = fakeStorage();
    expect(
      saveProgress(
        { clearedStages: ['R1'], carriedCapital: 0, tutorialSeen: false, codexCards: [] },
        storage,
      ),
    ).toBe(true);
    expect(loadProgress(storage).clearedStages).toEqual(['R1']);
  });
});

describe('recordCleared — 셸이 쓰는 진입점', () => {
  test('클리어를 저장하고 갱신된 진행도를 돌려준다', () => {
    const storage = fakeStorage();
    expect(recordCleared('R1', storage).clearedStages).toEqual(['R1']);
    expect(loadProgress(storage).clearedStages).toEqual(['R1']);
  });

  test('누적된다 — 앞서 클리어한 지역을 지우지 않는다', () => {
    const storage = fakeStorage();
    recordCleared('R1', storage);
    expect(recordCleared('R2', storage).clearedStages).toEqual(['R1', 'R2']);
  });

  test('★ 저장에 실패해도 그 판 안에서는 잠금 해제가 보인다', () => {
    const storage = fakeStorage(null, 'set');
    // 저장은 실패하지만 반환값은 갱신돼 있어야 한다 — 새로고침 전까지는 열려 보인다.
    expect(recordCleared('R1', storage).clearedStages).toEqual(['R1']);
  });

  test('손상된 기존 저장을 덮어써도 던지지 않는다', () => {
    const storage = fakeStorage('{깨짐');
    expect(() => recordCleared('R1', storage)).not.toThrow();
    expect(loadProgress(storage).clearedStages).toEqual(['R1']);
  });
});

// ── 도감 카드 저장 ────────────────────────────────────────────

/** 카드 픽스처. 손상 입력 테스트가 필드를 하나씩 무너뜨리는 기준점이다. */
function card(overrides: Partial<CodexCard> = {}): CodexCard {
  return {
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
    ...overrides,
  };
}

describe('도감 카드 — 불변 추가', () => {
  test('새 카드는 뒤에 붙는다', () => {
    const next = withCard(emptyProgress(), card());
    expect(next.codexCards).toHaveLength(1);
  });

  test('★ 같은 ID면 같은 참조를 돌려준다 — 같은 판을 다시 깨도 도감이 늘지 않는다', () => {
    const first = withCard(emptyProgress(), card());
    const second = withCard(first, card({ grade: 'C' }));
    expect(second).toBe(first);
  });

  test('원본 진행도를 변형하지 않는다', () => {
    const base = emptyProgress();
    withCard(base, card());
    expect(base.codexCards).toHaveLength(0);
  });

  test('다른 지역에서 같은 시드면 다른 카드다', () => {
    const next = withCard(withCard(emptyProgress(), card()), card({ id: '7-R2', stageId: 'R2' }));
    expect(next.codexCards).toHaveLength(2);
  });
});

describe('도감 카드 — 직렬화 왕복', () => {
  test('카드가 왕복해도 값이 보존된다', () => {
    const progress = withCard(emptyProgress(), card());
    expect(parseProgress(serializeProgress(progress))).toEqual(progress);
  });

  test('빈 도감도 왕복한다', () => {
    expect(parseProgress(serializeProgress(emptyProgress())).codexCards).toEqual([]);
  });
});

describe('도감 카드 — 손상 입력', () => {
  function parseCards(cards: unknown): readonly CodexCard[] {
    return parseProgress(
      JSON.stringify({ version: PROGRESS_VERSION, clearedStages: [], codexCards: cards }),
    ).codexCards;
  }

  test('배열이 아니면 빈 도감으로 떨어진다', () => {
    expect(parseCards('not-an-array')).toEqual([]);
    expect(parseCards(null)).toEqual([]);
    expect(parseCards(42)).toEqual([]);
  });

  test('구 포맷(필드 없음)은 빈 도감이다 — 진행도 전체가 날아가지 않는다', () => {
    const raw = JSON.stringify({
      version: PROGRESS_VERSION,
      clearedStages: ['R1'],
      carriedCapital: 0,
      tutorialSeen: true,
    });
    const progress = parseProgress(raw);
    expect(progress.codexCards).toEqual([]);
    expect(progress.clearedStages).toEqual(['R1']);
    expect(progress.tutorialSeen).toBe(true);
  });

  test('ID·지역·등급이 없는 카드는 버린다 — 나머지는 살린다', () => {
    const cards = parseCards([
      card(),
      { ...card({ id: 'x-R1' }), id: '' },
      { ...card({ id: 'y-R1' }), stageId: 'ZZ' },
      { ...card({ id: 'z-R1' }), grade: 'X' },
      'garbage',
      null,
    ]);
    expect(cards.map((entry) => entry.id)).toEqual(['7-R1']);
  });

  test('★ NaN·undefined 수치가 화면 계산식까지 흘러가지 않는다', () => {
    const cards = parseCards([
      { ...card(), durationMs: 'nope', baseHp: undefined, maxBaseHp: 0, accuracy: 99, seed: NaN },
    ]);
    const only = cards[0];
    expect(only?.durationMs).toBe(0);
    expect(only?.baseHp).toBe(0);
    expect(only?.maxBaseHp).toBe(1); // 0으로 나누기를 막는 하한
    expect(only?.accuracy).toBe(1);
    expect(only?.seed).toBe(0);
  });

  test('손상된 봉은 개별로 걸러진다', () => {
    const cards = parseCards([{ ...card(), bars: [{ o: 1, c: 2 }, { o: 'x', c: 2 }, null, 5] }]);
    expect(cards[0]?.bars).toEqual([{ o: 1, c: 2 }]);
  });

  test('중복 ID는 먼저 온 것만 남는다', () => {
    const cards = parseCards([card({ grade: 'S' }), card({ grade: 'C' })]);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.grade).toBe('S');
  });
});

describe('도감 카드 — 저장 진입점', () => {
  test('처음 얻으면 isNew가 참이고 저장된다', () => {
    const storage = fakeStorage();
    const result = recordCard(card(), storage);
    expect(result.isNew).toBe(true);
    expect(loadProgress(storage).codexCards).toHaveLength(1);
  });

  test('이미 가진 카드면 isNew가 거짓이다', () => {
    const storage = fakeStorage();
    recordCard(card(), storage);
    expect(recordCard(card(), storage).isNew).toBe(false);
  });

  test('저장이 막힌 환경에서도 던지지 않고 그 판 안에서는 보인다', () => {
    const storage = fakeStorage(null, 'set');
    const result = recordCard(card(), storage);
    expect(result.isNew).toBe(true);
    expect(result.progress.codexCards).toHaveLength(1);
  });

  test('클리어 기록과 카드 획득이 서로를 지우지 않는다', () => {
    const storage = fakeStorage();
    recordCleared('R1', storage);
    recordCard(card(), storage);
    const progress = loadProgress(storage);
    expect(progress.clearedStages).toEqual(['R1']);
    expect(progress.codexCards).toHaveLength(1);
  });
});
