// backend/electron-main.js
const { app, BrowserWindow, shell, Tray, Menu, nativeImage, globalShortcut, screen, Notification } = require('electron');
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
const hotkeys = require('./src/utils/hotkeys');
const voice = require('./src/services/voiceService');

const APP_ORIGIN = 'http://127.0.0.1:4321';
const APP_ID = 'com.cwuapp.utility'; // mesmo appId do package.json
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
    // Aberto pelo Windows na inicialização (--hidden): fica só nos ícones ocultos
    show: !process.argv.includes('--hidden'),
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
        content: `Ele ficou nos ícones ocultos da barra de tarefas. Use ${hotkeys.current('overlay')} para mostrar a sobreposição de desempenho.`
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
      label: `Sobreposição de desempenho (${hotkeys.current('overlay')})`,
      type: 'checkbox',
      checked: Boolean(overlayWindow && overlayWindow.isVisible()),
      click: toggleOverlay
    },
    {
      label: `Comandos de voz: "Ei app" (${hotkeys.current('voice')})`,
      type: 'checkbox',
      checked: voice.status === 'listening' || voice.status === 'starting',
      click: toggleVoice
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
let overlayTopTimer = null;
const exclusiveWarned = new Set();

// Jogos em tela cheia (com as otimizações de tela cheia do Windows, o padrão) também ficam
// "sempre no topo" e passam na frente da sobreposição quando ganham o foco ou trocam de resolução.
// Enquanto ela estiver visível, volta para o topo a cada segundo. A janela não é focável,
// então isso não tira o foco do jogo nem o minimiza.
function keepOverlayOnTop(on) {
  clearInterval(overlayTopTimer);
  overlayTopTimer = null;
  if (!on) return;
  overlayTopTimer = setInterval(() => {
    if (!overlayWindow || overlayWindow.isDestroyed() || !overlayWindow.isVisible() || overlayEditing) return;
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.moveTop();
  }, 1000);
}

// Tela cheia exclusiva de verdade: o jogo desenha direto na tela e o Windows não mostra nenhuma
// janela por cima. Não há como contornar sem injetar código no jogo (o que anticheats bloqueiam),
// então o app explica o que fazer, uma vez por jogo.
function warnExclusiveFullscreen(appName) {
  const name = String(appName || '').slice(0, 80);
  if (!name || exclusiveWarned.has(name) || !overlayWindow || !overlayWindow.isVisible()) return;
  exclusiveWarned.add(name);
  if (!Notification.isSupported()) return;
  new Notification({
    title: 'Sobreposição escondida pelo jogo',
    body: `${name} está em tela cheia exclusiva, e nesse modo o Windows não mostra nada por cima do jogo. Use "Janela sem bordas" nas opções de vídeo, ou desmarque "Desabilitar otimizações de tela cheia" nas propriedades do .exe do jogo.`,
    icon: ICON
  }).show();
}

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
  overlayWindow.on('closed', () => { overlayWindow = null; overlayEditing = false; keepOverlayOnTop(false); });
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
    keepOverlayOnTop(false);
  } else {
    positionOverlay();
    overlayWindow.showInactive();
    overlayWindow.moveTop();
    keepOverlayOnTop(true);
  }
  refreshTrayMenu();
}

function setOverlayVisible(visible) {
  const isVisible = Boolean(overlayWindow && overlayWindow.isVisible());
  if (Boolean(visible) !== isVisible || (visible && overlayEditing)) toggleOverlay();
  else if (visible) positionOverlay();
}

// ===== Atalhos globais (personalizáveis em Configurações › Preferências) =====
const HOTKEY_ACTIONS = { overlay: () => toggleOverlay(), voice: () => toggleVoice() };
const activeHotkeys = {}; // id -> atalho registrado agora

function applyHotkey(id, accelerator) {
  const prev = activeHotkeys[id];
  if (prev) { try { globalShortcut.unregister(prev); } catch (e) {} }
  let ok = false;
  try { ok = globalShortcut.register(accelerator, HOTKEY_ACTIONS[id]); } catch (e) { ok = false; }
  if (ok) {
    activeHotkeys[id] = accelerator;
  } else if (prev) {
    // Não deu: volta o atalho anterior
    try { globalShortcut.register(prev, HOTKEY_ACTIONS[id]); } catch (e) {}
  }
  hotkeys.setRegistered(id, ok || Boolean(prev));
  refreshTrayMenu();
  return ok;
}

function registerHotkeys() {
  hotkeys.setImpl({ apply: applyHotkey });
  for (const id of Object.keys(hotkeys.HOTKEYS)) {
    const acc = hotkeys.current(id);
    if (!applyHotkey(id, acc)) {
      hotkeys.setRegistered(id, false);
      console.warn(`[atalho] ${acc} em uso por outro programa`);
    }
  }
}

// ===== Comandos de voz =====
// Liga e desliga a escuta. A resposta de cada comando aparece como notificação e, se a opção
// estiver ligada, é falada pela voz do Windows.
function toggleVoice() {
  const st = voice.toggle();
  const on = st.status === 'starting' || st.status === 'listening';
  voiceFeedback({ text: on ? 'Comandos de voz ligados. Fale "Ei app" e o comando.' : 'Comandos de voz desligados.', ok: true, short: on ? 'Comandos de voz ligados.' : 'Comandos de voz desligados.' });
}

function speak(text) {
  if (!settings().voiceReplies || process.platform !== 'win32') return;
  const b64 = Buffer.from(String(text).slice(0, 200), 'utf8').toString('base64');
  require('./src/utils/powershell').runPowerShell(`
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'pt-BR' } | Select-Object -First 1
if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }
$s.Speak([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')))`, 15000).catch(() => {});
}

function voiceFeedback({ text, ok, short }) {
  speak(short || text);
  if (Notification.isSupported()) new Notification({ title: ok === false ? 'CWU App: comando não executado' : 'CWU App', body: text, icon: ICON, silent: true }).show();
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
  keepOverlayOnTop(true);
  refreshTrayMenu();
}

// ===== Atualização =====
// O download (com pausar, parar e retomar) fica no servidor local (updateDownloader.js), que confere
// o SHA-512 publicado no latest.yml. Aqui o Electron só executa o instalador pronto e fecha o app.
// Só na versão instalada; no modo de desenvolvimento a aba mostra o link de download.
function runInstallerAndQuit(file) {
  const { spawn } = require('child_process');
  // --updated: o instalador mantém pasta e atalhos escolhidos; --force-run: abre o app ao terminar
  spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  isQuitting = true;
  setTimeout(() => app.quit(), 500);
}

function setupUpdates() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) return;
  updateState.set({ supported: true });
  const downloader = require('./src/services/updateDownloader');

  db.events.on('update-install', async () => {
    const file = await downloader.readyFile();
    if (!file) {
      updateState.set({ status: 'error', error: 'O instalador baixado não foi encontrado ou não confere mais. Baixe a atualização de novo.' });
      return;
    }
    runInstallerAndQuit(file);
  });

  // Versão anterior: baixa e confere o instalador, roda em silêncio e fecha o app (ele reabre na versão escolhida)
  db.events.on('rollback-install', async (version) => {
    const { status } = updateState.get();
    if (['rollback', 'rollback-ready'].includes(status)) return;
    updateState.set({ status: 'rollback', percent: 0, version, error: null });
    try {
      const file = await require('./src/services/rollbackService').prepare(version, (pct) => updateState.set({ percent: pct }));
      updateState.set({ status: 'rollback-ready', percent: 100 });
      runInstallerAndQuit(file);
    } catch (err) {
      updateState.set({ status: 'error', error: String(err && err.message || err).slice(0, 300) });
    }
  });
}

// Instaladores baixados ficam na pasta temporária. Quando o app abre, a instalação já terminou:
// apaga os prontos e os parciais de versões que não são mais novas que esta (um parcial de versão
// mais nova fica, para o download poder continuar de onde parou)
function cleanupDownloadedInstallers() {
  try {
    const fs = require('fs');
    const dir = require('os').tmpdir();
    const { compareVersions } = require('./src/services/versionService');
    const current = app.getVersion();
    fs.readdirSync(dir).forEach(f => {
      const m = f.match(/^CWU-App-Setup-(\d+\.\d+\.\d+)\.exe(\.part)?$/);
      if (!m) return;
      if (m[2] && compareVersions(m[1], current) > 0) return;
      try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* em uso: fica para a próxima */ }
    });
  } catch (e) { /* pasta temporária inacessível */ }
}

// "Sempre iniciar como administrador": pede a permissão do Windows (UAC) antes de abrir a janela.
// Se o usuário negar, o app abre normalmente, sem administrador. Devolve true quando vai reabrir.
async function elevateOnStartIfWanted() {
  if (process.platform !== 'win32' || !settings().startAsAdmin) return false;
  try {
    const elevation = require('./src/services/elevationService');
    if ((await elevation.status()).isAdmin) return false;
    const r = await elevation.relaunchAsAdmin(); // a instância elevada abre e esta fecha sozinha
    if (r.success) { isQuitting = true; return true; }
  } catch (e) { /* segue sem administrador */ }
  return false;
}

// Previne abrir múltiplas instâncias simultâneas
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);

  app.whenReady().then(async () => {
    registerNotificationIdentity();
    if (await elevateOnStartIfWanted()) return;
    setupUpdates();
    cleanupDownloadedInstallers();
    createWindow();
    createTray();
    registerHotkeys();
    db.events.on('overlay-set', setOverlayVisible);
    db.events.on('show-main-window', showMainWindow);
    db.events.on('hide-main-window', () => { if (mainWindow) mainWindow.minimize(); });
    db.events.on('voice-feedback', voiceFeedback);
    db.events.on('voice-toggle', toggleVoice);
    voice.on('state', (st) => {
      refreshTrayMenu();
      if (st.status === 'error' && st.error) voiceFeedback({ text: st.error, ok: false, short: 'Os comandos de voz pararam. Veja o motivo no app.' });
    });
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
    db.events.on('overlay-exclusive', warnExclusiveFullscreen);
    screen.on('display-metrics-changed', positionOverlay);
  });

  app.on('before-quit', () => { isQuitting = true; });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); voice.stop(); });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuitting) app.quit();
  });
}
