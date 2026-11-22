/* 수 체계
 * 분수(Fr)와 이차 무리수(a + b√r) 정확 계산, 엔진 오류 형식
 */
(function (root) {
  'use strict';
  const MH = root.MH = root.MH || {};

  // ───────────────────────── 오류 ─────────────────────────
  class EngineError extends Error {
    constructor(msg, kind) { super(msg); this.kind = kind || 'input'; }
  }
  const unsupported = (msg) => new EngineError(msg, 'unsupported');

  // ───────────────────────── 분수 ─────────────────────────
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
  class Fr {
    constructor(n, d) {
      if (d === undefined) d = 1;
      if (d === 0) throw new EngineError('0으로 나눌 수 없습니다.');
      if (d < 0) { n = -n; d = -d; }
      const g = gcd(n, d) || 1;
      this.n = n / g; this.d = d / g;
      if (this.n === 0) { this.n = 0; this.d = 1; }
      if (!Number.isSafeInteger(this.n) || !Number.isSafeInteger(this.d)) throw unsupported('계산 중 수가 너무 커졌습니다.');
    }
    add(o) { return new Fr(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { return new Fr(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { return new Fr(this.n * o.n, this.d * o.d); }
    div(o) { if (o.n === 0) throw new EngineError('0으로 나눌 수 없습니다.'); return new Fr(this.n * o.d, this.d * o.n); }
    neg() { return new Fr(-this.n, this.d); }
    abs() { return new Fr(Math.abs(this.n), this.d); }
    isZero() { return this.n === 0; }
    sign() { return Math.sign(this.n); }
    eq(o) { return this.n === o.n && this.d === o.d; }
    cmp(o) { return Math.sign(this.n * o.d - o.n * this.d); }
    val() { return this.n / this.d; }
    isInt() { return this.d === 1; }
    tex() { if (this.d === 1) return String(this.n); return (this.n < 0 ? '-' : '') + '\\frac{' + Math.abs(this.n) + '}{' + this.d + '}'; }
    plain() { if (this.d === 1) return String(this.n).replace('-', '−'); return (this.n < 0 ? '−' : '') + Math.abs(this.n) + '/' + this.d; }
  }
  Fr.ZERO = new Fr(0); Fr.ONE = new Fr(1);
  function frParse(s) {
    if (!/^\d+(\.\d+)?$/.test(s)) throw new EngineError(`'${s}'은(는) 올바른 수가 아닙니다.`);
    if (s.includes('.')) { const [a, b] = s.split('.'); return new Fr(parseInt(a + b, 10), Math.pow(10, b.length)); }
    return new Fr(parseInt(s, 10));
  }

  // ─────────────────── 이차 무리수 a + b√r ───────────────────
  function squarefree(n) { // n = s² · r
    let s = 1, r = 1, m = n;
    for (let p = 2; p * p <= m; p++) {
      let c = 0; while (m % p === 0) { m /= p; c++; }
      s *= Math.pow(p, Math.floor(c / 2)); if (c % 2) r *= p;
    }
    r *= m; return [s, r];
  }
  class QR {
    constructor(a, b, r) {
      this.a = a; this.b = b || Fr.ZERO; this.r = r || 1;
      if (this.r === 1) { this.a = this.a.add(this.b); this.b = Fr.ZERO; }
      if (this.b.isZero()) this.r = 1;
    }
    static of(x) { return new QR(x instanceof Fr ? x : new Fr(x)); }
    isRat() { return this.b.isZero(); }
    _r(o) {
      if (this.r === 1) return o.r; if (o.r === 1 || o.r === this.r) return this.r;
      throw unsupported('서로 다른 무리수가 섞인 계산은 지원하지 않습니다.');
    }
    add(o) { const r = this._r(o); return new QR(this.a.add(o.a), this.b.add(o.b), r); }
    neg() { return new QR(this.a.neg(), this.b.neg(), this.r); }
    sub(o) { return this.add(o.neg()); }
    mul(o) {
      const r = this._r(o);
      return new QR(this.a.mul(o.a).add(this.b.mul(o.b).mul(new Fr(r))), this.a.mul(o.b).add(this.b.mul(o.a)), r);
    }
    inv() {
      if (this.isRat()) return new QR(Fr.ONE.div(this.a));
      const den = this.a.mul(this.a).sub(this.b.mul(this.b).mul(new Fr(this.r)));
      return new QR(this.a.div(den), this.b.neg().div(den), this.r);
    }
    div(o) { return this.mul(o.inv()); }
    sign() {
      const sa = this.a.sign(), sb = this.b.sign();
      if (sb === 0) return sa; if (sa === 0) return sb; if (sa === sb) return sa;
      const c = this.a.mul(this.a).cmp(this.b.mul(this.b).mul(new Fr(this.r)));
      return c > 0 ? sa : (c < 0 ? sb : 0);
    }
    val() { return this.a.val() + this.b.val() * Math.sqrt(this.r); }
    eq(o) { try { return this.sub(o).sign() === 0; } catch (e) { return false; } }
    isInt() { return this.isRat() && this.a.isInt(); }
    _fmt(plain) {
      if (this.isRat()) return plain ? this.a.plain() : this.a.tex();
      const L = this.a.d * this.b.d / gcd(this.a.d, this.b.d);
      const A = this.a.n * (L / this.a.d), B = this.b.n * (L / this.b.d);
      const absB = Math.abs(B);
      const root = plain ? '√' + this.r : '\\sqrt{' + this.r + '}';
      const bpart = (absB === 1 ? '' : String(absB)) + root;
      const minus = plain ? '−' : '-';
      let num;
      if (A === 0) num = (B < 0 ? minus : '') + bpart;
      else num = (A < 0 ? minus : '') + Math.abs(A) + (B < 0 ? ' ' + minus + ' ' : ' + ') + bpart;
      if (L === 1) return num;
      if (plain) return (A === 0 ? num : '(' + num + ')') + '/' + L;
      if (A === 0 && B < 0) return '-\\frac{' + bpart + '}{' + L + '}';
      return '\\frac{' + num + '}{' + L + '}';
    }
    tex() { return this._fmt(false); }
    plain() { return this._fmt(true); }
  }
  function qrSqrt(f) { // √f, f ≥ 0 유리수
    if (f.sign() < 0) throw new EngineError('음수의 제곱근은 실수가 아닙니다.');
    if (f.isZero()) return QR.of(0);
    const [s, r] = squarefree(f.n * f.d);
    return new QR(Fr.ZERO, new Fr(s, f.d), r);
  }


  MH.num = { EngineError, unsupported, gcd, Fr, frParse, squarefree, QR, qrSqrt };
})(typeof window !== 'undefined' ? window : globalThis);
