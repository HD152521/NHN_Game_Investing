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
import './codex.css';
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
import { computeLayout, computePriceRange, drawChart, indexToCenterX, priceToY } from '../chart';
import {
  ALLY_IDENTITY,
  SKILL_SPECS,
  TOWER_BUILD_COST,
  TOWER_IDENTITY,
  TOWER_UPGRADE_COST,
  UNIT_COST,
} from '../combat';
import type { CombatState, SkillId, StageId, TowerKind, UnitKind } from '../combat';
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
import { audioControlView, createGameAudio, diffCombatEvents, percentToVolume, prepTickIndex } from '../audio';
import type { AudioSettings, CombatAudioFrame, GameAudio } from '../audio';
import { createFrameLoop, createRafScheduler } from './frame-loop';
import { mountRegionArt, regionNameOf, stageIdFor, syncRegionLocks } from './region-select';
import { clearedCount, loadProgress, markTutorialSeen, recordCard, recordCleared } from './progress';
import {
  CODEX_FILTER_ACTION,
  buildCodexBodyMarkup,
  codexFilterFor,
  mintCard,
} from './codex';
import type { CodexFilter } from './codex';
import {
  COMBAT_HELD_NOTICE,
  TUTORIAL_STEPS,
  advanceTutorial,
  initialTutorialState,
  shouldHoldCombat,
  isTutorialDone,
  skipTutorial,
  tutorialOverlay,
} from './tutorial';
import type { TutorialState } from './tutorial';
import {
  REVEAL_TOTAL_MS,
  pendingStageNotices,
  revealFrame,
  skipToNextStage,
} from './reveal';
import type { RevealInput } from './reveal';
import {
  CHALLENGE_TERRITORIES,
  challengeModeOf,
  dailySeedFor,
  parseSeedInput,
} from './challenge';
import type { ChallengeMode } from './challenge';
import { buildResultCard } from './result-card';

import type { GameProgress } from './progress';
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

/**
 * 전투 상태에서 **소리 판정에 필요한 것만** 뽑는다.
 *
 * `src/audio`는 `src/combat`을 import하지 않으므로(§17-2 경계 규칙) 여기가 두 세계를
 * 잇는 유일한 지점이다. 참조를 그대로 넘긴다 — `towers` 배열은 전투가 불변으로 다루므로
 * 복사할 이유가 없고, 매 프레임 복사하면 "프레임당 할당 0"이 깨진다.
 */
function audioFrameOf(state: CombatState): CombatAudioFrame {
  return {
    towers: state.towers,
    hasBoss: state.boss != null,
    baseHp: state.baseHp,
    wave: state.wave,
  };
}

const DEFAULT_STAKE_RATIO: StakeRatio = 0.25;

/**
 * 결과 카드 크기 — **고정값**이다.
 *
 * 화면 크기에 따라 카드가 달라지면 같은 성적이 사람마다 다른 그림으로 나간다.
 * 가로 세로 비를 소셜 공유에 흔한 1.91:1 근처로 잡았다.
 */

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
/** 카드 상단에서 차트가 차지하는 높이. 나머지가 수치 영역이다. */
const CARD_CHART_HEIGHT = 300;

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
   * 사용자가 시드를 직접 골랐는가 (일일 챌린지 · 시드 입력).
   *
   * `challengeModeOf`가 이 값으로 `seed`와 `free`를 가른다 — 그냥 시작한 판까지 "시드
   * 대결"로 표시하면 라벨이 의미를 잃는다.
   */
  let seedPicked = false;
  /**
   * 이 판이 챌린지인가. **챌린지에서는 heat를 1로 고정한다** (`CHALLENGE_TERRITORIES`).
   * 같은 시드라도 진도가 앞선 사람은 적 HP가 높은 판을 받으므로, 그대로 두면 랭킹이
   * 조용히 불공정해진다 (`challenge.ts` 머리말).
   */
  let challengeRun = false;
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
  /** 공개 연출이 떠 있는가. 정산 앞 단계라 `resultShown`과 별개로 필요하다(위 render 주석). */
  let revealShown = false;
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
   * ── 사운드 (PRD §3.1 ⑬) ──────────────────────────────────────
   *
   * **앱 수명 동안 하나만 만든다.** `AudioContext`는 브라우저당 개수 제한이 있어
   * 판마다 새로 만들면 몇 판 뒤에 소리가 통째로 사라진다.
   *
   * ⚠️ 이 시점의 컨텍스트는 **`suspended`**다 — 브라우저 자동재생 정책은 첫 사용자
   * 제스처 전에는 소리를 내주지 않는다. 그래서 시작 게이트의 버튼들이 `audio.resume()`을
   * 부른다(아래 배선). 여기서 미리 부르면 브라우저가 거부하고 경고만 남는다.
   *
   * 소리를 못 만드는 환경(테스트·구형 브라우저)에서는 `available === false`인 무음
   * 엔진이 되며, **아래의 어떤 호출도 던지지 않는다.**
   */
  const audio: GameAudio = createGameAudio({
    onSettingsChange: (settings) => syncAudioControls(settings),
  });

  /**
   * 직전 프레임의 전투 상태(소리 판정용). `null`이면 아직 기준이 없다는 뜻이라
   * 이번 프레임은 **기록만 하고 아무 소리도 내지 않는다.**
   *
   * 세션이 새로 만들어질 때마다 `null`로 되돌린다 — 그러지 않으면 지난 판의 마지막
   * 상태(웨이브 13 · HP 12)와 새 판의 첫 상태(웨이브 0 · HP 100)를 비교하게 된다.
   */
  let previousCombatFrame: CombatAudioFrame | null = null;

  /** 직전 프레임의 준비 카운트다운 눈금. 바뀔 때만 틱이 울린다(초당 1회). */
  let previousPrepTick = 0;

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
      /*
       * ★ 진입·추가매수 소리는 여기서 낸다 ★ 청산은 `announceClose`가 소유하므로
       * `onClose`에는 소리가 없다 — 두 곳에서 울리면 청산음이 두 번 난다.
       *
       * ⚠️ 성공 여부를 모르는 자리다(`openTrade`는 `void`다). 그래서 진입음은 "버튼을
       * 눌렀다"는 사실에 붙는다. 패널이 이미 `canOpen`으로 버튼을 잠그고 있어 실패
       * 경로가 거의 없고, 소리는 보조 채널이라 여기서 판정을 새로 만들지 않는다.
       */
      onOpen: (direction: Direction) => {
        session?.openTrade(direction, stakeRatio, elapsedMs);
        audio.emit({ kind: 'trade-open' }, lastFrameMs);
      },
      onClose: () => session?.closeTrade(elapsedMs),
      onAdd: (ratio) => {
        session?.addTrade(ratio, elapsedMs);
        audio.emit({ kind: 'trade-add' }, lastFrameMs);
      },
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

  /**
   * 저장된 진행도. 앱 시작 시 1회 읽고, 클리어할 때마다 갱신한다.
   *
   * 셸이 들고 있는 이유는 두 곳이 이 값을 쓰기 때문이다: 지역 잠금(`syncRegionLocks`)과
   * heat(`StageSession` 생성자). 매번 `localStorage`를 다시 읽으면 프레임 루프 안에서
   * 동기 I/O가 도는 셈이라 여기 캐시한다.
   */
  let progress: GameProgress = loadProgress();

  /**
   * 튜토리얼 진행 상태. **첫 회차 판정은 진행도에서 파생한다** — 클리어한 지역이 하나도
   * 없으면 처음 온 사람으로 본다. 별도 "튜토리얼 봤음" 플래그를 두지 않는 이유는 §19-4다.
   *
   * ⚠️ 앱 수명 동안 한 번만 읽는다. 판 중간에 클리어해도 그 판의 스킵 가능 여부는 바뀌지
   * 않아야 한다 — 바뀌면 스킵 버튼이 판 도중에 갑자기 활성화된다.
   */
  /**
   * 튜토리얼을 이번 세션에 띄울 것인가 — **진행도의 `tutorialSeen`으로 판정한다.**
   *
   * 예전에는 "클리어한 지역이 0개면 첫 회차"로 봤는데, 지역을 깨기 전에는 그 값이 영원히
   * 0이라 **매 판 다시 뜨고 건너뛰기 버튼은 영구 비활성**이었다(실제 피드백).
   * 본 것과 깬 것은 별개의 사실이므로 필드를 나눴다.
   *
   * 이미 본 사람에게는 완료 상태로 시작해 오버레이가 아예 뜨지 않는다.
   */
  let tutorialState: TutorialState = progress.tutorialSeen
    ? { stepIndex: TUTORIAL_STEPS.length, aumMark: null }
    : initialTutorialState();

  /**
   * 튜토리얼이 전투를 붙잡아 둔 누적 시간(ms).
   *
   * ★ 왜 세어 두는가 ★ 웨이브만 멈추고 차트는 계속 흐르므로 **두 시계가 어긋난다.**
   * 이 값을 장 마감 때 연장 시간에 그대로 얹어 전투 총시간을 보존한다 — 그러지 않으면
   * 튜토리얼을 천천히 읽은 사람이 마지막 웨이브를 못 끝내고 unresolved(자본금 0)가 된다.
   * "설명을 꼼꼼히 읽으면 벌을 받는다"는 구조는 튜토리얼로서 자기모순이다.
   */
  let tutorialHoldMs = 0;

  /** 강조 클래스 전체 목록. 지울 때 하나라도 빠지면 강조가 남는다. */
  const TUTORIAL_FOCUS_CLASSES = [
    'stage--tut-chart',
    'stage--tut-trade',
    'stage--tut-buildbar',
    'stage--tut-battle',
  ] as const;

  function startSession(nowMs: number): void {
    // 점령 수가 heat가 된다 — 지역을 깰수록 다음 판의 적 HP가 올라간다 (FR-6.7).
    // ★ 단 챌린지는 0으로 못박는다 ★ 같은 시드로 성적을 비교하려면 난이도가 같아야 한다.
    const territories = challengeRun ? CHALLENGE_TERRITORIES : clearedCount(progress);
    session = new StageSession(seed, speed, nowMs, stageId, territories);
    lastFrameMs = nowMs;
    marketClosed = false;
    overtimeRemainingMs = 0;
    tutorialHoldMs = 0;
    armedSpeed = null;
    // 소리 기준을 함께 갈아 끼운다 — 지난 판의 마지막 상태와 비교하면 판이 시작되는
    // 순간 피격음·웨이브음이 가짜로 터진다.
    previousCombatFrame = null;
    previousPrepTick = 0;
    refs!.volume.textContent = `거래량 ${session.set.volumeMultiple.toFixed(1)}×`;
    hideResult();
  }

  /**
   * 사운드 설정 UI를 현재 설정에 맞춘다. **표시는 전부 `src/audio`에서 온다** — 여기서
   * 문구를 만들면 §19-4의 이중 출처가 된다.
   *
   * `aria-pressed`와 화면 표시가 같은 값을 쓰므로 스크린리더와 눈이 보는 사실이 갈리지 않는다.
   */
  function syncAudioControls(settings: AudioSettings): void {
    const view = audioControlView(settings);
    refs!.audioMuteButton.setAttribute('aria-pressed', view.pressed);
    refs!.audioMuteButton.title = view.label;
    const description = refs!.audioMuteButton.querySelector('.sr-only');
    if (description) description.textContent = view.label;
    // 슬라이더는 음소거 중에도 조작할 수 있다 — 끄기 전 크기를 미리 맞춰 두는 사용이 있다.
    refs!.audioSlider.value = view.sliderValue;
    refs!.audioValue.textContent = view.valueText;
  }

  /** 결과 화면을 닫고 다음 세션이 만들어질 수 있는 상태로 되돌린다. */
  function hideResult(): void {
    resultShown = false;
    revealShown = false;
    refs!.reveal.hidden = true;
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
    // 이펙트와 같은 조건에서만 울린다 — 거부된 시전에 소리가 나면 화면이 거짓말을 한다.
    audio.emit({ kind: 'skill-cast', skill: id }, nowMs);

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
  /**
   * 튜토리얼 한 프레임 — 판정은 전부 `tutorial.ts`가 한다.
   *
   * 이 함수가 하는 일은 셋뿐이다: ① 세션 상태를 `TutorialView`로 **좁혀** 넘기고
   * ② 돌아온 오버레이 데이터를 DOM에 옮기고 ③ 강조 클래스를 스테이지에 건다.
   * 여기서 문구를 만들거나 완료 조건을 판단하지 마라 — 그 순간 §19-7의 사각으로 들어간다.
   *
   * ⚠️ 게임을 멈추지 않는다. 가이드 모드라 튜토리얼이 떠 있는 동안에도 재생·전투·강제
   * 청산이 그대로 돈다. 단계를 붙잡아 두면 판이 끝나 버리므로, 완료된 단계는 즉시 넘긴다
   * (`advanceTutorial`이 연속 전이를 처리한다).
   */
  function syncTutorial(current: StageSession, elapsed: number): void {
    const snap = current.snapshot(elapsed);
    const facts = current.settlementFacts;
    const next = advanceTutorial(tutorialState, {
      elapsedMs: elapsed,
      holding: snap.position !== null,
      closeCount: facts.closeCount,
      aum: snap.wallet.aum,
      towers: current.combatState.towers,
    });
    const changed = next !== tutorialState;
    tutorialState = next;

    // 끝까지 봤으면 기록한다 — 다음 판부터는 뜨지 않는다.
    if (changed && isTutorialDone(tutorialState) && !progress.tutorialSeen) {
      progress = markTutorialSeen();
    }

    const overlay = tutorialOverlay(tutorialState);
    refs!.tutorial.hidden = !overlay.visible;
    // 강조는 매 프레임 건드리면 낭비다 — 단계가 바뀔 때만 갱신한다.
    if (!changed && !overlay.visible) {
      return;
    }
    refs!.tutorialStep.textContent = `STEP ${overlay.stepNumber} / ${overlay.stepTotal}`;
    refs!.tutorialTitle.textContent = overlay.title;
    refs!.tutorialInstruction.textContent = overlay.instruction;
    // 전투가 멈춰 있다는 사실을 '왜' 줄에 덧붙인다 — 적이 안 오는 것을 고장으로 읽지 않게.
    refs!.tutorialWhy.textContent = overlay.combatHeld
      ? `${overlay.why}
⏸ ${COMBAT_HELD_NOTICE}`
      : overlay.why;
    refs!.tutorialFill.style.width = `${Math.round(overlay.progress * 100)}%`;
    refs!.tutorialSkipButton.disabled = !overlay.skippable;

    for (const focus of TUTORIAL_FOCUS_CLASSES) {
      refs!.stage.classList.remove(focus);
    }
    if (overlay.focus !== null) {
      refs!.stage.classList.add(`stage--tut-${overlay.focus}`);
    }
  }

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
    /*
     * ★ 소리도 여기서 낸다 ★ 청산이 확정된 유일한 지점이라 강제 청산·수동 청산·장 마감
     * 청산이 전부 이 함수를 지난다. 판정(이익/손실/강제)은 `soundForEvent`가 하고
     * 셸은 사실만 넘긴다 — `reason` 문자열이 `src/position`과 같아서 변환이 없다.
     */
    audio.emit(
      { kind: 'trade-close', pnl: notice.position.pnl, reason: notice.position.reason },
      lastFrameMs,
    );
    goldMeter.launch({
      goldGained: notice.goldGained,
      pnl: notice.position.pnl,
      reason: notice.position.reason,
    });
  }

  function render(nowMs: number): void {
    /*
     * 결과 화면이 떠 있으면 화면을 그 상태로 고정한다. 다음 판은 결과 화면의 두 버튼
     * ([다시] / [지역 선택으로])에서만 시작된다 — 저절로 재시작되는 경로는 없다.
     *
     * ★ `revealShown`도 반드시 함께 본다 ★
     * 공개 연출은 정산 **앞**에 오므로(FR-9.1) 그 시점에 `resultShown`은 아직 false다.
     * 이 조건을 빠뜨리면 프레임 루프가 계속 돌면서 `decision.kind === 'finish'`를 매 프레임
     * 다시 만나 `showReveal`을 재호출하고, 그때마다 경과 시간이 0으로 리셋되어
     * **연출이 영원히 끝나지 않는다**(실제로 발생했다: "스테이지 끝나면 이상한 차트 화면이
     * 나오면서 아무것도 안 됨").
     */
    if (resultShown || revealShown) {
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

    /*
     * ★ 튜토리얼 ①②③ 동안에는 웨이브를 멈춘다 ★
     * 그 셋은 돈의 흐름(차트 → 진입 → 청산 → 골드)을 설명하는 구간이라 전장에서 할 일이
     * 없는데, 웨이브 시계는 그동안에도 돌아 적이 밀려들고 본진이 깎였다.
     * 차트는 계속 흘려야 한다 — ①이 "차트가 흐르는 것을 본다"이고 ②③은 실제 매매다.
     * 멈춘 만큼은 아래 장 마감에서 연장 시간으로 되돌려준다.
     */
    if (shouldHoldCombat(tutorialState)) {
      tutorialHoldMs += dt;
    } else {
      session.stepCombatFrame(dt);
    }
    announceClose(session);

    const snap = session.snapshot(elapsedMs);
    const combat = session.combatState;

    /*
     * ── 전투 소리 (PRD §3.1 ⑬) ──────────────────────────────────
     *
     * 판정은 전부 `src/audio`의 순수 함수가 한다. 셸이 하는 일은 ① 전투 상태를
     * `CombatAudioFrame`으로 **좁혀** 넘기고 ② 돌아온 이벤트 목록을 그대로 흘리는 것뿐이다
     * (튜토리얼·날씨 배선과 같은 모양이다).
     *
     * ⚠️ **연타 억제는 여기서 하지 않는다.** 타워 6기가 초당 10회 넘게 쏘므로 억제가
     * 없으면 소리 벽이 되는데, 그 판정은 `throttle.ts`가 소유한다 — 셸이 미리 줄이면
     * 두 곳에 규칙이 생기고 테스트가 붙지 않는다.
     *
     * 첫 프레임(`previousCombatFrame === null`)은 기준만 잡고 아무 소리도 내지 않는다.
     */
    const audioFrame = audioFrameOf(combat);
    if (previousCombatFrame !== null) {
      audio.emitAll(
        diffCombatEvents(previousCombatFrame, audioFrame, session.lastCombatDeaths),
        nowMs,
      );
    }
    previousCombatFrame = audioFrame;

    // 준비 카운트다운 — 초 눈금이 바뀔 때만. 프레임마다 울리면 초당 60회다.
    const prepTick = prepTickIndex(combat.phase === 'running' ? combat.prepRemainingMs : 0);
    if (prepTick !== previousPrepTick && prepTick > 0) {
      audio.emit({ kind: 'prep-tick' }, nowMs);
    }
    previousPrepTick = prepTick;

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
    syncTutorial(session, state.elapsedMs);

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
      // 튜토리얼이 붙잡아 둔 만큼을 얹어 전투 총시간을 보존한다(위 `tutorialHoldMs` 주석).
      overtimeRemainingMs = session.combatParams.waveDurationMs + tutorialHoldMs;
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
      // ★ FR-9.1 — 공개 연출이 정산 **앞**에 온다 ★
      // 패배해도 보여준다(FR-9.5): 실패해도 정체를 알려줘야 재도전 동기가 생긴다.
      const current = session;
      const outcome = decision.outcome;
      pendingOutcome = outcome;
      // 결말은 공개 연출 **앞**에서 울린다 — 연출이 시작되는 순간이 결과를 안 순간이다.
      audio.emit({ kind: 'stage-end', outcome }, nowMs);
      showReveal(current, () => showResult(current, outcome));
    }
  }

  /** 정산을 계산해 결과 화면에 꽂는다. 스테이지가 끝나는 **유일한** 경로다. */
  /**
   * ── 공개 연출 (FR-9) ─────────────────────────────────────────
   *
   * 정산 **앞**에 온다(FR-9.1: 정산 직후, 보상 선택 전). 시퀀스가 끝나야 정산이 뜬다.
   *
   * 프레임 루프는 이미 멈춰 있으므로(결과 확정), 연출은 `scheduler`(rAF)로 따로 돈다 —
   * 골드 비행 연출과 같은 방식이다. 시계는 rAF의 `nowMs`를 쓰고, 그 차이만 누적한다.
   */
  let revealInput: RevealInput | null = null;
  let revealElapsedMs = 0;
  let revealLastMs: number | null = null;
  let revealHandle: number | null = null;
  /** 연출이 끝나면 실행할 것 — 정산 화면 띄우기. */
  let revealThen: (() => void) | null = null;

  function stopReveal(): void {
    if (revealHandle !== null) {
      scheduler.cancel(revealHandle);
      revealHandle = null;
    }
    revealLastMs = null;
  }

  function finishReveal(): void {
    stopReveal();
    revealInput = null;
    revealShown = false;
    refs!.reveal.hidden = true;
    const then = revealThen;
    revealThen = null;
    then?.();
  }

  /** 차트 위에 매매를 되짚어 그린다. 좌표 변환은 전부 여기(렌더러)가 한다. */
  function drawRevealChart(current: StageSession, markers: ReturnType<typeof revealFrame>['markers']): void {
    const ctx = refs!.revealCanvas.getContext('2d');
    if (!ctx) return;

    const bars = current.set.bars;
    // 공개 연출에서는 **블라인드가 풀린다** — 마지막 봉까지 전부 보여준다.
    drawChart(ctx, {
      bars,
      state: current.replay.tick(Number.MAX_SAFE_INTEGER),
      palette: theme.palette,
      width: CHART_WIDTH,
      height: CHART_HEIGHT,
    });
    if (markers.length === 0 || bars.length === 0) return;

    const layout = computeLayout(CHART_WIDTH, CHART_HEIGHT);
    const range = computePriceRange(bars);
    const lastIndex = bars.length - 1;

    for (const marker of markers) {
      const openX = indexToCenterX(Math.round(marker.openAt * lastIndex), bars.length, layout.horizontal);
      const closeX = indexToCenterX(Math.round(marker.closeAt * lastIndex), bars.length, layout.horizontal);
      const openY = priceToY(marker.openPrice, range, layout.candles);
      const closeY = priceToY(marker.closePrice, range, layout.candles);
      const color = theme.palette[marker.tone];

      // 진입 → 청산을 잇는 선. 이게 "얼마나 오래 들고 있었는가"를 한눈에 보여준다.
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(openX, openY);
      ctx.lineTo(closeX, closeY);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 진입 표식 ▲/▼.
      ctx.fillStyle = color;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(marker.glyph, openX, openY);

      // 강제 청산은 ✕ — "졌다"가 아니라 "터졌다"를 따로 읽히게 한다.
      ctx.fillText(marker.liquidated ? '✕' : '●', closeX, closeY);
      ctx.restore();
    }
  }

  function renderReveal(current: StageSession): void {
    if (!revealInput) return;
    const frame = revealFrame(revealInput, revealElapsedMs);
    refs!.revealTitle.textContent = frame.title;
    refs!.revealSubtitle.textContent = frame.subtitle;

    drawRevealChart(current, frame.markers);

    refs!.revealSummary.innerHTML = frame.summary
      .map(
        (line) =>
          `<div class="stage__reveal-row"><dt>${line.label}</dt>` +
          `<dd${line.tone ? ` style="color:${theme.palette[line.tone]}"` : ''}>${line.value}</dd></div>`,
      )
      .join('');

    // 아직 못 만드는 단계는 숨기지 않고 알린다 — 게이트가 약속한 것은 '정체 공개'인데
    // 지금 보여주는 것은 매매 되짚기뿐이라, 아무 말도 없으면 약속 위반으로 읽힌다.
    refs!.revealPending.textContent =
      frame.stage === 'summary' ? `아직 오지 않은 것 — ${pendingStageNotices().join(' · ')}` : '';
  }

  function showReveal(current: StageSession, then: () => void): void {
    const facts = current.settlementFacts;
    const wallet = current.walletSnapshot;
    const combat = current.combatState;
    const settlement = computeSettlement({
      outcome: pendingOutcome ?? 'unresolved',
      remainingGold: wallet.gold,
      remainingAum: wallet.aum,
      totalGoldEarned: facts.totalGoldEarned,
      closeCount: facts.closeCount,
      profitCloseCount: facts.profitCloseCount,
      baseHp: combat.baseHp,
      maxBaseHp: combat.maxBaseHp,
      enemyBaseDestroyed: false,
    });
    const bars = current.set.bars;
    const first = bars[0];
    const last = bars[bars.length - 1];
    revealInput = {
      outcome: pendingOutcome ?? 'unresolved',
      settlement,
      closes: current.closedPositions,
      stageDurationMs: elapsedMs > 0 ? elapsedMs : 1,
      ohlcv: {
        open: first?.o ?? 0,
        high: bars.reduce((max, bar) => Math.max(max, bar.h), 0),
        low: bars.reduce((min, bar) => Math.min(min, bar.l), Number.POSITIVE_INFINITY),
        close: last?.c ?? 0,
        volumeMultiple: current.set.volumeMultiple,
      },
    };
    revealElapsedMs = 0;
    revealLastMs = null;
    revealThen = then;
    revealShown = true;
    refs!.reveal.hidden = false;
    renderReveal(current);
    refs!.revealSkipButton.focus();

    const tick = (nowMs: number): void => {
      revealHandle = null;
      if (revealLastMs !== null) {
        revealElapsedMs += Math.min(nowMs - revealLastMs, MAX_FRAME_DT_MS);
      }
      revealLastMs = nowMs;
      renderReveal(current);
      if (revealElapsedMs >= REVEAL_TOTAL_MS) {
        finishReveal();
        return;
      }
      revealHandle = scheduler.request(tick);
    };
    revealHandle = scheduler.request(tick);
  }

  /** 연출이 끝난 뒤 띄울 결과. `showReveal`이 정산을 다시 계산하려면 필요하다. */
  let pendingOutcome: StageOutcome | null = null;

  /** 마지막 정산 — 결과 카드가 같은 수치를 다시 계산하지 않도록 물고 있는다(단일 출처). */
  let lastSettlement: ReturnType<typeof computeSettlement> | null = null;

  /**
   * 결과 카드를 PNG로 굽는다.
   *
   * 카드 크기는 **공유 매체에 맞춘 고정값**이다 — 화면 크기에 따라 카드가 달라지면
   * 같은 성적이 사람마다 다른 그림으로 나간다. 내용은 전부 `result-card.ts`가 정하고
   * 여기서는 픽셀만 찍는다.
   */
  function renderResultCard(current: StageSession): HTMLCanvasElement | null {
    if (lastSettlement === null) {
      return null;
    }
    const mode: ChallengeMode = challengeModeOf(seed, new Date(), seedPicked);
    const combat = current.combatState;
    const closes = current.closedPositions;
    const card = buildResultCard({
      outcome: lastSettlement.outcome,
      settlement: lastSettlement,
      stageId,
      stageName: regionNameOf(stageId),
      seed,
      mode,
      closeCount: closes.length,
      liquidatedCount: closes.filter((close) => close.reason === 'liquidated').length,
      remainingBaseHp: combat.baseHp,
      maxBaseHp: combat.maxBaseHp,
    });

    const canvas = document.createElement('canvas');
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    const palette = theme.palette;

    ctx.fillStyle = palette.BG_0;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // 차트를 무채색 배경처럼 깐다 — 카드의 정체는 '그날의 차트'다.
    ctx.save();
    ctx.globalAlpha = 0.35;
    drawChart(ctx, {
      bars: current.set.bars,
      state: current.replay.tick(Number.MAX_SAFE_INTEGER),
      palette,
      width: CARD_WIDTH,
      height: CARD_CHART_HEIGHT,
    });
    ctx.restore();

    ctx.fillStyle = palette.MUTED;
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('TICKER FRONT', 32, 28);
    ctx.fillText(card.modeLabel, 32, CARD_CHART_HEIGHT + 24);

    ctx.fillStyle = palette[card.gradeTone];
    ctx.font = 'bold 92px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(card.grade, CARD_WIDTH - 32, 24);

    ctx.font = '20px sans-serif';
    ctx.fillText(card.headline, CARD_WIDTH - 32, 130);

    ctx.textAlign = 'left';
    ctx.fillStyle = palette.TEXT;
    ctx.font = '22px sans-serif';
    ctx.fillText(card.identity, 32, CARD_CHART_HEIGHT + 56);

    // 수치 줄들. 색 토큰이 있으면 그 색으로 — 초록은 팔레트에 없다.
    let y = CARD_CHART_HEIGHT + 104;
    for (const stat of card.stats) {
      ctx.fillStyle = palette.MUTED;
      ctx.font = '16px sans-serif';
      ctx.fillText(stat.label, 32, y);
      ctx.fillStyle = stat.tone ? palette[stat.tone] : palette.TEXT;
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(stat.value, 200, y - 4);
      y += 44;
    }

    ctx.fillStyle = palette.MUTED;
    ctx.font = '14px sans-serif';
    ctx.fillText(card.shareLine, 32, CARD_HEIGHT - 34);

    lastCardName = card.fileName;
    lastShareLine = card.shareLine;
    return canvas;
  }

  let lastCardName = 'ticker-front';
  let lastShareLine = '';

  function showResult(current: StageSession, outcome: StageOutcome): void {
    // ★ 진행도 기록은 여기 한 곳뿐이다 ★ 정산 화면이 스테이지가 끝나는 유일한 경로이고
    // (무음 리셋 경로는 타입 수준에서 제거됐다), `cleared`만 점령으로 친다.
    // 저장에 실패해도 반환된 진행도는 갱신돼 있어 그 판 안에서는 잠금 해제가 보인다.
    if (outcome === 'cleared') {
      progress = recordCleared(stageId);
    }

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
    // 결과 카드가 같은 수치를 다시 계산하지 않도록 물고 있는다(단일 출처).
    lastSettlement = settlement;

    // ★ 도감 카드는 클리어에만 발행된다 ★ 정산과 같은 조건(`cleared`)을 쓰는 이유는
    // 도감이 "막아낸 날의 기록"이기 때문이다 — 진 판은 기록이 아니다. 등급·적중률은
    // 방금 계산한 `settlement`에서 가져와 두 화면이 다른 숫자를 말할 수 없게 한다.
    if (outcome === 'cleared') {
      const minted = recordCard(
        mintCard({
          stageId,
          seed,
          grade: settlement.grade,
          chart: current.set,
          durationMs: elapsedMs,
          baseHp: combat.baseHp,
          maxBaseHp: combat.maxBaseHp,
          accuracy: settlement.accuracy,
        }),
      );
      progress = minted.progress;
      if (minted.isNew) {
        // 처음 본 날에만 알린다. 같은 시드를 다시 깼을 때 "획득"이라고 말하면 거짓이다.
        refs!.log.textContent = '도감 카드 획득 — 타이틀의 [도감]에서 볼 수 있습니다';
      }
    }

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
    refs!.codex.hidden = true;
    refs!.gate.hidden = false;
    refs!.startButton.focus();
  }

  // ── 도감 (PRD P1 #10) ──────────────────────────────────────
  /**
   * 현재 필터. **본문 밖에 둔다** — 본문은 열 때마다 통째로 다시 그려지므로,
   * 상태를 DOM(선택된 탭의 class)에서 읽으면 다시 그리는 순간 잃는다.
   */
  let codexFilter: CodexFilter = 'all';

  /**
   * 도감 본문을 다시 그린다.
   *
   * 카드 수가 세 자리를 넘지 않으므로 부분 갱신 대신 전체 교체를 쓴다 — 필터 상태와
   * 카드 목록이 어긋날 여지가 구조적으로 없어진다. 진행도(`progress`)가 단일 출처다.
   */
  function renderCodex(): void {
    refs!.codexBody.innerHTML = buildCodexBodyMarkup(progress.codexCards, {
      filter: codexFilter,
    });
  }

  function showCodex(): void {
    // 저장소를 다시 읽는다 — 다른 탭에서 판을 깼을 수도 있고, 무엇보다 도감은
    // "지금까지 모은 전부"를 보여야 하는 화면이다.
    progress = loadProgress();
    renderCodex();
    refs!.gate.hidden = true;
    refs!.codex.hidden = false;
    refs!.codexBackButton.focus();
  }

  function showRegionSelect(): void {
    refs!.gate.hidden = true;
    refs!.regionSelect.hidden = false;
    // 마크업은 앱 시작 시 1회만 지어지므로, 그 사이 클리어로 열린 지역을 여기서 되맞춘다.
    syncRegionLocks(refs!.regionSelect, progress);
    // 키보드·스크린리더 사용자가 오버레이 안에서 바로 이어갈 수 있게 첫 카드로 포커스를 옮긴다.
    // ⚠️ 잠긴 카드는 `disabled`라 포커스를 받지 못한다 — 열려 있는 첫 카드를 고른다.
    (refs!.regionButtons.find((button) => !button.disabled) ?? refs!.regionButtons[0])?.focus();
  }

  /** 지역을 확정하고 스테이지를 시작한다. **여기서 처음으로 프레임 루프가 돈다.** */
  function beginStage(id: StageId): void {
    audio.resume();
    stageId = id;
    session = null; // 다음 프레임이 고른 지역 설정으로 세션을 새로 만든다.
    refs!.regionSelect.hidden = true;
    refs!.gate.hidden = true;
    refs!.stage.classList.remove('stage--gated');
    loop.start();
  }

  /**
   * ── 사운드 설정 배선 (PRD §3.1 ⑬) ────────────────────────────
   *
   * 판정은 전부 `src/audio`가 소유한다 — 여기서는 값을 옮기기만 한다.
   * 설정이 바뀌면 `onSettingsChange` → `syncAudioControls`로 표시가 되돌아온다
   * (한 방향 흐름이라 슬라이더와 저장값이 어긋날 자리가 없다).
   */
  refs.audioMuteButton.addEventListener('click', () => {
    // 사용자 제스처다 — 자동재생 정책 해제의 기회를 놓치지 않는다.
    audio.resume();
    audio.toggleMuted();
  });

  refs.audioSlider.addEventListener('input', () => {
    audio.resume();
    audio.setVolume(percentToVolume(Number(refs.audioSlider.value)));
  });

  // 저장된 설정을 화면에 처음으로 반영한다. 마크업의 기본값은 자리표시자일 뿐이다.
  syncAudioControls(audio.settings);

  /**
   * ★ 브라우저 자동재생 정책 ★
   *
   * 첫 사용자 제스처 전에는 `AudioContext`가 `suspended`라 소리가 나지 않는다. 시작
   * 게이트의 버튼 넷(자유 플레이 · 일일 챌린지 · 시드 입력 · 지역 카드)이 게임에 들어가는
   * 모든 경로이므로 **거기서 깨운다.** `resume`은 여러 번 불러도 무해하고, 소리를 못 내는
   * 환경에서는 조용한 no-op이다.
   */
  refs.startButton.addEventListener('click', () => {
    audio.resume();
    // 자유 플레이 — 시드는 지금 값 그대로, 챌린지 규칙을 걸지 않는다.
    seedPicked = false;
    challengeRun = false;
    showRegionSelect();
  });

  /**
   * 일일 챌린지 — 오늘 날짜가 곧 시드다.
   *
   * `new Date()`를 읽는 것은 셸의 일이다(판정 모듈은 시계를 모른다, §17-2).
   * `dailySeedFor`가 날짜를 그대로 숫자로 바꾸므로 결과 카드의 시드만 보고
   * **언제 판인지 사람이 바로 읽는다**.
   */
  refs.dailyButton.addEventListener('click', () => {
    audio.resume();
    seed = dailySeedFor(new Date());
    seedPicked = true;
    challengeRun = true;
    refs.seedInput.value = String(seed);
    showRegionSelect();
  });

  /** 시드 직접 입력 — 결과 카드에 찍힌 값을 그대로 붙여넣는 것이 가장 흔한 사용법이다. */
  function startWithSeedInput(): void {
    audio.resume();
    const parsed = parseSeedInput(refs!.seedInput.value);
    if (parsed === null) {
      // 실패를 조용히 넘기지 않는다 — 왜 안 되는지 말한다.
      refs!.seedInput.setAttribute('aria-invalid', 'true');
      refs!.log.textContent = '시드를 읽지 못했습니다 — 숫자나 2026-08-03 형식으로 넣어주세요';
      return;
    }
    refs!.seedInput.removeAttribute('aria-invalid');
    seed = parsed;
    seedPicked = true;
    challengeRun = true;
    showRegionSelect();
  }

  refs.seedButton.addEventListener('click', startWithSeedInput);
  refs.seedInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      startWithSeedInput();
    }
  });
  refs.regionBackButton.addEventListener('click', showGate);
  refs.codexOpenButton.addEventListener('click', showCodex);
  refs.codexBackButton.addEventListener('click', showGate);

  /**
   * 필터 클릭은 **본문에 건 위임으로 받는다.**
   *
   * 탭 버튼은 `renderCodex()`가 매번 새로 만들기 때문에, 버튼 각각에 리스너를 걸면
   * 첫 렌더의 버튼에만 걸리고 그 다음부터는 죽은 화면이 된다. 위임하면 본문이 몇 번
   * 교체되든 이 리스너 하나로 계속 받는다.
   */
  refs.codexBody.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLElement>(`[data-action="${CODEX_FILTER_ACTION}"]`);
    if (!button) return;
    codexFilter = codexFilterFor(button.dataset['filter']);
    renderCodex();
  });

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
        // 성공한 소환에만 소리를 낸다 — 골드 부족으로 거부된 클릭에 소리가 나면
        // 화면이 있지도 않은 지출을 사실로 말하게 된다(CLICK-PATH-003과 같은 규율).
        audio.emit({ kind: 'unit-summon' }, lastFrameMs);
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
      const built = current.build(slot, selectedTower);
      // 소리는 **성공한 건설에만** 붙는다(로그와 같은 불리언을 쓴다).
      if (built) audio.emit({ kind: 'tower-build' }, lastFrameMs);
      refs.log.textContent = formatActionLog({
        ok: built,
        verb: '건설',
        displayName: TOWER_IDENTITY[selectedTower].displayName,
        cost: TOWER_BUILD_COST[selectedTower],
      });
      return;
    }
    if (existing.level === 1) {
      // ★ 성공 여부를 확인한 뒤에 로그를 찍는다 (CLICK-PATH-003) ★
      // 예전에는 `upgrade`가 `void`라 골드 부족으로 조용히 실패해도 성공 로그가 나갔다.
      const upgraded = current.upgrade(slot);
      if (upgraded) audio.emit({ kind: 'tower-upgrade' }, lastFrameMs);
      refs.log.textContent = formatActionLog({
        ok: upgraded,
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

  /**
   * 튜토리얼 건너뛰기. **첫 회차에는 거부된다** — `skipTutorial`이 그 판정을 소유하므로
   * 여기서 다시 검사하지 않는다(버튼 `disabled`는 표시일 뿐, 판정의 출처가 아니다).
   */
  refs.tutorialSkipButton.addEventListener('click', () => {
    tutorialState = skipTutorial(tutorialState);
    // 건너뛴 것도 "봤다"로 친다 — 명시적으로 끈 사람에게 다시 띄우면 같은 조작을 반복시킨다.
    progress = markTutorialSeen();
  });

  /**
   * 공개 연출 단계 스킵 (FR-9.2 — 각 단계는 개별적으로 건너뛸 수 있다).
   *
   * 마지막 단계에서 누르면 `skipToNextStage`가 총 길이를 돌려주므로 시퀀스가 끝나고
   * 정산으로 넘어간다. 판정은 `reveal.ts`가 소유한다 — 여기서 경계를 다시 계산하지 마라.
   */
  /**
   * 결과 카드 저장 — PNG 다운로드 + 공유 문자열 클립보드.
   *
   * 클립보드는 **실패해도 다운로드를 막지 않는다.** 권한이 없거나 보안 컨텍스트가 아닌
   * 환경이 흔한데, 그때 카드까지 못 받으면 기능이 통째로 죽는다.
   */
  refs.resultCardButton.addEventListener('click', () => {
    const current = session;
    if (!current) {
      return;
    }
    const canvas = renderResultCard(current);
    if (!canvas) {
      refs.log.textContent = '결과 카드를 만들지 못했습니다 (캔버스 없음)';
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        refs.log.textContent = '결과 카드를 만들지 못했습니다';
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${lastCardName}.png`;
      link.click();
      // 즉시 해제하면 브라우저가 다운로드를 시작하기 전에 사라질 수 있다.
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      refs.log.textContent = `결과 카드를 저장했습니다 — ${lastShareLine}`;
    }, 'image/png');

    void navigator.clipboard?.writeText(lastShareLine).catch(() => {
      // 클립보드는 부가 기능이다. 실패해도 조용히 넘긴다 — 카드는 이미 받았다.
    });
  });

  refs.revealSkipButton.addEventListener('click', () => {
    if (revealInput === null) {
      return;
    }
    revealElapsedMs = skipToNextStage(revealElapsedMs);
    if (revealElapsedMs >= REVEAL_TOTAL_MS) {
      finishReveal();
      return;
    }
    if (session) {
      renderReveal(session);
    }
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
    // Esc — 지역 선택·도감에서 타이틀로. 다이얼로그의 관습적인 탈출 키다.
    if (event.code === 'Escape' && (!refs!.regionSelect.hidden || !refs!.codex.hidden)) {
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
    // AudioContext는 브라우저당 개수 제한이 있다 — 마운트를 풀면 반드시 닫는다.
    audio.destroy();
  };
}
