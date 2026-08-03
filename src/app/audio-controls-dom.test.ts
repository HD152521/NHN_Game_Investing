// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';

import { audioControlView, defaultAudioSettings, percentToVolume } from '../audio';
import { buildAudioControlsMarkup, buildStageMarkup } from './stage-dom';

/**
 * 사운드 컨트롤의 **DOM 계약** (§19-7 · §19-12).
 *
 * 셸의 `syncAudioControls`는 `audioControlView`(순수)의 결과를 DOM에 옮기기만 한다.
 * 그 "옮기는 규칙"이 실제 마크업과 맞는지를 여기서 고정한다 — 셀렉터가 어긋나면
 * 검증 3종(tsc·vitest·build)이 전부 통과하면서 브라우저에서만 조용히 죽는다.
 *
 * jsdom을 쓰는 이유: 마크업 문자열 검사만으로는 `.sr-only` 자식이나 `type="range"`의
 * 속성이 실제로 붙었는지 알 수 없다. **canvas는 여전히 없으므로**(§19-7) `mountStage`
 * 전체는 여기서 돌릴 수 없고, 컨트롤 조각만 떼어 검증한다.
 */

function mountControls(): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = buildAudioControlsMarkup();
  return host;
}

/** 셸의 `syncAudioControls`와 **같은 규칙**. 여기가 곧 그 배선의 계약이다. */
function applyView(host: HTMLElement, muted: boolean, volume: number): void {
  const view = audioControlView({ muted, volume });
  const button = host.querySelector<HTMLButtonElement>('[data-action="audio-mute"]')!;
  const slider = host.querySelector<HTMLInputElement>('[data-ref="volume-slider"]')!;
  const value = host.querySelector<HTMLElement>('[data-ref="volume-value"]')!;

  button.setAttribute('aria-pressed', view.pressed);
  button.title = view.label;
  const description = button.querySelector('.sr-only');
  if (description) description.textContent = view.label;
  slider.value = view.sliderValue;
  value.textContent = view.valueText;
}

describe('마크업 구조', () => {
  test('세 컨트롤이 전부 존재한다', () => {
    const host = mountControls();
    expect(host.querySelector('[data-action="audio-mute"]')).toBeInstanceOf(HTMLButtonElement);
    expect(host.querySelector('[data-ref="volume-slider"]')).toBeInstanceOf(HTMLInputElement);
    expect(host.querySelector('[data-ref="volume-value"]')).not.toBeNull();
  });

  test('슬라이더는 0~100 범위의 range 입력이다', () => {
    const slider = mountControls().querySelector<HTMLInputElement>('[data-ref="volume-slider"]')!;
    expect(slider.type).toBe('range');
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('100');
  });

  test('★ 슬라이더 값이 왕복해도 설정과 일치한다', () => {
    const slider = mountControls().querySelector<HTMLInputElement>('[data-ref="volume-slider"]')!;
    // 마크업의 초기값은 기본 설정에서 온다(자리표시자라도 값 자체는 틀리면 안 된다).
    expect(percentToVolume(Number(slider.value))).toBe(defaultAudioSettings().volume);
  });

  test('★ HUD의 거래량(data-ref="volume")과 이름이 겹치지 않는다', () => {
    // `[data-ref="volume"]`은 정확 일치라 슬라이더를 가리키지 않아야 한다.
    const stage = document.createElement('div');
    stage.innerHTML = buildStageMarkup();
    const hudVolume = stage.querySelector('[data-ref="volume"]');
    const slider = stage.querySelector('[data-ref="volume-slider"]');
    expect(hudVolume).not.toBeNull();
    expect(slider).not.toBeNull();
    expect(hudVolume).not.toBe(slider);
    expect(hudVolume?.textContent).toContain('거래량');
  });

  test('버튼에 접근 가능한 이름이 있다 (아이콘만 있으면 스크린리더가 못 읽는다)', () => {
    const button = mountControls().querySelector<HTMLButtonElement>(
      '[data-action="audio-mute"]',
    )!;
    expect(button.querySelector('.sr-only')?.textContent?.trim().length).toBeGreaterThan(0);
    expect(button.title.length).toBeGreaterThan(0);
  });
});

describe('★ 설정 → 화면 배선', () => {
  test('음소거를 켜면 aria-pressed와 표시가 함께 바뀐다', () => {
    const host = mountControls();
    applyView(host, true, 0.45);

    const button = host.querySelector<HTMLButtonElement>('[data-action="audio-mute"]')!;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-ref="volume-value"]')?.textContent).toBe('음소거');
    // 스크린리더 문구와 title이 같은 사실을 말한다.
    expect(button.querySelector('.sr-only')?.textContent).toBe(button.title);
  });

  test('음소거를 풀면 원래 볼륨 숫자가 돌아온다', () => {
    const host = mountControls();
    applyView(host, true, 0.8);
    applyView(host, false, 0.8);

    expect(host.querySelector<HTMLInputElement>('[data-ref="volume-slider"]')?.value).toBe('80');
    expect(host.querySelector('[data-ref="volume-value"]')?.textContent).toBe('80%');
    expect(
      host.querySelector('[data-action="audio-mute"]')?.getAttribute('aria-pressed'),
    ).toBe('false');
  });

  test('볼륨 0%와 음소거가 화면에서 구분된다', () => {
    const host = mountControls();
    applyView(host, false, 0);
    expect(host.querySelector('[data-ref="volume-value"]')?.textContent).toBe('0%');
    expect(
      host.querySelector('[data-action="audio-mute"]')?.getAttribute('aria-pressed'),
    ).toBe('false');
  });
});
