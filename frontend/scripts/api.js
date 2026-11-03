// frontend/scripts/api.js
/**
 * Cliente de API do CWU App
 */
const API = {
  baseUrl: (typeof window !== 'undefined' && window.location.protocol.startsWith('http') && window.location.origin !== 'null')
    ? window.location.origin
    : 'http://localhost:4321',

  async request(endpoint, options = {}) {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      return json;
    } catch (error) {
      console.error(`[API Error] ${endpoint}:`, error);
      throw error;
    }
  },

  // System Specs
  getSpecs() {
    return this.request('/api/specs');
  },

  // Drivers & Scan
  scanDrivers() {
    return this.request('/api/drivers/scan');
  },

  getOutdatedDrivers() {
    return this.request('/api/drivers/outdated');
  },

  getEssentialSoftwares() {
    return this.request('/api/software/essential');
  },

  // System Logs & Atualizações
  getLogs() {
    return this.request('/api/logs');
  },

  getUpdateLogs() {
    return this.request('/api/logs/updates');
  },

  revertUpdate(id) {
    return this.request('/api/logs/revert', {
      method: 'POST',
      body: JSON.stringify({ id })
    });
  },

  recordUpdate(data) {
    return this.request('/api/logs/record', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  clearUpdateLogs() {
    return this.request('/api/logs/clear', {
      method: 'POST'
    });
  },

  // Boost Gamer
  getBoostStatus() {
    return this.request('/api/boost/status');
  },

  runBoost(actionId) {
    return this.request('/api/boost/optimize', {
      method: 'POST',
      body: JSON.stringify({ actionId })
    });
  },

  // Settings
  getSettings() {
    return this.request('/api/settings');
  },

  updateSettings(data) {
    return this.request('/api/settings', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // Instalação em lote (winget)
  getWingetStatus() {
    return this.request('/api/winget/status');
  },

  installWinget(ids) {
    return this.request('/api/winget/install', { method: 'POST', body: JSON.stringify({ ids }) });
  },

  getWingetJob() {
    return this.request('/api/winget/job');
  },

  cancelWinget() {
    return this.request('/api/winget/cancel', { method: 'POST', body: '{}' });
  },

  createRestorePoint() {
    return this.request('/api/system/restore-point', { method: 'POST', body: '{}' });
  },

  getProcesses() {
    return this.request('/api/processes');
  },

  setProcessPriority(name, priority, persistent) {
    return this.request('/api/processes/priority', { method: 'POST', body: JSON.stringify({ name, priority, persistent }) });
  },

  removeProcessPriority(exe) {
    return this.request('/api/processes/priority/remove', { method: 'POST', body: JSON.stringify({ exe }) });
  },

  getMonitor() { return this.request('/api/monitor'); },
  getStartup() { return this.request('/api/startup'); },
  toggleStartup(id, enabled) { return this.request('/api/startup/toggle', { method: 'POST', body: JSON.stringify({ id, enabled }) }); },
  getTweaks() { return this.request('/api/tweaks'); },
  setTweak(id, enabled) { return this.request('/api/tweaks/set', { method: 'POST', body: JSON.stringify({ id, enabled }) }); },
  getRamDiagnostic() { return this.request('/api/ram-diagnostic'); },

  // Version
  getVersionInfo() {
    return this.request('/api/version');
  },

  checkUpdate() {
    return this.request('/api/version/check');
  }
};
