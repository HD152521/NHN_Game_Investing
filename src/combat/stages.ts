/**
 * 스테이지(지역)별 밸런스 상수표 — R1/R2/R3 (PRD §9.2, §9.4).
 *
 * ★ 이 파일이 지역 난이도의 단일 출처다 ★
 * 예전에는 웨이브 테이블·기본 수입이 모듈 전역 상수로 하드코딩되어 있어 지역이 하나뿐이라는
 * 전제가 코드 전체에 퍼져 있었다. 지역별 값은 전부 여기 `StageConfig`에 모으고, 소비하는
 * 쪽은 `CombatParams.waveTable` 등으로 주입받는다 — 지역이 늘어도 이 파일만 바뀐다.
 *
 * 경제 모델(FR-5.7 / FR-6.8 / `src/position/trade.ts`):
 * ```
 * 총골드 = STARTING_GOLD + 기본수입 총액 + S × (1 + ρ) × GOLD_CONVERSION
 *   S = 세션 총 투입액 = 시작 AUM + AUM_DROP_PER_WAVE × 13   ← 재순환 없음
 *   ρ = 매매 수익률 (청산 pnl 합 / 총 투입액)
 * ```
 *
 * ★ S가 이제 **파생값**이라는 점이 v1.3에서 달라진 핵심이다 ★
 * 청산이 원금을 AUM으로 되돌리던 시절에는 같은 돈을 몇 번이고 다시 투입할 수 있어
 * S가 "몇 회전 굴렸는가"라는 손으로 관리하는 가정값(R1 11,900 등)이었다. 지금은 청산이
 * AUM을 한 푼도 늘리지 않으므로, **세션 동안 굴릴 수 있는 총액 = 세션 동안 받은 AUM 총액**
 * 이라는 항등식이 성립한다. `sessionTotalStake()`가 그 항등식 자체다 — 손으로 적는 상수가
 * 아니라 `startingAum`과 드롭에서 계산된다.
 *
 * ★ v1.4에서 게이트의 축이 바뀌었다 — "얼마나 잘 맞히나"에서 "얼마나 안 태우나"로 ★
 * 봇 시뮬레이터(`tools/bot-sim`, PRD §10 ⑥)가 실제 장중 1분봉(마팅게일)에서 R1/R2/R3의
 * 예전 목표(+20/+30/+45%)가 **전부 도달 불가**임을 판정했다(최선 전략 실측 ρ +4.4~6.3%).
 * 마팅게일 경로에서는 optional stopping에 의해 어떤 정지 규칙에서도 `E[r] = 0`이므로
 * `E[ρ] ≤ −feeRate`가 **정리로 성립**한다 — 방향 예측은 기대값이 0이라 실력 축이 될 수 없다.
 *
 * 그래서 `targetReturnRate`는 **전 지역 0**이다. 통과 조건은 "벌어라"가 아니라
 * **"받은 AUM을 태우지 말고 전부 골드로 옮겨라"**다. 지역 난이도 차등은 매매가 아니라
 * 전투(웨이브 HP 계수)가 진다 — 아래 `waveTable` 주석 참고.
 *
 * ★ v1.5에서 그 전투 난이도를 **재는 자**가 바뀌었다 — 비율 계산에서 실측으로 ★
 * v1.4는 `combatLoadPerGold`(골드당 처리해야 할 적 HP)가 R1 → R3로 단조 증가하도록 계수를
 * 잡았다(R2 ×1.62 / R3 ×2.68). 그 지표는 **골드가 방어로 선형 변환된다**고 가정하는데,
 * 타워 슬롯이 6개로 고정이라(`TOWER_SLOTS`) 실제 변환은 위로 꺾인 곡선이다 — 6기를 Lv2까지
 * 채우고 남은 골드는 효율이 훨씬 낮은 유닛으로만 흘러간다. 전투 시뮬레이터
 * (`tools/combat-sim`)가 그 가정을 반증했다: **×2.68의 R3는 모든 예산 · 모든 로드아웃에서
 * 클리어율 0%**였다.
 *
 * 그래서 `combatLoadPerGold`는 **난이도 정의에서 물러났고**(GAME.md §19-9), 계수는 배율 스윕
 * 실측에서 다시 뽑았다 — R2 **×1.20** / R3 **×1.30**. 지금 램프의 정의는 둘이다:
 * ```
 *   ① 총 적 HP 단조 증가        20,155 < 24,186 < 26,226   (`stages.test.ts`가 고정)
 *   ② 실측 클리어율 단조 감소    R1 0.368 · R2 0.211 · R3 0.158
 *                              (`npx tsx tools/combat-sim/bin.ts`, 예산 100% · 로드아웃 19종)
 * ```
 * **비율 계산으로 계수를 정하지 마라.** 그 귀결로 `combatLoadPerGold`는 오히려 단조 **감소**
 * 하는데(8.80 / 7.35 / 5.59) 이건 버그가 아니라 지표 폐기의 결과다 — 해당 함수 주석 참고.
 *
 * `requiredSpend`는 그 통과선에서 역산된 값이다(각 스테이지 주석의 `DEPLOYMENT_ALLOWANCE` 참고).
 */

import { GOLD_CONVERSION } from '../position/constants';
import type { StageWaveTable } from './types';

export type StageId = 'R1' | 'R2' | 'R3';

export interface StageConfig {
  readonly id: StageId;
  /**
   * 스테이지 시작 시 지급되는 AUM(매매 원금).
   *
   * 드롭과 함께 **세션 총 투입액 S를 완전히 결정한다**(`sessionTotalStake`) —
   * 청산이 AUM을 되돌리지 않으므로 이 값이 곧 밸런스 게이트의 주 노브다.
   */
  readonly startingAum: number;
  /** 스테이지 시작 시 지급되는 골드 (FR-6.8-b). 전 지역 공통 120 — 기본 포탑 정확히 1기. */
  readonly startingGold: number;
  /** 웨이브 1~13의 기본 수입(G). 인덱스 0 = 웨이브 1. */
  readonly baseIncomePerWave: readonly number[];
  readonly waveTable: StageWaveTable;
  /** 이 스테이지를 클리어하는 데 필요한 골드 총액 (PRD §9.3). */
  readonly requiredSpend: number;
  /**
   * 목표 매매 수익률 ρ. **v1.4부터 전 지역 0(본전)이다.**
   *
   * 예전에는 "이 정도는 벌어야 한다"는 실력 요구치였으나, 봇 시뮬레이터가 마팅게일에서
   * `E[ρ] ≤ −feeRate`임을 실측·증명하면서 요구치로서의 의미를 잃었다. 지금은
   * **"손실 없이 전액 전환하면 닿는다"**는 기준선이다 — 0보다 유의미하게 낮으면(강제청산·
   * 과대 베팅으로 원금을 태우면) 필요지출에 닿지 못한다.
   */
  readonly targetReturnRate: number;
}

/**
 * 필요지출을 역산할 때 가정하는 **S 소진율**.
 *
 * 총골드 식은 S를 100% 투입한다고 보지만, 실제로는 마지막 웨이브 드롭처럼 굴릴 시간이 없는
 * AUM이 남는다. 이 여유를 필요지출 쪽에 미리 반영해 두어야 **"ρ = 0이면 통과"가 말 그대로
 * 성립**한다 — 반영하지 않으면 소진율 손실을 메우려고 ρ 양수를 요구하게 되어 목표를 0으로
 * 내린 의미가 사라진다.
 *
 * ★ 0.95(전액 투입 실측 중앙값)가 아니라 0.92인 이유 — 이게 §3의 핵심이다 ★
 * 봇 시뮬레이터 실측 소진율은 투입 프리셋에 따라 갈린다:
 * ```
 *   전액(100%) 투입 : 93 ~ 98%
 *   절반(50%) 투입  : 87 ~ 96%
 * ```
 * 그런데 같은 실측에서 **절반 투입 쪽이 더 잘 클리어한다**(추세추종+손절 45.5/48.5/50.0%
 * 대 전액 투입 40.5/40.0/40.0%). 전액 투입은 첫 거래 한 방이 세션을 결정해 클리어가 분산의
 * 함수가 되고, 절반 투입은 거래를 쪼개 분산을 줄이는 대신 소진율을 몇 %p 손해 본다.
 *
 * 여유를 전액 투입 소진율(0.95)로 잡으면 **"몰빵하지 않은 대가"를 게이트가 벌준다** —
 * 리스크 관리를 실력 축으로 삼겠다는 이번 결정과 정면으로 어긋난다. 그래서 두 프리셋을
 * 모두 덮는 0.92로 잡는다. 전액 몰빵은 이제 유일한 정답이 아니라 **분산이 큰 선택지**다.
 *
 * ★ 이 값이 곧 게이트의 실패선이다 ★
 * 전액 투입 기준 총골드가 필요지출과 같아지는 ρ는 정확히 `DEPLOYMENT_ALLOWANCE − 1`,
 * 즉 **−8%**다(`gateReturnRate` 참고). 봇 실측에서 원금을 태우는 전형(추세추종·종료보유,
 * 강제청산률 62.5%)의 ρ가 −15.9%였고 나머지 전략은 전부 −2.5% 이상이었으므로,
 * −8%는 그 둘 사이를 여유 있게 가른다.
 */
export const DEPLOYMENT_ALLOWANCE = 0.92;

/** R1 기준 HP 곡선. R2/R3는 여기에 계수를 곱해 만든다. */
export const WAVE_BASE_HP_R1: readonly number[] = [
  70, 85, 100, 115, 125, 135, 150, 165, 185, 205, 230, 260, 300,
];

/** 웨이브 1~13 공통 기본 적 수. 지역이 달라도 수는 같고, HP와 heat로만 난이도를 준다. */
const WAVE_BASE_COUNT_ALL: readonly number[] = [3, 4, 5, 5, 6, 7, 7, 8, 9, 10, 11, 12, 14];

/** 공중 적이 포함되는 웨이브 번호(1-based). 지역 공통. */
const AIR_WAVES_ALL: ReadonlySet<number> = new Set([3, 5, 7, 8, 10, 11, 12, 13]);

/**
 * 기준 HP 곡선에 지역 계수를 곱한다. **반올림은 `Math.round`(사사오입) 한 가지만 쓴다** —
 * 내림/올림을 섞으면 지역 간 실효 난이도 비율이 곡선 구간마다 미묘하게 달라진다.
 * 결과가 13개 전부 단조 증가인지는 `stages.test.ts`가 고정한다.
 */
export function scaleWaveHp(base: readonly number[], factor: number): readonly number[] {
  return base.map((hp) => Math.round(hp * factor));
}

/**
 * 웨이브별 기본 수입 배열을 만든다. 마지막 웨이브만 다른 값을 주는 경우가 있어
 * (R2: 13×12 + 14 = 170, R3: 11×12 + 13 = 145) 마지막 웨이브를 따로 받는다.
 */
function incomeTable(perWave: number, waveCount: number, lastWave = perWave): readonly number[] {
  return Array.from({ length: waveCount }, (_, i) => (i === waveCount - 1 ? lastWave : perWave));
}

const WAVE_COUNT_ALL = 13;

/** 전 지역 공통 시작 골드. 기본 포탑(120 G) 정확히 1기 — 2기째는 첫 청산 대금에서만 나온다. */
const STARTING_GOLD_ALL = 120;

/**
 * 웨이브당 AUM 드롭 총량 (FR-6.8-a). 개체당 드롭 = `floor(150 / 그 웨이브 적 수)`.
 *
 * ★ 이 상수가 여기(밸런스 표) 있는 이유 ★
 * 청산이 AUM을 되돌리지 않게 되면서 드롭은 **시작 지급분 외에 AUM이 들어오는 유일한 경로**가
 * 됐다. 따라서 `startingAum`과 한 세트로만 의미가 있고, 둘을 떼어 놓으면 세션 총 투입액 S가
 * 두 파일에 흩어진다. `combat/constants.ts`는 이 값을 재수출만 한다.
 *
 * ★ 150을 유지한 근거 ★
 * ① 스킬 `S-03`(서킷브레이커) 비용이 150 AUM이라 "실드 1회 = 웨이브 하나가 떨어뜨린 AUM
 *    전부"라는 읽기 쉬운 환율이 성립한다 — 이 환율은 `constants.ts` SKILL_SPECS의 설계 근거다.
 * ② R1 기준 드롭 총액 1,950은 세션 총 투입 3,950의 **49%**다. 즉 "전투로 버는 실탄이 매매
 *    자본의 절반"이라, 방어가 무너지면 매매도 같이 마른다는 되먹임이 R1에서 가장 강하게 걸린다.
 * ③ 올리면 `startingAum`을 그만큼 내려야 S가 유지되는데(게이트가 S를 고정한다), R1은
 *    시작 AUM이 2,000 밑으로 내려가면 10% 프리셋 투입액이 200 미만이 되어 초반 매매가
 *    유의미한 골드를 못 만든다. 내리면 반대로 전투→매매 되먹임이 약해진다.
 */
export const AUM_DROP_PER_WAVE = 150;

/**
 * 보스(B-03 마진콜 심판관) HP = **그 지역 마지막 웨이브 기본 HP × 이 배수**.
 *
 * ★ 3의 근거 — 시트에 있는 유일한 정량 서술이다 ★
 * 아트 프로덕션 시트 §07은 보스를 "일반 유닛 **3배 높이**"로만 규정한다. 밸런스 수치는
 * 어디에도 없으므로, 화면에서 3배로 보이는 것을 스탯에서도 3배로 읽는다 — 플레이어가
 * 그림을 보고 추정한 위협과 실제 위협이 어긋나지 않는 것이 밸런스 문서보다 중요하다.
 * 같은 3배 규칙이 피해량·본진 피해에도 적용된다(`constants.ts` BOSS_*).
 *
 * ★ 왜 절대값이 아니라 "마지막 웨이브 HP의 배수"인가 ★
 * 지역 난이도는 `waveTable.baseHp` 계수(R2 ×1.20 / R3 ×1.30 `[v1.5]`)가 전부 지고 있다.
 * 보스 HP를 절대값으로 박으면 R3에서만 보스가 상대적으로 물러진다. 배수로 두면 보스가 지역
 * 계수를 자동으로 타므로, **지역 간 비율이 보스를 넣기 전후로 보존된다** — 보스 HP가
 * 웨이브 HP 합의 +4.67%로 전 지역 공통이기 때문이다(900/19,255 · 1,080/23,106 · 1,170/25,056).
 * 지역 간 부하비로 확인하면 보스 제외 R2/R1 0.83526 · R3/R1 0.63538 → 보스 포함 0.83526 ·
 * 0.63535로, 반올림 자투리만큼만 어긋난다.
 *
 * ⚠️ 이 논증의 대상이 `[v1.5]`에서 바뀌었다. 예전에는 "`combatLoadPerGold` 램프의 비율"을
 * 지킨다는 서술이었으나 그 지표는 난이도 정의에서 물러났다(파일 머리말·해당 함수 주석).
 * 지금 배수 규칙이 지키는 것은 **총 적 HP 램프**(정의 ①)이며, 보스를 절대값으로 바꾸면
 * `totalEnemyHp`의 지역 간 간격이 곡선 구간마다 달라져 그 램프가 흔들린다.
 */
export const BOSS_HP_MULTIPLIER = 3;

export const STAGES: Readonly<Record<StageId, StageConfig>> = {
  R1: {
    id: 'R1',
    /**
     * **앵커.** 2,000은 PRD §9.2 `AUM_BY_DESK_LV` Lv1로 v1.0부터 한 번도 바뀐 적이 없고,
     * 스킬 `S-03` 비용(150 AUM)과 10%/25%/50% 투입 프리셋이 전부 이 값 위에서 설계됐다.
     * 그래서 R1만은 시작 AUM을 고정하고, 대신 `GOLD_CONVERSION`을 여기 맞춰 역산했다
     * (0.5032 → 0.50). S = 2,000 + 1,950 = 3,950.
     */
    startingAum: 2000,
    startingGold: STARTING_GOLD_ALL,
    baseIncomePerWave: incomeTable(15, WAVE_COUNT_ALL), // 총 195
    waveTable: {
      baseCount: WAVE_BASE_COUNT_ALL,
      baseHp: WAVE_BASE_HP_R1,
      airWaves: AIR_WAVES_ALL,
    },
    /**
     * 2,700 → 2,130 `[v1.4 재산출]`. ρ = 0 통과선에서 역산했다.
     * ```
     * requiredSpend = noTradeGold + S × DEPLOYMENT_ALLOWANCE × GOLD_CONVERSION
     *               = 315 + 3,950 × 0.92 × 0.50 = 2,132 → 2,130
     * ```
     * ⚠️ **필요지출이 내려갔다고 R1이 쉬워진 게 아니다.** 플레이어가 실제로 쥐는 골드도
     * 2,685(ρ=+20%) → 2,290(ρ=0)으로 같이 내려갔다. R1의 난이도 상승분은 **웨이브 HP 곡선을
     * 한 줄도 건드리지 않고 경제 개편에서 그대로 나온다** — 같은 총 적 HP를 17% 적은 골드로
     * 처리해야 한다(2,685 → 2,290).
     *
     * `[v1.5]` 수치를 갱신했다. 총 적 HP는 보스(B-03)가 실제 개체로 들어오면서 19,255 →
     * **20,155**(웨이브 합 19,255 + 보스 900)가 됐고, 골드당 적 HP는 7.51 → **8.80**이다.
     * 예전 주석이 적던 7.17 → 8.41은 보스를 빼고 센 값이라 실제 부하를 과소 보고했다.
     */
    requiredSpend: 2130,
    targetReturnRate: 0,
  },
  R2: {
    id: 'R2',
    /**
     * 2,400 → 4,050 `[v1.3 재산출]`. 게이트에서 역산한 값이다.
     * ```
     * 필요 S = (requiredSpend − 시작골드 − 기본수입) / ((1 + ρ) × GOLD_CONVERSION)
     *        = (4200 − 120 − 170) / (1.30 × 0.50) = 6,015
     * startingAum = 6,015 − 드롭 1,950 = 4,065 → 4,050 (S = 6,000, 50 단위로 정리)
     * ```
     * ★ `[v1.4]` 역산 방향이 뒤집혔다 ★ v1.3까지는 `requiredSpend`가 고정이고 `startingAum`이
     * 파생값이었다. 지금은 시작 AUM(= 플레이어가 실제로 쥐는 실탄, §9.2 `AUM_BY_DESK_LV`)을
     * 고정하고 **`requiredSpend`를 ρ=0 통과선에서 역산한다.** 목표 ρ가 상수 0이 된 이상
     * 게이트를 움직이는 자유도는 필요지출 쪽밖에 남지 않는다.
     *
     * ⚠️ R1(2,000)의 두 배가 된 것은 인플레가 아니라 **원금 재순환이 사라진 결과**다.
     * 예전에는 같은 2,400을 5~6회 굴려 S ≈ 13,080을 만들었지만, 이제 S는 받은 AUM 총액이
     * 전부이므로 같은 골드를 뽑으려면 실제로 그만큼을 쥐고 시작해야 한다.
     */
    startingAum: 4050,
    startingGold: STARTING_GOLD_ALL,
    baseIncomePerWave: incomeTable(13, WAVE_COUNT_ALL, 14), // 총 170
    waveTable: {
      baseCount: WAVE_BASE_COUNT_ALL,
      /**
       * ×1.55 → ×1.62 `[v1.4]` → **×1.20** `[v1.5]`. 지역 난이도 차등이 매매(ρ)에서 전투로
       * 넘어온 몫이며, 값 자체는 **비율 계산이 아니라 실측 스윕**에서 나왔다
       * (`tools/combat-sim/sweep.ts`).
       *
       * v1.4의 ×1.62는 `combatLoadPerGold`를 단조 증가시키려고 정한 값이었다. 그 지표가
       * 폐기되면서(파일 머리말 · GAME.md §19-9) 근거가 사라졌고, 같은 계산법으로 잡은 R3의
       * ×2.68이 클리어율 0%로 반증되면서 R2도 함께 실측으로 다시 뽑았다.
       *
       * 결과: 총 적 HP **24,186**(웨이브 합 23,106 + 보스 1,080), ρ=0 총골드 3,290 기준
       * 골드당 적 HP **7.35**. R1(8.80)보다 **낮다** — 지표가 난이도가 아니게 됐으므로 이
       * 방향은 정상이다. R2가 R1보다 어렵다는 근거는 ① 총 적 HP 20,155 < 24,186 ②
       * 실측 클리어율 0.368 → 0.211 둘이다.
       */
      baseHp: scaleWaveHp(WAVE_BASE_HP_R1, 1.20),
      airWaves: AIR_WAVES_ALL,
    },
    /** 4,200 → 3,050 `[v1.4]`. `290 + 6,000 × 0.92 × 0.50 = 3,050`. */
    requiredSpend: 3050,
    targetReturnRate: 0,
  },
  R3: {
    id: 'R3',
    /**
     * 2,800 → 6,900 `[v1.3 재산출]`. R2와 같은 역산이다.
     * ```
     * 필요 S = (6700 − 120 − 145) / (1.45 × 0.50) = 8,876
     * startingAum = 8,876 − 1,950 = 6,926 → 6,900 (S = 8,850)
     * ```
     * `[v1.4]` 시작 AUM은 그대로 두고 필요지출만 6,700 → 4,340으로 재산출했다(R2 주석의
     * 역산 방향 반전과 같다).
     *
     * 드롭 비중이 R1의 49%에서 22%로 내려간다 — 후반 지역일수록 "전투로 실탄을 번다"보다
     * "쥐고 시작한 자본을 **잃지 않고** 옮기느냐"가 지배적이 된다는 뜻이다. 강제청산 한 번의
     * 절대 손실이 R1의 3.5배라, 리스크 관리 실패의 대가도 지역이 올라갈수록 커진다.
     */
    startingAum: 6900,
    startingGold: STARTING_GOLD_ALL,
    baseIncomePerWave: incomeTable(11, WAVE_COUNT_ALL, 13), // 총 145
    waveTable: {
      baseCount: WAVE_BASE_COUNT_ALL,
      /**
       * ×2.40 → ×2.68 `[v1.4]` → **×1.30** `[v1.5]`. ★ 이 줄이 v1.5 밸런스 개정의 진원지다 ★
       *
       * v1.4는 "예산이 R1의 2.05배니 적 HP도 2.68배여야 공평하다"는 `combatLoadPerGold` 계산으로
       * ×2.68을 잡았다. 전투 시뮬레이터 실측은 정반대였다 — **×2.68의 R3는 모든 예산 · 모든
       * 로드아웃에서 클리어율 0%**다. 타워 슬롯이 6개로 고정이라 예산이 2배여도 방어는 2배가
       * 되지 않기 때문이며, 그래서 그 지표 자체가 난이도 정의에서 물러났다(GAME.md §19-9).
       *
       * 지금 값은 배율 스윕 실측에서 읽은 것이다(`tools/combat-sim/sweep.ts`). 결과:
       * 총 적 HP **26,226**(웨이브 합 25,056 + 보스 1,170), ρ=0 총골드 4,690 기준 골드당
       * 적 HP **5.59**로 세 지역 중 가장 낮다. **이 방향을 "고치려고" 계수를 다시 올리지 마라** —
       * 올리는 순간 R3가 클리어 불가로 되돌아간다(`stages.test.ts`가 감소 방향을 고정한다).
       *
       * R3가 가장 어렵다는 근거는 ① 총 적 HP 최대(26,226) ② 실측 클리어율 최소(0.158)다.
       */
      baseHp: scaleWaveHp(WAVE_BASE_HP_R1, 1.30),
      airWaves: AIR_WAVES_ALL,
    },
    /** 6,700 → 4,340 `[v1.4]`. `265 + 8,850 × 0.92 × 0.50 = 4,336 → 4,340`. */
    requiredSpend: 4340,
    /**
     * ★ +45% → 0 `[v1.4]`. RK-2가 **현실화됐고, 그래서 목표를 접었다.** ★
     *
     * 봇 시뮬레이터가 실제 장중 1분봉(마팅게일) 200판 × 7전략으로 판정한 결과,
     * R3 필요 ρ* +45.4%에 대해 최선 전략의 실측 ρ는 **+6.3%**였다(클리어율 41%).
     * 봇이 약해서가 아니다 — 마팅게일에서 `E[r] = 0`이면 어떤 정지 규칙을 써도
     * `E[ρ] ≤ −feeRate`가 성립하므로 현실적 상한은 ρ ≈ 0(±3%p)이다.
     *
     * 부족분은 전투로 이전했다: `WAVE_BASE_HP` ×2.40 → ×2.68 (PRD §16 결정 기록이
     * 반려 시 대안으로 예고해 둔 경로 그대로다). O-7(지역 난이도 대체 레버 부재)도 함께 닫힌다.
     *
     * ⚠️ `[v1.5]` **그 ×2.68은 되돌려졌다(현재 ×1.30).** 이전 자체는 유효하고 목표 ρ도 0
     * 그대로지만, "부족분 = 예산비만큼 적 HP를 올린다"는 산술이 실측에서 클리어율 0%로
     * 반증됐다. 이전량을 다시 잡은 근거는 위 `waveTable.baseHp` 주석에 있다.
     */
    targetReturnRate: 0,
  },
};

/** 스테이지 전체 기본 수입 총액. */
export function totalBaseIncome(stage: StageConfig): number {
  return stage.baseIncomePerWave.reduce((sum, income) => sum + income, 0);
}

/**
 * 세션 총 투입액 S = 시작 AUM + 드롭 총액.
 *
 * 청산이 AUM을 되돌리지 않으므로(FR-5.7) **세션 동안 굴릴 수 있는 총액은 세션 동안 받은
 * AUM 총액과 정확히 같다.** 부분 투입으로 나눠 굴려도 합계는 이 값을 넘지 못한다.
 *
 * ⚠️ 이건 **상한**이다. 스킬 `S-03`은 AUM을 태워 없애므로(시전 1회 −150) 실제 S는
 * 시전 횟수만큼 줄고, 웨이브를 놓쳐 적을 못 잡으면 드롭분도 그만큼 덜 들어온다.
 * 즉 아래 게이트 계산은 "완벽하게 전멸시키고 실드를 한 번도 안 쓴" 플레이 기준이다.
 */
export function sessionTotalStake(stage: StageConfig): number {
  return stage.startingAum + AUM_DROP_PER_WAVE * WAVE_COUNT_ALL;
}

/**
 * 매매를 **한 번도 하지 않았을 때**의 총골드 = 시작 골드 + 기본수입 총액.
 *
 * 예전에는 `totalGoldFor(stage, 0)`이 이 값이었다(골드가 pnl에서만 나왔으므로 ρ=0이면 0 유입).
 * 지금은 원금도 골드가 되므로 ρ=0은 "본전치기로 전액 전환"이라는 **전혀 다른 플레이**다 —
 * 두 개념을 반드시 분리해서 써라.
 */
export function noTradeGold(stage: StageConfig): number {
  return stage.startingGold + totalBaseIncome(stage);
}

/**
 * 총골드 = `noTradeGold + S × (1 + ρ) × GOLD_CONVERSION`.
 *
 * ρ는 세션 전체 가중 수익률(청산 pnl 합 / 총 투입액)이다. 원금까지 골드가 되므로 ρ는
 * **1 위에 얹히는 항**이고, 그래서 ρ 5%p 변화가 총골드를 약 5%만 움직인다 —
 * 원금-이익 분리 시절보다 게이트 대역이 구조적으로 좁다(`stages.test.ts` 주석 참고).
 */
export function totalGoldFor(stage: StageConfig, returnRate: number): number {
  return noTradeGold(stage) + sessionTotalStake(stage) * (1 + returnRate) * GOLD_CONVERSION;
}

/**
 * 이 스테이지를 클리어하기 위해 **실제로 필요한** ρ — 총골드 식을 ρ에 대해 푼 값.
 *
 * ```
 * 필요지출 = noTradeGold + S × (1 + ρ) × GOLD_CONVERSION
 * ρ* = (필요지출 − noTradeGold) / (S × GOLD_CONVERSION) − 1
 * ```
 *
 * `targetReturnRate`(= 0)는 **설계 의도**이고, 이 값은 **산술적 실패선**이다. 필요지출을
 * `DEPLOYMENT_ALLOWANCE`로 역산했으므로 둘은 정확히 그 여유만큼 벌어져 있다 —
 * v1.4 기준 ρ* ≈ **−8%**. "본전(0)이면 넉넉히 통과하고, −8% 아래로 태우면 못 넘는다"가
 * 이 두 숫자의 관계다.
 *
 * ⚠️ 이 식은 **S를 전액 투입했을 때**의 값이다. 소진율이 낮으면 실제 필요 ρ는 이보다 높다.
 */
export function gateReturnRate(stage: StageConfig): number {
  const capacity = sessionTotalStake(stage) * GOLD_CONVERSION;
  return (stage.requiredSpend - noTradeGold(stage)) / capacity - 1;
}

/**
 * 스테이지 전체에서 처치해야 하는 적 HP 총합 (heat = 1 기준).
 *
 * `Σ baseCount[w] × baseHp[w]` **+ 보스 HP**. 지역 난이도를 **한 숫자로** 비교할 수 있게
 * 하는 값이다. v1.4에서 지역 난이도 차등이 ρ에서 전투로 넘어왔고, `[v1.5]`에서 이 값이
 * **난이도 램프 정의 ①의 주인**이 됐다 — 이것이 R1 → R3로 단조 증가하는지가 곧 "지역이
 * 올라가면 깎아야 할 총량이 실제로 느는가"이며, `stages.test.ts`가 20,155 < 24,186 < 26,226을
 * 고정한다. (정의 ②는 실측 클리어율 단조 감소이고, 테스트가 아니라 `tools/combat-sim`이 잰다.)
 *
 * ⚠️ 예전에는 이 값에서 파생된 `combatLoadPerGold`(골드당 적 HP)가 램프의 정의였다.
 * 그 파생 지표만 폐기됐고, **총량 자체는 여전히 정의다** — 둘을 헷갈리지 마라.
 *
 * ★ 보스가 여기 들어가야 하는 이유 ★ 보스는 이제 연출이 아니라 **`enemies`로 스폰되는
 * 실제 개체**다(`waves.ts`). 총 적 HP에서 빠지면 이 지표가 "실제로 깎아야 하는 HP"를
 * 과소 보고하게 되고, 그러면 지역 난이도 램프가 근거를 잃는다.
 */
export function totalEnemyHp(stage: StageConfig): number {
  const { baseCount, baseHp } = stage.waveTable;
  const waves = baseHp.reduce((sum, hp, index) => sum + hp * (baseCount[index] ?? 0), 0);
  return waves + bossHpOf(stage);
}

/**
 * 이 지역 보스의 HP (heat = 1 기준). 보스는 **마지막 웨이브**에 등장하므로
 * (`identity.ts` BOSS_IDENTITY.appearWave = WAVE_COUNT) 그 웨이브의 기본 HP를 기준으로 잡는다 —
 * 웨이브 번호를 여기에 다시 적지 않기 위해 배열의 마지막 원소를 쓴다.
 */
export function bossHpOf(stage: StageConfig): number {
  const { baseHp } = stage.waveTable;
  return (baseHp[baseHp.length - 1] ?? 0) * BOSS_HP_MULTIPLIER;
}

/**
 * 골드 1점당 처리해야 하는 적 HP. 분모는 목표 ρ(= 0)에서의 총골드, 즉 "손실 없이 전액
 * 전환했을 때 손에 쥐는 골드"다.
 *
 * ★★ `[v1.5]` 이 지표는 **지역 난이도 정의에서 폐기됐다** — 참고 수치로만 남는다 ★★
 *
 * v1.4는 이 값이 R1 → R3로 단조 증가하는 것을 "전투가 지역 난이도를 진다"의 정의로 삼고
 * 거기 맞춰 계수를 잡았다(8.41 / 9.48 / 11.00, R2 ×1.62 / R3 ×2.68). 그 정의는 **골드가
 * 방어로 선형 변환된다**는 가정 위에 서 있었고, 전투 시뮬레이터가 그것을 반증했다:
 *
 *   타워 슬롯은 6개로 고정이다(`TOWER_SLOTS`). 6기를 Lv2까지 채우는 비용은 지역과 무관하게
 *   같고(약 1,800 G), 그 지점을 넘어선 골드는 효율이 낮은 유닛으로만 흘러간다. 즉
 *   **여분 골드의 한계 효용이 급격히 떨어져** "예산이 2.05배니 적 HP도 2.68배"가 성립하지
 *   않는다. 실측에서 ×2.68의 R3는 **모든 예산 · 모든 로드아웃에서 클리어율 0%**였다.
 *
 * 그래서 계수를 실측 스윕으로 다시 뽑았고(R2 ×1.20 / R3 ×1.30), 그 결과 이 값은
 * **8.80 / 7.35 / 5.59로 단조 감소한다.** ⚠️ 이건 버그가 아니라 지표 폐기의 귀결이며,
 * `stages.test.ts`가 감소 방향을 회귀 방어선으로 고정한다 — **증가로 "고치면" R3가 클리어
 * 불가로 되돌아간다.** 지금 램프의 정의는 ① 총 적 HP 단조 증가 ② 실측 클리어율 단조 감소
 * (`tools/combat-sim`) 둘이다. GAME.md §19-9 참고.
 */
export function combatLoadPerGold(stage: StageConfig): number {
  return totalEnemyHp(stage) / totalGoldFor(stage, stage.targetReturnRate);
}
