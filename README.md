# study

수준 맞춤 학습 순서 추천 + 학습진도 관리용 Claude Code 스킬.

## 명령어

| 명령어 | 용도 |
|---|---|
| `/study <자료>` | 자료(PDF·텍스트·웹페이지·유튜브)를 분석해 현재 수준에 맞는 학습 순서 추천 |
| `/study <과제 링크>` | codemit 과제를 Chrome 으로 읽고 IntelliJ 에 완성 코드 프로젝트 생성 → 테스트 검증 → 코드 읽기 학습 계획 |
| `/study` | 진도 확인 + 복습 알림, 진행 중 계획 이어서 하기 또는 자료 요청 |
| `/study done` | 설명해보기 + 퀴즈 1문항으로 오늘 공부한 내용을 확인하고 진도 갱신 (최대 5개) |
| `/study review` | 복습일이 된 개념만 퀴즈로 복습 (한 번에 최대 5개) |

## 구성

- `SKILL.md` — 분기, 설명 원칙, 문항 규칙, 답하기 전 점검, 규칙 변경, 진도 저장 (매번 읽음)
- `flows/` — 흐름별 절차 (그 흐름에 들어갈 때만 읽음)
  - `plan.md` A 학습 순서 추천 · `done.md` B 진도 갱신 · `review.md` C 복습 · `assignment.md` D 과제 → 완성 코드 프로젝트 · `session.md` E 학습 진행
- `progress-rules.md` — 진도 관리 규칙 (양식, 상태 전이, 쉬움 계수(SM-2) 간격, 표시, 영역별 실력)
- `compression.md` — 압축·펼치기 규칙 (정착 개념이 쌓였을 때만 읽음)
- `scripts/progress.js` — 날짜·간격·계수·복습 순서·index·양식 검사 계산 (인자 없이 실행하면 사용법)
- `evals/` — 계산 규칙 테스트(`script-tests.js`), 흐름 시나리오(`scenarios.md`), 효과 지표 기준
- `progress/` — 학습진도 데이터 (`index.md`, `topics/`, `archive/`, `rule-backlog.md`). 첫 `/study` 실행 시 생성됨

## 복습 알림 훅

`~/.claude/settings.json` 의 `SessionStart` 훅이 `scripts/progress.js remind --json` 을 실행해, 복습할 개념이 있으면 세션 시작 때 한 줄로 알린다.

## 설치 위치

`C:/Users/sgosp/.claude/skills/study/` — 이 폴더 자체가 저장소이며, Claude Code 가 여기서 스킬을 읽는다.

## 자동 저장

각 흐름(`/study`, `done`, `review`)이 끝나면 `progress/` 변경만 자동으로 커밋하고 푸시한다. 스킬 파일 수정은 직접 커밋한다.
