/**
 * 셸 핸들러의 **판정 부분**만 모아 둔 순수 함수 묶음.
 *
 * ★ 이 파일이 존재하는 이유 ★
 * 이 프로젝트 vitest 에는 jsdom 이 없다. 그래서 "버튼을 누르면 실제로 무슨 일이 일어나는가"가
 * CI 에서 한 번도 검증된 적이 없었고, click-path 감사가 찾아낸 결함 5건이 전부 그 사각에
 * 살아남았다. DOM 배선(`stage.ts`)은 얇게 두고, **상태 전이 판정은 전부 여기로 내려** 테스트로
 * 고정한다. 여기 있는 함수는 DOM·시계·전역 상태를 만지지 않는다.
 */

import type { CombatPhase } from '../combat';
import type { StageOutcome } from './settlement';
import { resolveStageOutcome } from './settlement';

/**
 * 한 프레임의 끝에서 셸이 해야 할 일.
 *
 * ★ `reset`이라는 선택지가 없다는 점이 이 타입의 핵심이다 ★
 * 예전 셸은 재생이 끝난 프레임에 `seed += 1; session = null`을 실행해 지갑·타워·웨이브를
 * 통째로 버렸다(CLICK-PATH-001). 배너도 로그도 없었고, 방금 만들어진 정산 골드와
 * `pendingNotice`까지 함께 사라졌다. 결과를 화면에 내보내지 않고 판을 버리는 경로는
 * 이제 타입 수준에서 존재하지 않는다.
 */
export type FrameDecision =
  /** 평소 프레임. 전투·차트가 계속 흐른다. */
  | { readonly kind: 'run' }
  /** 재생이 끝난 **바로 그 프레임**. 강제 청산(FR-8.1) + 연출 소비 + 연장 시작. */
  | { readonly kind: 'close-market' }
  /** 장은 마감됐고 전투만 남았다. 매매는 잠기고 전투는 계속 진행한다. */
  | { readonly kind: 'overtime' }
  /** 결과 확정. 반드시 결과 화면을 띄운다. */
  | { readonly kind: 'finish'; readonly outcome: StageOutcome };

export interface FrameInput {
  readonly phase: CombatPhase;
  /** `Replay.tick(...).finished` — 390초(배속 반영) 재생이 끝났는가. */
  readonly replayFinished: boolean;
  /** 이미 장 마감 처리를 했는가(같은 프레임을 두 번 처리하지 않기 위한 래치). */
  readonly marketClosed: boolean;
  /** 장 마감 후 전투에 허용된 잔여 연장 시간(ms). */
  readonly overtimeRemainingMs: number;
  /** 지금 사옥 체력. 연장이 끝났을 때 승패를 가르는 값이다(`resolveStageOutcome` 주석). */
  readonly baseHp: number;
}

/**
 * 프레임 종료 시점의 판정.
 *
 * ★ 시계 비대칭을 여기서 흡수한다 ★
 * 전투 dt 는 `MAX_FRAME_DT_MS`(250ms)로 잘리지만 리플레이는 절대 벽시계다. 탭 전환·히치가
 * 있으면 전투가 재생보다 **뒤처진 채** 390초를 맞는다. 즉 "재생 종료 = 전투 종료"는
 * 애초에 성립할 수 없는 등식이었다. 그래서 재생 종료를 **장 마감**으로만 해석하고
 * (매매만 닫는다), 전투는 스스로 `cleared`/`defeated`에 도달할 때까지 연장에서 계속 돈다.
 */
export function decideFrame(input: FrameInput): FrameDecision {
  const outcome = resolveStageOutcome({
    phase: input.phase,
    marketClosed: input.marketClosed,
    overtimeRemainingMs: input.overtimeRemainingMs,
    baseHp: input.baseHp,
  });
  if (outcome !== null) {
    return { kind: 'finish', outcome };
  }
  if (!input.marketClosed && input.replayFinished) {
    return { kind: 'close-market' };
  }
  if (input.marketClosed) {
    return { kind: 'overtime' };
  }
  return { kind: 'run' };
}

// ── 배속 버튼 (CLICK-PATH-002) ──────────────────────────────

export interface SpeedChangeInput {
  readonly requested: number;
  readonly current: number;
  /** 직전 클릭으로 예고된 배속. 아직 적용되지 않았다. */
  readonly armed: number | null;
  readonly hasSession: boolean;
}

export interface SpeedChangeResult {
  readonly speed: number;
  readonly armed: number | null;
  /** 지금 판을 버리고 새 스테이지를 시작하는가. */
  readonly restart: boolean;
  readonly message: string;
}

/**
 * 배속 버튼 클릭 판정 (FR-3.5 "배속은 진행 중 바뀌지 않는다").
 *
 * 예전 핸들러는 `speed = …; session = null`을 **아무 안내 없이** 실행했다. 웨이브 10에서
 * 4x 를 누르면 지갑·타워·웨이브가 전부 사라지고 화면에는 아무 것도 남지 않았다.
 *
 * 버튼을 그냥 비활성화하지 않은 이유: 배속 컨트롤은 시작 게이트 뒤에 있어 **플레이 중에만
 * 손이 닿는다.** 비활성으로 막으면 배속을 영영 바꿀 수 없다. 그래서 파괴를 없애는 대신
 * **두 번 눌러야 적용되는 예고**로 바꿨다 — 첫 클릭은 무슨 일이 벌어질지 말하고,
 * 두 번째 클릭이 동의다.
 */
export function resolveSpeedChange(input: SpeedChangeInput): SpeedChangeResult {
  if (!input.hasSession) {
    return {
      speed: input.requested,
      armed: null,
      restart: false,
      message: `배속 ${input.requested}x`,
    };
  }

  if (input.requested === input.current) {
    return { speed: input.current, armed: null, restart: false, message: `배속 ${input.current}x` };
  }

  if (input.armed !== input.requested) {
    return {
      speed: input.current,
      armed: input.requested,
      restart: false,
      message: `배속 ${input.requested}x 는 진행 중 적용되지 않습니다 — 한 번 더 누르면 지금 판을 버리고 새 스테이지를 시작합니다`,
    };
  }

  return {
    speed: input.requested,
    armed: null,
    restart: true,
    message: `배속 ${input.requested}x — 새 스테이지를 시작합니다`,
  };
}

// ── Space 준비 종료 (CLICK-PATH-005) ───────────────────────

/** Space 키를 받은 시점의 포커스 대상 분류. */
export type FocusKind = 'none' | 'button' | 'text-field';

export interface PrepSkipInput {
  readonly hasSession: boolean;
  readonly prepRemainingMs: number;
  readonly focusKind: FocusKind;
  /**
   * 포커스가 **키보드로** 들어왔는가 (`:focus-visible`).
   *
   * 마우스로 버튼을 누른 뒤 남은 포커스와, Tab 으로 이동해 온 포커스는 전혀 다른 상황이다.
   * 전자에서 Space 를 버튼에 양보하면 "화면이 Space 로 바로 시작이라고 말하는데 안 먹는"
   * 상태가 된다 — 준비 5초는 정확히 빌드바 버튼을 누르는 구간이라 거의 항상 이 상태다.
   */
  readonly keyboardFocused: boolean;
}

/**
 * Space 로 준비 시간을 즉시 끝낼지 판정한다.
 *
 * 예외를 **실제로 Space 가 필요한 대상**으로 좁힌다:
 * - 텍스트/폼 컨트롤 — Space 는 입력 문자다. 절대 가로채지 않는다.
 * - 키보드 포커스를 받은 버튼 — Space 가 그 버튼의 활성화 키다. 가로채면 접근성 회귀다.
 * - 마우스 클릭으로 포커스만 남은 버튼 — **가로챈다.** 이게 정상 동선이다.
 */
export function shouldSkipPrep(input: PrepSkipInput): boolean {
  if (!input.hasSession || input.prepRemainingMs <= 0) {
    return false;
  }
  if (input.focusKind === 'text-field') {
    return false;
  }
  if (input.focusKind === 'button' && input.keyboardFocused) {
    return false;
  }
  return true;
}

// ── 실패를 성공이라 말하지 않기 (CLICK-PATH-003 / LOW) ──────

/**
 * 재화 소모 액션의 로그 한 줄.
 *
 * `upgrade`/`build`/`summon`은 골드가 모자라면 **조용히 실패**하는데, 셸은 무조건 성공
 * 로그를 찍고 있었다(CLICK-PATH-003). 성공/실패를 같은 함수에서 만들어 두 문구가 어긋날
 * 수 없게 한다.
 */
export function formatActionLog(input: {
  readonly ok: boolean;
  readonly verb: string;
  readonly displayName: string;
  readonly cost: number;
}): string {
  if (input.ok) {
    return `${input.displayName} ${input.verb} (${input.cost}G)`;
  }
  return `골드 부족 — ${input.displayName} ${input.verb}에 ${input.cost}G 필요`;
}

/**
 * ── 스테이지 이탈 요청 (나가기) ──────────────────────────────────
 *
 * ★★ 왜 두 번 눌러야 하는가 ★★
 * 이 프로젝트에서 **무음 리셋은 CLICK-PATH-001 CRITICAL 결함**이었다. 진행 중인 판이
 * 아무 말 없이 사라지는 경로를 전부 없애고 *"정산 화면이 스테이지가 끝나는 유일한 경로"*로
 * 못박았다. 나가기 버튼은 그 경로를 **다시 여는 일**이므로, 그냥 달면 같은 결함이 부활한다.
 *
 * 그래서 배속 변경(CLICK-PATH-002)과 **같은 2단계 확인**을 쓴다: 첫 클릭은 경고만 띄우고
 * 두 번째 클릭이 동의다. 이미 이 코드베이스가 쓰는 관습이라 사용자가 새로 배울 것이 없다.
 *
 * ⚠️ 이탈은 **정산을 남기지 않는다** — 진행도·도감·자본금이 기록되지 않는다.
 * 그 사실을 경고 문구가 반드시 말해야 한다. "나가시겠습니까?"만으로는 무엇을 잃는지 모른다.
 */
export interface ExitRequestInput {
  /** 굴러가는 세션이 있는가. 없으면 버릴 것도 없다. */
  readonly hasSession: boolean;
  /** 직전 클릭으로 이미 경고를 띄웠는가. */
  readonly armed: boolean;
  /** 결과 화면이 떠 있는가 — 이미 정산이 끝났으므로 잃을 것이 없다. */
  readonly resultShown: boolean;
}

export interface ExitRequestResult {
  /** 지금 나가는가. */
  readonly exit: boolean;
  /** 다음 클릭을 위해 경고 상태를 유지하는가. */
  readonly armed: boolean;
  readonly message: string;
}

/** 이탈 경고 — **무엇을 잃는지** 말한다. */
export const EXIT_WARNING = '진행 중인 판이 사라집니다 (정산·도감 없음). 다시 누르면 나갑니다';
export const EXIT_LABEL = '나가기';

export function resolveExitRequest(input: ExitRequestInput): ExitRequestResult {
  // 버릴 진행이 없으면 확인을 물을 이유가 없다 — 확인이 잦으면 사용자가 읽지 않게 된다.
  if (!input.hasSession || input.resultShown) {
    return { exit: true, armed: false, message: '' };
  }
  if (!input.armed) {
    return { exit: false, armed: true, message: EXIT_WARNING };
  }
  return { exit: true, armed: false, message: '' };
}
