/**
 * 스테이지 마크업 · 레퍼런스 수집 — 순수 문자열 생성과 DOM 조회만 둔다.
 *
 * `stage.ts`에서 떼어낸 이유는 두 가지다: ① 파일이 400줄을 넘어가고 있었고,
 * ② 마크업은 게임 루프와 수명이 완전히 다르다(마운트 시 1회).
 */

import { SKILL_COST } from '../combat';
import { buildTowerRosterMarkup, buildUnitRosterMarkup } from '../ui';
import { buildStartGateMarkup } from './start-gate';
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
  readonly banner: HTMLElement;
  readonly gate: HTMLElement;
  readonly startButton: HTMLButtonElement;
  readonly panelHost: HTMLElement;
  readonly speedButtons: readonly HTMLButtonElement[];
  readonly towerButtons: readonly HTMLButtonElement[];
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

export function buildStageMarkup(): string {
  const speeds = SPEEDS.map(
    (s) => `<button class="btn" type="button" data-speed="${s}">${s}x</button>`,
  ).join('');

  const towers = buildTowerRosterMarkup();
  const units = buildUnitRosterMarkup();

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
        <span class="sr-only" role="status" aria-live="polite" data-ref="gold-announce"></span>
      </div>

      <div data-ref="panel-host"></div>

      <div class="stage__battle">
        <canvas data-ref="battle" width="${BATTLE_WIDTH}" height="${BATTLE_HEIGHT}"
                aria-label="전장"></canvas>
        <!-- 준비 시간 카운트다운. pointer-events:none 이라 준비 중에도 슬롯 클릭이 막히지 않는다. -->
        <div class="stage__prep" data-ref="prep" role="status" aria-live="polite" hidden></div>
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

      ${buildStartGateMarkup()}
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
  const banner = pick('banner');
  const gate = pick('gate');
  const panelHost = pick('panel-host');
  const startButton = root.querySelector<HTMLButtonElement>('[data-action="start-stage"]');

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
    !banner ||
    !gate ||
    !panelHost ||
    !startButton
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
    banner,
    gate,
    startButton,
    panelHost,
    speedButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-speed]')),
    towerButtons: Array.from(root.querySelectorAll<HTMLButtonElement>('[data-tower]')),
  };
}
