# D. 과제 링크 → 완성 코드 프로젝트

`/study <과제 링크>` 로 들어온 경우. 과제 페이지를 읽고 IntelliJ 에 새 프로젝트를 만들어 **완성 코드**를 넣은 뒤, A 흐름으로 이어서 그 코드를 읽는 학습 계획을 세운다. 사용자에게 묻지 않고 끝까지 자동으로 진행한다 (막힐 때만 묻는다).

## 경로·도구 (고정)

| 항목 | 값 |
|---|---|
| 브라우저 | Claude in Chrome (`mcp__claude-in-chrome__*`). 도구가 지연 로드 상태면 `tabs_context_mcp, navigate, get_page_text, computer, tabs_close_mcp` 를 ToolSearch 한 번으로 로드 |
| 프로젝트 폴더 | `C:/Users/sgosp/IdeaProjects/<프로젝트명>` |
| 템플릿 프로젝트 | `C:/Users/sgosp/IdeaProjects/Tdd` (Gradle Kotlin DSL + 래퍼, JUnit 6 + AssertJ) |
| JDK | `C:/Users/sgosp/.jdks/ms-25.0.4.1` (`java` 가 PATH 에 없음 → `JAVA_HOME` 지정) |
| IntelliJ | `C:/Program Files/JetBrains/IntelliJ IDEA 2026.2.3/bin/idea64.exe` |

## D1 — 과제 페이지 읽기

1. Chrome 으로 링크를 열고 `get_page_text` 로 본문을 읽는다. 로그인 화면이 나오면 사용자에게 Chrome 에서 로그인해 달라고 하고 턴을 끝낸다 (비밀번호 입력 금지).
2. 다음을 뽑아 정리한다:
   - **설명**: 할 일, 이어서 만드는 이전 과제(예: "①에서 이어서"), 테스트 목록(식·결과)
   - **규칙**: 금지 사항(예: Stack 금지, 재귀 필수, 하드코딩 금지), 진행 방식
   - **작성할 파일**: 구현 클래스·메서드 시그니처, 테스트 파일 경로
   - **제공 코드**: "파일로 저장 / 복사" 블록의 테스트 코드 (그대로 보존해야 함)
   - **체크리스트**: 필수 항목 전부
   - 마감일, 제출 형식, 현재 상태(미통과·시도 수)
3. 이전 과제를 이어서 만드는 문제여도 새 프로젝트에 **처음부터 끝까지 동작하는** 코드를 만든다 (이전 테스트도 모두 통과해야 하므로).
4. 다 읽었으면 연 탭을 닫는다.
5. 사용자에게 3~5줄로 요약해 보여준다. 규칙에 "AI 정답 코드 금지" 같은 문구가 있으면 한 줄로 알린다: **"이 코드는 읽고 이해하는 학습용이에요. 제출은 직접 짠 코드로 하세요."** 제출(업로드·GitHub 연결)은 하지 않는다.

## D2 — 프로젝트 만들기

1. **프로젝트명**: `p<문제번호>-<영문 짧은 이름>` (예: `p29-calc-priority`). 같은 폴더가 있으면 `-2`, `-3` 을 붙인다 (기존 폴더는 절대 덮어쓰지 않음).
2. 템플릿에서 **빌드 파일만** 복사한다: `gradlew`, `gradlew.bat`, `gradle/wrapper/`, `build.gradle.kts`, `.gitignore`. (`src`, `.idea`, `.gradle`, `build`, `.git` 은 복사하지 않음)
3. `settings.gradle.kts` 는 `rootProject.name = "<프로젝트명>"` 으로 새로 쓴다. 과제가 지정한 패키지가 템플릿의 `group` 과 다르면 `build.gradle.kts` 의 `group` 을 맞춘다. 과제가 다른 의존성을 요구하면 추가한다.
4. 과제가 지정한 경로에 파일을 만든다:
   - 테스트: 제공 테스트 코드를 **한 글자도 바꾸지 않고** 그대로 저장.
   - 구현: 아래 D3 기준으로 작성.

## D3 — 완성 코드 작성 기준

- 규칙·체크리스트를 **전부** 지킨다 (금지된 자료구조·하드코딩 금지·필수 기법 등). 테스트 통과만으로 끝내지 않는다.
- 특정 입력에만 맞춘 분기 없이 일반화된 로직.
- 학습용이므로 읽기 쉽게: 메서드를 역할별로 작게 나누고, 이름으로 의도가 보이게 한다. 주석은 "왜"가 필요한 곳에만 짧게.
- 사용자의 학습 패턴(`topics/<slug>.md`)에 자주 틀리는 유형이 있으면 그 부분을 특히 분명하게 쓴다 (예: substring 시작 위치는 변수로 이름 붙이기).

## D4 — 검증

1. 테스트 실행 (빌드 출력은 길므로 ctx_execute 로 요약만 본다):
   ```bash
   cd C:/Users/sgosp/IdeaProjects/<프로젝트명> && JAVA_HOME=C:/Users/sgosp/.jdks/ms-25.0.4.1 ./gradlew test --console=plain
   ```
   결과는 `build/test-results/test/TEST-*.xml` 의 `tests`·`failures`·`errors` 로 확인한다.
2. 실패하면 원인을 고치고 다시 실행한다. **테스트 파일은 고치지 않는다.** 5번 넘게 실패하면 멈추고 현재 상태를 사용자에게 알린다.
3. 체크리스트를 한 줄씩 대조해 ✅/❌ 로 표시한다 (예: Stack 미사용은 Grep 으로 `Stack|Deque` 확인).
4. `git init` 후 첫 커밋 (`완성 코드: <과제명>`). 원격 연결·푸시는 하지 않는다.

## D5 — IntelliJ 로 열기

1. IntelliJ 실행 여부 확인: `tasklist //FI "IMAGENAME eq idea64.exe"` (Bash) 또는 `Get-Process idea64` (PowerShell).
2. **꺼져 있으면**: `Start-Process "<idea64.exe>" '"<프로젝트 경로>"'`.
3. **켜져 있으면**: 스크래치패드에 경로를 **하드코딩한** `.cmd` 를 만들고 explorer 로 실행 (샌드박스 해제 필요):
   ```
   @echo off
   start "" "C:\Program Files\JetBrains\IntelliJ IDEA 2026.2.3\bin\idea64.exe" "C:\Users\sgosp\IdeaProjects\<프로젝트명>"
   ```
   `Start-Process explorer.exe '"<그 .cmd 경로>"'` — `%~1` 같은 인자는 쓰지 않는다 (explorer 는 인자를 넘기지 않음).
4. 사용자에게 IntelliJ 창이 열렸는지, Gradle 동기화 후 테스트가 초록인지 확인해 달라고 한 줄로 부탁한다.

## D6 — 학습 계획으로 이어가기

1. A 흐름의 **A1(진도 확인) → A2 → A3** 를 수행한다. 주제는 보통 기존 주제(예: Java)이고, 별칭으로 확인한다.
2. **A4 는 건너뛴다** — 자료는 과제 페이지 + 방금 만든 프로젝트.
3. **A6 학습 순서 추천**은 테스트 묶음 단위로 단계를 나누고, 각 단계는 "완성 코드의 어느 메서드를 읽는가"로 쓴다. 마지막 직전 단계는 핵심 부분 10분 직접 짜기, 마지막 단계는 제출 (마감일 표시).
4. `진행 중 계획`의 자료 줄에 과제 링크와 프로젝트 경로를 함께 적는다:
   `- 자료: <과제명> (<링크>) — 코드: C:/Users/sgosp/IdeaProjects/<프로젝트명> — 마감 <날짜>`
5. 출력 맨 위에 과제 요약(D1)과 검증 결과(테스트 n/n 통과, 체크리스트 ✅ 개수)를 붙인다.
6. 끝나면 [진도 저장].
