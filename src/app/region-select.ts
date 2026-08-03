/**
 * 지역(스테이지) 선택 화면 — 시작 게이트와 스테이지 플레이 **사이**에 들어가는 한 단계.
 *
 * 플레이 피드백: "시작하고 스테이지 고르는 것도 필요함." 지금까지는 [시작]을 누르면
 * 곧바로 R1이 시작돼, PRD FR-2(세계지도 & 지역 선택)와 §4 유저 여정의 04:00 지점이
 * 통째로 비어 있었다.
 *
 * ★ 숫자는 전부 `STAGES`에서 읽는다 ★
 * 카드에 적힌 시작 AUM·골드·목표 수익률·필요 지출은 `src/combat/stages.ts`가 단일 출처다.
 * 여기에 값을 다시 적으면 밸런스를 고쳐도 화면이 옛 숫자를 말하는 이중 출처가 된다.
 *
 * ★ 목표 수익률을 반드시 노출한다 ★
 * 검수 지적("플레이어가 왜 졌는지 모른다")의 직접적 원인이 이 값이 어디에도 없다는 것이었다.
 * 목표 수익률은 **지역의 속성**이지 차트의 속성이 아니므로, 블라인드 규칙(FR-4 — 종목·날짜·
 * 절대가를 숨긴다)과 충돌하지 않는다.
 *
 * 마크업을 순수 문자열 함수로 두는 이유는 `start-gate.ts`와 같다 (이 프로젝트 vitest는
 * node 환경이라 jsdom이 없다). DOM 배선은 `stage.ts`가 맡는다.
 */

import type { StageConfig, StageId } from '../combat';
import { STAGES } from '../combat';
import type { Region } from '../sprites';
import type { TimeOfDay } from '../sprites/render';
import { skySource } from '../sprites/render';
import { spriteRasters } from '../sprites/render';
import type { SpriteRasterCache } from '../sprites/render';
import type { ColorMode } from '../design';
import { formatAmount, paintRasterToCanvas } from '../ui';
import { emptyProgress, hasCleared } from './progress';
import type { GameProgress } from './progress';

/** `stage.ts`가 이 값으로 지역 카드를 찾는다. */
export const REGION_SELECT_ACTION = 'select-region';
/** 시작 게이트로 돌아가는 버튼. */
export const REGION_BACK_ACTION = 'region-back';
/** 카드 배경 씬이 꽂히는 자리 표시자 속성. */
export const REGION_ART_ATTR = 'data-region-art';

export const REGION_SELECT_EYEBROW = 'STAGE SELECT · 3 REGIONS';
export const REGION_SELECT_TITLE = '어느 전선부터 잡을 것인가';
/**
 * 화면 한 줄 설명. "목표 수익률"이라는 단어를 여기서 한 번 먼저 심어 두면,
 * 카드의 숫자가 무엇을 뜻하는지 카드를 읽기 전에 정해진다.
 */
export const REGION_SELECT_LEDE =
  '목표 수익률은 그 지역의 필요 지출을 감당하는 최소선이다. 낮은 곳부터 잡는 편이 안전하다.';
export const REGION_BACK_LABEL = '← 타이틀로';

/** 화면에 나오는 순서. `STAGES`는 레코드라 순서를 보장하지 않으므로 여기서 고정한다. */
export const REGION_ORDER: readonly StageId[] = ['R1', 'R2', 'R3'];

/**
 * 지역의 **정체성 카피** (PRD §3 지역 표, 아트 프로덕션 시트 v1.1 §03).
 *
 * 밸런스 수치는 여기 두지 않는다 — 이 표에는 숫자가 하나도 없어야 한다.
 */
interface RegionIdentity {
  readonly name: string;
  readonly sector: string;
  /** 어떤 종목이 나오는 지역인지 한 줄. */
  readonly flavor: string;
  /** 카드 배경으로 쓸 씬 스프라이트의 지역 번호. */
  readonly region: Region;
  /**
   * 카드 배경 씬의 시간대. 원본이 실제로 구운 조합만 쓴다
   * (`SKY_SCENE_KEYS` — R3에는 밤이 없다).
   */
  readonly timeOfDay: TimeOfDay;
}

const REGION_IDENTITY: Readonly<Record<StageId, RegionIdentity>> = {
  R1: {
    name: '여의도',
    sector: '금융',
    flavor: '은행 · 증권 · 보험',
    region: 1,
    timeOfDay: 'dusk',
  },
  R2: {
    name: '판교',
    sector: 'IT · 플랫폼',
    flavor: '게임 · 인터넷 · SW',
    region: 2,
    timeOfDay: 'noon',
  },
  R3: {
    name: '울산',
    sector: '중공업 · 에너지',
    flavor: '조선 · 정유 · 자동차',
    region: 3,
    timeOfDay: 'dusk',
  },
};

/** 카드 한 장이 화면에 말하는 전부. 숫자는 전부 `STAGES`에서 온다. */
export interface RegionCard {
  readonly id: StageId;
  readonly name: string;
  readonly sector: string;
  readonly flavor: string;
  readonly region: Region;
  readonly timeOfDay: TimeOfDay;
  readonly startingAum: number;
  readonly startingGold: number;
  readonly targetReturnRate: number;
  readonly requiredSpend: number;
  /** 진행도 잠금 여부. `isRegionLocked`가 진행도에서 파생시킨다. */
  readonly locked: boolean;
}

/**
 * 이 지역이 잠겨 있는가 — **진행도에서 파생한다**(PRD §4: 인접 점령).
 *
 * 규칙은 하나다: **바로 앞 지역을 클리어해야 열린다.** `REGION_ORDER`의 첫 지역(R1)은
 * 언제나 열려 있다 — 그렇지 않으면 새 플레이어가 아무것도 시작할 수 없다.
 *
 * 예전에는 `locked: false` 고정이었다. 진행도 저장이 없어서 잠그면 R2·R3를 아예 볼 수
 * 없게 되기 때문이었다. 이제 진행도가 생겼으므로 그 TODO가 여기서 닫힌다.
 */
export function isRegionLocked(id: StageId, progress: GameProgress): boolean {
  const index = REGION_ORDER.indexOf(id);
  if (index <= 0) {
    return false;
  }
  const previous = REGION_ORDER[index - 1];
  return previous === undefined ? false : !hasCleared(progress, previous);
}

function cardOf(id: StageId, progress: GameProgress): RegionCard {
  const stage: StageConfig = STAGES[id];
  const identity = REGION_IDENTITY[id];
  return {
    id,
    name: identity.name,
    sector: identity.sector,
    flavor: identity.flavor,
    region: identity.region,
    timeOfDay: identity.timeOfDay,
    startingAum: stage.startingAum,
    startingGold: stage.startingGold,
    targetReturnRate: stage.targetReturnRate,
    requiredSpend: stage.requiredSpend,
    locked: isRegionLocked(id, progress),
  };
}

/**
 * 화면 순서대로 만든 카드 3장.
 *
 * 진행도를 생략하면 **아무것도 클리어하지 않은 상태**로 본다(= R1만 열림). 마크업은
 * 앱 시작 시 1회만 지어지므로, 플레이 중 잠금이 풀리는 것은 `syncRegionLocks`가 맡는다.
 */
export function regionCards(
  progress: GameProgress = emptyProgress(),
): readonly RegionCard[] {
  return REGION_ORDER.map((id) => cardOf(id, progress));
}

/**
 * 지역 표시 이름 — `REGION_IDENTITY`가 단일 출처다.
 *
 * 테이블 전체를 내보내지 않는 이유: 밖에서 임의 필드를 읽기 시작하면 이 파일이 사실상
 * 정체성 저장소가 되고, 아트 시트와의 1:1 대응이 흐려진다. 필요한 것만 함수로 준다.
 */
export function regionNameOf(id: StageId): string {
  return REGION_IDENTITY[id].name;
}

/** 잠긴 카드에 붙는 문구. 왜 잠겼는지까지 말한다 — "눌리지 않는다"만으로는 이유를 모른다. */
export function lockedNoticeFor(id: StageId): string {
  const index = REGION_ORDER.indexOf(id);
  const previous = index > 0 ? REGION_ORDER[index - 1] : undefined;
  if (previous === undefined) {
    return '';
  }
  return `${previous} ${REGION_IDENTITY[previous].name} 점령 후 열린다`;
}

/**
 * 열려 있는 카드의 DOM을 진행도에 맞춘다.
 *
 * ★ 왜 별도 함수인가 ★ 지역 선택 마크업은 앱 시작 시 1회만 지어지는데(`buildStageMarkup`),
 * 진행도는 **플레이 중에 바뀐다**(R1을 깨면 R2가 열려야 한다). 매번 마크업을 다시 짓는 대신
 * 화면을 열 때 이 함수로 잠금 상태만 되맞춘다 — 단일 출처는 그대로 진행도다.
 */
export function syncRegionLocks(root: ParentNode, progress: GameProgress): void {
  for (const id of REGION_ORDER) {
    const button = root.querySelector<HTMLButtonElement>(
      `[data-action="${REGION_SELECT_ACTION}"][data-region="${id}"]`,
    );
    if (!button) {
      continue;
    }
    const locked = isRegionLocked(id, progress);
    button.disabled = locked;
    button.classList.toggle('rcard--locked', locked);
    // 스크린리더에도 상태를 알린다 — 시각적 흐림만으로는 전달되지 않는다.
    button.setAttribute('aria-disabled', String(locked));
    const notice = button.querySelector<HTMLElement>('.rcard__lock');
    if (notice) {
      notice.hidden = !locked;
    }
  }
}

/** 문자열이 실제 지역 ID인지 (버튼 `dataset` 값 검증용). */
export function stageIdFor(value: string | undefined): StageId | null {
  if (value === undefined) return null;
  return REGION_ORDER.includes(value as StageId) ? (value as StageId) : null;
}

/** `0.2` → `+20%`. 목표는 항상 플러스지만 부호를 붙여 "얼마를 벌어야 하는지"로 읽히게 한다. */
export function formatTargetReturn(rate: number): string {
  const percent = Math.round(rate * 100);
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

/** 카드 하나의 수치 3+1종. 라벨과 값을 쌍으로 두어 마크업에서 순서를 잃지 않게 한다. */
export function regionStats(card: RegionCard): readonly { label: string; value: string; tone: string }[] {
  return [
    { label: '시작 AUM', value: formatAmount(card.startingAum), tone: 'aum' },
    { label: '시작 골드', value: `${formatAmount(card.startingGold)} G`, tone: 'gold' },
    { label: '목표 수익률', value: formatTargetReturn(card.targetReturnRate), tone: 'target' },
    { label: '필요 지출', value: `${formatAmount(card.requiredSpend)} G`, tone: 'spend' },
  ];
}

const TITLE_ID = 'region-title';

function statMarkup(card: RegionCard): string {
  return regionStats(card)
    .map(
      (stat) => `
            <span class="rcard__stat rcard__stat--${stat.tone}">
              <span class="rcard__stat-label">${stat.label}</span>
              <span class="rcard__stat-value">${stat.value}</span>
            </span>`,
    )
    .join('');
}

function cardMarkup(card: RegionCard): string {
  const describedBy = `region-${card.id.toLowerCase()}-flavor`;
  return `
      <li class="region__cell">
        <button class="rcard" type="button"
                data-action="${REGION_SELECT_ACTION}" data-region="${card.id}"
                aria-describedby="${describedBy}">
          <span class="rcard__art" ${REGION_ART_ATTR}="${card.id}" aria-hidden="true"></span>
          <span class="rcard__head">
            <span class="rcard__code">${card.id}</span>
            <span class="rcard__name">${card.name}</span>
          </span>
          <span class="rcard__sector">${card.sector}</span>
          <span class="rcard__flavor" id="${describedBy}">${card.flavor}</span>
          <span class="rcard__stats">${statMarkup(card)}</span>
          <span class="rcard__lock"${card.locked ? '' : ' hidden'}>${lockedNoticeFor(card.id)}</span>
        </button>
      </li>`;
}

/**
 * 지역 선택 오버레이. **`hidden`으로 태어난다** — 시작 게이트가 먼저고, 이 화면은
 * [스테이지 시작]을 누른 뒤에 열린다. 게이트와 마찬가지로 여기서도 프레임 루프는 돌지 않는다.
 */
export function buildRegionSelectMarkup(): string {
  const cards = regionCards().map(cardMarkup).join('');

  return `
    <div class="region" data-ref="region-select" role="dialog" aria-modal="true"
         aria-labelledby="${TITLE_ID}" hidden>
      <div class="region__panel">
        <p class="region__eyebrow">${REGION_SELECT_EYEBROW}</p>
        <h2 class="region__title" id="${TITLE_ID}">${REGION_SELECT_TITLE}</h2>
        <p class="region__lede">${REGION_SELECT_LEDE}</p>
        <ul class="region__grid">${cards}</ul>
        <button class="region__back" type="button" data-action="${REGION_BACK_ACTION}">
          ${REGION_BACK_LABEL}
        </button>
      </div>
    </div>
  `;
}

export interface RegionArtOptions {
  readonly rasters?: SpriteRasterCache;
  readonly scale?: number;
  /** 색약 모드. 넘기면 캐시를 그 모드로 맞춘 뒤 굽는다. */
  readonly mode?: ColorMode;
}

/**
 * 카드 배경 씬 기본 배율. 씬 원본은 108×56이라 2배면 216×112 — 카드 폭(약 240px)에
 * 가로로 거의 꽉 찬다. CSS가 `width:100%`로 늘려도 정수 배율로 구운 픽셀 비율은 유지된다.
 */
export const REGION_ART_SCALE = 2;

/**
 * `[data-region-art="R1"]` 자리 표시자에 지역 씬(`tf-r1-dusk` 등)을 구워 꽂는다.
 *
 * `src/sprites/**`는 이 작업의 쓰기 범위 밖이므로 **읽기 전용 렌더 API만** 쓴다:
 * `skySource(region, timeOfDay)`가 굽기 요청을 만들고, 래스터 캐시가 한 번만 굽는다
 * (조합당 1회 — HUD 아이콘과 같은 방식).
 *
 * 굽지 못하는 환경(캔버스 컨텍스트 없음)에서는 조용히 넘어간다. 자리 표시자는 CSS
 * 그라디언트(팔레트 토큰)만으로도 지역색이 남게 스타일링돼 있다.
 *
 * @returns 실제로 그린 카드 수
 */
export function mountRegionArt(root: ParentNode, options: RegionArtOptions = {}): number {
  const cache = options.rasters ?? spriteRasters;
  if (options.mode !== undefined) cache.setColorMode(options.mode);

  const hosts = Array.from(root.querySelectorAll<HTMLElement>(`[${REGION_ART_ATTR}]`));
  let painted = 0;

  for (const host of hosts) {
    const id = stageIdFor(host.getAttribute(REGION_ART_ATTR) ?? undefined);
    if (id === null) continue;

    const identity = REGION_IDENTITY[id];
    const raster = cache.raster(skySource(identity.region, identity.timeOfDay));
    if (raster === null) continue;

    const canvas = host.ownerDocument.createElement('canvas');
    canvas.className = 'rcard__art-canvas';
    if (!paintRasterToCanvas(canvas, raster, options.scale ?? REGION_ART_SCALE)) continue;

    host.replaceChildren(canvas);
    painted += 1;
  }

  return painted;
}
