import { describe, expect, test } from 'vitest';

/**
 * 튜토리얼 단계 전이 판정 — 전건.
 *
 * 순수 함수라 node 환경에서 돈다(jsdom 불필요). 오버레이 DOM 배선은 셸이 맡고,
 * 여기서는 "무엇을 보여줄지"를 고정한다 — 판정을 셸에 두면 §19-7의 사각으로 들어간다.
 */
import { STAGES, TOWER_BUILD_COST, TOWER_IDENTITY, WAVE_COUNT } from '../combat';
import { GOLD_CONVERSION } from '../position';
import {
  TUTORIAL_STEPS,
  advanceTutorial,
  airPressureNotice,
  airWaveCountOf,
  canSkipTutorial,
  currentStep,
  shouldHoldCombat,
  initialTutorialState,
  isTutorialDone,
  skipTutorial,
  tutorialOverlay,
  tutorialProgress,
} from './tutorial';
import type { TutorialState, TutorialView } from './tutorial';

/** 아무것도 안 한 플레이어. 각 테스트가 필요한 필드만 덮어쓴다. */
function view(overrides: Partial<TutorialView> = {}): TutorialView {
  return {
    elapsedMs: 0,
    holding: false,
    closeCount: 0,
    aum: 2000,
    towers: [],
    ...overrides,
  };
}

/** 단계 id로 상태를 만든다 — 인덱스를 손으로 세지 않으려고. */
function stateAt(id: string, aumMark: number | null = null): TutorialState {
  const index = TUTORIAL_STEPS.findIndex((step) => step.id === id);
  if (index < 0) throw new Error(`알 수 없는 단계: ${id}`);
  return { stepIndex: index, aumMark };
}

describe('단계 구성', () => {
  test('코어 루프 한 바퀴 + 공중 경고로 6단계다', () => {
    expect(TUTORIAL_STEPS.map((step) => step.id)).toEqual([
      'chart',
      'open',
      'close',
      'build',
      'antiair',
      'aum',
    ]);
  });

  test('★ 공중 = 대공 전용에 반드시 한 단계가 배정된다 — 모르면 판을 깰 수 없다', () => {
    const step = TUTORIAL_STEPS.find((s) => s.id === 'antiair');
    expect(step).toBeDefined();
    expect(step?.instruction).toContain(TOWER_IDENTITY.antiair.displayName);
  });

  test('모든 단계에 제목·지시·이유가 있다 — 무엇을/왜가 둘 다 필요하다', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.instruction.length).toBeGreaterThan(0);
      expect(step.why.length).toBeGreaterThan(0);
    }
  });
});

describe('문구 수치는 상수에서 파생된다 (손으로 적으면 조용히 거짓이 된다)', () => {
  test('타워 건설 단계는 실제 건설 비용을 말한다', () => {
    const step = TUTORIAL_STEPS.find((s) => s.id === 'build');
    expect(step?.why).toContain(String(TOWER_BUILD_COST.basic));
  });

  test('청산 단계는 실제 전환율을 말한다', () => {
    const step = TUTORIAL_STEPS.find((s) => s.id === 'close');
    expect(step?.why).toContain(String(Math.round(GOLD_CONVERSION * 100)));
  });

  test('타워 이름은 identity에서 온다 — 화면이 이름을 다시 적지 않는다', () => {
    const step = TUTORIAL_STEPS.find((s) => s.id === 'build');
    expect(step?.instruction).toContain(TOWER_IDENTITY.basic.displayName);
  });

  test('공중 압력 문구는 웨이브 테이블에서 파생된다', () => {
    const notice = airPressureNotice(STAGES.R1.waveTable);
    expect(notice).toContain(String(WAVE_COUNT));
    expect(notice).toContain(String(airWaveCountOf(STAGES.R1.waveTable)));
  });
});

describe('① 차트 — 재생을 좀 봐야 넘어간다', () => {
  test('시작 직후에는 넘어가지 않는다', () => {
    expect(advanceTutorial(initialTutorialState(), view()).stepIndex).toBe(0);
  });

  test('충분히 흐르면 다음 단계로', () => {
    const next = advanceTutorial(initialTutorialState(), view({ elapsedMs: 5_000 }));
    expect(currentStep(next)?.id).toBe('open');
  });
});

describe('② 진입 — 보유 중이거나 이미 청산했으면 완료', () => {
  test('포지션을 열면 완료된다', () => {
    const next = advanceTutorial(stateAt('open'), view({ holding: true }));
    expect(currentStep(next)?.id).toBe('close');
  });

  test('튜토리얼보다 앞서 나가 이미 청산했어도 완료로 친다 — 진행을 막지 않는다', () => {
    const next = advanceTutorial(stateAt('open'), view({ closeCount: 1 }));
    expect(currentStep(next)?.id).toBe('build');
  });
});

describe('③ 청산 — 골드로 바뀐다', () => {
  test('청산 전에는 넘어가지 않는다', () => {
    expect(currentStep(advanceTutorial(stateAt('close'), view({ holding: true })))?.id).toBe(
      'close',
    );
  });

  test('청산하면 완료된다', () => {
    expect(currentStep(advanceTutorial(stateAt('close'), view({ closeCount: 1 })))?.id).toBe(
      'build',
    );
  });
});

describe('④⑤ 타워 — 종류를 구분한다', () => {
  test('아무 타워나 지으면 ④가 완료된다', () => {
    const next = advanceTutorial(stateAt('build'), view({ towers: [{ kind: 'basic' }] }));
    expect(currentStep(next)?.id).toBe('antiair');
  });

  test('★ 기본 포탑만으로는 ⑤가 완료되지 않는다 — 대공이어야 한다', () => {
    const next = advanceTutorial(stateAt('antiair'), view({ towers: [{ kind: 'basic' }] }));
    expect(currentStep(next)?.id).toBe('antiair');
  });

  test('광역 포탑도 ⑤를 완료시키지 못한다 — 공중을 못 때린다', () => {
    const next = advanceTutorial(stateAt('antiair'), view({ towers: [{ kind: 'splash' }] }));
    expect(currentStep(next)?.id).toBe('antiair');
  });

  test('대공을 세우면 ⑤가 완료된다', () => {
    const next = advanceTutorial(stateAt('antiair'), view({ towers: [{ kind: 'antiair' }] }));
    expect(currentStep(next)?.id).toBe('aum');
  });
});

describe('⑥ AUM 워터마크 — 적을 잡았는지를 AUM 증가로 판정한다', () => {
  test('단계에 들어선 프레임에 워터마크를 찍는다', () => {
    const next = advanceTutorial(stateAt('aum'), view({ aum: 1500 }));
    expect(next.aumMark).toBe(1500);
    expect(isTutorialDone(next)).toBe(false);
  });

  test('AUM이 그대로면 완료되지 않는다', () => {
    const marked = advanceTutorial(stateAt('aum'), view({ aum: 1500 }));
    expect(isTutorialDone(advanceTutorial(marked, view({ aum: 1500 })))).toBe(false);
  });

  test('AUM이 줄어도(진입·S-03) 완료되지 않는다', () => {
    const marked = advanceTutorial(stateAt('aum'), view({ aum: 1500 }));
    expect(isTutorialDone(advanceTutorial(marked, view({ aum: 900 })))).toBe(false);
  });

  test('★ AUM이 늘면(적 처치 드롭) 완료된다 — 루프가 닫힌다', () => {
    const marked = advanceTutorial(stateAt('aum'), view({ aum: 1500 }));
    expect(isTutorialDone(advanceTutorial(marked, view({ aum: 1550 })))).toBe(true);
  });

  test('⚠️ 워터마크는 매 프레임 갱신되지 않는다 — 갱신하면 영원히 완료되지 않는다', () => {
    let state = advanceTutorial(stateAt('aum'), view({ aum: 1500 }));
    // AUM이 계속 줄어드는 동안에도 워터마크는 최초값을 지킨다.
    state = advanceTutorial(state, view({ aum: 1200 }));
    state = advanceTutorial(state, view({ aum: 1000 }));
    expect(state.aumMark).toBe(1500);
  });
});

describe('연속 전이 — 가이드 모드는 진행을 막지 않는다', () => {
  test('튜토리얼을 무시하고 앞서 나간 플레이어는 여러 단계를 한 번에 통과한다', () => {
    const done = advanceTutorial(
      initialTutorialState(),
      view({
        elapsedMs: 10_000,
        closeCount: 3,
        towers: [{ kind: 'basic' }, { kind: 'antiair' }],
        aum: 2000,
      }),
    );
    // ⑥만 남는다 — 워터마크가 이제 막 찍혔으므로 아직 끝나지 않았다.
    expect(currentStep(done)?.id).toBe('aum');
    expect(done.aumMark).toBe(2000);
  });

  test('변화가 없으면 같은 참조를 돌려준다 — 셸이 !==로 갱신을 판단한다', () => {
    const state = stateAt('open');
    expect(advanceTutorial(state, view())).toBe(state);
  });

  test('끝난 뒤 더 진행해도 인덱스가 넘치지 않는다', () => {
    const done: TutorialState = { stepIndex: TUTORIAL_STEPS.length, aumMark: 0 };
    expect(advanceTutorial(done, view({ aum: 9999 }))).toBe(done);
    expect(currentStep(done)).toBeNull();
  });
});

/**
 * ★ 실제 플레이 피드백에서 나온 버그 ★
 * "튜토리얼 하는데 게임이 알아서 시작된다" — ①②③을 읽는 동안 웨이브 시계가 돌아
 * 적이 밀려들고 본진이 깎였다. GAME.md §15-1이 경고한 바로 그 함정이다.
 */
describe('전투 보류 — 돈의 흐름을 설명하는 동안 웨이브를 멈춘다', () => {
  test('①②③(차트·진입·청산)에서는 전투를 멈춘다', () => {
    for (const id of ['chart', 'open', 'close']) {
      expect(shouldHoldCombat(stateAt(id))).toBe(true);
    }
  });

  test('④부터는 푼다 — 타워는 전투가 있어야 배운다', () => {
    for (const id of ['build', 'antiair', 'aum']) {
      expect(shouldHoldCombat(stateAt(id))).toBe(false);
    }
  });

  test('튜토리얼이 끝나면 당연히 안 멈춘다', () => {
    expect(shouldHoldCombat({ stepIndex: TUTORIAL_STEPS.length, aumMark: null })).toBe(false);
  });

  test('스킵하면 즉시 풀린다 — 스킵은 "설명 없이 바로 하겠다"는 뜻이다', () => {
    expect(shouldHoldCombat(skipTutorial(stateAt('chart')))).toBe(false);
  });

  test('오버레이가 전투 보류를 화면에 알린다 — 안 알리면 "고장"으로 읽힌다', () => {
    expect(tutorialOverlay(stateAt('open')).combatHeld).toBe(true);
    expect(tutorialOverlay(stateAt('build')).combatHeld).toBe(false);
  });
});

/**
 * ★ 실제 플레이 피드백: "건너뛰기 버튼이 안 됨" ★
 * 첫 회차 판정을 "클리어한 지역이 0개"로 했더니 지역을 깨기 전에는 영원히 0이라
 * 버튼이 영구 비활성이었다. 강제 튜토리얼 자체를 버리고 항상 스킵 가능으로 바꿨다.
 */
describe('스킵 — 항상 가능하다', () => {
  test('언제나 스킵할 수 있다 — 영구 비활성 버튼을 만들지 않는다', () => {
    expect(canSkipTutorial()).toBe(true);
  });

  test('첫 단계에서도 스킵된다', () => {
    expect(isTutorialDone(skipTutorial(stateAt('chart')))).toBe(true);
  });

  test('중간 단계에서도 스킵된다', () => {
    expect(isTutorialDone(skipTutorial(stateAt('open')))).toBe(true);
  });

  test('이미 끝났으면 스킵해도 같은 참조다', () => {
    const done = skipTutorial(stateAt('open'));
    expect(skipTutorial(done)).toBe(done);
  });
});

describe('오버레이 — 셸은 이 객체를 화면에 옮기기만 한다', () => {
  test('진행 중에는 보이고 단계 번호가 1부터 센다', () => {
    const overlay = tutorialOverlay(initialTutorialState());
    expect(overlay.visible).toBe(true);
    expect(overlay.stepNumber).toBe(1);
    expect(overlay.stepTotal).toBe(TUTORIAL_STEPS.length);
    expect(overlay.skippable).toBe(true);
  });

  test('끝나면 숨는다', () => {
    const overlay = tutorialOverlay({ stepIndex: TUTORIAL_STEPS.length, aumMark: 0 });
    expect(overlay.visible).toBe(false);
    expect(overlay.focus).toBeNull();
    expect(overlay.progress).toBe(1);
  });

  test('각 단계가 강조할 화면 영역을 지정한다', () => {
    expect(tutorialOverlay(stateAt('chart')).focus).toBe('chart');
    expect(tutorialOverlay(stateAt('open')).focus).toBe('trade');
    expect(tutorialOverlay(stateAt('build')).focus).toBe('buildbar');
    expect(tutorialOverlay(stateAt('aum')).focus).toBe('battle');
  });

  test('진행도는 0에서 1로 단조 증가한다', () => {
    const values = TUTORIAL_STEPS.map((_step, index) =>
      tutorialProgress({ stepIndex: index, aumMark: null }),
    );
    expect(values[0]).toBe(0);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
  });
});
