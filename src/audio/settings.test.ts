import { describe, expect, test } from 'vitest';

import {
  AUDIO_SETTINGS_VERSION,
  AUDIO_STORAGE_KEY,
  DEFAULT_VOLUME,
  clampVolume,
  defaultAudioSettings,
  effectiveVolume,
  formatVolumeLabel,
  loadAudioSettings,
  muteButtonLabel,
  parseAudioSettings,
  percentToVolume,
  saveAudioSettings,
  serializeAudioSettings,
  volumeToPercent,
} from './settings';
import type { AudioSettings, AudioStorage } from './settings';

/** 메모리 저장소 — `localStorage`가 없는 node 환경에서 저장·복원을 검증한다. */
function memoryStorage(seed: Record<string, string> = {}): AudioStorage & {
  readonly data: Record<string, string>;
} {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe('기본값', () => {
  test('★ 기본은 음소거가 아니다 — 소리가 있다는 사실이 전달돼야 한다', () => {
    expect(defaultAudioSettings().muted).toBe(false);
  });

  test('★ 기본 볼륨이 과하지 않다', () => {
    expect(DEFAULT_VOLUME).toBeGreaterThan(0);
    expect(DEFAULT_VOLUME).toBeLessThanOrEqual(0.6);
    expect(defaultAudioSettings().volume).toBe(DEFAULT_VOLUME);
  });
});

describe('clampVolume — 손상 입력', () => {
  test('0~1로 자른다', () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(0)).toBe(0);
    expect(clampVolume(0.5)).toBe(0.5);
    expect(clampVolume(1)).toBe(1);
    expect(clampVolume(9)).toBe(1);
  });

  test('★ 숫자가 아니면 0이 아니라 기본값으로 떨어진다 (조용한 무음 방지)', () => {
    expect(clampVolume('0.5')).toBe(DEFAULT_VOLUME);
    expect(clampVolume(null)).toBe(DEFAULT_VOLUME);
    expect(clampVolume(undefined)).toBe(DEFAULT_VOLUME);
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME);
    expect(clampVolume(Number.POSITIVE_INFINITY)).toBe(DEFAULT_VOLUME);
  });

  test('소수 둘째 자리로 반올림한다 — 같은 설정이 같은 문자열이어야 한다', () => {
    expect(clampVolume(0.123_456)).toBe(0.12);
    expect(serializeAudioSettings({ volume: 0.123_456, muted: false })).toBe(
      serializeAudioSettings({ volume: 0.12, muted: false }),
    );
  });
});

describe('퍼센트 환산', () => {
  test('왕복해도 값이 보존된다', () => {
    for (const percent of [0, 5, 45, 80, 100]) {
      expect(volumeToPercent(percentToVolume(percent))).toBe(percent);
    }
  });

  test('범위 밖 입력도 안전하다', () => {
    expect(percentToVolume(-40)).toBe(0);
    expect(percentToVolume(400)).toBe(1);
    expect(percentToVolume('60')).toBe(DEFAULT_VOLUME);
  });
});

describe('effectiveVolume — 음소거는 볼륨 0 저장이 아니다', () => {
  test('음소거면 정확히 0이다', () => {
    expect(effectiveVolume({ volume: 0.8, muted: true })).toBe(0);
  });

  test('★ 음소거를 풀면 원래 볼륨이 돌아온다', () => {
    const settings: AudioSettings = { volume: 0.8, muted: true };
    expect(effectiveVolume({ ...settings, muted: false })).toBe(0.8);
  });
});

describe('표시 문자열', () => {
  test('음소거는 0%가 아니라 상태로 말한다 — 다른 사실이다', () => {
    expect(formatVolumeLabel({ volume: 0.45, muted: true })).toBe('음소거');
    expect(formatVolumeLabel({ volume: 0.45, muted: false })).toBe('45%');
    expect(formatVolumeLabel({ volume: 0, muted: false })).toBe('0%');
  });

  test('음소거 버튼 라벨이 상태를 반영한다', () => {
    expect(muteButtonLabel(false)).toBe('소리 끄기');
    expect(muteButtonLabel(true)).toBe('소리 켜기');
  });
});

describe('parseAudioSettings — 어떤 입력에도 던지지 않는다', () => {
  test.each([
    ['null', null],
    ['undefined', undefined],
    ['빈 문자열', ''],
    ['깨진 JSON', '{volume:'],
    ['배열', '[1,2,3]'],
    ['숫자', '42'],
    ['문자열 리터럴', '"hello"'],
  ])('%s → 기본 설정', (_label, raw) => {
    expect(parseAudioSettings(raw as string | null | undefined)).toEqual(defaultAudioSettings());
  });

  test('★ 버전이 다르면 읽지 않는다 — 조용히 잘못된 볼륨을 쓰는 것보다 낫다', () => {
    const stale = JSON.stringify({ version: AUDIO_SETTINGS_VERSION + 1, volume: 0.9, muted: true });
    expect(parseAudioSettings(stale)).toEqual(defaultAudioSettings());
    expect(parseAudioSettings(JSON.stringify({ volume: 0.9 }))).toEqual(defaultAudioSettings());
  });

  test('버전이 맞아도 필드별로 다시 검사한다', () => {
    const tampered = JSON.stringify({
      version: AUDIO_SETTINGS_VERSION,
      volume: 999,
      muted: 'true',
    });
    expect(parseAudioSettings(tampered)).toEqual({ volume: 1, muted: false });
  });

  test("문자열 'false'가 참으로 읽히지 않는다", () => {
    const raw = JSON.stringify({ version: AUDIO_SETTINGS_VERSION, volume: 0.5, muted: 'false' });
    expect(parseAudioSettings(raw).muted).toBe(false);
  });
});

describe('★ localStorage 저장·복원', () => {
  test('저장한 설정이 그대로 돌아온다', () => {
    const storage = memoryStorage();
    const settings: AudioSettings = { volume: 0.25, muted: true };

    expect(saveAudioSettings(settings, storage)).toBe(true);
    expect(loadAudioSettings(storage)).toEqual(settings);
  });

  test('저장 키가 진행도와 분리돼 있다', () => {
    const storage = memoryStorage();
    saveAudioSettings({ volume: 0.3, muted: false }, storage);
    expect(Object.keys(storage.data)).toEqual([AUDIO_STORAGE_KEY]);
    expect(AUDIO_STORAGE_KEY).not.toBe('ticker-front.progress');
  });

  test('저장소가 없으면 기본 설정이고 저장은 false다 (던지지 않는다)', () => {
    expect(loadAudioSettings(null)).toEqual(defaultAudioSettings());
    expect(saveAudioSettings({ volume: 0.3, muted: true }, null)).toBe(false);
  });

  test('★ 저장소가 던지는 환경(프라이빗 모드)에서도 죽지 않는다', () => {
    const hostile: AudioStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => loadAudioSettings(hostile)).not.toThrow();
    expect(loadAudioSettings(hostile)).toEqual(defaultAudioSettings());
    expect(saveAudioSettings({ volume: 0.5, muted: false }, hostile)).toBe(false);
  });

  test('손상된 저장값은 기본 설정으로 떨어진다', () => {
    const storage = memoryStorage({ [AUDIO_STORAGE_KEY]: 'not json at all' });
    expect(loadAudioSettings(storage)).toEqual(defaultAudioSettings());
  });
});
