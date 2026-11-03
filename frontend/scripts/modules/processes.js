// frontend/scripts/modules/processes.js
/**
 * Prioridade de processos: lista os programas abertos e permite definir a
 * prioridade de CPU agora e, opcionalmente, de forma permanente.
 */
const ProcessesModule = {
  data: null,
  query: '',
  onlyWindows: true,

  init() {
    document.getElementById('btn-proc-refresh')?.addEventListener('click', () => this.load());
    document.getElementById('proc-search')?.addEventListener('input', (e) => { this.query = e.target.value.trim().toLowerCase(); this.render(); });
    document.getElementById('proc-only-windows')?.addEventListener('change', (e) => { this.onlyWindows = e.target.checked; this.render(); });

    const list = document.getElementById('proc-list');
    list?.addEventListener('click', (e) => {
      const apply = e.target.closest('.js-proc-apply');
      if (apply) return this.apply(apply.closest('[data-name]'), apply);
      const remove = e.target.closest('.js-proc-remove');
      if (remove) return this.removePersistent(remove.dataset.exe, remove);
    });

    // Carrega quando a aba Boost é aberta pela primeira vez (listar processos custa ~1 s)
    document.querySelectorAll('[data-tab="boost"]').forEach(el => el.addEventListener('click', () => { if (!this.data) this.load(); }, { once: true }));
    if (location.hash === '#boost') this.load();
  },

  async load() {
    const status = document.getElementById('proc-status');
    if (status) status.textContent = 'Listando programas em execução…';
    try {
      const res = await API.getProcesses();
      this.data = res.data;
      if (status) status.textContent = this.data.available ? '' : this.data.message;
    } catch (err) {
      if (status) status.textContent = 'Erro ao listar processos.';
    }
    this.render();
  },

  render() {
    const list = document.getElementById('proc-list');
    if (!list || !this.data || !this.data.available) return;

    const items = this.data.processes.filter(p =>
      (!this.onlyWindows || p.hasWindow || p.persistentPriority) &&
      (!this.query || p.name.toLowerCase().includes(this.query) || p.title.toLowerCase().includes(this.query)));

    list.innerHTML = '';
    if (items.length === 0) {
      list.innerHTML = '<p class="u-text-muted u-mt-sm">Nenhum programa encontrado. Desmarque "Só programas com janela" para ver os processos em segundo plano.</p>';
      return;
    }

    for (const p of items.slice(0, 80)) {
      const row = document.createElement('div');
      row.dataset.name = p.name;
      row.className = 'o-flex o-flex--between';
      row.style.cssText = 'gap:12px; padding:8px 0; border-bottom:1px solid var(--color-border-subtle, rgba(255,255,255,0.08)); flex-wrap:wrap; align-items:center;';

      const info = document.createElement('div');
      info.style.minWidth = '220px';
      info.style.flex = '1';
      const name = document.createElement('strong');
      name.textContent = p.exe + (p.instances > 1 ? ` (${p.instances})` : '');
      const sub = document.createElement('div');
      sub.className = 'u-text-muted';
      sub.style.fontSize = '0.8rem';
      sub.textContent = `${p.title ? p.title.slice(0, 60) + ' • ' : ''}${p.memoryMb} MB • Atual: ${p.priorityLabel}`;
      info.append(name, sub);
      if (p.persistentPriority) {
        const badge = document.createElement('span');
        badge.className = 'c-badge c-badge--info';
        badge.style.marginLeft = '8px';
        badge.textContent = '📌 Sempre ' + (this.data.priorities.find(x => x.value === p.persistentPriority)?.label || p.persistentPriority);
        name.after(badge);
      }

      const controls = document.createElement('div');
      controls.className = 'o-flex o-flex--gap-sm';
      controls.style.alignItems = 'center';

      const select = document.createElement('select');
      select.className = 'c-select js-proc-priority';
      select.style.minWidth = '150px';
      this.data.priorities.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === (p.priority || 'High')) o.selected = true;
        select.appendChild(o);
      });
      if (!p.priority || p.priority === 'Normal') select.value = 'High';

      const persistLabel = document.createElement('label');
      persistLabel.style.cssText = 'font-size:0.8rem; display:inline-flex; gap:4px; align-items:center; cursor:pointer;';
      persistLabel.title = 'Aplica esta prioridade toda vez que o programa abrir (exige administrador)';
      const persist = document.createElement('input');
      persist.type = 'checkbox';
      persist.className = 'js-proc-persist';
      persistLabel.append(persist, document.createTextNode('Sempre'));

      const apply = document.createElement('button');
      apply.className = 'c-btn c-btn--primary c-btn--sm js-proc-apply';
      apply.textContent = 'Aplicar';

      controls.append(select, persistLabel, apply);

      if (p.persistentPriority) {
        const remove = document.createElement('button');
        remove.className = 'c-btn c-btn--outline c-btn--sm js-proc-remove';
        remove.dataset.exe = p.exe;
        remove.textContent = 'Remover fixo';
        controls.appendChild(remove);
      }

      row.append(info, controls);
      list.appendChild(row);
    }
  },

  async apply(row, btn) {
    if (!row) return;
    const priority = row.querySelector('.js-proc-priority').value;
    const persistent = row.querySelector('.js-proc-persist').checked;
    btn.disabled = true;
    try {
      const res = await API.setProcessPriority(row.dataset.name, priority, persistent);
      const d = res.data || {};
      App.showToast(d.message || 'Concluído.', d.success ? 'success' : (d.needsAdmin ? 'warning' : 'danger'), 7000);
      if (d.success) await this.load();
    } catch (err) {
      App.showToast('Erro ao alterar a prioridade.', 'danger');
    } finally {
      btn.disabled = false;
    }
  },

  async removePersistent(exe, btn) {
    btn.disabled = true;
    try {
      const res = await API.removeProcessPriority(exe);
      const d = res.data || {};
      App.showToast(d.message, d.success ? 'success' : 'warning', 7000);
      if (d.success) await this.load();
    } finally {
      btn.disabled = false;
    }
  }
};
