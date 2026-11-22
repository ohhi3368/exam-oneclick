/* 화면 공통: 상수, 상태 보관소, 도우미(수식 표시·복사·알림·폼 조각) */
(function (root) {
  'use strict';
  const MH = root.MH; const UI = MH.ui = MH.ui || {};

  UI.C = {
    ELEMENT_KINDS: [['function', '함수'], ['point', '점']],
    FUTURE_KINDS: ['수열', '집합', '도형', '벡터', '확률'],
    COND_TYPES: [
      ['value', '함숫값 조건  f(x₀) = y₀'], ['passes', '그래프가 점을 지난다'], ['min', '최솟값 조건'], ['max', '최댓값 조건'],
      ['range', '치역 조건'], ['vertex', '꼭짓점 조건'], ['xaxis', 'x축과의 위치 관계 (판별식)'], ['intersect', '두 그래프의 위치 관계'],
      ['root', '방정식의 한 근'], ['rootSum', '두 근의 합'], ['rootProd', '두 근의 곱'], ['custom', '관계식 (예: f(1) = f(3), a + b = 3)'],
    ],
    TARGET_TYPES: [
      ['함수', [['min', '최솟값'], ['max', '최댓값'], ['maxmin', '최댓값과 최솟값의 합'], ['range', '치역'], ['vertex', '꼭짓점의 좌표'], ['axis', '축의 방정식'], ['yint', 'y절편'], ['fval', '함숫값 f(k)'], ['compose', '합성함숫값 (f∘g)(k)']]],
      ['방정식', [['roots', '방정식 f(x)=0의 해'], ['rootCount', '서로 다른 실근의 개수'], ['rootSum', '두 근의 합'], ['rootProd', '두 근의 곱'], ['intersectX', '두 그래프의 교점의 x좌표']]],
      ['매개요소', [['param', '매개요소의 값'], ['expr', '식의 값 (예: a+b, f(3))'], ['solSum', '조건을 만족하는 모든 값의 합'], ['solCount', '조건을 만족하는 값의 개수'], ['paramRange', '값의 범위'], ['intCount', '조건을 만족하는 정수의 개수'], ['intSum', '조건을 만족하는 정수의 합']]],
    ],
    PARAM_TARGETS: ['param', 'expr', 'solSum', 'solCount', 'paramRange', 'intCount', 'intSum'],
    METHODS: ['완전제곱식', '꼭짓점 공식', '인수분해', '판별식', '근의 공식', '근과 계수의 관계', '그래프 해석'],
    FORBIDDEN: ['미분', '교육과정 외 공식', '근의 공식', '판별식'],
    ROLE: {
      symbol: ['문자로 남김', '답에 문자가 그대로 남습니다. 예: 최솟값 3 − a²'],
      unknown: ['조건으로 결정', '조건을 만족하는 값을 엔진이 구합니다. 발문에는 상수로 적힙니다.'],
      random: ['값 자동 생성', '문항을 만들 때 범위 안의 정수가 들어갑니다. 동형 문항을 만들 때 씁니다.'],
    },
    KIND: { real: '실수', int: '정수', nat: '자연수' },
    FORMAT: { short: '단답형', essay: '서술형', mc: '객관식 5지선다' },
    VIEWS: [['question', '문항'], ['solution', '정답과 풀이'], ['check', '검증'], ['ai', 'BeAT 해설'], ['variants', '동형 문항'], ['model', '구조 데이터']],
    BOX: ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차'],
  };
  UI.C.TARGET_LABEL = Object.fromEntries(UI.C.TARGET_TYPES.flatMap(g => g[1]));
  UI.C.COND_LABEL = Object.fromEntries(UI.C.COND_TYPES);

  // 실행 중 상태
  UI.S = { state: null, result: null, view: 'question', mathReady: false, noMath: false, downloads: null, variants: [] };

  const $ = UI.$ = (s, el) => (el || document).querySelector(s);
  const esc = UI.esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  UI.clone = (o) => JSON.parse(JSON.stringify(o));
  UI.store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  // ── 수식 표시 ──
  UI.mathSpan = (m) => UI.S.noMath ? '<span>' + esc(m.plain) + '</span>' : '<span class="math" data-plain="' + esc(m.plain) + '">\\(' + esc(m.tex) + '\\)</span>';
  UI.partsHTML = function partsHTML(parts) {
    let after = false;
    return parts.map(p => {
      if (typeof p === 'string') { const s = after ? p.replace(/^\s+/, '') : p; after = false; return esc(s); }
      if (p.box) { after = true; return '<div class="cbox">' + p.box.map((b, i) => `<div class="cbox-row"><span class="cbox-lab">(${UI.C.BOX[i] || i + 1})</span><span>${partsHTML(b)}</span></div>`).join('') + '</div>'; }
      after = false; return UI.mathSpan(p);
    }).join('');
  };
  UI.partsPlain = function partsPlain(parts) {
    return parts.map(p => typeof p === 'string' ? p : p.box ? '\n' + p.box.map((b, i) => '(' + (UI.C.BOX[i] || i + 1) + ') ' + partsPlain(b)).join('\n') + '\n' : p.plain).join('');
  };
  UI.partsTex = function partsTex(parts) {
    return parts.map(p => typeof p === 'string' ? p : p.box ? '\n\\begin{tabular}{|l|}\\hline\n' + p.box.map((b, i) => '(' + (UI.C.BOX[i] || i + 1) + ') ' + partsTex(b) + ' \\\\').join('\n') + '\n\\hline\\end{tabular}\n' : '$' + p.tex + '$').join('');
  };
  const queue = [];
  UI.typeset = function (el) {
    if (UI.S.noMath || !el) return;
    if (!UI.S.mathReady) { queue.push(el); return; }
    try { if (root.MathJax.typesetClear) root.MathJax.typesetClear([el]); root.MathJax.typesetPromise([el]).catch(() => {}); } catch (e) { /* 무시 */ }
  };
  UI.initMath = function () {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (root.MathJax && root.MathJax.typesetPromise) { clearInterval(iv); UI.S.mathReady = true; queue.splice(0).forEach(UI.typeset); }
      else if (Date.now() - t0 > 7000) {
        clearInterval(iv); UI.S.noMath = true;
        document.querySelectorAll('.math').forEach(s => { s.textContent = s.getAttribute('data-plain'); });
      }
    }, 150);
  };

  // ── 표기 ──
  UI.fmtNum = function (x) {
    if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x)).replace('-', '−');
    for (let d = 2; d <= 12; d++) { const n = x * d; if (Math.abs(n - Math.round(n)) < 1e-9) return (x < 0 ? '−' : '') + Math.abs(Math.round(n)) + '/' + d; }
    return (Math.round(x * 100) / 100).toString().replace('-', '−');
  };
  UI.quick = (str) => String(str === undefined || str === null ? '' : str).replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/\*/g, '').replace(/-/g, '−');
  UI.domText = function (d) {
    const q = UI.quick;
    if (!d || d.type === 'R') return '실수 전체';
    if (d.type === 'interval') return q(d.lo) + ' ' + (d.loC === false ? '<' : '≤') + ' x ' + (d.hiC === false ? '<' : '≤') + ' ' + q(d.hi);
    if (d.type === 'ge') return 'x ' + (d.loC === false ? '>' : '≥') + ' ' + q(d.lo);
    return 'x ' + (d.hiC === false ? '<' : '≤') + ' ' + q(d.hi);
  };
  UI.paramRangeText = function (p) {
    const a = [];
    if (p.lo !== '' && p.lo !== null && p.lo !== undefined) a.push(p.name + ' ' + (p.loOp === '>=' ? '≥' : '>') + ' ' + p.lo);
    if (p.hi !== '' && p.hi !== null && p.hi !== undefined) a.push(p.name + ' ' + (p.hiOp === '<=' ? '≤' : '<') + ' ' + p.hi);
    return a.join(', ');
  };

  // ── 폼 조각 ──
  UI.opt = (v, label, cur, disabled) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${esc(label)}</option>`;
  UI.inp = (path, val, ph) => `<input type="text" data-k="${path}" value="${esc(val)}" placeholder="${esc(ph || '')}" autocomplete="off" spellcheck="false">`;
  UI.radios = (path, cur, items) => `<div class="radios">${items.map(([v, l]) => `<label><input type="radio" name="${path}" data-k="${path}" value="${esc(v)}" ${String(v) === String(cur) ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div>`;
  UI.check = (path, on, label) => `<label><input type="checkbox" data-k="${path}" ${on ? 'checked' : ''}>${esc(label)}</label>`;
  UI.field = (lab, body, hint) => `<div class="field"><span class="lab">${lab}</span>${body}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;

  // ── 알림·복사·창 ──
  UI.toast = function (msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(UI.toast.t); UI.toast.t = setTimeout(() => { t.hidden = true; }, 2400); };
  UI.openModal = function (title, html) { $('#modal-title').textContent = title; $('#modal-body').innerHTML = `<div class="dialog-body">${html}</div>`; $('#modal').hidden = false; UI.typeset($('#modal-body')); };
  UI.closeModal = function () { $('#modal').hidden = true; };
  UI.copyText = async function (text, msg) {
    try { await navigator.clipboard.writeText(text); UI.toast(msg || '복사했습니다.'); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      if (ok) UI.toast(msg || '복사했습니다.');
      else UI.openModal('직접 복사하세요', `<textarea rows="12" readonly>${esc(text)}</textarea><p class="small">브라우저가 자동 복사를 막았습니다. 위 내용을 선택해 복사하세요.</p>`);
    }
  };
  // 파일 내려받기: 아티팩트에서는 downloads 기능, 그 밖에서는 일반 다운로드
  UI.saveBlob = async function (filename, data, onFail) {
    if (UI.S.downloads) {
      try { await UI.S.downloads.save({ filename, data }); return 'saved'; }
      catch (e) { if (e && e.code === 'declined') return 'declined'; }
    }
    try {
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return 'saved';
    } catch (e) { if (onFail) onFail(); return 'failed'; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
