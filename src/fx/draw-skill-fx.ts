/**
 * 스킬 이펙트 렌더 (아트 시트 §08). 시트 원칙 그대로 **피크 임팩트 한 순간의 형태만 정의하고
 * 확산·페이드는 코드로** 만든다.
 *
 * ★ 가산 합성은 이 파일 안에서 열고 반드시 닫는다 ★
 * `globalCompositeOperation`을 'lighter'로 바꾼 채 빠져나가면 이후 프레임의 모든 그리기가
 * 밝게 타 버린다. 슬롯 하나를 그릴 때마다 `save()`/`restore()`로 감싸는 이유다.
 *
 * 팔레트 토큰만 쓴다(생짜 HEX 금지 — `src/design/no-hardcoded-hex.test.ts`가 막는다).
 */

import type { Palette } from '../design';
import { SKILL_FX_SLOT_COUNT } from './constants.js';
import { skillFxIdAt, skillFxProgress, skillFxX, skillFxY } from './skill-effects.js';
import type { SkillFxField } from './skill-effects.js';
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
  | 'globalAlpha'
  | 'globalCompositeOperation'
  | 'strokeStyle'
  | 'fillStyle'
  | 'lineWidth'
>;

/** 이펙트 최대 반경(px). 전장 높이(360)의 절반 안쪽이라 화면 밖으로 새지 않는다. */
const MAX_RADIUS_PX = 120;
/** `S-01` 파편 링의 각 수. 시트 §08 "각진" 표현을 다각형 변 수로 옮긴 값이다. */
const SHARD_COUNT = 12;
/** `S-02` 링 세 겹의 시간차(진행도 단위). 순차로 도착해야 "떨어지는" 것으로 읽힌다. */
const RING_STAGGER = 0.18;
const RING_COUNT = 3;
/** `S-03` 육각 격자 돔의 세로 격자선 수. */
const DOME_RIBS = 6;

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

/** `S-01` 공시 폭탄 — 중앙 플래시에서 뻗는 각진 백색·금색 파편 링. */
function drawBlast(ctx: FxCtx, palette: Palette, x: number, y: number, progress: number): void {
  const radius = MAX_RADIUS_PX * progress;

  ctx.strokeStyle = palette.TEXT;
  ctx.lineWidth = 3;
  strokePolygonRing(ctx, x, y, radius, SHARD_COUNT);

  // 금색 파편은 조금 뒤처져 날아간다 — 두 겹이 같은 반경이면 한 줄로 보인다.
  ctx.strokeStyle = palette.GOLD;
  ctx.lineWidth = 2;
  strokePolygonRing(ctx, x, y, radius * 0.66, SHARD_COUNT);

  // 서류 조각: 링 바깥으로 뻗는 짧은 직선 스파이크.
  ctx.beginPath();
  for (let i = 0; i < SHARD_COUNT; i += 1) {
    const angle = (i / SHARD_COUNT) * TAU;
    ctx.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    ctx.lineTo(x + Math.cos(angle) * radius * 1.2, y + Math.sin(angle) * radius * 1.2);
  }
  ctx.stroke();
}

/**
 * `S-02` 배당 살포 — 위에서 떨어지는 적색 링 세 겹 + 상승하는 ▲ 입자.
 * **골드색을 쓰지 않는다**(시트 §08 명시: 재화와 혼동 금지).
 */
function drawDividend(ctx: FxCtx, palette: Palette, x: number, y: number, progress: number): void {
  ctx.strokeStyle = palette.UP_ALLY;
  ctx.lineWidth = 2;

  for (let i = 0; i < RING_COUNT; i += 1) {
    const local = progress - i * RING_STAGGER;
    if (local <= 0) continue;
    // 위에서 내려온다: 시작 높이 −MAX_RADIUS_PX에서 0으로.
    const dropY = y - MAX_RADIUS_PX * (1 - Math.min(1, local));
    strokeCircle(ctx, x, dropY, MAX_RADIUS_PX * 0.45);
  }

  // 상승 ▲ 입자 — 링과 반대 방향으로 올라가야 "회복"으로 읽힌다.
  ctx.fillStyle = palette.UP_DEEP;
  const rise = MAX_RADIUS_PX * progress;
  for (let i = 0; i < RING_COUNT * 2; i += 1) {
    const spread = (i / (RING_COUNT * 2) - 0.5) * MAX_RADIUS_PX;
    const tipY = y - rise + Math.abs(spread) * 0.2;
    ctx.beginPath();
    ctx.moveTo(x + spread, tipY);
    ctx.lineTo(x + spread - 5, tipY + 9);
    ctx.lineTo(x + spread + 5, tipY + 9);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * `S-03` 서킷브레이커 실드 — 기지 앞 반원 육각 격자 돔.
 * **전장에서 보라(AUM)를 쓰는 유일한 요소다**(시트 §08). 다른 색으로 바꾸지 마라 —
 * "무엇을 태워서 이 시간을 샀는지"를 알리는 것이 이 색의 역할이다.
 */
function drawShieldDome(ctx: FxCtx, palette: Palette, x: number, y: number, progress: number): void {
  // 돔은 서고(0~0.35) 유지하다(~0.75) 사라진다 — 확산 링이 아니므로 반경을 계속 키우지 않는다.
  const raise = Math.min(1, progress / 0.35);
  const radius = MAX_RADIUS_PX * 0.8 * raise;
  if (radius <= 0) return;

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
  id: SkillEffectId,
  x: number,
  y: number,
  progress: number,
): void {
  if (id === 'S-01') {
    drawBlast(ctx, palette, x, y, progress);
    return;
  }
  if (id === 'S-02') {
    drawDividend(ctx, palette, x, y, progress);
    return;
  }
  drawShieldDome(ctx, palette, x, y, progress);
}

/**
 * 재생 중인 스킬 이펙트를 전부 그린다. 만료된 슬롯은 `skillFxIdAt`이 null을 주므로 건너뛴다.
 *
 * @param reducedMotion true면 진행도를 **고정값으로 얼려** 형태만 보여준다(PRD FR-13 —
 *   모션 민감 사용자에게 확산 애니메이션을 강제하지 않되, 스킬이 발동했다는 정보는 남긴다).
 */
export function drawSkillFx(
  ctx: FxCtx,
  palette: Palette,
  field: SkillFxField,
  timeMs: number,
  reducedMotion = false,
): void {
  for (let slot = 0; slot < SKILL_FX_SLOT_COUNT; slot += 1) {
    const id = skillFxIdAt(field, slot, timeMs);
    if (id === null) continue;

    const progress = skillFxProgress(field, slot, timeMs);
    const shape = reducedMotion ? 0.7 : progress;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 페이드는 진행도가 아니라 남은 시간에 비례한다 — 피크(0)에서 가장 밝다.
    ctx.globalAlpha = Math.max(0, 1 - progress);
    drawOne(ctx, palette, id, skillFxX(field, slot), skillFxY(field, slot), shape);
    ctx.restore();
  }
}
