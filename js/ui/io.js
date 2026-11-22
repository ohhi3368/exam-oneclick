/* 시작 화면, 문항 정보 창, 저장·불러오기 */
(function (root) {
  'use strict';
  const MH = root.MH; const UI = MH.ui; const E = MH.Engine; const S = UI.S; const EX = MH.examples;
  const { $, esc, field } = UI;

  // ── 시작 화면 ──
  UI.showTitle = function () {
    $('#app').hidden = true; $('#info').hidden = true;
    const ex = EX.find(x => x.id === 'box');
    const r = E.compile(ex.spec);
    const bank = UI.store.get('mh.bank', []);
    $('#title-screen').innerHTML = `
      <section class="ts-left">
        <h1>출제를 더 쉽게_<br>딸깍 몇번으로 알아서 척척_</h1>
        <p>마우스 클릭 몇 번 만으로도 복잡한 수학 문제를 설계할 수 있습니다.</p>
        <ul class="ts-actions">
          <li><button data-act="new"><span>새 빈 문항 만들기</span><small>아예 첨부터</small></button></li>
          <li><button data-act="examples"><span>예제 템플릿으로 시작하기</span><small>${EX.length}개 예제로 도구를 익혀보세요</small></button></li>
          <li><button data-act="open-file"><span>파일 열기</span><small>.json 파일을 첨부하세요</small></button></li>
          ${bank.length ? `<li><button data-act="bank"><span>이 브라우저에 저장한 문항</span><small>${bank.length}개</small></button></li>` : ''}
        </ul>
        <div class="ts-foot">BeAT 활용 공모전 출품작으로 제작된 웹 앱임을 알림. 시연용으로 일부 기능은 동작하지 않을 수 있음.</div>
      </section>
      <section class="ts-right" aria-label="생성된 문항 예시">
        <figure class="ts-figure"><div class="ts-sheet"><div class="q-paper"><span class="q-num">1.</span>${UI.partsHTML(r.question)}</div>
          ${r.choices ? `<div class="choices">${r.choices.list.map((q, i) => `<div>${'①②③④⑤'[i]} ${UI.mathSpan({ tex: q.tex(), plain: q.plain() })}</div>`).join('')}</div>` : ''}</div>
          <figcaption class="ts-caption">위 문항은 전부 프로그램이 문항 구조에서 만든 것입니다. 정답 ${esc(r.answer ? r.answer.plain : '')} / 풀이 ${r.steps.length}단계</figcaption></figure>
      </section>`;
    $('#title-screen').hidden = false;
    UI.typeset($('#title-screen'));
  };
  UI.enterApp = function () {
    $('#title-screen').hidden = true; $('#app').hidden = false;
    UI.renderSidebar(); UI.compute();
  };

  // ── 문항 정보 창 ──
  UI.openInfo = function (isNew) {
    const m = S.state.spec.meta;
    $('#info-title').textContent = isNew ? '새 문항' : '문제 설정';
    $('#info-body').innerHTML = `
      ${field('과목', UI.inp('meta.subject', m.subject))}
      ${field('단원', UI.inp('meta.unit', m.unit))}
      ${field('학습 수준', UI.inp('meta.grade', m.grade), 'BeAT 해설 요청문의 과목·수준 항목에 들어갑니다.')}
      <div class="row two">${field('문항 번호', UI.inp('meta.number', m.number, '1'))}${field('배점', UI.inp('meta.score', m.score, '예: 3'), '비워 두면 표시하지 않습니다.')}</div>`;
    $('#info-done').textContent = isNew ? '문항 만들기 시작' : '완료';
    S.infoNew = !!isNew;
    $('#info').hidden = false;
    setTimeout(() => { const el = $('#info-body input'); if (el) el.focus(); }, 30);
  };
  UI.closeInfo = function () {
    $('#info').hidden = true;
    UI.renderMain();
    if (S.infoNew) {
      S.infoNew = false; S.state.sel = { kind: 'element', i: 0 }; UI.renderSidebar();
      setTimeout(() => { const el = $('#sb input[data-k="elements.0.expr"]'); if (el) { el.focus(); el.select(); } }, 30);
    }
  };
  UI.onInfoInput = function (e) {
    const k = e.target.dataset.k; if (!k) return;
    const [, key] = k.split('.'); S.state.spec.meta[key] = e.target.value;
  };

  // ── 새 문항·예제 ──
  UI.startNew = function () {
    UI.load(UI.blankSpec(), '');
    S.view = 'question'; UI.closeModal(); UI.enterApp(); UI.openInfo(true);
  };
  UI.openExample = function (id) {
    const x = EX.find(y => y.id === id);
    UI.load(x.spec, x.title);
    S.view = x.id === 'fallback' ? 'ai' : x.id === 'random' ? 'variants' : 'question';
    UI.closeModal(); UI.enterApp(); UI.toast('예제를 열었습니다.');
  };
  UI.showExamples = function () {
    UI.openModal('예제에서 고르기', `<ul class="opt-list">${EX.map(x => `<li><button data-ex="${x.id}"><span>${esc(x.title)}</span><span class="o-sub">${esc(x.note)}</span></button></li>`).join('')}</ul>`);
  };

  // ── 저장 ──
  const bank = () => UI.store.get('mh.bank', []);
  function defaultName() { return S.state.title || (UI.partsPlain(S.result && S.result.question ? S.result.question : []).slice(0, 40) || '문항'); }
  function fileData(name) {
    const rv = S.state.review;
    return JSON.stringify({ kind: 'structured-item', version: 2, name, savedAt: new Date().toISOString(), spec: S.state.spec, review: { mode: rv.mode, aiText: rv.aiText, manualAnswer: rv.manualAnswer, manualSolution: rv.manualSolution, request: rv.request } }, null, 2);
  }
  UI.showSave = function () {
    UI.openModal('저장', `${field('문항 이름', `<input type="text" id="save-name" value="${esc(defaultName())}">`)}
      <ul class="opt-list">
        <li><button data-act="save-file"><span>파일로 저장</span><span class="o-sub">.json 파일로 내려받습니다. 다른 컴퓨터에서 ‘불러오기, 파일 열기’로 엽니다.</span></button></li>
        <li><button data-act="save-local"><span>이 브라우저에 저장</span><span class="o-sub">이 기기의 이 브라우저에서만 다시 열 수 있습니다.</span></button></li>
      </ul>`);
  };
  UI.saveFile = async function () {
    const name = ($('#save-name').value || '').trim() || '문항';
    const filename = name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) + '.json';
    const data = fileData(name);
    const res = await UI.saveBlob(filename, data, () => {
      UI.openModal('파일로 저장할 수 없습니다', `<p>이 화면에서는 파일을 내려받을 수 없습니다. 아래 내용을 복사해 메모장에 붙여넣고 <b>${esc(filename)}</b> 이름으로 저장하세요.</p><textarea rows="12" readonly>${esc(data)}</textarea>`);
    });
    if (res === 'saved') { S.state.title = name; UI.closeModal(); UI.renderMain(); UI.toast('파일로 저장했습니다.'); }
    else if (res === 'declined') UI.toast('저장을 취소했습니다.');
  };
  UI.saveLocal = function () {
    const name = ($('#save-name').value || '').trim() || '문항';
    const b = bank(); const item = { id: Date.now(), name, spec: UI.clone(S.state.spec), review: UI.clone(S.state.review), at: new Date().toLocaleString('ko-KR') };
    const idx = b.findIndex(x => x.name === name); if (idx >= 0) b[idx] = item; else b.unshift(item);
    if (UI.store.set('mh.bank', b)) { S.state.title = name; UI.closeModal(); UI.renderMain(); UI.toast('이 브라우저에 저장했습니다.'); }
    else UI.toast('이 브라우저에서는 저장할 수 없습니다. 파일로 저장하세요.');
  };

  // ── 불러오기 ──
  UI.showOpen = function () {
    const b = bank();
    UI.openModal('불러오기', `<ul class="opt-list">
        <li><button data-act="open-file"><span>파일 열기</span><span class="o-sub">‘파일로 저장’한 .json 파일을 고릅니다.</span></button></li>
        <li><button data-act="examples"><span>예제에서 고르기</span><span class="o-sub">${EX.length}개의 예제 문항</span></button></li>
        ${b.length ? `<li><button data-act="bank"><span>이 브라우저에 저장한 문항</span><span class="o-sub">${b.length}개</span></button></li>` : ''}
      </ul>`);
  };
  UI.showBank = function () {
    const b = bank();
    UI.openModal('이 브라우저에 저장한 문항', b.length ? b.map(x => `<div class="bank-row"><div><div>${esc(x.name)}</div><div class="small">${esc(x.at)}</div></div><button class="link" data-act="bank-load" data-id="${x.id}">열기</button><button class="link" data-act="bank-del" data-id="${x.id}">삭제</button></div>`).join('') : '<p class="small">저장한 문항이 없습니다.</p>');
  };
  UI.bankLoad = function (id) {
    const x = bank().find(y => String(y.id) === id); if (!x) return;
    UI.load(x.spec, x.name, x.review); UI.closeModal(); S.view = 'question'; UI.enterApp(); UI.toast('문항을 열었습니다.');
  };
  UI.bankDelete = function (id) { UI.store.set('mh.bank', bank().filter(y => String(y.id) !== id)); UI.showBank(); };
  UI.readFile = function (file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const d = JSON.parse(fr.result); const spec = d.spec || d;
        if (!(spec.elements || spec.funcs)) throw new Error('구조 없음');
        UI.load(spec, d.name || file.name.replace(/\.json$/i, ''), d.review);
        UI.closeModal(); S.view = 'question'; UI.enterApp(); UI.toast('파일을 열었습니다.');
      } catch (e) { UI.toast('문항 파일이 아닙니다. ‘파일로 저장’한 .json 파일을 고르세요.'); }
    };
    fr.onerror = () => UI.toast('파일을 읽을 수 없습니다.');
    fr.readAsText(file);
  };
})(typeof window !== 'undefined' ? window : globalThis);
