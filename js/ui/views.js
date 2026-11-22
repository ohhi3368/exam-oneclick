/* 가운데 화면(시험지·풀이·검증·BeAT·동형 문항·구조)과 오른쪽 보기 목록 */
(function (root) {
  'use strict';
  const MH = root.MH; const UI = MH.ui; const E = MH.Engine; const S = UI.S; const C = UI.C;
  const { $, esc, opt, field } = UI;

  UI.afterCompute = function () { if (!$('#app').hidden) UI.renderMain(); };

  UI.renderMain = function () {
    const r = S.result; if (!r) return;
    const s = S.state.spec; const si = UI.statusInfo();
    $('#bar-summary').innerHTML = `<b>${esc(S.state.title || s.meta.unit)}</b>${esc(s.meta.grade)}, ${esc(C.FORMAT[s.present.format])}`;
    const marks = {
      check: r.status === 'error' ? '' : r.status === 'unsupported' ? '해당 없음' : r.checks.some(c => c.state === 'fail') ? '확인 필요' : r.checks.length + '항목 통과',
      ai: r.status === 'unsupported' ? '필요' : '',
    };
    $('#side').innerHTML = `<div class="side-status"><dl>
        <dt>풀이</dt><dd>${esc(si.mode)}</dd><dt>정답</dt><dd>${esc(si.ans)}</dd>
        <dt>검토</dt><dd class="${si.flag ? 'flag' : ''}">${esc(si.review)}</dd></dl></div>
      <ul class="side-nav">${C.VIEWS.map(([k, l]) => `<li><button class="${S.view === k ? 'on' : ''}" data-view="${k}">${l}<span class="mark">${esc(marks[k] || '')}</span></button></li>`).join('')}</ul>`;
    const V = $('#view');
    let body;
    if (r.status === 'error') body = `<p class="msg">문항 구조를 해석할 수 없습니다. ${esc(r.error)}</p><p class="small">왼쪽 목록에서 해당 항목을 고쳐 주세요.</p>` + (S.view === 'model' ? modelHTML() : '');
    else body = ({ question: questionHTML, solution: solutionHTML, check: checkHTML, ai: aiHTML, variants: variantsHTML, model: modelHTML })[S.view](si);
    V.innerHTML = '<div class="view-in">' + body + '</div>';
    UI.typeset(V);
  };

  // ── 문항(시험지) ──
  function questionHTML() {
    const r = S.result, s = S.state.spec, pr = s.present; let h = '';
    h += `<article class="sheet"><div class="sheet-acts"><button class="link" data-act="copy-q">발문 복사</button><button class="link" data-act="copy-tex">LaTeX 복사</button></div>`;
    h += `<div class="q-paper"><span class="q-num">${esc(s.meta.number || '1')}.</span>${UI.partsHTML(r.question)}${s.meta.score ? ` <span class="q-score">[${esc(s.meta.score)}점]</span>` : ''}</div>`;
    const mats = materialsHTML(false); if (mats) h += `<div class="mats">${mats}</div>`;
    if (pr.format === 'mc' && r.choices) h += `<div class="choices">${r.choices.list.map((q, i) => `<div>${'①②③④⑤'[i]} ${UI.mathSpan({ tex: q.tex(), plain: q.plain() })}</div>`).join('')}</div>`;
    h += `</article>`;
    if (pr.format === 'mc' && !r.choices) h += `<p class="msg soft">객관식 보기는 엔진이 수치로 검증한 정답이 있을 때만 만들어집니다.</p>`;
    r.warnings.forEach(w => { h += `<p class="msg">${esc(w)}</p>`; });
    if (r.status === 'unsupported') h += `<p class="msg">풀이 엔진이 다루지 않는 문항입니다. 발문은 만들어졌고, 정답과 풀이는 <button class="link" data-view="ai">BeAT 해설</button>에서 받을 수 있습니다.</p>`;
    if ((pr.showGraph || pr.showTable) && r.graph && s.params.some(p => p.role === 'unknown' && S.state.used.has(p.name))) h += `<p class="msg soft">학생용 자료는 조건을 만족하는 값으로 그려집니다. 그래프나 표에서 답이 드러나지 않는지 확인하세요.</p>`;
    return h;
  }
  function materialsHTML(forSolution) {
    const r = S.result, pr = S.state.spec.present; let h = '';
    if (!(pr.showGraph || pr.showTable || forSolution)) return '';
    if (!r.graph) return forSolution ? '' : `<p class="small">함수의 계수가 모두 정해져야 자료를 그릴 수 있습니다.${r.status === 'unsupported' ? '' : ' 문자로 남긴 매개요소를 ‘값 자동 생성’으로 바꾸어 보세요.'}</p>`;
    if (pr.showGraph || forSolution) {
      const svg = UI.graphSVG(r.graph, UI.graphOpts(forSolution));
      if (svg) h += `<figure class="graph">${svg}<figcaption><button class="link" data-act="${forSolution ? 'save-graph-sol' : 'save-graph'}">이미지로 저장</button>${r.graph.skipped && r.graph.skipped.length ? `<span class="small">계수가 정해지지 않아 ${esc(r.graph.skipped.join(', '))}은(는) 그리지 않았습니다.</span>` : ''}</figcaption></figure>`;
    }
    if (pr.showTable && !forSolution) h += UI.tableHTML(r.graph);
    return h;
  }

  // ── 정답과 풀이 ──
  function stepsHTML(steps) {
    return `<ol class="steps">${steps.map(s => s.head ? `<li class="case">${UI.partsHTML(s.parts)}</li>` : `<li class="${s.rule === '조건 확인' ? 'drop' : ''}">${UI.partsHTML(s.parts)}</li>`).join('')}</ol>`;
  }
  function solutionHTML(si) {
    const r = S.result, rv = S.state.review; let h = '';
    if (r.status === 'unsupported') {
      h += `<h2>정답과 풀이</h2><p class="lead">풀이 엔진이 다루지 않는 문항입니다. ${esc(r.unsupportedReason)}</p>`;
      h += `<div class="acts-row" style="margin:0 0 30px">${rv.mode === 'manual' ? `<button class="btn-line" data-act="mode-ai">BeAT 해설 초안 쓰기</button>` : `<button class="btn-black" data-view="ai">BeAT에게 해설 요청하기</button><button class="btn-line" data-act="mode-manual">직접 작성하기</button>`}</div>`;
      if (rv.mode === 'manual') h += `<section class="section"><h3>출제자 직접 작성</h3>${field('정답', `<input type="text" data-rv="manualAnswer" value="${esc(rv.manualAnswer)}">`)}${field('풀이', `<textarea data-rv="manualSolution" rows="9">${esc(rv.manualSolution)}</textarea>`)}</section>`;
      if (rv.aiText.trim()) h += `<section class="section"><h3>BeAT 해설 초안<span class="acts small">${esc(si.review)}</span></h3><div class="ai-text">${UI.aiTextHTML(rv.aiText)}</div></section>`;
      return h;
    }
    if (r.answer) h += `<div class="answer"><span>정답</span>${UI.mathSpan({ tex: r.answer.tex, plain: r.answer.plain })}${r.choices && S.state.spec.present.format === 'mc' ? `<span>(${'①②③④⑤'[r.choices.correct]})</span>` : ''}<span class="note">${si.engineOk ? '풀이 엔진이 계산하고 조건을 확인한 답입니다.' : '답을 하나로 정할 수 없습니다.'}</span></div>`;
    else h += `<p class="msg">조건을 모두 만족하는 답이 없습니다. 조건이나 매개요소의 범위를 확인하세요.</p>`;
    r.warnings.forEach(w => { h += `<p class="msg">${esc(w)}</p>`; });
    h += `<section class="section" style="margin-top:28px"><h3>풀이 (${esc(S.state.spec.solve.level)})<span class="acts"><button class="link" data-act="copy-sol">풀이 복사</button></span></h3>${stepsHTML(r.steps)}</section>`;
    const mats = materialsHTML(true);
    if (mats) h += `<section class="section"><h3>해설용 그래프</h3><div class="mats">${mats}</div></section>`;
    return h;
  }

  // ── 검증 ──
  function checkHTML() {
    const r = S.result;
    if (r.status === 'unsupported') return `<h2>검증</h2><p class="lead">풀이 엔진이 다루지 않는 문항이라 자동 검증을 하지 않았습니다. BeAT 해설은 AI 초안으로 남고, 답이 하나로 정해지는지, 빠진 조건은 없는지, 풀이가 맞는지 출제자가 확인해야 합니다.</p><p class="msg">${esc(r.unsupportedReason)}</p>`;
    const sym = { pass: '✓', warn: '!', fail: '✕' };
    return `<h2>검증</h2><p class="lead">문항 구조로 직접 확인한 결과입니다.</p>
      <ul class="checks-list">${r.checks.map(c => `<li><span class="sym">${sym[c.state]}</span><span>${esc(c.name)}</span><span class="nt">${esc(c.note)}</span></li>`).join('')}</ul>
      ${r.rejected.length ? `<p class="msg soft" style="margin-top:20px">조건에 맞지 않아 제외한 후보 ${r.rejected.length}개는 정답과 풀이의 회색 줄에서 볼 수 있습니다. 객관식 보기의 오답으로도 씁니다.</p>` : ''}`;
  }

  // ── BeAT 해설 ──
  const REQUESTS = {
    solution: ['해설 초안', '1. 풀이\n2. 핵심 개념\n3. 최종 답\n4. 검토 필요 사항(해당하는 경우에만)'],
    easy: ['기초 학생용 쉬운 해설', '1. 문제에서 주어진 것과 구하는 것 정리\n2. 단계별 풀이(각 단계에 왜 그렇게 하는지 한 문장씩)\n3. 핵심 개념\n4. 최종 답\n5. 검토 필요 사항(해당하는 경우에만)'],
    errors: ['오답 원인 분석', '1. 풀이\n2. 학생이 자주 틀리는 지점 3가지와 각각의 오답\n3. 지도할 때 강조할 점\n4. 최종 답\n5. 검토 필요 사항(해당하는 경우에만)'],
  };
  UI.buildPrompt = function () {
    const s = S.state.spec, r = S.result, rv = S.state.review;
    const verified = r.status === 'ok' && r.answer && !r.answer.multiple && !r.answer.none;
    const es = UI.engineSpec(UI.clone(s)); es.params = es.params.filter(p => S.state.used.has(p.name));
    const L = [];
    L.push(`당신은 ${s.meta.subject} ${s.meta.grade} 수준의 시험 문항 해설을 작성하는 교육 전문가입니다.`, '아래 문항의 해설을 작성하십시오.', '문항 구조와 조건은 반드시 그대로 유지하고, 문제에 없는 조건을 추가하지 마십시오.');
    L.push('', '[과목 및 학습 수준]', `과목: ${s.meta.subject}`, `단원: ${s.meta.unit}`, `학습 수준: ${s.meta.grade}`);
    L.push('', '[학생용 문항]', UI.partsPlain(r.question || []).trim());
    if (s.present.format === 'mc' && r.choices) L.push(r.choices.list.map((q, i) => '①②③④⑤'[i] + ' ' + q.plain()).join('   '));
    if (s.present.showGraph && r.graph) L.push('(문항에 위 함수의 그래프가 함께 제시됨)');
    L.push('', '[문항 구조]', E.describeSpec(es), '', '[정답 상태]');
    if (verified) {
      L.push('상태: 검증완료 (풀이 엔진이 계산하고 조건을 검증함)', `검증된 정답: ${r.answer.plain}${r.choices && s.present.format === 'mc' ? ' (' + '①②③④⑤'[r.choices.correct] + '번)' : ''}`);
      L.push("정답이 검증된 경우, 다른 결론이 나오더라도 정답을 임의로 수정하지 말고 '검토 필요'라고 표시하십시오.");
    } else {
      L.push('상태: 미검증 (풀이 엔진이 지원하지 않는 유형' + (r.unsupportedReason ? ': ' + r.unsupportedReason : '') + ')');
      if (rv.manualAnswer.trim()) L.push(`출제자가 입력한 정답: ${rv.manualAnswer.trim()}`);
      L.push('정답과 풀이를 함께 제안하십시오. 문제에 없는 가정을 추가하지 마십시오.', '답이 하나로 정해지지 않거나 경우에 따라 달라지면 그 사실과 각 경우의 답을 명시하십시오.');
    }
    L.push('', '[풀이 제약]', `허용 방법: ${s.solve.allowed.join(', ') || '제한 없음'}`, `금지 방법: ${s.solve.forbidden.join(', ') || '없음'}`, `설명 수준: ${s.solve.level}풀이`, '중간 계산을 생략하지 마십시오.');
    L.push('', '[출력 형식]', REQUESTS[rv.request][1]);
    if (verified) L.push(`최종 답은 반드시 '${r.answer.plain}'와 일치해야 합니다.`);
    L.push('', '[작성 방식]', '답변 전체를 하나의 코드 블록(```text 로 시작하고 ``` 로 끝남) 안에 쓰십시오. 코드 블록 밖에는 아무것도 쓰지 마십시오.',
      '수식은 렌더링하지 말고 LaTeX 원문으로 쓰십시오. 문장 속 수식은 $...$, 따로 쓰는 수식은 $$...$$ 로 감싸십시오. 예: $f(x)=x^2-2ax+3$, $0\\le x\\le 2$',
      '코드 블록 안에서는 백틱(`)을 쓰지 마십시오. 굵게는 **...**, 제목은 # 로 쓸 수 있습니다.');
    return L.join('\n');
  };
  function aiHTML(si) {
    const rv = S.state.review, r = S.result; const beatUrl = 'https://beat.busanedu.net/'
    let h = `<h2>BeAT 해설</h2><p class="lead">${r.status === 'ok'
      ? '풀이 엔진이 정답을 검증한 문항입니다. BeAT에게는 정답을 바꾸지 말고 해설 문장만 쓰도록 요청합니다.'
      : '풀이 엔진이 풀지 못한 문항입니다. BeAT가 정답과 풀이를 제안하고, 그 결과는 AI 초안으로 남아 출제자가 확인합니다.'}</p>`;
    h += `<section class="section"><h3>1. 요청문을 복사해 BeAT에 붙여넣기<span class="acts"><button class="link" data-act="copy-prompt">요청문 복사</button>${beatUrl ? `<a class="link" href="${esc(beatUrl)}" target="_blank" rel="noopener">BeAT 열기</a>` : ''}</span></h3>
      <div class="row" style="margin-bottom:12px"><span class="small fx">요청 내용</span><select data-rvsel="request" style="max-width:260px">${Object.entries(REQUESTS).map(([k, v]) => opt(k, v[0], rv.request)).join('')}</select></div>
      <pre class="code">${esc(UI.buildPrompt())}</pre>
      <div class="row" style="margin-top:12px"></section>`;
    h += `<section class="section"><h3>2. BeAT의 답변 붙여넣기<span class="acts small">${rv.aiText.trim() ? esc(si.review) : ''}</span></h3>
      <textarea data-rv="aiText" rows="10" placeholder="BeAT가 쓴 해설을 그대로 붙여넣으세요.">${esc(rv.aiText)}</textarea>
      <div class="acts-row"><button class="btn-line" data-act="check-ai">형식과 정답 확인</button></div>
      ${rv.aiCheck ? `<div class="msg" style="margin-top:16px">${rv.aiCheck.msgs.map(esc).join('<br>')}</div>` : ''}</section>`;
    if (rv.aiText.trim()) h += `<section class="section"><h3>3. 미리 보기</h3><div class="ai-text">${UI.aiTextHTML(rv.aiText)}</div></section>`;
    return h;
  }
  UI.checkAI = function () {
    const rv = S.state.review, r = S.result; const t = rv.aiText; const msgs = []; let flag = false;
    const missing = ['풀이', '핵심 개념', '최종 답'].filter(x => !t.includes(x));
    if (missing.length) { flag = true; msgs.push('출력 형식에서 빠진 항목: ' + missing.join(', ')); } else msgs.push('출력 형식 항목(풀이, 핵심 개념, 최종 답)이 모두 있습니다.');
    if (!/검토\s*필요\s*사항\s*[:：]?\s*\n?\s*(없|해당\s*없)/.test(t) && /검토\s*필요/.test(t.replace(/검토\s*필요\s*사항/g, ''))) { flag = true; msgs.push('BeAT가 ‘검토 필요’를 표시했습니다. 내용을 확인하세요.'); }
    const fin = extractFinal(t);
    if (r.status === 'ok' && r.answer && !r.answer.multiple) {
      if (fin === null) { flag = true; msgs.push('그러나 엔진이 ‘최종 답’ 부분은 명확히 찾지 못했습니다.'); }
      else if (sameAnswer(fin, r)) msgs.push(`최종 답 “${fin}”이 검증된 정답 ${r.answer.plain}과 같습니다.`);
      else { flag = true; msgs.push(`최종 답 “${fin}”이 검증된 정답 ${r.answer.plain}과 다릅니다. 해설을 쓰기 전에 확인하세요.`); }
    } else msgs.push(fin !== null ? `BeAT가 제안한 최종 답은 “${fin}”입니다. 엔진이 검증하지 못한 답이므로 출제자가 확인해야 합니다.` : '‘최종 답’ 부분을 찾지 못했습니다.');
    rv.aiCheck = { flag, msgs, final: fin };
  };
  function extractFinal(t) {
    const m = t.match(/최종\s*답[^\n:：]*[:：]?\s*([^\n]*)(\n+([^\n]+))?/);
    if (!m) return null;
    let s = (m[1] && m[1].trim()) ? m[1] : (m[3] || '');
    // 목록 기호(- •)는 수식 기호를 지우기 전에 떼어야 $-a^2$의 음수 부호가 남는다
    s = s.replace(/^\s*[-•]\s+/, '').replace(/\\[()[\]]/g, '').replace(/[*#`$]/g, '').trim();
    return s || null;
  }
  function normAns(s) { return String(s).replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/²/g, '^2').replace(/³/g, '^3').replace(/[.。]$/, '').replace(/(이다|입니다|이며|임)$/, ''); }
  function sameAnswer(fin, r) {
    const a = normAns(fin), b = normAns(r.answer.plain);
    const re = new RegExp('(^|[^0-9.a-z])' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^0-9.^a-z])');
    if (re.test(a)) return true;
    if (r.answer.V && r.answer.V.p) { try { if (E.parse(a.replace(/^[^=]*=/, '').replace(/[가-힣]+.*$/, '')).sub(r.answer.V.p).isZero()) return true; } catch (e) { /* 무시 */ } }
    return false;
  }

  // ── 동형 문항 ──
  function variantsHTML() {
    const rnd = S.state.spec.params.filter(p => p.role === 'random' && S.state.used.has(p.name));
    let h = `<h2>동형 문항</h2><p class="lead">매개요소에 값을 넣어 보고, 조건과 정답의 유일성을 검사해서 통과한 문항만 남기는 작업을 수행합니다.</p>`;
    if (!rnd.length) return h + `<p class="msg soft">역할이 ‘값 자동 생성’인 매개요소가 없습니다. 왼쪽 매개요소에서 역할을 바꾸면 숫자만 다른 문항을 만들 수 있습니다.</p><div class="acts-row"><button class="btn-line" data-ex="random">동형 문항 예제 열기</button></div>`;
    h += `<section class="section"><h3>${rnd.map(p => esc(p.name) + '는 ' + p.rlo + '부터 ' + p.rhi + '까지').join(', ')}</h3>
      <div class="checks"><label><input type="checkbox" id="v-int" ${UI.store.get('mh.vint', true) ? 'checked' : ''}>정답이 정수인 문항만 남기기</label></div>
      <div class="acts-row"><button class="btn-black" data-act="gen-variants">5개 만들기</button><span class="small" id="v-stat">${esc(S.variantStat || '')}</span></div></section>`;
    if (S.variants.length) h += `<ol class="variants">${S.variants.map((v, i) => `<li><div><div class="vq">${UI.partsHTML(v.question)}</div><div class="va">정답 ${esc(v.answer.plain)}, ${esc(Object.entries(v.values).map(([k, x]) => k + ' = ' + x).join(', '))}</div></div><button class="link" data-act="use-variant" data-i="${i}">이 문항으로 바꾸기</button></li>`).join('')}</ol>`;
    return h;
  }
  UI.genVariants = function () {
    const rnd = S.state.spec.params.filter(p => p.role === 'random' && S.state.used.has(p.name));
    const intOnly = $('#v-int') ? $('#v-int').checked : true; UI.store.set('mh.vint', intOnly);
    const out = [], seen = new Set(); let tries = 0, rejected = 0;
    const es = UI.engineSpec();
    while (out.length < 5 && tries < 300) {
      tries++;
      const values = {}; rnd.forEach(p => { values[p.name] = UI.pickRandom(p); });
      const key = JSON.stringify(values); if (seen.has(key)) continue; seen.add(key);
      const r = E.compile(es, values);
      const ok = r.status === 'ok' && r.answer && !r.answer.multiple && !r.answer.none && !r.answer.free && r.checks.every(c => c.state !== 'fail');
      if (!(ok && (!intOnly || (r.numericAnswer && r.numericAnswer.isInt())))) { rejected++; continue; }
      out.push({ values, question: r.question, answer: r.answer });
    }
    S.variants = out; S.variantStat = `${seen.size}개를 검사해 ${out.length}개를 남기고 ${rejected}개를 뺐습니다.`;
    UI.renderMain();
  };

  // ── 구조 데이터 ──
  function modelHTML() {
    const s = S.state.spec; const si = S.result && S.result.status !== 'error' ? UI.statusInfo() : null;
    const model = {
      '의미 모델': { 요소: s.elements, 매개요소: s.params.filter(p => S.state.used.has(p.name)), 조건: s.conds, 목표: s.target },
      '표현 모델': { 발문형식: C.FORMAT[s.present.format], 자료: { 그래프: s.present.showGraph, 함숫값표: s.present.showTable }, 조건상자: s.conds.filter(c => c.box).length },
      '풀이설정': { 풀이모드: si ? si.mode : '-', 정답상태: si ? si.ans : '-', 요구풀이방법: s.solve.allowed, 금지풀이방법: s.solve.forbidden, 설명수준: s.solve.level + '풀이', 검토상태: si ? si.review : '-' },
    };
    return `<h2>구조 데이터</h2><p class="lead">디버깅용이에요</p>
      <section class="section"><h3>문항 구조<span class="acts"><button class="link" data-act="copy-json">복사</button></span></h3><pre class="code">${esc(JSON.stringify(model, null, 2))}</pre></section>`;
  }
})(typeof window !== 'undefined' ? window : globalThis);
