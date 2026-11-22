/* 다항식·표기·파서
 * 여러 문자 다항식, LaTeX/평문 표기, 식 파서, 한 문자 방정식 풀이, 조사 처리
 */
(function (root) {
  'use strict';
  const MH = root.MH = root.MH || {};
  const { EngineError, unsupported, gcd, Fr, frParse, squarefree, QR, qrSqrt } = MH.num;

  // ───────────────────────── 다항식 ─────────────────────────
  function mkKey(m) { return Object.keys(m).filter(v => m[v] > 0).sort().map(v => v + '^' + m[v]).join('*'); }
  function parseKey(k) { const m = {}; if (!k) return m; for (const part of k.split('*')) { const [v, e] = part.split('^'); m[v] = +e; } return m; }
  function keyDeg(k) { const m = parseKey(k); let d = 0; for (const v in m) d += m[v]; return d; }
  function cmpKeys(a, b) {
    const ma = parseKey(a), mb = parseKey(b);
    const xa = ma.x || 0, xb = mb.x || 0; if (xa !== xb) return xb - xa;
    const da = keyDeg(a), db = keyDeg(b); if (da !== db) return db - da;
    return a < b ? -1 : (a > b ? 1 : 0);
  }
  class P {
    constructor(map) { this.t = map || new Map(); }
    static c(x) { const f = x instanceof Fr ? x : new Fr(x); const p = new P(); if (!f.isZero()) p.t.set('', f); return p; }
    static v(name) { const p = new P(); p.t.set(name + '^1', Fr.ONE); return p; }
    add(o) {
      const r = new Map(this.t);
      for (const [k, c] of o.t) { const s = (r.get(k) || Fr.ZERO).add(c); if (s.isZero()) r.delete(k); else r.set(k, s); }
      return new P(r);
    }
    neg() { const r = new Map(); for (const [k, c] of this.t) r.set(k, c.neg()); return new P(r); }
    sub(o) { return this.add(o.neg()); }
    scale(f) {
      if (!(f instanceof Fr)) f = new Fr(f); if (f.isZero()) return new P();
      const r = new Map(); for (const [k, c] of this.t) r.set(k, c.mul(f)); return new P(r);
    }
    mul(o) {
      let r = new P();
      for (const [k1, c1] of this.t) for (const [k2, c2] of o.t) {
        const m = parseKey(k1), m2 = parseKey(k2);
        for (const v in m2) m[v] = (m[v] || 0) + m2[v];
        const t = new P(); t.t.set(mkKey(m), c1.mul(c2)); r = r.add(t);
      }
      return r;
    }
    pow(n) { let r = P.c(1); for (let i = 0; i < n; i++) r = r.mul(this); return r; }
    isZero() { return this.t.size === 0; }
    isConst() { return this.t.size === 0 || (this.t.size === 1 && this.t.has('')); }
    cv() { return this.t.get('') || Fr.ZERO; }
    vars() { const s = new Set(); for (const k of this.t.keys()) for (const v in parseKey(k)) s.add(v); return s; }
    deg(v) { let d = 0; for (const k of this.t.keys()) { const m = parseKey(k); d = Math.max(d, m[v] || 0); } return d; }
    coeffs(v) {
      const arr = [];
      for (const [k, c] of this.t) {
        const m = parseKey(k); const e = m[v] || 0; delete m[v];
        const t = new P(); t.t.set(mkKey(m), c);
        arr[e] = arr[e] ? arr[e].add(t) : t;
      }
      for (let i = 0; i < arr.length; i++) if (!arr[i]) arr[i] = new P();
      return arr;
    }
    coef(v, e) { return this.coeffs(v)[e] || new P(); }
    subst(v, q) {
      if (!this.vars().has(v)) return this;
      const cs = this.coeffs(v); let r = new P(), pw = P.c(1);
      for (let i = 0; i < cs.length; i++) { r = r.add(cs[i].mul(pw)); pw = pw.mul(q); }
      return r;
    }
    substMap(map) { let r = this; for (const v in map) r = r.subst(v, map[v]); return r; }
    eq(o) { return this.sub(o).isZero(); }
    sortedKeys() { return [...this.t.keys()].sort(cmpKeys); }
    leadSign() { const ks = this.sortedKeys(); return ks.length ? this.t.get(ks[0]).sign() : 0; }
    intContent() { // 모든 계수가 정수인지
      for (const c of this.t.values()) if (!c.isInt()) return false; return true;
    }
  }

  // ───────────────────────── 표기 ─────────────────────────
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (n) => String(n).split('').map(d => SUP[+d]).join('');
  const MINUS = (plain) => plain ? '−' : '-';
  function monoStr(m, plain) {
    return Object.keys(m).sort().map(v => m[v] === 1 ? v : (plain ? v + sup(m[v]) : v + '^{' + m[v] + '}')).join('');
  }
  function frStr(f, plain) { return plain ? f.plain() : f.tex(); }
  function termParts(p, plain) {
    return p.sortedKeys().map(k => {
      const c = p.t.get(k), m = parseKey(k), mono = monoStr(m, plain), a = c.abs();
      let body;
      if (mono === '') body = frStr(a, plain);
      else if (a.eq(Fr.ONE)) body = mono;
      else body = (plain && !a.isInt() ? '(' + a.plain() + ')' : frStr(a, plain)) + mono;
      return { neg: c.sign() < 0, body };
    });
  }
  function joinParts(parts, plain) {
    if (!parts.length) return '0';
    return parts.map((q, i) => i === 0 ? (q.neg ? MINUS(plain) : '') + q.body : (q.neg ? ' ' + MINUS(plain) + ' ' : ' + ') + q.body).join('');
  }
  function ptex(p, plain) { // 일반 다항식 (x 포함 시 x 기준 묶음)
    if (p.vars().has('x')) return xtex(p, plain, 'x');
    return joinParts(termParts(p, plain), plain);
  }
  function xtex(p, plain, v) {
    v = v || 'x';
    const cs = p.coeffs(v), parts = [];
    for (let e = cs.length - 1; e >= 0; e--) {
      const c = cs[e]; if (c.isZero()) continue;
      if (e === 0) { parts.push(...termParts(c, plain)); continue; }
      const xs = e === 1 ? v : (plain ? v + sup(e) : v + '^{' + e + '}');
      if (c.t.size === 1) {
        const [k, cf] = [...c.t][0]; const mono = monoStr(parseKey(k), plain); const a = cf.abs();
        let coef;
        if (a.eq(Fr.ONE)) coef = '';
        else coef = plain && !a.isInt() ? '(' + a.plain() + ')' : frStr(a, plain);
        parts.push({ neg: cf.sign() < 0, body: coef + mono + xs });
      } else {
        const neg = c.leadSign() < 0; const cc = neg ? c.neg() : c;
        parts.push({ neg, body: '(' + joinParts(termParts(cc, plain), plain) + ')' + xs });
      }
    }
    return joinParts(parts, plain);
  }
  // 값(정확값) 표기: {p:P} 또는 {q:QR}
  function vstr(V, plain) { return V.q ? (plain ? V.q.plain() : V.q.tex()) : ptex(V.p, plain); }
  // x − h 꼴
  function shiftStr(v, h, plain) {
    if (h.isZero()) return v;
    if (h.t.size === 1) {
      const neg = h.leadSign() < 0; const hh = neg ? h.neg() : h;
      return v + (neg ? ' + ' : ' ' + MINUS(plain) + ' ') + ptex(hh, plain);
    }
    return v + ' ' + MINUS(plain) + ' (' + ptex(h, plain) + ')';
  }
  function factorStr(u, roots, a, plain) { // a(u−r1)(u−r2)
    const fs = roots.map(r => r.a.isZero() ? u : '(' + shiftStr(u, P.c(r.a), plain) + ')');
    fs.sort((x, y) => (x === u ? -1 : y === u ? 1 : 0));
    if (roots.length === 1) return leadCoef(a, plain) + (roots[0].a.isZero() ? u + (plain ? '²' : '^2') : fs[0] + (plain ? '²' : '^2'));
    return leadCoef(a, plain) + fs.join('');
  }
  // 앞에 붙는 계수: 1 → '', −1 → '−'
  function leadCoef(f, plain) { if (f.eq(Fr.ONE)) return ''; if (f.eq(Fr.ONE.neg())) return MINUS(plain); return frStr(f, plain); }
  // + k 꼴 (부호 포함)
  function plusTerm(k, plain) {
    if (k.isZero()) return '';
    return termParts(k, plain).map(q => (q.neg ? ' ' + MINUS(plain) + ' ' : ' + ') + q.body).join('');
  }
  const REL_TEX = { '>': '>', '>=': '\\ge', '<': '<', '<=': '\\le', '=': '=', '!=': '\\ne' };
  const REL_PLAIN = { '>': '>', '>=': '≥', '<': '<', '<=': '≤', '=': '=', '!=': '≠' };
  const relStr = (rel, plain) => plain ? REL_PLAIN[rel] : REL_TEX[rel];
  const FLIP = { '>': '<', '>=': '<=', '<': '>', '<=': '>=', '=': '=', '!=': '!=' };

  // 수식 조각: 본문과 수식을 함께 담는다
  function M(tex, plain) { return { tex, plain: plain === undefined ? tex : plain }; }
  // 단계 텍스트: 배열 원소가 문자열(한글) 또는 {tex,plain}
  function line(...parts) { return parts; }

  // ───────────────────────── 파서 ─────────────────────────
  function tokenize(s) {
    s = String(s).replace(/²/g, '^2').replace(/³/g, '^3').replace(/[−–—]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
    if (!s) throw new EngineError('식이 비어 있습니다.');
    const toks = []; let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/[0-9.]/.test(ch)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; toks.push({ t: 'n', v: s.slice(i, j) }); i = j; continue; }
      if (/[a-z]/.test(ch)) { toks.push({ t: 'i', v: ch }); i++; continue; }
      if ('+-*/^()'.includes(ch)) { toks.push({ t: 'o', v: ch }); i++; continue; }
      throw new EngineError(`식에 쓸 수 없는 문자 '${ch}'가 있습니다. (문자는 영어 소문자 한 글자)`);
    }
    return toks;
  }
  function parse(str, env) {
    env = env || {};
    const funcs = env.funcs || {};
    const toks = tokenize(str); let pos = 0;
    const peek = () => toks[pos]; const next = () => toks[pos++];
    const isOp = (v) => peek() && peek().t === 'o' && peek().v === v;
    function expr() {
      let r = term();
      while (isOp('+') || isOp('-')) { const op = next().v; const t = term(); r = op === '+' ? r.add(t) : r.sub(t); }
      return r;
    }
    function startsFactor() { const t = peek(); return t && (t.t === 'n' || t.t === 'i' || (t.t === 'o' && t.v === '(')); }
    function term() {
      let r = unary();
      for (;;) {
        if (isOp('*')) { next(); r = r.mul(unary()); }
        else if (isOp('/')) {
          next(); const d = unary();
          if (!d.isConst() || d.isZero()) throw new EngineError('나눗셈은 0이 아닌 수로만 할 수 있습니다.');
          r = r.scale(Fr.ONE.div(d.cv()));
        } else if (startsFactor()) r = r.mul(power());
        else break;
      }
      return r;
    }
    function unary() {
      if (isOp('-')) { next(); return unary().neg(); }
      if (isOp('+')) { next(); return unary(); }
      return power();
    }
    function power() {
      const base = atom();
      if (isOp('^')) {
        next(); const e = unary();
        if (!e.isConst() || !e.cv().isInt() || e.cv().sign() < 0 || e.cv().n > 8) throw new EngineError('지수는 0~8의 자연수만 쓸 수 있습니다.');
        return base.pow(e.cv().n);
      }
      return base;
    }
    function atom() {
      const t = next();
      if (!t) throw new EngineError('식이 덜 끝났습니다.');
      if (t.t === 'n') return P.c(frParse(t.v));
      if (t.t === 'i') {
        if (funcs[t.v] && isOp('(')) {
          next(); const arg = expr();
          if (!isOp(')')) throw new EngineError('괄호가 닫히지 않았습니다.'); next();
          return funcs[t.v].subst('x', arg);
        }
        if (env.noX && t.v === 'x') throw new EngineError('이 칸에는 x를 쓸 수 없습니다.');
        return P.v(t.v);
      }
      if (t.v === '(') {
        const r = expr();
        if (!isOp(')')) throw new EngineError('괄호가 닫히지 않았습니다.'); next();
        return r;
      }
      throw new EngineError(`'${t.v}' 위치가 올바르지 않습니다.`);
    }
    const r = expr();
    if (pos < toks.length) throw new EngineError(`'${toks[pos].v}' 근처를 해석할 수 없습니다.`);
    return r;
  }
  // 식에 등장하는 문자 목록(함수 이름, x 제외)
  function lettersIn(str, funcNames) {
    const out = new Set();
    try {
      const toks = tokenize(str);
      toks.forEach((t, i) => {
        if (t.t !== 'i' || t.v === 'x') return;
        if (funcNames && funcNames.includes(t.v) && toks[i + 1] && toks[i + 1].v === '(') return;
        out.add(t.v);
      });
    } catch (e) { /* 무시 */ }
    return out;
  }

  // ───────────────────────── 값 평가 ─────────────────────────
  function evalQR(p, qmap) {
    let s = QR.of(0);
    for (const [k, c] of p.t) {
      let term = QR.of(c); const m = parseKey(k);
      for (const v in m) for (let i = 0; i < m[v]; i++) term = term.mul(qmap[v]);
      s = s.add(term);
    }
    return s;
  }
  function evalP(p, assign) {
    let r = p; const qmap = {};
    for (const v of p.vars()) {
      const a = assign[v]; if (!a) continue;
      if (a.p) r = r.subst(v, a.p); else qmap[v] = a.q;
    }
    if (!Object.keys(qmap).length) return { p: r };
    for (const v of r.vars()) if (!qmap[v]) throw unsupported('무리수 값과 문자가 함께 남는 계산은 지원하지 않습니다.');
    return { q: evalQR(r, qmap) };
  }
  const toQR = (V) => V.q ? V.q : (V.p.isConst() ? QR.of(V.p.cv()) : null);

  // ─────────────── 한 문자 다항방정식 (수치 계수) ───────────────
  function divisors(n) { n = Math.abs(n); const r = []; for (let i = 1; i <= n; i++) if (n % i === 0) r.push(i); return r; }
  function solveUni(poly, u) { // poly: P in u only → QR[] (서로 다른 실근, 오름차순)
    let cs = poly.coeffs(u).map(c => c.cv());
    while (cs.length && cs[cs.length - 1].isZero()) cs.pop();
    const roots = [];
    // 유리근 찾기(3차 이상일 때)
    while (cs.length - 1 > 2) {
      let L = 1; cs.forEach(c => { L = L * c.d / gcd(L, c.d); });
      const ic = cs.map(c => c.n * (L / c.d));
      if (ic[0] === 0) { roots.push(QR.of(0)); cs = cs.slice(1); continue; }
      let found = null;
      outer: for (const p of divisors(ic[0])) for (const q of divisors(ic[ic.length - 1])) for (const s of [1, -1]) {
        const cand = new Fr(s * p, q); let v = Fr.ZERO;
        for (let i = cs.length - 1; i >= 0; i--) v = v.mul(cand).add(cs[i]);
        if (v.isZero()) { found = cand; break outer; }
      }
      if (!found) throw unsupported('3차 이상 방정식이 유리수 근을 갖지 않아 엔진이 풀 수 없습니다.');
      roots.push(QR.of(found));
      const nc = new Array(cs.length - 1); let carry = Fr.ZERO;
      for (let i = cs.length - 1; i >= 1; i--) { carry = cs[i].add(carry.mul(found)); nc[i - 1] = carry; }
      cs = nc;
    }
    const deg = cs.length - 1;
    if (deg === 1) roots.push(QR.of(cs[0].neg().div(cs[1])));
    else if (deg === 2) {
      const [c, b, a] = cs; const D = b.mul(b).sub(new Fr(4).mul(a).mul(c));
      if (D.sign() === 0) roots.push(QR.of(b.neg().div(new Fr(2).mul(a))));
      else if (D.sign() > 0) {
        const s = qrSqrt(D), den = QR.of(new Fr(2).mul(a)), mb = QR.of(b.neg());
        roots.push(mb.sub(s).div(den), mb.add(s).div(den));
      }
    }
    const uniq = [];
    roots.forEach(r => { if (!uniq.some(x => x.eq(r))) uniq.push(r); });
    return uniq.sort((x, y) => x.val() - y.val());
  }


  // ── 옮겨 온 표기 도우미 ──
  const KIND_KO = { real: '실수', int: '정수', nat: '자연수' };
  function fxTex(F, plain) { return F.name + '(x) = ' + xtex(F.poly, plain); }
  function domTex(d, plain) {
    const le = relStr('<=', plain), lt = '<';
    const L = d.lo ? ptex(d.lo, plain) : '', H = d.hi ? ptex(d.hi, plain) : '';
    let body;
    if (d.type === 'interval') body = L + ' ' + (d.loC ? le : lt) + ' x ' + (d.hiC ? le : lt) + ' ' + H;
    else if (d.type === 'ge') body = 'x ' + (d.loC ? relStr('>=', plain) : '>') + ' ' + L;
    else if (d.type === 'le') body = 'x ' + (d.hiC ? le : lt) + ' ' + H;
    else return plain ? '실수 전체' : '\\mathbb{R}';
    return body;
  }
  function setTex(d, plain) { const b = domTex(d, plain); return plain ? '{x | ' + b + '}' : '\\{x \\mid ' + b + '\\}'; }
  function ptM(A) { return M('\\mathrm{' + A.name + '}(' + ptex(A.x, false) + ',\\ ' + ptex(A.y, false) + ')', A.name + '(' + ptex(A.x, true) + ', ' + ptex(A.y, true) + ')'); }
  function josa(word, a, b) { const ch = word.charCodeAt(word.length - 1); if (ch < 0xac00 || ch > 0xd7a3) return word + a; return word + (((ch - 0xac00) % 28) ? a : b); }
  // 수식 끝 글자의 받침 여부로 조사 선택 (a: 받침 있음, b: 받침 없음)
  function mjosa(plain, a, b) {
    const s = String(plain).replace(/[\s)}\]]+$/, ''); const ch = s[s.length - 1] || '';
    if (/[0-9]/.test(ch)) return '013678'.includes(ch) ? a : b;
    if (/[a-z]/i.test(ch)) return 'lmnr'.includes(ch.toLowerCase()) ? a : b;
    if (/[가-힣]/.test(ch)) return ((ch.charCodeAt(0) - 0xac00) % 28) ? a : b;
    return a;
  }
  function rawM(ctx, s) {
    const str = String(s).replace(/\s+/g, '');
    if ([...lettersIn(str, Object.keys(ctx.F))].some(v => ctx.fixed[v])) { const p = ctx.parse(s); return M(ptex(p, false), ptex(p, true)); }
    const spaced = str.replace(/([^(,])([+\-=])/g, '$1 $2 ').replace(/^-/, '−').replace(/\*/g, '');
    const tex = spaced.replace(/\^(\d+)/g, '^{$1}');
    const plain = spaced.replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/-/g, '−');
    return M(tex, plain);
  }
  function customM(ctx, c) {
    const l = rawM(ctx, c.lhs), r = rawM(ctx, c.rhs), rel = c.rel || '=';
    return M(l.tex + ' ' + relStr(rel, false) + ' ' + r.tex, l.plain + ' ' + relStr(rel, true) + ' ' + r.plain);
  }

  MH.poly = { mkKey, parseKey, keyDeg, cmpKeys, P, SUP, sup, MINUS, monoStr, frStr, termParts, joinParts, ptex, xtex, vstr, shiftStr, factorStr, leadCoef, plusTerm, REL_TEX, REL_PLAIN, relStr, FLIP, M, line, tokenize, parse, lettersIn, evalQR, evalP, toQR, divisors, solveUni, KIND_KO, fxTex, domTex, setTex, ptM, josa, mjosa, rawM, customM };
})(typeof window !== 'undefined' ? window : globalThis);
