/**
 * 스테이지 셸 — 리플레이(src/market) · 차트(src/chart) · 매매 판정(src/position) ·
 * 매매 패널(src/ui) · 전투(src/combat) · 전장 렌더(src/battle)를 하나의 프레임 루프로 묶는다.
 *
 * 코어 루프: 매매 순이익 → 골드 → 타워·유닛 → 적 처치 → AUM 드롭 → 다시 매매.
 *
 * 설계 메모: 리플레이·판정·전투는 전부 시계를 주입받는 순수 계산기다.
 * `performance.now()`를 읽는 곳은 이 파일의 프레임 루프 하나뿐이다.
 *
 * ★ 스테이지는 **정지 상태로 마운트된다**. 화면 흐름은
 *   `[시작 게이트] → [지역 선택] → [스테이지 플레이]` 이며, 지역을 고르기 전까지
 *   프레임 루프가 한 번도 돌지 않는다 (`frame-loop.ts`).
 */

import './shell.css';
import './start-gate.css';
import './region-select.css';
import '../ui/trade-panel.css';
import '../ui/gold-flight.css';
import '../ui/skill-tooltip.css';

import { drawBattle, computeBattleLayout, progressToX, slotAt } from '../battle';
import { drawChart } from '../chart';
import { SKILL_SPECS, TOWER_IDENTITY, TOWER_UPGRADE_COST } from '../combat';
import type { SkillId, StageId, TowerKind, UnitKind } from '../combat';
import { createSkillFxField, drawSkillFx, skillAnchor, triggerSkillEffect } from '../fx';
import type { SkillFxField, SkillFxViewport } from '../fx';
import { changePercent } from '../market';
import { applyPalette, createTheme } from '../design';
import type { ColorTheme } from '../design';
import type { Direction } from '../position';
import {
  createGoldMeter,
  createSkillTooltip,
  createTradePanel,
  mountHudIcons,
  prefersReducedMotion,
  resolveSkillButtonState,
  skillIdFor,
} from '../ui';
import type {
  GoldMeter,
  SkillTooltip,
  StakeRatio,
  TradePanel,
  TradePanelViewModel,
} from '../ui';
import { createFrameLoop, createRafScheduler } from './frame-loop';
import { mountRegionArt, stageIdFor } from './region-select';
import { DEFAULT_STAGE_ID, StageSession } from './session';
import {
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  CHART_HEIGHT,
  CHART_WIDTH,
  SPEEDS,
  buildStageMarkup,
  collectStageRefs,
  formatPrepCountdown,
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
  /**
   * 지역 선택 화면에서 고른 지역. 세션을 만들 때마다 이 값이 `StageSession`으로 넘어가
   * 시작 AUM·골드·웨이브 테이블을 결정한다 — 여기서만 바뀐다.
   */
  let stageId: StageId = DEFAULT_STAGE_ID;
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
   * 스킬 이펙트 재생 버퍼 — 앱 수명 동안 하나만 만든다(프레임당 할당 0, PRD §11).
   *
   * `castCounts`는 스킬별 시전 횟수다. 이 값이 이펙트 좌표를 밀어내는 데 쓰인다 —
   * 가산 합성 소재를 같은 자리에 겹쳐 찍으면 255 포화로 형태가 뭉개지기 때문이다
   * (`src/fx/anchor.ts` 참고).
   */
  const skillFx: SkillFxField = createSkillFxField();
  const castCounts = new Map<SkillId, number>();

  /**
   * 스킬 이펙트가 자기 **효과 범위**를 그리기 위해 필요한 전장 좌표.
   *
   * `S-01`(지상 적 전원)·`S-02`(아군 유닛 전원)는 맵 전체 스킬이라 연출도 화면 폭 전체를
   * 덮어야 한다 — 그래서 `width`를 반드시 실제 캔버스 폭으로 준다. `groundY`·`baseX`는
   * 전장 레이아웃에서 뽑아 오므로 사옥 크기나 레인 비율이 바뀌면 이펙트도 따라간다
   * (`src/fx/skill-scope.ts` 참고). 레이아웃이 고정이라 프레임마다 다시 만들지 않는다.
   */
  const skillFxViewport: SkillFxViewport = {
    width: BATTLE_WIDTH,
    height: BATTLE_HEIGHT,
    groundY: battleLayout.groundY,
    baseX: progressToX(0, battleLayout),
  };

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

  // HUD 아이콘(`tf-ui-icons`)은 마운트 시 1회만 굽는다 — 숫자는 매 프레임 바뀌어도
  // 아이콘은 바뀌지 않는다. 색약 모드는 테마가 결정한다.
  mountHudIcons(root, { mode: theme.mode });

  // 지역 카드 배경(`tf-r1-dusk` 등)도 같은 이유로 마운트 시 1회만 굽는다.
  // 굽지 못하는 환경에서는 조용히 넘어가고 CSS 그라디언트가 그대로 남는다.
  mountRegionArt(root, { mode: theme.mode });

  const panel: TradePanel = createTradePanel(
    {
      onOpen: (direction: Direction) => session?.openTrade(direction, stakeRatio, elapsedMs),
      onClose: () => session?.closeTrade(elapsedMs),
      onAdd: (ratio) => session?.addTrade(ratio, elapsedMs),
      onStakeRatioChange: (ratio) => {
        stakeRatio = ratio;
      },
    },
    { mode: theme.mode },
  );
  refs.panelHost.appendChild(panel.element);

  /**
   * 스킬 상세 설명 툴팁 — hover **와** 키보드 포커스 양쪽에서 뜬다.
   *
   * 버튼에는 이름·비용·쿨다운밖에 없어서 "무엇을 하는 스킬인지" 화면에 없었다
   * ("솔직히 잘 모르겠음" 피드백). 수치는 전부 `src/combat` 상수에서 파생되므로
   * 밸런스를 고치면 설명도 같이 바뀐다 — 여기서 문구를 만들지 마라.
   */
  const skillTooltip: SkillTooltip = createSkillTooltip({ root, layer: refs.stage });

  function startSession(nowMs: number): void {
    session = new StageSession(seed, speed, nowMs, stageId);
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

  /**
   * 스킬 시전 — **성공했을 때만** 이펙트를 재생한다.
   *
   * 재화 부족·쿨다운으로 거부된 시전에 이펙트가 뜨면 "돈이 나갔나?"를 화면이 거짓으로
   * 답하게 된다. 판정은 전부 `session.useSkill`(→ `castSkill`) 한 곳에 있고, 여기서는
   * 그 불리언만 믿는다.
   */
  function castSkill(id: SkillId, nowMs: number): void {
    const current = session;
    if (!current || !current.useSkill(id)) {
      return;
    }

    const castIndex = castCounts.get(id) ?? 0;
    castCounts.set(id, castIndex + 1);

    const anchor = skillAnchor(id, BATTLE_WIDTH, BATTLE_HEIGHT, castIndex);
    triggerSkillEffect(skillFx, id, anchor.x, anchor.y, nowMs);

    const spec = SKILL_SPECS[id];
    refs!.log.textContent = `${spec.displayName} 시전 — ${spec.cost} ${spec.currency === 'aum' ? 'AUM' : 'G'} 소모`;
  }

  /** 스킬 버튼의 쿨다운 숫자와 활성 상태를 현재 상태에 맞춘다(매 프레임). */
  function syncSkillButtons(current: StageSession | null): void {
    for (const button of refs!.skillButtons) {
      const id = skillIdFor(button.dataset['skill']);
      if (id === null) {
        continue;
      }

      if (!current) {
        button.disabled = true;
        continue;
      }

      const wallet = current.walletSnapshot;
      const state = resolveSkillButtonState({
        spec: SKILL_SPECS[id],
        remainingMs: current.skillCooldownMs(id),
        gold: wallet.gold,
        aum: wallet.aum,
      });

      button.disabled = state.disabled;
      button.classList.toggle('btn--broke', state.unaffordable);
      const readout = button.querySelector('small');
      if (readout && readout.textContent !== state.cooldownLabel) {
        readout.textContent = state.cooldownLabel;
      }
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

    // 스킬 이펙트는 전장 위에 얹는다 — 가산 합성이라 반드시 전장을 다 그린 뒤여야 한다.
    drawSkillFx(
      refs!.battleCtx,
      theme.palette,
      skillFx,
      skillFxViewport,
      nowMs,
      prefersReducedMotion(),
    );

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

    // 준비 구간 카운트다운. 전투가 끝난 뒤에는 배너가 화면을 가지므로 항상 숨긴다.
    const prepText = combat.phase === 'running' ? formatPrepCountdown(combat.prepRemainingMs) : '';
    refs!.prep.hidden = prepText === '';
    refs!.prep.textContent = prepText;

    panel.update(toViewModel(session));
    syncSkillButtons(session);

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

  // ── 화면 전이: [시작 게이트] → [지역 선택] → [스테이지 플레이] ──
  /**
   * 오버레이는 **지우지 않고 `hidden`으로 여닫는다.**
   *
   * 예전에는 시작 버튼이 게이트를 `remove()` 했다. 지역 선택에서 뒤로 갈 곳이 없어지므로
   * 더 이상 쓸 수 없는 방식이다 — 게이트는 살려 두고 표시 여부만 바꾼다
   * (`.gate[hidden]` 규칙은 `region-select.css`에 있다).
   */
  function showGate(): void {
    refs!.regionSelect.hidden = true;
    refs!.gate.hidden = false;
    refs!.startButton.focus();
  }

  function showRegionSelect(): void {
    refs!.gate.hidden = true;
    refs!.regionSelect.hidden = false;
    // 키보드·스크린리더 사용자가 오버레이 안에서 바로 이어갈 수 있게 첫 카드로 포커스를 옮긴다.
    refs!.regionButtons[0]?.focus();
  }

  /** 지역을 확정하고 스테이지를 시작한다. **여기서 처음으로 프레임 루프가 돈다.** */
  function beginStage(id: StageId): void {
    stageId = id;
    session = null; // 다음 프레임이 고른 지역 설정으로 세션을 새로 만든다.
    refs!.regionSelect.hidden = true;
    refs!.gate.hidden = true;
    refs!.stage.classList.remove('stage--gated');
    loop.start();
  }

  refs.startButton.addEventListener('click', showRegionSelect);
  refs.regionBackButton.addEventListener('click', showGate);

  for (const button of refs.regionButtons) {
    button.addEventListener('click', () => {
      const id = stageIdFor(button.dataset['region']);
      if (id !== null) {
        beginStage(id);
      }
    });
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

  for (const button of refs.skillButtons) {
    button.addEventListener('click', () => {
      const id = skillIdFor(button.dataset['skill']);
      if (id !== null) {
        // 이펙트 시계는 렌더 시계와 같아야 한다 — `drawSkillFx`가 rAF의 nowMs로 진행도를
        // 계산하므로, 클릭 시각을 다른 시계(Date.now 등)로 찍으면 이펙트가 즉시 만료된다.
        castSkill(id, lastFrameMs);
      }
    });
  }

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

  /**
   * Space — 준비 시간 즉시 종료. "아는 사람은 기다리지 않는다."
   *
   * 폼 컨트롤에 포커스가 있으면 가로채지 않는다 — Space는 버튼의 기본 활성화 키라,
   * 여기서 먹어버리면 빌드바 버튼이 키보드로 눌리지 않게 된다(접근성 회귀).
   */
  function onKeyDown(event: KeyboardEvent): void {
    // Esc — 지역 선택에서 타이틀로. 다이얼로그의 관습적인 탈출 키다.
    if (event.code === 'Escape' && !refs!.regionSelect.hidden) {
      event.preventDefault();
      showGate();
      return;
    }
    if (event.code !== 'Space') return;
    const target = event.target;
    if (
      target instanceof HTMLButtonElement ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    if (!session || session.prepRemainingMs <= 0) return;
    event.preventDefault(); // 스페이스바 스크롤 방지
    session.skipPrep();
  }
  window.addEventListener('keydown', onKeyDown);

  syncButtons();

  return () => {
    loop.stop();
    window.removeEventListener('keydown', onKeyDown);
    skillTooltip.destroy();
    goldMeter.destroy();
    panel.destroy();
  };
}
