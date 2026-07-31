/**
 * 타이틀 / 시작 게이트 — 링크를 연 사람이 **처음 3초에 보는 화면**.
 *
 * 여기서 전달해야 하는 것은 딱 세 가지다: 이 게임의 이름 / 무엇을 하는 게임인지 /
 * 어디를 눌러야 시작하는지. 그 이상은 넣지 않는다.
 *
 * 마크업을 순수 문자열 함수로 두는 이유는 테스트다 (이 프로젝트 vitest는 node 환경).
 * DOM 배선과 정지 상태 보장은 `stage.ts` + `frame-loop.ts`가 맡는다.
 */

export const GAME_TITLE = 'TICKER FRONT';

/** 장르를 한눈에 박아 두는 윗줄. 차트 게임인지 디펜스인지 헷갈리지 않게 둘 다 적는다. */
export const GATE_EYEBROW = 'BLIND CHART · TOWER DEFENSE';

/**
 * 한 문장 목표 (PRD §1.1 제품 정의 축약).
 *
 * 원문은 "정체를 가린 실제 과거 거래일 차트를 읽어 전쟁 자금을 만들고, 그 돈으로
 * 일자형 타워디펜스 웨이브를 막아 …"다. 여기서 첫 화면에 필요한 인과만 남겼다:
 * **차트 → 자금 → 방어**. "이름을 지운 실제 거래일"을 살린 이유는 이것이 이 게임을
 * 다른 디펜스 게임과 구분하는 유일한 훅이기 때문이다 (PRD H2 · 공개의 쾌감).
 */
export const GATE_GOAL =
  '이름을 지운 실제 거래일 차트를 맞혀 전쟁 자금을 벌고, 그 돈으로 본진을 노리는 침공을 막아라.';

/**
 * 인과 3단계. 한 문장을 읽지 않고 지나가는 사람도 이 줄만 보면 구조가 잡힌다.
 * 번호를 붙인 이유는 순서가 곧 코어 루프라서다.
 */
export const GATE_FLOW_STEPS = ['① 차트 판독', '② 전쟁 자금', '③ 방어선 사수'] as const;

/** 클리어 보상(정체 공개)을 미리 걸어 두는 한 줄. 시작 동기를 만든다. */
export const GATE_HINT = '막아내면 이것이 어느 회사의 어떤 날이었는지 공개된다.';

export const START_BUTTON_LABEL = '스테이지 시작';

/** `stage.ts`가 이 값으로 시작 버튼을 찾는다. */
export const GATE_START_ACTION = 'start-stage';

const TITLE_ID = 'gate-title';

export function buildStartGateMarkup(): string {
  const steps = GATE_FLOW_STEPS.map(
    (step) => `<li class="gate__step">${step}</li>`,
  ).join('');

  return `
    <div class="gate" data-ref="gate" role="dialog" aria-modal="true" aria-labelledby="${TITLE_ID}">
      <div class="gate__tape" aria-hidden="true"></div>
      <div class="gate__panel">
        <p class="gate__eyebrow">${GATE_EYEBROW}</p>
        <h1 class="gate__title" id="${TITLE_ID}">${GAME_TITLE}</h1>
        <p class="gate__goal">${GATE_GOAL}</p>
        <ol class="gate__flow">${steps}</ol>
        <button class="gate__start" type="button" data-action="${GATE_START_ACTION}">
          ${START_BUTTON_LABEL}
        </button>
        <p class="gate__hint">${GATE_HINT}</p>
      </div>
    </div>
  `;
}
