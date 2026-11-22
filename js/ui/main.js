/* 시작과 이벤트 연결 */
(function (root) {
  'use strict';
  const MH = root.MH; const UI = MH.ui; const S = UI.S;
  const { $ } = UI;

  document.addEventListener('click', (e) => {
    if (e.target.id === 'modal') return UI.closeModal();
    const t = e.target.closest('[data-sel],[data-act],[data-view],[data-ex]');
    if (!t) return;
    if (t.dataset.ex) return UI.openExample(t.dataset.ex);
    if (t.dataset.view) { S.view = t.dataset.view; UI.renderMain(); $('#view').scrollTop = 0; window.scrollTo(0, 0); return; }
    if (t.dataset.sel) return UI.select(t.dataset.sel, t.dataset.i !== undefined ? +t.dataset.i : undefined);
    const act = t.dataset.act;
    if (UI.sidebarAction(act, t)) return;
    const r = S.result, rv = S.state ? S.state.review : null;
    switch (act) {
      case 'new': UI.startNew(); break;
      case 'examples': UI.showExamples(); break;
      case 'open-file': $('#file-input').value = ''; $('#file-input').click(); break;
      case 'bank': UI.showBank(); break;
      case 'open-info': UI.openInfo(false); break;
      case 'close-info': UI.closeInfo(); break;
      case 'close-modal': UI.closeModal(); break;
      case 'save': UI.showSave(); break;
      case 'open': UI.showOpen(); break;
      case 'save-file': UI.saveFile(); break;
      case 'save-local': UI.saveLocal(); break;
      case 'bank-load': UI.bankLoad(t.dataset.id); break;
      case 'bank-del': UI.bankDelete(t.dataset.id); break;
      case 'save-graph': UI.saveGraphImage(false); break;
      case 'save-graph-sol': UI.saveGraphImage(true); break;
      case 'copy-q': UI.copyText(UI.partsPlain(r.question).trim(), '발문을 복사했습니다.'); break;
      case 'copy-tex': UI.copyText(UI.partsTex(r.question), 'LaTeX 발문을 복사했습니다.'); break;
      case 'copy-sol': UI.copyText(r.steps.map((st, i) => (st.head ? '' : (i + 1) + '. ') + UI.partsPlain(st.parts)).join('\n') + (r.answer ? '\n정답: ' + r.answer.plain : ''), '풀이를 복사했습니다.'); break;
      case 'copy-prompt': UI.copyText(UI.buildPrompt(), '요청문을 복사했습니다. BeAT에 붙여넣으세요.'); break;
      case 'copy-json': UI.copyText(JSON.stringify(S.state.spec, null, 2), '구조 데이터를 복사했습니다.'); break;
      case 'mode-manual': rv.mode = 'manual'; UI.renderMain(); break;
      case 'mode-ai': rv.mode = 'ai'; UI.renderMain(); break;
      case 'check-ai': if (!rv.aiText.trim()) { UI.toast('BeAT의 답변을 먼저 붙여넣으세요.'); break; } UI.checkAI(); UI.renderMain(); break;
      case 'gen-variants': UI.genVariants(); break;
      case 'use-variant': {
        const v = S.variants[+t.dataset.i];
        Object.entries(v.values).forEach(([k, x]) => { const p = S.state.spec.params.find(q => q.name === k); if (p) p.value = x; });
        S.view = 'question'; UI.syncParams(); UI.renderSidebar(); UI.compute(); UI.toast('이 문항으로 바꿨습니다.'); break;
      }
    }
  });

  $('#file-input').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) UI.readFile(f); });
  const sb = $('#sb');
  const isToggle = (el) => el.type === 'radio' || el.type === 'checkbox' || el.tagName === 'SELECT';
  sb.addEventListener('input', (e) => { if (!isToggle(e.target)) UI.onEdit(e); });
  sb.addEventListener('change', (e) => { if (isToggle(e.target)) UI.onEdit(e); else if (/\.(rlo|rhi|lo|hi)$/.test(e.target.dataset.k || '')) UI.onEdit(e); });
  $('#info-body').addEventListener('input', UI.onInfoInput);
  $('#info-body').addEventListener('keydown', (e) => { if (e.key === 'Enter') UI.closeInfo(); });
  const V = $('#view');
  V.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.rv) { S.state.review[el.dataset.rv] = el.value; if (el.dataset.rv === 'aiText') S.state.review.aiCheck = null; }
    if (el.dataset.beat) UI.store.set('mh.beatUrl', el.value.trim());
  });
  V.addEventListener('paste', (e) => {
    if (e.target.dataset && e.target.dataset.rv === 'aiText' && UI.handleAiPaste(e)) { UI.checkAI(); UI.renderMain(); }
  });
  V.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.rvsel) { S.state.review[el.dataset.rvsel] = el.value; UI.renderMain(); }
    else if (el.dataset.beat) UI.renderMain();
    else if (el.dataset.rv === 'aiText' && el.value.trim()) { UI.checkAI(); UI.renderMain(); }
    else if (el.dataset.rv) UI.renderMain();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#modal').hidden) UI.closeModal(); else if (!$('#info').hidden) UI.closeInfo();
  });

  // 시작
  if (root.claude && typeof root.claude.use === 'function') {
    try { root.claude.use('downloads').then(d => { S.downloads = d; }).catch(() => {}); } catch (e) { /* 무시 */ }
  }
  UI.initMath();
  UI.showTitle();
})(typeof window !== 'undefined' ? window : globalThis);
