// frontend/scripts/modules/winget.js
/**
 * Instalação em lote via winget (estende o catálogo de softwares).
 * O usuário marca os programas, clica em "Instalar selecionados" e acompanha a fila.
 */
const WingetModule = {
  status: null,
  selected: new Set(),
  pollTimer: null,

  async init() {
    document.getElementById('btn-winget-install')?.addEventListener('click', () => this.install());
    document.getElementById('btn-winget-kit')?.addEventListener('click', () => this.selectEssentialKit());
    document.getElementById('btn-winget-clear')?.addEventListener('click', () => { this.selected.clear(); this.refreshUi(); });
    document.getElementById('btn-winget-cancel')?.addEventListener('click', () => this.cancel());

    // Delegação: checkboxes são recriados a cada filtro do catálogo
    document.getElementById('soft-results-container')?.addEventListener('change', (e) => {
      const cb = e.target.closest('.js-winget-check');
      if (!cb) return;
      if (cb.checked) this.selected.add(cb.dataset.id); else this.selected.delete(cb.dataset.id);
      this.refreshUi();
    });

    await this.loadStatus();
    // Retoma o acompanhamento se uma fila já estava rodando
    const job = await API.getWingetJob().catch(() => null);
    if (job && job.data && job.data.running) this.startPolling();
  },

  async loadStatus() {
    const text = document.getElementById('winget-status-text');
    if (text) text.textContent = 'Verificando o winget e os programas já instalados…';
    try {
      const res = await API.getWingetStatus();
      this.status = res.data;
    } catch (err) {
      this.status = { available: false, message: 'Não foi possível consultar o winget.' };
    }
    this.refreshUi();
    if (typeof SoftsModule !== 'undefined') SoftsModule.filterAndRender();
  },

  isSupported(id) {
    return Boolean(this.status && this.status.available && this.status.supported.includes(id));
  },

  isInstalled(id) {
    return Boolean(this.status && this.status.installed && this.status.installed.includes(id));
  },

  // HTML da caixa de seleção usada em cada item do catálogo
  renderItemControl(id) {
    if (this.isInstalled(id)) return '<span class="c-badge c-badge--success"><svg class=c-icon aria-hidden=true><use href=#i-check></use></svg> Instalado</span>';
    if (!this.isSupported(id)) return '';
    return `<label class="c-badge c-badge--neutral" style="cursor:pointer; gap:6px; display:inline-flex; align-items:center;">
      <input type="checkbox" class="js-winget-check" data-id="${id}" ${this.selected.has(id) ? 'checked' : ''}> Instalar
    </label>`;
  },

  selectEssentialKit() {
    const all = (typeof SoftsModule !== 'undefined') ? SoftsModule.allSoftwares : [];
    all.filter(s => s.mustHave && this.isSupported(s.id) && !this.isInstalled(s.id)).forEach(s => this.selected.add(s.id));
    this.refreshUi();
    // Mostra a lista completa para o usuário ver o que foi marcado
    if (typeof SoftsModule !== 'undefined') {
      SoftsModule.currentCategory = 'all';
      const sel = document.getElementById('soft-category-select');
      if (sel) sel.value = 'all';
      SoftsModule.filterAndRender();
    }
    App.showToast(`${this.selected.size} programa(s) essencial(is) selecionado(s).`, 'info');
  },

  refreshUi() {
    const text = document.getElementById('winget-status-text');
    const installBtn = document.getElementById('btn-winget-install');
    const count = document.getElementById('winget-selected-count');
    const panel = document.getElementById('winget-panel-actions');

    if (!this.status || !this.status.available) {
      if (text) text.textContent = (this.status && this.status.message) || 'winget indisponível.';
      panel?.classList.add('u-hidden');
      return;
    }
    panel?.classList.remove('u-hidden');
    if (text) text.textContent = `winget ${this.status.version} • ${this.status.installed.length} programa(s) do catálogo já instalado(s). Marque os que quiser e instale todos de uma vez.`;
    if (count) count.textContent = this.selected.size;
    if (installBtn) installBtn.disabled = this.selected.size === 0;

    document.querySelectorAll('.js-winget-check').forEach(cb => { cb.checked = this.selected.has(cb.dataset.id); });
  },

  async install() {
    if (this.selected.size === 0) return;
    try {
      const res = await API.installWinget([...this.selected]);
      const d = res.data || {};
      if (!d.success) {
        App.showToast(d.message || 'Não foi possível iniciar a instalação.', 'warning');
        return;
      }
      this.selected.clear();
      this.refreshUi();
      App.showToast('Instalação iniciada. Você pode continuar usando o app.', 'info');
      this.renderJob(d.job);
      this.startPolling();
    } catch (err) {
      App.showToast('Erro ao iniciar a instalação.', 'danger');
    }
  },

  async cancel() {
    const res = await API.cancelWinget().catch(() => null);
    if (res && res.data) App.showToast(res.data.message, 'info');
  },

  startPolling() {
    clearInterval(this.pollTimer);
    const tick = async () => {
      const res = await API.getWingetJob().catch(() => null);
      const job = res && res.data;
      if (!job) return;
      this.renderJob(job);
      if (!job.running) {
        clearInterval(this.pollTimer);
        App.showToast(`Instalação concluída: ${job.done} instalado(s), ${job.skipped} já existente(s), ${job.failed} com falha.`, job.failed ? 'warning' : 'success', 8000);
        this.loadStatus();
      }
    };
    tick();
    this.pollTimer = setInterval(tick, 2500);
  },

  renderJob(job) {
    const box = document.getElementById('winget-job-container');
    const cancelBtn = document.getElementById('btn-winget-cancel');
    if (!box || !job) return;
    cancelBtn?.classList.toggle('u-hidden', !job.running);

    const icons = { queued: '', installing: '', done: '', skipped: '', failed: '', cancelled: '' };
    const finished = job.done + job.skipped + job.failed;
    box.innerHTML = '';

    const head = document.createElement('p');
    head.className = 'u-font-bold u-mt-md';
    head.textContent = job.running ? `Instalando… ${finished}/${job.total}` : `Fila finalizada: ${finished}/${job.total}`;
    box.appendChild(head);

    const list = document.createElement('div');
    list.className = 'u-mt-sm';
    job.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'o-flex o-flex--between';
      row.style.cssText = 'padding:6px 0; border-bottom:1px solid var(--color-border-subtle, rgba(255,255,255,0.08)); gap:12px;';
      const left = document.createElement('span');
      left.textContent = `${icons[item.state] || '•'} ${item.name}`;
      left.title = item.packageId;
      const right = document.createElement('span');
      right.className = item.state === 'failed' ? 'u-text-danger' : 'u-text-muted';
      right.textContent = item.text + (item.seconds ? ` (${item.seconds}s)` : '');
      if (item.log) right.title = item.log;
      row.append(left, right);
      list.appendChild(row);
    });
    box.appendChild(list);
  }
};
