// 데스크톱(Electron) 실행 진입점: index.html을 창으로 연다.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: '시험딸깍',
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  // 외부 링크는 기본 브라우저로 연다.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (/^https?:/i.test(url)) { e.preventDefault(); shell.openExternal(url); }
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

Menu.setApplicationMenu(Menu.buildFromTemplate([
  { label: '파일', submenu: [{ role: 'quit', label: '끝내기' }] },
  { label: '편집', submenu: [
    { role: 'undo', label: '실행 취소' }, { role: 'redo', label: '다시 실행' }, { type: 'separator' },
    { role: 'cut', label: '잘라내기' }, { role: 'copy', label: '복사' }, { role: 'paste', label: '붙여넣기' }, { role: 'selectAll', label: '모두 선택' }
  ] },
  { label: '보기', submenu: [
    { role: 'reload', label: '새로 고침' }, { role: 'toggleDevTools', label: '개발자 도구' }, { type: 'separator' },
    { role: 'resetZoom', label: '원래 크기' }, { role: 'zoomIn', label: '확대' }, { role: 'zoomOut', label: '축소' },
    { type: 'separator' }, { role: 'togglefullscreen', label: '전체 화면' }
  ] }
]));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
