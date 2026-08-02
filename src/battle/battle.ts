/**
 * 전장 렌더러 진입점. `drawBattle` 하나가 배경 · 사옥/본진 · 타워 슬롯 · 적 · 아군 유닛 ·
 * HUD(웨이브·스킬 게이지)를 순서대로 그린다.
 *
 * `src/chart/chart.ts`의 `drawChart`와 같은 패턴이다: "무엇을 어떤 순서로 그리는가"만
 * 안다. 좌표 계산(`layout.ts`)과 개별 그리기(`draw-*.ts`)는 전부 위임한다.
 */

import type { CombatState, DeathEvent, TowerKind } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import type { WeatherField, WeatherView } from '../weather/index.js';
import { classifyGroundState, maxEnemyAdvance } from '../ground/index.js';
import { drawBackground } from './draw-background.js';
import { drawGroundState } from './draw-ground.js';
import { drawSlotDecals } from './draw-slot-decal.js';
import { drawWeather, weatherViewport } from './draw-weather.js';
import { drawLaneGuides } from './draw-lane-guides.js';
import { drawAirLaneWarning } from './draw-lane-warning.js';
import { drawDeaths, pushDeaths } from './death-fx.js';
import type { DeathField } from './death-fx.js';
import { drawHud } from './draw-hud.js';
import { drawEnemyBase, drawHq } from './draw-structures.js';
import { drawTowerRangePreview } from './draw-tower-range.js';
import { drawTowers } from './draw-towers.js';
import { drawTracers } from './draw-tracers.js';
import { drawUnitTracers } from './draw-unit-tracers.js';
import { drawAllies, drawEnemies } from './draw-units.js';
import { computeBattleLayout } from './layout.js';
import type { BattleCtx } from './surface.js';

export interface DrawBattleOptions {
  readonly state: CombatState;
  readonly palette: Palette;
  readonly width: number;
  readonly height: number;
  /** 호버/선택된 타워 슬롯 인덱스. 없으면 강조 없음. */
  readonly selectedSlot?: number | null;
  /**
   * 툴바에서 선택된 타워 종류. 빈 슬롯을 선택(호버)했을 때 그 자리에 무엇을 지을 수
   * 있는지(실루엣 미리보기)와 사거리 미리보기를 보여주는 데 쓴다. 지어진 타워가 있는
   * 슬롯을 선택했을 때는 이 값 대신 실제 타워 종류가 우선한다.
   */
  readonly selectedTowerKind?: TowerKind | null;
  /**
   * 시장 상태 표시(날씨) — 판정 결과 + 재사용 버퍼. 없으면 오버레이를 그리지 않는다.
   *
   * ★ 선택 항목인 이유: 판정은 `src/weather`(순수 함수)와 세션이 소유하고, 전장은
   *   그리기만 한다. 전장이 차트를 직접 읽기 시작하면 판정/렌더 분리가 무너진다.
   */
  readonly weather?: BattleWeather | null;
  /**
   * 현재 보유 골드. 타워 슬롯 데칼이 **배치 가능/불가**를 가르는 데 쓴다 (시트 02).
   *
   * 이게 없으면 슬롯이 전부 '비활성'으로만 보인다. 시작 골드가 정확히 포탑 1기라,
   * 두 번째 슬롯부터는 매매로 벌어야 켜진다 — "매매를 해야 방어가 선다"를 화면이
   * 직접 말해주는 유일한 장치다.
   */
  readonly gold?: number | null;
  /** 발판 잔광 맥동 위상용 시각. 없으면 0(정지). */
  readonly timeMs?: number;
  /** `prefers-reduced-motion`. 맥동만 멈추고 발판 상태 정보는 그대로 유지한다. */
  readonly reducedMotion?: boolean;
  /**
   * 사망 연출 — 재사용 버퍼 + 이번 프레임의 사망 이벤트.
   *
   * ★ 왜 `CombatState`가 아니라 옵션으로 받는가 ★ 사망은 **한 프레임짜리 사실**이라
   *   상태가 아니라 이벤트로 온다(`CombatEvents.deaths`). "죽는 중"이라는 시간 축은
   *   렌더 계층이 소유하며(`death-fx.ts` 머리말), 그 버퍼를 셸이 들고 있다가 여기 넘긴다.
   *   날씨(`weather.field`)와 정확히 같은 패턴이다.
   *
   * 없으면 사망 연출을 그리지 않는다 — 전투 자체는 아무 영향도 받지 않는다.
   */
  readonly deaths?: BattleDeaths | null;
}

/** `drawBattle`이 사망 연출을 그리는 데 필요한 최소 입력. */
export interface BattleDeaths {
  /** 앱 수명 동안 하나만 만들어 재사용하는 슬롯 버퍼. */
  readonly field: DeathField;
  /** 이번 프레임에 새로 죽은 개체들. 없으면 빈 배열. */
  readonly events: readonly DeathEvent[];
}

/** `drawBattle`이 날씨를 그리는 데 필요한 최소 입력. */
export interface BattleWeather {
  readonly view: WeatherView;
  /** 앱 수명 동안 하나만 만들어 재사용하는 입자·광선 버퍼. */
  readonly field: WeatherField;
}

/** 전장 한 프레임을 그린다. 적/유닛 0명, 캔버스 극소 크기에서도 크래시하지 않아야 한다. */
export function drawBattle(ctx: BattleCtx, opts: DrawBattleOptions): void {
  const { state, palette, width, height } = opts;
  const selectedSlot = opts.selectedSlot ?? null;
  const selectedTowerKind = opts.selectedTowerKind ?? null;
  const layout = computeBattleLayout(width, height);

  drawBackground(ctx, palette, layout);
  // 발판은 배경 직후 · 유닛보다 먼저. 발이 지면선 위에 서 보이려면 이 순서여야 한다.
  drawGroundState(
    ctx,
    palette,
    layout,
    classifyGroundState({
      maxAdvance: maxEnemyAdvance(state.enemies),
      wave: state.wave,
      waveCount: state.waveCount,
    }),
    opts.reducedMotion ?? false,
    opts.timeMs ?? 0,
  );
  drawLaneGuides(ctx, palette, layout);
  drawAirLaneWarning(ctx, palette, layout, state);
  drawHq(ctx, palette, layout, state);
  // state 를 넘겨야 마지막 웨이브에 보스(마진콜 심판관)가 요새 앞에 등장한다.
  drawEnemyBase(ctx, palette, layout, state);
  drawSlotDecals(ctx, palette, layout, state, opts.gold ?? 0, selectedTowerKind);
  drawTowers(ctx, palette, layout, state, selectedSlot, selectedTowerKind);
  drawTowerRangePreview(ctx, palette, layout, state, selectedSlot, selectedTowerKind);
  drawEnemies(ctx, palette, layout, state.enemies);
  drawAllies(ctx, palette, layout, state.units);
  // 사망 연출은 살아 있는 개체 **위**에 그린다 — 무너지는 몸이 뒤에 가리면 안 보인다.
  const deaths = opts.deaths ?? null;
  if (deaths) {
    const nowMs = opts.timeMs ?? 0;
    pushDeaths(deaths.field, deaths.events, layout, nowMs);
    drawDeaths(ctx, palette, deaths.field, nowMs);
  }
  // 예광선은 타워·유닛·적을 전부 그린 뒤 마지막에 그려 발사 연출이 항상 위에 보이게 한다.
  drawTracers(ctx, palette, layout, state);
  drawUnitTracers(ctx, palette, layout, state);
  // 날씨는 전장 위, HUD 아래다 — 시장 상태는 전장을 물들이되 수치 판독은 가리지 않는다.
  const weather = opts.weather ?? null;
  if (weather) {
    drawWeather(ctx, palette, weatherViewport(layout), weather.view, weather.field);
  }
  drawHud(ctx, palette, layout, state);
}
