// 엔진 테스트: node tests/engine.test.js [예제id] [-v]
const path = require('path');
['numbers', 'poly', 'solver', 'question'].forEach(f => require(path.join(__dirname, '../js/engine', f + '.js')));
const E = require(path.join(__dirname, '../js/engine/index.js'));
const EX = require(path.join(__dirname, '../js/data/examples.js'));
const plain = (parts) => parts.map(p => typeof p === 'string' ? p : p.box ? '\n' + p.box.map((b, i) => '(' + '가나다라마'[i] + ') ' + plain(b)).join('\n') + '\n' : p.plain).join('');
const only = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : null;
let fail = 0;
for (const ex of EX) {
  if (only && ex.id !== only) continue;
  const r = E.compile(ex.spec);
  const got = r.status === 'ok' ? (r.answer ? r.answer.plain : '(답 없음)') : r.status;
  const ok = ex.expect === null || got === ex.expect;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} [${ex.id}] ${ex.title} → ${got}${ok ? '' : ' (기대: ' + ex.expect + ')'}`);
  if (only || process.argv.includes('-v')) {
    console.log('  발문:', r.question ? plain(r.question) : r.error);
    r.steps.forEach((s, i) => console.log(`   ${i + 1}. ${plain(s.parts)}`));
  }
}
const t = JSON.parse(JSON.stringify(EX.find(e => e.id === 'touch').spec)); t.params[0].lo = '';
const r2 = E.compile(t);
const multiOk = r2.answer && r2.answer.multiple;
console.log(`${multiOk ? 'PASS' : 'FAIL'} [touch, k>0 제거] 답이 여러 개로 경고 → ${r2.answer && r2.answer.plain}`);
if (!multiOk) fail++;
console.log(fail ? `${fail}개 실패` : '모두 통과');
process.exit(fail ? 1 : 0);
