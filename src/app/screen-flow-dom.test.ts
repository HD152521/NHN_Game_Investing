// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';

/**
 * 화면 전이의 **클릭 경로 검증** (GAME.md §18-4 · §19-7).
 *
 * ★ 이 파일이 막는 사각 ★
 * 이 프로젝트에서 지금까지 브라우저에서만 드러난 결함이 5건 나왔고, 전부 tsc·vitest·build를
 * 통과한 상태였다. 원인은 하나다 — **버튼을 눌렀을 때 실제로 무슨 일이 벌어지는지**를
 * 검증하는 층이 없었다. `stage-dom-refs.test.ts`가 "마크업에 셀렉터가 있는가"까지는
 * 막지만, "그 버튼이 올바른 화면을 여는가"는 아무도 보지 않았다.
 *
 * ★ canvas 스텁을 쓰는 이유 ★
 * `collectStageRefs`는 `getContext('2d')`가 `null`이면 통째로 실패하고, jsdom에는 canvas가
 * 없다(§19-7이 "그래서 mountStage는 못 돌린다"고 적어 둔 지점). 여기서는 **아무 것도 하지
 * 않는 2D 컨텍스트**를 심어 그 벽을 넘는다. 그림은 검증하지 않는다 — 검증 대상은
 * 화면 전이지 픽셀이 아니다.
 */
import { mountStage } from './stage';
import { WORLD_REGIONS } from './world-map';

/**
 * 무엇을 불러도 조용히 넘어가는 2D 컨텍스트.
 *
 * 실제 메서드를 하나씩 나열하지 않는 이유: 렌더 경로가 쓰는 API가 늘 때마다 이 스텁을
 * 따라 고쳐야 하고, 빠뜨리면 테스트가 **구현 변경 때문에** 깨진다. Proxy 로 전부 받는다.
 */
function stubContext(): CanvasRenderingContext2D {
  const noop = (): void => {};
  const target: Record<string, unknown> = {
    canvas: null,
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    createImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  };
  return new Proxy(target, {
    get(store, key: string) {
      if (key in store) return store[key];
      // 알 수 없는 프로퍼티는 함수로도, 값으로도 쓰일 수 있다. 함수를 준다 —
      // 값으로 읽히면 truthy 한 함수 객체가 되어 널 검사에 걸리지 않는다.
      return noop;
    },
    set(store, key: string, value) {
      store[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function installCanvas(): void {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => stubContext()) as never;
}

interface Screens {
  readonly gate: HTMLElement;
  readonly world: HTMLElement;
  readonly region: HTMLElement;
  readonly codex: HTMLElement;
}

function mount(): { root: HTMLElement; screens: Screens } {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  mountStage(root);

  const pick = (name: string): HTMLElement =>
    root.querySelector<HTMLElement>(`[data-ref="${name}"]`)!;

  return {
    root,
    screens: {
      gate: pick('gate'),
      world: pick('world-map'),
      region: pick('region-select'),
      codex: pick('codex'),
    },
  };
}

function click(root: HTMLElement, action: string): void {
  const button = root.querySelector<HTMLElement>(`[data-action="${action}"]`);
  expect(button, `data-action="${action}" 버튼을 찾지 못했다`).not.toBeNull();
  button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function pressEscape(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
}

/** 지금 열려 있는 오버레이 이름들. 겹쳐 열리는 사고를 이름으로 잡는다. */
function openScreens(screens: Screens): readonly string[] {
  return Object.entries(screens)
    .filter(([, element]) => !element.hidden)
    .map(([name]) => name);
}

beforeEach(() => {
  installCanvas();
});

describe('★ mountStage가 jsdom에서 살아난다', () => {
  test('초기화에 실패하지 않는다 — collectStageRefs가 null이 아니다', () => {
    const { root } = mount();
    // 초기화 실패 시 셸은 화면 전체를 안내 문구로 대체한다. 스테이지가 남아 있으면 성공이다.
    expect(root.querySelector('[data-ref="stage"]')).not.toBeNull();
    expect(root.textContent).not.toContain('초기화하지 못했습니다');
  });

  test('첫 화면은 타이틀 하나뿐이다', () => {
    const { screens } = mount();
    expect(openScreens(screens)).toEqual(['gate']);
  });
});

describe('타이틀 → 세계지도 → 전선 선택', () => {
  test('[스테이지 시작]이 세계지도를 연다 (전선 선택을 건너뛰지 않는다)', () => {
    const { root, screens } = mount();
    click(root, 'start-stage');
    expect(openScreens(screens)).toEqual(['world']);
  });

  test('세계지도가 10지역을 그린다', () => {
    const { root, screens } = mount();
    click(root, 'start-stage');
    expect(
      screens.world.querySelectorAll('[data-action="select-world-region"]'),
    ).toHaveLength(WORLD_REGIONS.length);
  });

  test('★ [진입]이 전선 선택을 연다', () => {
    const { root, screens } = mount();
    click(root, 'start-stage');
    click(root, 'world-enter');
    expect(openScreens(screens)).toEqual(['region']);
  });

  test('전선 선택의 [← 세계지도]는 한 층 위로만 간다 — 타이틀까지 가지 않는다', () => {
    const { root, screens } = mount();
    click(root, 'start-stage');
    click(root, 'world-enter');
    click(root, 'region-back');
    expect(openScreens(screens)).toEqual(['world']);
  });

  test('세계지도의 [← 타이틀로]가 타이틀로 돌아간다', () => {
    const { root, screens } = mount();
    click(root, 'start-stage');
    click(root, 'world-back');
    expect(openScreens(screens)).toEqual(['gate']);
  });
});

describe('세계지도 — 선택과 잠금', () => {
  test('지역을 고르면 브리핑이 그 지역으로 바뀐다', () => {
    const { root, screens } = mount();
    click(root, 'start-stage');

    const japan = screens.world.querySelector<HTMLElement>('[data-world="japan"]')!;
    japan.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const brief = root.querySelector<HTMLElement>('[data-ref="world-brief"]')!;
    expect(brief.textContent).toContain('일본');
  });

  test('★ 준비 중 지역은 진입 버튼이 잠긴다 — 빈 화면으로 들어갈 수 없다', () => {
    const { root, screens } = mount();
    click(root, 'start-stage');

    screens.world
      .querySelector<HTMLElement>('[data-world="japan"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const enter = root.querySelector<HTMLButtonElement>('[data-action="world-enter"]')!;
    expect(enter.disabled).toBe(true);

    // 눌러도 아무 일이 없어야 한다 — 세계지도가 그대로 열려 있다.
    enter.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(openScreens(screens)).toEqual(['world']);
  });

  test('한국은 선택 표시가 붙고 진입이 열려 있다', () => {
    const { root, screens } = mount();
    click(root, 'start-stage');
    const korea = screens.world.querySelector<HTMLElement>('[data-world="korea"]')!;
    expect(korea.classList.contains('wmap__row--on')).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[data-action="world-enter"]')!.disabled).toBe(
      false,
    );
  });
});

describe('도감', () => {
  test('타이틀의 [도감]이 도감을 연다', () => {
    const { root, screens } = mount();
    click(root, 'open-codex');
    expect(openScreens(screens)).toEqual(['codex']);
  });

  test('빈 도감에도 안내가 뜬다 (수집 0)', () => {
    const { root } = mount();
    click(root, 'open-codex');
    expect(root.querySelector('[data-ref="codex-body"]')!.textContent).toContain('수집 0');
  });

  test('★ 필터 탭이 본문 교체 후에도 계속 동작한다 (위임 배선)', () => {
    const { root } = mount();
    click(root, 'open-codex');
    const body = root.querySelector<HTMLElement>('[data-ref="codex-body"]')!;

    // 한 번 누르면 본문이 통째로 교체된다. 버튼별 리스너였다면 여기서 죽는다.
    body
      .querySelector<HTMLElement>('[data-filter="plunge"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(
      body.querySelector<HTMLElement>('[data-filter="plunge"]')!.getAttribute('aria-pressed'),
    ).toBe('true');

    // 교체된 뒤의 새 버튼도 받아야 한다.
    body
      .querySelector<HTMLElement>('[data-filter="surge"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(
      body.querySelector<HTMLElement>('[data-filter="surge"]')!.getAttribute('aria-pressed'),
    ).toBe('true');
  });

  test('[← 타이틀로]가 타이틀로 돌아간다', () => {
    const { root, screens } = mount();
    click(root, 'open-codex');
    click(root, 'codex-back');
    expect(openScreens(screens)).toEqual(['gate']);
  });
});

describe('Esc — 한 층씩 뒤로', () => {
  test('전선 선택 → 세계지도', () => {
    const { root, screens } = mount();
    click(root, 'start-stage');
    click(root, 'world-enter');
    pressEscape();
    expect(openScreens(screens)).toEqual(['world']);
  });

  test('세계지도 → 타이틀', () => {
    const { root, screens } = mount();
    click(root, 'start-stage');
    pressEscape();
    expect(openScreens(screens)).toEqual(['gate']);
  });

  test('도감 → 타이틀', () => {
    const { root, screens } = mount();
    click(root, 'open-codex');
    pressEscape();
    expect(openScreens(screens)).toEqual(['gate']);
  });

  test('★ 두 번 누르면 전선 선택에서 타이틀까지 정확히 두 층을 거친다', () => {
    const { root, screens } = mount();
    click(root, 'start-stage');
    click(root, 'world-enter');
    pressEscape();
    pressEscape();
    expect(openScreens(screens)).toEqual(['gate']);
  });
});

describe('★ 오버레이가 겹쳐 열리지 않는다', () => {
  test.each([
    ['타이틀', [] as readonly string[]],
    ['세계지도', ['start-stage']],
    ['전선 선택', ['start-stage', 'world-enter']],
    ['도감', ['open-codex']],
  ])('%s 에서 열린 오버레이는 정확히 하나다', (_label, actions) => {
    const { root, screens } = mount();
    for (const action of actions) click(root, action);
    expect(openScreens(screens)).toHaveLength(1);
  });

  test('도감을 열었다 닫고 세계지도로 가도 도감이 남아 있지 않다', () => {
    const { root, screens } = mount();
    click(root, 'open-codex');
    click(root, 'codex-back');
    click(root, 'start-stage');
    expect(openScreens(screens)).toEqual(['world']);
  });
});
