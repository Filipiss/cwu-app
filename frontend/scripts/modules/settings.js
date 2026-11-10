// frontend/scripts/modules/settings.js
/**
 * Módulo de Configurações do CWU App
 */
const SettingsModule = {
  settings: {
    theme: 'graphite',
    language: 'pt-BR',
    autoScanOnStart: true,
    notifyOutdatedDrivers: true
  },

  async init() {
    this.bindEvents();
    await this.loadSettings();
  },

  bindEvents() {
    // Seletor de Tema
    const themeCards = document.querySelectorAll('.js-theme-option');
    themeCards.forEach(card => {
      card.addEventListener('click', () => {
        const theme = card.dataset.theme;
        this.setTheme(theme);
        this.saveSettings();
      });
    });

    // Seletor de Idioma
    const langSelect = document.getElementById('setting-language-select');
    if (langSelect) {
      langSelect.addEventListener('change', (e) => {
        this.settings.language = e.target.value;
        this.saveSettings();
        I18N.set(e.target.value); // troca o idioma na hora, sem recarregar
        App.showToast(I18N.t('Idioma alterado.'), 'success');
      });
    }

    // Campos ligados direto a uma configuração (sobreposição e bandeja)
    // Controles deslizantes salvam enquanto arrasta (com um pequeno atraso): a sobreposição muda ao vivo
    let rangeTimer = null;
    document.querySelectorAll('[data-setting]').forEach(el => {
      const read = () => (el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value);
      el.addEventListener('change', () => { this.settings[el.dataset.setting] = read(); this.saveSettings(); });
      if (el.type === 'range') {
        el.addEventListener('input', () => {
          this.settings[el.dataset.setting] = read();
          this.updateRangeLabel(el);
          clearTimeout(rangeTimer);
          rangeTimer = setTimeout(() => this.saveSettings(), 150);
        });
      }
    });
    document.getElementById('btn-overlay-toggle')?.addEventListener('click', () => API.toggleOverlay().catch(() => {}));
    document.getElementById('btn-overlay-edit')?.addEventListener('click', () => {
      API.startOverlayEdit().catch(() => {});
      const sel = document.getElementById('setting-overlay-position');
      if (sel) sel.value = 'custom';
    });

    // Toggles de preferências
    const autoScanToggle = document.getElementById('setting-auto-scan');
    if (autoScanToggle) {
      autoScanToggle.addEventListener('change', (e) => {
        this.settings.autoScanOnStart = e.target.checked;
        this.saveSettings();
      });
    }
  },

  async loadSettings() {
    try {
      const res = await API.getSettings();
      if (res.success && res.data) {
        this.settings = { ...this.settings, ...res.data };
      }
    } catch (err) {
      console.warn('Usando configurações locais:', err);
    }
    this.applySettingsToUI();
  },

  setTheme(theme) {
    this.settings.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cwu_theme', theme);

    // Atualiza cards de seleção visual
    document.querySelectorAll('.js-theme-option').forEach(card => {
      if (card.dataset.theme === theme) {
        card.classList.add('c-card--highlight');
        card.querySelector('.c-badge').textContent = 'Ativo';
        card.querySelector('.c-badge').className = 'c-badge c-badge--success';
      } else {
        card.classList.remove('c-card--highlight');
        card.querySelector('.c-badge').textContent = 'Selecionar';
        card.querySelector('.c-badge').className = 'c-badge c-badge--neutral';
      }
    });

    App.showToast(`Tema alterado para: ${theme}`, 'success');
  },

  applySettingsToUI() {
    let savedTheme = localStorage.getItem('cwu_theme') || this.settings.theme || 'graphite';
    // Temas antigos (Futurista, Clássico, Light) caem no Grafite
    if (!['graphite', 'frost'].includes(savedTheme)) savedTheme = 'graphite';
    this.setTheme(savedTheme);

    const langSelect = document.getElementById('setting-language-select');
    if (langSelect) langSelect.value = I18N.lang;

    const autoScanToggle = document.getElementById('setting-auto-scan');
    if (autoScanToggle) autoScanToggle.checked = this.settings.autoScanOnStart;

    document.querySelectorAll('[data-setting]').forEach(el => {
      const v = this.settings[el.dataset.setting];
      if (v === undefined) return;
      if (el.type === 'checkbox') el.checked = Boolean(v);
      else el.value = v;
      if (el.type === 'range') this.updateRangeLabel(el);
    });
  },

  updateRangeLabel(el) {
    const out = document.querySelector(`.c-range-value[data-for="${el.id}"]`);
    if (out) out.textContent = `${el.value}${el.dataset.unit || ''}`;
  },

  async saveSettings() {
    try {
      await API.updateSettings(this.settings);
    } catch (err) {
      console.error('Falha ao persistir configurações:', err);
    }
  }
};
