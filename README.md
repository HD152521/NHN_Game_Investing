# TICKER FRONT

> 정체를 가린 실제 과거 거래일 차트를 읽어 전쟁 자금을 만들고, 그 돈으로 일자형 타워디펜스 웨이브를 막아 지역을 점령하고, 클리어 후 그것이 어떤 회사의 어느 날이었는지 알게 되는 게임.
>
> — PRD §1.1

웹 (데스크톱 우선, 모바일 웹 대응) · Vite + TypeScript

---

## 문서

| 문서 | 내용 |
|---|---|
| [`docs/PRD_TICKER-FRONT_MVP.md`](docs/PRD_TICKER-FRONT_MVP.md) | MVP 범위·기능요구·마일스톤. **범위 판단의 최종 근거** |
| [`docs/아트가이드_프롬프트시트.md`](docs/아트가이드_프롬프트시트.md) | 확정 스타일(파이낸셜 느와르), 팔레트, 34개 에셋 프롬프트 원본 |
| [`docs/PLAN-art-production.md`](docs/PLAN-art-production.md) | 아트 에셋 생산 계획. STEP 0~12, 게이트 A/B/C |
| `docs/archive/` | 이 프로젝트와 **무관한** 이전 게임 기획서 (오늘의 던전 / 마켓 디펜스). 참고용 보관 |

---

## 폴더 구조

```
assets/
  raw/       AI 생성 원본 PNG (마젠타 #FF00FF 배경 그대로)
             ★ 절대 삭제·수정 금지. 키잉을 다시 해야 할 일이 반드시 생깁니다
  cut/       마젠타 키잉·라인업 분할이 끝난 PNG (알파 포함)
  atlas/     아틀라스 패킹 결과 + 매니페스트 JSON — 빌드 산출물이므로 git 미추적
  prompts/   실제 사용한 프롬프트 전문 (재현용)
  review/    조립 검수 이미지 (예: battle-mock-v1.png)

src/                    게임 소스
tools/asset-pipeline/   에셋 후처리 파이프라인 (키잉 · 분할 · baseline 정렬 · 패킹)
docs/                   기획·아트 문서
```

### `assets/prompts/` 의 4개 스타일 앵커

아트가이드 PART 3 · R8 에서 **글자 하나 바꾸지 않고** 발췌해 고정한 파일입니다.

| 파일 | 용도 |
|---|---|
| `_STYLE-CORE.txt` | 모든 프롬프트에 붙임 |
| `_STYLE-SPRITE.txt` | 유닛·타워·건물에 추가 |
| `_STYLE-BG.txt` | 배경 레이어에 추가 |
| `_NEGATIVE.txt` | 네거티브 프롬프트 |

> **매번 타이핑하지 말고 이 파일을 복붙하세요.**
> 문장을 조금씩 손대는 것(R1 위반)이 스타일 붕괴의 1순위 원인입니다.
> — PLAN STEP 0

---

## 이미지 에셋이 아직 없는 이유

`assets/raw/`, `assets/cut/`, `assets/atlas/` 는 현재 **비어 있습니다** (`.gitkeep` 만 존재).

이미지 생성은 자동화된 빌드 단계가 아니라 **별도의 수작업 단계**입니다.
GPT Image / Flux / Midjourney / Ideogram 에 프롬프트를 넣고, 결과를 눈으로 판정하고,
게이트를 통과할 때까지 반복해야 하기 때문에 코드로 대체할 수 없습니다.

생산 순서는 [`docs/PLAN-art-production.md`](docs/PLAN-art-production.md) 를 따릅니다.
특히 **GATE-A (STEP 1, `E-01` 아군 유닛 3종)** 를 통과하기 전에는
다른 에셋을 뽑지 마세요. 스타일이 안 맞는 에셋 50장을 뽑고 버리는 것보다
캐릭터 1장을 20번 재생성하는 쪽이 빠릅니다.

그 전까지 게임 코드는 플레이스홀더 도형으로 진행합니다.
교체 비용을 낮추려면 `tools/asset-pipeline/` (STEP 8) 을 앞당기세요.

---

## 개발

Node 22+ / npm 10+

```bash
npm install
```

| 명령 | 설명 |
|---|---|
| `npm run dev` | Vite 개발 서버 (기본 http://localhost:5173) |
| `npm run build` | 타입체크 후 `dist/` 로 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 로컬 서빙 |
| `npm test` | Vitest 1회 실행 |
| `npm run test:coverage` | 커버리지 리포트 (목표 80%+) |
| `npm run typecheck` | `tsc --noEmit` 타입체크만 |

TypeScript 는 `strict` + `noUncheckedIndexedAccess` 로 설정되어 있습니다.

---

## 주의

- `assets/raw/` 를 "정리"하면서 삭제하지 마세요. 커밋 대상입니다 (용량이 커지면 git LFS 전환).
- 애니메이션을 AI로 뽑지 마세요. 정적 스프라이트 1장 + 코드 변형입니다 (아트가이드 R5 / PLAN STEP 10).
- 색은 하드코딩하지 말고 팔레트 토큰을 참조하세요. 색약 모드(FR-13.1)가 같은 토큰을 스위칭합니다 (PLAN STEP 9).
- 기업 로고·상표를 닮은 형태가 에셋에 섞이지 않았는지 확인하세요 (PRD §13 C3, PLAN STEP 11-7).
