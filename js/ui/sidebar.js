/* 왼쪽 사이드바: 문항 구조 목록 + 고른 항목 바로 아래에서 속성 편집 */
(function (root) {
  'use strict';
  const MH = root.MH; const UI = MH.ui; const E = MH.Engine; const S = UI.S; const C = UI.C;
  const { $, esc, opt, inp, radios, check, field } = UI;

  const SECS = [['elements', '요소'], ['params', '매개요소'], ['conds', '조건'], ['target', '구할 것'], ['materials', '자료'], ['solve', '풀이와 표현']];
  const SEC_OF = { element: 'elements', param: 'params', cond: 'conds', target: 'target', graph: 'materials', table: 'materials', solve: 'solve' };
  UI.secOf = (kind) => SEC_OF[kind];

  // 조건 번호: 상자 안은 (가)(나), 나머지는 1, 2
  function condLabels() {
    let b = 0, n = 0;
    return S.state.spec.conds.map(c => c.box ? '(' + (C.BOX[b++] || b) + ')' : '조건 ' + (++n));
  }
  function itemLabel(kind, i) {
    const s = S.state.spec;
    switch (kind) {
      case 'element': {
        const e = s.elements[i];
        if (e.kind === 'point') return [`점 ${e.name}(${UI.quick(e.x)}, ${UI.quick(e.y)})`, '점'];
        return [`${e.name}(x) = ${UI.quick(e.expr)}`, '함수, 정의역 ' + UI.domText(e.domain)];
      }
      case 'param': {
        const p = s.params[i]; const used = S.state.used.has(p.name);
        return [p.name, [C.ROLE[p.role][0], C.KIND[p.kind || 'real'], UI.paramRangeText(p), p.role === 'random' ? '지금 값 ' + p.value : '', used ? '' : '사용하지 않음'].filter(Boolean).join(', ')];
      }
      case 'cond': { const c = s.conds[i]; return [UI.quick(E.condText(c)), condLabels()[i] + (c.box ? ' 조건 상자' : '') + ', ' + C.COND_LABEL[c.type]]; }
      case 'target': return [UI.quick(E.targetText(s.target)), C.TARGET_LABEL[s.target.type]];
      case 'graph': { const g = s.present.graph; return ['그래프', s.present.showGraph ? '문항에 넣음' + (g.fns.length ? ', ' + g.fns.map(n => n + '(x)').join(', ') : '') : '넣지 않음']; }
      case 'table': return ['함숫값 표', s.present.showTable ? '문항에 넣음' : '넣지 않음'];
      case 'solve': return [C.FORMAT[s.present.format], '허용 ' + (s.solve.allowed.join(', ') || '제한 없음') + ' / 금지 ' + (s.solve.forbidden.join(', ') || '없음') + ' / ' + s.solve.level];
    }
    return ['', ''];
  }
  const isSel = (k, i) => S.state.sel && S.state.sel.kind === k && (i === undefined || S.state.sel.i === i);
  function itemHTML(kind, i, extra) {
    const [main, sub] = itemLabel(kind, i);
    const sel = isSel(kind, i);
    return `<button class="sb-item ${sel ? 'sel' : ''} ${extra || ''}" data-sel="${kind}" ${i !== undefined ? `data-i="${i}"` : ''} aria-expanded="${sel}"><span class="ti-main">${esc(main)}</span><span class="ti-sub">${esc(sub)}</span></button>` + (sel ? `<div class="sb-edit">${editorHTML()}</div>` : '');
  }
  function secHTML(key) {
    const s = S.state.spec; let h = `<h3 class="sb-head">${SECS.find(x => x[0] === key)[1]}</h3>`;
    switch (key) {
      case 'elements':
        s.elements.forEach((e, i) => { h += itemHTML('element', i); });
        h += `<button class="sb-add" data-act="add-menu">요소 추가</button>`;
        if (S.addMenu) h += `<div class="sb-addmenu"><button class="btn-line" data-act="add-el" data-kind="function">함수</button><button class="btn-line" data-act="add-el" data-kind="point">점</button><p class="small">${C.FUTURE_KINDS.join(', ')} 요소는 다음 단계에서 지원합니다.</p></div>`;
        break;
      case 'params':
        if (!s.params.length) h += `<p class="sb-empty">식에 a, k 같은 문자를 쓰면 여기에 생깁니다.</p>`;
        s.params.forEach((p, i) => { h += itemHTML('param', i, S.state.used.has(p.name) ? '' : 'unused'); });
        h += `<button class="sb-add" data-act="add-param">매개요소 추가</button>`;
        break;
      case 'conds':
        s.conds.forEach((c, i) => { h += itemHTML('cond', i); });
        h += `<button class="sb-add" data-act="add-cond">조건 추가</button>`;
        break;
      case 'target': h += itemHTML('target'); break;
      case 'materials': h += itemHTML('graph') + itemHTML('table'); break;
      case 'solve': h += itemHTML('solve'); break;
    }
    return h;
  }
  UI.renderSidebar = function () {
    $('#sb').innerHTML = SECS.map(([k]) => `<section class="sb-sec" data-sec="${k}">${secHTML(k)}</section>`).join('');
    UI.updateFnPreview();
  };
  UI.renderSidebarExcept = function (key) {
    SECS.forEach(([k]) => { if (k !== key) { const el = $(`#sb [data-sec="${k}"]`); if (el) el.innerHTML = secHTML(k); } });
  };
  UI.updateSelectedLabel = function () {
    const sel = S.state.sel; if (!sel) return;
    const btn = $('#sb .sb-item.sel'); if (!btn) return;
    const [main, sub] = itemLabel(sel.kind, sel.i);
    btn.querySelector('.ti-main').textContent = main; btn.querySelector('.ti-sub').textContent = sub;
  };
  UI.select = function (kind, i) {
    const cur = S.state.sel;
    S.state.sel = (cur && cur.kind === kind && cur.i === i) ? null : { kind, i };
    UI.renderSidebar();
  };

  // ── 편집기 ──
  const fnSelect = (path, cur) => `<select data-k="${path}">${UI.funcs().map(f => opt(f.name, f.name + '(x)', cur)).join('')}</select>`;
  function editorHTML() {
    const s = S.state.spec, sel = S.state.sel; let h = '';
    if (sel.kind === 'element') {
      const e = s.elements[sel.i]; const p = `elements.${sel.i}`;
      if (e.kind === 'point') {
        const taken = new Set(UI.points().map(q => q.name)); taken.delete(e.name);
        h += field('이름', `<select data-k="${p}.name">${'ABCDEFGHIJKLMNPQRSTUVW'.split('').filter(n => !taken.has(n)).map(n => opt(n, '점 ' + n, e.name)).join('')}</select>`);
        h += field('좌표', `<div class="row"><span class="fx">(</span>${inp(p + '.x', e.x, 'x')}<span class="fx">,</span>${inp(p + '.y', e.y, 'y')}<span class="fx">)</span></div>`, '좌표에 문자를 쓰면 매개요소가 됩니다.');
        h += `<div class="sb-foot"><button class="link" data-act="add-pass">이 점을 지나는 조건 추가</button><button class="link" data-act="del-el">삭제</button></div>`;
      } else {
        h += field('이름', `<select data-k="${p}.name">${UI.freeFuncNames(e.name).map(n => opt(n, n + '(x)', e.name)).join('')}</select>`);
        h += field('함수식', inp(p + '.expr', e.expr, 'x^2-2ax+3') + `<div class="fn-preview" id="fn-preview"></div>`, '이차 이하의 식. x^2 또는 x², 곱셈 기호는 생략할 수 있습니다.');
        const d = e.domain;
        let dom = `<select data-k="${p}.domain.type">${opt('R', '실수 전체', d.type)}${opt('interval', '구간', d.type)}${opt('ge', 'x가 어떤 값 이상(초과)', d.type)}${opt('le', 'x가 어떤 값 이하(미만)', d.type)}</select>`;
        if (d.type === 'interval' || d.type === 'ge') dom += `<div class="row mt"><span class="fx w3">시작</span>${inp(p + '.domain.lo', d.lo, '-1 또는 a')}<label class="row fx"><input type="checkbox" data-k="${p}.domain.loC" ${d.loC !== false ? 'checked' : ''}>포함</label></div>`;
        if (d.type === 'interval' || d.type === 'le') dom += `<div class="row mt"><span class="fx w3">끝</span>${inp(p + '.domain.hi', d.hi, '2 또는 a+3')}<label class="row fx"><input type="checkbox" data-k="${p}.domain.hiC" ${d.hiC !== false ? 'checked' : ''}>포함</label></div>`;
        h += field('정의역', dom, '끝값에 문자를 쓰면 매개요소가 됩니다. 공역은 실수 전체입니다.');
        if (UI.funcs().length > 1) h += `<div class="sb-foot"><span></span><button class="link" data-act="del-el">삭제</button></div>`;
      }
    } else if (sel.kind === 'param') {
      const pr = s.params[sel.i]; const p = `params.${sel.i}`;
      h += field('역할', radios(p + '.role', pr.role, Object.entries(C.ROLE).map(([k, v]) => [k, v[0]])), C.ROLE[pr.role][1]);
      h += field('종류', radios(p + '.kind', pr.kind || 'real', Object.entries(C.KIND)));
      h += field('범위', `<div class="row"><span class="fx">${esc(pr.name)}</span><select class="fx op" data-k="${p}.loOp">${opt('>', '>', pr.loOp)}${opt('>=', '≥', pr.loOp)}</select>${inp(p + '.lo', pr.lo, '없음')}</div>
        <div class="row mt"><span class="fx">${esc(pr.name)}</span><select class="fx op" data-k="${p}.hiOp">${opt('<', '<', pr.hiOp)}${opt('<=', '≤', pr.hiOp)}</select>${inp(p + '.hi', pr.hi, '없음')}</div>`, '비워 두면 조건이 없습니다. 답이 여러 개인 문항을 범위로 하나로 정할 수 있습니다.');
      if (pr.role === 'random') {
        h += field('자동 생성 범위 (정수)', `<div class="row">${inp(p + '.rlo', pr.rlo, '최소')}<span class="fx">부터</span>${inp(p + '.rhi', pr.rhi, '최대')}<span class="fx">까지</span></div>`);
        h += field('지금 값', `<div class="row"><span class="big">${esc(pr.value)}</span><button class="link" data-act="reroll">다시 뽑기</button></div>`);
      }
      h += `<div class="sb-foot"><span class="small">${S.state.used.has(pr.name) ? '식이나 조건에서 쓰는 중' : '아직 쓰지 않음'}</span>${S.state.used.has(pr.name) ? '' : `<button class="link" data-act="del-param">삭제</button>`}</div>`;
    } else if (sel.kind === 'cond') {
      const c = s.conds[sel.i]; const p = `conds.${sel.i}`;
      h += field('종류', `<select data-k="${p}.type" data-struct="1">${C.COND_TYPES.map(([v, l]) => opt(v, l, c.type)).join('')}</select>`);
      const fnf = (k, lab) => field(lab || '대상 함수', fnSelect(p + '.' + k, c[k]));
      const relR = (k) => field('위치 관계', radios(p + '.' + k, c[k] || 'touch', [['touch', '접한다'], ['two', '두 점에서 만난다'], ['none', '만나지 않는다'], ['meet', '만난다']]), '판별식으로 처리합니다.');
      switch (c.type) {
        case 'value': h += fnf('fn') + field('x₀와 함숫값', `<div class="row"><span class="fx">${esc(c.fn)}(</span>${inp(p + '.x0', c.x0, 'x₀')}<span class="fx">) =</span>${inp(p + '.y0', c.y0, 'y₀')}</div>`); break;
        case 'passes': {
          const pts = UI.points();
          h += fnf('fn') + field('지나는 점', pts.length ? `<select data-k="${p}.pt">${pts.map(q => opt(q.name, `점 ${q.name}(${UI.quick(q.x)}, ${UI.quick(q.y)})`, c.pt)).join('')}</select>` : `<p class="small">점 요소가 없습니다. 요소 추가에서 점을 먼저 만드세요.</p>`);
          break;
        }
        case 'min': case 'max': h += fnf('fn') + field(c.type === 'min' ? '최솟값' : '최댓값', inp(p + '.v', c.v, '3'), '정의역에 따라 경우를 나누어 계산합니다.'); break;
        case 'range': h += fnf('fn') + field('치역', `<div class="row">${inp(p + '.m', c.m, 'm')}<span class="fx">≤ y ≤</span>${inp(p + '.M', c.M, 'M')}</div>`, '정의역이 닫힌구간일 때 씁니다.'); break;
        case 'vertex': h += fnf('fn') + field('꼭짓점의 좌표', `<div class="row"><span class="fx">(</span>${inp(p + '.vx', c.vx, 'x')}<span class="fx">,</span>${inp(p + '.vy', c.vy, 'y')}<span class="fx">)</span></div>`, '한쪽만 써도 됩니다.'); break;
        case 'xaxis': h += fnf('fn') + relR('rel'); break;
        case 'intersect': h += fnf('fn', '첫째 함수') + fnf('fn2', '둘째 함수') + relR('rel'); break;
        case 'root': h += fnf('fn') + field('방정식 f(x) = 0의 한 근', inp(p + '.r', c.r, '3')); break;
        case 'rootSum': case 'rootProd': h += fnf('fn') + field('두 근의 ' + (c.type === 'rootSum' ? '합' : '곱'), inp(p + '.s', c.s, '5')); break;
        case 'custom': h += field('관계식', `<div class="row">${inp(p + '.lhs', c.lhs, 'f(1)')}<select class="fx op" data-k="${p}.rel">${['=', '>', '>=', '<', '<='].map(r => opt(r, { '>=': '≥', '<=': '≤' }[r] || r, c.rel || '=')).join('')}</select>${inp(p + '.rhs', c.rhs, 'f(3)')}</div>`, 'f(1), g(2) 같은 함숫값도 쓸 수 있습니다.'); break;
      }
      h += field('제시 방법', `<div class="checks">${check(p + '.box', !!c.box, '조건 상자 (가), (나), (다)에 넣기')}</div>`, '상자에 넣은 조건은 발문 아래 상자에 차례로 적힙니다.');
      h += `<div class="sb-foot"><span></span><button class="link" data-act="del-cond">삭제</button></div>`;
    } else if (sel.kind === 'target') {
      const t = s.target;
      h += field('종류', `<select data-k="target.type" data-struct="1">${C.TARGET_TYPES.map(([g, items]) => `<optgroup label="${g}">${items.map(([v, l]) => opt(v, l, t.type)).join('')}</optgroup>`).join('')}</select>`);
      const needFn = !C.PARAM_TARGETS.includes(t.type);
      if (needFn) h += field(t.type === 'compose' ? '바깥 함수' : t.type === 'intersectX' ? '첫째 함수' : '대상 함수', fnSelect('target.fn', t.fn));
      if (t.type === 'compose' || t.type === 'intersectX') h += field(t.type === 'compose' ? '안쪽 함수' : '둘째 함수', fnSelect('target.fn2', t.fn2));
      if (t.type === 'fval' || t.type === 'compose') h += field('x의 값', inp('target.k', t.k, '2'));
      if (t.type === 'expr') h += field('식', inp('target.expr', t.expr, 'a+b, ab, f(3)'));
      if (!needFn && t.type !== 'expr') {
        const names = s.params.filter(q => q.role !== 'random').map(q => q.name);
        h += field('대상 매개요소', `<select data-k="target.param">${names.length ? names.map(n => opt(n, n, t.param)).join('') : opt('', '매개요소 없음', '')}</select>`, '역할이 ‘조건으로 결정’인 매개요소여야 합니다.');
      }
    } else if (sel.kind === 'graph') {
      const g = s.present.graph; const fns = UI.funcs();
      h += field('문항에 넣기', `<div class="checks">${check('present.showGraph', s.present.showGraph, '시험지에 그래프 넣기')}</div>`);
      h += field('그릴 함수', `<div class="checks">${fns.map(f => `<label><input type="checkbox" data-gfn="${esc(f.name)}" ${!g.fns.length || g.fns.includes(f.name) ? 'checked' : ''}>y = ${esc(f.name)}(x)</label>`).join('')}</div>`, '계수가 모두 정해진 함수만 그려집니다.');
      h += field('표시', `<div class="checks col">${check('present.graph.points', g.points, '점 요소 표시')}${check('present.graph.coords', g.coords, '점의 좌표 적기')}${check('present.graph.vertex', g.vertex, '꼭짓점 좌표 적기')}${check('present.graph.intercepts', g.intercepts, '절편 적기')}${check('present.graph.grid', g.grid, '모눈 그리기')}</div>`, '좌표를 적으면 답이 드러날 수 있습니다.');
      h += `<div class="sb-foot"><button class="btn-line" data-act="save-graph">그래프 이미지 저장 (PNG)</button></div>`;
    } else if (sel.kind === 'table') {
      h += field('문항에 넣기', `<div class="checks">${check('present.showTable', s.present.showTable, '시험지에 함숫값 표 넣기')}</div>`);
      h += field('대상 함수', `<select data-k="present.tableFn">${UI.funcs().map(f => opt(f.name, f.name + '(x)', s.present.tableFn || UI.funcs()[0].name)).join('')}</select>`);
    } else if (sel.kind === 'solve') {
      const sv = s.solve;
      const chk = (path, list, cur) => `<div class="checks">${list.map(m => `<label><input type="checkbox" data-list="${path}" value="${esc(m)}" ${cur.includes(m) ? 'checked' : ''}>${esc(m)}</label>`).join('')}</div>`;
      h += field('답안 형식', radios('present.format', s.present.format, Object.entries(C.FORMAT)));
      h += field('허용하는 풀이 방법', chk('solve.allowed', C.METHODS, sv.allowed), '꼭짓점을 완전제곱식과 꼭짓점 공식 중 무엇으로 구할지 정합니다.');
      h += field('금지하는 풀이 방법', chk('solve.forbidden', C.FORBIDDEN, sv.forbidden));
      h += field('설명 수준', radios('solve.level', sv.level, [['간단', '간단'], ['표준', '표준'], ['상세', '상세']]));
    }
    return h;
  }
  UI.updateFnPreview = function () {
    const box = $('#fn-preview'); if (!box) return;
    const f = S.state.spec.elements[S.state.sel.i];
    try {
      const p = E.parse(f.expr); const deg = p.deg('x');
      const kind = deg === 2 ? '이차함수' : deg === 1 ? '일차함수' : deg === 0 ? '상수함수' : deg + '차식, 지원하지 않음';
      box.innerHTML = UI.mathSpan({ tex: f.name + '(x) = ' + E.xtex(p, false), plain: f.name + '(x) = ' + E.xtex(p, true) }) + ` <span class="small">${kind}</span>`;
      UI.typeset(box);
    } catch (e) { box.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };

  // ── 값 반영 ──
  function setPath(path, val) { const ks = path.split('.'); let o = S.state.spec; for (let i = 0; i < ks.length - 1; i++) o = o[isNaN(ks[i]) ? ks[i] : +ks[i]]; o[ks[ks.length - 1]] = val; }
  function getPath(path) { return path.split('.').reduce((o, k) => o && o[isNaN(k) ? k : +k], S.state.spec); }
  UI.onEdit = function (e) {
    const el = e.target; const s = S.state.spec;
    if (el.dataset.list) {
      const arr = getPath(el.dataset.list); const v = el.value;
      if (el.checked && !arr.includes(v)) arr.push(v); if (!el.checked && arr.includes(v)) arr.splice(arr.indexOf(v), 1);
      return UI.afterChange(false);
    }
    if (el.dataset.gfn !== undefined) {
      const all = UI.funcs().map(f => f.name); const g = s.present.graph;
      let cur = g.fns.length ? g.fns.slice() : all.slice();
      if (el.checked && !cur.includes(el.dataset.gfn)) cur.push(el.dataset.gfn);
      if (!el.checked) cur = cur.filter(n => n !== el.dataset.gfn);
      g.fns = cur.length === all.length ? [] : cur;
      return UI.afterChange(false);
    }
    const k = el.dataset.k; if (!k) return;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    const old = getPath(k);
    setPath(k, v);
    let struct = !!el.dataset.struct || el.type === 'radio' || /domain\.type$/.test(k) || /\.name$/.test(k) || /\.box$/.test(k);
    if (/^conds\.\d+\.type$/.test(k)) Object.assign(s.conds[S.state.sel.i], UI.defaultCond(v), { type: v });
    if (k === 'target.type') UI.fixTarget();
    if (/^elements\.\d+\.name$/.test(k)) { if (s.elements[S.state.sel.i].kind === 'point') UI.renamePoint(old, v); else UI.renameFunc(old, v); }
    if (/^params\.\d+\.role$/.test(k)) { const p = s.params[S.state.sel.i]; if (v === 'random') { if (p.kind === 'real') p.kind = 'int'; p.value = UI.pickRandom(p); } }
    if (/^params\.\d+\.(rlo|rhi|lo|hi|loOp|hiOp|kind)$/.test(k)) { const p = s.params[S.state.sel.i]; if (p.role === 'random' && e.type === 'change') { p.value = UI.pickRandom(p); struct = true; } }
    UI.afterChange(struct);
    if (/^elements\.\d+\.expr$/.test(k)) UI.updateFnPreview();
  };
  let timer = null;
  UI.afterChange = function (struct) {
    UI.syncParams();
    if (struct || !S.state.sel) UI.renderSidebar();
    else { UI.renderSidebarExcept(UI.secOf(S.state.sel.kind)); UI.updateSelectedLabel(); }
    clearTimeout(timer); timer = setTimeout(UI.compute, 140);
  };

  // ── 추가·삭제 ──
  const SB_ACTS = ['add-menu', 'add-el', 'del-el', 'add-pass', 'add-param', 'del-param', 'add-cond', 'del-cond', 'reroll'];
  UI.sidebarAction = function (act, t) {
    if (!SB_ACTS.includes(act) || !S.state) return false;
    const s = S.state.spec;
    switch (act) {
      case 'add-menu': S.addMenu = !S.addMenu; UI.renderSidebar(); return true;
      case 'add-el': {
        S.addMenu = false;
        if (t.dataset.kind === 'point') { const n = UI.nextPointName(); s.elements.push({ kind: 'point', name: n, x: '1', y: '0' }); }
        else { const n = UI.nextFuncName(); s.elements.push({ kind: 'function', name: n, expr: 'x+1', domain: { type: 'R', lo: '', hi: '', loC: true, hiC: true } }); }
        S.state.sel = { kind: 'element', i: s.elements.length - 1 }; UI.afterChange(true); return true;
      }
      case 'del-el': {
        const e = s.elements[S.state.sel.i]; s.elements.splice(S.state.sel.i, 1);
        if (e.kind === 'point') s.conds = s.conds.filter(c => !(c.type === 'passes' && c.pt === e.name));
        else { s.conds = s.conds.filter(c => c.fn !== e.name && c.fn2 !== e.name); s.present.graph.fns = s.present.graph.fns.filter(n => n !== e.name); UI.fixTarget(); }
        S.state.sel = null; UI.afterChange(true); return true;
      }
      case 'add-pass': {
        const e = s.elements[S.state.sel.i]; const f = UI.funcs()[0];
        s.conds.push({ type: 'passes', fn: f ? f.name : 'f', pt: e.name });
        S.state.sel = { kind: 'cond', i: s.conds.length - 1 }; UI.afterChange(true); return true;
      }
      case 'add-param': { const n = UI.nextParamName(); s.params.push(UI.newParam(n, 'unknown')); s.params.sort((a, b) => a.name < b.name ? -1 : 1); S.state.sel = { kind: 'param', i: s.params.findIndex(p => p.name === n) }; UI.afterChange(true); UI.toast(`매개요소 ${n}을(를) 만들었습니다. 식이나 조건에 ${n}을(를) 써서 사용하세요.`); return true; }
      case 'del-param': s.params.splice(S.state.sel.i, 1); S.state.sel = null; UI.afterChange(true); return true;
      case 'add-cond': {
        // 첫 조건이 생기면 범위 없는 ‘문자로 남김’ 매개요소는 조건으로 값이 정해지도록 바꾼다
        if (!s.conds.length) { const ch = s.params.filter(p => p.role === 'symbol' && !UI.paramRangeText(p)); ch.forEach(p => { p.role = 'unknown'; }); if (ch.length) UI.toast(ch.map(p => p.name).join(', ') + '의 역할을 ‘조건으로 결정’으로 바꿨습니다.'); }
        s.conds.push(Object.assign({ type: 'value' }, UI.defaultCond('value'))); S.state.sel = { kind: 'cond', i: s.conds.length - 1 }; UI.afterChange(true); return true;
      }
      case 'del-cond': s.conds.splice(S.state.sel.i, 1); S.state.sel = null; UI.afterChange(true); return true;
      case 'reroll': { const p = s.params[S.state.sel.i]; p.value = UI.pickRandom(p); UI.afterChange(true); return true; }
    }
    return false;
  };
})(typeof window !== 'undefined' ? window : globalThis);
