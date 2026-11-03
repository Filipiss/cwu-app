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

  // Version
  getVersionInfo() {
    return this.request('/api/version');
  },

  checkUpdate() {
    return this.request('/api/version/check');
  }
};
