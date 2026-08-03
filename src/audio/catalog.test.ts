import { describe, expect, test } from 'vitest';

import { SOUND_IDS, SOUND_SPECS, soundDurationMs } from './catalog';
import { soundForEvent } from './events';
import type { GameEvent, GameSoundId } from './types';

/**
 * 카탈로그 가드 — **톤 규율을 테스트로 고정한다.**
 *
 * `src/design/no-hardcoded-hex.test.ts`가 팔레트 규율을 지키듯, 이 파일이 사운드 규율을
 * 지킨다. 소리를 추가하다 보면 "이번 것만 좀 더 크게/길게"가 쌓여 파이낸셜 느와르가 아니라
 * 게임기 소리가 된다. 그 드리프트를 여기서 막는다.
 */

const ALL_SPECS = SOUND_IDS.map((id) => SOUND_SPECS[id]);

describe('카탈로그 무결성', () => {
  test('키와 spec.id가 일치한다 (복붙 사고 방지)', () => {
    for (const id of SOUND_IDS) {
      expect(SOUND_SPECS[id].id).toBe(id);
    }
  });

  test('모든 소리에 레이어가 최소 하나 있다', () => {
    for (const spec of ALL_SPECS) {
      expect(spec.layers.length).toBeGreaterThan(0);
    }
  });

  test('모든 소리에 사람이 읽는 이름이 있다', () => {
    for (const spec of ALL_SPECS) {
      expect(spec.label.length).toBeGreaterThan(0);
    }
  });

  test('★ 도달 불가능한 소리가 없다 — 모든 소리가 어떤 이벤트로든 울린다', () => {
    const reachable = new Set<GameSoundId>();
    const events: readonly GameEvent[] = [
      { kind: 'trade-open' },
      { kind: 'trade-add' },
      { kind: 'trade-close', pnl: 1, reason: 'manual' },
      { kind: 'trade-close', pnl: -1, reason: 'manual' },
      { kind: 'trade-close', pnl: -1, reason: 'liquidated' },
      { kind: 'tower-build' },
      { kind: 'tower-upgrade' },
      { kind: 'unit-summon' },
      { kind: 'tower-fire' },
      { kind: 'enemy-down', boss: false },
      { kind: 'enemy-down', boss: true },
      { kind: 'base-hit', damage: 9 },
      { kind: 'skill-cast', skill: 'S-01' },
      { kind: 'skill-cast', skill: 'S-02' },
      { kind: 'skill-cast', skill: 'S-03' },
      { kind: 'wave-start', wave: 1 },
      { kind: 'boss-appear' },
      { kind: 'prep-tick' },
      { kind: 'stage-end', outcome: 'cleared' },
      { kind: 'stage-end', outcome: 'defeated' },
    ];
    for (const event of events) {
      const id = soundForEvent(event);
      if (id !== null) reachable.add(id);
    }
    expect([...reachable].sort()).toEqual([...SOUND_IDS].sort());
  });
});

describe('★ 톤 규율 — 파이낸셜 느와르', () => {
  test('① 짧다 — 400ms를 넘는 것은 결말·보스·강제청산뿐이다', () => {
    const long = ALL_SPECS.filter((spec) => soundDurationMs(spec) > 400).map((spec) => spec.id);
    expect(long.sort()).toEqual(
      ['boss-appear', 'boss-down', 'skill-shield', 'stage-cleared', 'stage-defeated', 'trade-liquidated'].sort(),
    );
  });

  test('어떤 소리도 1초를 넘지 않는다', () => {
    for (const spec of ALL_SPECS) {
      expect(soundDurationMs(spec)).toBeLessThanOrEqual(1_000);
    }
  });

  test('② 저음 위주 — 1kHz 이상은 준비 카운트다운 하나뿐이다', () => {
    const bright = ALL_SPECS.filter((spec) =>
      spec.layers.some((layer) => layer.wave !== 'noise' && layer.startHz >= 1_000),
    ).map((spec) => spec.id);
    expect(bright).toEqual(['prep-tick']);
  });

  test('④ 과하지 않다 — 개별 볼륨이 0.5를 넘지 않는다', () => {
    for (const spec of ALL_SPECS) {
      expect(spec.volume).toBeGreaterThan(0);
      expect(spec.volume).toBeLessThanOrEqual(0.5);
    }
  });

  test('레이어 진폭이 1을 넘지 않는다 (클리핑 방지)', () => {
    for (const spec of ALL_SPECS) {
      for (const layer of spec.layers) {
        expect(layer.gain).toBeGreaterThan(0);
        expect(layer.gain).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('★ 연타 억제 파라미터', () => {
  test('모든 소리에 최소 간격이 걸려 있다 (0은 없다)', () => {
    for (const spec of ALL_SPECS) {
      expect(spec.minGapMs).toBeGreaterThan(0);
    }
  });

  test('가장 잦은 소리(타워 발사)가 가장 낮은 우선순위다', () => {
    const fire = SOUND_SPECS['tower-fire'];
    for (const spec of ALL_SPECS) {
      expect(spec.priority).toBeGreaterThanOrEqual(fire.priority);
    }
  });

  test('타워 발사보다 조용한 것은 준비 카운트다운 틱뿐이다', () => {
    // 준비 틱은 초당 1회짜리 미세한 신호라 예외다. 그 외에 배경음(발사)보다 작은 소리가
    // 생기면 그것은 "들리지 않아도 되는 소리"라는 뜻이므로 카탈로그에서 빼는 편이 맞다.
    const fire = SOUND_SPECS['tower-fire'].volume;
    const quieter = ALL_SPECS.filter((spec) => spec.volume < fire).map((spec) => spec.id);
    expect(quieter).toEqual(['prep-tick']);
  });

  test('★ 드물고 중요한 소리가 잦은 소리보다 우선순위가 높다', () => {
    const fire = SOUND_SPECS['tower-fire'].priority;
    for (const id of ['base-hit', 'boss-appear', 'boss-down', 'trade-liquidated'] as const) {
      expect(SOUND_SPECS[id].priority).toBeGreaterThan(fire);
    }
  });

  test('판당 1회짜리 소리는 긴 간격을 갖는다', () => {
    for (const id of ['boss-appear', 'stage-cleared', 'stage-defeated'] as const) {
      expect(SOUND_SPECS[id].minGapMs).toBeGreaterThanOrEqual(1_000);
    }
  });
});

describe('soundDurationMs', () => {
  test('가장 늦게 끝나는 레이어를 쓴다', () => {
    expect(
      soundDurationMs({
        id: 'trade-open',
        label: 't',
        channel: 'trade',
        minGapMs: 1,
        volume: 0.1,
        priority: 1,
        layers: [
          { wave: 'sine', startHz: 1, endHz: 1, startMs: 0, durationMs: 100, gain: 0.1 },
          { wave: 'sine', startHz: 1, endHz: 1, startMs: 200, durationMs: 50, gain: 0.1 },
        ],
      }),
    ).toBe(250);
  });

  test('레이어가 없으면 0이다', () => {
    expect(
      soundDurationMs({
        id: 'trade-open',
        label: 't',
        channel: 'trade',
        minGapMs: 1,
        volume: 0.1,
        priority: 1,
        layers: [],
      }),
    ).toBe(0);
  });
});
