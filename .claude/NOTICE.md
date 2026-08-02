# 출처 및 라이선스

이 디렉터리의 `skills/`와 `agents/` 파일은 아래 프로젝트에서 가져왔습니다.

- 원본: https://github.com/Donchitos/Claude-Code-Game-Studios
- 라이선스: MIT (Copyright (c) Donchitos)
- 가져온 시점: 2026-08-01 (원본 main 브랜치, 최종 push 2026-05-21)

원본 73개 스킬 / 49개 에이전트 중 **웹게임(Vite + TypeScript)에 해당하는 것만 선별**했습니다.
Godot / Unity / Unreal 전용 에이전트 30여 개와 라이브옵스·현지화·커뮤니티 계열은 제외했습니다.

## 설치된 스킬 (30개)

| 분류 | 스킬 |
|---|---|
| 기획 | `brainstorm` `quick-design` `design-review` `scope-check` `balance-check` |
| 컨셉·아트 | `art-bible` `asset-spec` `consistency-check` |
| 구조·고도화 | `map-systems` `architecture-review` `architecture-decision` `tech-debt` `perf-profile` |
| 개발 흐름 | `create-epics` `create-stories` `story-readiness` `dev-story` `story-done` `vertical-slice` |
| UX | `ux-design` `ux-review` |
| QA | `qa-plan` `bug-report` `bug-triage` `smoke-check` `regression-suite` `playtest-report` |
| 운영 | `sprint-plan` `retrospective` `release-checklist` |

## 설치된 에이전트 (20개)

`creative-director` `technical-director` `producer`
`game-designer` `systems-designer` `economy-designer` `level-designer` `ux-designer`
`narrative-director` `world-builder` `writer` `art-director`
`lead-programmer` `gameplay-programmer` `ui-programmer` `ai-programmer` `prototyper`
`qa-lead` `qa-tester` `performance-analyst`

## 일부러 설치하지 않은 것

- `code-review` — Claude Code 기본 `/code-review` 및 ECC `code-reviewer` 에이전트와 겹침
- `design-system` — 사용자 전역 ECC 스킬과 이름 충돌
- `adopt` `reverse-document` `project-stage-detect` — 신규 편입용. 이 프로젝트는 이미 구조가 잡혀 불필요
- 엔진·라이브옵스·현지화·커뮤니티 계열 전체

## 알려진 제약

1. **미설치 에이전트 참조가 남아 있음** — 일부 스킬이 아래 에이전트를 언급하지만 설치하지 않았습니다.
   해당 단계에서는 Claude가 에이전트를 찾지 못하고 직접 처리합니다. 필요해지면 원본에서 받아오세요.
   - `network-programmer` (2개 스킬) — 멀티플레이 없으면 불필요
   - `narrative-director` (2개 스킬)
   - `audio-director` (1개 스킬)
   - `engine-programmer` (1개 스킬) — Godot/Unity/Unreal 전용

2. **엔진 전제가 남아 있는 스킬 3개** — `brainstorm`, `dev-story`, `smoke-check`가 Godot/Unity/Unreal을
   전제로 한 절차를 포함합니다. 이 프로젝트는 Vite + TS 웹게임이므로 해당 부분은 무시하거나
   프로젝트에 맞게 수정해서 쓰세요.

3. **훅은 설치하지 않음** — 원본의 훅 12개는 전부 bash 스크립트이고 `.claude/settings.json`에
   전역으로 물립니다. 커밋/에셋 검증용인데 이 프로젝트 규칙과 맞지 않아 제외했습니다.

4. **에이전트 frontmatter의 `model:` 값이 하드코딩** — `opus` / `sonnet`이 파일마다 박혀 있습니다.
   모델 세대가 바뀌면 손봐야 합니다.

## 권장 사용 순서

```
/brainstorm      컨셉 잡기
/quick-design    GDD 초안
/design-review   기획 검토
/scope-check     범위 점검
/create-epics    개발 단위로 분해
/create-stories  스토리 작성
/dev-story       구현
/balance-check   수치 밸런싱
/playtest-report 플레이테스트 정리
```
