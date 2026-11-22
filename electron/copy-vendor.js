// MathJax를 vendor/mathjax로 복사해 인터넷 없이도 수식이 보이게 한다.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'node_modules', 'mathjax', 'es5');
const dst = path.join(__dirname, '..', 'vendor', 'mathjax');
if (!fs.existsSync(src)) { console.error('mathjax가 없습니다. 먼저 npm install을 실행하세요.'); process.exit(1); }
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log('MathJax 복사 완료 →', path.relative(process.cwd(), dst));

// 나눔명조(본문 명조 글꼴)를 vendor/fonts로 복사한다. 보통(400)·굵게(700), woff2만.
const fsrc = path.join(__dirname, '..', 'node_modules', '@fontsource', 'nanum-myeongjo');
const fdst = path.join(__dirname, '..', 'vendor', 'fonts');
if (!fs.existsSync(fsrc)) { console.error('@fontsource/nanum-myeongjo가 없습니다. 먼저 npm install을 실행하세요.'); process.exit(1); }
fs.rmSync(fdst, { recursive: true, force: true });
fs.mkdirSync(path.join(fdst, 'files'), { recursive: true });
let css = '/* 나눔명조 (SIL OFL 1.1) — electron/copy-vendor.js가 만든 파일 */\n';
for (const w of ['400', '700']) {
  css += fs.readFileSync(path.join(fsrc, w + '.css'), 'utf8')
    .replace(/,\s*url\([^)]*\.woff\) format\('woff'\)/g, '');
}
const used = new Set(css.match(/nanum-myeongjo-[\w-]+\.woff2/g));
used.forEach(f => fs.copyFileSync(path.join(fsrc, 'files', f), path.join(fdst, 'files', f)));
fs.writeFileSync(path.join(fdst, 'nanum-myeongjo.css'), css);
fs.copyFileSync(path.join(fsrc, 'LICENSE'), path.join(fdst, 'LICENSE-nanum-myeongjo.txt'));
console.log('나눔명조 복사 완료 →', path.relative(process.cwd(), fdst), `(${used.size}개 파일)`);
