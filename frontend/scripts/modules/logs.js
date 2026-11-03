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

  errorsData: null,

  async analyzeErrors() {
    const btn = document.getElementById('btn-analyze-errors');
    const summary = document.getElementById('errors-summary-text');
    const container = document.getElementById('errors-results-container');
    if (!container) return;

    const days = document.getElementById('errors-filter-period')?.value || '30';
    if (btn) btn.disabled = true;
    if (summary) summary.textContent = 'Lendo o Visualizador de Eventos… isso pode levar alguns segundos.';
    container.innerHTML = '';

    try {
      const res = await API.getLogs(days);
      const d = res.data || {};
      this.errorsData = d;
      if (!d.readAvailable) {
        if (summary) summary.textContent = d.message || 'Leitura indisponível.';
        return;
      }
      if (summary) {
        summary.textContent = `Últimos ${d.periodDays} dias: ${d.bsodCount} tela(s) azul(is), ${d.unexpectedShutdowns} desligamento(s) inesperado(s), ${d.minidumps.length} minidump(s).`;
      }
      this.renderErrors();
    } catch (err) {
      console.error('Erro ao analisar eventos:', err);
      if (summary) summary.textContent = 'Erro ao consultar o Visualizador de Eventos.';
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  // Aplica os filtros (gravidade, tipo, busca) sem consultar o Windows de novo
  renderErrors() {
    const container = document.getElementById('errors-results-container');
    const countEl = document.getElementById('errors-filter-count');
    const d = this.errorsData;
    if (!container || !d || !d.readAvailable) return;

    const severity = document.getElementById('errors-filter-severity')?.value || '';
    const category = document.getElementById('errors-filter-category')?.value || '';
    const query = (document.getElementById('errors-filter-search')?.value || '').trim().toLowerCase();

    const list = d.events.filter(ev =>
      (!severity || ev.severity === severity) &&
      (!category || ev.category === category) &&
      (!query || [ev.title, ev.diagnosis, ev.provider, ev.originalSnippet, ev.id].join(' ').toLowerCase().includes(query)));

    if (countEl) countEl.textContent = `${list.length} de ${d.events.length} tipo(s) de evento`;
    container.innerHTML = '';

    if (!d.events.length) {
      const p = document.createElement('div');
      p.className = 'c-card';
      p.innerHTML = '<p class="u-text-success"></p>';
      p.firstChild.textContent = '' + (d.message || 'Nenhum erro relevante encontrado.');
      container.appendChild(p);
      return;
    }
    if (!list.length) {
      const p = document.createElement('div');
      p.className = 'c-card u-text-center';
      p.innerHTML = '<p class="u-text-muted">Nenhum evento corresponde aos filtros.</p>';
      container.appendChild(p);
      return;
    }

    const badgeBySeverity = { 'Crítica': 'danger', 'Alta': 'danger', 'Média': 'warning', 'Baixa': 'success' };
    const categoryLabel = { bsod: 'Tela azul', shutdown: 'Desligamento', hardware: 'Hardware', disk: 'Disco', app: 'Aplicativo', service: 'Serviço', other: '• Outro' };

    list.forEach(ev => {
      const item = document.createElement('details');
      item.className = 'c-card u-mb-sm';
      item.style.padding = '12px 16px';

      const head = document.createElement('summary');
      head.style.cssText = 'cursor:pointer; display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
      const sev = document.createElement('span');
      sev.className = `c-badge c-badge--${badgeBySeverity[ev.severity] || 'warning'}`;
      sev.textContent = ev.severity;
      const cat = document.createElement('span');
      cat.className = 'c-badge c-badge--neutral';
      cat.textContent = categoryLabel[ev.category] || categoryLabel.other;
      const title = document.createElement('strong');
      title.textContent = ev.title + (ev.occurrences > 1 ? ` (×${ev.occurrences})` : '');
      const date = document.createElement('span');
      date.className = 'u-text-muted';
      date.style.fontSize = '0.85rem';
      date.textContent = '· último: ' + ev.date;
      head.append(sev, cat, title, date);

      const body = document.createElement('div');
      body.className = 'u-mt-sm';
      const diag = document.createElement('p');
      diag.textContent = ev.diagnosis;
      const rec = document.createElement('p');
      rec.className = 'u-mt-xs';
      rec.style.whiteSpace = 'pre-line';
      rec.textContent = '' + ev.recommendation;
      const raw = document.createElement('p');
      raw.className = 'u-text-muted u-mt-xs';
      raw.style.fontSize = '0.8rem';
      raw.textContent = `Evento ${ev.id} · ${ev.provider} — ${ev.originalSnippet}`;
      body.append(diag, rec, raw);

      item.append(head, body);
      container.appendChild(item);
    });
  },

  bindEvents() {
    const rpBtn = document.getElementById('btn-restore-point');
    if (rpBtn) {
      rpBtn.addEventListener('click', async () => {
        rpBtn.disabled = true;
        App.showToast('Criando ponto de restauração… pode levar até 1 minuto.', 'info');
        try {
          const res = await API.createRestorePoint();
          const d = res.data || {};
          App.showToast('' + d.message, d.ok ? 'success' : 'warning', 9000);
        } catch (err) {
          App.showToast('Erro ao criar ponto de restauração.', 'danger');
        } finally {
          rpBtn.disabled = false;
        }
      });
    }

    // Período muda a consulta ao Windows; os demais filtros só refiltram o que já foi lido
    document.getElementById('errors-filter-period')?.addEventListener('change', () => { if (this.errorsData) this.analyzeErrors(); });
    ['errors-filter-severity', 'errors-filter-category'].forEach(id => document.getElementById(id)?.addEventListener('change', () => this.renderErrors()));
    document.getElementById('errors-filter-search')?.addEventListener('input', () => this.renderErrors());

    const analyzeBtn = document.getElementById('btn-analyze-errors');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', () => this.analyzeErrors());
    }

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
        refreshBtn.innerHTML = '<span>Atualizando...</span> <span class="u-spin"><svg class=c-icon aria-hidden=true><use href=#i-loader-circle></use></svg></span>';
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
        refreshBtn.innerHTML = '<span>Atualizar Lista</span> <svg class=c-icon aria-hidden=true><use href=#i-refresh-cw></use></svg>';
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
          <div style="font-size: 3rem; margin-bottom: 12px;"><svg class=c-icon aria-hidden=true><use href=#i-clipboard-list></use></svg></div>
          <h3 class="c-card__title u-mb-sm">Nenhuma Atualização Registrada Ainda</h3>
          <p class="u-text-muted u-mb-lg" style="max-width: 540px; margin-left: auto; margin-right: auto;">
            Esta aba exibe exclusivamente o que foi alterado ou atualizado no seu Windows. Quando você atualizar drivers no scanner, instalar softwares ou aplicar modos do Boost Gamer, as alterações aparecerão aqui com a opção de reversão rápida.
          </p>
          <div class="o-flex o-flex--center o-flex--gap-md">
            <button class="c-btn c-btn--primary c-btn--sm" onclick="App.switchTab('scan')">
              <span>Scannear Drivers</span> <svg class=c-icon aria-hidden=true><use href=#i-search></use></svg>
            </button>
            <button class="c-btn c-btn--secondary c-btn--sm" onclick="App.switchTab('boost')">
              <span>Ir para Boost Gamer</span> <svg class=c-icon aria-hidden=true><use href=#i-zap></use></svg>
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
    } else if (this.activeFilter === 'windows') {
      list = list.filter(l => ['tweak', 'startup', 'priority'].includes(l.type));
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
      <div class="o-flex o-flex--column o-flex--gap-md" style="align-items: stretch;">
        ${list.map(item => {
          const isReverted = item.status === 'reverted';
          const cardClass = isReverted ? 'c-card--reverted' : 'c-card--highlight';
          
          let typeBadge = '';
          if (item.type === 'driver') {
            typeBadge = `<span class="c-badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(96, 165, 250, 0.3);"><svg class=c-icon aria-hidden=true><use href=#i-circle></use></svg> Driver</span>`;
          } else if (item.type === 'boost') {
            typeBadge = `<span class="c-badge" style="background: rgba(236, 72, 153, 0.15); color: #f472b6; border: 1px solid rgba(244, 114, 182, 0.3);"><svg class=c-icon aria-hidden=true><use href=#i-zap></use></svg> Boost Gamer</span>`;
          } else if (item.type === 'software') {
            typeBadge = `<span class="c-badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.3);"><svg class=c-icon aria-hidden=true><use href=#i-package></use></svg> Software</span>`;
          } else if (item.type === 'startup') {
            typeBadge = `<span class="c-badge c-badge--neutral"><svg class=c-icon aria-hidden=true><use href=#i-timer></use></svg> Inicialização</span>`;
          } else if (item.type === 'priority') {
            typeBadge = `<span class="c-badge c-badge--neutral"><svg class=c-icon aria-hidden=true><use href=#i-crosshair></use></svg> Prioridade</span>`;
          } else if (item.type === 'tweak') {
            typeBadge = `<span class="c-badge c-badge--neutral"><svg class=c-icon aria-hidden=true><use href=#i-gamepad-2></use></svg> Ajuste do Windows</span>`;
          } else {
            typeBadge = `<span class="c-badge c-badge--neutral"><svg class=c-icon aria-hidden=true><use href=#i-wrench></use></svg> Sistema</span>`;
          }

          const statusBadge = isReverted
            ? `<span class="c-badge c-badge--warning"><svg class=c-icon aria-hidden=true><use href=#i-undo-2></use></svg> Revertido</span>`
            : `<span class="c-badge c-badge--success"><svg class=c-icon aria-hidden=true><use href=#i-check></use></svg> Atualizado</span>`;

          const revertBtn = isReverted
            ? `<span class="c-badge c-badge--warning" style="font-size: 0.8rem; padding: 5px 12px;"><svg class=c-icon aria-hidden=true><use href=#i-undo-2></use></svg> Revertido em ${this.formatDate(item.revertedAt)}</span>`
            : `<button class="c-btn c-btn--outline c-btn--sm js-btn-revert" data-id="${item.id}" title="Desfazer ou restaurar estado anterior desta alteração">
                <span>Reverter</span> <svg class=c-icon aria-hidden=true><use href=#i-undo-2></use></svg>
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
                    <span><svg class=c-icon aria-hidden=true><use href=#i-arrow-right></use></svg></span>
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
