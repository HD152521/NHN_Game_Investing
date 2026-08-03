/**
 * 챌린지 모드 — 같은 차트로 겨룬다 (시드 공유 · 일일 챌린지).
 *
 * ★ 왜 실데이터 없이도 되는가 ★
 * `generateChartSet(seed)`가 **결정론적**이다(mulberry32 시드 PRNG, `Math.random()` 금지).
 * 그래서 시드만 같으면 누구나 **문자 단위로 같은 차트**를 받는다. 실제 과거 거래일 데이터가
 * 붙기 전에도 "전 유저가 같은 판을 푼다"는 경쟁 구조는 지금 성립한다.
 *
 * 실데이터가 주는 것은 경쟁이 아니라 **정체성**("그날은 진짜 그 회사의 그날이었다")이다.
 * 둘을 분리하면 지금 할 수 있는 것과 나중 것이 갈린다 — 이 파일은 앞쪽만 담당한다.
 *
 * ★★ 공정성 불변식: 챌린지에서는 heat를 1로 고정한다 ★★
 * 진행도가 붙으면서 `heat = 1 + 점령 수 × 0.04`가 살아났다. 즉 **같은 시드라도 진도가
 * 앞선 사람은 적 HP가 더 높은 판을 받는다**(2지역 점령이면 +8%). 시드만 맞추고 성적을
 * 비교하면 앞서 나간 사람이 벌을 받는다. 그래서 챌린지는 점령 수를 0으로 못박는다.
 * 이 상수를 지우면 랭킹이 조용히 불공정해진다.
 */

/** 챌린지에서 쓰는 점령 수. **0 고정** — 위 머리말의 공정성 불변식이다. */
export const CHALLENGE_TERRITORIES = 0;

/** 시드 허용 범위. 32비트 양수로 제한한다 — mulberry32가 그 범위를 쓴다. */
export const MIN_SEED = 1;
export const MAX_SEED = 0xffff_ffff;

/**
 * 날짜 → 그날의 시드. `2026-08-03` → `20260803`.
 *
 * ★ 왜 날짜를 그대로 숫자로 쓰는가 ★ 해시를 돌리면 "오늘 시드가 뭐냐"를 사람이 눈으로
 * 확인할 수 없다. 날짜 그대로면 결과 카드에 찍힌 시드만 보고 **언제 판인지 바로 읽힌다**.
 * 시드의 목적은 예측 불가능성이 아니라 **재현성**이므로 추측 가능해도 문제가 없다
 * (차트 내용은 어차피 시드에서 결정론적으로 생성되고, 블라인드는 별개 규칙이다).
 *
 * @param date 판정 모듈은 시계를 읽지 않는다(§17-2). 셸이 `new Date()`를 넘긴다.
 */
export function dailySeedFor(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return year * 10_000 + month * 100 + day;
}

/** 시드 → 날짜 문구. 일일 챌린지 시드가 아니면 `null`. */
export function dailyLabelFor(seed: number): string | null {
  if (!Number.isInteger(seed) || seed < 1_000_101 || seed > 9_999_1231) {
    return null;
  }
  const year = Math.floor(seed / 10_000);
  const month = Math.floor((seed % 10_000) / 100);
  const day = seed % 100;
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 시드로 쓸 수 있는 값인가. */
export function isValidSeed(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_SEED && value <= MAX_SEED;
}

/**
 * 사용자가 입력한 문자열 → 시드. 쓸 수 없으면 `null`.
 *
 * 공백·쉼표·하이픈을 허용한다 — 결과 카드에서 `2026-08-03`을 그대로 긁어 붙이는 것이
 * 가장 흔한 사용법이라, 그때 실패하면 기능 자체가 안 쓰인다.
 */
export function parseSeedInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/[\s,\-]/g, '');
  if (cleaned === '' || !/^\d+$/.test(cleaned)) {
    return null;
  }
  const value = Number(cleaned);
  return isValidSeed(value) ? value : null;
}

/** 이 판이 어떤 모드로 굴러가는가. 결과 카드와 랭킹이 이 값으로 갈린다. */
export type ChallengeMode = 'free' | 'seed' | 'daily';

/**
 * 시드와 오늘 날짜로 모드를 판정한다.
 *
 * `daily`는 **오늘의 시드일 때만**이다. 어제 시드를 손으로 넣은 판을 오늘 랭킹에 올리면
 * 안 되기 때문이다 — 그런 판은 `seed`(시드 공유)로 취급한다.
 */
export function challengeModeOf(seed: number, today: Date, userPicked: boolean): ChallengeMode {
  if (seed === dailySeedFor(today)) {
    return 'daily';
  }
  return userPicked ? 'seed' : 'free';
}

/** 모드 표시 문구. */
export function challengeLabelOf(mode: ChallengeMode, seed: number): string {
  switch (mode) {
    case 'daily': {
      const label = dailyLabelFor(seed);
      return label === null ? '일일 챌린지' : `일일 챌린지 · ${label}`;
    }
    case 'seed':
      return `시드 대결 · #${seed}`;
    default:
      return `자유 플레이 · #${seed}`;
  }
}

/**
 * 공유용 한 줄. 결과 카드 하단과 클립보드에 같이 들어간다.
 *
 * 시드를 반드시 포함한다 — 이 문자열 하나만 받으면 상대가 **정확히 같은 판**을 열 수 있어야
 * 공유의 의미가 있다.
 */
export function shareLineOf(mode: ChallengeMode, seed: number, stageId: string): string {
  const label = dailyLabelFor(seed);
  if (mode === 'daily' && label !== null) {
    return `TICKER FRONT ${label} 일일 챌린지 · ${stageId} · 시드 ${seed}`;
  }
  return `TICKER FRONT · ${stageId} · 시드 ${seed}`;
}
