// frontend/scripts/modules/logs.js
/**
 * Módulo de Logs de Atualizações & Modificações do Sistema
 * Exibe EXCLUSIVAMENTE o que foi atualizado e permite reversão imediata.
 */
const LogsModule = {
  logsData: null,
  activeFilter: 'all',

  init() {
    this.bindEvents();
    this.fetchLogs();
  },

  bindEvents() {
    const refreshBtn = document.getElementById('btn-refresh-logs');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.fetchLogs();
      });
    }

    const clearBtn = document.getElementById('btn-clear-logs');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearLogs();
      });
    }

    // Filtros por categoria
    document.querySelectorAll('.js-log-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.js-log-filter').forEach(b => b.classList.remove('c-btn--active'));
        btn.classList.add('c-btn--active');
        this.activeFilter = btn.dataset.filter || 'all';
        this.render();
      });
    });
  },

  async fetchLogs() {
    const refreshBtn = document.getElementById('btn-refresh-logs');

    try {
      if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<span>Atualizando...</span> <span class="u-spin">⏳</span>';
      }

      const res = await API.getUpdateLogs();
      if (res.success) {
        this.logsData = res.data;
        this.updateStats();
        this.render();
      }
    } catch (err) {
      console.error('Erro ao ler logs de atualizações:', err);
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<span>Atualizar Lista</span> 🔄';
      }
    }
  },

  updateStats() {
    if (!this.logsData) return;
    const { total, updatedCount, revertedCount } = this.logsData;

    const totalEl = document.getElementById('log-stat-total');
    const activeEl = document.getElementById('log-stat-active');
    const revertedEl = document.getElementById('log-stat-reverted');
    const summaryEl = document.getElementById('logs-summary-text');

    if (totalEl) totalEl.textContent = total || 0;
    if (activeEl) activeEl.textContent = updatedCount || 0;
    if (revertedEl) revertedEl.textContent = revertedCount || 0;

    if (summaryEl) {
      if (!total || total === 0) {
        summaryEl.textContent = 'Nenhuma atualização ou modificação foi realizada até o momento.';
      } else {
        summaryEl.innerHTML = `Mostrando <strong>${updatedCount}</strong> modificação(ões) ativas e <strong>${revertedCount}</strong> revertidas.`;
      }
    }
  },

  async revertItem(id) {
    if (!id) return;

    try {
      App.showToast('Revertendo alteração no Windows...', 'info');
      const res = await API.revertUpdate(id);
      if (res.success) {
        App.showToast(res.message || 'Alteração revertida com sucesso!', 'success');
        await this.fetchLogs();
        // Atualiza também o módulo Boost se estiver ativo
        if (typeof BoostModule !== 'undefined' && BoostModule.loadStatus) {
          BoostModule.loadStatus();
        }
      } else {
        App.showToast(res.message || 'Não foi possível reverter a alteração.', 'warning');
      }
    } catch (err) {
      App.showToast('Erro ao comunicar com o servidor para reverter.', 'danger');
    }
  },

  async clearLogs() {
    if (!confirm('Deseja realmente limpar todo o histórico de logs de atualizações?')) {
      return;
    }

    try {
      const res = await API.clearUpdateLogs();
      if (res.success) {
        App.showToast('Histórico de logs limpo com sucesso.', 'info');
        await this.fetchLogs();
      }
    } catch (err) {
      App.showToast('Erro ao limpar histórico.', 'danger');
    }
  },

  formatDate(isoString) {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoString;
    }
  },

  render() {
    const container = document.getElementById('logs-results-container');
    if (!container) return;

    if (!this.logsData || !this.logsData.logs || this.logsData.logs.length === 0) {
      container.innerHTML = `
        <div class="c-card u-text-center" style="padding: 40px 20px;">
          <div style="font-size: 3rem; margin-bottom: 12px;">📋</div>
          <h3 class="c-card__title u-mb-sm">Nenhuma Atualização Registrada Ainda</h3>
          <p class="u-text-muted u-mb-lg" style="max-width: 540px; margin-left: auto; margin-right: auto;">
            Esta aba exibe exclusivamente o que foi alterado ou atualizado no seu Windows. Quando você atualizar drivers no scanner, instalar softwares ou aplicar modos do Boost Gamer, as alterações aparecerão aqui com a opção de reversão rápida.
          </p>
          <div class="o-flex o-flex--center o-flex--gap-md">
            <button class="c-btn c-btn--primary c-btn--sm" onclick="App.switchTab('scan')">
              <span>Scannear Drivers</span> 🔍
            </button>
            <button class="c-btn c-btn--secondary c-btn--sm" onclick="App.switchTab('boost')">
              <span>Ir para Boost Gamer</span> ⚡
            </button>
          </div>
        </div>
      `;
      return;
    }

    // Filtragem
    let list = this.logsData.logs;
    if (this.activeFilter === 'driver') {
      list = list.filter(l => l.type === 'driver');
    } else if (this.activeFilter === 'boost') {
      list = list.filter(l => l.type === 'boost');
    } else if (this.activeFilter === 'software') {
      list = list.filter(l => l.type === 'software');
    }

    if (list.length === 0) {
      container.innerHTML = `
        <div class="c-card u-text-center" style="padding: 30px 20px;">
          <p class="u-text-muted">Nenhum registro encontrado para esta categoria de filtro.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="o-flex o-flex--column o-flex--gap-md">
        ${list.map(item => {
          const isReverted = item.status === 'reverted';
          const cardClass = isReverted ? 'c-card--reverted' : 'c-card--highlight';
          
          let typeBadge = '';
          if (item.type === 'driver') {
            typeBadge = `<span class="c-badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(96, 165, 250, 0.3);">🟢 Driver</span>`;
          } else if (item.type === 'boost') {
            typeBadge = `<span class="c-badge" style="background: rgba(236, 72, 153, 0.15); color: #f472b6; border: 1px solid rgba(244, 114, 182, 0.3);">⚡ Boost Gamer</span>`;
          } else if (item.type === 'software') {
            typeBadge = `<span class="c-badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.3);">📦 Software</span>`;
          } else {
            typeBadge = `<span class="c-badge c-badge--neutral">🔧 Sistema</span>`;
          }

          const statusBadge = isReverted
            ? `<span class="c-badge c-badge--warning">↩️ Revertido</span>`
            : `<span class="c-badge c-badge--success">✓ Atualizado</span>`;

          const revertBtn = isReverted
            ? `<span class="c-badge c-badge--warning" style="font-size: 0.8rem; padding: 5px 12px;">↩️ Revertido em ${this.formatDate(item.revertedAt)}</span>`
            : `<button class="c-btn c-btn--outline c-btn--sm js-btn-revert" data-id="${item.id}" title="Desfazer ou restaurar estado anterior desta alteração">
                <span>Reverter</span> ↩️
              </button>`;

          return `
            <div class="c-card ${cardClass}" style="${isReverted ? 'opacity: 0.82; border-color: rgba(245, 158, 11, 0.3);' : ''}">
              <div class="c-card__header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div class="o-flex o-flex--gap-sm" style="flex-wrap: wrap; align-items: center;">
                  ${statusBadge}
                  ${typeBadge}
                  ${item.category ? `<span class="c-badge c-badge--neutral">${item.category}</span>` : ''}
                  <span class="u-text-muted" style="font-size: 0.8rem;">Registrado: ${this.formatDate(item.timestamp)}</span>
                </div>
                <div>
                  ${revertBtn}
                </div>
              </div>

              <div class="c-card__body">
                <h3 class="c-card__title u-mb-xs" style="font-size: 1.05rem;">
                  ${item.title}
                </h3>
                <p class="u-text-secondary" style="font-size: 0.875rem;">
                  ${item.details || 'Modificação aplicada pelo usuário através do CWU App.'}
                </p>

                ${item.previousVersion && item.updatedVersion ? `
                  <div class="o-flex o-flex--gap-md u-mt-sm" style="font-size: 0.8rem; background: rgba(0,0,0,0.25); padding: 8px 12px; border-radius: 6px; width: fit-content;">
                    <span class="u-text-muted">Versão Anterior: <strong style="color: var(--color-text-secondary);">${item.previousVersion}</strong></span>
                    <span>➔</span>
                    <span class="u-text-success">Versão Instalada: <strong>${item.updatedVersion}</strong></span>
                  </div>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Conectar eventos aos botões de reverter
    container.querySelectorAll('.js-btn-revert').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this.revertItem(id);
      });
    });
  }
};
