// frontend/scripts/modules/boost.js
/**
 * Módulo Boost Gamer (Modo Otimizador & Limpeza Real de Standby List estilo RAMMap)
 */
const BoostModule = {
  data: null,

  async init() {
    this.bindEvents();
    await this.loadStatus();
  },

  bindEvents() {
    const mainBoostBtn = document.getElementById('btn-main-boost');
    if (mainBoostBtn) {
      mainBoostBtn.addEventListener('click', () => {
        this.runFullBoost();
      });
    }
  },

  async loadStatus() {
    try {
      const res = await API.getBoostStatus();
      if (res.success) {
        this.data = res.data;
        this.render();
      }
    } catch (err) {
      console.error('Erro ao carregar dados do Boost:', err);
    }
  },

  render() {
    if (!this.data) return;

    const { memory, optimizations } = this.data;

    // Status de Memória RAM
    const ramPercentEl = document.getElementById('boost-ram-percent');
    const ramDetailsEl = document.getElementById('boost-ram-details');
    const ramBarEl = document.getElementById('boost-ram-bar');

    if (ramPercentEl) ramPercentEl.textContent = `${memory.usedPercent}%`;
    if (ramDetailsEl) ramDetailsEl.textContent = `${memory.usedGb} GB em uso de ${memory.totalGb} GB totais (${memory.freeGb} GB livres)`;
    if (ramBarEl) {
      ramBarEl.style.width = `${memory.usedPercent}%`;
      // Cor dinâmica: se acima de 80%, aviso
      if (memory.usedPercent >= 80) {
        ramBarEl.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
      } else {
        ramBarEl.style.background = 'linear-gradient(90deg, var(--color-primary), var(--color-accent))';
      }
    }

    // Renderizar Otimizações
    const grid = document.getElementById('boost-optimizations-grid');
    if (!grid) return;

    grid.innerHTML = optimizations.map(opt => {
      let badgeHtml = `<span class="c-badge c-badge--info">Otimização</span>`;
      let cardHighlightClass = '';
      let btnHtml = '';

      if (opt.id === 'purge_standby') {
        badgeHtml = `<span class="c-badge c-badge--danger"><svg class=c-icon aria-hidden=true><use href=#i-zap></use></svg> RAMMap / ISLC</span>`;
        cardHighlightClass = 'c-card--highlight';
        btnHtml = `
          <button class="c-btn c-btn--primary c-btn--sm js-btn-opt" data-id="${opt.id}">
            <span>${opt.btnLabel || 'Zerar Standby List Agora'}</span> <svg class=c-icon aria-hidden=true><use href=#i-zap></use></svg>
          </button>
        `;
      } else if (opt.gpuType === 'nvidia') {
        badgeHtml = `<span class="c-badge" style="background: rgba(118, 185, 0, 0.15); color: #84cc16; border: 1px solid rgba(132, 204, 22, 0.4);"><svg class=c-icon aria-hidden=true><use href=#i-circle></use></svg> GPU NVIDIA</span>`;
        if (opt.active) {
          cardHighlightClass = 'c-card--highlight';
          btnHtml = `
            <div class="o-flex o-flex--between o-flex--gap-sm" style="flex-wrap: wrap;">
              <div class="o-flex o-flex--gap-sm">
                <button class="c-btn c-btn--outline c-btn--sm js-btn-opt" data-id="nvidia_default" title="Remove do registro os valores gravados por versões antigas do CWU (o driver NVIDIA não os utiliza)">
                  <span>Remover ajuste antigo</span> <svg class=c-icon aria-hidden=true><use href=#i-undo-2></use></svg>
                </button>
                <button class="c-btn c-btn--primary c-btn--sm js-btn-opt" data-id="nvidia_ultra" title="Reabrir Painel NVIDIA para verificar ou aplicar configurações">
                  <span>Reabrir Painel</span> <svg class=c-icon aria-hidden=true><use href=#i-zap></use></svg>
                </button>
              </div>
              <button class="c-btn c-btn--secondary c-btn--sm js-btn-manual" data-target="nvidia" title="Abre o Painel de Controle NVIDIA diretamente na sua tela">
                <span>Abrir Painel NVIDIA</span> <svg class=c-icon aria-hidden=true><use href=#i-arrow-up-right></use></svg>
              </button>
            </div>
          `;
        } else {
          btnHtml = `
            <div class="o-flex o-flex--between o-flex--gap-sm" style="flex-wrap: wrap;">
              <button class="c-btn c-btn--primary c-btn--sm js-btn-opt" data-id="nvidia_ultra" title="Ativa o modo no CWU e abre o Painel de Controle NVIDIA">
                <span>Configurar no Painel NVIDIA</span> <svg class=c-icon aria-hidden=true><use href=#i-zap></use></svg>
              </button>
              <button class="c-btn c-btn--secondary c-btn--sm js-btn-manual" data-target="nvidia" title="Abre o Painel de Controle NVIDIA diretamente na sua tela">
                <span>Abrir Painel NVIDIA</span> <svg class=c-icon aria-hidden=true><use href=#i-arrow-up-right></use></svg>
              </button>
            </div>
          `;
        }
      } else if (opt.gpuType === 'amd') {
        badgeHtml = `<span class="c-badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.4);"><svg class=c-icon aria-hidden=true><use href=#i-circle></use></svg> GPU AMD</span>`;
        if (opt.active) {
          btnHtml = `
            <div class="o-flex o-flex--between o-flex--gap-sm" style="flex-wrap: wrap;">
              <div class="o-flex o-flex--gap-sm">
                <button class="c-btn c-btn--outline c-btn--sm js-btn-opt" data-id="amd_default" title="Clique para desativar Anti-Lag">
                  <span>Remover ajuste antigo</span> <svg class=c-icon aria-hidden=true><use href=#i-undo-2></use></svg>
                </button>
                <button class="c-btn c-btn--secondary c-btn--sm js-btn-opt" data-id="amd_antilag">
                  <span>Reabrir AMD</span> <svg class=c-icon aria-hidden=true><use href=#i-zap></use></svg>
                </button>
              </div>
              <button class="c-btn c-btn--secondary c-btn--sm js-btn-manual" data-target="amd" title="Abre o AMD Software Adrenalin diretamente na aba de Gráficos / Jogos">
                <span>Abrir AMD Software</span> <svg class=c-icon aria-hidden=true><use href=#i-arrow-up-right></use></svg>
              </button>
            </div>
          `;
        } else {
          btnHtml = `
            <div class="o-flex o-flex--between o-flex--gap-sm" style="flex-wrap: wrap;">
              <button class="c-btn c-btn--secondary c-btn--sm js-btn-opt" data-id="amd_antilag">
                <span>Configurar no AMD Software</span> <svg class=c-icon aria-hidden=true><use href=#i-zap></use></svg>
              </button>
              <button class="c-btn c-btn--secondary c-btn--sm js-btn-manual" data-target="amd" title="Abre o AMD Software Adrenalin diretamente na aba de Gráficos / Jogos">
                <span>Abrir AMD Software</span> <svg class=c-icon aria-hidden=true><use href=#i-arrow-up-right></use></svg>
              </button>
            </div>
          `;
        }
      } else {
        if (opt.manualAction) {
          btnHtml = `
            <div class="o-flex o-flex--between o-flex--gap-sm" style="flex-wrap: wrap;">
              <button class="c-btn c-btn--secondary c-btn--sm js-btn-opt" data-id="${opt.id}">
                <span>${opt.btnLabel || 'Executar'}</span> <svg class=c-icon aria-hidden=true><use href=#i-zap></use></svg>
              </button>
              <button class="c-btn c-btn--secondary c-btn--sm js-btn-manual" data-action="${opt.manualAction}" title="${opt.manualTooltip || 'Abrir configuração no Windows'}">
                <span>${opt.manualLabel || 'Mudar Manualmente'}</span> <svg class=c-icon aria-hidden=true><use href=#i-arrow-up-right></use></svg>
              </button>
            </div>
          `;
        } else {
          btnHtml = `
            <button class="c-btn c-btn--secondary c-btn--sm js-btn-opt" data-id="${opt.id}">
              <span>${opt.btnLabel || 'Executar'}</span> <svg class=c-icon aria-hidden=true><use href=#i-zap></use></svg>
            </button>
          `;
        }
      }

      return `
        <div class="c-card ${cardHighlightClass}">
          <div class="c-card__header">
            <div>
              <div class="o-flex o-flex--gap-sm u-mb-sm">
                ${badgeHtml}
                <span class="c-badge c-badge--neutral">${opt.potentialGain}</span>
                ${opt.active ? '<span class="c-badge c-badge--success"><svg class=c-icon aria-hidden=true><use href=#i-check></use></svg> Ativado</span>' : ''}
              </div>
              <h4 class="c-card__title">${opt.title}</h4>
            </div>
          </div>
          <div class="c-card__body">
            <p class="u-mb-md">${opt.description}</p>
            ${btnHtml}
          </div>
        </div>
      `;
    }).join('');

    // Listener para botões individuais de otimização
    grid.querySelectorAll('.js-btn-opt').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span>Aplicando...</span> <span class="u-spin"><svg class=c-icon aria-hidden=true><use href=#i-loader-circle></use></svg></span>';

        try {
          const res = await API.runBoost(id);
          const ok = res.success && res.data && res.data.success !== false;
          const rp = res.data && res.data.restorePoint;
          if (rp && !rp.reused) App.showToast('' + rp.message, rp.ok ? 'info' : 'warning', 8000);
          App.showToast((res.data && res.data.message) || (ok ? 'Otimização executada.' : 'A otimização falhou.'), ok ? 'success' : (res.data && res.data.needsAdmin ? 'warning' : 'danger'), res.data && res.data.needsAdmin ? 9000 : null);
          // Atualiza status real na interface
          await this.loadStatus();
        } catch (err) {
          App.showToast('Erro ao executar otimização', 'danger');
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      });
    });

    // Listener para o botão de mudar manualmente no Windows ou software oficial
    grid.querySelectorAll('.js-btn-manual').forEach(btn => {
      btn.addEventListener('click', async () => {
        const actionId = btn.dataset.action || (btn.dataset.target === 'nvidia' ? 'open_nvidia_settings' : 'open_amd_settings');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span>Abrindo...</span> <span class="u-spin"><svg class=c-icon aria-hidden=true><use href=#i-loader-circle></use></svg></span>';

        try {
          const res = await API.runBoost(actionId);
          if (res.success) {
            App.showToast(res.data.message || 'Configuração aberta na tela!', 'info');
          } else {
            App.showToast(res.data?.message || 'Não foi possível abrir o recurso.', 'warning');
          }
        } catch (err) {
          App.showToast('Não foi possível abrir o recurso solicitado.', 'danger');
        } finally {
          btn.disabled = false;
          btn.innerHTML = originalText;
        }
      });
    });
  },

  async runFullBoost() {
    const btn = document.getElementById('btn-main-boost');
    if (!btn) return;

    btn.disabled = true;
    btn.innerHTML = '<span>Limpando Standby & Otimizando Windows...</span> <span class="u-spin"><svg class=c-icon aria-hidden=true><use href=#i-settings></use></svg></span>';

    try {
      const res = await API.runBoost('purge_standby');
      btn.disabled = false;
      btn.className = 'c-btn c-btn--accent c-btn--lg';
      btn.innerHTML = '<span><svg class=c-icon aria-hidden=true><use href=#i-rocket></use></svg> Boost Gamer & Standby Limpos</span>';

      await this.loadStatus();
      const ok = res.data && res.data.success !== false;
      if (!ok) btn.innerHTML = '<span>Ativar Boost Gamer</span> <svg class=c-icon aria-hidden=true><use href=#i-zap></use></svg>';
      App.showToast((res.data && res.data.message) || 'Otimização concluída.', ok ? 'success' : 'warning', ok ? null : 9000);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = '<span>Ativar Boost Gamer</span> <svg class=c-icon aria-hidden=true><use href=#i-zap></use></svg>';
      App.showToast('Erro ao aplicar Boost', 'danger');
    }
  }
};
