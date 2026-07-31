/**
 * 스테이지 셸 — 리플레이(src/market) · 차트(src/chart) · 매매 판정(src/position) ·
 * 매매 패널(src/ui) · 전투(src/combat) · 전장 렌더(src/battle)를 하나의 프레임 루프로 묶는다.
 *
 * 코어 루프: 매매 순이익 → 골드 → 타워·유닛 → 적 처치 → AUM 드롭 → 다시 매매.
 *
 * 설계 메모: 리플레이·판정·전투는 전부 시계를 주입받는 순수 계산기다.
 * `performance.now()`를 읽는 곳은 이 파일의 rAF 루프 하나뿐이다.
 */

import './shell.css';
import '../ui/trade-panel.css';

import { drawBattle, computeBattleLayout, slotAt } from '../battle';
import { drawChart } from '../chart';
import { SKILL_COST, TOWER_BUILD_COST, TOWER_UPGRADE_COST, UNIT_COST } from '../combat';
import type { TowerKind, UnitKind } from '../combat';
import { changePercent } from '../market';
import { applyPalette, createTheme } from '../design';
import type { ColorTheme } from '../design';
import type { Direction } from '../position';
import { createTradePanel } from '../ui';
import type { StakeRatio, TradePanel, TradePanelViewModel } from '../ui';
import { STARTING_AUM, STARTING_GOLD, StageSession } from './session';

const CHART_WIDTH = 1024;
const CHART_HEIGHT = 200;
const BATTLE_WIDTH = 1024;
const BATTLE_HEIGHT = 300;

/** FR-3.5 — 배속은 스테이지 시작 전에만 정해진다. */
const SPEEDS = [1, 2, 4] as const;
const DEFAULT_STAKE_RATIO: StakeRatio = 0.25;

/** 프레임 간격이 이보다 크면 탭 비활성 복귀로 보고 버린다. */
const MAX_FRAME_DT_MS = 250;

/**
 * 타워·유닛 라벨에 **담당 레인과 역할을 반드시 함께 노출**한다.
 *
 * 초기 플레이테스트에서 "공중 적을 어떻게 잡느냐"는 질문이 나왔다. 공중은 대공 포대로만
 * 잡히는데(FR-6.2) 화면 어디에도 그 사실이 없었던 것이 원인이다. 라벨에서 이 정보를
 * 빼면 같은 문제가 그대로 재발한다.
 */
const TOWER_LABELS: Record<TowerKind, { name: string; lane: string }> = {
  basic: { name: '기본 포탑', lane: '지상' },
  antiair: { name: '대공 포대', lane: '공중' },
  splash: { name: '광역 포탑', lane: '지상·범위' },
};

const UNIT_LABELS: Record<UnitKind, { name: string; role: string }> = {
  intern: { name: '인턴', role: '근거리' },
  analyst: { name: '애널리스트', role: '원거리' },
  trader: { name: '트레이더', role: '탱커' },
};

interface StageRefs {
  readonly chartCtx: CanvasRenderingContext2D;
  readonly battleCanvas: HTMLCanvasElement;
  readonly battleCtx: CanvasRenderingContext2D;
  readonly change: HTMLElement;
  readonly clock: HTMLElement;
  readonly volume: HTMLElement;
  readonly gold: HTMLElement;
  readonly aum: HTMLElement;
  readonly wave: HTMLElement;
  readonly baseHp: HTMLElement;
  readonly log: HTMLElement;
  readonly banner: HTMLElement;
  readonly speedButtons: readonly HTMLButtonElement[];
  readonly towerButtons: readonly HTMLButtonElement[];
}

function formatSessionClock(barIndex: number): string {
  const totalMinutes = 9 * 60 + barIndex;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function formatSignedPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function buildMarkup(): string {
  const speeds = SPEEDS.map(
    (s) => `<button class="btn" type="button" data-speed="${s}">${s}x</button>`,
  ).join('');

  const towers = (Object.keys(TOWER_LABELS) as TowerKind[])
    .map((kind) => {
      const { name, lane } = TOWER_LABELS[kind];
      return `<button class="btn btn--build" type="button" data-tower="${kind}">${name}<small>${lane}</small><em>${TOWER_BUILD_COST[kind]}</em></button>`;
    })
    .join('');

  const units = (Object.keys(UNIT_LABELS) as UnitKind[])
    .map((kind) => {
      const { name, role } = UNIT_LABELS[kind];
      return `<button class="btn btn--summon" type="button" data-unit="${kind}">${name}<small>${role}</small><em>${UNIT_COST[kind]}</em></button>`;
    })
    .join('');

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
        <canvas data-ref="chart" width="${CHART_WIDTH}" height="${CHART_HEIGHT}"
                role="img" aria-label="블라인드 차트 리플레이"></canvas>
      </div>

      <div class="hud">
        <span class="hud__item"><span class="hud__label">시각</span>
          <span class="hud__value" data-ref="clock">09:00</span></span>
        <span class="hud__item"><span class="hud__label">등락</span>
          <span class="hud__value" data-ref="change">+0.00%</span></span>
        <span class="hud__item"><span class="hud__label">골드</span>
          <span class="hud__value hud__value--gold" data-ref="gold">${STARTING_GOLD}</span></span>
        <span class="hud__item"><span class="hud__label">AUM</span>
          <span class="hud__value hud__value--aum" data-ref="aum">${STARTING_AUM}</span></span>
        <span class="hud__item"><span class="hud__label">웨이브</span>
          <span class="hud__value" data-ref="wave">0/13</span></span>
        <span class="hud__item"><span class="hud__label">본진</span>
          <span class="hud__value" data-ref="basehp">100</span></span>
      </div>

      <div data-ref="panel-host"></div>

      <div class="stage__battle">
        <canvas data-ref="battle" width="${BATTLE_WIDTH}" height="${BATTLE_HEIGHT}"
                aria-label="전장"></canvas>
        <div class="stage__banner" data-ref="banner" hidden></div>
      </div>

      <div class="buildbar">
        <span class="buildbar__group">${towers}</span>
        <span class="buildbar__sep"></span>
        <span class="buildbar__group">${units}</span>
        <span class="buildbar__sep"></span>
        <button class="btn btn--skill" type="button" data-action="skill">공시 폭탄 <em>${SKILL_COST}</em></button>
      </div>

      <div class="controls">
        <button class="btn" type="button" data-action="restart">새 스테이지</button>
        ${speeds}
        <span class="controls__note" data-ref="log">타워를 고르고 아래 빈 슬롯을 클릭하세요</span>
      </div>
    </div>
  `;
}

function collectRefs(root: HTMLElement): StageRefs | null {
  const chart = root.querySelector<HTMLCanvasElement>('[data-ref="chart"]');
  const battle = root.querySelector<HTMLCanvasElement>('[data-ref="battle"]');
  const pick = (name: string): HTMLElement | null =>
    root.querySelector<HTMLElement>(`[data-ref="${name}"]`);

  const change = pick('change');
  const clock = pick('clock');
  const volume = pick('volume');
  const gold = pick('gold');
  const aum = pick('aum');
  const wave = pick('wave');
  const baseHp = pick('basehp');
  const log = pick('log');
  const banner = pick('banner');

  if (!chart || !battle || !change || !clock || !volume || !gold || !aum || !wave || !baseHp || !log || !banner) {
    return null;
  }

  const chartCtx = chart.getContext('2d');
  const battleCtx = battle.getContext('2d');
  if (!chartCtx || !battleCtx) {
    return null;
  }

  return {
    chartCtx,
    battleCanvas: battle,
    battleCtx,
    change,
    clock,
    volume,
    gold,
    aum,
    wave,
    baseHp,
    log,
    banner,
    speedButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-speed]')),
    towerButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-tower]')),
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
  let selectedTower: TowerKind = 'basic';
  let hoveredSlot: number | null = null;
  let session: StageSession | null = null;
  let elapsedMs = 0;
  let lastFrameMs = 0;
  let frame = 0;

  const battleLayout = computeBattleLayout(BATTLE_WIDTH, BATTLE_HEIGHT);

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
    lastFrameMs = nowMs;
    refs!.volume.textContent = `거래량 ${session.set.volumeMultiple.toFixed(1)}×`;
    refs!.banner.hidden = true;
  }

  function syncButtons(): void {
    for (const button of refs!.speedButtons) {
      button.classList.toggle('btn--active', Number(button.dataset['speed']) === speed);
    }
    for (const button of refs!.towerButtons) {
      button.classList.toggle('btn--active', button.dataset['tower'] === selectedTower);
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

  /** 캔버스는 CSS로 늘어나므로 클릭 좌표를 논리 해상도로 되돌려야 한다. */
  function toCanvasPoint(event: MouseEvent): { x: number; y: number } {
    const rect = refs!.battleCanvas.getBoundingClientRect();
    const scaleX = rect.width === 0 ? 1 : BATTLE_WIDTH / rect.width;
    const scaleY = rect.height === 0 ? 1 : BATTLE_HEIGHT / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function render(nowMs: number): void {
    if (!session) {
      startSession(nowMs);
      return;
    }

    const dt = Math.min(nowMs - lastFrameMs, MAX_FRAME_DT_MS);
    lastFrameMs = nowMs;

    const state = session.replay.tick(nowMs);
    elapsedMs = state.elapsedMs;

    // 판정을 먼저 — 강제 청산이 걸린 프레임에서 정리된 상태를 그려야 한다.
    session.syncLiquidation(elapsedMs);
    session.stepCombatFrame(dt);

    const notice = session.takeNotice();
    if (notice) {
      const label = notice.position.reason === 'liquidated' ? '강제 청산' : '청산';
      const sign = notice.position.pnl > 0 ? '+' : '';
      refs!.log.textContent = `${label} — 손익 ${sign}${notice.position.pnl} / 골드 +${notice.goldGained}`;
    }

    const snap = session.snapshot(elapsedMs);
    const combat = session.combatState;

    drawChart(refs!.chartCtx, {
      bars: session.set.bars,
      state,
      palette: theme.palette,
      width: CHART_WIDTH,
      height: CHART_HEIGHT,
      ...(snap.position
        ? {
            entryMarker: {
              barIndex: Math.floor(snap.position.openAtMs / 1000),
              price: snap.position.openPrice,
            },
          }
        : {}),
    });

    drawBattle(refs!.battleCtx, {
      state: combat,
      palette: theme.palette,
      width: BATTLE_WIDTH,
      height: BATTLE_HEIGHT,
      selectedSlot: hoveredSlot,
      // 빈 슬롯에 호버하면 지금 고른 타워의 사거리·실루엣을 미리 보여준다.
      selectedTowerKind: selectedTower,
    });

    const delta = changePercent(session.set.bars, state.barIndex);
    refs!.change.textContent = formatSignedPercent(delta);
    refs!.change.classList.toggle('hud__value--up', delta >= 0);
    refs!.change.classList.toggle('hud__value--down', delta < 0);
    refs!.clock.textContent = formatSessionClock(state.barIndex);
    refs!.gold.textContent = String(snap.wallet.gold);
    refs!.aum.textContent = String(snap.wallet.aum);
    refs!.wave.textContent = `${combat.wave}/${combat.waveCount}`;
    refs!.baseHp.textContent = String(combat.baseHp);

    panel.update(toViewModel(session));

    if (combat.phase !== 'running') {
      refs!.banner.hidden = false;
      refs!.banner.textContent =
        combat.phase === 'cleared' ? '스테이지 클리어' : '본진 함락 — 패배';
      refs!.banner.classList.toggle('stage__banner--win', combat.phase === 'cleared');
      return; // 전투가 끝나면 화면을 고정한다. "새 스테이지"로 재시작.
    }

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

  // ── 이벤트 배선 ───────────────────────────────────────────
  for (const button of refs.speedButtons) {
    button.addEventListener('click', () => {
      speed = Number(button.dataset['speed']) || 1;
      syncButtons();
      session = null; // 배속은 진행 중 바뀌지 않는다 (FR-3.5)
    });
  }

  for (const button of refs.towerButtons) {
    button.addEventListener('click', () => {
      selectedTower = (button.dataset['tower'] as TowerKind | undefined) ?? 'basic';
      syncButtons();
      refs.log.textContent = `${TOWER_LABELS[selectedTower].name} 선택 (${TOWER_LABELS[selectedTower].lane}) — 빈 슬롯을 클릭하세요`;
    });
  }

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-unit]')) {
    button.addEventListener('click', () => {
      const kind = button.dataset['unit'] as UnitKind | undefined;
      if (kind) {
        session?.summon(kind);
      }
    });
  }

  root.querySelector<HTMLButtonElement>('[data-action="skill"]')?.addEventListener('click', () => {
    session?.useSkill();
  });

  refs.battleCanvas.addEventListener('mousemove', (event) => {
    const point = toCanvasPoint(event);
    hoveredSlot = slotAt(point.x, point.y, battleLayout, session?.combatState.towerSlots ?? 6);
    refs.battleCanvas.style.cursor = hoveredSlot === null ? 'default' : 'pointer';
  });

  refs.battleCanvas.addEventListener('mouseleave', () => {
    hoveredSlot = null;
  });

  refs.battleCanvas.addEventListener('click', (event) => {
    const current = session;
    if (!current) {
      return;
    }
    const point = toCanvasPoint(event);
    const slot = slotAt(point.x, point.y, battleLayout, current.combatState.towerSlots);
    if (slot === null) {
      return;
    }

    const existing = current.combatState.towers.find((tower) => tower.slot === slot);
    if (!existing) {
      current.build(slot, selectedTower);
      return;
    }
    if (existing.level === 1) {
      current.upgrade(slot);
      refs.log.textContent = `${TOWER_LABELS[existing.kind].name} 업그레이드 (${TOWER_UPGRADE_COST[existing.kind]}G)`;
    }
  });

  root.querySelector<HTMLButtonElement>('[data-action="restart"]')?.addEventListener('click', () => {
    seed += 1;
    session = null;
  });

  syncButtons();
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    panel.destroy();
  };
}
