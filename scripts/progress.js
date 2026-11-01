#!/usr/bin/env node
'use strict';
// study 진도 계산 도구. 날짜·간격·쉬움 계수·정렬·형식 검사처럼 정해진 계산만 맡는다.
// 설명 평가·오개념 기록 같은 판단은 Claude 가 하고, 그 결과를 apply 로 넘긴다. 규칙: progress-rules.md §2·§7

const fs = require('fs');
const path = require('path');

const USAGE = `사용법: node progress.js <명령> [인자] [--date YYYY-MM-DD] [--root <progress 폴더>]
  due [slug]                 복습일이 된 개념을 우선순위대로 (slug 없으면 주제별 요약)
  apply <slug> <개념> <결과> [--explained] [--sure] [--depth <깊이>] [--dry]
                             결과: 확실 | 애매 | 찍음 | 틀림 | 오개념
                             --explained 설명해보기 통과(틀린 내용 없음) · --sure 확실이라 답하고 틀림
  sync-index <slug> [--studied]   index 행 다시 계산 (--studied: 마지막 학습 = 오늘)
  check [slug] [--fix]       양식 검사 (--fix: 빠진 계수 2.5 채우기)
  stats [slug]               효과 확인 지표
  remind [--json]            세션 시작 훅용 한 줄 알림`;

const STATE_SECTIONS = ['압축됨', '정착', '익힘', '학습 중'];
const LATER = '나중에 볼 목록';
const REQUIRED_SECTIONS = ['영역별 실력', '진행 중 계획', ...STATE_SECTIONS, LATER, '학습 패턴', '세션 메모', '최근 로그'];
const KINDS = ['사실', '개념', '절차'];
const DEPTHS = ['깊이 미판정', '표면', '심층', '전이'];
const RESULT_Q = { 확실: 5, 애매: 4, 찍음: 3, 틀림: 2, 오개념: 1 };
const DEFAULT_EF = 2.5;
const MIN_EF = 1.3;
const MAX_INTERVAL = 120;
const LEARNING_INTERVAL = 3;

const RE = {
  pass: /^통과 (\d+)회$/,
  interval: /^간격 (\d+)일$/,
  ef: /^계수 (\d+(?:\.\d+)?)$/,
  next: /^다음 (\d{4}-\d{2}-\d{2})$/,
  bundle: /^묶음: (.+)$/,
  lowConf: /^확신 낮음$/,
  confErr: /^확신 오류\((\d)\/2\)$/,
  learned: /^배움 \d{4}-\d{2}-\d{2}$/,
  unchecked: /^확인 전$/,
  tail: /^(최근 출제|원문):/,
};
const NUMERIC_ORDER = [RE.pass, RE.interval, RE.ef, RE.next];

// ---------- 공통 ----------

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
}

// b - a (일)
function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

function formatEf(ef) {
  return Number.isInteger(Math.round(ef * 100) / 10) ? ef.toFixed(1) : ef.toFixed(2);
}

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const key = a.slice(2);
    if (['date', 'root', 'depth'].includes(key)) opt[key] = argv[++i];
    else opt[key] = true;
  }
  return { pos, opt };
}

// ---------- 파일 읽기·쓰기 ----------

function loadTopic(root, slug) {
  const file = path.join(root, 'topics', `${slug}.md`);
  if (!fs.existsSync(file)) die(`topic 파일 없음: ${file}`);
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  return { slug, file, lines };
}

function sectionRanges(lines) {
  const out = {};
  let cur = null;
  lines.forEach((l, i) => {
    const m = l.match(/^## (.+?)\s*$/);
    if (!m) return;
    if (cur) out[cur].end = i;
    cur = m[1];
    out[cur] = { start: i, end: lines.length };
  });
  return out;
}

function sectionBody(lines, name) {
  const r = sectionRanges(lines)[name];
  if (!r) return null;
  return lines.slice(r.start + 1, r.end).filter(l => l.trim() !== '');
}

function parseConcept(line) {
  if (!line.startsWith('- ')) return null;
  const m = line.match(/ \[(?=묶음:|통과 |계수 |아직 안 배움)/);
  if (!m) return null;
  const close = line.indexOf(']', m.index);
  if (close < 0) return null;
  return {
    name: line.slice(2, m.index),
    fields: line.slice(m.index + 2, close).split(' · ').map(s => s.trim()).filter(Boolean),
    rest: line.slice(close + 1),
  };
}

function formatConcept(c) {
  return `- ${c.name} [${c.fields.join(' · ')}]${c.rest}`;
}

function conceptsIn(t, names) {
  const ranges = sectionRanges(t.lines);
  const out = [];
  for (const name of names) {
    const r = ranges[name];
    if (!r) continue;
    for (let i = r.start + 1; i < r.end; i++) {
      const c = parseConcept(t.lines[i]);
      if (c) out.push({ ...c, section: name, index: i });
    }
  }
  return out;
}

function insertIntoSection(lines, name, line) {
  const r = sectionRanges(lines)[name];
  if (!r) die(`섹션 없음: ## ${name}`);
  let at = r.start + 1;
  for (let i = r.start + 1; i < r.end; i++) if (lines[i].trim() !== '') at = i + 1;
  if (lines[at - 1] === '- 없음') lines[at - 1] = line;
  else lines.splice(at, 0, line);
}

function ensurePlaceholder(lines, name) {
  const r = sectionRanges(lines)[name];
  if (!r) return;
  const hasItem = lines.slice(r.start + 1, r.end).some(l => l.trim() !== '');
  if (!hasItem) lines.splice(r.start + 1, 0, '- 없음');
}

function topicSlugs(root) {
  const file = path.join(root, 'index.md');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .map(l => l.match(/\|\s*topics\/([a-z0-9-]+)\.md\s*\|/))
    .filter(Boolean)
    .map(m => m[1]);
}

// ---------- 개념 줄 필드 ----------

const findIdx = (c, re) => c.fields.findIndex(f => re.test(f));

function getNum(c, re) {
  const i = findIdx(c, re);
  return i < 0 ? null : Number(c.fields[i].match(re)[1]);
}

function getNext(c) {
  const i = findIdx(c, RE.next);
  return i < 0 ? null : c.fields[i].match(RE.next)[1];
}

function setField(c, re, value) {
  const i = findIdx(c, re);
  if (value == null) {
    if (i >= 0) c.fields.splice(i, 1);
    return;
  }
  if (i >= 0) { c.fields[i] = value; return; }
  let at = c.fields.length;
  for (let k = NUMERIC_ORDER.indexOf(re) + 1; k < NUMERIC_ORDER.length; k++) {
    const j = findIdx(c, NUMERIC_ORDER[k]);
    if (j >= 0) { at = j; break; }
  }
  const tail = findIdx(c, RE.tail);
  if (tail >= 0 && tail < at) at = tail;
  c.fields.splice(at, 0, value);
}

// 표시는 숫자 칸(통과·간격·계수·다음) 앞에 둔다
function addFlag(c, flag) {
  if (c.fields.includes(flag)) return;
  const at = c.fields.findIndex(f => NUMERIC_ORDER.some(re => re.test(f)) || RE.tail.test(f));
  c.fields.splice(at < 0 ? c.fields.length : at, 0, flag);
}

function removeFlag(c, re) {
  c.fields = c.fields.filter(f => !re.test(f));
}

function setDepth(c, depth) {
  const di = c.fields.findIndex(f => DEPTHS.includes(f));
  if (di >= 0) { c.fields[di] = depth; return; }
  const ki = c.fields.findIndex(f => KINDS.includes(f));
  c.fields.splice(ki >= 0 ? ki + 1 : 1, 0, depth);
}

const kindOf = c => c.fields.find(f => KINDS.includes(f)) || null;
const depthOf = c => c.fields.find(f => DEPTHS.includes(f)) || null;
const bundleOf = c => { const i = findIdx(c, RE.bundle); return i < 0 ? null : c.fields[i].match(RE.bundle)[1]; };
const shortName = c => c.name.split(' (')[0];
const hasMisconception = c => c.rest.includes('오개념[');
const hasMissing = c => c.rest.includes('설명 누락:');
const needsWhy = c => ['개념', '절차'].includes(kindOf(c)) && ['표면', '깊이 미판정'].includes(depthOf(c));

// ---------- 계산 규칙 (progress-rules.md §2) ----------

// SM-2: EF' = EF + (0.1 − (5−q)(0.08 + (5−q)·0.02)), 최소 1.3
function nextEf(ef, q) {
  const d = 5 - q;
  return Math.max(MIN_EF, Math.round((ef + 0.1 - d * (0.08 + d * 0.02)) * 100) / 100);
}

// 확실 통과로 간격을 늘릴 때: 1일 → 3일 → 이전 간격 × 계수 (최대 120일)
function grow(prev, ef) {
  if (!prev || prev < 1) return 1;
  if (prev === 1) return 3;
  return Math.min(MAX_INTERVAL, Math.round(prev * ef));
}

function priority(c) {
  if (findIdx(c, RE.confErr) >= 0) return 0;
  if (hasMisconception(c)) return 1;
  if (hasMissing(c)) return 2;
  return 3;
}

// ---------- 명령: due ----------

function dueList(t, date) {
  const list = conceptsIn(t, STATE_SECTIONS)
    .filter(c => { const n = getNext(c); return !n || n <= date; })
    .map(c => ({ ...c, overdue: getNext(c) ? diffDays(getNext(c), date) : null }))
    .sort((a, b) => priority(a) - priority(b) || (b.overdue ?? 999) - (a.overdue ?? 999));
  // 같은 묶음이 연달아 나오지 않게, 같은 우선순위 안에서만 자리를 바꾼다
  for (let i = 1; i < list.length; i++) {
    if (bundleOf(list[i]) !== bundleOf(list[i - 1])) continue;
    const j = list.findIndex((x, k) => k > i && priority(x) === priority(list[i]) && bundleOf(x) !== bundleOf(list[i - 1]));
    if (j > 0) [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function earliestNext(t) {
  const dates = conceptsIn(t, STATE_SECTIONS).map(getNext).filter(Boolean).sort();
  return dates[0] || null;
}

function uncheckedCount(t) {
  return conceptsIn(t, [LATER]).filter(c => findIdx(c, RE.unchecked) >= 0).length;
}

function cmdDue(root, slug, opt) {
  const date = opt.date || fmt(new Date());
  if (!slug) {
    let any = false;
    for (const s of topicSlugs(root)) {
      const t = loadTopic(root, s);
      const list = dueList(t, date);
      if (!list.length) continue;
      any = true;
      console.log(`${s}: ${list.length}개 (가장 오래 ${Math.max(...list.map(c => c.overdue ?? 0))}일 지남)`);
    }
    if (!any) console.log('복습할 개념 없음');
    return;
  }
  const t = loadTopic(root, slug);
  const list = dueList(t, date);
  if (!list.length) {
    console.log(`복습할 개념 없음 — 가장 가까운 복습일: ${earliestNext(t) || '없음'}`);
  } else {
    list.forEach((c, i) => {
      const tags = [kindOf(c), depthOf(c)].filter(Boolean);
      if (needsWhy(c)) tags.push('왜 문항');
      const ce = c.fields.find(f => RE.confErr.test(f));
      if (ce) tags.push(ce);
      if (hasMisconception(c)) tags.push('오개념');
      if (hasMissing(c)) tags.push('설명 누락');
      for (const f of ['확신 낮음', '진단 확인', '사용자 정정']) if (c.fields.includes(f)) tags.push(f);
      const when = c.overdue == null ? '다음 날짜 없음' : `${c.overdue}일 지남`;
      console.log(`${i + 1}. [${c.section}] ${shortName(c)} — ${when} · ${tags.join(' · ')}`);
    });
  }
  const unchecked = uncheckedCount(t);
  if (unchecked) console.log(`확인 전 개념 (나중에 볼 목록): ${unchecked}개`);
}

// ---------- 명령: apply ----------

function cmdApply(root, slug, query, result, opt) {
  if (!slug || !query || !result) die(USAGE);
  if (!(result in RESULT_Q)) die(`결과는 ${Object.keys(RESULT_Q).join(' | ')} 중 하나`);
  if (opt.depth && !DEPTHS.includes(opt.depth)) die(`깊이는 ${DEPTHS.join(' | ')} 중 하나`);
  const t = loadTopic(root, slug);
  const all = conceptsIn(t, [...STATE_SECTIONS, LATER])
    .filter(c => c.section !== LATER || findIdx(c, RE.unchecked) >= 0);
  const exact = all.filter(c => c.name === query || shortName(c) === query);
  const cands = exact.length ? exact : all.filter(c => c.name.startsWith(query));
  if (!cands.length) die(`개념을 찾지 못함: ${query}`);
  if (cands.length > 1) die(`여러 개념이 맞음 — 더 길게 적어 주세요:\n${cands.map(c => `  - ${c.name}`).join('\n')}`);

  const c = cands[0];
  const date = opt.date || fmt(new Date());
  const from = c.section;
  let state = from;
  if (state === LATER) {
    // 확인 전 개념을 처음 확인 → 학습 중 줄로 바꿔서 판정
    removeFlag(c, RE.learned);
    removeFlag(c, RE.unchecked);
    if (!depthOf(c)) setDepth(c, '깊이 미판정');
    state = '학습 중';
  }

  const q = RESULT_Q[result];
  const efBefore = getNum(c, RE.ef) ?? DEFAULT_EF;
  const ef = nextEf(efBefore, q);
  let passes = getNum(c, RE.pass);
  let interval = getNum(c, RE.interval);
  const correct = q >= 3;
  const notes = [];

  if (result === '확실') {
    removeFlag(c, RE.lowConf);
    const ci = findIdx(c, RE.confErr);
    if (ci >= 0) {
      const n = Number(c.fields[ci].match(RE.confErr)[1]) + 1;
      if (n >= 2) { c.fields.splice(ci, 1); notes.push('확신 오류 표시 지움 (2/2)'); }
      else c.fields[ci] = `확신 오류(${n}/2)`;
    }
  } else if (correct) {
    addFlag(c, '확신 낮음');
  }
  if (!correct && opt.sure) {
    removeFlag(c, RE.confErr);
    addFlag(c, '확신 오류(0/2)');
  }

  let to = state;
  switch (state) {
    case '학습 중':
      if (result === '확실' && opt.explained) {
        to = '익힘';
        passes = 0;
        interval = 1;
        removeFlag(c, /^진단 확인$/);
        removeFlag(c, /^사용자 정정$/);
      } else if (result === '확실') {
        notes.push('설명해보기 통과(--explained) 없이는 익힘으로 올리지 않음');
      }
      break;
    case '익힘':
      if (result === '확실') {
        const before = interval || 1;
        passes = (passes || 0) + 1;
        interval = grow(before, ef);
        if (before >= 21) {
          if (findIdx(c, RE.confErr) < 0 && !hasMissing(c)) to = '정착';
          else notes.push('정착 보류: 확신 오류·설명 누락 표시가 남아 있음');
        }
      } else if (!correct) {
        to = '학습 중';
      }
      break;
    case '정착':
      if (result === '확실') {
        passes = (passes || 0) + 1;
        interval = grow(interval || 1, ef);
      } else if (result === '틀림') {
        to = '익힘';
        passes = 0;
        interval = 7;
      } else if (result === '오개념') {
        to = '학습 중';
      }
      break;
    case '압축됨':
      if (!correct) die('압축 줄을 틀림 → compression.md "펼치기"를 따른다 (자동 변경 안 함)', 2);
      if (result === '확실') {
        passes = (passes || 0) + 1;
        interval = grow(interval || 1, ef);
      }
      break;
  }

  let next;
  if (to === '학습 중') {
    setField(c, RE.pass, null);
    setField(c, RE.interval, null);
    next = addDays(date, LEARNING_INTERVAL);
  } else {
    interval = interval || 1;
    setField(c, RE.pass, `통과 ${passes || 0}회`);
    setField(c, RE.interval, `간격 ${interval}일`);
    next = addDays(date, interval);
  }
  setField(c, RE.ef, `계수 ${formatEf(ef)}`);
  setField(c, RE.next, `다음 ${next}`);
  if (opt.depth) setDepth(c, opt.depth);

  const lines = t.lines.slice();
  lines.splice(c.index, 1);
  const line = formatConcept(c);
  if (to === from) lines.splice(c.index, 0, line);
  else insertIntoSection(lines, to, line);
  ensurePlaceholder(lines, LATER);

  const moved = to === from ? to : `${from} → ${to}`;
  const nums = to === '학습 중' ? '' : ` · 통과 ${passes || 0}회 · 간격 ${interval}일`;
  console.log(`${shortName(c)}: ${moved}${nums} · 계수 ${formatEf(efBefore)} → ${formatEf(ef)} · 다음 ${next}`);
  notes.forEach(n => console.log(`  - ${n}`));
  if (opt.dry) { console.log('(--dry: 파일은 바꾸지 않음)'); return; }
  fs.writeFileSync(t.file, lines.join('\n'));
  syncIndex(root, slug, opt);
}

// ---------- 명령: sync-index ----------

function levelSummary(t) {
  const body = sectionBody(t.lines, '영역별 실력') || [];
  const areas = body
    .map(l => l.match(/^- (.+?)(?: \(묶음: .*\))?: (.+)$/))
    .filter(Boolean)
    .map(m => ({ name: m[1], level: (m[2].match(/^(\d)/) || [])[1] || null }));
  if (!areas.length) return null;
  const label = a => `${a.name} ${a.level || '미진단'}`;
  if (areas.length <= 3) return areas.map(label).join(' · ');
  const diagnosed = areas.filter(a => a.level).sort((a, b) => a.level - b.level);
  if (!diagnosed.length) return `${areas.length}개 영역 모두 미진단`;
  const shown = [...diagnosed, ...areas.filter(a => !a.level)].slice(0, 3);
  return `${shown.map(label).join(' · ')} 외 ${areas.length - 3}개`;
}

function planSummary(t) {
  const body = sectionBody(t.lines, '진행 중 계획') || [];
  if (!body.length || body.some(l => l.startsWith('- 없음'))) return '없음';
  const src = body.find(l => l.startsWith('- 자료:'));
  const prog = body.find(l => l.startsWith('- 진행:'));
  if (!src || !prog) return null;
  const name = src.replace('- 자료:', '').trim().split(' (')[0].split(' — ')[0];
  return `${name} — ${prog.replace('- 진행:', '').trim()}`;
}

function computedRow(t) {
  return { level: levelSummary(t), next: earliestNext(t) || '없음', plan: planSummary(t) };
}

function readIndexRow(root, slug) {
  const file = path.join(root, 'index.md');
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const i = lines.findIndex(l => new RegExp(`\\|\\s*topics/${slug}\\.md\\s*\\|`).test(l));
  if (i < 0) return { file, lines, i };
  const cells = lines[i].split('|').slice(1, -1).map(s => s.trim());
  return { file, lines, i, cells };
}

function syncIndex(root, slug, opt) {
  const t = loadTopic(root, slug);
  const row = readIndexRow(root, slug);
  if (!row || row.i < 0) die(`index.md 에 topics/${slug}.md 행이 없음`);
  const cells = row.cells;
  const calc = computedRow(t);
  if (calc.level) cells[3] = calc.level;
  cells[5] = calc.next;
  if (calc.plan) cells[6] = calc.plan;
  if (opt.studied) cells[4] = opt.date || fmt(new Date());
  const line = `| ${cells.join(' | ')} |`;
  if (line !== row.lines[row.i]) {
    row.lines[row.i] = line;
    fs.writeFileSync(row.file, row.lines.join('\n'));
  }
  console.log(`index: 수준 ${cells[3]} · 마지막 학습 ${cells[4]} · 다음 복습 ${cells[5]} · 계획 ${cells[6]}`);
}

// ---------- 명령: check ----------

function checkTopic(root, slug, opt) {
  const t = loadTopic(root, slug);
  const errors = [];
  const warns = [];
  const ranges = sectionRanges(t.lines);
  for (const s of REQUIRED_SECTIONS) if (!ranges[s]) errors.push(`섹션 없음: ## ${s}`);

  const areaBundles = new Set();
  for (const l of sectionBody(t.lines, '영역별 실력') || []) {
    // 묶음 이름에 괄호가 들어갈 수 있어서 (예: 테스트(JUnit)) 마지막 "):" 까지 읽는다
    const m = l.match(/\(묶음: (.*)\):/);
    if (m) m[1].split(',').map(s => s.trim()).forEach(b => areaBundles.add(b));
  }

  let fixed = 0;
  for (const name of STATE_SECTIONS) {
    const r = ranges[name];
    if (!r) continue;
    for (let i = r.start + 1; i < r.end; i++) {
      const line = t.lines[i];
      if (!line.startsWith('- ')) continue;
      const c = parseConcept(line);
      const where = `[${name}] ${line.slice(2, 40)}`;
      if (!c) { errors.push(`형식 오류 (칸 [ ] 없음): ${where}`); continue; }
      if (!getNext(c)) errors.push(`다음 날짜 없음: ${where}`);
      if (name === '압축됨') {
        if (getNum(c, RE.pass) == null || getNum(c, RE.interval) == null) errors.push(`압축 줄에 통과·간격 없음: ${where}`);
        continue;
      }
      const bundle = bundleOf(c);
      if (!bundle) errors.push(`묶음 없음: ${where}`);
      else if (areaBundles.size && !areaBundles.has(bundle)) warns.push(`영역에 없는 묶음 "${bundle}": ${where}`);
      if (!kindOf(c)) errors.push(`지식 종류 없음: ${where}`);
      if (!depthOf(c)) errors.push(`깊이 없음: ${where}`);
      if (['익힘', '정착'].includes(name) && (getNum(c, RE.pass) == null || getNum(c, RE.interval) == null)) {
        errors.push(`통과·간격 없음: ${where}`);
      }
      if (name === '학습 중' && (getNum(c, RE.pass) != null || getNum(c, RE.interval) != null)) {
        warns.push(`학습 중인데 통과·간격이 있음 (학습 중은 3일 고정): ${where}`);
      }
      if (getNum(c, RE.ef) == null) {
        if (opt.fix) { setField(c, RE.ef, `계수 ${formatEf(DEFAULT_EF)}`); t.lines[i] = formatConcept(c); fixed++; }
        else warns.push(`계수 없음 (2.5 로 봄, --fix 로 채움): ${where}`);
      }
    }
  }

  for (const l of sectionBody(t.lines, LATER) || []) {
    if (l === '- 없음') continue;
    const c = parseConcept(l);
    const ok = c && (c.fields.includes('아직 안 배움') || (findIdx(c, RE.unchecked) >= 0 && findIdx(c, RE.learned) >= 0));
    if (!ok) warns.push(`나중에 볼 목록 형식: ${l.slice(2, 40)} — [아직 안 배움] 또는 [… · 배움 <날짜> · 확인 전]`);
  }
  if (ranges['세션 메모'] && !(sectionBody(t.lines, '세션 메모') || []).length) warns.push('세션 메모가 비어 있음 (비었으면 "- 없음")');
  const logs = (sectionBody(t.lines, '최근 로그') || []).filter(l => l.startsWith('- '));
  if (logs.length > 10) warns.push(`최근 로그 ${logs.length}줄 — 10줄 넘는 오래된 줄은 archive 로`);

  if (fixed) {
    fs.writeFileSync(t.file, t.lines.join('\n'));
    console.log(`${slug}: 계수 2.5 채움 ${fixed}개`);
  }

  const row = readIndexRow(root, slug);
  if (!row || row.i < 0) errors.push(`index.md 에 topics/${slug}.md 행이 없음`);
  else {
    const calc = computedRow(loadTopic(root, slug));
    const diffs = [];
    if (calc.level && row.cells[3] !== calc.level) diffs.push(`수준 "${row.cells[3]}" ≠ "${calc.level}"`);
    if (row.cells[5] !== calc.next) diffs.push(`다음 복습 ${row.cells[5]} ≠ ${calc.next}`);
    if (calc.plan && row.cells[6] !== calc.plan) diffs.push(`계획 "${row.cells[6]}" ≠ "${calc.plan}"`);
    if (diffs.length) {
      if (opt.fix) syncIndex(root, slug, {});
      else warns.push(`index 가 topic 과 다름 (sync-index 필요): ${diffs.join(', ')}`);
    }
  }

  errors.forEach(e => console.log(`✗ ${slug}: ${e}`));
  warns.forEach(w => console.log(`! ${slug}: ${w}`));
  if (!errors.length && !warns.length) console.log(`✓ ${slug}: 문제 없음`);
  return errors.length;
}

function cmdCheck(root, slug, opt) {
  const slugs = slug ? [slug] : topicSlugs(root);
  const errs = slugs.reduce((n, s) => n + checkTopic(root, s, opt), 0);
  if (errs) process.exit(1);
}

// ---------- 명령: stats ----------

function cmdStats(root, slug, opt) {
  const date = opt.date || fmt(new Date());
  for (const s of slug ? [slug] : topicSlugs(root)) {
    const t = loadTopic(root, s);
    const cs = conceptsIn(t, STATE_SECTIONS);
    const count = name => cs.filter(c => c.section === name).length;
    const later = conceptsIn(t, [LATER]);
    const due = dueList(t, date);
    const efs = cs.map(c => getNum(c, RE.ef)).filter(v => v != null);

    const logLines = [...(sectionBody(t.lines, '최근 로그') || [])];
    const archive = path.join(root, 'archive', `${s}.md`);
    if (fs.existsSync(archive)) logLines.push(...fs.readFileSync(archive, 'utf8').split(/\r?\n/).filter(l => / — 복습 — /.test(l)));
    let reviews = 0, asked = 0, passed = 0;
    for (const l of new Set(logLines)) {
      const m = l.match(/ — 복습 — (\d+)개 중 (\d+)개 통과/);
      if (m) { reviews++; asked += Number(m[1]); passed += Number(m[2]); }
    }

    console.log(`## ${s} (${date} 기준)`);
    console.log(`- 상태: 압축 ${count('압축됨')} · 정착 ${count('정착')} · 익힘 ${count('익힘')} · 학습 중 ${count('학습 중')}`);
    console.log(`- 나중에 볼 목록: 확인 전 ${later.filter(c => findIdx(c, RE.unchecked) >= 0).length} · 아직 안 배움 ${later.filter(c => c.fields.includes('아직 안 배움')).length}`);
    console.log(`- 복습할 개념: ${due.length}개 (7일 넘게 밀린 것 ${due.filter(c => (c.overdue ?? 0) > 7).length}개)`);
    console.log(`- 복습 실행: ${reviews}회 · 통과율 ${asked ? Math.round((passed / asked) * 100) + '%' : '기록 없음'} (${passed}/${asked})`);
    console.log(`- 평균 계수: ${efs.length ? formatEf(efs.reduce((a, b) => a + b, 0) / efs.length) : '없음'} (${efs.length}개 기준)`);
    console.log(`- 표시: 오개념 ${cs.filter(hasMisconception).length} · 설명 누락 ${cs.filter(hasMissing).length} · 확신 오류 ${cs.filter(c => findIdx(c, RE.confErr) >= 0).length} · 확신 낮음 ${cs.filter(c => c.fields.includes('확신 낮음')).length}`);
    console.log(`- 세션 메모: ${(sectionBody(t.lines, '세션 메모') || []).filter(l => l !== '- 없음').length}줄`);
  }
}

// ---------- 명령: remind ----------

function cmdRemind(root, opt) {
  const date = opt.date || fmt(new Date());
  const parts = [];
  for (const s of topicSlugs(root)) {
    if (!fs.existsSync(path.join(root, 'topics', `${s}.md`))) continue; // 세션 시작 알림은 실패하지 않게
    const list = dueList(loadTopic(root, s), date);
    if (list.length) parts.push(`${s} ${list.length}개 (가장 오래 ${Math.max(...list.map(c => c.overdue ?? 0))}일 지남)`);
  }
  if (!parts.length) return;
  const msg = `📌 study 복습할 개념: ${parts.join(', ')} — /study review`;
  if (opt.json) {
    console.log(JSON.stringify({
      systemMessage: msg,
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `${msg} (사용자가 학습 이야기를 하면 복습을 먼저 권할 것)` },
    }));
  } else {
    console.log(msg);
  }
}

// ---------- 진입점 ----------

function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  const root = path.resolve(opt.root || path.join(__dirname, '..', 'progress'));
  const [cmd, ...args] = pos;
  if (opt.date && !/^\d{4}-\d{2}-\d{2}$/.test(opt.date)) die('--date 는 YYYY-MM-DD');
  switch (cmd) {
    case 'due': return cmdDue(root, args[0], opt);
    case 'apply': return cmdApply(root, args[0], args[1], args[2], opt);
    case 'sync-index': if (!args[0]) die(USAGE); return syncIndex(root, args[0], opt);
    case 'check': return cmdCheck(root, args[0], opt);
    case 'stats': return cmdStats(root, args[0], opt);
    case 'remind':
      try { return cmdRemind(root, opt); } catch { return; } // 세션 시작을 막지 않는다
    default: die(USAGE);
  }
}

if (require.main === module) main();
module.exports = { nextEf, grow, priority, parseConcept, formatConcept };
