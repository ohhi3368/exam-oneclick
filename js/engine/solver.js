/* 풀이 엔진
 * 조건 → 경우 나누기 → 연립 풀이 → 구할 것 계산 → 검증 → 그래프 모델
 */
(function (root) {
  'use strict';
  const MH = root.MH = root.MH || {};
  const { EngineError, unsupported, gcd, Fr, frParse, squarefree, QR, qrSqrt } = MH.num;
  const { mkKey, parseKey, keyDeg, cmpKeys, P, SUP, sup, MINUS, monoStr, frStr, termParts, joinParts, ptex, xtex, vstr, shiftStr, factorStr, leadCoef, plusTerm, REL_TEX, REL_PLAIN, relStr, FLIP, M, line, tokenize, parse, lettersIn, evalQR, evalP, toQR, divisors, solveUni, KIND_KO, fxTex, domTex, setTex, ptM, josa, mjosa, rawM, customM } = MH.poly;

  // ───────────────────────── 엔진 본체 ─────────────────────────

  function compile(spec, overrides) {
    overrides = overrides || {};
    const R = {
      ok: false, status: 'error', error: null, unsupportedReason: null,
      question: null, answer: null, answers: [], steps: [], checks: [], warnings: [],
      methods: new Set(), graph: null, choices: null, rejected: [], numericAnswer: null,
    };
    const ctx = { spec, R, methods: R.methods, level: (spec.solve && spec.solve.level) || '표준' };
    try {
      setup(ctx, overrides);
      R.question = MH.question.buildQuestion(ctx);
    } catch (e) {
      if (!(e instanceof EngineError)) { console.error(e); e = new EngineError('내부 오류: ' + e.message); }
      R.status = 'error'; R.error = e.message; return R;
    }
    try { R.graph = graphModel(ctx, {}); } catch (e) { R.graph = null; }
    try {
      solve(ctx);
      R.ok = true; R.status = 'ok';
    } catch (e) {
      if (!(e instanceof EngineError)) { console.error(e); e = new EngineError('내부 오류: ' + e.message, 'unsupported'); }
      if (e.kind === 'unsupported') { R.status = 'unsupported'; R.unsupportedReason = e.message; }
      else { R.status = 'error'; R.error = e.message; }
    }
    R.methods = [...R.methods];
    return R;
  }

  // 매개요소·함수 해석
  function setup(ctx, overrides) {
    const spec = ctx.spec;
    const funcs = spec.funcs || [];
    if (!funcs.length) throw new EngineError('함수 요소를 하나 이상 추가하세요.');
    ctx.params = {};
    (spec.params || []).forEach(p => { ctx.params[p.name] = p; });
    // 무작위 매개요소 값
    ctx.fixed = {};
    for (const p of spec.params || []) {
      if (p.role !== 'random') continue;
      let v = overrides[p.name] !== undefined ? overrides[p.name] : p.value;
      if (v === null || v === undefined || v === '') v = Math.round(((+p.rlo || 0) + (+p.rhi || 0)) / 2);
      ctx.fixed[p.name] = P.c(new Fr(+v));
    }
    const fixP = (p) => p.substMap(ctx.fixed);
    ctx.fix = fixP;
    // 함수
    ctx.F = {}; const rawFuncs = {};
    for (const f of funcs) {
      if (!/^[a-z]$/.test(f.name) || f.name === 'x') throw new EngineError('함수 이름은 x를 제외한 영어 소문자 한 글자여야 합니다.');
      let poly;
      try { poly = parse(f.expr); } catch (e) { throw new EngineError(`${f.name}(x)의 식: ${e.message}`); }
      poly = fixP(poly);
      const deg = poly.deg('x');
      if (deg > 2) throw new EngineError(`${f.name}(x)는 이차 이하의 함수만 지원합니다. (MVP: 이차함수·이차방정식)`);
      const dom = f.domain || { type: 'R' };
      const d = { type: dom.type || 'R', loC: dom.loC !== false, hiC: dom.hiC !== false };
      const pb = (s, label) => { try { return fixP(parse(s, { noX: true })); } catch (e) { throw new EngineError(`${f.name}의 정의역 ${label}: ${e.message}`); } };
      if (d.type === 'interval' || d.type === 'ge') d.lo = pb(dom.lo, '시작값');
      if (d.type === 'interval' || d.type === 'le') d.hi = pb(dom.hi, '끝값');
      if (d.type === 'interval' && d.lo.isConst() && d.hi.isConst() && d.lo.cv().cmp(d.hi.cv()) >= 0) throw new EngineError(`${f.name}의 정의역: 시작값이 끝값보다 작아야 합니다.`);
      const cs = poly.coeffs('x');
      ctx.F[f.name] = { name: f.name, poly, A: cs[2] || new P(), B: cs[1] || new P(), C: cs[0] || new P(), deg, dom: d };
      rawFuncs[f.name] = poly;
    }
    ctx.funcPolys = rawFuncs;
    ctx.parse = (s, what) => { try { return fixP(parse(s, { funcs: rawFuncs, noX: true })); } catch (e) { throw new EngineError((what ? what + ': ' : '') + e.message); } };
    // 점 요소
    ctx.Pts = {};
    for (const pt of spec.points || []) {
      if (!/^[A-Z]$/.test(pt.name)) throw new EngineError('점의 이름은 영어 대문자 한 글자여야 합니다.');
      ctx.Pts[pt.name] = { name: pt.name, x: ctx.parse(pt.x, '점 ' + pt.name + '의 x좌표'), y: ctx.parse(pt.y, '점 ' + pt.name + '의 y좌표') };
    }
    // 등장하는 문자 → 역할 확인
    const used = new Set();
    Object.values(ctx.F).forEach(F => { F.poly.vars().forEach(v => used.add(v)); if (F.dom.lo) F.dom.lo.vars().forEach(v => used.add(v)); if (F.dom.hi) F.dom.hi.vars().forEach(v => used.add(v)); });
    used.delete('x');
    ctx.unknowns = []; ctx.symbols = [];
    const collect = (s) => lettersIn(s, Object.keys(rawFuncs)).forEach(v => used.add(v));
    (spec.conds || []).forEach(c => ['x0', 'y0', 'v', 'vx', 'vy', 'm', 'M', 'r', 's', 'lhs', 'rhs'].forEach(k => { if (c[k] !== undefined && c[k] !== '') collect(c[k]); }));
    (spec.conds || []).forEach(c => { if (c.type === 'passes' && ctx.Pts[c.pt]) { ctx.Pts[c.pt].x.vars().forEach(v => used.add(v)); ctx.Pts[c.pt].y.vars().forEach(v => used.add(v)); } });
    const t = spec.target || {};
    ['k', 'expr'].forEach(k => { if (t[k]) collect(t[k]); });
    if (t.param) used.add(t.param);
    for (const v of used) {
      if (ctx.fixed[v]) continue;
      const p = ctx.params[v];
      if (!p) throw new EngineError(`문자 '${v}'가 매개요소 목록에 없습니다.`);
      if (p.role === 'symbol') ctx.symbols.push(v); else ctx.unknowns.push(v);
    }
    ctx.unknowns.sort(); ctx.symbols.sort();
    // 매개요소 범위 → 제약
    ctx.bounds = {}; ctx.paramCons = [];
    for (const v of [...ctx.unknowns, ...ctx.symbols]) {
      const p = ctx.params[v]; const b = { kind: p.kind || 'real', lo: null, loS: false, hi: null, hiS: false };
      if (p.lo !== undefined && p.lo !== '' && p.lo !== null) { b.lo = parse(String(p.lo), { noX: true }); if (!b.lo.isConst()) throw new EngineError(`${v}의 범위는 수로 입력하세요.`); b.lo = b.lo.cv(); b.loS = p.loOp !== '>='; }
      if (p.hi !== undefined && p.hi !== '' && p.hi !== null) { b.hi = parse(String(p.hi), { noX: true }); if (!b.hi.isConst()) throw new EngineError(`${v}의 범위는 수로 입력하세요.`); b.hi = b.hi.cv(); b.hiS = p.hiOp !== '<='; }
      if (b.kind === 'nat' && (!b.lo || b.lo.cmp(Fr.ONE) < 0)) { b.lo = Fr.ONE; b.loS = false; }
      ctx.bounds[v] = b;
    }
  }

  // ─────────── 부호 판정 (상수 또는 문자 범위로) ───────────
  function relHolds(sg, rel) {
    switch (rel) { case '>': return sg > 0; case '>=': return sg >= 0; case '<': return sg < 0; case '<=': return sg <= 0; case '=': return sg === 0; case '!=': return sg !== 0; }
    return false;
  }
  // V의 값이 rel 0 을 만족하는가: true/false/null(판정 불가)
  function checkRel(ctx, V, rel) {
    const q = toQR(V);
    if (q) return relHolds(q.sign(), rel);
    const p = V.p; const vs = [...p.vars()];
    if (vs.length === 1) {
      const s = vs[0], b = ctx.bounds[s];
      if (!b) return null;
      if (p.deg(s) === 1) {
        const c = p.coef(s, 1).cv(), d = p.coef(s, 0).cv();
        let L = null, U = null, Lo = false, Uo = false;
        const f = (x) => c.mul(x).add(d);
        if (c.sign() > 0) { if (b.lo) { L = f(b.lo); Lo = b.loS; } if (b.hi) { U = f(b.hi); Uo = b.hiS; } }
        else { if (b.hi) { L = f(b.hi); Lo = b.hiS; } if (b.lo) { U = f(b.lo); Uo = b.loS; } }
        const gt0 = L && (L.sign() > 0 || (L.sign() === 0 && Lo));
        const ge0 = L && L.sign() >= 0;
        const lt0 = U && (U.sign() < 0 || (U.sign() === 0 && Uo));
        const le0 = U && U.sign() <= 0;
        switch (rel) {
          case '>': return gt0 ? true : (le0 ? false : null);
          case '>=': return ge0 ? true : (lt0 ? false : null);
          case '<': return lt0 ? true : (ge0 ? false : null);
          case '<=': return le0 ? true : (gt0 ? false : null);
          case '=': return (gt0 || lt0) ? false : null;
          case '!=': return (gt0 || lt0) ? true : null;
        }
      }
      if (p.deg(s) === 2 && p.coef(s, 1).isZero()) { // c·s² + d
        const c = p.coef(s, 2).cv(), d = p.coef(s, 0).cv();
        if (c.sign() > 0 && d.sign() > 0) return relHolds(1, rel);
        if (c.sign() < 0 && d.sign() < 0) return relHolds(-1, rel);
      }
    }
    return null;
  }

  // ─────────────────── 연립방정식 풀이 ───────────────────
  function solveSystem(ctx, eqs, unknowns) {
    eqs = eqs.filter(e => !e.isZero());
    const unk = new Set(unknowns);
    const rest = [];
    for (const e of eqs) {
      const vs = [...e.vars()].filter(v => unk.has(v));
      if (!vs.length) {
        if (e.isConst()) return { sols: [], free: [] };
        const ch = checkRel(ctx, { p: e }, '=');
        if (ch === false) return { sols: [], free: [] };
        throw unsupported('조건이 ‘문자로 남김’ 매개요소의 값을 정하게 됩니다. 그 매개요소를 ‘조건으로 결정’으로 바꾸세요.');
      }
      rest.push(e);
    }
    if (!rest.length) return { sols: [{}], free: [...unk] };
    // 1) 일차 소거 (계수가 수)
    for (const e of rest) for (const u of e.vars()) {
      if (!unk.has(u) || e.deg(u) !== 1) continue;
      const c = e.coef(u, 1); if (!c.isConst()) continue;
      const expr = e.coef(u, 0).scale(Fr.ONE.div(c.cv()).neg());
      const others = rest.filter(x => x !== e).map(x => x.subst(u, expr));
      const sub = solveSystem(ctx, others, [...unk].filter(x => x !== u));
      return { sols: sub.sols.map(s => Object.assign({}, s, { [u]: evalP(expr, s) })), free: sub.free };
    }
    // 2) 한 문자 방정식 (수치 계수)
    for (const e of rest) {
      const vs = [...e.vars()];
      if (vs.length !== 1 || !unk.has(vs[0])) continue;
      const u = vs[0]; const roots = solveUni(e, u); const sols = []; let free = [];
      for (const rt of roots) {
        const others = rest.filter(x => x !== e);
        if (rt.isRat()) {
          const rp = P.c(rt.a);
          const sub = solveSystem(ctx, others.map(x => x.subst(u, rp)), [...unk].filter(x => x !== u));
          sub.sols.forEach(s => sols.push(Object.assign({}, s, { [u]: { p: rp } }))); free = sub.free;
        } else {
          if (others.some(x => [...x.vars()].some(v => v !== u))) throw unsupported('무리수 해를 다른 식에 대입해야 하는 연립방정식은 지원하지 않습니다.');
          if (others.every(x => evalQR(x, { [u]: rt }).sign() === 0)) sols.push({ [u]: { q: rt } });
        }
      }
      return { sols, free };
    }
    throw unsupported('조건으로 만든 연립방정식이 엔진이 푸는 형태(일차 소거, 한 문자의 다항방정식)가 아닙니다.');
  }

  // ─────────────────── 함수 관련 도우미 ───────────────────
  function getF(ctx, name) { const F = ctx.F[name]; if (!F) throw new EngineError(`함수 ${name}이(가) 없습니다.`); return F; }
  const fAt = (F, x) => F.poly.subst('x', x);
  function needConstA(F, what) {
    if (!F.A.isConst()) throw unsupported(`${F.name}(x)의 x² 계수가 문자여서 ${what}을(를) 구하려면 경우 나누기가 필요합니다.`);
  }

  // 꼭짓점 구하기 + 풀이 단계
  function vertexOf(ctx, F) {
    needConstA(F, '꼭짓점');
    const A = F.A.cv(); if (A.isZero()) throw new EngineError(`${F.name}(x)는 이차함수가 아닙니다.`);
    const h = F.B.scale(Fr.ONE.div(new Fr(-2).mul(A)));
    const k = fAt(F, h);
    const allowed = (ctx.spec.solve && ctx.spec.solve.allowed) || [];
    const forbidden = (ctx.spec.solve && ctx.spec.solve.forbidden) || [];
    let method = '완전제곱식';
    if ((allowed.includes('꼭짓점 공식') && !allowed.includes('완전제곱식')) || forbidden.includes('완전제곱식')) method = '꼭짓점 공식';
    const steps = [];
    const n = F.name;
    if (method === '완전제곱식') {
      ctx.methods.add('완전제곱식');
      const sq = (pl) => leadCoef(A, pl) + '(' + shiftStr('x', h, pl) + ')' + (pl ? '²' : '^2') + plusTerm(k, pl);
      if (ctx.level === '상세' && !A.eq(Fr.ONE)) {
        const inner = (pl) => leadCoef(A, pl) + '(' + xtex(P.v('x').pow(2).add(P.v('x').mul(F.B.scale(Fr.ONE.div(A)))), pl) + ')' + plusTerm(F.C, pl);
        steps.push({ rule: '완전제곱식', parts: ['x² 항의 계수로 묶으면 ', M(n + '(x) = ' + inner(false), n + '(x) = ' + inner(true))] });
      }
      steps.push({ rule: '완전제곱식', parts: ['완전제곱식으로 고치면 ', M(n + '(x) = ' + xtex(F.poly, false) + ' = ' + sq(false), n + '(x) = ' + xtex(F.poly, true) + ' = ' + sq(true))] });
    } else {
      ctx.methods.add('꼭짓점 공식');
      const tx = (pl) => 'x = ' + MINUS(pl) + (pl ? '(' + ptex(F.B, true) + ')/(2·' + A.plain() + ')' : '\\frac{' + ptex(F.B, false) + '}{2 \\cdot ' + (A.sign() < 0 ? '(' + A.tex() + ')' : A.tex()) + '}') + ' = ' + ptex(h, pl);
      steps.push({ rule: '꼭짓점 공식', parts: ['꼭짓점의 x좌표는 ', M(tx(false), tx(true))] });
      steps.push({ rule: '대입', parts: ['이 값을 대입하면 ', M(n + '(' + ptex(h, false) + ') = ' + ptex(k, false), n + '(' + ptex(h, true) + ') = ' + ptex(k, true))] });
    }
    steps.push({ rule: '꼭짓점', parts: ['꼭짓점의 좌표는 ', M('(' + ptex(h, false) + ',\\ ' + ptex(k, false) + ')', '(' + ptex(h, true) + ', ' + ptex(k, true) + ')'), '이다.'] });
    return { h, k, A, steps, method };
  }

  // 제약 표기
  function con(l, rel, r) { return { l, r, rel, p: l.sub(r) }; }
  function conM(c) { return M(ptex(c.l, false) + ' ' + relStr(c.rel, false) + ' ' + ptex(c.r, false), ptex(c.l, true) + ' ' + relStr(c.rel, true) + ' ' + ptex(c.r, true)); }

  // 최댓값/최솟값 후보(경우별)
  // 반환: [{cons:[], val:P|null, label, steps:[]}]
  function extremumOptions(ctx, F, kind) {
    const d = F.dom; const kindKo = kind === 'min' ? '최솟값' : '최댓값';
    const n = F.name;
    const fv = (x, pl) => n + '(' + ptex(x, pl) + ')';
    const valStep = (x, label) => ({ rule: label ? '경우 나누기' : '판정', parts: [(label ? label + ' ' : ''), kindKo + '은 ', M(fv(x, false) + ' = ' + ptex(fAt(F, x), false), fv(x, true) + ' = ' + ptex(fAt(F, x), true)), '이다.'] });
    const noneStep = (why) => ({ rule: '판정', parts: [why + ' ' + kindKo + '은 존재하지 않는다.'] });
    if (F.deg === 2 || !F.A.isZero()) {
      needConstA(F, kindKo);
      const V = vertexOf(ctx, F); const { h, k, A } = V;
      const up = A.sign() > 0; const vertexKind = up ? 'min' : 'max';
      const opts = [];
      const vstep = (label) => ({ rule: label ? '경우 나누기' : '판정', parts: [(label ? label + ' ' : ''), '꼭짓점에서 ' + kindKo + '을 가지므로 ' + kindKo + '은 ', M(ptex(k, false), ptex(k, true)), '이다.'] });
      const dirKo = up ? '아래로 볼록' : '위로 볼록';
      const intro = { rule: '그래프 해석', parts: ['x²의 계수가 ' + (up ? '양수' : '음수') + '이므로 그래프는 ' + dirKo + '이다.'] };
      if (kind === vertexKind) {
        if (d.type === 'R') opts.push({ cons: [], val: k, steps: [vstep()] });
        if (d.type === 'interval' || d.type === 'ge') opts.push({ cons: [con(h, '<', d.lo)], val: d.loC ? fAt(F, d.lo) : null, label: '꼭짓점이 정의역의 왼쪽에 있는 경우', at: d.lo });
        if (d.type === 'interval') opts.push({ cons: [con(h, '>=', d.lo), con(h, '<=', d.hi)], val: k, label: '꼭짓점이 정의역 안에 있는 경우', vertex: true });
        if (d.type === 'ge') opts.push({ cons: [con(h, '>=', d.lo)], val: k, label: '꼭짓점이 정의역 안에 있는 경우', vertex: true });
        if (d.type === 'le') opts.push({ cons: [con(h, '<=', d.hi)], val: k, label: '꼭짓점이 정의역 안에 있는 경우', vertex: true });
        if (d.type === 'interval' || d.type === 'le') opts.push({ cons: [con(h, '>', d.hi)], val: d.hiC ? fAt(F, d.hi) : null, label: '꼭짓점이 정의역의 오른쪽에 있는 경우', at: d.hi });
      } else {
        if (d.type === 'interval') {
          const mid = d.lo.add(d.hi).scale(new Fr(1, 2));
          opts.push({ cons: [con(h, '<=', mid)], val: d.hiC ? fAt(F, d.hi) : null, label: '꼭짓점이 정의역의 가운데보다 왼쪽(또는 가운데)에 있는 경우', at: d.hi, far: true });
          opts.push({ cons: [con(h, '>', mid)], val: d.loC ? fAt(F, d.lo) : null, label: '꼭짓점이 정의역의 가운데보다 오른쪽에 있는 경우', at: d.lo, far: true });
        } else opts.push({ cons: [], val: null, none: true });
      }
      // 단계
      for (const o of opts) {
        o.steps = [...V.steps, intro];
        if (o.none) { o.steps.push(noneStep('정의역에서 함숫값이 한없이 ' + (up ? '커지므로' : '작아지므로'))); continue; }
        if (!o.label) { o.steps.push(...(o.stepsExtra || []), vstep()); continue; }
        const cm = o.cons.map(conM);
        if (o.cons.every(c => c.p.isConst())) {
          const hM = M(ptex(h, false), ptex(h, true));
          const where = o.vertex ? '가 정의역에 속하므로' : o.far ? (o.at === d.hi ? '가 정의역의 가운데보다 왼쪽(또는 가운데)에 있으므로' : '가 정의역의 가운데보다 오른쪽에 있으므로') : (o.at === d.lo ? '가 정의역보다 왼쪽에 있으므로' : '가 정의역보다 오른쪽에 있으므로');
          o.steps.push({ rule: '판정', parts: ['꼭짓점의 x좌표 ', hM, where.replace(/^가/, mjosa(ptex(h, true), '이', '가'))] });
        } else o.steps.push({ rule: '경우 나누기', parts: [o.label + ' (', ...cm.flatMap((m, i) => i ? [', ', m] : [m]), ')'] });
        if (o.val === null) o.steps.push(noneStep('정의역의 끝점이 포함되지 않으므로'));
        else if (o.vertex) o.steps.push(vstep());
        else o.steps.push({ rule: '판정', parts: [o.far ? '꼭짓점에서 더 먼 끝점에서 ' : '꼭짓점에 가장 가까운 끝점에서 ', kindKo + '을 가지므로 ', M(fv(o.at, false) + ' = ' + ptex(o.val, false), fv(o.at, true) + ' = ' + ptex(o.val, true))] });
      }
      return opts;
    }
    // 일차(또는 상수) 함수
    const m = F.B; const opts = [];
    const inc = { label: '기울기가 양수인 경우', cons: [con(m, '>', P.c(0))] };
    const dec = { label: '기울기가 음수인 경우', cons: [con(m, '<', P.c(0))] };
    const flat = { label: '기울기가 0인 경우', cons: [con(m, '=', P.c(0))] };
    const atMinInc = kind === 'min'; // 증가: 최솟값은 왼쪽 끝
    const endVal = (useLo) => {
      if (useLo) { if (!d.lo) return { val: null, unbounded: true }; return { val: d.loC ? fAt(F, d.lo) : null, at: d.lo }; }
      if (!d.hi) return { val: null, unbounded: true }; return { val: d.hiC ? fAt(F, d.hi) : null, at: d.hi };
    };
    Object.assign(inc, endVal(atMinInc)); Object.assign(dec, endVal(!atMinInc));
    flat.val = F.C; flat.flat = true;
    for (const o of [inc, dec, flat]) {
      if (m.isConst()) { const s = m.cv().sign(); if ((o === inc && s <= 0) || (o === dec && s >= 0) || (o === flat && s !== 0)) continue; o.cons = []; }
      opts.push(o);
    }
    for (const o of opts) {
      o.steps = [];
      const cm = o.cons.map(conM);
      if (o.cons.length) o.steps.push({ rule: '경우 나누기', parts: [o.label + ' (', ...cm, ')'] });
      else o.steps.push({ rule: '그래프 해석', parts: [n + '(x)는 ' + (o === inc ? 'x의 값이 커지면 함숫값도 커지는 일차함수' : o === dec ? 'x의 값이 커지면 함숫값이 작아지는 일차함수' : '상수함수') + '이다.'] });
      if (o.flat) o.steps.push({ rule: '판정', parts: [kindKo + '은 ', M(ptex(F.C, false), ptex(F.C, true))] });
      else if (o.val === null) o.steps.push(noneStep(o.unbounded ? '정의역이 한쪽으로 끝없이 이어지므로' : '해당하는 끝점이 정의역에 포함되지 않으므로'));
      else o.steps.push({ rule: '판정', parts: [kindKo + '은 ', M(fv(o.at, false) + ' = ' + ptex(o.val, false), fv(o.at, true) + ' = ' + ptex(o.val, true))] });
    }
    return opts;
  }

  // 판별식
  function discInfo(ctx, A, B, C, label) {
    ctx.methods.add('판별식');
    const half = B.scale(new Fr(1, 2));
    const useQuarter = half.intContent() && B.intContent();
    const D = useQuarter ? half.mul(half).sub(A.mul(C)) : B.mul(B).sub(A.mul(C).scale(4));
    const name = useQuarter ? 'D/4' : 'D';
    const texName = useQuarter ? '\\frac{D}{4}' : 'D';
    const expr = useQuarter
      ? (pl) => wrap(half, pl) + (pl ? '²' : '^2') + ' ' + MINUS(pl) + ' ' + wrap(A, pl) + (pl ? '·' : '\\cdot ') + wrap(C, pl)
      : (pl) => wrap(B, pl) + (pl ? '²' : '^2') + ' ' + MINUS(pl) + ' 4' + (pl ? '·' : '\\cdot ') + wrap(A, pl) + (pl ? '·' : '\\cdot ') + wrap(C, pl);
    const step = { rule: '판별식', parts: [label + '의 판별식을 D라 하면 ', M(texName + ' = ' + expr(false) + ' = ' + ptex(D, false), name + ' = ' + expr(true) + ' = ' + ptex(D, true))] };
    return { D, name, texName, step };
  }
  function wrap(p, pl) { const s = ptex(p, pl); return (p.t.size > 1 || p.leadSign() < 0) ? '(' + s + ')' : s; }

  // ───────────── 조건 → 경우(옵션) 목록 ─────────────
  // 옵션: {eqs:[P], cons:[con], steps:[]}
  function condOptions(ctx, c, idx) {
    const pe = (s, what) => ctx.parse(s, what);
    const label = `조건 ${idx + 1}`;
    switch (c.type) {
      case 'value': {
        const F = getF(ctx, c.fn); const x0 = pe(c.x0, label + ' x값'), y0 = pe(c.y0, label + ' 함숫값');
        const lhs = fAt(F, x0);
        ctx.methods.add('대입');
        return [{ eqs: [lhs.sub(y0)], cons: [], steps: [{ rule: '대입', parts: [M(F.name + '(' + ptex(x0, false) + ') = ' + ptex(y0, false), F.name + '(' + ptex(x0, true) + ') = ' + ptex(y0, true)), '에서 ', M(ptex(lhs, false) + ' = ' + ptex(y0, false), ptex(lhs, true) + ' = ' + ptex(y0, true))] }] }];
      }
      case 'root': {
        const F = getF(ctx, c.fn); const r = pe(c.r, label + ' 근'); const lhs = fAt(F, r);
        ctx.methods.add('대입');
        return [{ eqs: [lhs], cons: [], steps: [{ rule: '대입', parts: ['x = ', M(ptex(r, false), ptex(r, true)), '이 방정식 ', M(F.name + '(x) = 0', F.name + '(x) = 0'), '의 근이므로 ', M(ptex(lhs, false) + ' = 0', ptex(lhs, true) + ' = 0')] }] }];
      }
      case 'vertex': {
        const F = getF(ctx, c.fn); const V = vertexOf(ctx, F); const eqs = [];
        const steps = [...V.steps];
        if (c.vx !== undefined && c.vx !== '') { const vx = pe(c.vx, label + ' 꼭짓점 x좌표'); eqs.push(V.h.sub(vx)); steps.push({ rule: '대입', parts: ['꼭짓점의 x좌표가 ', M(ptex(vx, false), ptex(vx, true)), '이므로 ', M(ptex(V.h, false) + ' = ' + ptex(vx, false), ptex(V.h, true) + ' = ' + ptex(vx, true))] }); }
        if (c.vy !== undefined && c.vy !== '') { const vy = pe(c.vy, label + ' 꼭짓점 y좌표'); eqs.push(V.k.sub(vy)); steps.push({ rule: '대입', parts: ['꼭짓점의 y좌표가 ', M(ptex(vy, false), ptex(vy, true)), '이므로 ', M(ptex(V.k, false) + ' = ' + ptex(vy, false), ptex(V.k, true) + ' = ' + ptex(vy, true))] }); }
        return [{ eqs, cons: [], steps }];
      }
      case 'min': case 'max': {
        const F = getF(ctx, c.fn); const v = pe(c.v, label + ' 값');
        const kindKo = c.type === 'min' ? '최솟값' : '최댓값';
        return extremumOptions(ctx, F, c.type).filter(o => o.val !== null).map(o => ({
          eqs: [o.val.sub(v)], cons: o.cons, label: o.label,
          steps: [...o.steps, { rule: '대입', parts: [kindKo + '이 ', M(ptex(v, false), ptex(v, true)), '이므로 ', M(ptex(o.val, false) + ' = ' + ptex(v, false), ptex(o.val, true) + ' = ' + ptex(v, true))] }],
        }));
      }
      case 'range': {
        const F = getF(ctx, c.fn);
        if (F.dom.type !== 'interval') throw unsupported('치역 조건은 정의역이 닫힌구간일 때만 엔진이 다룹니다.');
        const m = pe(c.m, label + ' 치역 최솟값'), Mx = pe(c.M, label + ' 치역 최댓값');
        const mins = extremumOptions(ctx, F, 'min').filter(o => o.val !== null);
        const maxs = extremumOptions(ctx, F, 'max').filter(o => o.val !== null);
        const out = [];
        for (const a of mins) for (const b of maxs) {
          const cons = [...a.cons, ...b.cons];
          // 같은 성질의 경우만 결합(일차함수: 증가-증가)
          if (a.label && b.label && F.deg < 2 && a.label !== b.label) continue;
          const steps = F.deg < 2 ? a.steps.slice(0, -1).concat([a.steps[a.steps.length - 1], b.steps[b.steps.length - 1]]) : [...a.steps, ...b.steps.filter(s => !a.steps.includes(s))];
          steps.push({ rule: '대입', parts: ['치역이 ', M('\\{y \\mid ' + ptex(m, false) + ' \\le y \\le ' + ptex(Mx, false) + '\\}', '{y | ' + ptex(m, true) + ' ≤ y ≤ ' + ptex(Mx, true) + '}'), '이므로 ', M(ptex(a.val, false) + ' = ' + ptex(m, false) + ',\\ ' + ptex(b.val, false) + ' = ' + ptex(Mx, false), ptex(a.val, true) + ' = ' + ptex(m, true) + ', ' + ptex(b.val, true) + ' = ' + ptex(Mx, true))] });
          out.push({ eqs: [a.val.sub(m), b.val.sub(Mx)], cons, steps, label: a.label });
        }
        return out;
      }
      case 'xaxis': case 'intersect': {
        let A, B, C, what;
        if (c.type === 'xaxis') { const F = getF(ctx, c.fn); A = F.A; B = F.B; C = F.C; what = '이차방정식 ' + F.name + '(x) = 0'; if (F.A.isZero()) throw unsupported('x축과의 위치 관계는 이차함수일 때 판별식으로 다룹니다.'); }
        else {
          const F = getF(ctx, c.fn), G = getF(ctx, c.fn2); const H = F.poly.sub(G.poly); const cs = H.coeffs('x');
          A = cs[2] || new P(); B = cs[1] || new P(); C = cs[0] || new P();
          what = '방정식 ' + F.name + '(x) = ' + G.name + '(x), 즉 ' + xtex(H, true) + ' = 0';
          if (A.isZero()) throw unsupported('두 그래프의 교점 조건은 정리한 식이 이차식일 때 판별식으로 다룹니다.');
        }
        const di = discInfo(ctx, A, B, C, what);
        const relMap = { touch: '=', two: '>', none: '<', meet: '>=' };
        const descMap = { touch: '중근을 가지므로', two: '서로 다른 두 실근을 가지므로', none: '실근을 갖지 않으므로', meet: '실근을 가지므로' };
        const rel = relMap[c.rel || 'touch'];
        const zero = P.c(0);
        const st = { rule: '판별식', parts: [descMap[c.rel || 'touch'] + ' ', M(di.texName + ' ' + relStr(rel, false) + ' 0', di.name + ' ' + relStr(rel, true) + ' 0')] };
        const steps = [di.step, st];
        const cons = A.isConst() ? [] : [con(A, '!=', zero)];
        if (rel === '=') return [{ eqs: [di.D], cons, steps }];
        return [{ eqs: [], cons: cons.concat([con(di.D, rel, zero)]), steps, ineq: true }];
      }
      case 'rootSum': case 'rootProd': {
        const F = getF(ctx, c.fn); const s = pe(c.s, label + ' 값');
        if (F.A.isZero()) throw unsupported('근과 계수의 관계는 이차방정식일 때만 씁니다.');
        ctx.methods.add('근과 계수의 관계');
        const isSum = c.type === 'rootSum';
        const lhs = isSum ? F.B.neg() : F.C; // -B/A = s → -B = sA
        const expr = (pl) => isSum ? MINUS(pl) + (pl ? '(' + ptex(F.B, true) + ')/(' + ptex(F.A, true) + ')' : '\\frac{' + ptex(F.B, false) + '}{' + ptex(F.A, false) + '}') : (pl ? '(' + ptex(F.C, true) + ')/(' + ptex(F.A, true) + ')' : '\\frac{' + ptex(F.C, false) + '}{' + ptex(F.A, false) + '}');
        return [{ eqs: [lhs.sub(F.A.mul(s))], cons: F.A.isConst() ? [] : [con(F.A, '!=', P.c(0))], steps: [{ rule: '근과 계수의 관계', parts: ['근과 계수의 관계에 의하여 두 근의 ' + (isSum ? '합' : '곱') + '은 ', M(expr(false) + ' = ' + ptex(s, false), expr(true) + ' = ' + ptex(s, true))] }] }];
      }
      case 'passes': {
        const F = getF(ctx, c.fn); const A = ctx.Pts[c.pt];
        if (!A) throw new EngineError(label + ': 점을 고르세요.');
        const lhs = fAt(F, A.x); ctx.methods.add('대입');
        return [{ eqs: [lhs.sub(A.y)], cons: [], steps: [{ rule: '대입', parts: ['y = ' + F.name + '(x)의 그래프가 점 ', ptM(A), mjosa(ptM(A).plain, '을', '를') + ' 지나므로 ', M(F.name + '(' + ptex(A.x, false) + ') = ' + ptex(A.y, false), F.name + '(' + ptex(A.x, true) + ') = ' + ptex(A.y, true)), '에서 ', M(ptex(lhs, false) + ' = ' + ptex(A.y, false), ptex(lhs, true) + ' = ' + ptex(A.y, true))] }] }];
      }
      case 'custom': {
        const l = pe(c.lhs, label + ' 왼쪽 식'), r = pe(c.rhs, label + ' 오른쪽 식'); const rel = c.rel || '=';
        const m = M(ptex(l, false) + ' ' + relStr(rel, false) + ' ' + ptex(r, false), ptex(l, true) + ' ' + relStr(rel, true) + ' ' + ptex(r, true));
        const raw = customM(ctx, c);
        const st = raw.plain.replace(/\s/g, '') === m.plain.replace(/\s/g, '') ? { rule: '조건', parts: ['조건에서 ', m] } : { rule: '조건', parts: ['조건 ', raw, '에서 ', m] };
        if (rel === '=') return [{ eqs: [l.sub(r)], cons: [], steps: [st] }];
        return [{ eqs: [], cons: [con(l, rel, r)], steps: [st], ineq: true }];
      }
    }
    throw new EngineError('알 수 없는 조건 종류: ' + c.type);
  }

  // ───────────── 구할 것 → 경우 목록 ─────────────
  // 옵션: {cons:[], val: {kind, ...}, steps}
  function targetOptions(ctx) {
    const t = ctx.spec.target || {};
    const pe = (s, what) => ctx.parse(s, what);
    const num = (p) => ({ kind: 'num', p });
    switch (t.type) {
      case 'param': {
        if (!t.param) throw new EngineError('구할 매개요소를 고르세요.');
        return [{ cons: [], val: num(P.v(t.param)), steps: [] }];
      }
      case 'expr': {
        if (!t.expr) throw new EngineError('구할 식을 입력하세요.');
        const p = pe(t.expr, '구할 식');
        return [{ cons: [], val: num(p), steps: [], exprLabel: p }];
      }
      case 'fval': {
        const F = getF(ctx, t.fn); const k = pe(t.k, '구할 함숫값의 x'); const v = fAt(F, k);
        return [{ cons: [], val: num(v), steps: [{ rule: '대입', parts: [M(F.name + '(' + ptex(k, false) + ') = ' + ptex(v, false), F.name + '(' + ptex(k, true) + ') = ' + ptex(v, true))] }] }];
      }
      case 'compose': {
        const F = getF(ctx, t.fn), G = getF(ctx, t.fn2); const k = pe(t.k, '합성함수의 x'); const inner = fAt(G, k); const v = fAt(F, inner);
        ctx.methods.add('합성함수');
        return [{ cons: [], val: num(v), steps: [
          { rule: '합성함수', parts: [M('(' + F.name + ' \\circ ' + G.name + ')(' + ptex(k, false) + ') = ' + F.name + '(' + G.name + '(' + ptex(k, false) + '))', '(' + F.name + '∘' + G.name + ')(' + ptex(k, true) + ') = ' + F.name + '(' + G.name + '(' + ptex(k, true) + '))')] },
          { rule: '대입', parts: [M(G.name + '(' + ptex(k, false) + ') = ' + ptex(inner, false), G.name + '(' + ptex(k, true) + ') = ' + ptex(inner, true)), '이므로 ', M(F.name + '(' + ptex(inner, false) + ') = ' + ptex(v, false), F.name + '(' + ptex(inner, true) + ') = ' + ptex(v, true))] },
        ] }];
      }
      case 'vertex': case 'axis': {
        const F = getF(ctx, t.fn); const V = vertexOf(ctx, F);
        if (t.type === 'axis') return [{ cons: [], val: { kind: 'axis', p: V.h }, steps: V.steps.concat([{ rule: '판정', parts: ['축의 방정식은 ', M('x = ' + ptex(V.h, false), 'x = ' + ptex(V.h, true))] }]) }];
        return [{ cons: [], val: { kind: 'pair', x: V.h, y: V.k }, steps: V.steps }];
      }
      case 'min': case 'max': {
        const F = getF(ctx, t.fn);
        return extremumOptions(ctx, F, t.type).map(o => ({ cons: o.cons, val: o.val === null ? { kind: 'none', text: (t.type === 'min' ? '최솟값' : '최댓값') + '은 없다' } : num(o.val), steps: o.steps, label: o.label }));
      }
      case 'maxmin': {
        const F = getF(ctx, t.fn); const out = [];
        const mins = extremumOptions(ctx, F, 'min'), maxs = extremumOptions(ctx, F, 'max');
        for (const a of mins) for (const b of maxs) {
          if (F.deg < 2 && a.label !== b.label) continue;
          if (a.val === null || b.val === null) { out.push({ cons: [...a.cons, ...b.cons], val: { kind: 'none', text: '최댓값 또는 최솟값이 없다' }, steps: [...a.steps, ...b.steps] }); continue; }
          const s = a.val.add(b.val);
          out.push({ cons: [...a.cons, ...b.cons], val: num(s), steps: [...a.steps, ...b.steps.filter(x => !a.steps.includes(x)), { rule: '계산', parts: ['따라서 최댓값과 최솟값의 합은 ', M(ptex(b.val, false) + ' + (' + ptex(a.val, false) + ') = ' + ptex(s, false), ptex(b.val, true) + ' + (' + ptex(a.val, true) + ') = ' + ptex(s, true))] }] });
        }
        return out;
      }
      case 'range': {
        const F = getF(ctx, t.fn); const out = [];
        if (F.dom.type === 'interval' && (!F.dom.loC || !F.dom.hiC)) throw unsupported('정의역 끝점이 열려 있을 때의 치역은 엔진이 지원하지 않습니다.');
        const mins = extremumOptions(ctx, F, 'min'), maxs = extremumOptions(ctx, F, 'max');
        for (const a of mins) for (const b of maxs) {
          if (F.deg < 2 && a.label !== b.label) continue;
          out.push({ cons: [...a.cons, ...b.cons], val: { kind: 'range', lo: a.val, hi: b.val }, steps: [...a.steps, ...b.steps.filter(x => !a.steps.includes(x))] });
        }
        return out;
      }
      case 'roots': case 'rootCount': case 'yint': case 'intersectX': {
        if (t.type === 'yint') { const F = getF(ctx, t.fn); const v = F.C; return [{ cons: [], val: num(v), steps: [{ rule: '대입', parts: ['y절편은 ', M(F.name + '(0) = ' + ptex(v, false), F.name + '(0) = ' + ptex(v, true))] }] }]; }
        let H, label, doms;
        if (t.type === 'intersectX') { const F = getF(ctx, t.fn), G = getF(ctx, t.fn2); H = F.poly.sub(G.poly); label = F.name + '(x) = ' + G.name + '(x)'; doms = [F.dom, G.dom]; }
        else { const F = getF(ctx, t.fn); H = F.poly; label = F.name + '(x) = 0'; doms = [F.dom]; }
        return [{ cons: [], val: { kind: t.type === 'rootCount' ? 'rootCount' : 'roots', poly: H, doms, label }, steps: [] }];
      }
      case 'rootSum': case 'rootProd': {
        const F = getF(ctx, t.fn); needConstA(F, '두 근의 ' + (t.type === 'rootSum' ? '합' : '곱'));
        if (F.A.isZero()) throw new EngineError('이차방정식이 아닙니다.');
        ctx.methods.add('근과 계수의 관계');
        const v = t.type === 'rootSum' ? F.B.scale(Fr.ONE.div(F.A.cv())).neg() : F.C.scale(Fr.ONE.div(F.A.cv()));
        return [{ cons: [], val: num(v), steps: [{ rule: '근과 계수의 관계', parts: ['근과 계수의 관계에 의하여 두 근의 ' + (t.type === 'rootSum' ? '합' : '곱') + '은 ', M(ptex(v, false), ptex(v, true))] }] }];
      }
      case 'solSum': case 'solCount': case 'paramRange': case 'intCount': case 'intSum': {
        if (!t.param) throw new EngineError('대상 매개요소를 고르세요.');
        return [{ cons: [], val: { kind: 'agg', agg: t.type, param: t.param }, steps: [] }];
      }
    }
    throw new EngineError('구할 것을 고르세요.');
  }

  // ───────────── 구간 집합(부등식 풀이) ─────────────
  // 구간: {lo:QR|null, loC, hi:QR|null, hiC}
  function ineqSet(poly, u, rel) {
    const roots = solveUni(poly, u);
    const pts = roots.map(r => r.val());
    const out = [];
    const evalAt = (x) => { let s = 0; const cs = poly.coeffs(u).map(c => c.cv().val()); for (let i = cs.length - 1; i >= 0; i--) s = s * x + cs[i]; return s; };
    const ok = (s) => relHolds(Math.abs(s) < 1e-12 ? 0 : Math.sign(s), rel);
    const bounds = [null, ...roots, null];
    for (let i = 0; i < bounds.length - 1; i++) {
      const a = bounds[i], b = bounds[i + 1];
      let sample;
      if (a === null && b === null) sample = 0; else if (a === null) sample = b.val() - 1; else if (b === null) sample = a.val() + 1; else sample = (a.val() + b.val()) / 2;
      if (ok(evalAt(sample))) out.push({ lo: a, loC: false, hi: b, hiC: false });
    }
    roots.forEach(r => { if (ok(0)) out.push({ lo: r, loC: true, hi: r, hiC: true }); });
    return normalize(out);
  }
  function normalize(set) {
    const s = set.slice().sort((x, y) => (x.lo === null ? -Infinity : x.lo.val()) - (y.lo === null ? -Infinity : y.lo.val()));
    const out = [];
    for (const iv of s) {
      const last = out[out.length - 1];
      if (last) {
        const lh = last.hi === null ? Infinity : last.hi.val(), il = iv.lo === null ? -Infinity : iv.lo.val();
        if (il < lh - 1e-12 || (Math.abs(il - lh) < 1e-12 && (last.hiC || iv.loC))) {
          const ih = iv.hi === null ? Infinity : iv.hi.val();
          if (ih > lh + 1e-12) { last.hi = iv.hi; last.hiC = iv.hiC; } else if (Math.abs(ih - lh) < 1e-12) last.hiC = last.hiC || iv.hiC;
          continue;
        }
      }
      out.push(Object.assign({}, iv));
    }
    return out;
  }
  function intersect(A, B) {
    const out = [];
    for (const a of A) for (const b of B) {
      const al = a.lo === null ? -Infinity : a.lo.val(), bl = b.lo === null ? -Infinity : b.lo.val();
      const ah = a.hi === null ? Infinity : a.hi.val(), bh = b.hi === null ? Infinity : b.hi.val();
      let lo, loC, hi, hiC;
      if (al > bl + 1e-12) { lo = a.lo; loC = a.loC; } else if (bl > al + 1e-12) { lo = b.lo; loC = b.loC; } else { lo = a.lo; loC = a.loC && b.loC; }
      if (ah < bh - 1e-12) { hi = a.hi; hiC = a.hiC; } else if (bh < ah - 1e-12) { hi = b.hi; hiC = b.hiC; } else { hi = a.hi; hiC = a.hiC && b.hiC; }
      const l = lo === null ? -Infinity : lo.val(), h = hi === null ? Infinity : hi.val();
      if (l < h - 1e-12 || (Math.abs(l - h) < 1e-12 && loC && hiC)) out.push({ lo, loC, hi, hiC });
    }
    return normalize(out);
  }
  const ALL = () => [{ lo: null, loC: false, hi: null, hiC: false }];
  function boundSet(b) {
    if (!b) return ALL();
    return [{ lo: b.lo ? QR.of(b.lo) : null, loC: !b.loS, hi: b.hi ? QR.of(b.hi) : null, hiC: !b.hiS }];
  }
  function setStr(set, u, plain) {
    if (!set.length) return plain ? '없음' : '\\text{없음}';
    const le = relStr('<=', plain);
    const s = (q) => plain ? q.plain() : q.tex();
    const parts = set.map(iv => {
      if (iv.lo === null && iv.hi === null) return plain ? '모든 실수' : '\\text{모든 실수}';
      if (iv.lo && iv.hi && iv.lo.eq(iv.hi)) return u + ' = ' + s(iv.lo);
      if (iv.lo === null) return u + ' ' + (iv.hiC ? le : '<') + ' ' + s(iv.hi);
      if (iv.hi === null) return u + ' ' + (iv.loC ? relStr('>=', plain) : '>') + ' ' + s(iv.lo);
      return s(iv.lo) + ' ' + (iv.loC ? le : '<') + ' ' + u + ' ' + (iv.hiC ? le : '<') + ' ' + s(iv.hi);
    });
    return parts.join(plain ? ' 또는 ' : '\\ \\text{또는}\\ ');
  }
  function intsIn(set, limit) {
    const out = [];
    for (const iv of set) {
      if (iv.lo === null || iv.hi === null) return null; // 무한
      let a = Math.ceil(iv.lo.val() - 1e-9), b = Math.floor(iv.hi.val() + 1e-9);
      if (!iv.loC && Math.abs(a - iv.lo.val()) < 1e-9) a++;
      if (!iv.hiC && Math.abs(b - iv.hi.val()) < 1e-9) b--;
      for (let i = a; i <= b; i++) { out.push(i); if (out.length > (limit || 10000)) return null; }
    }
    return out;
  }

  // ───────────────────────── 풀이 실행 ─────────────────────────
  function solve(ctx) {
    const R = ctx.R, spec = ctx.spec;
    const conds = spec.conds || [];
    const t = spec.target || {};
    // 1) 조건별 경우 목록
    const optLists = conds.map((c, i) => condOptions(ctx, c, i));
    // 2) 조합
    let combos = [{ eqs: [], cons: [], steps: [], labels: [] }];
    optLists.forEach((opts, i) => {
      const next = [];
      for (const cmb of combos) for (const o of opts) next.push({ eqs: cmb.eqs.concat(o.eqs), cons: cmb.cons.concat(o.cons), steps: cmb.steps.concat(o.steps.map(s => Object.assign({ cond: i }, s))), labels: cmb.labels.concat(o.label ? [o.label] : []) });
      combos = next;
    });
    // 수만으로 결정되는 모순 경우 제거
    combos = combos.filter(cmb => cmb.cons.every(c => !(c.p.isConst() && !relHolds(c.p.cv().sign(), c.rel))));
    // 3) 각 경우 풀이
    const valid = []; const rejected = []; let freeUnknowns = null;
    const tOpts = targetOptions(ctx);
    const unknowns = ctx.unknowns;
    for (const cmb of combos) {
      const res = solveSystem(ctx, cmb.eqs, unknowns);
      cmb.sysSteps = systemSteps(ctx, cmb.eqs, res, unknowns);
      if (res.free.length) freeUnknowns = res.free;
      for (const sol of res.sols) {
        // 제약 확인
        let fail = null;
        for (const c of cmb.cons) {
          if (res.free.some(u => c.p.vars().has(u))) continue; // 자유 문자에 대한 부등식은 범위 풀이에서
          const V = evalP(c.p, sol); const ok = checkRel(ctx, V, c.rel);
          if (ok === null) throw unsupported('문자 ' + [...c.p.vars()].join(', ') + '의 값에 따라 경우가 나뉘는 문항입니다. (' + conM(c).plain + ' 인지 판정할 수 없음)');
          if (!ok) { fail = { con: c }; break; }
        }
        if (!fail) {
          for (const u of unknowns) {
            if (!sol[u]) continue; const b = ctx.bounds[u];
            const V = sol[u]; const q = toQR(V);
            const why = [];
            if (b.lo) { const ok = checkRel(ctx, V.q ? { q: V.q.sub(QR.of(b.lo)) } : { p: V.p.sub(P.c(b.lo)) }, b.loS ? '>' : '>='); if (ok === null) throw unsupported(u + '의 값이 문자에 따라 달라 범위 조건을 판정할 수 없습니다.'); if (!ok) why.push(M(u + ' ' + (b.loS ? '>' : '\\ge') + ' ' + b.lo.tex(), u + ' ' + (b.loS ? '>' : '≥') + ' ' + b.lo.plain())); }
            if (b.hi) { const ok = checkRel(ctx, V.q ? { q: V.q.sub(QR.of(b.hi)) } : { p: V.p.sub(P.c(b.hi)) }, b.hiS ? '<' : '<='); if (ok === null) throw unsupported(u + '의 값이 문자에 따라 달라 범위 조건을 판정할 수 없습니다.'); if (!ok) why.push(M(u + ' ' + (b.hiS ? '<' : '\\le') + ' ' + b.hi.tex(), u + ' ' + (b.hiS ? '<' : '≤') + ' ' + b.hi.plain())); }
            if (b.kind !== 'real') { if (!q) throw unsupported(u + '가 정수인지 판정할 수 없습니다.'); if (!q.isInt()) why.push(KIND_KO[b.kind] + ' 조건'); }
            if (why.length) { fail = { param: u, why }; break; }
          }
        }
        if (fail) rejected.push({ cmb, sol, fail });
        else valid.push({ cmb, sol });
      }
    }
    R.rejected = rejected;
    ctx.allCombos = combos;
    // 4) 답 계산
    const answers = [];
    const aggT = tOpts.length === 1 && tOpts[0].val.kind === 'agg' ? tOpts[0].val : null;
    if (aggT) return finishAgg(ctx, aggT, valid, rejected, combos, freeUnknowns);
    for (const v of valid) {
      // 구할 것의 경우 선택
      let chosen = null;
      for (const o of tOpts) {
        let ok = true;
        for (const c of o.cons) { const V = evalP(c.p, v.sol); const r = checkRel(ctx, V, c.rel); if (r === null) throw unsupported('구할 값이 문자 ' + [...c.p.vars()].join(', ') + '의 범위에 따라 달라집니다. 경우를 나누는 풀이가 필요합니다. (' + conM(c).plain + ' 인지 판정할 수 없음)'); if (!r) { ok = false; break; } }
        if (ok) { chosen = o; break; }
      }
      if (!chosen) continue;
      const out = evalTarget(ctx, chosen, v.sol);
      // 자유 문자가 남으면 유일하지 않음
      if (out.freeLeft) { R.warnings.push('조건이 부족하여 ' + out.freeLeft.join(', ') + '의 값이 정해지지 않습니다. 답이 하나로 정해지지 않습니다.'); }
      answers.push({ v, chosen, out });
    }
    assemble(ctx, answers, valid, rejected);
  }

  function systemSteps(ctx, eqs, res, unknowns) {
    const steps = [];
    const contra = eqs.find(e => e.isConst() && !e.isZero());
    if (contra) { steps.push({ rule: '판정', parts: ['이 등식은 성립하지 않으므로 이 경우에는 조건을 만족하는 값이 없다.'] }); return steps; }
    const nz = eqs.filter(e => !e.isZero() && [...e.vars()].some(v => unknowns.includes(v)));
    if (!nz.length) return steps;
    const eqM = (e) => {
      const c = e.cv(); let L = e.sub(P.c(c)), Rr = P.c(c).neg();
      if (L.t.size > 0 && [...L.t.values()].every(f => f.sign() < 0)) { L = L.neg(); Rr = Rr.neg(); }
      return M(ptex(L, false) + ' = ' + ptex(Rr, false), ptex(L, true) + ' = ' + ptex(Rr, true));
    };
    const solStr0 = (sol, pl) => unknowns.filter(u => sol[u]).map(u => u + ' = ' + vstr(sol[u], pl)).join(pl ? ', ' : ',\\ ');
    if (nz.length === 1 && [...nz[0].vars()].filter(v => unknowns.includes(v)).length === 1 && nz[0].deg([...nz[0].vars()].find(v => unknowns.includes(v))) === 1 && res.sols.length === 1) {
      const em = eqM(nz[0]); const sm = M(solStr0(res.sols[0], false), solStr0(res.sols[0], true));
      steps.push(em.plain === sm.plain ? { rule: '방정식', parts: ['따라서 ', sm] } : { rule: '방정식', parts: ['정리하면 ', em, '이므로 ', sm] });
      return steps;
    }
    const solStr = (sol, pl) => unknowns.filter(u => sol[u]).map(u => u + ' = ' + vstr(sol[u], pl)).join(pl ? ', ' : ',\\ ');
    if (nz.length === 1 && [...nz[0].vars()].length === 1 && nz[0].deg([...nz[0].vars()][0]) === 2) {
      const e = nz[0].leadSign() < 0 ? nz[0].neg() : nz[0]; const u = [...e.vars()][0];
      const roots = solveUni(e, u);
      if (roots.length && roots.every(r => r.isRat())) {
        ctx.methods.add('인수분해');
        const a = e.coef(u, 2).cv();
        const fac = (pl) => factorStr(u, roots, a, pl);
        steps.push({ rule: '인수분해', parts: [M(ptex(e, false) + ' = 0', ptex(e, true) + ' = 0'), '에서 ', M(fac(false) + ' = 0', fac(true) + ' = 0')] });
      } else if (roots.length) {
        ctx.methods.add('근의 공식');
        steps.push({ rule: '근의 공식', parts: [M(ptex(e, false) + ' = 0', ptex(e, true) + ' = 0'), '을 근의 공식으로 풀면'] });
      } else {
        steps.push({ rule: '판정', parts: [M(ptex(e, false) + ' = 0', ptex(e, true) + ' = 0'), '을 만족하는 실수 ' + u + '는 없다.'] });
      }
    } else {
      if (nz.length > 1) ctx.methods.add('연립방정식');
      else steps.push({ rule: '방정식', parts: ['정리하면 ', eqM(nz[0])] });
    }
    if (res.sols.length) {
      const list = res.sols.map(s => M(solStr(s, false), solStr(s, true)));
      steps.push({ rule: '풀이', parts: [nz.length > 1 ? '연립하여 풀면 ' : '풀면 ', ...list.flatMap((m, i) => i ? [' 또는 ', m] : [m])] });
    } else steps.push({ rule: '판정', parts: ['이 경우를 만족하는 값이 없다.'] });
    return steps;
  }

  // 구할 것 계산
  function evalTarget(ctx, o, sol) {
    const val = o.val; const res = { steps: o.steps.slice() };
    const freeCheck = (V) => { if (V.p) { const left = [...V.p.vars()].filter(v => ctx.unknowns.includes(v)); if (left.length) res.freeLeft = left; } return V; };
    switch (val.kind) {
      case 'num': {
        const V = freeCheck(evalP(val.p, sol)); res.V = V;
        res.tex = vstr(V, false); res.plain = vstr(V, true);
        const tt = ctx.spec.target.type;
        if (tt !== 'expr' && tt !== 'param' && [...val.p.vars()].some(v => sol[v])) {
          const used = [...val.p.vars()].filter(v => sol[v]).sort();
          const sp = (pl) => used.map(v => v + ' = ' + vstr(sol[v], pl)).join(pl ? ', ' : ',\\ ');
          res.steps.push({ rule: '대입', parts: [M(sp(false), sp(true)), mjosa(sp(true), '을', '를') + ' 대입하면 ', M(ptex(val.p, false) + ' = ' + res.tex, ptex(val.p, true) + ' = ' + res.plain)] });
        }
        if (tt === 'expr' || tt === 'param') {
          const lbl = ctx.spec.target.type === 'param' ? ctx.spec.target.param : ptex(val.p, false);
          const lblP = ctx.spec.target.type === 'param' ? ctx.spec.target.param : ptex(val.p, true);
          if (ctx.spec.target.type === 'expr' && !val.p.isConst() && Object.keys(sol).length) res.steps.push({ rule: '대입', parts: ['구한 값을 대입하면 ', M(lbl + ' = ' + res.tex, lblP + ' = ' + res.plain)] });
        }
        return res;
      }
      case 'none': res.tex = '\\text{' + val.text + '}'; res.plain = val.text; res.none = true; return res;
      case 'pair': { const x = freeCheck(evalP(val.x, sol)), y = freeCheck(evalP(val.y, sol)); res.tex = '(' + vstr(x, false) + ',\\ ' + vstr(y, false) + ')'; res.plain = '(' + vstr(x, true) + ', ' + vstr(y, true) + ')'; subStep(res, sol, [val.x, val.y], '꼭짓점의 좌표는 '); return res; }
      case 'axis': { const x = freeCheck(evalP(val.p, sol)); res.tex = 'x = ' + vstr(x, false); res.plain = 'x = ' + vstr(x, true); subStep(res, sol, [val.p], '축의 방정식은 '); return res; }
      case 'range': {
        const lo = val.lo ? freeCheck(evalP(val.lo, sol)) : null, hi = val.hi ? freeCheck(evalP(val.hi, sol)) : null;
        const le = (pl) => relStr('<=', pl);
        const b = (pl) => lo && hi ? vstr(lo, pl) + ' ' + le(pl) + ' y ' + le(pl) + ' ' + vstr(hi, pl) : lo ? 'y ' + relStr('>=', pl) + ' ' + vstr(lo, pl) : hi ? 'y ' + le(pl) + ' ' + vstr(hi, pl) : (pl ? '모든 실수' : '\\text{모든 실수}');
        res.tex = '\\{y \\mid ' + b(false) + '\\}'; res.plain = '{y | ' + b(true) + '}';
        res.steps.push({ rule: '판정', parts: ['따라서 치역은 ', M(res.tex, res.plain)] });
        return res;
      }
      case 'roots': case 'rootCount': {
        let H = val.poly;
        for (const v of H.vars()) if (v !== 'x') { const V = sol[v]; if (!V) { if (val.kind === 'rootCount' && !ctx.unknowns.includes(v)) return rootCountSymbolic(ctx, H, res, val); throw unsupported('방정식의 해를 구하려면 모든 계수가 정해져야 합니다.'); } }
        const ev = evalP(H, sol); if (ev.q) throw unsupported('계수가 무리수인 방정식은 지원하지 않습니다.');
        H = ev.p;
        if ([...H.vars()].some(v => v !== 'x')) { if (val.kind === 'rootCount') return rootCountSymbolic(ctx, H, res, val); throw unsupported('계수에 문자가 남아 있어 해를 구할 수 없습니다.'); }
        let roots = H.isZero() ? null : solveUni(H, 'x');
        if (roots === null) throw new EngineError('모든 실수가 해가 되는 항등식입니다.');
        const inDom = (r, d) => {
          if (!d || d.type === 'R') return true;
          const x = r.val();
          const lo = d.lo ? evalP(d.lo, sol) : null, hi = d.hi ? evalP(d.hi, sol) : null;
          const lv = lo ? toQR(lo).val() : -Infinity, hv = hi ? toQR(hi).val() : Infinity;
          return (x > lv + 1e-12 || (d.loC && Math.abs(x - lv) < 1e-12)) && (x < hv - 1e-12 || (d.hiC && Math.abs(x - hv) < 1e-12));
        };
        const before = roots.length;
        roots = roots.filter(r => val.doms.every(d => inDom(r, d)));
        const isQ = H.deg('x') === 2;
        if (isQ) {
          const cs = H.coeffs('x').map(c => c.cv());
          const rr = solveUni(H, 'x');
          if (rr.length && rr.every(r => r.isRat())) {
            ctx.methods.add('인수분해');
            const a = cs[2];
            const fac = (pl) => factorStr('x', rr, a, pl);
            res.steps.push({ rule: '인수분해', parts: [M(xtex(H, false) + ' = 0', xtex(H, true) + ' = 0'), '을 인수분해하면 ', M(fac(false) + ' = 0', fac(true) + ' = 0')] });
          } else {
            const D = cs[1].mul(cs[1]).sub(new Fr(4).mul(cs[2]).mul(cs[0]));
            ctx.methods.add('판별식');
            res.steps.push({ rule: '판별식', parts: [M(xtex(H, false) + ' = 0', xtex(H, true) + ' = 0'), '의 판별식 ', M('D = ' + D.tex(), 'D = ' + D.plain())] });
            if (D.sign() > 0) { ctx.methods.add('근의 공식'); res.steps.push({ rule: '근의 공식', parts: ['근의 공식으로 해를 구한다.'] }); }
          }
        }
        if (before !== roots.length) res.steps.push({ rule: '조건 확인', parts: ['정의역에 속하지 않는 해는 제외한다.'] });
        if (val.kind === 'rootCount') {
          res.count = roots.length; res.tex = String(roots.length); res.plain = String(roots.length); res.V = { p: P.c(roots.length) };
          res.steps.push({ rule: '판정', parts: ['따라서 서로 다른 실근의 개수는 ' + roots.length + '이다.'] });
          return res;
        }
        res.roots = roots;
        if (!roots.length) { res.tex = '\\text{실근이 없다}'; res.plain = '실근이 없다'; res.none = true; }
        else { res.tex = roots.map(r => 'x = ' + r.tex()).join('\\ \\text{또는}\\ '); res.plain = roots.map(r => 'x = ' + r.plain()).join(' 또는 '); }
        res.steps.push({ rule: '판정', parts: ['따라서 ', M(res.tex, res.plain)] });
        return res;
      }
    }
    throw new EngineError('구할 것 계산 오류');
  }
  function subStep(res, sol, polys, what) {
    const used = [...new Set(polys.flatMap(p => [...p.vars()]))].filter(v => sol[v]).sort();
    if (!used.length) return;
    const sp = (pl) => used.map(v => v + ' = ' + vstr(sol[v], pl)).join(pl ? ', ' : ',\\ ');
    res.steps.push({ rule: '대입', parts: [M(sp(false), sp(true)), mjosa(sp(true), '을', '를') + ' 대입하면 ' + what, M(res.tex, res.plain)] });
  }
  function rootCountSymbolic(ctx, H, res, val) {
    if (H.deg('x') !== 2) throw unsupported('실근의 개수는 이차방정식일 때 판별식으로 다룹니다.');
    const cs = H.coeffs('x'); const di = discInfo(ctx, cs[2], cs[1], cs[0], val.label);
    res.steps.push(di.step);
    const s = checkRel(ctx, { p: di.D }, '>'), z = checkRel(ctx, { p: di.D }, '='), n = checkRel(ctx, { p: di.D }, '<');
    let cnt = null; if (s) cnt = 2; else if (z) cnt = 1; else if (n) cnt = 0;
    if (cnt === null) throw unsupported('판별식의 부호가 문자에 따라 달라져 경우 나누기가 필요합니다.');
    res.count = cnt; res.tex = String(cnt); res.plain = String(cnt); res.V = { p: P.c(cnt) };
    res.steps.push({ rule: '판정', parts: ['매개요소의 범위에서 ' + di.name + (cnt === 2 ? ' > 0' : cnt === 1 ? ' = 0' : ' < 0') + '이므로 서로 다른 실근의 개수는 ' + cnt + '이다.'] });
    return res;
  }

  // 모든 값의 합/범위/정수 개수
  function finishAgg(ctx, agg, valid, rejected, combos, freeUnknowns) {
    const R = ctx.R; const u = agg.param;
    if (!ctx.unknowns.includes(u)) throw new EngineError(u + '는 ‘조건으로 결정’ 매개요소여야 합니다.');
    const steps = [];
    let set = null; const vals = [];
    const isFree = freeUnknowns && freeUnknowns.includes(u);
    if (isFree) {
      // 부등식 경로: 각 경우의 제약으로 구간 집합
      set = [];
      for (const cmb of combos) {
        const res = solveSystem(ctx, cmb.eqs, ctx.unknowns);
        for (const sol of res.sols) {
          if (sol[u]) continue;
          let S = boundSet(ctx.bounds[u]);
          let ok = true;
          for (const c of cmb.cons) {
            let V = evalP(c.p, sol); if (V.q) throw unsupported('무리수 계수의 부등식은 지원하지 않습니다.');
            const p = V.p; const vs = [...p.vars()];
            if (!vs.length) { if (!relHolds(p.cv().sign(), c.rel)) { ok = false; break; } continue; }
            if (vs.length > 1 || vs[0] !== u) throw unsupported('여러 문자가 얽힌 부등식은 지원하지 않습니다.');
            if (c.rel === '!=') { const r = solveUni(p, u); S = intersect(S, r.length ? excludePts(r) : ALL()); continue; }
            S = intersect(S, ineqSet(p, u, c.rel));
          }
          if (ok) set = normalize(set.concat(S));
          steps.push(...cmb.steps);
          // 부등식 풀이 단계
          for (const c of cmb.cons) {
            const p = evalP(c.p, sol).p; if (!p || ![...p.vars()].includes(u)) continue;
            const pp = p.leadSign() < 0 ? p.neg() : p; const rel = p.leadSign() < 0 ? FLIP[c.rel] : c.rel;
            const roots = solveUni(pp, u);
            const solS = ineqSet(pp, u, rel);
            let facM = null;
            if (pp.deg(u) === 2 && roots.length === 2 && roots.every(r => r.isRat())) { const a = pp.coef(u, 2).cv(); facM = M(factorStr(u, roots, a, false) + ' ' + relStr(rel, false) + ' 0', factorStr(u, roots, a, true) + ' ' + relStr(rel, true) + ' 0'); ctx.methods.add('인수분해'); }
            steps.push({ rule: '부등식', parts: [M(ptex(pp, false) + ' ' + relStr(rel, false) + ' 0', ptex(pp, true) + ' ' + relStr(rel, true) + ' 0'), ...(facM ? ['에서 ', facM] : []), '이므로 ', M(setStr(solS, u, false), setStr(solS, u, true))] });
          }
        }
      }
      const b = ctx.bounds[u];
      if (b && (b.lo || b.hi)) steps.push({ rule: '조건 확인', parts: ['매개요소 ' + u + '의 범위 조건과 함께 생각하면 ', M(setStr(set, u, false), setStr(set, u, true))] });
    } else {
      for (const v of valid) {
        if (!v.sol[u]) continue; const q = toQR(v.sol[u]);
        if (!q) throw unsupported(u + '의 값이 문자를 포함하여 합·개수를 셀 수 없습니다.');
        if (!vals.some(x => x.eq(q))) vals.push(q);
      }
      steps.push(...comboSteps(ctx, rejected));
      vals.sort((a, b) => a.val() - b.val());
      set = vals.map(q => ({ lo: q, loC: true, hi: q, hiC: true }));
    }
    let tex, plain, V = null;
    const kindWord = KIND_KO[(ctx.bounds[u] || {}).kind || 'real'];
    switch (agg.agg) {
      case 'paramRange': tex = setStr(set, u, false); plain = setStr(set, u, true); break;
      case 'solCount': case 'intCount': {
        let list;
        if (agg.agg === 'intCount') list = intsIn(set); else list = isFree ? null : vals;
        if (list === null) { tex = '\\text{무수히 많다}'; plain = '무수히 많다'; R.warnings.push('조건을 만족하는 값이 무수히 많습니다.'); }
        else { tex = plain = String(list.length); V = { p: P.c(list.length) }; steps.push({ rule: '판정', parts: [agg.agg === 'intCount' ? '정수 ' + u + '는 ' + (list.length ? list.map(n => String(n).replace('-', '−')).join(', ') : '없음') + '이므로 개수는 ' + list.length + '이다.' : '조건을 만족하는 ' + u + '의 값은 ' + list.length + '개이다.'] }); }
        break;
      }
      case 'intSum': case 'solSum': {
        let list;
        if (agg.agg === 'intSum') { const ints = intsIn(set); list = ints === null ? null : ints.map(i => QR.of(i)); }
        else list = isFree ? null : vals;
        if (list === null) { tex = '\\text{무수히 많다}'; plain = '무수히 많다'; R.warnings.push('조건을 만족하는 값이 무수히 많아 합을 구할 수 없습니다.'); }
        else {
          let s = QR.of(0); list.forEach(q => { s = s.add(q); }); V = { q: s }; tex = s.tex(); plain = s.plain();
          steps.push({ rule: '계산', parts: ['조건을 만족하는 모든 ' + u + '의 값의 합은 ', M(list.length ? list.map(q => q.tex()).join(' + ').replace(/\+ -/g, '- ') + ' = ' + tex : '0', list.length ? list.map(q => q.plain()).join(' + ').replace(/\+ −/g, '− ') + ' = ' + plain : '0')] });
        }
        break;
      }
    }
    if (!isFree && !vals.length && agg.agg !== 'paramRange') R.warnings.push('조건을 만족하는 ' + u + '의 값이 없습니다.');
    if (isFree && !set.length) R.warnings.push('조건을 만족하는 ' + u + '의 값이 없습니다.');
    R.steps = dedupe(steps);
    R.answer = { tex, plain, V };
    R.steps.push({ rule: '결론', parts: ['따라서 구하는 답은 ', M(tex, plain), '이다.'] });
    R.answers = [R.answer];
    finishChecks(ctx, { unique: true, exists: isFree ? set.length > 0 : vals.length > 0, valid, rejected, V });
  }
  function excludePts(roots) {
    const out = []; let prev = null;
    roots.forEach(r => { out.push({ lo: prev, loC: false, hi: r, hiC: false }); prev = r; });
    out.push({ lo: prev, loC: false, hi: null, hiC: false });
    return out;
  }
  function dedupe(steps) { const seen = new Set(); return steps.filter(s => { const k = JSON.stringify(s.parts) + s.rule; if (seen.has(k)) return false; seen.add(k); return true; }); }
  function rejectStep(r) {
    const solStr = (pl) => Object.keys(r.sol).map(u => u + ' = ' + vstr(r.sol[u], pl)).join(pl ? ', ' : ',\\ ');
    const head = M(solStr(false), solStr(true));
    const tj = mjosa(solStr(true), '은', '는');
    if (r.fail.con) { const cm = conM(r.fail.con); return { rule: '조건 확인', parts: [head, tj + ' 조건 ', cm, mjosa(cm.plain, '을', '를') + ' 만족하지 않으므로 제외한다.'] }; }
    const last = r.fail.why[r.fail.why.length - 1]; const lp = typeof last === 'string' ? last : last.plain;
    return { rule: '조건 확인', parts: [head, tj + ' 조건 ', ...r.fail.why.flatMap((w, i) => typeof w === 'string' ? [(i ? ', ' : '') + w] : (i ? [', ', w] : [w])), mjosa(lp, '을', '를') + ' 만족하지 않으므로 제외한다.'] };
  }

  function comboSteps(ctx, rejected) {
    const steps = []; const allCombos = ctx.allCombos || []; const multi = allCombos.length > 1;
    const key = (s) => s.rule + JSON.stringify(s.parts);
    let common = new Set();
    if (multi) {
      const sets = allCombos.map(c => new Set(c.steps.map(key)));
      for (const s of allCombos[0].steps) { const k = key(s); if (sets.every(x => x.has(k)) && !common.has(k)) { common.add(k); steps.push(s); } else break; }
    }
    allCombos.forEach((cmb, i) => {
      if (multi) steps.push({ rule: '경우 나누기', parts: ['경우 ' + (i + 1)], head: true });
      steps.push(...cmb.steps.filter(s => !common.has(key(s))), ...(cmb.sysSteps || []));
      rejected.filter(r => r.cmb === cmb).forEach(r => steps.push(rejectStep(r)));
    });
    return steps;
  }
  function assemble(ctx, answers, valid, rejected) {
    const R = ctx.R;
    const steps = [];
    // 경우별 단계: 유효한 경우의 단계 + 기각된 경우 언급
    const allCombos = ctx.allCombos || [];
    const multiCase = allCombos.length > 1;
    allCombos.forEach((cmb, i) => {
      const prefix = multiCase ? [{ rule: '경우 나누기', parts: ['경우 ' + (i + 1)], head: true }] : [];
      steps.push(...prefix, ...cmb.steps, ...cmb.sysSteps);
      rejected.filter(r => r.cmb === cmb).forEach(r => steps.push(rejectStep(r)));
    });
    if (rejected.length && !allCombos.length) rejected.forEach(r => steps.push(rejectStep(r)));
    // 구할 것 단계
    const uniq = [];
    answers.forEach(a => { if (!uniq.some(u => u.out.plain === a.out.plain)) uniq.push(a); });
    uniq.forEach(a => steps.push(...a.out.steps.filter(s => !steps.includes(s))));
    R.steps = dedupe(steps).map(s => Object.assign({}, s));
    if (!uniq.length) {
      R.answer = null;
      if (!valid.length) R.warnings.push('모든 조건을 동시에 만족하는 경우가 없습니다. (해가 존재하지 않음)');
    } else {
      R.answers = uniq.map(a => ({ tex: a.out.tex, plain: a.out.plain, V: a.out.V, none: a.out.none }));
      R.answer = uniq.length === 1 ? R.answers[0] : { tex: uniq.map(a => a.out.tex).join('\\ \\text{또는}\\ '), plain: uniq.map(a => a.out.plain).join(' 또는 '), multiple: true };
      if (uniq.length > 1) R.warnings.push('답이 ' + uniq.length + '개입니다: ' + uniq.map(a => a.out.plain).join(', ') + ' — 매개요소의 범위 조건을 추가해 답을 하나로 정하세요.');
      if (uniq[0].out.freeLeft) R.answer.free = true;
      if (uniq.length === 1 && !uniq[0].out.none) R.steps.push({ rule: '결론', parts: ['따라서 구하는 답은 ', M(R.answer.tex, R.answer.plain), '이다.'] });
    }
    // 그래프 모델 (유일한 해 + 수치)
    const sol = valid.length === 1 ? valid[0].sol : null;
    if (sol) R.graph = graphModel(ctx, sol) || R.graph;
    R.solution = sol;
    // 오답 후보(기각된 경우의 값)
    R.distractorVals = [];
    rejected.forEach(r => {
      try { const o = targetOptions(ctx).find(o => o.cons.every(c => { const V = evalP(c.p, r.sol); return checkRel(ctx, V, c.rel) === true; })); if (o) { const out = evalTarget(ctx, o, r.sol); if (out.V) { const q = toQR(out.V); if (q) R.distractorVals.push(q); } } } catch (e) { /* 무시 */ }
    });
    finishChecks(ctx, { unique: uniq.length === 1 && !(uniq[0] && uniq[0].out.freeLeft), exists: uniq.length > 0, valid, rejected, V: uniq.length === 1 ? uniq[0].out.V : null, none: uniq.length === 1 && uniq[0].out.none });
  }

  function graphModel(ctx, sol) {
    if (!sol) return null;
    const fns = [], pts = [], skipped = [];
    const num = (p) => { const V = evalP(p, sol); const q = toQR(V); if (!q) throw new Error('nonnum'); return q.val(); };
    for (const F of Object.values(ctx.F)) {
      try {
        const V = evalP(F.poly, sol);
        if (V.q || [...V.p.vars()].some(v => v !== 'x')) throw new Error('nonnum');
        const cs = V.p.coeffs('x').map(c => c.cv().val());
        const dom = { type: F.dom.type, loC: F.dom.loC, hiC: F.dom.hiC };
        if (F.dom.lo) dom.lo = num(F.dom.lo);
        if (F.dom.hi) dom.hi = num(F.dom.hi);
        fns.push({ name: F.name, c: [cs[0] || 0, cs[1] || 0, cs[2] || 0], dom });
      } catch (e) { skipped.push(F.name); }
    }
    for (const A of Object.values(ctx.Pts || {})) {
      try { pts.push({ name: A.name, x: num(A.x), y: num(A.y) }); } catch (e) { skipped.push(A.name); }
    }
    if (!fns.length && !pts.length) return null;
    return { fns, pts, skipped };
  }

  function finishChecks(ctx, info) {
    const R = ctx.R; const C = [];
    const add = (name, state, note) => C.push({ name, state, note });
    add('조건 간 모순이 없는가', info.valid.length ? 'pass' : 'fail', info.valid.length ? '모든 조건을 만족하는 경우가 있음' : '모든 조건을 동시에 만족하는 경우가 없음');
    add('답이 실제로 존재하는가', info.exists && !info.none ? 'pass' : 'fail', info.exists ? (info.none ? '구하는 값이 존재하지 않음' : '존재함') : '조건을 만족하는 답이 없음');
    add('정답이 하나로 정해지는가', info.unique ? 'pass' : 'fail', info.unique ? '유일함' : '답이 여러 개이거나 정해지지 않음');
    add('매개요소 범위에 맞는가', 'pass', info.rejected.length ? '범위·조건에 맞지 않는 후보 ' + info.rejected.length + '개를 자동으로 제외함' : '모든 후보가 범위를 만족');
    add('자료와 수식이 같은 모델인가', 'pass', '발문·그래프·표·정답이 하나의 문항 구조에서 생성됨');
    let cx = 'pass', note = '정수 답';
    const q = info.V ? toQR(info.V) : null;
    if (q && !q.isInt()) { cx = 'warn'; note = q.isRat() ? '분수 답' : '무리수 답'; }
    if (!q && info.V && info.V.p) note = '문자를 포함한 식';
    if (!info.V) note = '수치 답이 아님';
    add('계산 결과가 지나치게 복잡하지 않은가', cx, note);
    const forb = (ctx.spec.solve && ctx.spec.solve.forbidden) || [];
    const used = [...ctx.methods]; const clash = used.filter(m => forb.includes(m));
    add('금지한 풀이 방법 없이 풀리는가', clash.length ? 'fail' : 'pass', clash.length ? '이 조건에는 ' + clash.join(', ') + '이(가) 필요함' : '사용한 방법: ' + (used.join(', ') || '대입'));
    const fmt = (ctx.spec.present && ctx.spec.present.format) || 'short';
    let fs = 'pass', fn = '단답형으로 채점 가능';
    if (fmt === 'mc') { if (q && q.isRat()) fn = '5지선다 보기 생성 가능'; else { fs = 'warn'; fn = '객관식 보기는 수치 답일 때만 자동 생성'; } }
    if (fmt === 'essay') fn = '서술형: 단계별 풀이를 채점 기준으로 사용';
    add('정답 형식이 채점 가능한가', fs, fn);
    R.checks = C;
    if (q && q.isRat()) R.numericAnswer = q;
    if (fmt === 'mc' && q && q.isRat()) R.choices = makeChoices(q, R.distractorVals || []);
  }

  function makeChoices(ans, distractors) {
    const out = [ans];
    const push = (q) => { if (q && q.isRat() && !out.some(x => x.eq(q))) out.push(q); };
    distractors.forEach(push);
    const step = ans.a.isInt() ? Fr.ONE : new Fr(1, ans.a.d);
    for (const k of [1, -1, 2, -2, 3, -3, 4, -4, 5]) { if (out.length >= 5) break; push(QR.of(ans.a.add(step.mul(new Fr(k))))); }
    const list = out.slice(0, 5).sort((x, y) => x.val() - y.val());
    return { list, correct: list.findIndex(x => x.eq(ans)) };
  }


  MH.solver = { compile, setup, relHolds, checkRel, solveSystem, getF, fAt, needConstA, vertexOf, con, conM, extremumOptions, discInfo, wrap, condOptions, targetOptions, ineqSet, normalize, intersect, ALL, boundSet, setStr, intsIn, solve, systemSteps, evalTarget, subStep, rootCountSymbolic, finishAgg, excludePts, dedupe, rejectStep, comboSteps, assemble, graphModel, finishChecks, makeChoices };
})(typeof window !== 'undefined' ? window : globalThis);
