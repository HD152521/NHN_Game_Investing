/**
 * 스테이지 셸 — 리플레이(src/market) · 차트(src/chart) · 매매 판정(src/position) ·
 * 매매 패널(src/ui) · 전투(src/combat) · 전장 렌더(src/battle)를 하나의 프레임 루프로 묶는다.
 *
 * 코어 루프: 매매 순이익 → 골드 → 타워·유닛 → 적 처치 → AUM 드롭 → 다시 매매.
 *
 * 설계 메모: 리플레이·판정·전투는 전부 시계를 주입받는 순수 계산기다.
 * `performance.now()`를 읽는 곳은 이 파일의 프레임 루프 하나뿐이다.
 *
 * ★ 스테이지는 **정지 상태로 마운트된다**. 시작 게이트의 [스테이지 시작]을 누르기
 *   전까지 프레임 루프가 한 번도 돌지 않는다 (`frame-loop.ts`).
 */

import './shell.css';
import './start-gate.css';
import '../ui/trade-panel.css';
import '../ui/gold-flight.css';

import { drawBattle, computeBattleLayout, slotAt } from '../battle';
import { drawChart } from '../chart';
import { TOWER_IDENTITY, TOWER_UPGRADE_COST } from '../combat';
import type { TowerKind, UnitKind } from '../combat';
import { changePercent } from '../market';
import { applyPalette, createTheme } from '../design';
import type { ColorTheme } from '../design';
import type { Direction } from '../position';
import { createGoldMeter, createTradePanel, prefersReducedMotion } from '../ui';
import type { GoldMeter, StakeRatio, TradePanel, TradePanelViewModel } from '../ui';
import { createFrameLoop, createRafScheduler } from './frame-loop';
import { StageSession } from './session';
import {
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  CHART_HEIGHT,
  CHART_WIDTH,
  SPEEDS,
  buildStageMarkup,
  collectStageRefs,
  formatSessionClock,
  formatSignedPercent,
} from './stage-dom';

const DEFAULT_STAKE_RATIO: StakeRatio = 0.25;

/** 프레임 간격이 이보다 크면 탭 비활성 복귀로 보고 버린다. */
const MAX_FRAME_DT_MS = 250;

/** 스테이지를 마운트하고 정리 함수를 돌려준다 (HMR 대비). */
export function mountStage(root: HTMLElement): () => void {
  const theme: ColorTheme = createTheme();
  applyPalette(document.documentElement, theme.palette);

  root.innerHTML = buildStageMarkup();
  const refs = collectStageRefs(root);
  if (!refs) {
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

  const scheduler = createRafScheduler();
  const battleLayout = computeBattleLayout(BATTLE_WIDTH, BATTLE_HEIGHT);

  /**
   * 골드 HUD 숫자의 소유자. 청산 골드는 차트에서 출발해 이 숫자로 날아와 꽂히고,
   * 도착 시점에 카운트업된다 (즉시 치환 금지).
   */
  const goldMeter: GoldMeter = createGoldMeter({
    layer: refs.stage,
    source: refs.chartHost,
    valueEl: refs.gold,
    announceEl: refs.goldAnnounce,
    scheduler,
    prefersReducedMotion,
  });

  const panel: TradePanel = createTradePanel({
    onOpen: (direction: Direction) => session?.openTrade(direction, stakeRatio, elapsedMs),
    onClose: () => session?.closeTrade(elapsedMs),
    onAdd: (ratio) => session?.addTrade(ratio, elapsedMs),
    onStakeRatioChange: (ratio) => {
      stakeRatio = ratio;
    },
  });
  refs.panelHost.appendChild(panel.element);

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
      avgEntryPrice: snap.position?.openPrice ?? 0,
      currentPrice: snap.position ? current.priceAt(elapsedMs) : 0,
      addCount: snap.position?.addCount ?? 0,
      canAdd: current.canAdd(),
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

  /** 청산이 확정된 프레임 — 로그 한 줄 + 골드 비행 연출을 띄운다. */
  function announceClose(current: StageSession): void {
    const notice = current.takeNotice();
    if (!notice) {
      return;
    }
    const label = notice.position.reason === 'liquidated' ? '강제 청산' : '청산';
    const sign = notice.position.pnl > 0 ? '+' : '';
    refs!.log.textContent = `${label} — 손익 ${sign}${notice.position.pnl} / 골드 +${notice.goldGained}`;
    goldMeter.launch({
      goldGained: notice.goldGained,
      pnl: notice.position.pnl,
      reason: notice.position.reason,
    });
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
    announceClose(session);

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
      // 슬롯 데칼이 '배치 가능/불가'를 가르는 기준. 살 돈이 없으면 불가로 보인다.
      gold: snap.wallet.gold,
      timeMs: state.elapsedMs,
      reducedMotion: prefersReducedMotion(),
    });

    const delta = changePercent(session.set.bars, state.barIndex);
    refs!.change.textContent = formatSignedPercent(delta);
    refs!.change.classList.toggle('hud__value--up', delta >= 0);
    refs!.change.classList.toggle('hud__value--down', delta < 0);
    refs!.clock.textContent = formatSessionClock(state.barIndex);
    // 골드 표시는 연출이 소유한다 — 여기서 직접 덮어쓰면 카운트업이 끊긴다.
    goldMeter.sync(snap.wallet.gold);
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

  const loop = createFrameLoop(scheduler, render);

  // ── 이벤트 배선 ───────────────────────────────────────────
  refs.startButton.addEventListener('click', () => {
    refs.gate.remove();
    refs.stage.classList.remove('stage--gated');
    loop.start(); // 여기서 처음으로 차트가 흐르기 시작한다.
  });

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
      refs.log.textContent = `${TOWER_IDENTITY[selectedTower].displayName} 선택 (${TOWER_IDENTITY[selectedTower].laneLabel}) — 빈 슬롯을 클릭하세요`;
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
      refs.log.textContent = `${TOWER_IDENTITY[existing.kind].displayName} 업그레이드 (${TOWER_UPGRADE_COST[existing.kind]}G)`;
    }
  });

  root.querySelector<HTMLButtonElement>('[data-action="restart"]')?.addEventListener('click', () => {
    seed += 1;
    session = null;
  });

  syncButtons();

  return () => {
    loop.stop();
    goldMeter.destroy();
    panel.destroy();
  };
}
