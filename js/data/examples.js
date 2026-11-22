/* 문항공방 예제 문항 (예제 불러오기 + 엔진 테스트용)
 * expect: 손으로 푼 정답(plain 표기). 테스트에서만 사용한다.
 */
(function (root) {
  'use strict';
  const base = (o) => Object.assign({
    meta: { subject: '고등학교 수학', unit: '이차함수', grade: '고등학교 1학년' },
    funcs: [], params: [], conds: [], target: {},
    solve: { allowed: ['완전제곱식'], forbidden: ['미분'], level: '표준' },
    present: { format: 'short', showGraph: false, showTable: false },
  }, o);
  const par = (name, role, extra) => Object.assign({ name, role, kind: 'real', lo: '', loOp: '>', hi: '', hiOp: '<', rlo: 1, rhi: 5, value: null }, extra || {});
  const fn = (name, expr, domain) => ({ name, expr, domain: domain || { type: 'R', lo: '', hi: '', loC: true, hiC: true } });
  const iv = (lo, hi) => ({ type: 'interval', lo, hi, loC: true, hiC: true });

  const EX = [
    {
      id: 'plan', title: '기획서 예시 · 매개변수가 있는 최솟값', note: 'BeAT 기획서 6장의 예시. 문자 a가 답에 남는 문항',
      expect: '−a² + 3',
      spec: base({
        funcs: [fn('f', 'x^2-2ax+3')],
        params: [par('a', 'symbol', { lo: '0', loOp: '>' })],
        target: { type: 'min', fn: 'f' },
      }),
    },
    {
      id: 'minmax', title: '제한된 정의역의 최댓값·최솟값', note: '최솟값 조건으로 k를 정한 뒤 최댓값을 구함',
      expect: '7',
      spec: base({
        funcs: [fn('f', 'x^2-2x+k', iv('-1', '2'))],
        params: [par('k', 'unknown')],
        conds: [{ type: 'min', fn: 'f', v: '3' }],
        target: { type: 'max', fn: 'f' },
        present: { format: 'mc', showGraph: false, showTable: false },
      }),
    },
    {
      id: 'touch', title: '판별식 · x축에 접하는 조건', note: 'k > 0 조건을 지우면 답이 2개가 되어 경고가 뜹니다',
      expect: '(−3, 0)',
      spec: base({
        funcs: [fn('f', 'x^2+2kx+k+6')],
        params: [par('k', 'unknown', { lo: '0', loOp: '>' })],
        conds: [{ type: 'xaxis', fn: 'f', rel: 'touch' }],
        target: { type: 'vertex', fn: 'f' },
        present: { format: 'short', showGraph: false, showTable: false },
      }),
    },
    {
      id: 'linear', title: '정의역과 치역으로 계수 구하기', note: '사용자 아이디어의 예시(정의역·치역 지정). a > 0을 지우면 답이 2개',
      expect: '5',
      spec: base({
        unit: '함수',
        funcs: [fn('f', 'ax+b', iv('-1', '2'))],
        params: [par('a', 'unknown', { lo: '0', loOp: '>' }), par('b', 'unknown')],
        conds: [{ type: 'range', fn: 'f', m: '1', M: '7' }],
        target: { type: 'expr', expr: 'a+b' },
        present: { format: 'short', showGraph: false, showTable: false },
      }),
    },
    {
      id: 'domainParam', title: '정의역에 매개요소가 있는 최솟값', note: '정의역 a ≤ x ≤ a+3 — 꼭짓점 위치에 따라 경우를 나눔',
      expect: '1',
      spec: base({
        funcs: [fn('f', 'x^2-4x+5', iv('a', 'a+3'))],
        params: [par('a', 'unknown')],
        conds: [{ type: 'min', fn: 'f', v: '2' }],
        target: { type: 'solSum', param: 'a' },
      }),
    },
    {
      id: 'intcount', title: '실근이 없을 조건 · 정수의 개수', note: '판별식 부등식을 풀어 범위를 구함',
      expect: '4',
      spec: base({
        funcs: [fn('f', 'x^2-2ax+a+6')],
        params: [par('a', 'unknown', { kind: 'int' })],
        conds: [{ type: 'xaxis', fn: 'f', rel: 'none' }],
        target: { type: 'intCount', param: 'a' },
      }),
    },
    {
      id: 'tangent', title: '두 그래프가 접할 조건', note: '이차함수와 직선이 접할 때 k의 값',
      expect: '1',
      spec: base({
        funcs: [fn('f', 'x^2+2'), fn('g', '2x+k')],
        params: [par('k', 'unknown')],
        conds: [{ type: 'intersect', fn: 'f', fn2: 'g', rel: 'touch' }],
        target: { type: 'param', param: 'k' },
        present: { format: 'short', showGraph: false, showTable: false },
      }),
    },
    {
      id: 'roots', title: '한 근이 주어진 이차방정식', note: '근을 대입해 k를 구하고 나머지 근까지 구함',
      expect: 'x = 3 또는 x = 4',
      spec: base({
        unit: '이차방정식',
        funcs: [fn('f', 'x^2-(k+1)x+2k')],
        params: [par('k', 'unknown')],
        conds: [{ type: 'root', fn: 'f', r: '3' }],
        target: { type: 'roots', fn: 'f' },
      }),
    },
    {
      id: 'compose', title: '합성함수의 값', note: '두 함수의 합성',
      expect: '9',
      spec: base({
        unit: '함수',
        funcs: [fn('f', '2x+3'), fn('g', 'x^2-1')],
        params: [],
        target: { type: 'compose', fn: 'f', fn2: 'g', k: '2' },
      }),
    },
    {
      id: 'random', title: '동형 문항 생성용 · 값 자동 생성', note: 'p, q가 문항마다 바뀝니다. ‘동형 문항’ 탭에서 여러 개 생성',
      expect: null,
      spec: base({
        funcs: [fn('f', 'x^2-2px+q', iv('0', '4'))],
        params: [par('p', 'random', { kind: 'int', rlo: 1, rhi: 3, value: 1 }), par('q', 'random', { kind: 'int', rlo: -3, rhi: 5, value: 2 })],
        target: { type: 'maxmin', fn: 'f' },
        present: { format: 'short', showGraph: true, showTable: true },
      }),
    },
    {
      id: 'box', title: '조건 상자 (가)(나)', note: '조건을 (가), (나) 상자로 제시하는 수능형 발문',
      expect: '7',
      spec: base({
        funcs: [fn('f', 'x^2+ax+b')],
        params: [par('a', 'unknown'), par('b', 'unknown')],
        conds: [{ type: 'custom', lhs: 'f(1)', rel: '=', rhs: 'f(3)', box: true }, { type: 'min', fn: 'f', v: '-2', box: true }],
        target: { type: 'fval', fn: 'f', k: '5' },
        present: { format: 'mc', showGraph: false, showTable: false },
      }),
    },
    {
      id: 'points', title: '점 요소와 그래프', note: '두 점 A, B를 지나는 이차함수 — 점도 그래프에 표시',
      expect: '(2, −1)',
      spec: base({
        funcs: [fn('f', 'x^2+ax+b')],
        points: [{ name: 'A', x: '1', y: '0' }, { name: 'B', x: '4', y: '3' }],
        params: [par('a', 'unknown'), par('b', 'unknown')],
        conds: [{ type: 'passes', fn: 'f', pt: 'A' }, { type: 'passes', fn: 'f', pt: 'B' }],
        target: { type: 'vertex', fn: 'f' },
        present: { format: 'short', showGraph: true, showTable: false, graph: { points: true, coords: true } },
      }),
    },
    {
      id: 'fallback', title: '엔진이 풀지 못하는 문항', note: '문자 a의 값에 따라 경우가 나뉘어 BeAT 해설 요청문으로 넘깁니다',
      expect: 'unsupported',
      spec: base({
        funcs: [fn('f', 'x^2-2ax+3', iv('0', '2'))],
        params: [par('a', 'symbol', { lo: '0', loOp: '>' })],
        target: { type: 'min', fn: 'f' },
        solve: { allowed: ['완전제곱식'], forbidden: ['미분'], level: '표준' },
      }),
    },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = EX;
  else { root.MH = root.MH || {}; root.MH.examples = EX; }
})(typeof window !== 'undefined' ? window : globalThis);
