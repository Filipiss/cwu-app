// backend/electron-main.js
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Permite execução estável como Administrador no Windows (evita crashes de sandbox com privilégio elevado)
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

// Inicia o servidor local do CWU App (com token de sessão desta execução)
process.env.CWU_SESSION_TOKEN = require('crypto').randomBytes(32).toString('hex');
require('./server.js');

const APP_ORIGIN = 'http://127.0.0.1:4321';
// Só abre no navegador links web; bloqueia file://, ms-settings: forjados, etc.
function openExternalSafe(url) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'https:' || protocol === 'http:') shell.openExternal(url);
  } catch (e) { /* URL inválida: ignora */ }
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: 'CWU App - Clean Windows Utility',
    backgroundColor: '#0a0d14',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Previne abrir múltiplas instâncias simultâneas
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
