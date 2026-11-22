/* 발문 생성
 * 문항 구조로 시험지 문체 발문, 조건 상자, 구조 설명문을 만든다
 */
(function (root) {
  'use strict';
  const MH = root.MH = root.MH || {};
  const { EngineError, unsupported, gcd, Fr, frParse, squarefree, QR, qrSqrt } = MH.num;
  const { mkKey, parseKey, keyDeg, cmpKeys, P, SUP, sup, MINUS, monoStr, frStr, termParts, joinParts, ptex, xtex, vstr, shiftStr, factorStr, leadCoef, plusTerm, REL_TEX, REL_PLAIN, relStr, FLIP, M, line, tokenize, parse, lettersIn, evalQR, evalP, toQR, divisors, solveUni, KIND_KO, fxTex, domTex, setTex, ptM, josa, mjosa, rawM, customM } = MH.poly;

  // ───────────────────────── 발문 생성 ─────────────────────────
  // 결과: parts 배열 (문자열 = 한글, {tex,plain} = 수식, {box:[parts…]} = 조건 상자)
  const FN_TARGETS = ['min', 'max', 'maxmin', 'range', 'vertex', 'axis', 'yint'];
  function buildQuestion(ctx) {
    const spec = ctx.spec; const parts = [];
    const T = (s) => parts.push(s); const Mx = (tex, plain) => parts.push(M(tex, plain === undefined || plain === null ? tex : plain));
    const conds = spec.conds || [], t = spec.target || {};
    const syms = ctx.symbols.map(v => ctx.params[v]);
    const unks = ctx.unknowns.map(v => ctx.params[v]);
    const rangeStr = (p, pl) => {
      const b = ctx.bounds[p.name]; if (!b) return '';
      const showLo = b.lo && !(b.kind === 'nat' && (p.lo === '' || p.lo === undefined || p.lo === null));
      if (showLo && b.hi) return frStr(b.lo, pl) + ' ' + (b.loS ? '<' : relStr('<=', pl)) + ' ' + p.name + ' ' + (b.hiS ? '<' : relStr('<=', pl)) + ' ' + frStr(b.hi, pl);
      const arr = [];
      if (showLo) arr.push(p.name + ' ' + (b.loS ? '>' : relStr('>=', pl)) + ' ' + frStr(b.lo, pl));
      if (b.hi) arr.push(p.name + ' ' + (b.hiS ? '<' : relStr('<=', pl)) + ' ' + frStr(b.hi, pl));
      return arr.join(pl ? ', ' : ',\\ ');
    };
    // 1) 문자로 남기는 매개요소
    const symR = syms.filter(p => rangeStr(p, false));
    symR.forEach((p, i) => {
      const r = rangeStr(p, false), rp = rangeStr(p, true);
      T((i ? ' ' : '') + KIND_KO[p.kind || 'real'] + ' '); Mx(p.name);
      T(mjosa(p.name, '이', '가') + ' '); Mx(r, rp); T(mjosa(rp, '을', '를') + ' 만족시킬 때,');
    });
    if (symR.length) T(' ');
    ctx.symNoRange = syms.filter(p => !rangeStr(p, false));
    // 2) 함수 소개
    const fns = (spec.funcs || []).map(f => ctx.F[f.name]);
    const allR = fns.every(F => F.dom.type === 'R');
    const COUNT = { 2: '두', 3: '세', 4: '네', 5: '다섯', 6: '여섯', 7: '일곱', 8: '여덟', 9: '아홉' };
    if (fns.length > 1 && allR) T((COUNT[fns.length] ? COUNT[fns.length] + ' ' : '') + '함수 ');
    fns.forEach((F, i) => {
      if (!(fns.length > 1 && allR)) {
        if (F.dom.type !== 'R') { T('정의역이 '); Mx(setTex(F.dom, false), setTex(F.dom, true)); T('인 함수 '); }
        else T('함수 ');
      }
      Mx(fxTex(F, false), fxTex(F, true));
      if (i < fns.length - 1) T(', ');
    });
    // 3) 조건 상자 (가)(나)(다)
    const boxed = conds.filter(c => c.box), inl = [];
    conds.filter(c => !c.box).forEach(c => {
      const prev = inl[inl.length - 1];
      if (c.type === 'passes' && ctx.Pts[c.pt] && prev && (prev.type === 'passes' || prev.type === 'passesMulti') && prev.fn === c.fn) {
        const merged = { type: 'passesMulti', fn: c.fn, pts: prev.type === 'passes' ? [prev.pt, c.pt] : prev.pts.concat([c.pt]) };
        inl[inl.length - 1] = merged;
      } else inl.push(c);
    });
    if (boxed.length) {
      const lastF = fns[fns.length - 1];
      if (!inl.length) T(mjosa(fxTex(lastF, true), '이', '가') + ' 다음 조건을 만족시킬 때, ');
      else { T('에 대하여 '); inl.forEach(c => { condPhrase(ctx, c, T, Mx, false, false); T(' '); }); T('다음 조건을 만족시킬 때, '); }
      targetPhrase(ctx, t, T, Mx, false);
      parts.push({ box: boxed.map(c => condBox(ctx, c)) });
      return addNotes(ctx, parts, unks, rangeStr);
    }
    // 4) 첫 조건/구할 것과 이어 쓰기
    const single = fns.length === 1 ? fns[0].name : null;
    let ci = 0;
    if (single && inl.length && ['min', 'max', 'range'].includes(inl[0].type) && inl[0].fn === single) {
      condPhrase(ctx, inl[0], T, Mx, inl.length === 1, true); ci = 1; T(' ');
    } else if (single && !inl.length && FN_TARGETS.includes(t.type) && t.fn === single) {
      targetPhrase(ctx, t, T, Mx, true); return addNotes(ctx, parts, unks, rangeStr);
    } else T('에 대하여 ');
    for (; ci < inl.length; ci++) { condPhrase(ctx, inl[ci], T, Mx, ci === inl.length - 1, false); T(' '); }
    targetPhrase(ctx, t, T, Mx, false);
    return addNotes(ctx, parts, unks, rangeStr);
  }
  function addNotes(ctx, parts, unks, rangeStr) {
    const T = (s) => parts.push(s);
    const sn = ctx.symNoRange || [];
    if (!unks.length && !sn.length) return parts;
    const groups = {};
    unks.forEach(p => { const k = p.kind || 'real'; (groups[k] = groups[k] || []).push(p.name); });
    sn.forEach(p => { const k = 's_' + (p.kind || 'real'); (groups[k] = groups[k] || []).push(p.name); });
    T(' (단, ');
    Object.keys(groups).forEach((k, i) => {
      if (i) T(', ');
      const names = groups[k];
      parts.push(M(names.join(',\\ '), names.join(', ')));
      T(mjosa(names[names.length - 1], '은', '는') + ' ' + (k === 'real' ? '상수' : k.startsWith('s_') ? KIND_KO[k.slice(2)] : KIND_KO[k]));
    });
    const ranges = unks.map(p => ({ tex: rangeStr(p, false), plain: rangeStr(p, true) })).filter(r => r.tex);
    if (ranges.length) {
      T('이고, ');
      ranges.forEach((r, i) => { if (i) T(', '); parts.push(M(r.tex, r.plain)); });
      T(mjosa(ranges[ranges.length - 1].plain, '이다', '이다') + '.)');
    } else T('이다.)');
    return parts;
  }
  // 출제자가 쓴 식 그대로 표기 (값 자동 생성 문자가 없을 때)
  const BOX_LABELS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차'];
  function condBox(ctx, c) {
    const parts = []; const T = (s) => parts.push(s); const Mx = (tex, plain) => parts.push(M(tex, plain === undefined || plain === null ? tex : plain));
    const pe = (s) => ctx.parse(s); const pm = (p) => [ptex(p, false), ptex(p, true)];
    switch (c.type) {
      case 'value': { const x0 = pe(c.x0), y0 = pe(c.y0); Mx(c.fn + '(' + ptex(x0, false) + ') = ' + ptex(y0, false), c.fn + '(' + ptex(x0, true) + ') = ' + ptex(y0, true)); break; }
      case 'custom': parts.push(customM(ctx, c)); break;
      case 'root': T('방정식 '); Mx(c.fn + '(x) = 0'); T('의 한 근은 '); Mx(...pm(pe(c.r))); T('이다.'); break;
      case 'vertex': {
        Mx('y = ' + c.fn + '(x)'); T('의 그래프의 꼭짓점의 ');
        const hasX = c.vx !== undefined && c.vx !== '', hasY = c.vy !== undefined && c.vy !== '';
        if (hasX && hasY) { T('좌표는 '); Mx('(' + ptex(pe(c.vx), false) + ',\\ ' + ptex(pe(c.vy), false) + ')', '(' + ptex(pe(c.vx), true) + ', ' + ptex(pe(c.vy), true) + ')'); }
        else if (hasX) { T('x좌표는 '); Mx(...pm(pe(c.vx))); } else { T('y좌표는 '); Mx(...pm(pe(c.vy))); }
        T('이다.'); break;
      }
      case 'min': case 'max': T('함수 '); Mx(c.fn + '(x)'); T('의 ' + (c.type === 'min' ? '최솟값' : '최댓값') + '은 '); Mx(...pm(pe(c.v))); T('이다.'); break;
      case 'range': { T('함수 '); Mx(c.fn + '(x)'); T('의 치역은 '); const m = pe(c.m), Mm = pe(c.M); Mx('\\{y \\mid ' + ptex(m, false) + ' \\le y \\le ' + ptex(Mm, false) + '\\}', '{y | ' + ptex(m, true) + ' ≤ y ≤ ' + ptex(Mm, true) + '}'); T('이다.'); break; }
      case 'xaxis': Mx('y = ' + c.fn + '(x)'); T('의 그래프는 x축' + ({ touch: '에 접한다.', two: '과 서로 다른 두 점에서 만난다.', none: '과 만나지 않는다.', meet: '과 만난다.' })[c.rel || 'touch']); break;
      case 'intersect': T('두 함수 '); Mx('y = ' + c.fn + '(x),\\ y = ' + c.fn2 + '(x)', 'y = ' + c.fn + '(x), y = ' + c.fn2 + '(x)'); T('의 그래프는 ' + ({ touch: '접한다.', two: '서로 다른 두 점에서 만난다.', none: '만나지 않는다.', meet: '만난다.' })[c.rel || 'touch']); break;
      case 'rootSum': case 'rootProd': T('방정식 '); Mx(c.fn + '(x) = 0'); T('의 두 근의 ' + (c.type === 'rootSum' ? '합' : '곱') + '은 '); Mx(...pm(pe(c.s))); T('이다.'); break;
      case 'passes': { const A = ctx.Pts[c.pt]; Mx('y = ' + c.fn + '(x)'); T('의 그래프는 점 '); const m = ptM(A); parts.push(m); T(mjosa(m.plain, '을', '를') + ' 지난다.'); break; }
    }
    return parts;
  }
  function condPhrase(ctx, c, T, Mx, last, merged) {
    const pe = (s) => ctx.parse(s);
    const end = (mid, fin) => T(last ? fin : mid);
    const pm = (p) => [ptex(p, false), ptex(p, true)];
    switch (c.type) {
      case 'value': { const x0 = pe(c.x0), y0 = pe(c.y0); Mx(c.fn + '(' + ptex(x0, false) + ') = ' + ptex(y0, false), c.fn + '(' + ptex(x0, true) + ') = ' + ptex(y0, true)); end('이고,', '일 때,'); break; }
      case 'root': { T('방정식 '); Mx(c.fn + '(x) = 0'); T('의 한 근이 '); Mx(...pm(pe(c.r))); end('이고,', '일 때,'); break; }
      case 'vertex': {
        Mx('y = ' + c.fn + '(x)'); T('의 그래프의 꼭짓점의 ');
        const hasX = c.vx !== undefined && c.vx !== '', hasY = c.vy !== undefined && c.vy !== '';
        if (hasX && hasY) { T('좌표가 '); Mx('(' + ptex(pe(c.vx), false) + ',\\ ' + ptex(pe(c.vy), false) + ')', '(' + ptex(pe(c.vx), true) + ', ' + ptex(pe(c.vy), true) + ')'); }
        else if (hasX) { T('x좌표가 '); Mx(...pm(pe(c.vx))); } else { T('y좌표가 '); Mx(...pm(pe(c.vy))); }
        end('이고,', '일 때,'); break;
      }
      case 'min': case 'max': { if (!merged) Mx(c.fn + '(x)'); T('의 ' + (c.type === 'min' ? '최솟값' : '최댓값') + '이 '); Mx(...pm(pe(c.v))); end('이고,', '일 때,'); break; }
      case 'range': { if (!merged) Mx(c.fn + '(x)'); T('의 치역이 '); const m = pe(c.m), Mm = pe(c.M); Mx('\\{y \\mid ' + ptex(m, false) + ' \\le y \\le ' + ptex(Mm, false) + '\\}', '{y | ' + ptex(m, true) + ' ≤ y ≤ ' + ptex(Mm, true) + '}'); end('이고,', '일 때,'); break; }
      case 'xaxis': {
        Mx('y = ' + c.fn + '(x)'); T('의 그래프가 x축');
        const r = c.rel || 'touch';
        if (r === 'touch') end('에 접하고,', '에 접할 때,');
        else if (r === 'two') end('과 서로 다른 두 점에서 만나고,', '과 서로 다른 두 점에서 만날 때,');
        else if (r === 'none') end('과 만나지 않고,', '과 만나지 않을 때,');
        else end('과 만나고,', '과 만날 때,');
        break;
      }
      case 'intersect': {
        T('두 함수 '); Mx('y = ' + c.fn + '(x),\\ y = ' + c.fn2 + '(x)', 'y = ' + c.fn + '(x), y = ' + c.fn2 + '(x)'); T('의 그래프가 ');
        const r = c.rel || 'touch';
        if (r === 'touch') end('접하고,', '접할 때,');
        else if (r === 'two') end('서로 다른 두 점에서 만나고,', '서로 다른 두 점에서 만날 때,');
        else if (r === 'none') end('만나지 않고,', '만나지 않을 때,');
        else end('만나고,', '만날 때,');
        break;
      }
      case 'rootSum': case 'rootProd': { T('방정식 '); Mx(c.fn + '(x) = 0'); T('의 두 근의 ' + (c.type === 'rootSum' ? '합' : '곱') + '이 '); Mx(...pm(pe(c.s))); end('이고,', '일 때,'); break; }
      case 'custom': { const m = customM(ctx, c); Mx(m.tex, m.plain); end('이고,', '일 때,'); break; }
      case 'passesMulti': {
        const COUNT = { 2: '두', 3: '세', 4: '네', 5: '다섯' };
        Mx('y = ' + c.fn + '(x)'); T('의 그래프가 ' + (COUNT[c.pts.length] || '') + ' 점 ');
        const ms = c.pts.map(n => ptM(ctx.Pts[n]));
        Mx(ms.map(m => m.tex).join(',\\ '), ms.map(m => m.plain).join(', '));
        const j = mjosa(ms[ms.length - 1].plain, '을', '를'); end(j + ' 지나고,', j + ' 지날 때,'); break;
      }
      case 'passes': { const A = ctx.Pts[c.pt]; Mx('y = ' + c.fn + '(x)'); T('의 그래프가 점 '); const m = ptM(A); parts_push(T, m, Mx); const j = mjosa(m.plain, '을', '를'); end(j + ' 지나고,', j + ' 지날 때,'); break; }
    }
  }
  function parts_push(T, m, Mx) { Mx(m.tex, m.plain); }
  function targetPhrase(ctx, t, T, Mx, merged) {
    const fmt = (ctx.spec.present && ctx.spec.present.format) || 'short';
    const pe = (s) => ctx.parse(s);
    let noun = '';
    const fnM = (tex, plain) => { if (!merged) Mx(tex, plain); };
    const kindOf = (p) => KIND_KO[(ctx.bounds[p] || {}).kind || 'real'];
    switch (t.type) {
      case 'param': Mx(t.param); noun = '의 값'; break;
      case 'expr': { const p = pe(t.expr); Mx(ptex(p, false), ptex(p, true)); noun = '의 값'; break; }
      case 'fval': { const k = pe(t.k); Mx(t.fn + '(' + ptex(k, false) + ')', t.fn + '(' + ptex(k, true) + ')'); noun = '의 값'; break; }
      case 'compose': { const k = pe(t.k); Mx('(' + t.fn + ' \\circ ' + t.fn2 + ')(' + ptex(k, false) + ')', '(' + t.fn + '∘' + t.fn2 + ')(' + ptex(k, true) + ')'); noun = '의 값'; break; }
      case 'vertex': fnM('y = ' + t.fn + '(x)'); noun = merged ? '의 그래프의 꼭짓점의 좌표' : '의 그래프의 꼭짓점의 좌표'; break;
      case 'axis': fnM('y = ' + t.fn + '(x)'); noun = '의 그래프의 축의 방정식'; break;
      case 'min': fnM(t.fn + '(x)'); noun = '의 최솟값'; break;
      case 'max': fnM(t.fn + '(x)'); noun = '의 최댓값'; break;
      case 'maxmin': fnM(t.fn + '(x)'); noun = '의 최댓값과 최솟값의 합'; break;
      case 'range': fnM(t.fn + '(x)'); noun = '의 치역'; break;
      case 'yint': fnM('y = ' + t.fn + '(x)'); noun = '의 그래프의 y절편'; break;
      case 'roots': T('방정식 '); Mx(t.fn + '(x) = 0'); noun = '의 해'; break;
      case 'rootCount': T('방정식 '); Mx(t.fn + '(x) = 0'); noun = '의 서로 다른 실근의 개수'; break;
      case 'rootSum': T('방정식 '); Mx(t.fn + '(x) = 0'); noun = '의 두 근의 합'; break;
      case 'rootProd': T('방정식 '); Mx(t.fn + '(x) = 0'); noun = '의 두 근의 곱'; break;
      case 'intersectX': T('두 함수 '); Mx('y = ' + t.fn + '(x),\\ y = ' + t.fn2 + '(x)', 'y = ' + t.fn + '(x), y = ' + t.fn2 + '(x)'); noun = '의 그래프의 교점의 x좌표'; break;
      case 'solSum': T('조건을 만족시키는 모든 ' + kindOf(t.param) + ' '); Mx(t.param); noun = '의 값의 합'; break;
      case 'solCount': T('조건을 만족시키는 ' + kindOf(t.param) + ' '); Mx(t.param); noun = '의 개수'; break;
      case 'paramRange': T('실수 '); Mx(t.param); noun = '의 값의 범위'; break;
      case 'intCount': T('조건을 만족시키는 정수 '); Mx(t.param); noun = '의 개수'; break;
      case 'intSum': T('조건을 만족시키는 모든 정수 '); Mx(t.param); noun = '의 값의 합'; break;
      default: T('(구할 것을 정하세요)'); return;
    }
    if (fmt === 'mc') T(josa(noun, '은', '는') + '?');
    else if (fmt === 'essay') T(josa(noun, '을', '를') + ' 구하는 과정을 서술하고, 답을 구하시오.');
    else T(josa(noun, '을', '를') + ' 구하시오.');
  }

  // 구조 설명(프롬프트·JSON용) 평문
  function describeSpec(spec) {
    const lines = [];
    const kind = (k) => KIND_KO[k || 'real'];
    const roleKo = { symbol: '문자 그대로 답에 남김(학생에게 공개)', unknown: '조건으로 값이 정해지는 상수', random: '문항 생성 시 값이 정해짐' };
    (spec.params || []).forEach(p => {
      const rng = [];
      if (p.lo !== '' && p.lo !== undefined && p.lo !== null) rng.push(p.name + ' ' + (p.loOp === '>=' ? '≥' : '>') + ' ' + p.lo);
      if (p.hi !== '' && p.hi !== undefined && p.hi !== null) rng.push(p.name + ' ' + (p.hiOp === '<=' ? '≤' : '<') + ' ' + p.hi);
      lines.push(`- 매개요소 ${p.name}: ${kind(p.kind)}, ${roleKo[p.role] || ''}${p.role === 'random' ? ' (현재 값 ' + p.value + ')' : ''}${rng.length ? ', 조건 ' + rng.join(', ') : ''}`);
    });
    (spec.points || []).forEach(p => lines.push(`- 점 ${p.name}: (${p.x}, ${p.y})`));
    (spec.funcs || []).forEach(f => {
      const d = f.domain || { type: 'R' };
      let ds = '실수 전체';
      if (d.type === 'interval') ds = `${d.lo} ${d.loC === false ? '<' : '≤'} x ${d.hiC === false ? '<' : '≤'} ${d.hi}`;
      if (d.type === 'ge') ds = `x ${d.loC === false ? '>' : '≥'} ${d.lo}`;
      if (d.type === 'le') ds = `x ${d.hiC === false ? '<' : '≤'} ${d.hi}`;
      lines.push(`- 함수 ${f.name}: ${f.name}(x) = ${f.expr}, 정의역 ${ds}, 공역 실수 전체`);
    });
    let bi = 0, ii = 0;
    (spec.conds || []).forEach(c => lines.push(c.box ? `- 조건 상자 (${BOX_LABELS[bi++] || bi}): ${condText(c)}` : `- 조건 ${++ii}: ${condText(c)}`));
    lines.push(`- 구할 것: ${targetText(spec.target || {})}`);
    return lines.join('\n');
  }
  const REL_KO = { touch: 'x축에 접한다(중근)', two: 'x축과 서로 다른 두 점에서 만난다', none: 'x축과 만나지 않는다', meet: 'x축과 만난다' };
  const REL2_KO = { touch: '두 그래프가 접한다', two: '두 그래프가 서로 다른 두 점에서 만난다', none: '두 그래프가 만나지 않는다', meet: '두 그래프가 만난다' };
  function condText(c) {
    switch (c.type) {
      case 'value': return `${c.fn}(${c.x0}) = ${c.y0}`;
      case 'root': return `방정식 ${c.fn}(x) = 0의 한 근이 ${c.r}`;
      case 'vertex': return `y = ${c.fn}(x)의 꼭짓점 ${c.vx !== '' && c.vx !== undefined ? 'x좌표 ' + c.vx : ''}${c.vy !== '' && c.vy !== undefined ? ' y좌표 ' + c.vy : ''}`;
      case 'min': return `${c.fn}(x)의 최솟값이 ${c.v}`;
      case 'max': return `${c.fn}(x)의 최댓값이 ${c.v}`;
      case 'range': return `${c.fn}(x)의 치역이 {y | ${c.m} ≤ y ≤ ${c.M}}`;
      case 'xaxis': return `y = ${c.fn}(x)의 그래프가 ${REL_KO[c.rel || 'touch']}`;
      case 'intersect': return `y = ${c.fn}(x), y = ${c.fn2}(x): ${REL2_KO[c.rel || 'touch']}`;
      case 'rootSum': return `방정식 ${c.fn}(x) = 0의 두 근의 합이 ${c.s}`;
      case 'rootProd': return `방정식 ${c.fn}(x) = 0의 두 근의 곱이 ${c.s}`;
      case 'custom': return `${c.lhs} ${REL_PLAIN[c.rel || '=']} ${c.rhs}`;
      case 'passes': return `y = ${c.fn}(x)의 그래프가 점 ${c.pt || '?'}을(를) 지난다`;
    }
    return c.type;
  }
  function targetText(t) {
    const m = {
      param: `${t.param}의 값`, expr: `${t.expr}의 값`, fval: `${t.fn}(${t.k})의 값`, compose: `(${t.fn}∘${t.fn2})(${t.k})의 값`,
      vertex: `y = ${t.fn}(x)의 꼭짓점의 좌표`, axis: `y = ${t.fn}(x)의 축의 방정식`, min: `${t.fn}(x)의 최솟값`, max: `${t.fn}(x)의 최댓값`,
      maxmin: `${t.fn}(x)의 최댓값과 최솟값의 합`, range: `${t.fn}(x)의 치역`, roots: `방정식 ${t.fn}(x) = 0의 해`, rootCount: `방정식 ${t.fn}(x) = 0의 서로 다른 실근의 개수`,
      rootSum: `방정식 ${t.fn}(x) = 0의 두 근의 합`, rootProd: `방정식 ${t.fn}(x) = 0의 두 근의 곱`, yint: `y = ${t.fn}(x)의 y절편`, intersectX: `y = ${t.fn}(x)와 y = ${t.fn2}(x)의 교점의 x좌표`,
      solSum: `조건을 만족하는 모든 ${t.param}의 값의 합`, solCount: `조건을 만족하는 ${t.param}의 개수`, paramRange: `${t.param}의 값의 범위`, intCount: `조건을 만족하는 정수 ${t.param}의 개수`, intSum: `조건을 만족하는 모든 정수 ${t.param}의 합`,
    };
    return m[t.type] || '(미정)';
  }


  MH.question = { FN_TARGETS, buildQuestion, addNotes, BOX_LABELS, condBox, condPhrase, parts_push, targetPhrase, describeSpec, REL_KO, REL2_KO, condText, targetText };
})(typeof window !== 'undefined' ? window : globalThis);
