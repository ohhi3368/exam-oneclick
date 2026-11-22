/* 그래프: 문항 구조에서 나온 그래프 모델을 흑백 SVG로 그리고, PNG 이미지로 내보낸다 */
(function (root) {
  'use strict';
  const MH = root.MH; const UI = MH.ui; const S = UI.S;
  const { esc } = UI;

  const evalC = (c, x) => c[0] + c[1] * x + c[2] * x * x;
  function roots(c) {
    const [C, B, A] = c;
    if (Math.abs(A) < 1e-12) return Math.abs(B) < 1e-12 ? [] : [-C / B];
    const D = B * B - 4 * A * C; if (D < -1e-12) return []; if (Math.abs(D) < 1e-12) return [-B / (2 * A)];
    const s = Math.sqrt(D); return [(-B - s) / (2 * A), (-B + s) / (2 * A)];
  }
  UI.evalC = evalC;

  // opts: {fns: 이름 배열(빈 배열=전체), points, coords, vertex, intercepts, ends, grid}
  UI.graphSVG = function (model, opts) {
    const fmt = UI.fmtNum;
    const fns = model.fns.filter(f => !opts.fns || !opts.fns.length || opts.fns.includes(f.name));
    const pts = opts.points ? (model.pts || []) : [];
    if (!fns.length && !pts.length) return '';
    const W = 400, H = 340, pad = 30; const id = 'g' + (UI._gid = (UI._gid || 0) + 1);
    const xs = [0];
    fns.forEach(f => {
      if (Math.abs(f.c[2]) > 1e-12) xs.push(-f.c[1] / (2 * f.c[2]));
      if (f.dom.lo !== undefined) xs.push(f.dom.lo); if (f.dom.hi !== undefined) xs.push(f.dom.hi);
      roots(f.c).forEach(x => xs.push(x));
    });
    pts.forEach(p => xs.push(p.x));
    let xmin = Math.min(...xs) - 1.5, xmax = Math.max(...xs) + 1.5;
    if (xmax - xmin < 6) { const m = (xmin + xmax) / 2; xmin = m - 3; xmax = m + 3; }
    xmin = Math.floor(xmin); xmax = Math.ceil(xmax);
    const inDom = (f, x) => (f.dom.lo === undefined || x >= f.dom.lo - 1e-9) && (f.dom.hi === undefined || x <= f.dom.hi + 1e-9);
    const ys = [0];
    fns.forEach(f => {
      for (let i = 0; i <= 80; i++) { const x = xmin + (xmax - xmin) * i / 80; if (inDom(f, x)) ys.push(evalC(f.c, x)); }
      if (Math.abs(f.c[2]) > 1e-12) { const h = -f.c[1] / (2 * f.c[2]); if (inDom(f, h)) ys.push(evalC(f.c, h)); }
    });
    pts.forEach(p => ys.push(p.y));
    let ymin = Math.min(...ys), ymax = Math.max(...ys);
    // 이차함수가 끝없이 커지는 경우 너무 넓어지지 않게 자른다
    const spanY = Math.max(ymax - ymin, 4); ymin = Math.floor(ymin - spanY * 0.12); ymax = Math.ceil(ymax + spanY * 0.12);
    const X = (x) => pad + (x - xmin) / (xmax - xmin) * (W - 2 * pad);
    const Y = (y) => H - pad - (y - ymin) / (ymax - ymin) * (H - 2 * pad);
    const stepOf = (r) => r <= 12 ? 1 : r <= 24 ? 2 : r <= 60 ? 5 : r <= 120 ? 10 : 20;
    const sx = stepOf(xmax - xmin), sy = stepOf(ymax - ymin);
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="함수의 그래프" font-family="Batang, 'AppleMyungjo', 'Nanum Myeongjo', serif">`;
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`;
    if (opts.grid !== false) {
      for (let x = Math.ceil(xmin / sx) * sx; x <= xmax; x += sx) s += `<line x1="${X(x)}" y1="${pad - 6}" x2="${X(x)}" y2="${H - pad + 6}" stroke="#ebebeb"/>`;
      for (let y = Math.ceil(ymin / sy) * sy; y <= ymax; y += sy) s += `<line x1="${pad - 6}" y1="${Y(y)}" x2="${W - pad + 6}" y2="${Y(y)}" stroke="#ebebeb"/>`;
    }
    s += `<defs><marker id="${id}a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#000"/></marker></defs>`;
    const y0 = Y(Math.min(Math.max(0, ymin), ymax)), x0 = X(Math.min(Math.max(0, xmin), xmax));
    s += `<line x1="${pad - 8}" y1="${y0}" x2="${W - pad + 12}" y2="${y0}" stroke="#000" stroke-width="1" marker-end="url(#${id}a)"/>`;
    s += `<line x1="${x0}" y1="${H - pad + 8}" x2="${x0}" y2="${pad - 12}" stroke="#000" stroke-width="1" marker-end="url(#${id}a)"/>`;
    s += `<text x="${W - pad + 8}" y="${y0 - 7}" font-size="14" font-style="italic">x</text><text x="${x0 + 7}" y="${pad - 8}" font-size="14" font-style="italic">y</text>`;
    s += `<text x="${x0 - 5}" y="${y0 + 15}" font-size="13" text-anchor="end">O</text>`;
    s += `<clipPath id="${id}p"><rect x="0" y="${pad - 10}" width="${W}" height="${H - 2 * pad + 20}"/></clipPath>`;
    const dashes = ['', '7 4', '2 3', '10 3 2 3'];
    const labels = [];
    fns.forEach((f, fi) => {
      const a = f.dom.lo !== undefined ? Math.max(xmin, f.dom.lo) : xmin, b = f.dom.hi !== undefined ? Math.min(xmax, f.dom.hi) : xmax;
      let d = '';
      for (let i = 0; i <= 160; i++) { const x = a + (b - a) * i / 160, y = evalC(f.c, x); d += (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Math.max(Math.min(Y(y), H + 40), -40).toFixed(1); }
      const dash = dashes[fi % dashes.length];
      s += `<path d="${d}" fill="none" stroke="#000" stroke-width="1.8" ${dash ? `stroke-dasharray="${dash}"` : ''} clip-path="url(#${id}p)"/>`;
      [['lo', f.dom.loC], ['hi', f.dom.hiC]].forEach(([k, closed]) => {
        if (f.dom[k] === undefined) return; const x = f.dom[k], y = evalC(f.c, x);
        if (y < ymin || y > ymax) return;
        s += `<circle cx="${X(x)}" cy="${Y(y)}" r="3.6" fill="${closed ? '#000' : '#fff'}" stroke="#000" stroke-width="1.4"/>`;
        if (opts.ends) labels.push({ x: X(x), y: Y(y), t: '(' + fmt(x) + ', ' + fmt(y) + ')' });
      });
      if (fns.length > 1) { const lx = b - (b - a) * 0.1, ly = evalC(f.c, lx); if (ly > ymin && ly < ymax) s += `<text x="${X(lx) + 5}" y="${Y(ly) - 8}" font-size="13" font-style="italic" paint-order="stroke" stroke="#fff" stroke-width="3">y=${esc(f.name)}(x)</text>`; }
      if (opts.vertex && Math.abs(f.c[2]) > 1e-12) {
        const hx = -f.c[1] / (2 * f.c[2]), hy = evalC(f.c, hx);
        if (inDom(f, hx) && hx >= xmin && hx <= xmax) {
          s += `<line x1="${X(hx)}" y1="${Y(hy)}" x2="${X(hx)}" y2="${y0}" stroke="#000" stroke-dasharray="2 3" stroke-width="0.8"/>`;
          s += `<circle cx="${X(hx)}" cy="${Y(hy)}" r="3" fill="#000"/>`;
          labels.push({ x: X(hx), y: Y(hy), t: '(' + fmt(hx) + ', ' + fmt(hy) + ')', below: f.c[2] > 0 });
        }
      }
      if (opts.intercepts) {
        if (inDom(f, 0)) { const yi = evalC(f.c, 0); if (yi >= ymin && yi <= ymax && Math.abs(yi) > 1e-9) { s += `<circle cx="${x0}" cy="${Y(yi)}" r="2.6" fill="#000"/>`; labels.push({ x: x0, y: Y(yi), t: fmt(yi), left: true }); } }
        roots(f.c).forEach(rx => { if (inDom(f, rx) && Math.abs(rx) > 1e-9) { s += `<circle cx="${X(rx)}" cy="${y0}" r="2.6" fill="#000"/>`; labels.push({ x: X(rx), y: y0, t: fmt(rx), under: true }); } });
      }
    });
    if (opts.intercepts && fns.length >= 2) {
      for (let i = 0; i < fns.length; i++) for (let j = i + 1; j < fns.length; j++) {
        const f = fns[i], g = fns[j]; const c = [f.c[0] - g.c[0], f.c[1] - g.c[1], f.c[2] - g.c[2]];
        roots(c).forEach(x => { if (inDom(f, x) && inDom(g, x)) { const y = evalC(f.c, x); s += `<circle cx="${X(x)}" cy="${Y(y)}" r="3" fill="#000"/>`; labels.push({ x: X(x), y: Y(y), t: '(' + fmt(x) + ', ' + fmt(y) + ')' }); } });
      }
    }
    pts.forEach(p => {
      if (p.y < ymin || p.y > ymax) return;
      s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="3.4" fill="#000"/>`;
      labels.unshift({ x: X(p.x), y: Y(p.y), t: p.name + (opts.coords ? '(' + fmt(p.x) + ', ' + fmt(p.y) + ')' : ''), italic: false });
    });
    const placed = [];
    labels.forEach(L => {
      let tx = L.x + 7, ty = L.below ? L.y + 17 : L.y - 9, anchor = 'start';
      if (L.left) { tx = L.x - 7; ty = L.y + 5; anchor = 'end'; }
      if (L.under) { tx = L.x; ty = L.y + 17; anchor = 'middle'; }
      if (tx > W - 80 && anchor === 'start') { tx = L.x - 7; anchor = 'end'; }
      for (let k = 0; k < 4 && placed.some(p => Math.abs(p.x - tx) < 44 && Math.abs(p.y - ty) < 13); k++) ty += L.below ? 14 : -14;
      placed.push({ x: tx, y: ty });
      s += `<text x="${tx}" y="${ty}" font-size="13" text-anchor="${anchor}" paint-order="stroke" stroke="#fff" stroke-width="4">${esc(L.t)}</text>`;
    });
    return s + `</svg>`;
  };
  UI.graphOpts = function (forSolution) {
    const g = S.state.spec.present.graph;
    if (forSolution) return { fns: g.fns, points: true, coords: true, vertex: true, intercepts: true, ends: true, grid: g.grid };
    return { fns: g.fns, points: g.points, coords: g.coords, vertex: g.vertex, intercepts: g.intercepts, ends: false, grid: g.grid };
  };

  UI.tableHTML = function (model) {
    const name = S.state.spec.present.tableFn;
    const f = model.fns.find(x => x.name === name) || model.fns[0]; if (!f) return '';
    let xs = [];
    if (f.dom.lo !== undefined && f.dom.hi !== undefined) { for (let x = Math.ceil(f.dom.lo); x <= Math.floor(f.dom.hi) && xs.length < 9; x++) xs.push(x); }
    else { const c = Math.abs(f.c[2]) > 1e-12 ? Math.round(-f.c[1] / (2 * f.c[2])) : 0; for (let x = c - 3; x <= c + 3; x++) if ((f.dom.lo === undefined || x >= f.dom.lo) && (f.dom.hi === undefined || x <= f.dom.hi)) xs.push(x); }
    if (!xs.length) return '';
    return `<table class="vt"><tr><th>x</th>${xs.map(x => `<td>${UI.fmtNum(x)}</td>`).join('')}</tr><tr><th>${esc(f.name)}(x)</th>${xs.map(x => `<td>${UI.fmtNum(evalC(f.c, x))}</td>`).join('')}</tr></table>`;
  };

  // SVG → PNG (3배 해상도, 흰 바탕)
  UI.svgToPng = function (svg, scale) {
    scale = scale || 3;
    return new Promise((resolve, reject) => {
      const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/); const w = m ? +m[1] : 400, h = m ? +m[2] : 340;
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas'); cv.width = w * scale; cv.height = h * scale;
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
        try { cv.toBlob(b => b ? resolve(b) : reject(new Error('변환 실패')), 'image/png'); } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('그래프를 이미지로 바꿀 수 없습니다.'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  };
  UI.saveGraphImage = async function (forSolution) {
    const r = S.result;
    if (!r || !r.graph) { UI.toast('그릴 수 있는 그래프가 없습니다. 함수의 계수가 모두 정해져야 합니다.'); return; }
    const svg = UI.graphSVG(r.graph, UI.graphOpts(forSolution));
    if (!svg) { UI.toast('그릴 함수를 하나 이상 고르세요.'); return; }
    try {
      const blob = await UI.svgToPng(svg, 3);
      const name = (S.state.title || S.state.spec.meta.unit || '문항') + (forSolution ? ' 해설 그래프' : ' 그래프');
      const res = await UI.saveBlob(name.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.png', blob, () => showImage(blob));
      if (res === 'saved') UI.toast('그래프를 PNG 이미지로 저장했습니다.');
      else if (res === 'declined') UI.toast('저장을 취소했습니다.');
    } catch (e) { UI.toast(e.message); }
  };
  function showImage(blob) {
    const url = URL.createObjectURL(blob);
    UI.openModal('그래프 이미지', `<img src="${url}" alt="그래프" style="max-width:100%;border:1px solid #dadada"><p class="small">이 화면에서는 파일을 바로 내려받을 수 없습니다. 이미지를 오른쪽 클릭(길게 눌러) 저장하세요.</p>`);
  }
})(typeof window !== 'undefined' ? window : globalThis);
