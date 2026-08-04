/**
 * 사망 연출 — 원본 `tf-death-ally` / `tf-death-enemy` 배선.
 *
 * ★ 왜 이 파일이 필요했나 ★
 * 두 시트는 이식만 되고 화면에 붙지 못한 채였다. 원본 주석이 이유를 정확히 적어 두었다:
 *
 *   > `CombatState` 에 사망 연출용 필드가 없어 **현재는 배선하지 않는다**.
 *   > 죽은 개체는 배열에서 즉시 사라져 "죽는 중" 이 표현 불가.
 *
 * 이제 `CombatEvents.deaths`(`src/combat/types.ts`)가 그 신호를 준다. 다만 이벤트는
 * **한 프레임짜리 사실**이므로, "죽는 중"이라는 **시간 축**은 누군가 들고 있어야 한다.
 * 그 상태를 시뮬레이션에 넣지 않고 여기(렌더 계층)에 두는 이유는 두 가지다:
 *   ① 죽은 개체를 `enemies`에 남기면 타워·유닛의 표적 후보에 시체가 섞인다.
 *   ② 연출 길이는 **밸런스가 아니라 그림의 성질**이다 — 시뮬레이션 결과를 바꾸면 안 된다.
 *
 * ★ 날씨(`WeatherField`)와 같은 패턴이다 ★ 셸이 수명 동안 버퍼 하나를 만들어 들고 있고,
 * 매 프레임 그 버퍼에 이벤트를 밀어 넣은 뒤 그린다. 프레임당 새 배열·객체를 만들지 않기
 * 위해 **고정 크기 슬롯 배열**을 재사용한다(PRD §11).
 */

import type { DeathEvent, DeathKind } from '../combat/types.js';
import type { Palette } from '../design/index.js';
import {
  ANIM_FRAMES,
  allyRookie,
  death,
  enemyBlocker,
  enemyKite,
  enemyRusher,
  enemySiren,
  enemyTank,
} from '../sprites/index.js';
import { enemyKindForId } from './entity-sprites.js';
import type { EnemyKind } from '../combat/types.js';

/**
 * 적 종류 → 사망 연출의 원본 드로잉.
 *
 * `ENEMY_SPRITES`(entity-sprites.ts)는 **시트 키**를 주지만 `death()`는 **원본 생성기**를
 * 받는다. 그래서 여기 따로 둔다 — 다만 종류 판정은 `enemyKindForId` 하나만 쓴다.
 */
const DEATH_BASE_BY_ENEMY: Readonly<Record<EnemyKind, typeof enemyRusher>> = {
  gapScout: enemyRusher,
  marginEnforcer: enemyBlocker,
  liquidationDigger: enemyTank,
  rumorKite: enemyKite,
  panicSiren: enemySiren,
};
import type { AnimFrame } from '../sprites/index.js';
import { spriteRasters } from '../sprites/render/index.js';
import type { SpriteRaster, SpriteSource } from '../sprites/render/index.js';
import { drawRasterCentered, syncSpriteColorMode } from './draw-sprite.js';
import type { BattleLayout } from './layout.js';
import { laneY, progressToX } from './layout.js';
import type { BattleCtx } from './surface.js';

/**
 * 연출 총 길이(ms). 4프레임이므로 프레임당 90ms다.
 *
 * 360ms는 **다음 개체가 죽기 전에 끝나는** 길이다. 후반 웨이브에서는 초당 여러 체가
 * 죽으므로 이보다 길면 시체가 겹쳐 쌓여 전장이 읽히지 않는다. 반대로 200ms 아래로 내리면
 * 4프레임짜리 붕괴 연출이 한 번에 번쩍하고 사라져 "죽었다"가 아니라 "깜빡였다"로 보인다.
 */
export const DEATH_DURATION_MS = 360;

/**
 * 동시에 재생할 수 있는 사망 연출 수. 넘치면 **가장 오래된 것부터 덮어쓴다**.
 *
 * 24는 최악의 경우(마지막 웨이브 15체 + 아군 8체가 동시 전멸)를 덮으면서, 고정 배열
 * 하나로 들고 다니기에 충분히 작다. 상한을 두지 않으면 긴 세션에서 배열이 무한히 자란다.
 */
const MAX_ACTIVE = 24;

/** 슬롯 하나. 재사용하므로 필드는 전부 가변이다 — 이 파일 밖으로 노출되지 않는다. */
interface DeathSlot {
  /** 재생 시작 시각(ms). `active`가 false면 의미 없다. */
  startedMs: number;
  x: number;
  y: number;
  kind: DeathKind;
  /** 적일 때 어느 종류였는가. 산 모습과 같은 스프라이트로 죽기 위해 필요하다. */
  enemyKind: EnemyKind;
  active: boolean;
}

export interface DeathField {
  readonly slots: DeathSlot[];
  /** 다음에 덮어쓸 슬롯 인덱스(원형 버퍼). */
  next: number;
}

/** 앱 수명 동안 하나만 만들어 재사용한다. */
export function createDeathField(): DeathField {
  return {
    slots: Array.from({ length: MAX_ACTIVE }, () => ({
      startedMs: 0,
      x: 0,
      y: 0,
      kind: 'enemy' as DeathKind,
      enemyKind: 'gapScout' as EnemyKind,
      active: false,
    })),
    next: 0,
  };
}

/**
 * 종류별 사망 시트.
 *
 * 원본 `sheets()`가 `tf-death-ally = death(allyRookie, f, 'r')`,
 * `tf-death-enemy = death(enemyRusher, f, 'b')`로 정의한다(`src/sprites/index.ts`).
 * 여기서는 **같은 생성기를 프레임 단위로** 호출한다 — 스트립 시트(가로로 이어 붙인 한 장)는
 * 프레임 하나를 잘라 쓰기 어렵고, 원본 생성기를 그대로 쓰는 쪽이 "이식은 재해석 금지"에 맞다.
 *
 * 보스는 악당 시트를 쓰되 **배율만 키운다**(아래 `SCALE_BY_KIND`) — 보스 전용 사망 시트는
 * 원본에 없으므로 새로 발명하지 않는다.
 */
const TINT_BY_KIND: Readonly<Record<DeathKind, 'r' | 'b'>> = {
  unit: 'r',
  enemy: 'b',
  boss: 'b',
};

/** 보스는 살아 있을 때 2배로 그리므로(`draw-units.ts`) 죽을 때도 같은 배율이어야 한다. */
const SCALE_BY_KIND: Readonly<Record<DeathKind, number>> = {
  unit: 1,
  enemy: 1,
  boss: 2,
};

/**
 * 프레임 래스터 요청은 **최초 1회만** 만들어 재사용한다(`entity-anim.ts`와 같은 메모 방식).
 * 키는 `종류#프레임`이다.
 */
const SOURCE_CACHE = new Map<string, SpriteSource>();

/**
 * ★ 사망 스프라이트는 **살아 있을 때와 같은 개체**여야 한다 ★
 *
 * 예전에는 `kind === 'unit' ? allyRookie : enemyRusher`였다 — 즉 **적 5종이 전부 같은
 * 모습(E-01 갭하락 첨병)으로 죽었다.** 살아 있을 때는 `enemyKindForId(lane, id)`로 종류를
 * 고르는데 사망 연출만 그 규칙을 안 따라, 화면에서 개체가 죽는 순간 다른 캐릭터로 바뀌었다.
 *
 * 같은 함수를 쓰면 산 모습과 죽은 모습이 어긋날 수 없다(§19-4 이중 출처 회피).
 */
function deathSource(kind: DeathKind, enemyKind: EnemyKind, frame: AnimFrame): SpriteSource {
  const id = `death:${kind}:${enemyKind}#${frame}`;
  const memo = SOURCE_CACHE.get(id);
  if (memo !== undefined) {
    return memo;
  }
  const base = kind === 'unit' ? allyRookie : DEATH_BASE_BY_ENEMY[enemyKind];
  const created: SpriteSource = {
    id,
    grid: death(base, frame, TINT_BY_KIND[kind]),
    // 두 사망 시트 모두 `alpha` 합성이다(`sprites/render/composite.ts`).
    composite: 'alpha',
  };
  SOURCE_CACHE.set(id, created);
  return created;
}

/** 진행도(0~1) → 프레임 번호. 마지막 프레임에 붙어 끝난다. */
export function deathFrameAt(progress: number): AnimFrame {
  if (!Number.isFinite(progress) || progress <= 0) {
    return ANIM_FRAMES[0] as AnimFrame;
  }
  const index = Math.min(ANIM_FRAMES.length - 1, Math.floor(progress * ANIM_FRAMES.length));
  return ANIM_FRAMES[index] as AnimFrame;
}

/**
 * 이번 프레임의 사망 이벤트를 버퍼에 넣는다. `deaths`가 비면 아무 것도 하지 않는다
 * (시뮬레이션이 빈 틱에 **같은 빈 배열 참조**를 돌려주므로 이 검사가 사실상 공짜다).
 */
export function pushDeaths(
  field: DeathField,
  deaths: readonly DeathEvent[],
  layout: BattleLayout,
  nowMs: number,
): void {
  for (const event of deaths) {
    const slot = field.slots[field.next];
    if (slot === undefined) {
      continue;
    }
    slot.startedMs = nowMs;
    slot.x = progressToX(event.x, layout);
    // 보스는 지면선 위에 서므로 죽을 때도 지면선이다. 나머지는 자기 레인.
    slot.y = event.kind === 'boss' ? layout.groundY : laneY(event.lane, layout);
    slot.kind = event.kind;
    // 살아 있을 때 렌더러가 쓰는 것과 **같은 함수**로 종류를 정한다.
    slot.enemyKind = enemyKindForId(event.lane, event.id);
    slot.active = true;
    field.next = (field.next + 1) % field.slots.length;
  }
}

/**
 * 진행 중인 사망 연출을 그린다. 다 끝난 슬롯은 스스로 꺼진다 — 청소 패스가 따로 없다.
 * 그릴 수 없는 컨텍스트에서는 조용히 넘어간다(`draw-sprite.ts`의 공통 계약).
 */
export function drawDeaths(
  ctx: BattleCtx,
  palette: Palette,
  field: DeathField,
  nowMs: number,
): void {
  syncSpriteColorMode(palette);

  for (const slot of field.slots) {
    if (!slot.active) {
      continue;
    }
    const elapsed = nowMs - slot.startedMs;
    if (elapsed < 0 || elapsed >= DEATH_DURATION_MS) {
      slot.active = false;
      continue;
    }
    const raster: SpriteRaster | null = spriteRasters.raster(
      deathSource(slot.kind, slot.enemyKind, deathFrameAt(elapsed / DEATH_DURATION_MS)),
    );
    // 굽기에 실패하면 **이번 프레임만 건너뛴다** — 슬롯을 끄면 안 된다.
    // 래스터 캐시는 환경(캔버스 없음 등)에 따라 일시적으로 null을 줄 수 있고, 그때 연출을
    // 죽여 버리면 "화면이 준비되기 전에 죽은 개체"만 조용히 연출을 잃는다. 슬롯은 어차피
    // 지속시간이 지나면 위에서 꺼진다.
    if (raster === null) {
      continue;
    }
    drawRasterCentered(ctx, raster, slot.x, slot.y, SCALE_BY_KIND[slot.kind]);
  }
}
