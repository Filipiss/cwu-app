// frontend/scripts/modules/versions.js
/**
 * Módulo de Novas Versões do CWU App (Updater)
 */
const VersionsModule = {
  data: null,

  async init() {
    this.bindEvents();
    await this.loadVersionInfo();
  },

  bindEvents() {
    const checkBtn = document.getElementById('btn-check-new-version');
    if (checkBtn) {
      checkBtn.addEventListener('click', () => {
        this.checkForUpdates();
      });
    }
  },

  async loadVersionInfo() {
    try {
      const res = await API.getVersionInfo();
      if (res.success) {
        this.data = res.data;
        this.render();
      }
    } catch (err) {
      console.error('Erro ao buscar dados de versão:', err);
    }
  },

  render() {
    if (!this.data) return;

    const currentVerEl = document.getElementById('current-app-version');
    const releaseDateEl = document.getElementById('app-release-date');
    const changelogContainer = document.getElementById('app-changelog-container');

    if (currentVerEl) currentVerEl.textContent = `v${this.data.currentVersion}`;
    if (releaseDateEl) releaseDateEl.textContent = this.data.releaseDate;

    if (changelogContainer && this.data.changelog) {
      changelogContainer.innerHTML = this.data.changelog.map(entry => `
        <div class="c-card u-mb-md">
          <div class="c-card__header">
            <div>
              <h4 class="c-card__title">Versão ${entry.version}</h4>
              <span class="c-card__subtitle">Lançada em ${entry.date}</span>
            </div>
            <span class="c-badge c-badge--success">Versão Atual</span>
          </div>
          <div class="c-card__body">
            <ul style="padding-left: 20px; color: var(--color-text-secondary); font-size: 0.875rem; line-height: 1.8;">
              ${entry.highlights.map(h => `<li>${h}</li>`).join('')}
            </ul>
          </div>
        </div>
      `).join('');
    }
  },

  async checkForUpdates() {
    const btn = document.getElementById('btn-check-new-version');
    const msgEl = document.getElementById('update-check-result');

    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>Checando Servidores...</span> <span class="u-spin">🔄</span>';
      }

      const res = await API.checkUpdate();
      if (res.success) {
        if (msgEl) {
          msgEl.innerHTML = `<span class="u-text-success u-font-bold">✓ ${res.data.message}</span>`;
        }
        App.showToast('CWU App está em sua versão mais recente!', 'success');
      }
    } catch (err) {
      if (msgEl) {
        msgEl.innerHTML = `<span class="u-text-warning">Não foi possível consultar os servidores no momento.</span>`;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>Verificar Atualizações Agora</span> <span>🔍</span>';
      }
    }
  }
};
