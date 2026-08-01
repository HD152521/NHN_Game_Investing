/**
 * 전투 시스템 밸런스 상수 (PRD FR-6, §9.2, §9.4).
 *
 * PRD에 값이 명시된 항목(§9.2 경제 파라미터, §9.4 웨이브 테이블)은 그 값을 그대로 옮긴다.
 * PRD에 수치가 없는 항목(타워 사거리·DPS, 유닛 HP·DPS, 적 이동속도·근접공격력 등)은
 * 여기서 직접 정하되 근거를 주석으로 남긴다. 목표는 "13웨이브를 적당히 잘하면 깰 수 있다"
 * 수준의 체감이며, 정밀 밸런싱은 봇 시뮬레이터·플레이테스트(§9.3, §10)에서 재조정한다.
 */

import { STAGES } from './stages';
import type { StageWaveTable, TowerKind, UnitKind } from './types';

// ── §9.2 경제 파라미터 (PRD 명시값) ─────────────────────────────
export const WAVE_COUNT = 13;
/**
 * 웨이브 1주기(ms) — **준비 구간 + 교전 구간의 합**이다 (PRD §9.2 명시값 30초 유지).
 *
 * ★ 준비 시간은 주기에 "더해지지" 않고 주기 "안에서" 잘려 나온다 ★
 * 리플레이(`src/market/types.ts` STAGE_DURATION_MS)는 390초로 고정이고, 13 × 30초 = 390초라
 * 전투와 차트가 정확히 같은 시계를 쓴다. 준비 5초를 주기에 더하면 전투가 455초가 되어
 * 차트가 끝난 뒤에도 웨이브 12~13이 남고, 셸이 스테이지를 리셋해 버려 마지막 두 웨이브가
 * 사실상 사라진다(= 기본 수입 총액도 195 G에서 165 G로 조용히 깎인다).
 * 그래서 주기는 30초 그대로 두고, 그 안을 `WAVE_PREP_MS` + 교전으로 나눈다.
 */
export const WAVE_DURATION_MS = 30_000;
/**
 * 웨이브 시작 전 준비 구간(ms). 이 동안 적은 스폰되지 않는다.
 *
 * 플레이테스트 피드백: "라운드를 바로 시작하는 게 아니라 5초 정도 준비 시간을 주면 좋을 듯."
 * 실제 문제는 **첫 타워를 세울 틈이 없다**는 것이다 — 시작 골드 120 G는 기본 포탑 정확히
 * 1기라, 웨이브 1이 즉시 시작되면 고르고 클릭할 시간 없이 적이 이미 행군 중이다.
 *
 * 준비 구간에도 차트는 계속 흐르고 매매도 가능하다 — 여기가 "예고를 보고 미리 산다"는
 * 코어 루프의 자리이므로, 전투만 멈추고 시장은 멈추지 않는다.
 */
export const WAVE_PREP_MS = 5_000;
export const BASE_HP = 100;
export const TOWER_SLOTS = 6;
export const AUM_DROP_PER_WAVE = 150;
/**
 * 웨이브당 기본 수입(G) — **R1 값**. 25 → 15로 내렸다.
 *
 * 기본 수입은 **매매를 한 번도 안 해도 들어오는 무조건적 골드**다. 이 값이 높으면
 * "예측을 건너뛴 플레이"의 하한이 올라가 코어 루프(예측 → 골드 → 방어)가 약해진다.
 * 골드의 주 공급원은 어디까지나 청산 이익(`src/position/trade.ts`)이어야 한다.
 *
 * R2/R3는 웨이브마다 값이 다를 수 있어(마지막 웨이브만 +1) 배열로 관리한다 —
 * `STAGES[id].baseIncomePerWave` 참고.
 */
export const BASE_INCOME_PER_WAVE = STAGES.R1.baseIncomePerWave[0] ?? 15;
export const SKILL_COST = 200;
export const SKILL_COOLDOWN_MS = 45_000;
/**
 * 스테이지 시작 지급 골드(FR-6.8-b). 전투 시뮬 자체는 사용하지 않으나 §9.2 상수로 문서화해 둔다.
 *
 * 200 → 120. **기본 포탑(120 G) 정확히 1기**만 지을 수 있는 값이다 — PRD FR-6.8-b가
 * 요구하는 제약("타워 최소 1기는 웨이브 1 이전에 반드시 건설 가능")은 그대로 지키면서,
 * 여유분 80 G를 걷어낸다. **2기째 자금은 첫 청산 이익에서만 나온다** — 즉 두 번째 타워를
 * 세우려면 반드시 차트를 봐야 한다.
 *
 * ⚠️ 런타임이 실제로 읽는 값은 `src/app/session.ts`의 동명 상수다(중복 정의). 그쪽도
 * 120으로 맞추지 않으면 이 변경은 효과가 없다.
 *
 * 전 지역 공통값이라 `STAGES.R1.startingGold`를 그대로 쓴다.
 */
export const STARTING_GOLD = STAGES.R1.startingGold;
/** 경계도 계수 증가분(지역 1점령당). heat = 1 + 점령수 × HEAT_PER_TERRITORY (FR-6.7). */
export const HEAT_PER_TERRITORY = 0.02;

// ── 타워 3종 (FR-6.4, PRD 명시값: 건설/업그레이드 비용) ──────────
export const TOWER_BUILD_COST: Record<TowerKind, number> = {
  basic: 120,
  antiair: 120,
  splash: 160,
};

export const TOWER_UPGRADE_COST: Record<TowerKind, number> = {
  basic: 180,
  antiair: 180,
  splash: 220,
};

/**
 * 타워 사거리(진행도 0~1 단위). 타워 **자기 위치 기준 상대 거리**이며, 실제 커버 상한은
 * `towerX(slot) + TOWER_RANGE[kind]`다 (`mechanics.ts applyTowerFire` 참고).
 * PRD는 사거리를 정하지 않아 여기서 정한다.
 * - basic: 단일 표적 중간 사거리.
 * - antiair: 공중 적(§ENEMY_SPEED_AIR)이 지상보다 빠르게 접근하므로 대응 시간을 더 주기 위해
 *   가장 길게 잡는다.
 * - splash: "범위 피해로 낮은 DPS를 상쇄"하는 설계 의도상 사거리를 짧게 잡아 트레이드오프를 준다.
 *
 * ★ 2026-08-01 조정 (0.42 / 0.50 / 0.30 → 0.38 / 0.46 / 0.26) ★
 * 슬롯을 기지 쪽 2줄 배치로 옮기면서 `TOWER_SLOT_SPACING`이 0.02 → 0.035로 넓어졌다.
 * 슬롯 간격이 넓어지면 슬롯별 커버 상한 차이도 같이 커지므로(0.10 → 0.175), 사거리를
 * 그대로 두면 **타워 6기의 평균 도달 거리 자체가 통째로 늘어난다**. 평균 도달거리
 * `range + 2.5 × spacing`을 조정 전과 같게 맞추려면 사거리를 `2.5 × (0.035 − 0.02) = 0.0375`
 * 만큼 줄여야 한다 — 0.04로 반올림했다.
 *   basic  : 0.42 + 0.05 = 0.470 → 0.38 + 0.0875 = 0.4675 (−0.0025)
 *   antiair: 0.50 + 0.05 = 0.550 → 0.46 + 0.0875 = 0.5475 (−0.0025)
 *   splash : 0.30 + 0.05 = 0.350 → 0.26 + 0.0875 = 0.3475 (−0.0025)
 * 즉 **전체 화력 도달 범위는 사실상 그대로 두고, 슬롯 선택이 만드는 차이만 75% 키웠다.**
 */
export const TOWER_RANGE: Record<TowerKind, number> = {
  basic: 0.38,
  antiair: 0.46,
  splash: 0.26,
};

/**
 * 타워 슬롯 간 간격(진행도 단위). 슬롯 0이 본진(x=0)에 가장 가깝고, 인덱스가 커질수록
 * 적 본진 쪽으로 이 간격만큼 전진 배치된다.
 *
 * 이 상수가 있어야 "어느 슬롯에 짓는가"가 의미를 갖는다. 예전에는 타워 표적 판정이
 * `enemy.x <= range`(본진 절대좌표 기준)라서 슬롯 6개가 전부 **완전히 동일하게** 동작했고,
 * 배치 결정이 사실상 0개였다. 이제 판정이 `enemy.x - towerX(slot) <= range`(상대 거리)라,
 * 앞 슬롯일수록 적을 더 일찍(더 먼 x에서) 잡는다.
 *
 * ★ 0.02 → 0.035 ★ 이 값은 **화면 배치와 한 몸**이다. `src/battle/layout.ts`가 슬롯을
 * `progressToX(towerX(slot))`에 그리므로, 간격이 곧 픽셀 간격이 된다. 슬롯 6개를 기지 옆
 * 2줄(짝수 인덱스 위/홀수 인덱스 아래)로 벽돌쌓기 배치하면 같은 줄 이웃의 픽셀 간격은
 * `2 × spacing × 레인폭`이다. 레인폭 778 px(캔버스 1024) 기준 0.035면 54.5 px이라
 * 44 px 터치 타겟(PRD §11)을 겹침 없이 담을 수 있는 최소치다. 더 좁히면 슬롯이 서로
 * 겹쳐 클릭 판정이 모호해지고, 더 넓히면 "기지에 작게 모은다"는 요구가 깨진다.
 */
export const TOWER_SLOT_SPACING = 0.035;

/**
 * 슬롯 인덱스 → 전장 위치(진행도, 0=아군 사옥 ~ 1=적 본진).
 *
 * `Tower`에 위치 필드를 따로 싣지 않고 `slot`에서 파생시킨다 — 슬롯이 곧 위치의 단일
 * 출처이므로, 필드를 이중으로 들면 둘이 어긋날 여지만 생긴다.
 */
export function towerX(slot: number): number {
  return slot * TOWER_SLOT_SPACING;
}

/** 타워 공격 주기(ms). 낮을수록 자주 쏜다. */
export const TOWER_COOLDOWN_MS: Record<TowerKind, number> = {
  basic: 800,
  antiair: 600,
  splash: 1400,
};

/**
 * 타워 레벨별 타격 1회 피해량. DPS = damage / (cooldownMs / 1000).
 * - basic Lv1: 20 / 0.8s = 25 DPS → "단일 표적, 중간 DPS" 반영.
 * - antiair Lv1: 34 / 0.6s ≈ 56.7 DPS → "공중 전용, 고 DPS" 반영(지상 타워의 2배 이상).
 * - splash Lv1: 10 / 1.4s ≈ 7.1 DPS지만 사거리 내 전원에게 동시 적용 → "낮은 DPS, 범위 피해".
 * - Lv2(업그레이드)는 대략 1.6~1.7배로 잡아 "업그레이드가 체감되는" 수준으로 설계했다.
 */
export const TOWER_DAMAGE: Record<TowerKind, Record<1 | 2, number>> = {
  basic: { 1: 20, 2: 34 },
  antiair: { 1: 34, 2: 56 },
  splash: { 1: 10, 2: 16 },
};

// ── 유닛 3종 (FR-6.5, PRD 명시값: 소환 비용) ─────────────────────
export const UNIT_COST: Record<UnitKind, number> = {
  intern: 30,
  analyst: 60,
  trader: 90,
};

/**
 * 유닛 HP. 역할 분화(기획 요구사항) 반영. 봇 시뮬레이터(§9.2 참고 방식)로
 * "예산 360G를 한 종류에만 썼을 때" 성과를 직접 측정해 튜닝했다 — 자세한 수치는
 * 이 파일을 수정한 커밋의 작업 보고를 참고하라.
 * - intern(근접, 30G): 기준선. 60/30 = 2.0 HP/G. 물량으로 승부하는 저렴한 유닛.
 * - analyst(원거리, 60G): 사거리 이점(밀착 전 일방적 사격)으로 실전 DPS를 보완하는 대신
 *   HP/G(75/60=1.25)는 셋 중 가장 낮다 — "근거리 적이 뚫고 들어오면 급격히 약하다"는
 *   기획 의도 그대로다.
 * - trader(탱커, 90G): "탱도 되고 전반적인 스탯도 조금 좋다"는 의도상 HP/G를 가장 높게
 *   잡되(260/90≈2.89), intern 대비 과도하게(5배 이상) 벌어지지 않게 눌러 "예산이 같으면
 *   trader가 사실상 유일한 정답"이 되는 걸 막았다(시뮬레이션으로 확인 — 최초 시도인
 *   300은 트레이더 단일 조합이 최고난도 웨이브까지 무손실로 전멸시켜 다른 유닛을 무의미하게
 *   만들었다).
 */
export const UNIT_HP: Record<UnitKind, number> = {
  intern: 60,
  analyst: 75,
  trader: 260,
};

/**
 * 유닛 공격 1회 피해량. 공격 주기(UNIT_COOLDOWN_MS)는 종류 무관 동일하게 두고 피해량만
 * 차등화한다.
 * - intern: 7/30 ≈ 0.233 dmg/G. 기준선(60 HP 그대로 두고 1회 피해량만 6→7로 소폭 상향해
 *   "물량 유닛이 아무 것도 못 죽이는" 상황을 막았다 — 시뮬레이션에서 6이면 고HP 적 상대로
 *   사실상 딜이 안 나왔다).
 * - analyst: 사거리 덕에 밀착 전 몇 차례 무피해 선타를 넣으므로 1회 피해량은 셋 중 가장
 *   높게(13) 잡는다 — 원거리 유닛의 정체성은 "맞기 전에 때린다"이므로 순간 화력이
 *   메인 무기다.
 * - trader: "데미지도 근거리보다 나음"이 기획 명시 요구사항이라 intern(7)보다 확실히 높은
 *   12를 준다. analyst(13)보다는 살짝 낮게 잡아 "데미지까지 최고인 만능 유닛"이 되지 않게
 *   하고, 트레이더의 우위는 어디까지나 HP(생존력) 쪽에 더 크게 싣는다.
 */
export const UNIT_DAMAGE: Record<UnitKind, number> = {
  intern: 7,
  analyst: 13,
  trader: 12,
};

/** 유닛 공격 주기(ms). 타워와 동일하게 "쿨다운 후 발사" 모델을 쓴다(Unit.cooldownMs 필드). */
export const UNIT_COOLDOWN_MS = 700;

/** 유닛 전진 속도(초당 진행도). 라인 전체(0→1)를 약 20초에 주파하는 값으로 잡았다. */
export const UNIT_SPEED = 0.05;

/**
 * 유닛 밀착(근접) 사거리 — 이 거리 이하에서만 적이 유닛에게 반격할 수 있다.
 * 서브스텝당 최대 접근량은 (UNIT_SPEED + ENEMY_SPEED_GROUND) × (MAX_SUBSTEP_MS/1000)
 * ≈ (0.05 + 0.0455) × 0.25 ≈ 0.024다. 이보다 넉넉히 크게 잡아, 근접 판정이 한 서브스텝
 * 안에 건너뛰지(터널링) 않게 한다. intern·trader는 사거리 자체가 이 값이라 사실상 "밀착
 * 해야만 교전한다"는 근접 유닛의 정의 그 자체가 된다.
 */
export const UNIT_MELEE_RANGE = 0.05;

/**
 * analyst(원거리) 전용 사거리. 밀착 사거리보다 충분히 길게 잡아 "적이 접근하는 동안
 * analyst가 먼저 몇 차례 무피해로 공격하는 구간"을 만든다. 적 지상 속도(ENEMY_SPEED_GROUND
 * ≈ 0.0455/s)로 (0.2−0.05)=0.15만큼 접근하는 데 약 3.3초가 걸리고, 공격 주기 700ms 기준
 * 그 사이 analyst는 약 4~5회 선타를 넣을 수 있다 — "맞기 전에 때린다"는 기획 의도를
 * 수치로 보장하는 값이다.
 */
export const UNIT_RANGED_RANGE = 0.2;

/**
 * 유닛 종류별 공격 사거리(진행도 단위). 원거리 유닛이 사거리 안에 든 적을 향해 전진을
 * 멈추고 공격하되, 적은 `UNIT_MELEE_RANGE` 이하로 밀착해야만 반격할 수 있다(mechanics.ts
 * `applyEngagement` 참고). PM이 UI 사거리 표시에 그대로 쓸 수 있는 상수 테이블이다.
 */
export const UNIT_RANGE: Record<UnitKind, number> = {
  intern: UNIT_MELEE_RANGE,
  analyst: UNIT_RANGED_RANGE,
  trader: UNIT_MELEE_RANGE,
};

// ── 적 (FR-6.7) ───────────────────────────────────────────────
/**
 * 적 이동 속도(초당 진행도 감소량). PRD §9.4는 "baseSpeed[w]는 지역별 데이터 테이블로
 * 관리"라고만 명시하고 구체값을 주지 않아 여기서 웨이브 공통 상수로 단순화한다 — 난이도
 * 상승은 적 수·HP 증가(heat)만으로 충분히 표현되므로 속도까지 웨이브별로 올리지 않는다.
 * 공중 적은 유닛으로 저지할 수 없는 대신(대공 타워만 유효) 지상보다 빠르게 잡아 위협을 표현한다.
 */
export const ENEMY_SPEED_GROUND = 1 / 22; // 라인(x:1→0) 완주 약 22초
export const ENEMY_SPEED_AIR = 1 / 16; // 완주 약 16초

/**
 * 적 근접 공격 1회 피해량과 공격 주기(ms). PM이 `Enemy` 타입(types.ts)에 damage/
 * attackCooldownMs/cooldownMs 필드를 추가해, 이제 타워·유닛과 동일하게 "쿨다운 후 발사"하는
 * 이산 모델로 통일한다(예전엔 Enemy에 쿨다운 필드가 없어 ENEMY_MELEE_DPS라는 연속 DPS로
 * 단순화했었다).
 *
 * 기존 체감 DPS(9)를 그대로 유지하는 게 목표라 damage / (attackCooldownMs/1000) = 9가 되도록
 * 역산했다 — 정수로 딱 떨어지는 조합 중 가장 단순한 damage=9, attackCooldownMs=1000(1초)을
 * 골랐다. 웨이브 무관 고정값인 이유는 이전과 동일(후반 웨이브 난이도는 baseHP × heat로 오래
 * 버티는 데서 나오게 하고, 공격력까지 올리면 조합 폭발적으로 어려워진다).
 */
export const ENEMY_DAMAGE = 9;
export const ENEMY_ATTACK_COOLDOWN_MS = 1000;

/**
 * 적 1체가 본진(x<=0)에 도달했을 때 입히는 고정 피해. BASE_HP=100 기준으로, 마지막 웨이브
 * (14체, heat=1)를 전부 흘려보내도 즉사하지 않도록(14×6=84<100) 여유를 뒀다 — 몇 마리를
 * 놓쳐도 만회할 수 있어야 "13웨이브를 적당히 잘하면 깰 수 있다"는 목표에 맞는다.
 */
export const BASE_DAMAGE_PER_LEAK = 6;

/**
 * 공중 웨이브에서 전체 스폰 수 중 공중 레인에 배치할 비율. PRD §9.4는 "해당 웨이브에 공중
 * 적이 있는지(✓/−)"만 표기하고 지상/공중 분배 비율은 정하지 않아 여기서 고정값으로 정한다.
 * 1/3 정도로 잡아 대공 타워 투자 유인을 주되, 지상 방어가 무의미해지지 않게 한다.
 */
export const AIR_ENEMY_SHARE = 1 / 3;

/** 스킬(공시 폭탄) 즉시 피해량. 초반 웨이브 HP(50~90대)는 즉사시키고 후반(200대)은 크게 깎는 수준. */
export const SKILL_DAMAGE = 90;

// ── R1 웨이브 테이블 별칭 (§9.4) ─────────────────────────────────
/**
 * 지역별 값은 전부 `stages.ts`의 `STAGES`에 모여 있다. 아래 세 상수는 **R1 값의 별칭**으로,
 * 지역 개념이 없던 시절 코드와의 호환을 위해 남겨 둔 것이다.
 * 새 코드는 `CombatParams.waveTable`(또는 `STAGES[id].waveTable`)을 써라 — 전역 상수를
 * 직접 읽으면 R2/R3에서 조용히 R1 난이도가 적용된다.
 */
export const WAVE_BASE_COUNT: readonly number[] = STAGES.R1.waveTable.baseCount;
/** 웨이브 1~13의 기본 HP(heat 적용 전). R1 값의 별칭 — 위 주의사항 참고. */
export const WAVE_BASE_HP: readonly number[] = STAGES.R1.waveTable.baseHp;
/** 공중 적이 포함되는 웨이브 번호(1-based) 집합. R1 값의 별칭 — 위 주의사항 참고. */
export const AIR_WAVE_NUMBERS: ReadonlySet<number> = STAGES.R1.waveTable.airWaves;

/** `CombatParams.waveTable`이 비었을 때 쓰는 기본 테이블(=R1). */
export const DEFAULT_WAVE_TABLE: StageWaveTable = STAGES.R1.waveTable;

// ── 시뮬레이션 타임스텝 ───────────────────────────────────────────
/**
 * 내부 고정 서브스텝 상한(ms). `step()`에 큰 `dtMs`가 들어와도 이 크기로 잘게 쪼개 순차
 * 적용한다 — 적 최고 속도(ENEMY_SPEED_AIR ≈ 0.0625/s) 기준 250ms 동안 이동하는 진행도는
 * 약 0.016으로 라인 전체(1.0)에 비해 충분히 작아 "적이 사거리·본진을 건너뛰는" 터널링이
 * 일어나지 않는다.
 */
export const MAX_SUBSTEP_MS = 250;
/** 한 번의 `step()` 호출에서 처리할 dtMs 총합 상한. 탭 비활성 복귀 등 극단값 방어용. */
export const MAX_TOTAL_DT_MS = 10_000;
