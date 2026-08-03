/**
 * 이벤트 → 소리 판정 — **순수 함수만 있다.** `AudioContext`도 `window`도 모른다.
 *
 * ★ 이 파일이 "무엇을 언제 울릴지"를 소유한다 ★ 재생층(`engine.ts`)은 여기서 나온 결정을
 * 실행만 한다. 그래서 소리 없이도 이 판정 전체가 헤드리스로 검증된다
 * (`src/weather/classify.ts`·`src/ground/advance.ts`와 같은 자리다).
 *
 * ⚠️ **여기에 볼륨·음소거를 넣지 마라.** 그건 설정의 관심사이고(`settings.ts`),
 * 섞이면 "음소거 상태에서 무엇이 울릴 뻔했는가"를 테스트할 수 없게 된다.
 */

import type {
  CombatAudioFrame,
  DyingEntity,
  GameEvent,
  GameSoundId,
  TradeCloseReason,
} from './types';

/** 아무 일도 없는 틱이 돌려주는 **같은 참조**. 프레임당 할당 0 규율(§17-2). */
const NO_EVENTS: readonly GameEvent[] = [];

/**
 * 이벤트 하나를 소리 하나로. 울릴 것이 없으면 `null`.
 *
 * ★ 여러 이벤트가 같은 소리로 모일 수 있다 ★ 그래서 이벤트 유니온과 소리 유니온이 1:1이
 * 아니다 — 이벤트는 게임의 사실이고 소리는 연출의 어휘다. 지금 합쳐진 것:
 * `unresolved` 결말은 패배와 같은 소리를 쓴다(둘 다 "못 끝냈다"는 사실이다).
 */
export function soundForEvent(event: GameEvent): GameSoundId | null {
  switch (event.kind) {
    case 'trade-open':
      return 'trade-open';
    case 'trade-add':
      return 'trade-add';
    case 'trade-close':
      return soundForClose(event.reason, event.pnl);
    case 'tower-build':
      return 'tower-build';
    case 'tower-upgrade':
      return 'tower-upgrade';
    case 'unit-summon':
      return 'unit-summon';
    case 'tower-fire':
      return 'tower-fire';
    case 'enemy-down':
      return event.boss ? 'boss-down' : 'enemy-down';
    case 'base-hit':
      // 0 피해는 실드가 막은 경우다(`shieldWasActive`). 막힌 타격은 피격이 아니다.
      return event.damage > 0 ? 'base-hit' : null;
    case 'skill-cast':
      return soundForSkill(event.skill);
    case 'wave-start':
      return 'wave-start';
    case 'boss-appear':
      return 'boss-appear';
    case 'prep-tick':
      return 'prep-tick';
    case 'stage-end':
      return event.outcome === 'cleared' ? 'stage-cleared' : 'stage-defeated';
  }
}

/**
 * 청산 3분기 — **강제 청산이 먼저다.**
 *
 * 강제 청산은 손실이지만 손실 청산과 같은 소리를 내면 안 된다. 사람이 고른 결과가 아니라
 * 시장이 밀어낸 결과이고, 화면도 그 둘을 다른 문구로 구분한다(`announceClose`).
 * 그래서 `reason`을 `pnl`보다 먼저 본다 — 순서를 뒤집으면 경고음이 영영 나지 않는다.
 */
function soundForClose(reason: TradeCloseReason, pnl: number): GameSoundId {
  if (reason === 'liquidated') return 'trade-liquidated';
  return pnl > 0 ? 'trade-close-profit' : 'trade-close-loss';
}

/** 스킬 3종. `S-03`만 다른 톤인 이유는 `catalog.ts`의 `skill-shield` 주석에 있다. */
function soundForSkill(skill: 'S-01' | 'S-02' | 'S-03'): GameSoundId {
  switch (skill) {
    case 'S-01':
      return 'skill-bomb';
    case 'S-02':
      return 'skill-heal';
    case 'S-03':
      return 'skill-shield';
  }
}

/**
 * 타워가 이번 프레임에 **쐈는가** — 쿨다운이 늘어난 슬롯을 센다.
 *
 * ★ 왜 이렇게 판정하는가 ★ `CombatEvents`에는 발사 이벤트가 없다. 그런데 발사는
 * `mechanics.ts`에서 "쏘면 `cooldownMs`를 `TOWER_COOLDOWN_MS`로 되채운다"로 구현돼 있고,
 * 쏘지 않는 프레임에는 `max(0, cooldown - dt)`로 **단조 감소**한다. 따라서 **증가 = 발사**가
 * 정확한 판정이다. 전투 모듈에 이벤트를 추가하지 않고도 소리를 낼 수 있다는 뜻이며,
 * 이것이 오디오가 `src/combat`을 건드리지 않는 이유다.
 *
 * ⚠️ 한 프레임에 여러 서브스텝이 돌면 두 번 쏜 것이 한 번으로 보일 수 있다. 그래도
 * 상관없다 — 어차피 `tower-fire`는 `minGapMs = 130`으로 묶여 있어 초당 7.7회가 상한이다.
 *
 * 슬롯이 없어진 경우(재시작 등)는 발사로 세지 않는다.
 */
export function countTowerFires(
  previous: CombatAudioFrame,
  next: CombatAudioFrame,
): number {
  let fired = 0;
  for (const tower of next.towers) {
    const before = previous.towers.find((candidate) => candidate.slot === tower.slot);
    if (before !== undefined && tower.cooldownMs > before.cooldownMs) {
      fired += 1;
    }
  }
  return fired;
}

/**
 * 전투 한 프레임 → 울릴 이벤트 목록. **아무 일도 없으면 같은 빈 배열 참조를 돌려준다.**
 *
 * ★ 전부 상태의 **차분**이다 ★ 본진 피격은 `baseHp` 감소분이고(실드가 막았으면 감소가
 * 없어 자동으로 무음이다), 웨이브 시작은 `wave` 증가다. 이벤트 필드를 손으로 옮겨 적는
 * 경로가 없으므로 전투 스펙이 늘어나도 여기가 조용히 틀어지지 않는다(§19-10).
 *
 * ⚠️ **감소만 본다.** 판이 새로 시작되면 `baseHp`가 0 → 100으로 **오르고** `wave`는
 * 13 → 0으로 **떨어진다**. 부호를 검사하지 않으면 그 순간 피격음과 웨이브 시작음이
 * 동시에 터진다. 셸은 세션을 새로 만들 때 기준 프레임도 함께 갈아 끼운다.
 *
 * 순서에 의미가 있다: 보스 등장 · 웨이브 시작이 먼저고, 발사처럼 잦은 것이 뒤다.
 * 동시 재생 상한에 걸렸을 때 **먼저 들어온 것이 자리를 잡기 때문**이다.
 *
 * 처치는 **개체 수만큼** 이벤트를 낸다. 억제는 판정이 아니라 `throttle.ts`의 일이다 —
 * 여기서 미리 줄이면 "몇 마리가 죽었는가"라는 사실 자체가 사라진다.
 */
export function diffCombatEvents(
  previous: CombatAudioFrame,
  next: CombatAudioFrame,
  deaths: readonly DyingEntity[],
): readonly GameEvent[] {
  const fires = countTowerFires(previous, next);
  const bossAppeared = !previous.hasBoss && next.hasBoss;
  const waveStarted = next.wave > previous.wave ? next.wave : null;
  const baseDamage = Math.max(0, previous.baseHp - next.baseHp);

  if (!bossAppeared && waveStarted === null && baseDamage <= 0 && deaths.length === 0 && fires === 0) {
    return NO_EVENTS;
  }

  const out: GameEvent[] = [];
  if (bossAppeared) out.push({ kind: 'boss-appear' });
  if (waveStarted !== null) out.push({ kind: 'wave-start', wave: waveStarted });
  if (baseDamage > 0) out.push({ kind: 'base-hit', damage: baseDamage });
  for (const death of deaths) {
    // 아군 유닛의 죽음은 울리지 않는다. 유닛은 소모품(FR-6.5)이라 매 웨이브 여러 기가
    // 죽는데, 그것까지 소리를 내면 처치음과 뒤섞여 전황이 오히려 안 읽힌다.
    if (death.kind === 'unit') continue;
    out.push({ kind: 'enemy-down', boss: death.kind === 'boss' });
  }
  for (let index = 0; index < fires; index += 1) {
    out.push({ kind: 'tower-fire' });
  }
  return out;
}

/**
 * 준비 카운트다운의 **초 눈금** — 남은 시간을 올림한 정수.
 *
 * 5.0초 → 5, 4.3초 → 5, 4.0초 → 4 … 0이면 준비 구간이 아니다. 셸은 이 값이 **바뀔 때만**
 * `prep-tick`을 낸다. 프레임 수(초당 60)가 아니라 초 단위로 울리게 하는 유일한 장치다.
 *
 * ⚠️ 배속을 올리면 눈금도 빨라진다 — `prepRemainingMs`가 이미 배속이 반영된 값이기 때문이다.
 * `prep-tick`의 `minGapMs = 400`이 4x에서 틱이 뭉치는 것을 막는다.
 */
export function prepTickIndex(prepRemainingMs: number): number {
  if (!Number.isFinite(prepRemainingMs) || prepRemainingMs <= 0) return 0;
  return Math.ceil(prepRemainingMs / 1_000);
}
