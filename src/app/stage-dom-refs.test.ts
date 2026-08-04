import { describe, expect, test } from 'vitest';

/**
 * ★ 마크업과 `collectStageRefs`의 계약 ★
 *
 * `collectStageRefs`는 **하나라도 못 찾으면 `null`을 돌려주고**, 셸은 그때 화면 전체를
 * "스테이지를 초기화하지 못했습니다"로 대체한다. 즉 ref 하나가 빠지면 게임이 통째로 죽는다.
 *
 * ⚠️ **실제로 이 사고가 났다.** 새 버튼을 추가하면서 마크업의 `data-action="${...}"`이
 * 빈 문자열이 된 채 커밋됐다(패치 스크립트를 bash 큰따옴표 안에서 돌려 셸이 `${}`를
 * 먼저 치환해 버렸다). 그런데:
 *   - `npx tsc --noEmit` 통과 — 문자열 리터럴이라 타입 오류가 아니다
 *   - `npx vitest run` 통과 — 마크업과 ref 목록을 대조하는 테스트가 없었다
 *   - `npx vite build` 통과 — 빌드는 마크업 내용을 모른다
 *   - **브라우저에서 첫 화면부터 죽었다**
 *
 * 이것이 GAME.md §19-7이 말한 "DOM 배선 테스트 0건" 사각의 전형이다. 이 파일이 그 구멍을
 * 막는다. **새 ref를 추가하면 아래 목록에도 추가해라** — 목록이 곧 계약이다.
 *
 * jsdom을 쓰지 않는다: jsdom에는 canvas가 없어 `getContext('2d')`가 `null`이라
 * `collectStageRefs`가 어차피 실패한다. 그래서 **마크업 문자열을 직접 검사**한다 —
 * 환경에 의존하지 않고, 실패했을 때 어느 ref가 빠졌는지 이름으로 알려준다.
 */
import { buildStageMarkup } from './stage-dom';

/** `collectStageRefs`가 `data-ref`로 찾는 것 전부. */
const REQUIRED_REFS: readonly string[] = [
  'chart',
  'battle',
  'stage',
  'chart-host',
  'change',
  'clock',
  'volume',
  'gold',
  'gold-announce',
  'aum',
  'wave',
  'basehp',
  'log',
  'prep',
  'prep-text',
  'reveal',
  'reveal-title',
  'reveal-subtitle',
  'reveal-canvas',
  'reveal-disclosure',
  'reveal-summary',
  'reveal-pending',
  'result',
  'result-title',
  'result-subtitle',
  'result-body',
  'tutorial',
  'tutorial-step',
  'tutorial-title',
  'tutorial-instruction',
  'tutorial-why',
  'tutorial-fill',
  'gate',
  'panel-host',
  'region-select',
  'seed-input',
  // 사운드 설정 (PRD §3.1 ⑬). HUD의 `volume`(거래량)과 **다른 이름이어야 한다** —
  // `[data-ref="volume"]`는 접두사 일치가 아니라 정확 일치라 서로를 가리지 않는다.
  'volume-slider',
  'volume-value',
  // 도감 (PRD P1 #10). 본문은 열 때마다 교체되지만 **칸 자체**는 마크업에 있어야 한다.
  'codex',
  'codex-body',
  // 세계지도 (FR-2). 목록·브리핑·상태줄·캔버스 네 칸이 전부 필요하다.
  'world-map',
  'world-list',
  'world-brief',
  'world-foot',
  'world-canvas',
  // 회사 · 부서 업그레이드 (FR-11.1).
  'company',
  'company-body',
];

/** `collectStageRefs`가 `data-action`으로 찾는 것 전부. */
const REQUIRED_ACTIONS: readonly string[] = [
  'skip-prep',
  'result-retry',
  'result-region',
  'result-card',
  'start-stage',
  'region-back',
  'tutorial-skip',
  'reveal-skip',
  'start-daily',
  'start-seed',
  'audio-mute',
  'open-codex',
  'codex-back',
  'world-back',
  'open-company',
  'company-back',
];

const MARKUP = buildStageMarkup();

describe('마크업이 collectStageRefs가 찾는 것을 전부 갖고 있다', () => {
  test.each(REQUIRED_REFS)('data-ref="%s"가 있다', (name) => {
    expect(MARKUP).toContain(`data-ref="${name}"`);
  });

  test.each(REQUIRED_ACTIONS)('data-action="%s"가 있다', (name) => {
    expect(MARKUP).toContain(`data-action="${name}"`);
  });
});

describe('★ 빈 속성 금지 — 템플릿 치환이 조용히 실패한 흔적', () => {
  test('data-action=""이 하나도 없다', () => {
    // 이 검사가 실제 사고를 잡는다. `${CONST}`가 빈 문자열로 치환되면 버튼은 렌더되지만
    // 셀렉터가 못 찾아 게임 전체가 초기화에 실패한다.
    expect(MARKUP).not.toContain('data-action=""');
  });

  test('data-ref=""이 하나도 없다', () => {
    expect(MARKUP).not.toContain('data-ref=""');
  });

  test('치환되지 않은 템플릿 자리표시자가 남아 있지 않다', () => {
    // `${...}`가 결과 문자열에 그대로 남았다면 템플릿 리터럴 밖에서 조립된 것이다.
    expect(MARKUP).not.toMatch(/\$\{/);
  });

  test('undefined·null이 문자열로 새어 나오지 않았다', () => {
    expect(MARKUP).not.toContain('="undefined"');
    expect(MARKUP).not.toContain('="null"');
  });
});

describe('오버레이는 전부 hidden으로 태어난다', () => {
  test.each([
    ['지역 선택', 'data-ref="region-select"'],
    ['공개 연출', 'data-ref="reveal"'],
    ['정산', 'data-ref="result"'],
    ['튜토리얼', 'data-ref="tutorial"'],
    ['준비 카운트다운', 'data-ref="prep"'],
    ['도감', 'data-ref="codex"'],
    ['세계지도', 'data-ref="world-map"'],
    ['회사', 'data-ref="company"'],
  ])('%s 오버레이 태그에 hidden이 있다', (_label, marker) => {
    const at = MARKUP.indexOf(marker);
    expect(at).toBeGreaterThanOrEqual(0);
    // 해당 태그가 닫히기 전에 hidden이 나와야 한다.
    const tagEnd = MARKUP.indexOf('>', at);
    const tagStart = MARKUP.lastIndexOf('<', at);
    expect(MARKUP.slice(tagStart, tagEnd)).toContain('hidden');
  });
});
