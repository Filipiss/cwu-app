// frontend/scripts/app.js
/**
 * CWU App - Aplicação Central
 */
const App = {
  currentTab: 'specs',

  async init() {
    this.bindNavigation();
    this.bindHeaderActions();

    // Inicializa configurações primeiro para carregar o tema correto
    await SettingsModule.init();

    // Inicializa módulos principais
    await SpecsModule.init();
    SubTabs.init();
    // Ações de botões gerados dinamicamente (sem onclick inline, compatível com a CSP)
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const arg = el.dataset.arg;
      if (el.dataset.action === 'tab') App.switchTab(arg);
      else if (el.dataset.action === 'driver-download') ScanModule.onDownloadDriver(arg);
      else if (el.dataset.action === 'soft-download') SoftsModule.onDownloadSoftware(arg, el.dataset.arg2);
      else if (el.dataset.action === 'driver-wu') API.runBoost('open_windows_update').then(r => App.showToast((r.data && r.data.message) || 'Windows Update aberto.', 'info', 8000)).catch(() => {});
      else if (el.dataset.action === 'softs-clear') SoftsModule.clearSearch();
    });
    Sidebar.init();
    ElevationBanner.init();
    ScanModule.init();
    SoftsModule.init();
    WingetModule.init();
    ProcessesModule.init();
    CompetitiveModule.init();
    PerfModule.init();
    SecurityModule.init();
    document.getElementById('btn-export-report')?.addEventListener('click', () => {
      App.showToast('Gerando relatório… o download começa em alguns segundos.', 'info', 6000);
    });
    BoostModule.init();
    LogsModule.init();
    VersionsModule.init();
    Account.init();

    // Auto-scan se estiver ativo nas configurações
    if (SettingsModule.settings.autoScanOnStart) {
      setTimeout(() => {
        ScanModule.runScan();
      }, 1000);
    }

    // Suporte a rotas por hash (#boost, #scan, #softs, etc.)
    const initialHash = window.location.hash.replace('#', '');
    if (initialHash && ['specs', 'scan', 'softs', 'boost', 'perf', 'security', 'logs', 'settings', 'versions', 'account'].includes(initialHash)) {
      this.switchTab(initialHash);
    }
  },

  bindNavigation() {
    const navItems = document.querySelectorAll('.js-nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const targetTab = item.dataset.tab;
        this.switchTab(targetTab);
      });
    });

    window.addEventListener('hashchange', () => {
      const tab = window.location.hash.replace('#', '');
      if (tab && ['specs', 'scan', 'softs', 'boost', 'perf', 'security', 'logs', 'settings', 'versions', 'account'].includes(tab)) {
        this.switchTab(tab);
      }
    });
  },

  switchTab(tabId) {
    if (!tabId || tabId === this.currentTab) return;

    // Atualiza classes dos botões da sidebar
    document.querySelectorAll('.js-nav-item').forEach(item => {
      if (item.dataset.tab === tabId) {
        item.classList.add('c-nav__item--active');
      } else {
        item.classList.remove('c-nav__item--active');
      }
    });

    // Alterna visibilidade dos painéis de conteúdo
    document.querySelectorAll('.c-tab-panel').forEach(panel => {
      panel.classList.remove('c-tab-panel--active');
    });

    const targetPanel = document.getElementById(`tab-${tabId}`);
    if (targetPanel) {
      targetPanel.classList.add('c-tab-panel--active');
      this.currentTab = tabId;

      // Atualiza título do cabeçalho
      const titles = {
        specs: { title: 'System Specs', desc: 'Diagnóstico detalhado de hardware e índice geral do PC' },
        scan: { title: 'Scannear Drivers', desc: 'Leitura de dispositivos PnP, links oficiais e download direto de drivers' },
        softs: { title: 'Softwares Pós-Format', desc: 'Runtimes C++, DirectX, .NET e programas essenciais' },
        boost: { title: 'Boost Gamer', desc: 'Memória, energia, latência de GPU e prioridade de processos' },
        security: { title: 'Segurança', desc: 'Triagem de processos com sinais de programas maliciosos' },
        perf: { title: 'Performance', desc: 'Monitor em tempo real, inicialização, ajustes de jogos e diagnóstico de RAM' },
        logs: { title: 'Logs', desc: 'Erros do Windows e histórico de alterações do CWU App' },
        settings: { title: 'Configurações', desc: 'Temas visuais, preferências e idioma' },
        versions: { title: 'Novas Versões', desc: 'Histórico de versões e atualizações do CWU App' },
        account: { title: 'Minha Conta', desc: 'Login e personalização do app' }
      };

      const headerTitle = document.getElementById('page-header-title');
      const headerSubtitle = document.querySelector('.c-header__subtitle');
      if (titles[tabId]) {
        if (headerTitle) headerTitle.innerHTML = `<span>${titles[tabId].title}</span>`;
        if (headerSubtitle) headerSubtitle.textContent = titles[tabId].desc;
      }

      // Scroll para o topo
      const scrollContainer = document.querySelector('.o-content-scroll');
      if (scrollContainer) scrollContainer.scrollTop = 0;

      // Atualiza dados dinâmicos da aba selecionada
      if (tabId === 'boost') {
        BoostModule.loadStatus();
      } else if (tabId === 'logs') {
        LogsModule.fetchLogs();
      }
    }
  },

  bindHeaderActions() {
    // Alternador rápido de tema no cabeçalho
    const quickThemeBtn = document.getElementById('btn-quick-theme');
    if (quickThemeBtn) {
      quickThemeBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'frost' ? 'graphite' : 'frost';

        SettingsModule.setTheme(nextTheme);
        SettingsModule.saveSettings();
      });
    }
  },

  showToast(message, type = 'info', customDuration = null) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `c-toast c-toast--${type}`;

    const icons = { success: 'check', warning: 'triangle-alert', danger: 'circle-x', info: 'info' };
    const iconEl = document.createElement('span');
    iconEl.className = 'c-toast__icon';
    iconEl.innerHTML = `<svg class="c-icon" aria-hidden="true"><use href="#i-${icons[type] || 'info'}"></use></svg>`;

    // Mensagem como texto puro: pode conter nomes de processos/arquivos vindos do sistema
    const text = document.createElement('span');
    text.textContent = String(message).replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B50}\u{FE0F}]/gu, '').replace(/\s{2,}/g, ' ').trim();
    toast.append(iconEl, text);

    container.appendChild(toast);

    const duration = customDuration || (message.length > 55 ? 6500 : 3500);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

// Inicialização automática após carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
