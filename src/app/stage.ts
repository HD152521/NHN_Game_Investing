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

import { createDeathField, drawBattle, computeBattleLayout, progressToX, slotAt } from '../battle';

/**
 * 사망 연출 슬롯 버퍼 — **앱 수명 동안 하나만** 만든다(날씨 `WeatherField`와 같은 규약).
 * 프레임마다 새로 만들면 재생 중인 연출이 매 프레임 초기화되어 아무 것도 안 보인다.
 */
const deathField = createDeathField();

import { createWeatherField } from '../weather';

/**
 * 날씨 입자·광선 버퍼 — `deathField`와 **정확히 같은 규약**으로 앱 수명 동안 하나만 만든다.
 * 슬롯별 시드만 들고 있고 매 프레임 위치는 `시드 + 시각`으로 계산하므로, 이 버퍼 하나면
 * 프레임당 할당 없이 날씨 4종을 전부 그린다 (`weather/field.ts` 머리말).
 */
const weatherField = createWeatherField();
import { drawChart } from '../chart';
import {
  ALLY_IDENTITY,
  SKILL_SPECS,
  TOWER_BUILD_COST,
  TOWER_IDENTITY,
  TOWER_UPGRADE_COST,
  UNIT_COST,
} from '../combat';
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
  formatUnaffordableNotice,
  mountHudIcons,
  prefersReducedMotion,
  resolveRosterButtonState,
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
import type { StageOutcome } from './settlement';
import {
  computeSettlement,
  settlementRows,
  settlementSubtitle,
  settlementTitle,
} from './settlement';
import {
  decideFrame,
  formatActionLog,
  resolveSpeedChange,
  shouldSkipPrep,
} from './stage-flow';
import type { FocusKind } from './stage-flow';
import {
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  CHART_HEIGHT,
  CHART_WIDTH,
  SPEEDS,
  buildSettlementRowsMarkup,
  buildStageMarkup,
  collectStageRefs,
  formatPrepCountdown,
  formatSessionClock,
  formatSignedPercent,
} from './stage-dom';

const DEFAULT_STAKE_RATIO: StakeRatio = 0.25;

/** 프레임 간격이 이보다 크면 탭 비활성 복귀로 보고 버린다. */
const MAX_FRAME_DT_MS = 250;

/** 재생이 끝난 프레임에 남기는 안내. 판이 사라진 게 아니라 매매만 닫혔다는 뜻이다. */
const MARKET_CLOSE_LOG = '장 마감 — 매매 종료. 남은 적을 정리하면 정산합니다';

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

  /**
   * ── 스테이지 종료 상태 (CLICK-PATH-001) ─────────────────────
   *
   * `STAGE_DURATION_MS`(390초)와 전투 총시간 `13 × 30초`가 **정확히 같다.** 그런데 전투의
   * `cleared` 조건은 "웨이브 13 교전창 소진 + 생존 적 0"이라, 25초 창에 14마리를 뿌리는
   * 13웨이브에서는 390초 시점에 반드시 생존자가 있다. 즉 재생 종료와 전투 종료는 같은
   * 사건이 될 수 없다. 전투 dt 가 `MAX_FRAME_DT_MS`로 잘리는 반면 리플레이는 절대 벽시계라
   * 탭 전환·히치가 있으면 격차는 더 벌어진다.
   *
   * 그래서 재생 종료를 **장 마감**으로만 해석한다 — 매매만 닫고(FR-8.1 강제 청산),
   * 전투는 `overtimeRemainingMs` 동안 스스로 결론에 도달할 때까지 계속 돈다.
   */
  let marketClosed = false;
  let overtimeRemainingMs = 0;
  /** 결과 화면이 떠 있는가. 떠 있는 동안 프레임은 아무 것도 진행시키지 않는다. */
  let resultShown = false;
  /** 배속 버튼이 예고한 배속 (CLICK-PATH-002). 두 번째 클릭이 동의다. */
  let armedSpeed: number | null = null;

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
    marketClosed = false;
    overtimeRemainingMs = 0;
    armedSpeed = null;
    refs!.volume.textContent = `거래량 ${session.set.volumeMultiple.toFixed(1)}×`;
    hideResult();
  }

  /** 결과 화면을 닫고 다음 세션이 만들어질 수 있는 상태로 되돌린다. */
  function hideResult(): void {
    resultShown = false;
    refs!.result.hidden = true;
    refs!.result.classList.remove('stage__result--win');
  }

  function syncButtons(): void {
    for (const button of refs!.speedButtons) {
      button.classList.toggle('btn--active', Number(button.dataset['speed']) === speed);
      button.classList.toggle('btn--armed', Number(button.dataset['speed']) === armedSpeed);
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

  /**
   * 유닛 소환 버튼의 활성 상태를 현재 골드에 맞춘다(매 프레임) — CLICK-PATH-004.
   *
   * 타워 버튼은 **선택**만 하므로 비활성화하지 않는다(건설은 슬롯 클릭이다). 대신 살 수
   * 없는 타워는 `btn--broke`로 표시해, 슬롯 데칼의 '배치 불가'와 같은 사실을 빌드바에서도
   * 미리 읽을 수 있게 한다.
   */
  function syncRosterButtons(current: StageSession | null): void {
    const gold = current?.walletSnapshot.gold ?? 0;

    for (const button of refs!.unitButtons) {
      const kind = button.dataset['unit'] as UnitKind | undefined;
      if (!kind) continue;
      const state = resolveRosterButtonState({
        cost: UNIT_COST[kind],
        gold,
        hasSession: current !== null,
      });
      button.disabled = state.disabled;
      button.classList.toggle('btn--broke', state.unaffordable);
    }

    for (const button of refs!.towerButtons) {
      const kind = button.dataset['tower'] as TowerKind | undefined;
      if (!kind) continue;
      button.classList.toggle('btn--broke', current !== null && gold < TOWER_BUILD_COST[kind]);
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
      canAdd: !marketClosed && current.canAdd(),
      aum: snap.wallet.aum,
      gold: snap.wallet.gold,
      pnl: snap.evaluation?.pnl ?? 0,
      distanceToLiquidation: snap.distanceToLiquidation,
      warning: snap.evaluation?.warning ?? false,
      // 장이 마감되면(연장 전투 중) 매매는 전부 잠긴다 — 리플레이가 더 이상 흐르지 않아
      // 진입해도 가격이 움직이지 않는다.
      canOpen: !marketClosed && current.canOpen(),
      canClose: !marketClosed && current.canCloseAt(elapsedMs),
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
    // 결과 화면이 떠 있으면 화면을 그 상태로 고정한다. 다음 판은 결과 화면의 두 버튼
    // ([다시] / [지역 선택으로])에서만 시작된다 — 저절로 재시작되는 경로는 없다.
    if (resultShown) {
      lastFrameMs = nowMs;
      return;
    }

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

    /**
     * 날씨 판정 — **프레임당 한 번**, 그리기 직전에.
     *
     * 셸은 판정을 하지 않는다. 세션이 자기 `ChartSet`을 읽어 `src/weather`(순수 함수)에
     * 물어보고 `WeatherView`만 돌려주며, 셸은 그것을 전장에 얹기만 한다 — 전장이 시장
     * 지표를 알게 되는 순간 판정/렌더 분리가 무너진다 (§17-2).
     *
     * `marketClosed`를 정지 신호로 넘기는 이유: 합성 차트에는 서킷브레이커가 없어서
     * WX-04를 켤 다른 입력이 없다. 실제로 매매가 전부 잠기는 유일한 구간이 장 마감이고,
     * 정전은 3프레임 상한이라 마감 순간 한 번 번쩍인 뒤 지표가 말하는 날씨로 돌아간다.
     */
    const weatherView = session.stepWeather(state, marketClosed, prefersReducedMotion());

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
      // 사망 연출 — 버퍼는 앱 수명 동안 하나, 이벤트는 직전 틱의 것만 넘긴다.
      deaths: { field: deathField, events: session.lastCombatDeaths },
      // 시장 상태 표시 — 사망 연출과 같은 모양(버퍼 하나 + 이번 프레임 값)이다.
      weather: { view: weatherView, field: weatherField },
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

    // 준비 구간 카운트다운. 전투가 끝난 뒤에는 결과 화면이 화면을 가지므로 항상 숨긴다.
    const prepText = combat.phase === 'running' ? formatPrepCountdown(combat.prepRemainingMs) : '';
    refs!.prep.hidden = prepText === '';
    refs!.prepText.textContent = prepText;

    panel.update(toViewModel(session));
    syncSkillButtons(session);
    syncRosterButtons(session);

    const decision = decideFrame({
      phase: combat.phase,
      replayFinished: state.finished,
      marketClosed,
      overtimeRemainingMs,
    });

    if (decision.kind === 'close-market') {
      marketClosed = true;
      // 연장은 한 웨이브 주기만 준다. 13웨이브 교전창(25초)에 등장한 마지막 무리가 사옥까지
      // 걸어 들어오기에 충분한 길이이며, 배속이 바뀌면 같이 줄어드는 파생값이다.
      overtimeRemainingMs = session.combatParams.waveDurationMs;
      // FR-8.1 — 열려 있던 포지션을 강제 청산하고, **그 연출을 반드시 소비한다.**
      // 예전 셸은 여기서 세션을 버려 정산 골드와 `pendingNotice`를 함께 폐기했다.
      session.closeAtStageEnd(elapsedMs);
      announceClose(session);
      refs!.log.textContent = MARKET_CLOSE_LOG;
      return;
    }

    if (decision.kind === 'overtime') {
      overtimeRemainingMs = Math.max(0, overtimeRemainingMs - dt);
      return;
    }

    if (decision.kind === 'finish') {
      showResult(session, decision.outcome);
    }
  }

  /** 정산을 계산해 결과 화면에 꽂는다. 스테이지가 끝나는 **유일한** 경로다. */
  function showResult(current: StageSession, outcome: StageOutcome): void {
    // 전투가 먼저 끝난 경우(클리어·패배)에는 아직 포지션이 열려 있을 수 있다 (FR-8.1).
    current.closeAtStageEnd(elapsedMs);
    announceClose(current);

    const wallet = current.walletSnapshot;
    const combat = current.combatState;
    const facts = current.settlementFacts;
    const settlement = computeSettlement({
      outcome,
      remainingGold: wallet.gold,
      remainingAum: wallet.aum,
      totalGoldEarned: facts.totalGoldEarned,
      closeCount: facts.closeCount,
      profitCloseCount: facts.profitCloseCount,
      baseHp: combat.baseHp,
      maxBaseHp: combat.maxBaseHp,
      // 전투 시뮬레이션에 적 본진 개념이 아직 없다 (`CombatState` 참고).
      enemyBaseDestroyed: false,
    });

    refs!.resultTitle.textContent = settlementTitle(outcome);
    refs!.resultSubtitle.textContent = settlementSubtitle(outcome);
    refs!.resultBody.innerHTML = buildSettlementRowsMarkup(
      settlementRows(settlement, wallet, facts),
    );
    refs!.result.classList.toggle('stage__result--win', outcome === 'cleared');
    refs!.result.hidden = false;
    refs!.prep.hidden = true;
    resultShown = true;
    refs!.resultRetryButton.focus();
  }

  /** 결과 화면에서 같은 지역을 새 시드로 다시 시작한다. */
  function restartStage(): void {
    seed += 1;
    session = null;
    hideResult();
    loop.start(); // 이미 돌고 있으면 아무 일도 하지 않는다.
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

  /**
   * 배속 (FR-3.5) — CLICK-PATH-002.
   *
   * 예전에는 클릭 한 번에 `session = null`이 **무음으로** 실행돼 웨이브 10에서 4x 를 누르면
   * 지갑·타워·웨이브가 통째로 사라졌다. 판정은 전부 `resolveSpeedChange`(순수)에 있고
   * 여기서는 그 결과를 화면에 옮기기만 한다.
   */
  for (const button of refs.speedButtons) {
    button.addEventListener('click', () => {
      const result = resolveSpeedChange({
        requested: Number(button.dataset['speed']) || 1,
        current: speed,
        armed: armedSpeed,
        hasSession: session !== null,
      });
      speed = result.speed;
      armedSpeed = result.armed;
      refs.log.textContent = result.message;
      if (result.restart) {
        restartStage();
      }
      syncButtons();
    });
  }

  for (const button of refs.towerButtons) {
    button.addEventListener('click', () => {
      selectedTower = (button.dataset['tower'] as TowerKind | undefined) ?? 'basic';
      syncButtons();
      refs.log.textContent = `${TOWER_IDENTITY[selectedTower].displayName} 선택 (${TOWER_IDENTITY[selectedTower].laneLabel}) — 빈 슬롯을 클릭하세요`;
    });
  }

  /**
   * 유닛 소환 — CLICK-PATH-004.
   *
   * 버튼은 `syncRosterButtons`가 매 프레임 비활성으로 만들지만, 골드가 딱 떨어지는 순간의
   * 클릭이나 스크린리더 경로가 남아 있으므로 **실패도 화면에 남긴다**. 성공/실패 문구는
   * 반드시 `summon`의 불리언에서만 갈린다.
   */
  for (const button of refs.unitButtons) {
    button.addEventListener('click', () => {
      const kind = button.dataset['unit'] as UnitKind | undefined;
      const current = session;
      if (!kind || !current) {
        return;
      }
      const identity = ALLY_IDENTITY[kind];
      if (current.summon(kind)) {
        refs.log.textContent = formatActionLog({
          ok: true,
          verb: '소환',
          displayName: identity.displayName,
          cost: UNIT_COST[kind],
        });
        return;
      }
      refs.log.textContent = formatUnaffordableNotice(identity.displayName, UNIT_COST[kind]);
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
      // 건설 실패(골드 부족)도 화면에 남긴다 — 예전에는 아무 피드백이 없었다.
      refs.log.textContent = formatActionLog({
        ok: current.build(slot, selectedTower),
        verb: '건설',
        displayName: TOWER_IDENTITY[selectedTower].displayName,
        cost: TOWER_BUILD_COST[selectedTower],
      });
      return;
    }
    if (existing.level === 1) {
      // ★ 성공 여부를 확인한 뒤에 로그를 찍는다 (CLICK-PATH-003) ★
      // 예전에는 `upgrade`가 `void`라 골드 부족으로 조용히 실패해도 성공 로그가 나갔다.
      refs.log.textContent = formatActionLog({
        ok: current.upgrade(slot),
        verb: '업그레이드',
        displayName: TOWER_IDENTITY[existing.kind].displayName,
        cost: TOWER_UPGRADE_COST[existing.kind],
      });
    }
  });

  root
    .querySelector<HTMLButtonElement>('[data-action="restart"]')
    ?.addEventListener('click', restartStage);

  refs.resultRetryButton.addEventListener('click', restartStage);

  /** 결과 화면 → 지역 선택. 루프를 세워야 오버레이 뒤에서 새 판이 시작되지 않는다. */
  refs.resultRegionButton.addEventListener('click', () => {
    loop.stop();
    session = null;
    hideResult();
    refs.stage.classList.add('stage--gated');
    showRegionSelect();
  });

  /** 카운트다운의 [바로 시작] — Space 가 막힌 상황의 대비책 (CLICK-PATH-005). */
  refs.prepSkipButton.addEventListener('click', () => {
    session?.skipPrep();
  });

  /** Space 를 받은 시점의 포커스 대상 분류. 판정은 `shouldSkipPrep`이 한다. */
  function focusKindOf(target: EventTarget | null): FocusKind {
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return 'text-field';
    }
    return target instanceof HTMLButtonElement ? 'button' : 'none';
  }

  /**
   * 포커스가 **키보드로** 들어왔는가.
   *
   * `:focus-visible`은 마우스 클릭으로 남은 포커스를 제외한다 — 바로 이 구분이
   * CLICK-PATH-005 의 해법이다. 지원하지 않는 환경에서는 `matches`가 던지므로,
   * 그 경우 보수적으로 "키보드 포커스"로 보고 Space 를 버튼에 양보한다.
   */
  function isKeyboardFocused(target: Element): boolean {
    try {
      return target.matches(':focus-visible');
    } catch {
      return true;
    }
  }

  /**
   * Space — 준비 시간 즉시 종료. "아는 사람은 기다리지 않는다."
   *
   * 예전에는 포커스 대상이 버튼이기만 하면 무조건 반환했다. 그런데 준비 5초는 **정확히
   * 빌드바 버튼을 누르는 구간**이라, 타워를 하나 고른 직후 포커스가 그 버튼에 남아
   * Space 가 늘 삼켜졌다 — 화면은 계속 "Space로 바로 시작"이라고 말하면서.
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
    const skip = shouldSkipPrep({
      hasSession: session !== null,
      prepRemainingMs: session?.prepRemainingMs ?? 0,
      focusKind: focusKindOf(target),
      keyboardFocused: target instanceof Element ? isKeyboardFocused(target) : false,
    });
    if (!skip) return;

    event.preventDefault(); // 스페이스바 스크롤 방지
    session?.skipPrep();
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
