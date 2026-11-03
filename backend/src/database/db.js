// backend/src/database/db.js
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { DRIVER_CATALOG, ESSENTIAL_SOFTWARES, BSOD_ENCYCLOPEDIA } = require('./seedData');

class LocalDatabase {
  constructor() {
    const isPackaged = Boolean(process.resourcesPath) || __dirname.includes('app.asar');
    if (isPackaged && process.env.APPDATA) {
      this.dataDir = path.join(process.env.APPDATA, 'CWU-App');
    } else {
      this.dataDir = path.resolve(__dirname, '../../data');
    }
    this.dbFile = path.join(this.dataDir, 'cwu_store.json');
    this.state = {
      settings: {
        theme: config.defaultTheme,
        language: config.defaultLanguage,
        autoScanOnStart: true,
        notifyOutdatedDrivers: true,
        autoRestorePoint: true
      },
      scanHistory: [],
      updateLogs: [],
      driversCatalog: DRIVER_CATALOG,
      essentialSoftwares: ESSENTIAL_SOFTWARES,
      bsodEncyclopedia: BSOD_ENCYCLOPEDIA
    };
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }

      if (fs.existsSync(this.dbFile)) {
        const raw = fs.readFileSync(this.dbFile, 'utf8');
        const parsed = JSON.parse(raw);
        this.state = {
          ...this.state,
          ...parsed,
          // Sempre mantém o catálogo de drivers e softwares atualizado com a versão mais recente
          driversCatalog: DRIVER_CATALOG,
          essentialSoftwares: ESSENTIAL_SOFTWARES,
          bsodEncyclopedia: BSOD_ENCYCLOPEDIA
        };
      } else {
        this.save();
      }
    } catch (err) {
      console.warn('[DB] Erro ao carregar arquivo de banco local, inicializando em memória:', err.message);
      // Se não conseguiu no diretório atual, chaveia para APPDATA
      if (process.env.APPDATA) {
        this.dataDir = path.join(process.env.APPDATA, 'CWU-App');
        this.dbFile = path.join(this.dataDir, 'cwu_store.json');
        this.save();
      }
    }
  }

  save() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.writeFileSync(this.dbFile, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (err) {
      try {
        const fallbackDir = path.join(process.env.APPDATA || require('os').tmpdir(), 'CWU-App');
        if (!fs.existsSync(fallbackDir)) {
          fs.mkdirSync(fallbackDir, { recursive: true });
        }
        this.dataDir = fallbackDir;
        this.dbFile = path.join(this.dataDir, 'cwu_store.json');
        fs.writeFileSync(this.dbFile, JSON.stringify(this.state, null, 2), 'utf8');
      } catch (fallbackErr) {
        console.warn('[DB] Banco mantido em memória:', fallbackErr.message);
      }
    }
  }

  getSettings() {
    return { ...this.state.settings };
  }

  updateSettings(newSettings) {
    this.state.settings = { ...this.state.settings, ...newSettings };
    this.save();
    return this.state.settings;
  }

  getDriverCatalog() {
    return [...this.state.driversCatalog];
  }

  getEssentialSoftwares() {
    return [...this.state.essentialSoftwares];
  }

  getBsodEncyclopedia() {
    return [...this.state.bsodEncyclopedia];
  }

  addScanRecord(record) {
    this.state.scanHistory.unshift({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...record
    });
    // Manter apenas os 20 últimos históricos
    if (this.state.scanHistory.length > 20) {
      this.state.scanHistory.pop();
    }
    this.save();
  }

  getScanHistory() {
    return [...this.state.scanHistory];
  }

  getUpdateLogs() {
    if (!Array.isArray(this.state.updateLogs)) {
      this.state.updateLogs = [];
    }
    return [...this.state.updateLogs];
  }

  addUpdateLog(log) {
    if (!Array.isArray(this.state.updateLogs)) {
      this.state.updateLogs = [];
    }
    const newEntry = {
      id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toISOString(),
      status: 'updated', // 'updated' ou 'reverted'
      ...log
    };
    this.state.updateLogs.unshift(newEntry);
    this.save();
    return newEntry;
  }

  revertUpdateLog(id) {
    if (!Array.isArray(this.state.updateLogs)) return null;
    const item = this.state.updateLogs.find(l => l.id === id);
    if (item) {
      item.status = 'reverted';
      item.revertedAt = new Date().toISOString();
      this.save();
      return item;
    }
    return null;
  }

  clearUpdateLogs() {
    this.state.updateLogs = [];
    this.save();
    return true;
  }
}

const db = new LocalDatabase();
module.exports = db;
