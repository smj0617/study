# study

수준 맞춤 학습 순서 추천 + 학습진도 관리용 Claude Code 스킬.

## 명령어

| 명령어 | 용도 |
|---|---|
| `/study <자료>` | 자료(PDF·텍스트·웹페이지·유튜브)를 분석해 현재 수준에 맞는 학습 순서 추천 |
| `/study <과제 링크>` | codemit 과제를 Chrome 으로 읽고 IntelliJ 에 완성 코드 프로젝트 생성 → 테스트 검증 → 코드 읽기 학습 계획 |
| `/study` | 진도 확인 + 복습 알림, 이어서 자료 요청 |
| `/study done` | 설명해보기 + 퀴즈로 오늘 공부한 내용을 확인하고 진도 갱신 |
| `/study review` | 복습일이 된 개념만 퀴즈로 복습 |

## 구성

- `SKILL.md` — 실행 흐름
- `assignment.md` — 과제 링크 흐름 (페이지 읽기 → 프로젝트 생성 → 검증 → IntelliJ 열기)
- `progress-rules.md` — 진도 관리 규칙 (상태 전이, 복습 간격, 압축/펼치기)
- `progress/` — 학습진도 데이터 (`index.md`, `topics/`, `archive/`). 첫 `/study` 실행 시 생성됨

## 설치 위치

`C:/Users/sgosp/.claude/skills/study/` — 이 폴더 자체가 저장소이며, Claude Code 가 여기서 스킬을 읽는다.

## 자동 저장

각 흐름(`/study`, `done`, `review`)이 끝나면 `progress/` 변경만 자동으로 커밋하고 푸시한다. 스킬 파일 수정은 직접 커밋한다.
