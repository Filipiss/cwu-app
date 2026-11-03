// backend/electron-main.js
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Permite execução estável como Administrador no Windows (evita crashes de sandbox com privilégio elevado)
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

// Inicia o servidor local do CWU App
require('./server.js');

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
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const loadUrlWithRetry = () => {
    mainWindow.loadURL('http://127.0.0.1:4321').catch(() => {
      setTimeout(loadUrlWithRetry, 300);
    });
  };

  loadUrlWithRetry();

  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(loadUrlWithRetry, 500);
  });

  // Redireciona links externos (downloads de drivers, sites de fabricantes) para o navegador padrão
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1:4321')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://127.0.0.1:4321')) {
      event.preventDefault();
      shell.openExternal(url);
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
