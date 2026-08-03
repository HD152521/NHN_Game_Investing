/**
 * 스테이지 마크업 · 레퍼런스 수집 — 순수 문자열 생성과 DOM 조회만 둔다.
 *
 * `stage.ts`에서 떼어낸 이유는 두 가지다: ① 파일이 400줄을 넘어가고 있었고,
 * ② 마크업은 게임 루프와 수명이 완전히 다르다(마운트 시 1회).
 */

import {
  VOLUME_STEP_PERCENT,
  defaultAudioSettings,
  formatVolumeLabel,
  muteButtonLabel,
  volumeToPercent,
} from '../audio';
import { buildSkillBarMarkup, buildTowerRosterMarkup, buildUnitRosterMarkup } from '../ui';
import type { SettlementRow } from './settlement';
import {
  GATE_DAILY_ACTION,
  GATE_SEED_ACTION,
  GATE_SEED_INPUT,
  buildStartGateMarkup,
} from './start-gate';
import { REGION_BACK_ACTION, REGION_SELECT_ACTION, buildRegionSelectMarkup } from './region-select';
import { CODEX_BACK_ACTION, CODEX_OPEN_ACTION, buildCodexMarkup } from './codex';
import { WORLD_BACK_ACTION, WORLD_CANVAS_REF, buildWorldMapMarkup } from './world-map';
import { COMPANY_BACK_ACTION, COMPANY_OPEN_ACTION, buildCompanyMarkup } from './company';
import { STARTING_AUM, STARTING_GOLD } from './session';

export const CHART_WIDTH = 1024;
export const CHART_HEIGHT = 200;
export const BATTLE_WIDTH = 1024;
/**
 * 전장 높이 300 → 360.
 *
 * 슬롯이 96×68로 커지면서 300px에서는 타워 슬롯(146~214)과 공중(103~127)·지상(234~258)
 * 사이 여유가 20px 밖에 남지 않아 요소가 서로 붙어 보였다. 360이면 위아래로 34px씩 확보된다.
 */
export const BATTLE_HEIGHT = 360;

/** FR-3.5 — 배속은 스테이지 시작 전에만 정해진다. */
export const SPEEDS = [1, 2, 4] as const;

/** 준비 카운트다운의 클릭 가능한 즉시 시작 버튼 (CLICK-PATH-005 대비책). */
export const SKIP_PREP_ACTION = 'skip-prep';

/** 튜토리얼 건너뛰기 버튼. 첫 회차에는 `tutorial.ts`가 스킵을 거부한다. */
export const TUTORIAL_SKIP_ACTION = 'tutorial-skip';

/** 공개 연출의 단계 스킵 버튼 (FR-9.2 — 각 단계는 개별적으로 건너뛸 수 있다). */
export const REVEAL_SKIP_ACTION = 'reveal-skip';

/**
 * 결과 카드를 PNG로 내려받는다.
 *
 * 카드는 밖으로 나가는 산출물이라 **시드가 반드시 실린다** — 받는 사람이 같은 판을
 * 열 수 있어야 공유의 의미가 있다 (`result-card.ts`).
 */
export const RESULT_CARD_ACTION = 'result-card';

/** 결과 화면의 두 출구. 여기서만 스테이지가 다시 시작된다. */
export const RESULT_RETRY_ACTION = 'result-retry';
export const RESULT_REGION_ACTION = 'result-region';

/**
 * 음소거 토글 (PRD §3.1 ⑬ 설정 — 배속·볼륨·색약 중 볼륨).
 *
 * 볼륨 슬라이더와 **따로 둔다.** 슬라이더를 0으로 내리는 것과 음소거는 다른 사실이고
 * (`effectiveVolume` 주석), 끄기 전 볼륨을 기억해야 다시 켤 때 원래 크기로 돌아온다.
 */
export const AUDIO_MUTE_ACTION = 'audio-mute';

/** 볼륨 슬라이더의 `data-ref`. HUD의 `volume`(거래량)과 **다른 이름이어야 한다.** */
export const AUDIO_SLIDER_REF = 'volume-slider';
/** 볼륨 숫자 표시. 음소거면 '음소거'라고 쓴다 — 0%와 음소거는 다른 상태다. */
export const AUDIO_VALUE_REF = 'volume-value';

/**
 * 타워·유닛 라벨에 **담당 레인과 역할을 반드시 함께 노출**한다.
 *
 * 초기 플레이테스트에서 "공중 적을 어떻게 잡느냐"는 질문이 나왔다. 공중은 대공 포대로만
 * 잡히는데(FR-6.2) 화면 어디에도 그 사실이 없었던 것이 원인이다. 라벨에서 이 정보를
 * 빼면 같은 문제가 그대로 재발한다.
 */
/*
 * 표시 이름·역할·플레이버는 전부 `src/combat/identity.ts` 가 단일 출처다
 * (아트 프로덕션 시트 v1.1 §04·§06). 여기서 다시 정의하지 마라 —
 * 예전에는 이 파일이 자체 라벨('인턴', '기본 포탑')을 들고 있어서
 * 시트가 정한 정체성이 화면에 닿지 않았다.
 *
 * 위 주석의 레인 표기 요구사항은 `TOWER_IDENTITY[kind].laneLabel` 이 이어받는다.
 */

export interface StageRefs {
  readonly stage: HTMLElement;
  readonly chartCtx: CanvasRenderingContext2D;
  /** 골드 연출의 출발점. */
  readonly chartHost: HTMLElement;
  readonly battleCanvas: HTMLCanvasElement;
  readonly battleCtx: CanvasRenderingContext2D;
  readonly change: HTMLElement;
  readonly clock: HTMLElement;
  readonly volume: HTMLElement;
  readonly gold: HTMLElement;
  readonly goldAnnounce: HTMLElement;
  readonly aum: HTMLElement;
  readonly wave: HTMLElement;
  readonly baseHp: HTMLElement;
  readonly log: HTMLElement;
  /** 웨이브 준비 시간 카운트다운 오버레이. */
  readonly prep: HTMLElement;
  /** 카운트다운 문구가 들어가는 칸. 오버레이 자체에는 버튼도 함께 있다. */
  readonly prepText: HTMLElement;
  /** 카운트다운의 [바로 시작] 버튼 — Space 가 안 먹히는 상황의 대비책. */
  readonly prepSkipButton: HTMLButtonElement;
  /**
   * 튜토리얼 오버레이 (가이드 모드, §15-1).
   *
   * 판정은 전부 `tutorial.ts`가 소유한다 — 여기 있는 것은 문구가 들어갈 빈 칸뿐이다.
   * 별도 씬이 아니라 실제 세션 위에 얹히므로 게임은 뒤에서 계속 굴러간다.
   */
  readonly tutorial: HTMLElement;
  readonly tutorialStep: HTMLElement;
  readonly tutorialTitle: HTMLElement;
  readonly tutorialInstruction: HTMLElement;
  readonly tutorialWhy: HTMLElement;
  readonly tutorialFill: HTMLElement;
  readonly tutorialSkipButton: HTMLButtonElement;
  /**
   * 공개 연출 화면 (FR-9). 정산 앞에 온다.
   *
   * 판정은 전부 `reveal.ts`가 소유한다. 캔버스는 차트 위에 매매 마커를 되짚어 그린다.
   */
  readonly reveal: HTMLElement;
  readonly revealTitle: HTMLElement;
  readonly revealSubtitle: HTMLElement;
  readonly revealCanvas: HTMLCanvasElement;
  readonly revealSummary: HTMLElement;
  readonly revealPending: HTMLElement;
  readonly revealSkipButton: HTMLButtonElement;
  /**
   * 스테이지 결과 화면 (FR-8 정산).
   *
   * 예전의 `stage__banner`(문구 한 줄)를 대체한다. 배너는 재생이 끝난 경우를 아예 다루지
   * 못했고 — 그 경로는 무음 리셋이었다 — 정산 수치도 재시작 출구도 없었다.
   */
  readonly result: HTMLElement;
  readonly resultTitle: HTMLElement;
  readonly resultSubtitle: HTMLElement;
  readonly resultBody: HTMLElement;
  readonly resultRetryButton: HTMLButtonElement;
  /** 결과 카드 저장 버튼 (PNG 다운로드 + 공유 문자열 클립보드). */
  readonly resultCardButton: HTMLButtonElement;
  /** 일일 챌린지 진입 — 오늘 날짜가 시드가 된다. */
  readonly dailyButton: HTMLButtonElement;
  /** 시드 직접 입력. 결과 카드의 시드를 그대로 붙여넣는 용도다. */
  readonly seedInput: HTMLInputElement;
  readonly seedButton: HTMLButtonElement;
  readonly resultRegionButton: HTMLButtonElement;
  readonly gate: HTMLElement;
  readonly startButton: HTMLButtonElement;
  /** 지역 선택 오버레이. 게이트와 스테이지 플레이 사이에 열린다. */
  readonly regionSelect: HTMLElement;
  /** 지역 카드 3종. `dataset.region`이 `StageId`다. */
  readonly regionButtons: readonly HTMLButtonElement[];
  /** 지역 선택 → 시작 게이트로 돌아가는 버튼. */
  readonly regionBackButton: HTMLButtonElement;
  /** 도감 오버레이 (PRD P1 #10). 타이틀에서만 열린다. */
  readonly codex: HTMLElement;
  /**
   * 도감 본문이 들어가는 칸. **열 때마다 통째로 다시 그린다.**
   *
   * 필터 버튼을 `StageRefs`에 담지 않은 이유가 이것이다 — 본문이 교체되면 담아 둔 참조가
   * 화면에서 떨어져 나간 옛 노드를 가리키게 된다. 필터 클릭은 이 칸에 건 위임으로 받는다.
   */
  readonly codexBody: HTMLElement;
  /** 타이틀의 [도감] 버튼. */
  readonly codexOpenButton: HTMLButtonElement;
  /** 도감 → 타이틀로 돌아가는 버튼. */
  readonly codexBackButton: HTMLButtonElement;
  /** 세계지도 오버레이 (FR-2). 타이틀과 전선 선택 **사이**에 들어간다. */
  readonly worldMap: HTMLElement;
  /**
   * 지역 목록·브리핑·상태줄 — 셋 다 진행도에 따라 내용이 바뀌므로 **열 때 다시 그린다.**
   * 그래서 안쪽 버튼(지역 행 · [진입])은 참조로 담지 않고 위임으로 받는다(`codexBody`와 같은 이유).
   */
  readonly worldList: HTMLElement;
  readonly worldBrief: HTMLElement;
  readonly worldFoot: HTMLElement;
  readonly worldCanvas: HTMLCanvasElement;
  /** 세계지도 → 타이틀로 돌아가는 버튼. */
  readonly worldBackButton: HTMLButtonElement;
  /** 회사(부서 업그레이드) 오버레이 (FR-11.1). */
  readonly company: HTMLElement;
  /** 부서 목록이 들어가는 칸. 업그레이드 한 번에 자본금과 레벨이 함께 바뀌므로 통째로 다시 그린다. */
  readonly companyBody: HTMLElement;
  readonly companyOpenButton: HTMLButtonElement;
  readonly companyBackButton: HTMLButtonElement;
  readonly panelHost: HTMLElement;
  /**
   * 사운드 설정 3종 (PRD §3.1 ⑬).
   *
   * 소리는 **보조 채널**이라 이 컨트롤이 하나도 없어도 게임은 그대로 굴러가야 한다.
   * 그래서 `collectStageRefs`의 필수 목록에 넣되, 셸의 배선은 전부 실패 허용이다.
   */
  readonly audioMuteButton: HTMLButtonElement;
  readonly audioSlider: HTMLInputElement;
  readonly audioValue: HTMLElement;
  readonly speedButtons: readonly HTMLButtonElement[];
  readonly towerButtons: readonly HTMLButtonElement[];
  /** 유닛 소환 3종. 골드 부족이면 셸이 매 프레임 비활성으로 만든다(CLICK-PATH-004). */
  readonly unitButtons: readonly HTMLButtonElement[];
  /** 스킬 3종 버튼. 쿨다운·재화 부족 상태를 매 프레임 셸이 반영한다. */
  readonly skillButtons: readonly HTMLButtonElement[];
}

export function formatSessionClock(barIndex: number): string {
  const totalMinutes = 9 * 60 + barIndex;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

/**
 * 준비 시간 카운트다운 문구. 0 이하면 빈 문자열(= 표시하지 않음)이다.
 *
 * 0.1초 단위로 보여준다 — 5초는 초 단위로만 끊으면 숫자가 거의 안 움직여 "멈춘 화면"으로
 * 읽힌다. Space 안내를 같은 줄에 붙여, 기다릴지 건너뛸지를 한 번에 알게 한다.
 */
export function formatPrepCountdown(prepRemainingMs: number): string {
  if (prepRemainingMs <= 0) return '';
  return `준비 ${(prepRemainingMs / 1000).toFixed(1)}초 · Space로 바로 시작`;
}

export function formatSignedPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 정산 항목을 `<dt>/<dd>` 쌍으로 편다. 값은 전부 `settlementRows`가 만든 문자열이다. */
export function buildSettlementRowsMarkup(rows: readonly SettlementRow[]): string {
  return rows
    .map(
      (row) =>
        `<div class="stage__result-row"><dt>${escapeText(row.label)}</dt>` +
        `<dd>${escapeText(row.value)}</dd></div>`,
    )
    .join('');
}

/**
 * 사운드 설정 컨트롤 (PRD §3.1 ⑬) — 음소거 토글 + 마스터 볼륨 슬라이더.
 *
 * ★ 초기값을 여기서 정하지 않는다 ★ 마크업은 마운트 시 1회 지어지므로 저장된 설정을
 * 아직 모른다. 기본값을 박아 두고 셸이 `syncAudioControls`로 곧바로 되맞춘다 —
 * `region-select.ts`가 지역 잠금을 마크업이 아니라 `syncRegionLocks`로 맞추는 것과 같다.
 *
 * 숫자·문구는 전부 `src/audio/settings.ts`에서 온다(§19-4 이중 출처 금지).
 */
export function buildAudioControlsMarkup(): string {
  const settings = defaultAudioSettings();
  return `
        <span class="controls__audio">
          <button class="btn btn--audio" type="button" data-action="${AUDIO_MUTE_ACTION}"
                  aria-pressed="false" title="${muteButtonLabel(false)}">
            <span aria-hidden="true">♪</span><span class="sr-only">${muteButtonLabel(false)}</span>
          </button>
          <label class="controls__volume">
            <span class="sr-only">소리 크기</span>
            <input type="range" min="0" max="100" step="${VOLUME_STEP_PERCENT}"
                   value="${volumeToPercent(settings.volume)}" data-ref="${AUDIO_SLIDER_REF}" />
          </label>
          <span class="controls__volume-value" data-ref="${AUDIO_VALUE_REF}"
                >${formatVolumeLabel(settings)}</span>
        </span>`;
}

export function buildStageMarkup(): string {
  const speeds = SPEEDS.map(
    (s) => `<button class="btn" type="button" data-speed="${s}">${s}x</button>`,
  ).join('');

  const towers = buildTowerRosterMarkup();
  const units = buildUnitRosterMarkup();
  const skills = buildSkillBarMarkup();
  const audio = buildAudioControlsMarkup();

  return `
    <div class="stage stage--gated" data-ref="stage">
      <div class="stage__tags">
        <span class="stage__tag stage__blind">BLIND</span>
        <span class="stage__tag">아시아</span>
        <span class="stage__tag">금융</span>
        <span class="stage__tag">대형주</span>
        <span class="stage__spacer"></span>
        <span data-ref="volume">거래량 —</span>
      </div>

      <div class="stage__chart" data-ref="chart-host">
        <canvas data-ref="chart" width="${CHART_WIDTH}" height="${CHART_HEIGHT}"
                role="img" aria-label="블라인드 차트 리플레이"></canvas>
      </div>

      <!--
        data-hud-icon 은 tf-ui-icons 3×2 시트에서 잘라 온 아이콘이 마운트 시 1회 꽂히는
        자리다(mountHudIcons). 아이콘은 장식이 아니라 라벨과 같은 정보를 그림으로 한 번 더
        말하는 것이므로 aria-hidden 으로 스크린리더에 중복해 읽히지 않게 한다.
        시트의 6종 중 accuracy·upkeep 은 대응하는 HUD 수치가 아직 없어 붙이지 않았다.
      -->
      <div class="hud">
        <span class="hud__item"><span class="hud__label">시각</span>
          <span class="hud__value" data-ref="clock">09:00</span></span>
        <span class="hud__item"><span class="hud__label">등락</span>
          <span class="hud__value" data-ref="change">+0.00%</span></span>
        <span class="hud__item">
          <span class="hud__icon" data-hud-icon="gold" aria-hidden="true"></span>
          <span class="hud__label">골드</span>
          <span class="hud__value hud__value--gold" data-ref="gold">${STARTING_GOLD}</span></span>
        <span class="hud__item">
          <span class="hud__icon" data-hud-icon="aum" aria-hidden="true"></span>
          <span class="hud__label">AUM</span>
          <span class="hud__value hud__value--aum" data-ref="aum">${STARTING_AUM}</span></span>
        <span class="hud__item">
          <span class="hud__icon" data-hud-icon="wave" aria-hidden="true"></span>
          <span class="hud__label">웨이브</span>
          <span class="hud__value" data-ref="wave">0/13</span></span>
        <span class="hud__item">
          <span class="hud__icon" data-hud-icon="hp" aria-hidden="true"></span>
          <span class="hud__label">본진</span>
          <span class="hud__value" data-ref="basehp">100</span></span>
        <span class="sr-only" role="status" aria-live="polite" data-ref="gold-announce"></span>
      </div>

      <div data-ref="panel-host"></div>

      <div class="stage__battle">
        <canvas data-ref="battle" width="${BATTLE_WIDTH}" height="${BATTLE_HEIGHT}"
                aria-label="전장"></canvas>
        <!--
          준비 시간 카운트다운. 오버레이는 pointer-events:none 이라 준비 중에도 슬롯 클릭이
          막히지 않는다. 단 [바로 시작] 버튼만 pointer-events 를 되살린다(shell.css) —
          Space 가 삼켜지는 상황에서도 손으로 끝낼 길이 하나는 있어야 한다.
        -->
        <div class="stage__prep" data-ref="prep" role="status" aria-live="polite" hidden>
          <span data-ref="prep-text"></span>
          <button class="stage__prep-skip" type="button" data-action="${SKIP_PREP_ACTION}">바로 시작</button>
        </div>

        <!-- 결과 화면. 전투가 끝나거나 장이 마감되면 여기로 끝난다 — 무음 리셋은 없다. -->
        <!--
          튜토리얼 오버레이 — 실제 세션 위에 얹는 가이드 모드다(별도 씬이 아니다).
          문구와 강조 대상은 전부 tutorial.ts 가 판정해 넘긴다. 여기서 문구를 만들지 마라.
          ⚠️ 이 블록은 템플릿 리터럴 안이다 — 주석에도 백틱을 쓰면 문자열이 끊긴다.
        -->
        <aside class="stage__tutorial" data-ref="tutorial" role="region" aria-live="polite"
               aria-labelledby="tf-tutorial-title" hidden>
          <p class="stage__tutorial-step" data-ref="tutorial-step"></p>
          <h3 class="stage__tutorial-title" id="tf-tutorial-title" data-ref="tutorial-title"></h3>
          <p class="stage__tutorial-instruction" data-ref="tutorial-instruction"></p>
          <p class="stage__tutorial-why" data-ref="tutorial-why"></p>
          <div class="stage__tutorial-bar" role="presentation">
            <span class="stage__tutorial-fill" data-ref="tutorial-fill"></span>
          </div>
          <button class="btn stage__tutorial-skip" type="button"
                  data-action="${TUTORIAL_SKIP_ACTION}">튜토리얼 건너뛰기</button>
        </aside>

        <!--
          공개 연출 (FR-9) — 정산 화면 "앞"에 온다(FR-9.1: 정산 직후, 보상 선택 전).
          내용은 전부 reveal.ts 가 판정해 넘긴다. 여기서 문구를 만들지 마라.
          ⚠️ 템플릿 리터럴 안이라 주석에도 백틱을 쓰면 문자열이 끊긴다.
        -->
        <div class="stage__reveal" data-ref="reveal" role="dialog" aria-live="polite"
             aria-labelledby="tf-reveal-title" hidden>
          <h2 class="stage__reveal-title" id="tf-reveal-title" data-ref="reveal-title"></h2>
          <p class="stage__reveal-subtitle" data-ref="reveal-subtitle"></p>
          <canvas class="stage__reveal-canvas" data-ref="reveal-canvas"
                  width="" height=""
                  role="img" aria-label="차트 위에 되짚은 내 매매"></canvas>
          <dl class="stage__reveal-summary" data-ref="reveal-summary"></dl>
          <p class="stage__reveal-pending" data-ref="reveal-pending"></p>
          <button class="btn stage__reveal-skip" type="button"
                  data-action="${REVEAL_SKIP_ACTION}">다음 ▸</button>
        </div>

        <div class="stage__result" data-ref="result" role="dialog" aria-live="polite"
             aria-labelledby="tf-result-title" hidden>
          <h2 class="stage__result-title" id="tf-result-title" data-ref="result-title"></h2>
          <p class="stage__result-subtitle" data-ref="result-subtitle"></p>
          <dl class="stage__result-body" data-ref="result-body"></dl>
          <div class="stage__result-actions">
            <button class="btn" type="button" data-action="${RESULT_CARD_ACTION}">결과 카드 저장</button>
            <button class="btn" type="button" data-action="${RESULT_RETRY_ACTION}">다시</button>
            <button class="btn" type="button" data-action="${RESULT_REGION_ACTION}">지역 선택으로</button>
          </div>
        </div>
      </div>

      <div class="buildbar">
        <span class="buildbar__group">${towers}</span>
        <span class="buildbar__sep"></span>
        <span class="buildbar__group">${units}</span>
        <span class="buildbar__sep"></span>
        <span class="buildbar__group">${skills}</span>
      </div>

      <div class="controls">
        <button class="btn" type="button" data-action="restart">새 스테이지</button>
        ${speeds}
        <span class="controls__note" data-ref="log">타워를 고르고 아래 빈 슬롯을 클릭하세요</span>
        ${audio}
      </div>

      ${buildStartGateMarkup()}
      ${buildWorldMapMarkup()}
      ${buildRegionSelectMarkup()}
      ${buildCodexMarkup()}
      ${buildCompanyMarkup()}
    </div>
  `;
}

export function collectStageRefs(root: HTMLElement): StageRefs | null {
  const pick = <T extends HTMLElement>(name: string): T | null =>
    root.querySelector<T>(`[data-ref="${name}"]`);

  const chart = pick<HTMLCanvasElement>('chart');
  const battle = pick<HTMLCanvasElement>('battle');
  const stage = pick('stage');
  const chartHost = pick('chart-host');
  const change = pick('change');
  const clock = pick('clock');
  const volume = pick('volume');
  const gold = pick('gold');
  const goldAnnounce = pick('gold-announce');
  const aum = pick('aum');
  const wave = pick('wave');
  const baseHp = pick('basehp');
  const log = pick('log');
  const prep = pick('prep');
  const prepText = pick('prep-text');
  const prepSkipButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${SKIP_PREP_ACTION}"]`,
  );
  const tutorial = pick('tutorial');
  const tutorialStep = pick('tutorial-step');
  const tutorialTitle = pick('tutorial-title');
  const tutorialInstruction = pick('tutorial-instruction');
  const tutorialWhy = pick('tutorial-why');
  const tutorialFill = pick('tutorial-fill');
  const tutorialSkipButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${TUTORIAL_SKIP_ACTION}"]`,
  );
  const reveal = pick('reveal');
  const revealTitle = pick('reveal-title');
  const revealSubtitle = pick('reveal-subtitle');
  const revealCanvas = pick<HTMLCanvasElement>('reveal-canvas');
  const revealSummary = pick('reveal-summary');
  const revealPending = pick('reveal-pending');
  const revealSkipButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${REVEAL_SKIP_ACTION}"]`,
  );
  const result = pick('result');
  const resultTitle = pick('result-title');
  const resultSubtitle = pick('result-subtitle');
  const resultBody = pick('result-body');
  const resultRetryButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${RESULT_RETRY_ACTION}"]`,
  );
  const resultCardButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${RESULT_CARD_ACTION}"]`,
  );
  const dailyButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${GATE_DAILY_ACTION}"]`,
  );
  const seedButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${GATE_SEED_ACTION}"]`,
  );
  const seedInput = root.querySelector<HTMLInputElement>(`[data-ref="${GATE_SEED_INPUT}"]`);
  const resultRegionButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${RESULT_REGION_ACTION}"]`,
  );
  const gate = pick('gate');
  const panelHost = pick('panel-host');
  const audioMuteButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${AUDIO_MUTE_ACTION}"]`,
  );
  const audioSlider = root.querySelector<HTMLInputElement>(`[data-ref="${AUDIO_SLIDER_REF}"]`);
  const audioValue = pick(AUDIO_VALUE_REF);
  const startButton = root.querySelector<HTMLButtonElement>('[data-action="start-stage"]');
  const regionSelect = pick('region-select');
  const regionBackButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${REGION_BACK_ACTION}"]`,
  );
  const worldMap = pick('world-map');
  const worldList = pick('world-list');
  const worldBrief = pick('world-brief');
  const worldFoot = pick('world-foot');
  const worldCanvas = pick<HTMLCanvasElement>(WORLD_CANVAS_REF);
  const worldBackButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${WORLD_BACK_ACTION}"]`,
  );
  const company = pick('company');
  const companyBody = pick('company-body');
  const companyOpenButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${COMPANY_OPEN_ACTION}"]`,
  );
  const companyBackButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${COMPANY_BACK_ACTION}"]`,
  );
  const codex = pick('codex');
  const codexBody = pick('codex-body');
  const codexOpenButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${CODEX_OPEN_ACTION}"]`,
  );
  const codexBackButton = root.querySelector<HTMLButtonElement>(
    `[data-action="${CODEX_BACK_ACTION}"]`,
  );

  if (
    !chart ||
    !battle ||
    !stage ||
    !chartHost ||
    !change ||
    !clock ||
    !volume ||
    !gold ||
    !goldAnnounce ||
    !aum ||
    !wave ||
    !baseHp ||
    !log ||
    !prep ||
    !prepText ||
    !prepSkipButton ||
    !tutorial ||
    !tutorialStep ||
    !tutorialTitle ||
    !tutorialInstruction ||
    !tutorialWhy ||
    !tutorialFill ||
    !tutorialSkipButton ||
    !reveal ||
    !revealTitle ||
    !revealSubtitle ||
    !revealCanvas ||
    !revealSummary ||
    !revealPending ||
    !revealSkipButton ||
    !result ||
    !resultTitle ||
    !resultSubtitle ||
    !resultBody ||
    !resultRetryButton ||
    !resultCardButton ||
    !dailyButton ||
    !seedButton ||
    !seedInput ||
    !resultRegionButton ||
    !gate ||
    !panelHost ||
    !audioMuteButton ||
    !audioSlider ||
    !audioValue ||
    !startButton ||
    !regionSelect ||
    !regionBackButton ||
    !codex ||
    !codexBody ||
    !codexOpenButton ||
    !codexBackButton ||
    !worldMap ||
    !worldList ||
    !worldBrief ||
    !worldFoot ||
    !worldCanvas ||
    !worldBackButton ||
    !company ||
    !companyBody ||
    !companyOpenButton ||
    !companyBackButton
  ) {
    return null;
  }

  const chartCtx = chart.getContext('2d');
  const battleCtx = battle.getContext('2d');
  if (!chartCtx || !battleCtx) {
    return null;
  }

  return {
    stage,
    chartCtx,
    chartHost,
    battleCanvas: battle,
    battleCtx,
    change,
    clock,
    volume,
    gold,
    goldAnnounce,
    aum,
    wave,
    baseHp,
    log,
    prep,
    prepText,
    prepSkipButton,
    reveal,
    revealTitle,
    revealSubtitle,
    revealCanvas,
    revealSummary,
    revealPending,
    revealSkipButton,
    tutorial,
    tutorialStep,
    tutorialTitle,
    tutorialInstruction,
    tutorialWhy,
    tutorialFill,
    tutorialSkipButton,
    result,
    resultTitle,
    resultSubtitle,
    resultBody,
    resultRetryButton,
    resultCardButton,
    dailyButton,
    seedButton,
    seedInput,
    resultRegionButton,
    gate,
    startButton,
    regionSelect,
    regionBackButton,
    regionButtons: Array.from(
      root.querySelectorAll<HTMLButtonElement>(`[data-action="${REGION_SELECT_ACTION}"]`),
    ),
    codex,
    codexBody,
    codexOpenButton,
    codexBackButton,
    worldMap,
    worldList,
    worldBrief,
    worldFoot,
    worldCanvas,
    worldBackButton,
    company,
    companyBody,
    companyOpenButton,
    companyBackButton,
    panelHost,
    audioMuteButton,
    audioSlider,
    audioValue,
    speedButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-speed]')),
    towerButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-tower]')),
    unitButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-unit]')),
    skillButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-skill]')),
  };
}
