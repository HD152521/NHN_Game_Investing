/**
 * 마운트 배선 테스트 — 이 프로젝트 vitest 는 **node 환경이고 jsdom 의존성이 없다**
 * (`trade-panel.test.ts` 머리주석 참고). 그래서 DOM 대신 필요한 표면만 가진 가짜를 만들어
 * "속성을 훑어 → 칸을 잘라 → 캔버스에 굽는다" 는 배선 자체를 검증한다.
 */

import { describe, expect, test } from 'vitest';

import { createSpriteRasterCache } from '../sprites/render';
import {
  createSoftwareSurface,
  createSoftwareSurfaceFactory,
  pixelAt,
} from '../sprites/render/testing/software-canvas';
import type { SoftwareSurface } from '../sprites/render/testing/software-canvas';
import { HUD_ICON_ATTR, UI_ICON_NAMES, mountHudIcons } from './sprite-icons';
import { PREDICTION_ART_ATTR, mountPredictionButtonArt } from './sprite-buttons';

interface FakeCanvas {
  width: number;
  height: number;
  className: string;
  readonly surface: SoftwareSurface;
}

interface FakeHost {
  readonly attributes: Readonly<Record<string, string>>;
  children: readonly FakeCanvas[];
}

/** `paintRasterToCanvas` 가 실제로 쓰는 표면만 흉내 낸다. */
function makeDom(hosts: readonly FakeHost[], attr: string) {
  const created: FakeCanvas[] = [];

  const document = {
    createElement(): FakeCanvas {
      const surface = createSoftwareSurface(256, 256);
      const canvas: FakeCanvas = {
        width: 0,
        height: 0,
        className: '',
        surface,
        // eslint 없는 프로젝트라 구조만 맞춘다 — `getContext` 는 캔버스 API 그대로다.
        getContext: (id: string) => (id === '2d' ? surface.getContext('2d') : null),
      } as FakeCanvas & { getContext(id: string): unknown };
      created.push(canvas);
      return canvas;
    },
  };

  const root = {
    querySelectorAll: (selector: string) =>
      selector === `[${attr}]`
        ? hosts.map((host) => ({
            getAttribute: (name: string) => host.attributes[name] ?? null,
            ownerDocument: document,
            replaceChildren: (child: FakeCanvas) => {
              host.children = [child];
            },
          }))
        : [],
  };

  return { root: root as unknown as ParentNode, created };
}

describe('mountHudIcons — HUD 자리 표시자에 아이콘을 꽂는다', () => {
  test('유효한 이름 6종을 전부 굽는다', () => {
    const hosts: FakeHost[] = UI_ICON_NAMES.map((name) => ({
      attributes: { [HUD_ICON_ATTR]: name },
      children: [],
    }));
    const { root, created } = makeDom(hosts, HUD_ICON_ATTR);

    const painted = mountHudIcons(root, {
      rasters: createSpriteRasterCache({ createSurface: createSoftwareSurfaceFactory() }),
    });

    expect(painted).toBe(UI_ICON_NAMES.length);
    expect(created).toHaveLength(UI_ICON_NAMES.length);
    for (const canvas of created) {
      expect(canvas.width).toBe(18);
      expect(canvas.height).toBe(17);
      expect(canvas.className).toBe('hud__icon-art');
    }
    for (const host of hosts) {
      expect(host.children).toHaveLength(1);
    }
  });

  test('알 수 없는 이름은 조용히 건너뛴다', () => {
    const hosts: FakeHost[] = [
      { attributes: { [HUD_ICON_ATTR]: 'nope' }, children: [] },
      { attributes: {}, children: [] },
    ];
    const { root } = makeDom(hosts, HUD_ICON_ATTR);

    expect(
      mountHudIcons(root, {
        rasters: createSpriteRasterCache({ createSurface: createSoftwareSurfaceFactory() }),
      }),
    ).toBe(0);
    expect(hosts[0]?.children).toHaveLength(0);
  });

  test('캔버스를 못 만드는 환경이면 0을 돌려주고 크래시하지 않는다', () => {
    const hosts: FakeHost[] = [{ attributes: { [HUD_ICON_ATTR]: 'gold' }, children: [] }];
    const { root } = makeDom(hosts, HUD_ICON_ATTR);

    expect(mountHudIcons(root, { rasters: createSpriteRasterCache({ createSurface: () => null }) })).toBe(0);
  });
});

describe('mountPredictionButtonArt — 예측 버튼 배경을 꽂는다', () => {
  test('long / short 두 판을 2× 배율로 굽는다', () => {
    const hosts: FakeHost[] = [
      { attributes: { [PREDICTION_ART_ATTR]: 'long' }, children: [] },
      { attributes: { [PREDICTION_ART_ATTR]: 'short' }, children: [] },
    ];
    const { root, created } = makeDom(hosts, PREDICTION_ART_ATTR);

    const painted = mountPredictionButtonArt(root, {
      rasters: createSpriteRasterCache({ createSurface: createSoftwareSurfaceFactory() }),
    });

    expect(painted).toBe(2);
    for (const canvas of created) {
      // 40×17 시트 칸을 2× 로 구우면 80×34 — trade-panel.css 의 패딩 박스와 정확히 같다.
      expect(canvas.width).toBe(80);
      expect(canvas.height).toBe(34);
    }
  });

  test('두 버튼이 실제로 서로 다른 픽셀을 갖는다', () => {
    const hosts: FakeHost[] = [
      { attributes: { [PREDICTION_ART_ATTR]: 'long' }, children: [] },
      { attributes: { [PREDICTION_ART_ATTR]: 'short' }, children: [] },
    ];
    const { root, created } = makeDom(hosts, PREDICTION_ART_ATTR);
    mountPredictionButtonArt(root, {
      rasters: createSpriteRasterCache({ createSurface: createSoftwareSurfaceFactory() }),
    });

    const [longCanvas, shortCanvas] = created;
    expect(longCanvas).toBeDefined();
    expect(shortCanvas).toBeDefined();

    let differing = 0;
    for (let y = 0; y < 34; y += 1) {
      for (let x = 0; x < 80; x += 1) {
        const a = pixelAt(longCanvas?.surface as SoftwareSurface, x, y).join(',');
        const b = pixelAt(shortCanvas?.surface as SoftwareSurface, x, y).join(',');
        if (a !== b) differing += 1;
      }
    }
    expect(differing).toBeGreaterThan(200);
  });
});
