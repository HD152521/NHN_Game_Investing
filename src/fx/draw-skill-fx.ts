/**
 * 스킬 이펙트 렌더 (아트 시트 §08). 시트 원칙 그대로 **피크 임팩트 한 순간의 형태만 정의하고
 * 확산·페이드는 코드로** 만든다.
 *
 * ★ 연출의 크기는 규칙이 정한다 — 취향이 아니다 ★
 * `skill-scope.ts`가 `castSkill`의 실제 효과 범위를 표로 들고 있고, 이 파일은 그 표를 읽어
 * 무엇을 화면 폭 전체에 그릴지 결정한다. 예전에는 셋 다 `anchor.ts`가 준 한 점 주위에
 * 반경 120 px로 작게 터졌는데, `S-01`·`S-02`는 실제로는 **맵 전체**에 걸리는 스킬이라
 * 화면이 규칙을 거짓으로 알리고 있었다("스킬 위치가 고정이잖아" 피드백의 실체).
 *
 * ★ 가산 합성은 이 파일 안에서 열고 반드시 닫는다 ★
 * `globalCompositeOperation`을 'lighter'로 바꾼 채 빠져나가면 이후 프레임의 모든 그리기가
 * 밝게 타 버린다. 슬롯 하나를 그릴 때마다 `save()`/`restore()`로 감싸는 이유다.
 *
 * 팔레트 토큰만 쓴다(생짜 HEX 금지 — `src/design/no-hardcoded-hex.test.ts`가 막는다).
 */

import type { Palette } from '../design';
import { SKILL_FX_SLOT_COUNT } from './constants.js';
// `skillFxY`는 쓰지 않는다 — 세 스킬 모두 세로 자리가 규칙에서 나온다(지상 레인 / 사옥 앞).
// 저장된 y를 쓰면 지터가 이펙트를 레인 밖으로 밀어 "어디에 걸리는지"를 흐린다.
import { skillFxIdAt, skillFxProgress, skillFxX } from './skill-effects.js';
import type { SkillFxField } from './skill-effects.js';
import { SKILL_FX_SCOPE, mapWideRadius } from './skill-scope.js';
import type { SkillFxViewport } from './skill-scope.js';
import type { SkillEffectId } from './types.js';

/** 이 모듈이 실제로 쓰는 캔버스 기능만 추린 계약 — 테스트에서 가짜 ctx를 끼우기 위함이다. */
export type FxCtx = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'beginPath'
  | 'closePath'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'stroke'
  | 'fill'
  | 'fillRect'
  | 'globalAlpha'
  | 'globalCompositeOperation'
  | 'strokeStyle'
  | 'fillStyle'
  | 'lineWidth'
>;

/** `S-03` 돔의 최대 반경(px). 지점 효과라 화면 폭과 무관한 고정 크기가 맞다. */
const DOME_RADIUS_PX = 96;
/** `S-01` 파편 링의 각 수. 시트 §08 "각진" 표현을 다각형 변 수로 옮긴 값이다. */
const SHARD_COUNT = 12;
/** `S-03` 육각 격자 돔의 세로 격자선 수. */
const DOME_RIBS = 6;

/**
 * 지상 레인 띠의 세로 두께(px). `S-01`이 때리는 줄, `S-02`가 뿌리는 줄을 표시한다.
 *
 * 유닛·적 스프라이트(26×34 안팎)가 지상선 위에 서므로 위쪽으로 더 두껍게 잡아야 "이 줄에
 * 서 있는 것들이 맞는다"로 읽힌다 — 그래서 중심이 아니라 `groundY` 기준 위/아래를 따로 준다.
 */
const LANE_BAND_ABOVE_PX = 40;
const LANE_BAND_BELOW_PX = 12;

/** 맵 전체 연출의 눈금 간격(px). 화면 폭을 이 간격으로 훑어 "전 구간"임을 알린다. */
const SWEEP_TICK_SPACING_PX = 64;
/** 눈금 하나의 길이(px). */
const SWEEP_TICK_PX = 14;

/** `S-02` 낙하 링 하나의 반경(px)과 낙하 높이(px). */
const DROP_RING_RADIUS_PX = 22;
const DROP_HEIGHT_PX = 120;
/** `S-02` 링이 화면을 훑는 시간 비중(0~1). 나머지 구간은 상승 입자가 채운다. */
const DROP_SWEEP_SHARE = 0.6;

const TAU = Math.PI * 2;

/** 다각형 링 하나. `radius`가 0 이하면 아무 것도 그리지 않는다. */
function strokePolygonRing(ctx: FxCtx, x: number, y: number, radius: number, sides: number): void {
  if (radius <= 0) return;
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * TAU;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.stroke();
}

function strokeCircle(ctx: FxCtx, x: number, y: number, radius: number): void {
  if (radius <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.stroke();
}

/** 지상 레인 띠의 상단 y와 높이. `groundY`를 기준으로 위가 두껍다(스프라이트가 위로 선다). */
function laneBand(viewport: SkillFxViewport): { readonly top: number; readonly height: number } {
  const top = viewport.groundY - LANE_BAND_ABOVE_PX;
  return { top, height: LANE_BAND_ABOVE_PX + LANE_BAND_BELOW_PX };
}

/**
 * 화면 폭 전체를 덮는 지상 레인 띠 — "이 줄에 있는 것 전부"라는 범위 선언 그 자체다.
 *
 * 위아래 경계선을 함께 그어 **띠 밖은 안 맞는다**(= 공중 레인은 제외)를 눈에 보이게 한다.
 */
function strokeLaneBand(ctx: FxCtx, viewport: SkillFxViewport, fillAlpha: number): void {
  const band = laneBand(viewport);
  if (band.height <= 0 || viewport.width <= 0) return;

  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = previousAlpha * fillAlpha;
  ctx.fillRect(0, band.top, viewport.width, band.height);
  ctx.globalAlpha = previousAlpha;

  ctx.beginPath();
  ctx.moveTo(0, band.top);
  ctx.lineTo(viewport.width, band.top);
  ctx.moveTo(0, band.top + band.height);
  ctx.lineTo(viewport.width, band.top + band.height);
  ctx.stroke();
}

/**
 * 진원에서 좌우로 퍼져 나가는 눈금 — 도달한 구간만 그린다.
 *
 * 눈금이 화면 양 끝에 닿는 순간 "맵 전체"가 완성된다. 반경은 `mapWideRadius`가 정하므로
 * 진원이 어디든 마지막에는 반드시 두 끝을 모두 덮는다.
 */
function strokeSweepTicks(
  ctx: FxCtx,
  viewport: SkillFxViewport,
  epicenterX: number,
  reach: number,
): void {
  if (reach <= 0 || viewport.width <= 0) return;
  const band = laneBand(viewport);

  ctx.beginPath();
  for (let x = 0; x <= viewport.width; x += SWEEP_TICK_SPACING_PX) {
    if (Math.abs(x - epicenterX) > reach) continue;
    ctx.moveTo(x, band.top - SWEEP_TICK_PX);
    ctx.lineTo(x, band.top);
    ctx.moveTo(x, band.top + band.height);
    ctx.lineTo(x, band.top + band.height + SWEEP_TICK_PX);
  }
  ctx.stroke();
}

/**
 * `S-01` 공시 폭탄 — **맵 전체 지상 레인** 즉발 피해.
 *
 * 진원의 파편 링은 정체(시트 §08의 "각진 백색·금색 파편")를 유지하되, 충격파는 화면 양 끝까지
 * 뻗고 지상 띠가 전 구간을 밝힌다. 화면 전체를 플래시로 덮지 **않는** 이유는 공중 적이
 * 이 스킬에 맞지 않기 때문이다 — 전체 플래시는 "공중도 맞았다"는 거짓말이 된다.
 */
function drawBlast(
  ctx: FxCtx,
  palette: Palette,
  viewport: SkillFxViewport,
  x: number,
  progress: number,
): void {
  const reach = mapWideRadius(x, viewport.width) * progress;

  // ① 범위 선언 — 지상 레인 띠 전체.
  ctx.strokeStyle = palette.GOLD;
  ctx.fillStyle = palette.GOLD;
  ctx.lineWidth = 1;
  strokeLaneBand(ctx, viewport, 0.16);
  strokeSweepTicks(ctx, viewport, x, reach);

  // ② 진원 — 시트 §08의 파편 링. 반경은 띠 안에 머무는 크기로 잡아 "터진 자리"를 남긴다.
  const ringRadius = Math.min(reach, LANE_BAND_ABOVE_PX);
  ctx.strokeStyle = palette.TEXT;
  ctx.lineWidth = 3;
  strokePolygonRing(ctx, x, viewport.groundY, ringRadius, SHARD_COUNT);

  // 금색 파편은 조금 뒤처져 날아간다 — 두 겹이 같은 반경이면 한 줄로 보인다.
  ctx.strokeStyle = palette.GOLD;
  ctx.lineWidth = 2;
  strokePolygonRing(ctx, x, viewport.groundY, ringRadius * 0.66, SHARD_COUNT);

  // ③ 충격파 — 좌우로만 뻗는 수평 선. 세로로 퍼지면 공중까지 닿는 것처럼 보인다.
  ctx.strokeStyle = palette.TEXT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(Math.max(0, x - reach), viewport.groundY);
  ctx.lineTo(x - ringRadius, viewport.groundY);
  ctx.moveTo(x + ringRadius, viewport.groundY);
  ctx.lineTo(Math.min(viewport.width, x + reach), viewport.groundY);
  ctx.stroke();
}

/**
 * `S-02` 배당 살포 — **맵 전체 아군 유닛** 회복.
 *
 * 유닛은 사옥(x=0)에서 나와 전선까지 흩어져 있고 회복은 위치를 가리지 않는다. 그래서 링을
 * 한 자리에 떨어뜨리지 않고 **화면 폭 전체에 줄지어** 떨어뜨린다. 진원에서 가까운 열부터
 * 도착해 좌우로 번지므로 "전부 받았다"가 시간축으로 읽힌다.
 *
 * **골드색을 쓰지 않는다**(시트 §08 명시: 재화와 혼동 금지).
 */
function drawDividend(
  ctx: FxCtx,
  palette: Palette,
  viewport: SkillFxViewport,
  x: number,
  progress: number,
): void {
  if (viewport.width <= 0) return;
  const span = mapWideRadius(x, viewport.width);

  ctx.strokeStyle = palette.UP_ALLY;
  ctx.fillStyle = palette.UP_ALLY;
  ctx.lineWidth = 1;
  strokeLaneBand(ctx, viewport, 0.1);

  ctx.lineWidth = 2;
  for (let column = 0; column <= viewport.width; column += SWEEP_TICK_SPACING_PX) {
    // 이 열이 도착을 시작하는 진행도 — 진원에서 멀수록 늦다.
    const delay = span <= 0 ? 0 : (Math.abs(column - x) / span) * DROP_SWEEP_SHARE;
    const local = (progress - delay) / Math.max(1e-6, 1 - delay);
    if (local <= 0) continue;

    const fall = Math.min(1, local);
    const dropY = viewport.groundY - DROP_HEIGHT_PX * (1 - fall);
    strokeCircle(ctx, column, dropY, DROP_RING_RADIUS_PX * (0.4 + 0.6 * fall));
  }

  // 상승 ▲ 입자 — 링과 반대 방향으로 올라가야 "회복"으로 읽힌다. 열 사이에 끼워 넣는다.
  ctx.fillStyle = palette.UP_DEEP;
  const rise = DROP_HEIGHT_PX * progress;
  for (
    let column = SWEEP_TICK_SPACING_PX / 2;
    column <= viewport.width;
    column += SWEEP_TICK_SPACING_PX
  ) {
    const tipY = viewport.groundY - rise;
    ctx.beginPath();
    ctx.moveTo(column, tipY);
    ctx.lineTo(column - 5, tipY + 9);
    ctx.lineTo(column + 5, tipY + 9);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * `S-03` 서킷브레이커 실드 — **본진 앞 한 지점**의 반원 육각 격자 돔.
 *
 * 셋 중 유일한 지점 효과라 연출도 지점 고정이 맞다. 다만 자리는 비율 추정이 아니라
 * `viewport.baseX`(= 진행도 0의 화면 x)를 쓴다 — 사옥 폭이 바뀌면 방어막도 따라가야 한다.
 *
 * **전장에서 보라(AUM)를 쓰는 유일한 요소다**(시트 §08). 다른 색으로 바꾸지 마라 —
 * "무엇을 태워서 이 시간을 샀는지"를 알리는 것이 이 색의 역할이다.
 */
function drawShieldDome(
  ctx: FxCtx,
  palette: Palette,
  viewport: SkillFxViewport,
  progress: number,
): void {
  // 돔은 서고(0~0.35) 유지하다 사라진다 — 확산 링이 아니므로 반경을 계속 키우지 않는다.
  const raise = Math.min(1, progress / 0.35);
  const radius = DOME_RADIUS_PX * raise;
  if (radius <= 0) return;

  const x = viewport.baseX;
  const y = viewport.groundY;

  ctx.strokeStyle = palette.AUM;
  ctx.lineWidth = 2;

  // 반원(위쪽 반구)만 그린다.
  ctx.beginPath();
  ctx.arc(x, y, radius, Math.PI, TAU);
  ctx.stroke();

  // 육각 격자: 세로 갈비 + 가로 아치 2겹.
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < DOME_RIBS; i += 1) {
    const angle = Math.PI + (i / DOME_RIBS) * Math.PI;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.stroke();

  strokePolygonRing(ctx, x, y, radius * 0.66, DOME_RIBS);
  strokePolygonRing(ctx, x, y, radius * 0.33, DOME_RIBS);
}

function drawOne(
  ctx: FxCtx,
  palette: Palette,
  viewport: SkillFxViewport,
  id: SkillEffectId,
  x: number,
  progress: number,
): void {
  const scope = SKILL_FX_SCOPE[id];
  if (scope === 'map-ground') {
    drawBlast(ctx, palette, viewport, x, progress);
    return;
  }
  if (scope === 'map-allies') {
    drawDividend(ctx, palette, viewport, x, progress);
    return;
  }
  drawShieldDome(ctx, palette, viewport, progress);
}

/**
 * 모션 축소 모드에서 얼려 둘 진행도.
 *
 * **1.0이어야 한다.** 예전 값 0.7은 "확산 중간"이라, 맵 전체 스킬에서는 연출이 화면 일부만
 * 덮은 채 멈춰 **범위를 실제보다 좁게** 알린다. 애니메이션을 빼더라도 알려야 할 정보는
 * "어디까지 걸리는가"이므로, 얼릴 지점은 범위가 다 펼쳐진 끝이다(페이드는 알파가 담당한다).
 */
const REDUCED_MOTION_SHAPE = 1;

/**
 * 재생 중인 스킬 이펙트를 전부 그린다. 만료된 슬롯은 `skillFxIdAt`이 null을 주므로 건너뛴다.
 *
 * @param viewport 전장 좌표. 맵 전체 스킬이 화면 폭 전체를 덮으려면 반드시 실제 캔버스
 *   크기여야 한다 — 여기에 작은 값을 넣으면 연출이 다시 범위를 축소해 알린다.
 * @param reducedMotion true면 진행도를 **범위가 다 펼쳐진 상태로 얼려** 형태만 보여준다
 *   (PRD FR-13 — 모션 민감 사용자에게 확산 애니메이션을 강제하지 않되, 범위 정보는 남긴다).
 */
export function drawSkillFx(
  ctx: FxCtx,
  palette: Palette,
  field: SkillFxField,
  viewport: SkillFxViewport,
  timeMs: number,
  reducedMotion = false,
): void {
  for (let slot = 0; slot < SKILL_FX_SLOT_COUNT; slot += 1) {
    const id = skillFxIdAt(field, slot, timeMs);
    if (id === null) continue;

    const progress = skillFxProgress(field, slot, timeMs);
    const shape = reducedMotion ? REDUCED_MOTION_SHAPE : progress;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 페이드는 진행도가 아니라 남은 시간에 비례한다 — 피크(0)에서 가장 밝다.
    ctx.globalAlpha = Math.max(0, 1 - progress);
    drawOne(ctx, palette, viewport, id, skillFxX(field, slot), shape);
    ctx.restore();
  }
}
