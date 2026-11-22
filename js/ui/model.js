/* 문항 상태: 구조 기본값, 불러오기 정규화, 매개요소 감지, 계산 */
(function (root) {
  'use strict';
  const MH = root.MH; const UI = MH.ui; const E = MH.Engine; const S = UI.S;

  const DEFAULT_PRESENT = { format: 'short', showGraph: false, showTable: false, tableFn: '', graph: { fns: [], points: true, coords: false, vertex: false, intercepts: false, grid: true } };

  UI.newReview = () => ({ mode: 'ai', aiText: '', aiCheck: null, manualAnswer: '', manualSolution: '', request: 'solution' });
  UI.blankSpec = () => ({
    meta: { subject: '고등학교 수학', unit: '이차함수', grade: '고등학교 1학년', number: '1', score: '' },
    elements: [{ kind: 'function', name: 'f', expr: 'x^2-2x+3', domain: { type: 'R', lo: '', hi: '', loC: true, hiC: true } }],
    params: [], conds: [], target: { type: 'min', fn: 'f' },
    solve: { allowed: ['완전제곱식'], forbidden: ['미분'], level: '표준' },
    present: UI.clone(DEFAULT_PRESENT),
  });
  // 예전 형식(funcs/points)과 새 형식(elements)을 모두 받는다
  UI.normalizeSpec = function (spec) {
    const s = UI.clone(spec);
    if (!s.elements) s.elements = (s.funcs || []).map(f => Object.assign({ kind: 'function' }, f)).concat((s.points || []).map(p => Object.assign({ kind: 'point' }, p)));
    delete s.funcs; delete s.points;
    s.elements.forEach(e => { if (e.kind === 'function') e.domain = Object.assign({ type: 'R', lo: '', hi: '', loC: true, hiC: true }, e.domain || {}); });
    s.meta = Object.assign({ subject: '고등학교 수학', unit: '이차함수', grade: '고등학교 1학년', number: '1', score: '' }, s.meta || {});
    if (s.unit) { s.meta.unit = s.unit; delete s.unit; }
    s.solve = Object.assign({ allowed: ['완전제곱식'], forbidden: ['미분'], level: '표준' }, s.solve || {});
    const g = Object.assign({}, DEFAULT_PRESENT.graph, (s.present && s.present.graph) || {});
    s.present = Object.assign(UI.clone(DEFAULT_PRESENT), s.present || {}); s.present.graph = g;
    if (s.present.markVertex) g.vertex = true; if (s.present.markIntercepts) g.intercepts = true;
    s.params = s.params || []; s.conds = s.conds || []; s.target = s.target || { type: 'min', fn: 'f' };
    s.params.forEach(p => { if (p.role === 'random' && (p.value === null || p.value === undefined || p.value === '')) p.value = UI.pickRandom(p); });
    return s;
  };
  UI.load = function (spec, title, review) {
    S.state = { spec: UI.normalizeSpec(spec), sel: { kind: 'element', i: 0 }, review: Object.assign(UI.newReview(), review || {}), title: title || '' };
    S.variants = [];
    UI.syncParams();
  };
  UI.funcs = () => S.state.spec.elements.filter(e => e.kind === 'function');
  UI.points = () => S.state.spec.elements.filter(e => e.kind === 'point');
  UI.engineSpec = function (spec) {
    const s = Object.assign({}, spec || S.state.spec);
    s.funcs = s.elements.filter(e => e.kind === 'function');
    s.points = s.elements.filter(e => e.kind === 'point');
    return s;
  };

  // ── 매개요소 자동 감지 ──
  UI.lettersUsed = function () {
    const s = S.state.spec; const names = UI.funcs().map(f => f.name); const used = new Set();
    const add = (str) => { if (str === undefined || str === null || str === '') return; E.lettersIn(String(str), names).forEach(v => used.add(v)); };
    s.elements.forEach(e => {
      if (e.kind === 'function') { add(e.expr); if (e.domain && e.domain.type !== 'R') { add(e.domain.lo); add(e.domain.hi); } }
      if (e.kind === 'point') { add(e.x); add(e.y); }
    });
    s.conds.forEach(c => ['x0', 'y0', 'v', 'vx', 'vy', 'm', 'M', 'r', 's', 'lhs', 'rhs'].forEach(k => add(c[k])));
    const t = s.target || {}; add(t.k); add(t.expr); if (t.param) used.add(t.param);
    names.forEach(n => used.delete(n)); used.delete('x'); used.delete('y');
    return used;
  };
  UI.syncParams = function () {
    const used = UI.lettersUsed(); const s = S.state.spec;
    for (const v of [...used].sort()) {
      if (s.params.some(p => p.name === v)) continue;
      const byCond = s.conds.length || UI.C.PARAM_TARGETS.includes(s.target.type);
      s.params.push(UI.newParam(v, byCond ? 'unknown' : 'symbol'));
    }
    s.params.sort((a, b) => a.name < b.name ? -1 : 1);
    S.state.used = used;
  };
  UI.newParam = (name, role) => ({ name, role: role || 'unknown', kind: 'real', lo: '', loOp: '>', hi: '', hiOp: '<', rlo: 1, rhi: 5, value: null });
  UI.pickRandom = function (p) {
    let lo = Math.ceil(+p.rlo), hi = Math.floor(+p.rhi);
    if (!(hi >= lo)) { lo = 1; hi = 5; }
    const ok = (v) => {
      if (p.kind === 'nat' && v < 1) return false;
      if (p.lo !== '' && p.lo !== undefined && p.lo !== null && !isNaN(+p.lo)) { if (p.loOp === '>=' ? v < +p.lo : v <= +p.lo) return false; }
      if (p.hi !== '' && p.hi !== undefined && p.hi !== null && !isNaN(+p.hi)) { if (p.hiOp === '<=' ? v > +p.hi : v >= +p.hi) return false; }
      return true;
    };
    const c = []; for (let v = lo; v <= hi && c.length < 400; v++) if (ok(v)) c.push(v);
    return c.length ? c[Math.floor(Math.random() * c.length)] : lo;
  };
  // 이름 고르기: 함수·매개요소는 소문자, 점은 대문자
  const LOWER = 'abcdefghijklmnopqrstuvwz'.split('');
  UI.takenLower = function () { const s = S.state.spec; return new Set([...UI.funcs().map(f => f.name), ...s.params.map(p => p.name), ...S.state.used, 'x', 'y']); };
  UI.nextFuncName = function () { const t = UI.takenLower(); return 'fghpqruvwst'.split('').find(n => !t.has(n)) || LOWER.find(n => !t.has(n)); };
  UI.nextParamName = function () { const t = UI.takenLower(); return 'abckmnpqtcdejl'.split('').find(n => !t.has(n)) || LOWER.find(n => !t.has(n)); };
  UI.nextPointName = function () { const t = new Set(UI.points().map(p => p.name)); return 'ABCDEFGHIJKLMNPQRSTUVW'.split('').find(n => !t.has(n)); };
  UI.freeFuncNames = function (cur) { const t = UI.takenLower(); t.delete(cur); return LOWER.filter(n => !t.has(n)); };

  UI.defaultCond = function (type) {
    const fs = UI.funcs(); const f = fs[0] ? fs[0].name : 'f', g = (fs[1] || fs[0] || { name: 'f' }).name;
    const pt = (UI.points()[0] || {}).name || '';
    return ({
      value: { fn: f, x0: '1', y0: '0' }, passes: { fn: f, pt }, min: { fn: f, v: '1' }, max: { fn: f, v: '1' }, range: { fn: f, m: '0', M: '1' },
      vertex: { fn: f, vx: '1', vy: '' }, xaxis: { fn: f, rel: 'touch' }, intersect: { fn: f, fn2: g, rel: 'touch' },
      root: { fn: f, r: '1' }, rootSum: { fn: f, s: '1' }, rootProd: { fn: f, s: '1' }, custom: { lhs: 'a', rel: '=', rhs: '1' },
    })[type];
  };
  UI.fixTarget = function () {
    const s = S.state.spec, t = s.target; const fns = UI.funcs().map(f => f.name);
    if (!fns.includes(t.fn)) t.fn = fns[0];
    if ((t.type === 'compose' || t.type === 'intersectX') && (!t.fn2 || !fns.includes(t.fn2))) t.fn2 = fns[1] || fns[0];
    if ((t.type === 'fval' || t.type === 'compose') && !t.k) t.k = '1';
    if (t.type === 'expr' && !t.expr) t.expr = s.params.filter(p => p.role === 'unknown').map(p => p.name).join('+') || '1';
    if (['param', 'solSum', 'solCount', 'paramRange', 'intCount', 'intSum'].includes(t.type) && !t.param) { const p = s.params.find(q => q.role === 'unknown') || s.params[0]; t.param = p ? p.name : ''; }
  };
  UI.renameFunc = function (oldN, newN) {
    const s = S.state.spec;
    s.conds.forEach(c => { if (c.fn === oldN) c.fn = newN; if (c.fn2 === oldN) c.fn2 = newN; });
    if (s.target.fn === oldN) s.target.fn = newN; if (s.target.fn2 === oldN) s.target.fn2 = newN;
    const g = s.present.graph; g.fns = g.fns.map(n => n === oldN ? newN : n);
    if (s.present.tableFn === oldN) s.present.tableFn = newN;
  };
  UI.renamePoint = function (oldN, newN) { S.state.spec.conds.forEach(c => { if (c.pt === oldN) c.pt = newN; }); };

  // ── 계산 ──
  UI.compute = function () {
    S.result = E.compile(UI.engineSpec());
    UI.afterCompute();
  };
  UI.statusInfo = function () {
    const r = S.result, rv = S.state.review;
    if (r.status === 'error') return { error: true, mode: '-', ans: '-', review: '구조 오류', flag: true };
    const engineOk = r.status === 'ok' && r.answer && !r.answer.multiple && !r.answer.none && !r.answer.free && r.checks.every(c => c.state !== 'fail');
    let mode, ans, review, flag = false;
    if (r.status === 'ok') {
      mode = '엔진 자동풀이';
      if (engineOk) { ans = '검증 완료'; review = '엔진 검증 완료'; } else { ans = '검증 실패'; review = '검토 필요'; flag = true; }
      if (rv.aiText.trim() && rv.aiCheck && rv.aiCheck.flag) { review = '검토 필요'; flag = true; }
    } else {
      mode = rv.mode === 'manual' ? '출제자 직접 작성' : 'AI 해설 초안';
      ans = rv.manualAnswer.trim() ? '출제자 입력' : '미검증';
      if (rv.mode === 'manual') review = rv.manualSolution.trim() ? '출제자 작성' : '미작성';
      else if (!rv.aiText.trim()) review = '해설 없음';
      else if (rv.aiCheck && rv.aiCheck.flag) { review = '검토 필요'; flag = true; }
      else review = 'AI 초안';
    }
    return { mode, ans, review, flag, engineOk };
  };
})(typeof window !== 'undefined' ? window : globalThis);
