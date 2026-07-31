/**
 * 스테이지 셸 — 리플레이 엔진(src/market)과 차트 렌더러(src/chart)를 화면에 배선한다.
 *
 * Step 1 범위: "차트가 실제로 흐르는가"까지만 책임진다. 포지션(Step 2)과
 * 전투(Step 3)는 아직 붙지 않았으므로 HUD의 골드·AUM은 초기값 고정 표시다.
 *
 * 설계 메모: 리플레이는 시계를 주입받는 순수 계산기다(FR-5.4). 여기서만
 * `performance.now()`를 읽어 주입하고, 엔진·렌더러는 시계를 모른다.
 */

import { drawChart } from '../chart';
import { changePercent, createReplay, generateChartSet } from '../market';
import type { Archetype, ChartSet, Replay } from '../market';
import { applyPalette, createTheme } from '../design';
import type { ColorTheme } from '../design';

/** 캔버스 논리 해상도. CSS로 폭에 맞춰 늘어난다. */
const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 260;

/** FR-3.5 — 배속은 스테이지 시작 전에만 정해진다. */
const SPEEDS = [1, 2, 4] as const;

/** 초기 재화. PRD §9.2 `STARTING_GOLD` / `AUM_BY_DESK_LV` Lv1. */
const STARTING_GOLD = 200;
const STARTING_AUM = 2000;

const ARCHETYPES: readonly Archetype[] = ['surge', 'plunge', 'range', 'reversal'];

interface StageRefs {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly change: HTMLElement;
  readonly clock: HTMLElement;
  readonly volume: HTMLElement;
  readonly speedButtons: readonly HTMLButtonElement[];
}

interface StageSession {
  readonly set: ChartSet;
  readonly replay: Replay;
  /** 재생 시작 시각(주입 시계 기준). */
  readonly startedAtMs: number;
}

/** 09:00 + 경과 분 → `HH:MM` 표기. 장중 시각은 정체 단서가 아니므로 노출해도 된다. */
function formatSessionClock(barIndex: number): string {
  const totalMinutes = 9 * 60 + barIndex;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function buildMarkup(): string {
  const speedButtons = SPEEDS.map(
    (speed) =>
      `<button class="btn" type="button" data-speed="${speed}">${speed}x</button>`,
  ).join('');

  return `
    <div class="stage">
      <div class="stage__tags">
        <span class="stage__tag stage__blind">BLIND</span>
        <span class="stage__tag">아시아</span>
        <span class="stage__tag">금융</span>
        <span class="stage__tag">대형주</span>
        <span class="stage__spacer"></span>
        <span data-ref="volume">거래량 —</span>
      </div>

      <div class="stage__chart">
        <canvas width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"
                role="img" aria-label="블라인드 차트 리플레이"></canvas>
      </div>

      <div class="hud">
        <span class="hud__item">
          <span class="hud__label">시각</span>
          <span class="hud__value" data-ref="clock">09:00</span>
        </span>
        <span class="hud__item">
          <span class="hud__label">등락</span>
          <span class="hud__value" data-ref="change">+0.00%</span>
        </span>
        <span class="hud__item">
          <span class="hud__label">골드</span>
          <span class="hud__value hud__value--gold">${STARTING_GOLD.toLocaleString()}</span>
        </span>
        <span class="hud__item">
          <span class="hud__label">AUM</span>
          <span class="hud__value hud__value--aum">${STARTING_AUM.toLocaleString()}</span>
        </span>
      </div>

      <div class="controls">
        <button class="btn" type="button" data-action="restart">새 차트</button>
        ${speedButtons}
        <span class="controls__note">Step 1 — 리플레이만 연결됨 (매매·전투 미구현)</span>
      </div>
    </div>
  `;
}

function collectRefs(root: HTMLElement): StageRefs | null {
  const canvas = root.querySelector('canvas');
  const change = root.querySelector<HTMLElement>('[data-ref="change"]');
  const clock = root.querySelector<HTMLElement>('[data-ref="clock"]');
  const volume = root.querySelector<HTMLElement>('[data-ref="volume"]');
  if (!canvas || !change || !clock || !volume) {
    return null;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  const speedButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-speed]'));
  return { canvas, ctx, change, clock, volume, speedButtons };
}

/**
 * 스테이지를 마운트하고 정리 함수를 돌려준다.
 * 반환된 함수를 부르면 rAF 루프가 멈춘다 (HMR 대비).
 */
export function mountStage(root: HTMLElement): () => void {
  const theme: ColorTheme = createTheme();
  applyPalette(document.documentElement, theme.palette);

  root.innerHTML = buildMarkup();
  const refs = collectRefs(root);
  if (!refs) {
    root.textContent = '스테이지를 초기화하지 못했습니다 (캔버스 컨텍스트 없음).';
    return () => undefined;
  }

  let seed = 1;
  let speed: number = SPEEDS[0];
  let session: StageSession | null = null;
  let frame = 0;

  function startSession(nowMs: number): void {
    const archetype = ARCHETYPES[seed % ARCHETYPES.length] ?? 'range';
    const set = generateChartSet(seed, archetype);
    session = {
      set,
      replay: createReplay(set, { speed, startAtMs: nowMs }),
      startedAtMs: nowMs,
    };
    refs!.volume.textContent = `거래량 ${set.volumeMultiple.toFixed(1)}×`;
  }

  function syncSpeedButtons(): void {
    for (const button of refs!.speedButtons) {
      const isActive = Number(button.dataset['speed']) === speed;
      button.classList.toggle('btn--active', isActive);
    }
  }

  function render(nowMs: number): void {
    if (!session) {
      startSession(nowMs);
      return;
    }

    const state = session.replay.tick(nowMs);
    drawChart(refs!.ctx, {
      bars: session.set.bars,
      state,
      palette: theme.palette,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    });

    const delta = changePercent(session.set.bars, state.barIndex);
    refs!.change.textContent = formatSignedPercent(delta);
    refs!.change.classList.toggle('hud__value--up', delta >= 0);
    refs!.change.classList.toggle('hud__value--down', delta < 0);
    refs!.clock.textContent = formatSessionClock(state.barIndex);

    // 끝까지 재생되면 자동으로 다음 차트로 넘어간다 — Step 1 확인용 편의 동작이다.
    if (state.finished) {
      seed += 1;
      startSession(nowMs);
    }
  }

  function loop(nowMs: number): void {
    render(nowMs);
    frame = requestAnimationFrame(loop);
  }

  for (const button of refs.speedButtons) {
    button.addEventListener('click', () => {
      speed = Number(button.dataset['speed']) || 1;
      syncSpeedButtons();
      session = null; // 배속은 진행 중 바뀌지 않는다 → 세션을 새로 연다 (FR-3.5)
    });
  }

  const restart = root.querySelector<HTMLButtonElement>('[data-action="restart"]');
  restart?.addEventListener('click', () => {
    seed += 1;
    session = null;
  });

  syncSpeedButtons();
  frame = requestAnimationFrame(loop);

  return () => cancelAnimationFrame(frame);
}
