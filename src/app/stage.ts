/**
 * 스테이지 셸 — 리플레이(src/market) · 차트(src/chart) · 매매 판정(src/position) ·
 * 매매 패널(src/ui)을 하나의 프레임 루프로 묶는다.
 *
 * Step 2 범위: 차트 재생 + 자유 매매(진입·청산·강제청산)까지. 전투(Step 3)는 아직 없어서
 * 벌어들인 골드를 쓸 곳이 없다.
 *
 * 설계 메모: 리플레이와 판정은 시계를 주입받는 순수 계산기다. `performance.now()`를
 * 읽는 곳은 이 파일의 rAF 루프 하나뿐이다.
 */

import './shell.css';
import '../ui/trade-panel.css';

import { drawChart } from '../chart';
import { changePercent } from '../market';
import { applyPalette, createTheme } from '../design';
import type { ColorTheme } from '../design';
import { STAKE_PRESETS } from '../position';
import type { Direction } from '../position';
import { createTradePanel } from '../ui';
import type { StakeRatio, TradePanel, TradePanelViewModel } from '../ui';
import { STARTING_AUM, STARTING_GOLD, StageSession } from './session';

/** 캔버스 논리 해상도. CSS로 폭에 맞춰 늘어난다. */
const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 260;

/** FR-3.5 — 배속은 스테이지 시작 전에만 정해진다. */
const SPEEDS = [1, 2, 4] as const;

const DEFAULT_STAKE_RATIO: StakeRatio = 0.25;

interface StageRefs {
  readonly ctx: CanvasRenderingContext2D;
  readonly change: HTMLElement;
  readonly clock: HTMLElement;
  readonly volume: HTMLElement;
  readonly log: HTMLElement;
  readonly speedButtons: readonly HTMLButtonElement[];
}

/** 09:00 + 경과 분 → `HH:MM`. 장중 시각은 정체 단서가 아니므로 노출해도 된다. */
function formatSessionClock(barIndex: number): string {
  const totalMinutes = 9 * 60 + barIndex;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatSignedPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function buildMarkup(): string {
  const speedButtons = SPEEDS.map(
    (speed) => `<button class="btn" type="button" data-speed="${speed}">${speed}x</button>`,
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
          <span class="hud__value hud__value--gold" data-ref="gold">${STARTING_GOLD}</span>
        </span>
        <span class="hud__item">
          <span class="hud__label">AUM</span>
          <span class="hud__value hud__value--aum" data-ref="aum">${STARTING_AUM}</span>
        </span>
      </div>

      <div data-ref="panel-host"></div>

      <div class="controls">
        <button class="btn" type="button" data-action="restart">새 차트</button>
        ${speedButtons}
        <span class="controls__note" data-ref="log">Step 2 — 매매 연결됨 (전투 미구현)</span>
      </div>
    </div>
  `;
}

function collectRefs(root: HTMLElement): StageRefs | null {
  const canvas = root.querySelector('canvas');
  const change = root.querySelector<HTMLElement>('[data-ref="change"]');
  const clock = root.querySelector<HTMLElement>('[data-ref="clock"]');
  const volume = root.querySelector<HTMLElement>('[data-ref="volume"]');
  const log = root.querySelector<HTMLElement>('[data-ref="log"]');
  if (!canvas || !change || !clock || !volume || !log) {
    return null;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  return {
    ctx,
    change,
    clock,
    volume,
    log,
    speedButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-speed]')),
  };
}

/** 스테이지를 마운트하고 정리 함수를 돌려준다 (HMR 대비). */
export function mountStage(root: HTMLElement): () => void {
  const theme: ColorTheme = createTheme();
  applyPalette(document.documentElement, theme.palette);

  root.innerHTML = buildMarkup();
  const refs = collectRefs(root);
  const panelHost = root.querySelector<HTMLElement>('[data-ref="panel-host"]');
  if (!refs || !panelHost) {
    root.textContent = '스테이지를 초기화하지 못했습니다 (캔버스 컨텍스트 없음).';
    return () => undefined;
  }

  let seed = 1;
  let speed: number = SPEEDS[0];
  let stakeRatio: StakeRatio = DEFAULT_STAKE_RATIO;
  let session: StageSession | null = null;
  let elapsedMs = 0;
  let frame = 0;

  const panel: TradePanel = createTradePanel({
    onOpen: (direction: Direction) => session?.openTrade(direction, stakeRatio, elapsedMs),
    onClose: () => session?.closeTrade(elapsedMs),
    onStakeRatioChange: (ratio) => {
      stakeRatio = ratio;
    },
  });
  panelHost.appendChild(panel.element);

  function startSession(nowMs: number): void {
    session = new StageSession(seed, speed, nowMs);
    refs!.volume.textContent = `거래량 ${session.set.volumeMultiple.toFixed(1)}×`;
  }

  function syncSpeedButtons(): void {
    for (const button of refs!.speedButtons) {
      button.classList.toggle('btn--active', Number(button.dataset['speed']) === speed);
    }
  }

  function toViewModel(current: StageSession): TradePanelViewModel {
    const snap = current.snapshot(elapsedMs);
    return {
      holding: snap.position !== null,
      direction: snap.position?.direction ?? null,
      stake: snap.position?.stake ?? 0,
      stakeRatio,
      aum: snap.wallet.aum,
      gold: snap.wallet.gold,
      pnl: snap.evaluation?.pnl ?? 0,
      distanceToLiquidation: snap.distanceToLiquidation,
      warning: snap.evaluation?.warning ?? false,
      canOpen: current.canOpen(),
      canClose: current.canCloseAt(elapsedMs),
      positionsUsed: snap.openCount,
      positionsMax: snap.maxPositions,
    };
  }

  function render(nowMs: number): void {
    if (!session) {
      startSession(nowMs);
      return;
    }

    const state = session.replay.tick(nowMs);
    elapsedMs = state.elapsedMs;

    // 판정을 먼저 돌린다 — 강제 청산이 걸린 프레임에서 이미 정리된 상태를 그려야 한다.
    session.syncLiquidation(elapsedMs);

    const notice = session.takeNotice();
    if (notice) {
      const { position, goldGained } = notice;
      const label = position.reason === 'liquidated' ? '강제 청산' : '청산';
      refs!.log.textContent =
        `${label} — 손익 ${position.pnl > 0 ? '+' : ''}${position.pnl} / 골드 +${goldGained}`;
    }

    const snap = session.snapshot(elapsedMs);
    drawChart(refs!.ctx, {
      bars: session.set.bars,
      state,
      palette: theme.palette,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      ...(snap.position
        ? { entryMarker: { barIndex: Math.floor(snap.position.openAtMs / 1000), price: snap.position.openPrice } }
        : {}),
    });

    const delta = changePercent(session.set.bars, state.barIndex);
    refs!.change.textContent = formatSignedPercent(delta);
    refs!.change.classList.toggle('hud__value--up', delta >= 0);
    refs!.change.classList.toggle('hud__value--down', delta < 0);
    refs!.clock.textContent = formatSessionClock(state.barIndex);

    const gold = root.querySelector<HTMLElement>('[data-ref="gold"]');
    const aum = root.querySelector<HTMLElement>('[data-ref="aum"]');
    if (gold) gold.textContent = String(snap.wallet.gold);
    if (aum) aum.textContent = String(snap.wallet.aum);

    panel.update(toViewModel(session));

    if (state.finished) {
      session.closeAtStageEnd(elapsedMs);
      seed += 1;
      session = null;
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
      session = null; // 배속은 진행 중 바뀌지 않는다 → 새 세션 (FR-3.5)
    });
  }

  root.querySelector<HTMLButtonElement>('[data-action="restart"]')?.addEventListener('click', () => {
    seed += 1;
    session = null;
  });

  // 투입 비율 프리셋이 판정 코어와 UI에서 어긋나면 조용히 잘못된 금액이 걸린다.
  if (STAKE_PRESETS.length !== 4) {
    refs.log.textContent = '경고: 투입 비율 프리셋이 예상과 다릅니다.';
  }

  syncSpeedButtons();
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    panel.destroy();
  };
}
