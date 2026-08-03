/**
 * 튜토리얼 — 코어 루프를 한 바퀴 돌려 보이는 가이드 모드 (GAME.md §15-1).
 *
 * ★ 왜 필요한가 ★
 * 처음 보는 사람이 이 게임을 이해할 방법이 **지금 전혀 없다.** 화면에 차트·HUD·전장·
 * 빌드바·매매 패널이 동시에 뜨는데, 어느 것이 어느 것을 먹여 살리는지 말해 주는 곳이 없다.
 * 플레이테스트에서 두 번 같은 종류 질문이 나왔고("공중 적을 어떻게 잡느냐", "스킬이 뭔지
 * 모르겠다") 둘 다 라벨·툴팁이라는 **국소 대응**이었다. 루프 자체를 설명하는 층은 없었다.
 *
 * ★ 별도 씬이 아니라 실제 세션 위의 오버레이다 ★
 * 별도 튜토리얼 씬을 만들면 본 게임과 갈라져서 밸런스를 고칠 때마다 두 번 고쳐야 한다.
 * 그래서 이 모듈은 **판정만** 한다 — 실제로 굴러가는 세션의 상태를 보고 "지금 몇 단계이고
 * 무엇을 말해야 하는가"를 돌려줄 뿐, 게임을 멈추거나 바꾸지 않는다.
 *
 * ★ 단계 전이는 전부 게임 상태에서 파생된다 ★
 * "타워를 지었다" = `towers.length >= 1`이다. 게임 쪽에 `tutorialBuiltTower` 같은 플래그를
 * 심지 않는다 — 이 프로젝트는 이중 출처로 **실제로 두 번 당했다**(§19-4). 셸이 넘기는 것은
 * 이미 화면을 그리는 데 쓰고 있는 값들뿐이다.
 *
 * ★ 문구의 수치는 상수에서 파생한다 ★
 * 비용·개수를 문구에 손으로 적으면 밸런스를 고칠 때 **조용히 거짓말이 된다**.
 * `skill-tooltip-logic.ts`가 이미 그 패턴이고 여기서도 같은 규율을 쓴다.
 */

import {
  AIR_ENEMY_SHARE,
  ALLY_IDENTITY,
  TOWER_BUILD_COST,
  TOWER_IDENTITY,
  WAVE_COUNT,
} from '../combat';
import type { StageWaveTable, TowerKind } from '../combat';
import { GOLD_CONVERSION } from '../position';

/** 단계 식별자. 순서는 `TUTORIAL_STEPS`가 소유한다. */
export type TutorialStepId =
  | 'chart'
  | 'open'
  | 'close'
  | 'build'
  | 'antiair'
  | 'aum';

/**
 * 튜토리얼이 보는 게임 상태 — **필요한 필드만 구조적으로 좁혀 받는다.**
 *
 * `SessionSnapshot`이나 `CombatState`를 통째로 받지 않는 이유는 의존 방향을 단방향으로
 * 유지하기 위해서다(§17-2가 `AdvancingEnemy`·`WeatherViewport`로 이미 쓰는 패턴).
 * 셸이 이 모양으로 좁혀 넘기면, 저쪽 타입이 바뀌어도 여기가 깨지지 않는다.
 */
export interface TutorialView {
  /** 재생 경과(ms). 첫 단계가 "차트가 흐르는 것을 본다"라 필요하다. */
  readonly elapsedMs: number;
  /** 포지션 보유 중인가. */
  readonly holding: boolean;
  /** 지금까지의 청산 횟수. */
  readonly closeCount: number;
  /** 현재 AUM. `aum` 단계의 완료 판정에 쓴다. */
  readonly aum: number;
  /** 건설된 타워들. 종류만 본다. */
  readonly towers: readonly { readonly kind: TowerKind }[];
}

/**
 * 튜토리얼 진행 상태. **불변**이며 `advanceTutorial`이 새 객체를 돌려준다.
 */
export interface TutorialState {
  /** 현재 단계 인덱스. `TUTORIAL_STEPS.length`에 도달하면 끝난 것이다. */
  readonly stepIndex: number;
  /**
   * `aum` 단계에 들어선 순간의 AUM.
   *
   * ★ 왜 워터마크인가 ★ `CombatState`에는 **누적 처치 수가 없다**(사망은 상태가 아니라
   * 프레임 이벤트다). 그래서 "적을 잡았다"를 직접 읽을 수 없다. 대신 AUM이 늘어나는
   * 경로가 **적 처치 드롭 하나뿐**이라는 사실을 쓴다 — 단계 진입 시각의 AUM을 찍어 두고
   * 그보다 늘면 잡은 것이다.
   *
   * 이것은 게임에 심는 플래그가 아니라 **튜토리얼이 스스로 관측해 남긴 값**이라
   * 이중 출처가 아니다. 아직 그 단계에 닿지 않았으면 `null`.
   */
  readonly aumMark: number | null;
}

/** 아직 아무것도 시작하지 않은 상태. */
export function initialTutorialState(): TutorialState {
  return { stepIndex: 0, aumMark: null };
}

/** 첫 단계를 넘기기 전에 차트를 보게 하는 최소 시간. 1분봉 몇 개는 지나가야 "흐른다"가 보인다. */
const CHART_WATCH_MS = 4_000;

export interface TutorialStep {
  readonly id: TutorialStepId;
  /** 오버레이 제목. */
  readonly title: string;
  /** 무엇을 해야 하는지 한 줄. */
  readonly instruction: string;
  /** 왜 그것이 중요한지 — 루프의 어느 고리인지 알려 준다. */
  readonly why: string;
  /** 이 단계가 강조할 화면 영역. 셸이 이 값으로 하이라이트를 건다. */
  readonly focus: 'chart' | 'trade' | 'buildbar' | 'battle';
  /** 완료 판정. 게임 상태에서만 파생한다. */
  readonly isComplete: (view: TutorialView, state: TutorialState) => boolean;
}

/** `basic` 포탑 1기 값 = 시작 골드와 정확히 같다. 문구가 이 사실에 기대므로 상수에서 읽는다. */
const BASIC_TOWER_COST = TOWER_BUILD_COST.basic;
const ANTIAIR_NAME = TOWER_IDENTITY.antiair.displayName;
const BASIC_NAME = TOWER_IDENTITY.basic.displayName;
const INTERN_NAME = ALLY_IDENTITY.intern.displayName;

/** 청산 대금 전환율을 백분율 문구로. `0.5` → `50%`. */
const CONVERSION_PERCENT = Math.round(GOLD_CONVERSION * 100);

/** 공중 비율 문구용. `1/3` → `약 3분의 1`이 아니라 실제 웨이브 수로 말하는 편이 정확하다. */
export function airWaveCountOf(table: StageWaveTable): number {
  return table.airWaves.size;
}

/**
 * 단계 정의 6종.
 *
 * ①~⑤가 코어 루프 한 바퀴이고(차트 → 진입 → 청산 → 골드 → 타워 → 적 처치 → AUM),
 * 그 사이에 **공중 = 대공 전용**을 끼워 넣었다. 실측상 대공 0기는 **전 지역 패배**라
 * (첫 실점 W4) 이것을 모르면 튜토리얼을 마쳐도 판을 깰 수 없다. 루프 설명과 같은 급의
 * 정보라 별도 단계를 준다.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'chart',
    title: '① 차트를 읽는다',
    instruction: '종목도 날짜도 가려져 있다. 등락률과 거래량만 보고 방향을 정해라.',
    why: '이 차트가 전쟁 자금의 유일한 출처다. 여기서 번 돈으로만 방어를 산다.',
    focus: 'chart',
    isComplete: (view) => view.elapsedMs >= CHART_WATCH_MS,
  },
  {
    id: 'open',
    title: '② 방향에 걸어라',
    instruction: '오를 것 같으면 LONG, 내릴 것 같으면 SHORT. 투입 비율은 기본 25%다.',
    why: 'AUM(원금)을 넣어 포지션을 연다. AUM은 이 게임에서 되돌아오지 않는 재화다.',
    focus: 'trade',
    isComplete: (view) => view.holding || view.closeCount >= 1,
  },
  {
    id: 'close',
    title: '③ 청산해서 골드로 바꿔라',
    instruction: '[청산]을 눌러라. 최소 2초는 들고 있어야 한다.',
    why: `원금과 손익이 통째로 ${CONVERSION_PERCENT}% 골드가 된다. 이익만이 아니라 원금까지 넘어간다 — 그래서 "쥐고 있기"는 답이 아니다.`,
    focus: 'trade',
    isComplete: (view) => view.closeCount >= 1,
  },
  {
    id: 'build',
    title: '④ 골드로 방어를 세워라',
    instruction: `빌드바에서 ${BASIC_NAME}을 고르고 전장의 빈 슬롯을 클릭해라.`,
    why: `${BASIC_TOWER_COST} G — 시작 골드와 정확히 같은 값이다. 두 기째 자금은 첫 청산 이익에서만 나온다.`,
    focus: 'buildbar',
    isComplete: (view) => view.towers.length >= 1,
  },
  {
    id: 'antiair',
    title: '⑤ 공중은 대공만 잡는다',
    instruction: `${ANTIAIR_NAME}을 최소 1기 세워라.`,
    why: `공중 적은 대공 포대로**만** 잡힌다. 유닛도, ${BASIC_NAME}도, 광역도, 스킬도 공중을 건드리지 못한다 — 대공 없이는 지나가는 것을 보고만 있게 된다.`,
    focus: 'buildbar',
    isComplete: (view) => view.towers.some((tower) => tower.kind === 'antiair'),
  },
  {
    id: 'aum',
    title: '⑥ 적을 잡으면 원금이 돌아온다',
    instruction: `적을 처치해라. 급하면 ${INTERN_NAME}을 소환해 세워 두는 것도 방법이다.`,
    why: 'AUM이 늘어나는 경로는 이것 하나뿐이다. 방어가 무너지면 굴릴 돈도 마른다 — 루프가 여기서 닫힌다.',
    focus: 'battle',
    isComplete: (view, state) => state.aumMark !== null && view.aum > state.aumMark,
  },
];

/** 현재 단계. 전부 끝났으면 `null`. */
export function currentStep(state: TutorialState): TutorialStep | null {
  return TUTORIAL_STEPS[state.stepIndex] ?? null;
}

/**
 * 전투를 붙잡아 두는 마지막 단계.
 *
 * ①②③(차트 읽기 → 진입 → 청산)은 **돈의 흐름을 설명하는 구간**이라 전장에서 할 일이 없다.
 * 그런데 웨이브 시계는 그동안에도 돌아서, 설명을 읽는 사이에 적이 밀려들고 본진이 깎인다.
 * "튜토리얼 하는데 게임이 알아서 시작된다"는 실제 플레이 피드백이 이것이다.
 *
 * ④(타워 건설)부터는 전투가 있어야 배울 수 있으므로 거기서 푼다.
 */
const HOLD_UNTIL_STEP: TutorialStepId = 'build';

/**
 * 지금 전투를 멈춰야 하는가.
 *
 * ★ 왜 재생(차트)은 안 멈추는가 ★ ①은 "차트가 흐르는 것을 본다"이고 ②③은 실제로 매매를
 * 해 봐야 하므로 리플레이는 계속 흘러야 한다. 멈출 것은 **웨이브 진행뿐**이다.
 *
 * ⚠️ 그래서 두 시계가 어긋난다. 셸은 붙잡아 둔 시간을 **연장 시간에 그대로 얹어**
 * 전투 총시간을 보존해야 한다 — 그러지 않으면 튜토리얼을 천천히 읽은 사람이
 * 마지막 웨이브를 못 끝내고 `unresolved`(자본금 0)로 떨어진다.
 */
export function shouldHoldCombat(state: TutorialState): boolean {
  const holdIndex = TUTORIAL_STEPS.findIndex((step) => step.id === HOLD_UNTIL_STEP);
  if (holdIndex < 0) {
    return false;
  }
  return state.stepIndex < holdIndex;
}

/** 튜토리얼이 끝났는가. */
export function isTutorialDone(state: TutorialState): boolean {
  return state.stepIndex >= TUTORIAL_STEPS.length;
}

/** 진행도 `0..1`. 오버레이의 진행 막대용. */
export function tutorialProgress(state: TutorialState): number {
  const total = TUTORIAL_STEPS.length;
  if (total === 0) {
    return 1;
  }
  return Math.min(1, state.stepIndex / total);
}

/**
 * 한 프레임 진행.
 *
 * 완료된 단계는 **연속으로 넘어간다** — 예를 들어 플레이어가 튜토리얼을 무시하고 이미
 * 타워 두 기를 지어 놨다면 ④를 붙잡아 둘 이유가 없다. 가이드 모드는 진행을 막지 않는다.
 *
 * ⚠️ `aumMark`는 `aum` 단계에 **처음 들어선 프레임**에 찍는다. 매 프레임 갱신하면
 * 워터마크가 현재값을 따라다녀 영원히 완료되지 않는다.
 */
export function advanceTutorial(state: TutorialState, view: TutorialView): TutorialState {
  let index = state.stepIndex;
  let mark = state.aumMark;

  // 단계를 여러 개 건너뛸 수 있으므로 반복한다. 상한은 단계 수라 무한 루프가 불가능하다.
  for (let guard = 0; guard <= TUTORIAL_STEPS.length; guard += 1) {
    const step = TUTORIAL_STEPS[index];
    if (step === undefined) {
      break; // 전부 끝났다.
    }
    // 이 단계가 워터마크를 요구하면 진입 시점에 한 번만 찍는다.
    if (step.id === 'aum' && mark === null) {
      mark = view.aum;
    }
    if (!step.isComplete(view, { stepIndex: index, aumMark: mark })) {
      break;
    }
    index += 1;
  }

  if (index === state.stepIndex && mark === state.aumMark) {
    return state; // 변화 없음 — 같은 참조를 돌려줘 셸이 `!==`로 갱신을 판단할 수 있다.
  }
  return { stepIndex: index, aumMark: mark };
}

/**
 * 스킵할 수 있는가 (FR-9.4와 같은 관습).
 *
 * **첫 회차는 스킵 불가**다. 이 게임의 코어 루프는 화면만 봐서는 읽히지 않으므로, 처음
 * 들어온 사람에게는 한 바퀴를 끝까지 보여준다. 두 번째부터는 언제든 건너뛸 수 있다.
 *
 * @param firstRun 이번이 첫 플레이인가. 셸이 진행도(`progress.ts`)에서 판단해 넘긴다 —
 *   클리어한 지역이 하나도 없으면 첫 회차로 본다.
 */
export function canSkipTutorial(firstRun: boolean): boolean {
  return !firstRun;
}

/**
 * 오버레이가 그릴 내용 — 셸은 이 객체를 화면에 옮기기만 한다.
 *
 * 판정을 셸에 두지 않는 이유는 §19-7이다: jsdom이 없던 시절 DOM 배선 테스트가 0건이라
 * click-path 결함 5건이 전부 그 사각에 살아남았다. 판정을 여기 두면 전건 테스트가 붙는다.
 */
export interface TutorialOverlay {
  readonly visible: boolean;
  readonly stepNumber: number;
  readonly stepTotal: number;
  readonly title: string;
  readonly instruction: string;
  readonly why: string;
  readonly focus: TutorialStep['focus'] | null;
  readonly progress: number;
  readonly skippable: boolean;
  /**
   * 전투를 붙잡아 두고 있는가.
   *
   * 화면에 반드시 알려야 한다 — 적이 안 오는 것을 플레이어가 "고장"으로 읽으면
   * 튜토리얼이 오히려 불신을 만든다.
   */
  readonly combatHeld: boolean;
}

/** 전투 대기 중임을 알리는 문구. */
export const COMBAT_HELD_NOTICE = '설명이 끝날 때까지 웨이브는 멈춰 있다';

/** 현재 상태 → 화면에 그릴 내용. */
export function tutorialOverlay(state: TutorialState, firstRun: boolean): TutorialOverlay {
  const step = currentStep(state);
  return {
    visible: step !== null,
    stepNumber: Math.min(state.stepIndex + 1, TUTORIAL_STEPS.length),
    stepTotal: TUTORIAL_STEPS.length,
    title: step?.title ?? '',
    instruction: step?.instruction ?? '',
    why: step?.why ?? '',
    focus: step?.focus ?? null,
    progress: tutorialProgress(state),
    skippable: canSkipTutorial(firstRun),
    combatHeld: shouldHoldCombat(state),
  };
}

/** 즉시 종료(스킵). 스킵 불가 상태에서 부르면 아무 일도 일어나지 않는다. */
export function skipTutorial(state: TutorialState, firstRun: boolean): TutorialState {
  if (!canSkipTutorial(firstRun)) {
    return state;
  }
  if (isTutorialDone(state)) {
    return state;
  }
  return { stepIndex: TUTORIAL_STEPS.length, aumMark: state.aumMark };
}

/**
 * 공중 웨이브가 몇 개인지 — ⑤단계 문구를 지역별로 정확하게 만들고 싶을 때 셸이 쓴다.
 *
 * 상수로 박지 않는 이유: 웨이브 테이블은 지역 설정(`STAGES`)이 소유하고, 공중 비율
 * (`AIR_ENEMY_SHARE`)이 바뀌면 이 값도 같이 바뀌어야 하기 때문이다.
 */
export function airPressureNotice(table: StageWaveTable): string {
  const airWaves = airWaveCountOf(table);
  const share = Math.round(AIR_ENEMY_SHARE * 100);
  return `${WAVE_COUNT}웨이브 중 ${airWaves}개에 공중이 나온다 (등장 시 약 ${share}%가 공중).`;
}
