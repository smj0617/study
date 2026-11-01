# study 스킬 평가

규칙을 바꾼 뒤 스킬이 실제로 그렇게 움직이는지 확인한다. 실제 진도 파일(`progress/`)은 건드리지 않고 `fixtures/progress` 사본으로만 돌린다.

## 1. 계산 규칙 테스트 (자동)

```bash
node C:/Users/sgosp/.claude/skills/study/evals/script-tests.js
```

`scripts/progress.js` 의 계수·간격·상태 전이·복습 순서·양식 검사·통과율 계산을 확인한다. 스킬 파일이나 스크립트를 고칠 때마다 돌린다.

## 2. 흐름 시나리오 (서브에이전트)

[scenarios.md](scenarios.md) 의 시나리오마다 Claude 가 Agent(general-purpose)를 하나씩 띄워 확인한다.

1. 픽스처를 스크래치패드로 복사한다: `cp -r C:/Users/sgosp/.claude/skills/study/evals/fixtures/progress <스크래치패드>/eval-<번호>/progress` (시나리오에 "준비"가 있으면 사본을 그렇게 고친다).
2. Agent 에게 이렇게 맡긴다:
   > `C:/Users/sgosp/.claude/skills/study/SKILL.md` 와 거기서 가리키는 파일을 읽어라. 진도 폴더는 `<사본 경로>` 라고 보고, 스크립트는 `--root <사본 경로> --date 2026-11-10` 을 붙여 실행해라. 아래 상황에서 Claude 가 학습자에게 보낼 메시지와 실행할 명령을 순서대로 적어라. 학습자 답은 시나리오에 적힌 대로라고 가정한다. git 커밋·푸시는 하지 않는다.
3. 결과를 시나리오의 **기대** 항목과 한 줄씩 대조해 통과/실패 표로 정리한다.

돌리는 때: 규칙 고정 기간이 끝날 때(`progress/rule-backlog.md` 의 날짜), 그리고 흐름 규칙을 크게 바꾼 뒤.

## 3. 효과 지표

```bash
node C:/Users/sgosp/.claude/skills/study/scripts/progress.js stats
```

잘 되고 있다는 신호:
- 복습이 실제로 돌아간다 — 복습 실행 횟수가 늘고, 7일 넘게 밀린 개념이 0에 가깝다.
- 복습 통과율이 대략 80~90% — 간격 복습 도구들은 보통 90% 안팎을 목표로 한다. 너무 높으면 문항이 쉽거나 간격이 짧고, 너무 낮으면 간격이 길다.
- 오개념·확신 오류 표시가 시간이 지나며 줄어든다.
- 확인 전 개념이 쌓이지 않는다 (복습 빈자리로 소화된다).
- 평균 계수가 1.3 근처로 몰리지 않는다 (몰리면 문항이 너무 어렵거나 첫 학습이 부족하다는 뜻).
