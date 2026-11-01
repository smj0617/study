'use strict';
// scripts/progress.js 의 계산 규칙 테스트 (progress-rules.md §2). 실행: node evals/script-tests.js
// 테스트마다 fixtures/progress 를 임시 폴더에 복사해 쓰므로 실제 진도 파일은 건드리지 않는다.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'progress.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'progress');
const DATE = '2026-11-10';
let failed = 0;

function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-eval-'));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

function run(root, ...args) {
  return execFileSync(process.execPath, [SCRIPT, ...args, '--root', root, '--date', DATE], { encoding: 'utf8' });
}

function topicLines(root) {
  return fs.readFileSync(path.join(root, 'topics', 'sample.md'), 'utf8').split('\n');
}

function find(root, name) {
  const lines = topicLines(root);
  const i = lines.findIndex(l => l.startsWith(`- ${name} [`) || l.startsWith(`- ${name} (`));
  if (i < 0) return { line: null, section: null };
  let section = null;
  for (let k = i; k >= 0; k--) {
    const m = lines[k].match(/^## (.+)$/);
    if (m) { section = m[1]; break; }
  }
  return { line: lines[i], section };
}

function test(title, fn) {
  try {
    fn(fresh());
    console.log(`✓ ${title}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${title}\n    ${e.message}`);
  }
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

test('due: 확신 오류 → 설명 누락 → 오래 밀린 순, 같은 묶음은 섞기', root => {
  const names = run(root, 'due', 'sample').split('\n')
    .filter(l => /^\d+\. /.test(l))
    .map(l => l.replace(/^\d+\. \[[^\]]+\] /, '').split(' — ')[0]);
  expect(names[0] === '학습 확신오류', `첫째가 확신 오류 개념이어야 함: ${names}`);
  expect(names[1] === '익힘 누락', `둘째가 설명 누락 개념이어야 함: ${names}`);
  expect(names[2] === '학습 진단', `셋째가 가장 오래 밀린 개념이어야 함: ${names}`);
  expect(!names.includes('학습 미래'), '복습일이 안 된 개념은 빠져야 함');
  expect(names.length === 6, `도래 6개여야 함: ${names.length}`);
});

test('학습 중 + 확실 + 설명 통과 → 익힘 1일, 확신 오류 2/2 로 지움', root => {
  run(root, 'apply', 'sample', '학습 확신오류', '확실', '--explained');
  const { line, section } = find(root, '학습 확신오류');
  expect(section === '익힘', `익힘으로 옮겨야 함: ${section}`);
  expect(line.includes('통과 0회 · 간격 1일 · 계수 2.6 · 다음 2026-11-11'), line);
  expect(!line.includes('확신 오류'), `확신 오류 표시가 지워져야 함: ${line}`);
  expect(line.includes('오개념[실행 순서]'), '오개념 메모는 그대로 남아야 함');
});

test('학습 중 + 확실 이지만 설명 통과 없음 → 학습 중 유지', root => {
  const out = run(root, 'apply', 'sample', '학습 진단', '확실');
  const { section, line } = find(root, '학습 진단');
  expect(section === '학습 중', section);
  expect(line.includes('진단 확인'), '진단 확인은 익힘으로 올라갈 때만 지움');
  expect(out.includes('--explained'), '왜 안 올라갔는지 알려야 함');
});

test('익힘 간격 21일 확실 통과 → 정착, 간격 = 21 × 새 계수', root => {
  run(root, 'apply', 'sample', '익힘 21일', '확실');
  const { line, section } = find(root, '익힘 21일');
  expect(section === '정착', section);
  expect(line.includes('통과 4회 · 간격 61일 · 계수 2.9 · 다음 2027-01-10'), line);
});

test('설명 누락이 남아 있으면 정착 보류', root => {
  const out = run(root, 'apply', 'sample', '익힘 누락', '확실');
  const { line, section } = find(root, '익힘 누락');
  expect(section === '익힘', section);
  expect(line.includes('간격 55일 · 계수 2.6'), line);
  expect(out.includes('정착 보류'), out);
});

test('정답 + 찍음 → 같은 간격, 확신 낮음, 계수 −0.14 (계수 없으면 2.5 에서)', root => {
  run(root, 'apply', 'sample', '익힘 1일', '찍음');
  const { line } = find(root, '익힘 1일');
  expect(line.includes('확신 낮음 · 통과 0회 · 간격 1일 · 계수 2.36 · 다음 2026-11-11'), line);
});

test('정착 + 틀림 → 익힘 0회 7일, 계수 −0.32', root => {
  run(root, 'apply', 'sample', '정착 개념', '틀림');
  const { line, section } = find(root, '정착 개념');
  expect(section === '익힘', section);
  expect(line.includes('통과 0회 · 간격 7일 · 계수 2.38 · 다음 2026-11-17'), line);
});

test('확실이라 답하고 틀림 → 확신 오류(0/2), 학습 중 3일', root => {
  run(root, 'apply', 'sample', '학습 진단', '틀림', '--sure');
  const { line } = find(root, '학습 진단');
  expect(line.includes('확신 오류(0/2)'), line);
  expect(line.includes('계수 2.18 · 다음 2026-11-13'), line);
});

test('나중에 볼 목록의 확인 전 개념 → 학습 중으로 옮겨 판정', root => {
  run(root, 'apply', 'sample', '확인전 개념', '애매');
  const { line, section } = find(root, '확인전 개념');
  expect(section === '학습 중', section);
  expect(line.includes('[묶음: 응용 · 사실 · 깊이 미판정 · 확신 낮음 · 계수 2.5 · 다음 2026-11-13]'), line);
  expect(find(root, '안배움 개념').section === '나중에 볼 목록', '안 배운 항목은 남아야 함');
});

test('apply 뒤 index 다음 복습이 다시 계산됨', root => {
  run(root, 'apply', 'sample', '학습 진단', '애매');
  const index = fs.readFileSync(path.join(root, 'index.md'), 'utf8');
  expect(index.includes('| 2026-11-08 |'), `가장 이른 다음(익힘 1일의 11-08)이어야 함:\n${index}`);
});

test('check: 픽스처는 오류 없음, 다음 날짜가 빠지면 오류', root => {
  const ok = run(root, 'check', 'sample');
  expect(!ok.includes('✗'), ok);
  const file = path.join(root, 'topics', 'sample.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(' · 다음 2026-11-20', ''));
  let threw = false;
  try { run(root, 'check', 'sample'); } catch (e) { threw = e.stdout.includes('다음 날짜 없음'); }
  expect(threw, 'check 가 실패 코드와 함께 "다음 날짜 없음"을 알려야 함');
});

test('stats: 복습 로그에서 통과율 계산', root => {
  const out = run(root, 'stats', 'sample');
  expect(out.includes('복습 실행: 1회 · 통과율 75% (3/4)'), out);
});

console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
