/**
 * 사운드 설정 저장 — 마스터 볼륨 · 음소거 (PRD §3.1 ⑬ 설정).
 *
 * ★ 구조는 `src/app/progress.ts`와 **똑같다** ★ 위쪽 절반이 `window`도 `localStorage`도
 * 모르는 순수 함수이고, 아래쪽 절반만 저장소에 닿는다. 진행도 저장이 이미 이 패턴을
 * 확립했으므로 여기서 다른 방식을 만들면 저장 코드가 두 갈래가 된다.
 *
 * ⚠️ **예외를 밖으로 던지지 않는다.** 프라이빗 모드·저장소 차단·용량 초과에서
 * `localStorage` 접근 자체가 던지는 환경이 실재한다. 소리는 보조 채널이므로 모든
 * 실패가 "기본 설정"으로 수렴한다 — 설정을 잃는 편이 게임이 안 뜨는 것보다 낫다.
 */

/**
 * 저장 포맷 버전. **뜻·단위·범위가 바뀌면 올려라** (필드 추가만으로는 올리지 않는다).
 *
 * 버전 없이 저장하면 구 포맷을 읽고도 "성공했다"고 판단해 조용히 잘못된 볼륨을 쓴다 —
 * 볼륨의 경우 그 사고가 **귀에 직접** 온다(0.5가 5로 읽히면 클리핑이다).
 */
export const AUDIO_SETTINGS_VERSION = 1;

/** `localStorage` 키. 진행도와 별개다 — 설정을 지워도 진행도가 날아가면 안 된다. */
export const AUDIO_STORAGE_KEY = 'ticker-front.audio';

/**
 * 기본 마스터 볼륨.
 *
 * ★ 0.45인 이유 ★ 기본값은 음소거가 아니어야 하지만(소리가 있다는 사실이 전달돼야 한다)
 * 처음 켠 사람을 놀라게 하면 안 된다. 개별 소리가 이미 0.12~0.46의 상대 볼륨을 갖고
 * 있으므로 실제 출력은 이 값과 곱해져 최대 0.21 근처가 된다 — 배경으로 깔리는 크기다.
 */
export const DEFAULT_VOLUME = 0.45;

/** 볼륨 슬라이더 눈금. 0~100(%)을 5단위로 끊는다 — 1%씩 움직여도 사람이 구분하지 못한다. */
export const VOLUME_STEP_PERCENT = 5;

export interface AudioSettings {
  /** 0~1. 저장할 때 소수 둘째 자리로 반올림한다(문자열이 매번 달라지지 않게). */
  readonly volume: number;
  readonly muted: boolean;
}

/** 기본 설정. **모든 실패 경로가 여기로 수렴한다.** */
export function defaultAudioSettings(): AudioSettings {
  return { volume: DEFAULT_VOLUME, muted: false };
}

/**
 * 볼륨을 0~1로 자른다. NaN·Infinity·문자열·음수를 전부 안전한 값으로 만든다.
 *
 * 손상 입력이 기본값이 아니라 **0**으로 떨어지지 않게 하는 것이 중요하다 — 조용히
 * 무음이 되면 사용자는 "소리가 안 난다"는 버그로 읽는다. 숫자가 아니면 기본값을 쓴다.
 */
export function clampVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_VOLUME;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return Math.round(value * 100) / 100;
}

/** 0~1 볼륨 → 슬라이더 눈금(0~100 정수). */
export function volumeToPercent(volume: number): number {
  return Math.round(clampVolume(volume) * 100);
}

/** 슬라이더 눈금(0~100) → 0~1 볼륨. 범위 밖 입력도 안전하게 접는다. */
export function percentToVolume(percent: unknown): number {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return DEFAULT_VOLUME;
  return clampVolume(percent / 100);
}

/**
 * 실제로 출력에 곱해질 값 — **음소거면 정확히 0이다.**
 *
 * 음소거를 "볼륨 0 저장"으로 구현하지 않은 이유: 끄기 전 볼륨을 기억해야 다시 켤 때
 * 원래 크기로 돌아온다. 두 사실(얼마나 크게 / 지금 낼 것인가)은 별개다.
 */
export function effectiveVolume(settings: AudioSettings): number {
  return settings.muted ? 0 : clampVolume(settings.volume);
}

/** 음소거 토글 버튼의 표시. 판정이 아니라 **표시**의 단일 출처다. */
export function muteButtonLabel(muted: boolean): string {
  return muted ? '소리 켜기' : '소리 끄기';
}

/** 볼륨 표시 문자열. 음소거면 숫자 대신 상태를 말한다 — 0%와 음소거는 다른 사실이다. */
export function formatVolumeLabel(settings: AudioSettings): string {
  return settings.muted ? '음소거' : `${volumeToPercent(settings.volume)}%`;
}

/**
 * 사운드 컨트롤이 화면에 보여야 하는 값 전부 — **순수 함수**.
 *
 * ★ 왜 뽑아냈는가 (§19-7) ★ 셸의 `syncAudioControls`가 이 값들을 직접 계산하면 "버튼을
 * 누르면 실제로 무슨 일이 일어나는가"가 클로저 안에 갇혀 테스트가 붙지 않는다. 이 프로젝트가
 * `stage-flow.ts`·`*-logic.ts`로 이미 확립한 패턴이다 — 셸은 여기 결과를 DOM에 옮기기만 한다.
 *
 * `pressed`가 문자열인 이유: `aria-pressed`는 문자열 속성이고, **화면 표시와 스크린리더가
 * 같은 값을 써야** 두 사실이 갈라지지 않는다(CSS도 `[aria-pressed='true']`로 선택한다).
 */
export interface AudioControlView {
  /** `aria-pressed` 값. 음소거 여부와 같다. */
  readonly pressed: 'true' | 'false';
  /** 버튼 `title`과 스크린리더 문구. 둘은 언제나 같아야 한다. */
  readonly label: string;
  /** `<input type="range">`의 `value` (0~100 문자열). */
  readonly sliderValue: string;
  /** 옆에 뜨는 숫자 표시. 음소거면 '음소거'다. */
  readonly valueText: string;
}

export function audioControlView(settings: AudioSettings): AudioControlView {
  return {
    pressed: settings.muted ? 'true' : 'false',
    label: muteButtonLabel(settings.muted),
    sliderValue: String(volumeToPercent(settings.volume)),
    valueText: formatVolumeLabel(settings),
  };
}

/**
 * 저장 문자열 → 설정. **어떤 입력에도 던지지 않는다.**
 *
 * 떨어지는 경우: `null`/빈 문자열 · JSON 파싱 실패 · 객체가 아님 · 버전 불일치.
 * 버전이 맞아도 필드별로 다시 검사한다 — 손으로 고친 값이나 다른 탭의 옛 코드가 쓴
 * 값이 들어올 수 있다.
 */
export function parseAudioSettings(raw: string | null | undefined): AudioSettings {
  if (typeof raw !== 'string' || raw === '') return defaultAudioSettings();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultAudioSettings();
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return defaultAudioSettings();
  }

  const record = parsed as Record<string, unknown>;
  if (record['version'] !== AUDIO_SETTINGS_VERSION) return defaultAudioSettings();

  return {
    volume: clampVolume(record['volume']),
    // `=== true`로 비교한다 — 문자열 'false'가 참으로 읽히면 소리가 영원히 안 난다.
    muted: record['muted'] === true,
  };
}

/** 설정 → 저장 문자열. 버전을 붙이는 **유일한** 곳이다. */
export function serializeAudioSettings(settings: AudioSettings): string {
  return JSON.stringify({
    version: AUDIO_SETTINGS_VERSION,
    volume: clampVolume(settings.volume),
    muted: settings.muted,
  });
}

// ── 여기부터가 저장소에 닿는 얇은 층 ──────────────────────────────────

/**
 * `localStorage`에서 이 모듈이 실제로 쓰는 부분만.
 *
 * `src/app/progress.ts`의 `ProgressStorage`와 모양이 같지만 **import하지 않는다** —
 * `src/audio`가 `src/app`에 의존하면 방향이 뒤집힌다(셸이 오디오를 쓰는 구조다).
 */
export interface AudioStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * 쓸 수 있는 저장소를 찾는다. 없으면 `null`.
 *
 * ⚠️ `typeof` 검사만으로는 부족하다 — 사파리 프라이빗 모드·쿠키 차단에서는
 * `localStorage` **접근 자체가 던진다.**
 */
export function defaultAudioStorage(): AudioStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** 저장된 설정을 읽는다. **어떤 실패에서도 기본 설정으로 떨어진다.** */
export function loadAudioSettings(
  storage: AudioStorage | null = defaultAudioStorage(),
): AudioSettings {
  if (storage === null) return defaultAudioSettings();
  try {
    return parseAudioSettings(storage.getItem(AUDIO_STORAGE_KEY));
  } catch {
    return defaultAudioSettings();
  }
}

/**
 * 설정을 저장한다.
 *
 * @returns 실제로 썼는가. 차단 환경에서 `false`가 나오지만 **던지지는 않는다** —
 *   호출부는 이 값을 무시해도 게임이 계속 굴러가야 한다.
 */
export function saveAudioSettings(
  settings: AudioSettings,
  storage: AudioStorage | null = defaultAudioStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(AUDIO_STORAGE_KEY, serializeAudioSettings(settings));
    return true;
  } catch {
    return false;
  }
}
