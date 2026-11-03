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
        ramBarEl.style.background = 'var(--color-warning)';
      } else {
        ramBarEl.style.background = 'var(--color-primary)';
      }
    }

    // Renderizar Otimizações
    const grid = document.getElementById('boost-optimizations-grid');
    if (!grid) return;

    const icon = (n) => `<svg class="c-icon" aria-hidden="true"><use href="#i-${n}"></use></svg>`;
    const esc = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const btn = (variant, attrs, label, ic, title) =>
      `<button class="c-btn c-btn--${variant} c-btn--sm ${attrs.cls}" ${attrs.data}${title ? ` title="${esc(title)}"` : ''}><span>${esc(label)}</span>${icon(ic)}</button>`;

    // Categoria de cada otimização (selo neutro com ícone, igual para todos os cartões)
    const CATEGORY = {
      purge_standby: ['memory-stick', 'Memória'], ram_clean: ['memory-stick', 'Memória'],
      nvidia_ultra: ['monitor', 'GPU NVIDIA'], amd_antilag: ['monitor', 'GPU AMD'],
      power_plan: ['zap', 'Energia'], telemetry_services: ['lock', 'Privacidade'], temp_cleanup: ['hard-drive', 'Disco']
    };

    // A descrição vinda do backend tem o texto principal e, depois do <br>, instruções
    // com estilos fixos. Separamos as duas partes e removemos os estilos.
    const splitDescription = (html) => {
      const box = document.createElement('div');
      box.innerHTML = html || '';
      box.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));
      const parts = box.innerHTML.split(/<br\s*\/?>/i);
      const main = parts.shift().trim();
      const extra = parts.join('<br>').replace(/^(\s|<br>)+/, '').trim();
      return { main, extra };
    };

    grid.innerHTML = optimizations.map(opt => {
      const [catIcon, catLabel] = CATEGORY[opt.id] || ['sliders-horizontal', 'Otimização'];
      const { main, extra } = splitDescription(opt.description);
      const isGpu = opt.gpuType === 'nvidia' || opt.gpuType === 'amd';
      const vendor = opt.gpuType === 'nvidia' ? 'NVIDIA' : 'AMD';

      // Ação principal sempre à esquerda (primária); ações de apoio à direita (secundárias)
      let primary = '';
      const secondary = [];
      if (isGpu) {
        primary = btn('primary', { cls: 'js-btn-opt', data: `data-id="${opt.id}"` }, `Configurar no ${opt.gpuType === 'nvidia' ? 'Painel NVIDIA' : 'AMD Software'}`, 'arrow-up-right', `Abre o painel oficial ${vendor} com o passo a passo`);
      } else {
        primary = btn('primary', { cls: 'js-btn-opt', data: `data-id="${opt.id}"` }, opt.btnLabel || 'Executar', 'zap');
        if (opt.manualAction) secondary.push(btn('secondary', { cls: 'js-btn-manual', data: `data-action="${opt.manualAction}"` }, opt.manualLabel || 'Mudar manualmente', 'arrow-up-right', opt.manualTooltip || 'Abrir a configuração no Windows'));
      }

      return `
        <article class="c-card ${opt.active ? 'c-card--highlight' : ''}">
          <div class="c-card__tags">
            <span class="c-badge c-badge--neutral">${icon(catIcon)} ${catLabel}</span>
            <span class="c-badge c-badge--info">${esc(opt.potentialGain)}</span>
            ${opt.active ? `<span class="c-badge c-badge--success">${icon('check')} Ativado</span>` : ''}
          </div>
          <h4 class="c-card__title">${esc(opt.title)}</h4>
          <p class="c-card__desc">${main}</p>
          ${extra ? `<div class="c-callout">${extra}</div>` : ''}
          <div class="c-card__footer">
            ${primary}
            ${secondary.length ? `<div class="c-card__footer-group">${secondary.join('')}</div>` : ''}
          </div>
        </article>
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
