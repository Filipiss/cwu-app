// backend/electron-main.js
const { app, BrowserWindow, shell, Tray, Menu, nativeImage, globalShortcut, screen } = require('electron');
const path = require('path');

// Permite execução estável como Administrador no Windows (evita crashes de sandbox com privilégio elevado)
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

// Inicia o servidor local do CWU App (com token de sessão desta execução)
process.env.CWU_SESSION_TOKEN = require('crypto').randomBytes(32).toString('hex');
require('./server.js');
const db = require('./src/database/db');
const { overlayBounds } = require('./src/utils/overlayLayout');
const updateState = require('./src/utils/updateState');

const APP_ORIGIN = 'http://127.0.0.1:4321';
const APP_ID = 'com.cwuapp.utility'; // mesmo appId do package.json
const OVERLAY_HOTKEY = 'Alt+I';
const ICON = path.join(__dirname, 'build', 'icon.png');

// Só abre no navegador links web; bloqueia file://, ms-settings: forjados, etc.
function openExternalSafe(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'https:' || protocol === 'http:') shell.openExternal(url);
  } catch (e) { /* URL inválida: ignora */ }
}

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let isQuitting = false;
let trayHintShown = false;

const settings = () => db.getSettings();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: 'CWU App',
    backgroundColor: '#0a0d14',
    autoHideMenuBar: true,
    icon: ICON,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: !app.isPackaged
    }
  });

  const loadUrlWithRetry = () => {
    mainWindow.loadURL(`${APP_ORIGIN}/?t=${process.env.CWU_SESSION_TOKEN}`).catch(() => {
      setTimeout(loadUrlWithRetry, 300);
    });
  };

  loadUrlWithRetry();

  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(loadUrlWithRetry, 500);
  });

  // Redireciona links externos (downloads de drivers, sites de fabricantes) para o navegador padrão
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== APP_ORIGIN) {
      event.preventDefault();
      openExternalSafe(url);
    }
  });

  // X: vai para os ícones ocultos (bandeja) em vez de fechar, se a opção estiver ligada
  mainWindow.on('close', (event) => {
    if (isQuitting || !settings().closeToTray) return;
    event.preventDefault();
    mainWindow.hide();
    if (!trayHintShown && tray && process.platform === 'win32') {
      trayHintShown = true;
      tray.displayBalloon({
        iconType: 'info',
        title: 'CWU App continua aberto',
        content: `Ele ficou nos ícones ocultos da barra de tarefas. Use ${OVERLAY_HOTKEY} para mostrar a sobreposição de desempenho.`
      });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

// ===== Identidade nas notificações do Windows =====
// Sem isto o Windows mostra "Electron". Como o exe é portátil (sem atalho no menu Iniciar),
// o nome e o ícone ficam registrados só para o usuário atual (HKCU, sem precisar de administrador).
function registerNotificationIdentity() {
  if (process.platform !== 'win32') return;
  app.setAppUserModelId(APP_ID);
  try {
    const fs = require('fs');
    const iconCopy = path.join(app.getPath('userData'), 'notification-icon.png');
    // O ícone dentro do .asar não é visível para o Windows: copia para a pasta de dados do app
    fs.copyFileSync(ICON, iconCopy);
    const key = `HKCU\\Software\\Classes\\AppUserModelId\\${APP_ID}`;
    const { execFile } = require('child_process');
    execFile('reg', ['add', key, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', 'CWU App', '/f'], { windowsHide: true }, () => {});
    execFile('reg', ['add', key, '/v', 'IconUri', '/t', 'REG_SZ', '/d', iconCopy, '/f'], { windowsHide: true }, () => {});
  } catch (e) { /* sem registro: a notificação só perde o nome/ícone */ }
}

// ===== Bandeja (ícones ocultos) =====
function createTray() {
  const image = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('CWU App');
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
  refreshTrayMenu();
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir CWU App', click: showMainWindow },
    {
      label: `Sobreposição de desempenho (${OVERLAY_HOTKEY})`,
      type: 'checkbox',
      checked: Boolean(overlayWindow && overlayWindow.isVisible()),
      click: toggleOverlay
    },
    { type: 'separator' },
    { label: 'Sair', click: quitApp }
  ]));
}

// ===== Sobreposição (overlay) =====
// Janela transparente, sempre no topo, que não recebe cliques nem foco (não atrapalha o jogo).
// No modo de posicionamento ela passa a aceitar o mouse para ser arrastada.
let overlaySize = { width: 190, height: 108 };
let overlayEditing = false;

function createOverlay() {
  overlayWindow = new BrowserWindow({
    width: overlaySize.width,
    height: overlaySize.height,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true, devTools: false }
  });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadOverlay();
  overlayWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  overlayWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  overlayWindow.on('closed', () => { overlayWindow = null; overlayEditing = false; });
  positionOverlay();
}

function loadOverlay() {
  overlayWindow.loadURL(`${APP_ORIGIN}/overlay.html${overlayEditing ? '?edit=1' : ''}`).catch(() => {});
}

function positionOverlay() {
  if (!overlayWindow || overlayEditing) return;
  overlayWindow.setBounds(overlayBounds(settings(), screen.getPrimaryDisplay().workArea, overlaySize));
}

function toggleOverlay() {
  if (!overlayWindow) createOverlay();
  if (overlayEditing) return finishOverlayEdit(false);
  if (overlayWindow.isVisible()) {
    overlayWindow.hide();
  } else {
    positionOverlay();
    overlayWindow.showInactive();
  }
  refreshTrayMenu();
}

// Modo de posicionamento: a caixa vira arrastável até o usuário salvar (Enter) ou cancelar (Esc)
function startOverlayEdit() {
  if (!overlayWindow) createOverlay();
  overlayEditing = true;
  overlayWindow.setIgnoreMouseEvents(false);
  overlayWindow.setFocusable(true);
  loadOverlay();
  overlayWindow.show();
  overlayWindow.focus();
  refreshTrayMenu();
}

function finishOverlayEdit(save) {
  if (!overlayWindow || !overlayEditing) return;
  if (save) {
    const b = overlayWindow.getBounds();
    const wa = screen.getPrimaryDisplay().workArea;
    const EDIT_PADDING = 6; // margem da borda tracejada do modo de posicionamento (overlay.css)
    db.updateSettings({ overlayPosition: 'custom', overlayX: b.x - wa.x + EDIT_PADDING, overlayY: b.y - wa.y + EDIT_PADDING });
  }
  overlayEditing = false;
  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.setFocusable(false);
  loadOverlay();
  positionOverlay();
  overlayWindow.showInactive();
  refreshTrayMenu();
}

// ===== Atualização automática =====
// Usa o electron-updater com as releases do GitHub (latest.yml + instalador + .blockmap).
// O arquivo baixado é conferido pelo SHA-512 publicado no latest.yml antes de instalar.
// Só funciona na versão instalada; no modo de desenvolvimento a aba mostra o link de download.
function setupAutoUpdater() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { return; }
  autoUpdater.autoDownload = false;        // só baixa quando o usuário clicar em "Atualizar agora"
  autoUpdater.autoInstallOnAppQuit = true; // se ele não reiniciar na hora, aplica ao sair
  updateState.set({ supported: true });

  autoUpdater.on('update-available', (info) => updateState.set({ version: info.version }));
  autoUpdater.on('update-not-available', () => updateState.set({ status: 'none' }));
  autoUpdater.on('download-progress', (p) => updateState.set({ status: 'downloading', percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => updateState.set({ status: 'downloaded', percent: 100, version: info.version }));
  autoUpdater.on('error', (err) => updateState.set({ status: 'error', error: String(err && err.message || err).slice(0, 300) }));

  db.events.on('update-download', async () => {
    const { status } = updateState.get();
    if (status === 'checking' || status === 'downloading' || status === 'downloaded') return;
    updateState.set({ status: 'checking', percent: 0, error: null });
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result || !result.isUpdateAvailable) { updateState.set({ status: 'none' }); return; }
      updateState.set({ status: 'downloading' });
      await autoUpdater.downloadUpdate();
    } catch (err) {
      updateState.set({ status: 'error', error: String(err && err.message || err).slice(0, 300) });
    }
  });

  // Versão anterior: baixa e confere o instalador, roda em silêncio e fecha o app (ele reabre na versão escolhida)
  db.events.on('rollback-install', async (version) => {
    const { status } = updateState.get();
    if (['checking', 'downloading', 'rollback'].includes(status)) return;
    updateState.set({ status: 'rollback', percent: 0, version, error: null });
    try {
      const file = await require('./src/services/rollbackService').prepare(version, (pct) => updateState.set({ percent: pct }));
      updateState.set({ status: 'rollback-ready', percent: 100 });
      const { spawn } = require('child_process');
      spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      isQuitting = true;
      setTimeout(() => app.quit(), 500);
    } catch (err) {
      updateState.set({ status: 'error', error: String(err && err.message || err).slice(0, 300) });
    }
  });

  db.events.on('update-install', () => {
    if (updateState.get().status !== 'downloaded') return;
    isQuitting = true; // não manda para os ícones ocultos ao fechar
    setImmediate(() => autoUpdater.quitAndInstall(true, true)); // instala em silêncio e reabre
  });
}

// Instaladores baixados para voltar de versão ficam na pasta temporária: quando o app abre,
// a instalação já terminou, então eles podem ser apagados
function cleanupRollbackInstallers() {
  try {
    const fs = require('fs');
    const dir = require('os').tmpdir();
    fs.readdirSync(dir)
      .filter(f => /^CWU-App-Setup-\d+\.\d+\.\d+\.exe$/.test(f))
      .forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* em uso: fica para a próxima */ } });
  } catch (e) { /* pasta temporária inacessível */ }
}

// Previne abrir múltiplas instâncias simultâneas
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);

  app.whenReady().then(() => {
    registerNotificationIdentity();
    setupAutoUpdater();
    cleanupRollbackInstallers();
    createWindow();
    createTray();
    if (!globalShortcut.register(OVERLAY_HOTKEY, toggleOverlay)) {
      console.warn(`[overlay] Atalho ${OVERLAY_HOTKEY} em uso por outro programa`);
    }
    // Configurações alteradas no app: a sobreposição relê sozinha; aqui só reposiciona
    db.events.on('settings', positionOverlay);
    db.events.on('overlay-toggle', toggleOverlay);
    db.events.on('overlay-size', (size) => {
      overlaySize = size;
      if (overlayEditing && overlayWindow) overlayWindow.setSize(Math.round(size.width), Math.round(size.height));
      else positionOverlay();
    });
    db.events.on('overlay-edit', startOverlayEdit);
    db.events.on('overlay-save-position', () => finishOverlayEdit(true));
    db.events.on('overlay-cancel-edit', () => finishOverlayEdit(false));
    screen.on('display-metrics-changed', positionOverlay);
  });

  app.on('before-quit', () => { isQuitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuitting) app.quit();
  });
}
