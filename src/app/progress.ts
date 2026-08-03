/**
 * 진행도 저장 — 어느 지역을 클리어했는가 (GAME.md §15-7).
 *
 * ★ 왜 이것부터인가 ★
 * 네 가지가 전부 이 하나에 막혀 있었다: 지역 잠금(R2·R3 선행 클리어) · 경계도 heat ·
 * 부서 업그레이드(자본금 이월) · 차트 도감. 진행도가 없으니 `region-select.ts`는
 * `locked: false`로 고정이었고 `session.ts`는 `TERRITORIES = 0`이라
 * `HEAT_PER_TERRITORY`가 코드에만 있고 런타임 효과가 0이었다.
 *
 * ★ 구조 — 순수 직렬화 함수 + 얇은 배선 ★
 * 이 파일의 위쪽 절반(`parseProgress` · `serializeProgress` · `withCleared` …)은
 * **`window`도 `localStorage`도 모르는 순수 함수**다. 아래쪽 절반만 저장소에 닿는다.
 * 이 프로젝트의 경계 규칙(§17-2)이 "판정 모듈은 DOM·전역 상태를 모른다"이고,
 * 순수해야 테스트가 붙기 때문이다 — 손상 입력 검증이 전부 위쪽 절반에 걸린다.
 *
 * ⚠️ **버전 필드는 협상 대상이 아니다** (§15-7이 명시한 경고).
 * 이 프로젝트는 밸런스 상수가 자주 바뀐다. 버전 없이 저장하면 구 포맷을 읽고도
 * "읽는 데 성공했다"고 판단해 **조용히 잘못된 값을 쓴다**. 그래서 알 수 없는 버전은
 * 읽기를 포기하고 기본값으로 떨어진다 — 진행도를 잃는 편이 잘못된 진행도보다 낫다.
 *
 * ⚠️ **예외를 밖으로 던지지 않는다.** 프라이빗 모드·저장소 차단·용량 초과·SSR처럼
 * `localStorage` 접근 자체가 던지는 환경이 실재한다. 진행도는 게임을 못 하게 만들 만한
 * 기능이 아니므로, 모든 실패는 "진행도 없음"으로 수렴한다.
 */

import type { StageId } from '../combat';
import { STAGES } from '../combat';
import type { CodexBar, CodexCard } from './codex';
import type { SettlementGrade } from './settlement';

/**
 * 저장 포맷 버전. **포맷의 의미가 바뀌면 반드시 올려라.**
 *
 * 필드를 새로 *추가*하는 것만으로는 올리지 않아도 된다(없으면 기본값으로 채운다).
 * 기존 필드의 뜻·단위·범위가 바뀔 때 올린다 — 그 경우가 조용한 오작동의 근원이다.
 */
export const PROGRESS_VERSION = 1;

/** `localStorage` 키. 버전은 **키가 아니라 값 안에** 둔다 — 그래야 마이그레이션이 가능하다. */
export const PROGRESS_STORAGE_KEY = 'ticker-front.progress';

/**
 * 게임 전체 진행도. **런타임 형태에는 버전이 없다.**
 *
 * 버전은 직렬화 봉투(`serializeProgress`)에만 실린다. 호출부가 버전을 들고 다니면
 * 어딘가에서 잘못된 값을 채워 넣을 자리가 생기기 때문이다.
 */
export interface GameProgress {
  /** 클리어한 지역. `STAGES` 정의 순서로 정규화되며 중복이 없다. */
  readonly clearedStages: readonly StageId[];
  /**
   * 다음 판으로 넘길 자본금 (FR-11 부서 업그레이드).
   *
   * ⚠️ **지금은 항상 0이다.** 자리만 잡아 둔다 — 부서 업그레이드가 붙을 때 이 필드에
   * 값이 들어가고, 그때 포맷 버전을 올릴 필요가 없어진다(필드 추가는 하위 호환).
   * 지금 쓰지도 않을 증감 API를 만들지 마라(YAGNI).
   */
  readonly carriedCapital: number;
  /**
   * 튜토리얼을 한 번이라도 봤는가.
   *
   * 예전에는 "클리어한 지역이 0개면 첫 회차"로 판정했는데, **지역을 깨기 전에는 그 값이
   * 영원히 0이라 튜토리얼이 매 판 다시 뜨고 건너뛰기 버튼이 영구 비활성이었다.**
   * 본 것을 기록하는 것과 지역을 깬 것은 별개의 사실이므로 필드를 따로 둔다.
   *
   * 필드 추가는 하위 호환이라 포맷 버전을 올리지 않는다(없으면 false로 채운다).
   */
  readonly tutorialSeen: boolean;
  /**
   * 수집한 도감 카드 (PRD P1 #10).
   *
   * 카드는 **클리어 1회당 1장**이고 `시드-지역` ID로 중복이 제거된다. 여기에 두는 이유는
   * 도감이 "판을 넘어 남는 것"이라는 성격 자체가 진행도이기 때문이다 — 별도 저장 키를
   * 만들면 진행도 초기화와 도감 초기화가 어긋난다.
   *
   * 필드 추가는 하위 호환이라 포맷 버전을 올리지 않는다(없으면 빈 배열).
   */
  readonly codexCards: readonly CodexCard[];
}

/** 실제 존재하는 지역 ID. 손상 입력에서 지역 이름을 걸러내는 기준이다. */
const KNOWN_STAGE_IDS: readonly StageId[] = Object.keys(STAGES) as StageId[];

/** 진행도 없음. **모든 실패 경로가 여기로 수렴한다.** */
export function emptyProgress(): GameProgress {
  return { clearedStages: [], carriedCapital: 0, tutorialSeen: false, codexCards: [] };
}

function isStageId(value: unknown): value is StageId {
  return typeof value === 'string' && (KNOWN_STAGE_IDS as readonly string[]).includes(value);
}

/**
 * 클리어 목록을 정규화한다: 모르는 값 제거 → 중복 제거 → `STAGES` 정의 순서로 정렬.
 *
 * 순서를 고정하는 이유는 직렬화 결과가 저장할 때마다 달라지지 않게 하려는 것이다.
 * (같은 진행도가 같은 문자열이어야 저장 여부를 문자열 비교로 판단할 수 있다.)
 */
function normalizeCleared(values: readonly unknown[]): readonly StageId[] {
  const seen = new Set<StageId>();
  for (const value of values) {
    if (isStageId(value)) seen.add(value);
  }
  return KNOWN_STAGE_IDS.filter((id) => seen.has(id));
}

/** 음수·NaN·Infinity·정수 아님을 전부 0 이상의 정수로 만든다. */
function normalizeCapital(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** 유한수만 통과시킨다. 실패하면 `fallback`. 도감 카드 필드 검증의 기본기다. */
function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const KNOWN_GRADES: readonly SettlementGrade[] = ['S', 'A', 'B', 'C'];

function isGrade(value: unknown): value is SettlementGrade {
  return typeof value === 'string' && (KNOWN_GRADES as readonly string[]).includes(value);
}

function normalizeBars(value: unknown): readonly CodexBar[] {
  if (!Array.isArray(value)) return [];
  const out: CodexBar[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const o = finiteOr(record['o'], Number.NaN);
    const c = finiteOr(record['c'], Number.NaN);
    if (Number.isNaN(o) || Number.isNaN(c)) continue;
    out.push({ o, c });
  }
  return out;
}

/**
 * 손상 입력에서 도감 카드 하나를 복구한다. 복구 불가면 `null`.
 *
 * ⚠️ **여기가 이 파일에서 가장 느슨해지기 쉬운 자리다.** 카드는 필드가 10개라 "대충 있으면
 * 통과"시키고 싶어지는데, 그러면 `undefined`가 화면 계산식(`baseHp / maxBaseHp`)까지 흘러가
 * `NaN%`가 렌더된다. ID·지역·등급이 없으면 그 카드는 **버린다** — 카드 한 장을 잃는 것이
 * 도감 전체가 깨지는 것보다 낫다.
 */
function normalizeCard(value: unknown): CodexCard | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  const id = record['id'];
  const stageId = record['stageId'];
  const grade = record['grade'];
  if (typeof id !== 'string' || id === '') return null;
  if (!isStageId(stageId)) return null;
  if (!isGrade(grade)) return null;

  const maxBaseHp = Math.max(1, Math.floor(finiteOr(record['maxBaseHp'], 1)));
  return {
    id,
    stageId,
    grade,
    seed: Math.floor(finiteOr(record['seed'], 0)),
    changeRate: finiteOr(record['changeRate'], 0),
    hasEvent: record['hasEvent'] === true,
    durationMs: Math.max(0, Math.floor(finiteOr(record['durationMs'], 0))),
    baseHp: Math.max(0, Math.floor(finiteOr(record['baseHp'], 0))),
    maxBaseHp,
    accuracy: Math.min(1, Math.max(0, finiteOr(record['accuracy'], 0))),
    bars: normalizeBars(record['bars']),
  };
}

/** 카드 목록 정규화: 손상 제거 → ID 중복 제거(먼저 온 것을 남긴다). */
function normalizeCards(values: readonly unknown[]): readonly CodexCard[] {
  const seen = new Set<string>();
  const out: CodexCard[] = [];
  for (const value of values) {
    const card = normalizeCard(value);
    if (card === null || seen.has(card.id)) continue;
    seen.add(card.id);
    out.push(card);
  }
  return out;
}

/**
 * 저장 문자열 → 진행도. **어떤 입력에도 던지지 않는다.**
 *
 * 떨어지는 경우: `null`/빈 문자열 · JSON 파싱 실패 · 객체가 아님(배열·숫자 포함) ·
 * 버전이 다르거나 없음. 살아남은 경우에도 필드별로 다시 검사한다 —
 * 버전이 맞아도 손으로 고친 값이나 다른 탭의 옛 코드가 쓴 값이 들어올 수 있다.
 */
export function parseProgress(raw: string | null | undefined): GameProgress {
  if (typeof raw !== 'string' || raw === '') return emptyProgress();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyProgress(); // 깨진 JSON — 지울 필요도 없다. 다음 저장이 덮어쓴다.
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return emptyProgress();
  }

  const record = parsed as Record<string, unknown>;
  // ★ 여기가 §15-7이 경고한 지점 ★ 버전이 다르면 **읽지 않는다.**
  // 마이그레이션이 필요해지면 이 자리에 `migrateFrom(version, record)`를 넣어라.
  if (record['version'] !== PROGRESS_VERSION) return emptyProgress();

  const cleared = record['clearedStages'];
  const cards = record['codexCards'];
  return {
    clearedStages: Array.isArray(cleared) ? normalizeCleared(cleared) : [],
    carriedCapital: normalizeCapital(record['carriedCapital']),
    // 구 포맷에는 없던 필드다. 없으면 false — 처음 보는 사람으로 취급한다.
    tutorialSeen: record['tutorialSeen'] === true,
    // 마찬가지로 구 포맷에 없던 필드. 없으면 빈 도감.
    codexCards: Array.isArray(cards) ? normalizeCards(cards) : [],
  };
}

/** 진행도 → 저장 문자열. 버전을 붙이는 **유일한** 곳이다. */
export function serializeProgress(progress: GameProgress): string {
  return JSON.stringify({
    version: PROGRESS_VERSION,
    clearedStages: progress.clearedStages,
    carriedCapital: progress.carriedCapital,
    tutorialSeen: progress.tutorialSeen,
    codexCards: progress.codexCards,
  });
}

/** 이 지역을 이미 클리어했는가. */
export function hasCleared(progress: GameProgress, id: StageId): boolean {
  return progress.clearedStages.includes(id);
}

/**
 * 점령 지역 수 — `session.ts`의 heat 입력(FR-6.7).
 *
 * "클리어한 지역 = 점령한 지역"이다. 지금 굴리는 지역은 아직 점령이 아니므로 포함되지 않는다.
 */
export function clearedCount(progress: GameProgress): number {
  return progress.clearedStages.length;
}

/**
 * 클리어를 기록한 **새 진행도**를 만든다 (불변).
 *
 * 이미 클리어한 지역이면 **같은 참조를 그대로 돌려준다** — 재클리어 때마다 저장이
 * 일어나지 않게 하려는 것이다. 호출부는 `!==`로 변화를 판단할 수 있다.
 */
export function withCleared(progress: GameProgress, id: StageId): GameProgress {
  if (hasCleared(progress, id)) return progress;
  return {
    ...progress,
    clearedStages: normalizeCleared([...progress.clearedStages, id]),
  };
}

// ── 여기부터가 저장소에 닿는 얇은 층 ──────────────────────────────────

/**
 * `localStorage`에서 이 모듈이 실제로 쓰는 부분만 추린 것.
 *
 * 전체 `Storage`를 요구하지 않는 이유는 테스트가 가짜를 만들기 쉬워야 하기 때문이다
 * (그리고 이 모듈은 `clear()`·`length` 같은 것을 쓸 일이 없다).
 */
export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * 쓸 수 있는 저장소를 찾는다. 없으면 `null`.
 *
 * ⚠️ `typeof` 검사만으로는 부족하다 — 사파리 프라이빗 모드·쿠키 차단 환경에서는
 * `localStorage` **접근 자체가 던진다**. 그래서 try로 감싼다.
 */
export function defaultProgressStorage(): ProgressStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * 저장된 진행도를 읽는다. **어떤 실패에서도 던지지 않고 빈 진행도로 떨어진다.**
 *
 * @param storage 생략하면 브라우저 `localStorage`. `null`을 넘기면 저장소가 없는 것으로 본다
 *   (SSR·테스트).
 */
export function loadProgress(
  storage: ProgressStorage | null = defaultProgressStorage(),
): GameProgress {
  if (storage === null) return emptyProgress();
  try {
    return parseProgress(storage.getItem(PROGRESS_STORAGE_KEY));
  } catch {
    return emptyProgress(); // getItem이 던지는 환경(차단된 저장소)도 있다.
  }
}

/**
 * 진행도를 저장한다.
 *
 * @returns 실제로 썼는가. 용량 초과·차단 환경에서 `false`가 나오지만 **던지지는 않는다** —
 *   호출부는 이 값을 무시해도 게임이 계속 굴러가야 한다.
 */
export function saveProgress(
  progress: GameProgress,
  storage: ProgressStorage | null = defaultProgressStorage(),
): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(PROGRESS_STORAGE_KEY, serializeProgress(progress));
    return true;
  } catch {
    return false;
  }
}

/**
 * "이 지역을 클리어했다"를 저장하고 **갱신된 진행도**를 돌려준다.
 *
 * 셸(`stage.ts`)이 클리어를 확정한 순간(FR-8.1 정산에서 `outcome === 'cleared'`)에
 * 한 번 부르면 되는, 이 모듈의 대표 진입점이다. 저장에 실패해도 돌려주는 진행도는
 * 갱신돼 있으므로 **그 판 안에서는 잠금 해제가 즉시 보인다**(새로고침하면 사라질 뿐).
 */
/** 튜토리얼을 봤다고 기록한다. 이미 기록돼 있으면 같은 참조를 돌려준다. */
export function markTutorialSeen(
  storage: ProgressStorage | null = defaultProgressStorage(),
): GameProgress {
  const current = loadProgress(storage);
  if (current.tutorialSeen) {
    return current;
  }
  const next: GameProgress = { ...current, tutorialSeen: true };
  saveProgress(next, storage);
  return next;
}

export function recordCleared(
  id: StageId,
  storage: ProgressStorage | null = defaultProgressStorage(),
): GameProgress {
  const next = withCleared(loadProgress(storage), id);
  saveProgress(next, storage);
  return next;
}

/**
 * 도감 카드를 더한 **새 진행도**를 만든다 (불변).
 *
 * 이미 가진 카드(같은 ID = 같은 시드·같은 지역)면 **같은 참조를 돌려준다** — 같은 판을
 * 다시 깨도 도감이 늘어나지 않게 하려는 것이다. `withCleared`와 같은 관습이라
 * 호출부는 `!==`로 "새로 얻었는가"를 판단할 수 있다(획득 연출의 조건이 된다).
 */
export function withCard(progress: GameProgress, card: CodexCard): GameProgress {
  if (progress.codexCards.some((existing) => existing.id === card.id)) {
    return progress;
  }
  return { ...progress, codexCards: [...progress.codexCards, card] };
}

/** 카드 획득을 저장하고 갱신된 진행도를 돌려준다. @returns 새로 얻었는지까지 함께 준다. */
export function recordCard(
  card: CodexCard,
  storage: ProgressStorage | null = defaultProgressStorage(),
): { readonly progress: GameProgress; readonly isNew: boolean } {
  const current = loadProgress(storage);
  const next = withCard(current, card);
  if (next === current) {
    return { progress: current, isNew: false };
  }
  saveProgress(next, storage);
  return { progress: next, isNew: true };
}
