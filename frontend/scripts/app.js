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
    ScanModule.init();
    SoftsModule.init();
    WingetModule.init();
    ProcessesModule.init();
    PerfModule.init();
    SecurityModule.init();
    document.getElementById('btn-export-report')?.addEventListener('click', () => {
      App.showToast('Gerando relatório… o download começa em alguns segundos.', 'info', 6000);
    });
    BoostModule.init();
    LogsModule.init();
    VersionsModule.init();

    // Auto-scan se estiver ativo nas configurações
    if (SettingsModule.settings.autoScanOnStart) {
      setTimeout(() => {
        ScanModule.runScan();
      }, 1000);
    }

    // Suporte a rotas por hash (#boost, #scan, #softs, etc.)
    const initialHash = window.location.hash.replace('#', '');
    if (initialHash && ['specs', 'scan', 'softs', 'boost', 'perf', 'security', 'logs', 'settings', 'versions'].includes(initialHash)) {
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
      if (tab && ['specs', 'scan', 'softs', 'boost', 'perf', 'security', 'logs', 'settings', 'versions'].includes(tab)) {
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
        versions: { title: 'Novas Versões', desc: 'Histórico de versões e atualizações do CWU App' }
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
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'futuristic';
        let nextTheme = 'futuristic';
        if (currentTheme === 'futuristic') nextTheme = 'graphite';
        else if (currentTheme === 'graphite') nextTheme = 'light';
        else nextTheme = 'futuristic';

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

    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    else if (type === 'warning') icon = '⚠️';
    else if (type === 'danger') icon = '❌';

    toast.innerHTML = `
      <span style="font-size: 1.1rem;">${icon}</span>
      <span>${message}</span>
    `;

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
