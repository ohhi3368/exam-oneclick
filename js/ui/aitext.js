/* BeAT 해설: 붙여넣은 HTML의 수식을 LaTeX로 되살리고, 해설을 수식과 함께 보여 준다 */
(function (root) {
  'use strict';
  const UI = root.MH.ui;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // ── 붙여넣기: HTML → $수식$이 들어간 글 ──
  // KaTeX·MathJax로 그린 수식을 그냥 복사하면 "보이는 글자 + LaTeX + 보이는 글자"가 겹쳐 들어온다.
  // 클립보드의 HTML에서 수식마다 LaTeX 원문만 꺼내 $…$ / $$…$$로 바꾼다.
  const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI', 'TABLE', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR']);
  const SKIP = new Set(['STYLE', 'SCRIPT', 'TEMPLATE', 'NOSCRIPT', 'BUTTON', 'SVG']);
  const texOf = (el) => {
    const a = el.querySelector('annotation[encoding="application/x-tex"], annotation[encoding="TeX"], annotation[encoding*="tex" i]');
    return a ? a.textContent.trim() : null;
  };

  UI.htmlToMathText = function (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    let out = '', math = 0;
    const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; };
    const wrap = (tex, display) => { if (!display) return `$${tex}$`; nl(); return `$$${tex}$$\n`; };
    function walk(node, ctx) {
      if (node.nodeType === 3) { out += ctx.pre ? node.nodeValue : node.nodeValue.replace(/\s+/g, ' '); return; }
      if (node.nodeType !== 1) return;
      const el = node, tag = el.tagName.toUpperCase(), cls = el.classList;
      if (SKIP.has(tag) && !(tag === 'SCRIPT' && /^math\/tex/i.test(el.type))) return;
      // MathJax 2: 그림은 버리고 script[type=math/tex]의 원문을 쓴다
      if (tag === 'SCRIPT') { math++; out += wrap(el.textContent.trim(), /mode=display/i.test(el.type)); return; }
      if (cls.contains('MathJax_Preview') || cls.contains('MathJax') || cls.contains('MathJax_Display') || cls.contains('MathJax_SVG') || cls.contains('MathJax_SVG_Display')) return;
      // KaTeX
      if (cls.contains('katex-display') || cls.contains('katex')) {
        const t = texOf(el);
        if (t !== null) { math++; out += wrap(t, cls.contains('katex-display')); return; }
        const m = el.querySelector('.katex-mathml');
        out += m ? m.textContent : el.textContent; return;
      }
      // MathJax 3 (CHTML/SVG) 또는 MathML
      if (tag === 'MJX-CONTAINER' || tag === 'MATH') {
        const t = texOf(el);
        const disp = el.getAttribute('display') === 'true' || el.getAttribute('display') === 'block';
        if (t !== null) { math++; out += wrap(t, disp); return; }
        const mml = tag === 'MATH' ? el : el.querySelector('mjx-assistive-mml math, math');
        if (mml) { math++; out += wrap(mml.textContent.replace(/\s+/g, ''), disp); return; }
        out += el.textContent; return;
      }
      if (tag === 'BR') { out += '\n'; return; }
      const block = BLOCK.has(tag);
      if (block) nl();
      if (tag === 'LI') {
        const p = el.parentElement;
        if (p && p.tagName === 'OL') out += (Array.prototype.indexOf.call(p.children, el) + (+p.getAttribute('start') || 1)) + '. ';
        else out += '- ';
      }
      if (/^H[1-6]$/.test(tag)) out += '#'.repeat(+tag[1]) + ' ';
      const bold = tag === 'STRONG' || tag === 'B';
      if (bold) out += '**';
      if (tag === 'TD' || tag === 'TH') { if (el.previousElementSibling) out += ' | '; }
      const sub = tag === 'PRE' ? { pre: true } : ctx;
      el.childNodes.forEach(c => walk(c, sub));
      if (bold) out += '**';
      if (block) nl();
    }
    walk(doc.body, { pre: false });
    const text = out.split('\n').map(l => l.replace(/[ \t ]+$/g, '').replace(/^[ \t ]+(?=\S)/, m => m.replace(/ /g, ' '))).join('\n')
      .replace(/\*\*\s*\*\*/g, '').replace(/\n{3,}/g, '\n\n').trim();
    return { text, math };
  };

  // ── 표시: $…$, $$…$$, \(…\), \[…\] 수식과 **굵게**, # 제목 ──
  const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$/g;
  function inlineMarks(s) {
    return esc(s);
  }
  function textHTML(s) {
    return s.split('\n').map(line => {
      const h = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
      return h ? `<b class="ai-h">${inlineMarks(h[2].replace(/\*\*/g, ''))}</b>` : inlineMarks(line);
    }).join('\n');
  }
  UI.aiTextHTML = function (text) {
    text = UI.stripFences(text);
    let h = '', last = 0, m;
    MATH_RE.lastIndex = 0;
    while ((m = MATH_RE.exec(text))) {
      const disp = m[1] !== undefined || m[2] !== undefined;
      const tex = (m[1] || m[2] || m[3] || m[4]).trim();
      let before = text.slice(last, m.index);
      if (disp) before = before.replace(/[ \t]*\n?[ \t]*$/, '');
      h += textHTML(before);
      h += disp ? `<span class="ai-disp">\\(\\displaystyle ${esc(tex)}\\)</span>` : `<span class="ai-math">\\(${esc(tex)}\\)</span>`;
      last = MATH_RE.lastIndex;
      if (disp) { const nl = text.slice(last).match(/^[ \t]*\n?/); last += nl[0].length; }
    }
    h += textHTML(text.slice(last));
    // **굵게**는 수식을 감쌀 수 있으므로 수식 처리 뒤 한 줄 안에서 짝을 맞춘다
    return h.replace(/\*\*((?:(?!\*\*)[^\n])+?)\*\*/g, '<b>$1</b>');
  };

  // 코드 블록 표시(```, ```text 등) 줄을 지운다. 요청문이 답변 전체를 코드 블록에 담도록 하기 때문
  UI.stripFences = (t) => String(t).replace(/^[ \t]*```[\w-]*[ \t]*$\n?/gm, '').replace(/^\n+|\n+$/g, '');

  // 붙여넣기 처리: 수식이 든 HTML이면 LaTeX로 바꾸고, 코드 블록 표시는 지운다
  UI.handleAiPaste = function (e) {
    const el = e.target, cd = e.clipboardData;
    if (!cd) return false;
    const html = cd.getData('text/html'), plain = cd.getData('text/plain');
    let text = null;
    if (html) { const r = UI.htmlToMathText(html); if (r.math) text = r.text; }
    if (text === null && /^[ \t]*```/m.test(plain)) text = plain;
    if (text === null) return false;
    text = UI.stripFences(text);
    e.preventDefault();
    el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
