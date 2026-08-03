import { describe, expect, test } from 'vitest';

import { countTowerFires, diffCombatEvents, prepTickIndex, soundForEvent } from './events';
import type { CombatAudioFrame, DyingEntity, GameEvent } from './types';

/**
 * 이벤트 → 소리 매핑은 **순수 함수**다. `AudioContext` 없이 전부 검증된다 —
 * 이 파일이 그 사실의 증거다(node 환경, 브라우저 API 0회 호출).
 */

const NO_DEATHS: readonly DyingEntity[] = [];

function frame(overrides: Partial<CombatAudioFrame> = {}): CombatAudioFrame {
  return { towers: [], hasBoss: false, baseHp: 100, wave: 1, ...overrides };
}

describe('soundForEvent — 매매', () => {
  test('진입은 trade-open', () => {
    expect(soundForEvent({ kind: 'trade-open' })).toBe('trade-open');
  });

  test('추가매수는 진입과 다른 소리다', () => {
    expect(soundForEvent({ kind: 'trade-add' })).toBe('trade-add');
  });

  test('이익 청산과 손실 청산이 갈린다', () => {
    expect(soundForEvent({ kind: 'trade-close', pnl: 40, reason: 'manual' })).toBe(
      'trade-close-profit',
    );
    expect(soundForEvent({ kind: 'trade-close', pnl: -40, reason: 'manual' })).toBe(
      'trade-close-loss',
    );
  });

  test('손익 0은 이익이 아니다 — 손실 쪽으로 간다', () => {
    expect(soundForEvent({ kind: 'trade-close', pnl: 0, reason: 'manual' })).toBe(
      'trade-close-loss',
    );
  });

  test('★ 강제 청산은 손익과 무관하게 경고음이다', () => {
    // reason을 pnl보다 먼저 보지 않으면 경고음이 영영 나지 않는다.
    expect(soundForEvent({ kind: 'trade-close', pnl: -100, reason: 'liquidated' })).toBe(
      'trade-liquidated',
    );
    expect(soundForEvent({ kind: 'trade-close', pnl: 10, reason: 'liquidated' })).toBe(
      'trade-liquidated',
    );
  });

  test('장 마감 강제 청산(stage-end)은 일반 청산음이다 — 경고가 아니다', () => {
    expect(soundForEvent({ kind: 'trade-close', pnl: 12, reason: 'stage_end' })).toBe(
      'trade-close-profit',
    );
  });
});

describe('soundForEvent — 스킬 3종은 서로 다른 소리다', () => {
  test.each([
    ['S-01', 'skill-bomb'],
    ['S-02', 'skill-heal'],
    ['S-03', 'skill-shield'],
  ] as const)('%s → %s', (skill, expected) => {
    expect(soundForEvent({ kind: 'skill-cast', skill })).toBe(expected);
  });

  test('AUM을 태우는 S-03은 나머지 둘과 다른 소리다', () => {
    const shield = soundForEvent({ kind: 'skill-cast', skill: 'S-03' });
    expect(shield).not.toBe(soundForEvent({ kind: 'skill-cast', skill: 'S-01' }));
    expect(shield).not.toBe(soundForEvent({ kind: 'skill-cast', skill: 'S-02' }));
  });
});

describe('soundForEvent — 전투·흐름', () => {
  test('보스 처치는 일반 처치와 다른 소리다', () => {
    expect(soundForEvent({ kind: 'enemy-down', boss: false })).toBe('enemy-down');
    expect(soundForEvent({ kind: 'enemy-down', boss: true })).toBe('boss-down');
  });

  test('실드가 막아 피해가 0이면 본진 피격음이 나지 않는다', () => {
    expect(soundForEvent({ kind: 'base-hit', damage: 0 })).toBeNull();
    expect(soundForEvent({ kind: 'base-hit', damage: 9 })).toBe('base-hit');
  });

  test('결말 3종 — unresolved는 패배와 같은 소리다', () => {
    expect(soundForEvent({ kind: 'stage-end', outcome: 'cleared' })).toBe('stage-cleared');
    expect(soundForEvent({ kind: 'stage-end', outcome: 'defeated' })).toBe('stage-defeated');
    expect(soundForEvent({ kind: 'stage-end', outcome: 'unresolved' })).toBe('stage-defeated');
  });

  test('모든 이벤트 종류가 매핑되거나 명시적으로 null이다', () => {
    const all: readonly GameEvent[] = [
      { kind: 'trade-open' },
      { kind: 'trade-add' },
      { kind: 'trade-close', pnl: 1, reason: 'manual' },
      { kind: 'tower-build' },
      { kind: 'tower-upgrade' },
      { kind: 'unit-summon' },
      { kind: 'tower-fire' },
      { kind: 'enemy-down', boss: false },
      { kind: 'base-hit', damage: 1 },
      { kind: 'skill-cast', skill: 'S-01' },
      { kind: 'wave-start', wave: 1 },
      { kind: 'boss-appear' },
      { kind: 'prep-tick' },
      { kind: 'stage-end', outcome: 'cleared' },
    ];
    for (const event of all) {
      expect(() => soundForEvent(event)).not.toThrow();
    }
  });
});

describe('countTowerFires — 쿨다운 증가가 곧 발사다', () => {
  test('쿨다운이 되채워진 슬롯을 센다', () => {
    const before = frame({
      towers: [
        { slot: 0, cooldownMs: 120 },
        { slot: 1, cooldownMs: 300 },
      ],
    });
    const after = frame({
      towers: [
        { slot: 0, cooldownMs: 700 }, // 쐈다
        { slot: 1, cooldownMs: 280 }, // 식는 중
      ],
    });
    expect(countTowerFires(before, after)).toBe(1);
  });

  test('전부 식기만 하면 0이다', () => {
    const before = frame({ towers: [{ slot: 0, cooldownMs: 500 }] });
    const after = frame({ towers: [{ slot: 0, cooldownMs: 420 }] });
    expect(countTowerFires(before, after)).toBe(0);
  });

  test('새로 지은 타워는 발사로 세지 않는다', () => {
    const before = frame({ towers: [] });
    const after = frame({ towers: [{ slot: 2, cooldownMs: 700 }] });
    expect(countTowerFires(before, after)).toBe(0);
  });

  test('여러 기가 동시에 쏘면 그만큼 센다', () => {
    const before = frame({
      towers: [
        { slot: 0, cooldownMs: 0 },
        { slot: 1, cooldownMs: 0 },
        { slot: 2, cooldownMs: 0 },
      ],
    });
    const after = frame({
      towers: [
        { slot: 0, cooldownMs: 700 },
        { slot: 1, cooldownMs: 900 },
        { slot: 2, cooldownMs: 0 },
      ],
    });
    expect(countTowerFires(before, after)).toBe(2);
  });
});

describe('diffCombatEvents — 전부 상태의 차분이다', () => {
  test('★ 아무 일도 없으면 같은 빈 배열 참조를 돌려준다 (프레임당 할당 0)', () => {
    const before = frame({ towers: [{ slot: 0, cooldownMs: 300 }] });
    const after = frame({ towers: [{ slot: 0, cooldownMs: 260 }] });
    const first = diffCombatEvents(before, after, NO_DEATHS);
    const second = diffCombatEvents(before, after, NO_DEATHS);
    expect(first).toHaveLength(0);
    expect(first).toBe(second);
  });

  test('보스 등장은 없다가 생겼을 때 한 번만 난다', () => {
    const before = frame({ hasBoss: false });
    const after = frame({ hasBoss: true });
    expect(diffCombatEvents(before, after, NO_DEATHS)).toEqual([{ kind: 'boss-appear' }]);
    // 이미 있으면 다시 나지 않는다.
    expect(diffCombatEvents(after, after, NO_DEATHS)).toHaveLength(0);
  });

  test('웨이브 번호 증가가 웨이브 시작이다', () => {
    expect(diffCombatEvents(frame({ wave: 2 }), frame({ wave: 3 }), NO_DEATHS)).toEqual([
      { kind: 'wave-start', wave: 3 },
    ]);
  });

  test('본진 HP 감소분이 곧 피격 피해다', () => {
    expect(diffCombatEvents(frame({ baseHp: 100 }), frame({ baseHp: 94 }), NO_DEATHS)).toEqual([
      { kind: 'base-hit', damage: 6 },
    ]);
  });

  test('★ 실드가 막아 HP가 그대로면 피격음이 없다', () => {
    expect(diffCombatEvents(frame({ baseHp: 70 }), frame({ baseHp: 70 }), NO_DEATHS)).toHaveLength(
      0,
    );
  });

  test('★ 판이 새로 시작될 때(HP 회복·웨이브 리셋) 가짜 소리가 나지 않는다', () => {
    // 이전 판: 웨이브 13 / HP 12. 새 판: 웨이브 0 / HP 100.
    const ended = frame({ wave: 13, baseHp: 12, towers: [{ slot: 0, cooldownMs: 400 }] });
    const fresh = frame({ wave: 0, baseHp: 100, towers: [] });
    expect(diffCombatEvents(ended, fresh, NO_DEATHS)).toHaveLength(0);
  });

  test('아군 유닛의 죽음은 소리를 내지 않는다 (소모품이라 전황이 안 읽힌다)', () => {
    const out = diffCombatEvents(frame(), frame(), [
      { kind: 'unit' },
      { kind: 'enemy' },
      { kind: 'boss' },
    ]);
    expect(out).toEqual([
      { kind: 'enemy-down', boss: false },
      { kind: 'enemy-down', boss: true },
    ]);
  });

  test('★ 순서 — 드물고 중요한 것이 앞, 잦은 것이 뒤다', () => {
    const before = frame({
      towers: [{ slot: 0, cooldownMs: 0 }],
      hasBoss: false,
      wave: 12,
      baseHp: 100,
    });
    const after = frame({
      towers: [{ slot: 0, cooldownMs: 700 }],
      hasBoss: true,
      wave: 13,
      baseHp: 91,
    });
    const kinds = diffCombatEvents(before, after, [{ kind: 'enemy' }]).map((event) => event.kind);

    expect(kinds).toEqual(['boss-appear', 'wave-start', 'base-hit', 'enemy-down', 'tower-fire']);
  });

  test('억제는 여기서 하지 않는다 — 죽은 수만큼 그대로 낸다', () => {
    const deaths = Array.from({ length: 14 }, () => ({ kind: 'enemy' as const }));
    const out = diffCombatEvents(frame(), frame(), deaths);
    expect(out).toHaveLength(14);
  });
});

describe('prepTickIndex — 초 눈금', () => {
  test('남은 시간을 올림한다', () => {
    expect(prepTickIndex(5_000)).toBe(5);
    expect(prepTickIndex(4_300)).toBe(5);
    expect(prepTickIndex(4_000)).toBe(4);
    expect(prepTickIndex(1)).toBe(1);
  });

  test('준비 구간이 아니면 0이다', () => {
    expect(prepTickIndex(0)).toBe(0);
    expect(prepTickIndex(-100)).toBe(0);
    expect(prepTickIndex(Number.NaN)).toBe(0);
  });

  test('★ 눈금이 바뀌는 횟수가 준비 5초 동안 정확히 5다', () => {
    // 60FPS로 5초를 훑으며 눈금이 바뀐 횟수를 센다 — 프레임 수(300)가 아니라 5여야 한다.
    let previous = 0;
    let ticks = 0;
    for (let frameIndex = 0; frameIndex <= 300; frameIndex += 1) {
      const remaining = 5_000 - frameIndex * (1_000 / 60);
      const index = prepTickIndex(remaining);
      if (index !== previous && index > 0) ticks += 1;
      previous = index;
    }
    expect(ticks).toBe(5);
  });
});
