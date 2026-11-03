// frontend/scripts/modules/processes.js
/**
 * Prioridade de processos: um dropdown com todos os programas em execução.
 * O usuário escolhe um, escolhe a prioridade e aplica (agora ou de forma permanente).
 */
const ProcessesModule = {
  data: null,

  init() {
    document.getElementById('btn-proc-refresh')?.addEventListener('click', () => this.load());
    document.getElementById('btn-proc-apply')?.addEventListener('click', () => this.apply());
    document.getElementById('proc-select')?.addEventListener('change', () => this.onSelect());

    document.getElementById('proc-list')?.addEventListener('click', (e) => {
      const remove = e.target.closest('.js-proc-remove');
      if (remove) this.removePersistent(remove.dataset.exe, remove);
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
      if (status) status.textContent = this.data.available ? `${this.data.processes.length} programas em execução.` : this.data.message;
    } catch (err) {
      if (status) status.textContent = 'Erro ao listar processos.';
    }
    this.render();
  },

  find(name) {
    return this.data && this.data.processes.find(p => p.name === name);
  },

  render() {
    const select = document.getElementById('proc-select');
    const prio = document.getElementById('proc-priority');
    if (!select || !prio || !this.data || !this.data.available) return;

    const previous = select.value;
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Escolha um programa em execução —';
    select.appendChild(placeholder);

    const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
    const groups = [
      ['🪟 Programas com janela', this.data.processes.filter(p => p.hasWindow).sort(byName)],
      ['⚙️ Segundo plano', this.data.processes.filter(p => !p.hasWindow).sort(byName)]
    ];
    for (const [label, items] of groups) {
      if (!items.length) continue;
      const group = document.createElement('optgroup');
      group.label = label;
      for (const p of items) {
        const o = document.createElement('option');
        o.value = p.name;
        const title = p.title ? ` — ${p.title.slice(0, 40)}` : '';
        o.textContent = `${p.exe}${title} (${p.memoryMb} MB, ${p.priorityLabel})${p.persistentPriority ? ' 📌' : ''}`;
        group.appendChild(o);
      }
      select.appendChild(group);
    }
    if (previous && this.find(previous)) select.value = previous;

    if (!prio.options.length) {
      this.data.priorities.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        prio.appendChild(o);
      });
      prio.value = 'High';
    }

    this.onSelect();
    this.renderPersistent();
  },

  onSelect() {
    const select = document.getElementById('proc-select');
    const btn = document.getElementById('btn-proc-apply');
    const status = document.getElementById('proc-status');
    const p = select && this.find(select.value);
    if (btn) btn.disabled = !p;
    if (p && status) {
      status.textContent = `${p.exe}: prioridade atual ${p.priorityLabel}` +
        (p.instances > 1 ? ` • ${p.instances} processos (todos serão alterados)` : '') +
        (p.persistentPriority ? ' • 📌 com prioridade fixa' : '');
    }
  },

  // Lista abaixo do dropdown só com os programas que têm prioridade fixa
  renderPersistent() {
    const list = document.getElementById('proc-list');
    if (!list) return;
    list.innerHTML = '';
    const fixed = this.data.processes.filter(p => p.persistentPriority);
    if (!fixed.length) return;

    const title = document.createElement('p');
    title.className = 'u-font-bold u-mt-md';
    title.textContent = '📌 Programas com prioridade fixa (em execução agora)';
    list.appendChild(title);

    for (const p of fixed) {
      const row = document.createElement('div');
      row.className = 'o-flex o-flex--between';
      row.style.cssText = 'gap:12px; padding:6px 0; border-bottom:1px solid var(--color-border-subtle, rgba(255,255,255,0.08)); align-items:center;';
      const label = document.createElement('span');
      const prioLabel = this.data.priorities.find(x => x.value === p.persistentPriority)?.label || p.persistentPriority;
      label.textContent = `${p.exe} → sempre ${prioLabel}`;
      const remove = document.createElement('button');
      remove.className = 'c-btn c-btn--outline c-btn--sm js-proc-remove';
      remove.dataset.exe = p.exe;
      remove.textContent = 'Remover fixo';
      row.append(label, remove);
      list.appendChild(row);
    }
  },

  async apply() {
    const name = document.getElementById('proc-select')?.value;
    const priority = document.getElementById('proc-priority')?.value;
    const persistent = document.getElementById('proc-persist')?.checked;
    const btn = document.getElementById('btn-proc-apply');
    if (!name) return;
    btn.disabled = true;
    try {
      const res = await API.setProcessPriority(name, priority, persistent);
      const d = res.data || {};
      App.showToast(d.message || 'Concluído.', d.success ? 'success' : (d.needsAdmin ? 'warning' : 'danger'), 7000);
      if (d.success) await this.load();
    } catch (err) {
      App.showToast('Erro ao alterar a prioridade.', 'danger');
    } finally {
      btn.disabled = !document.getElementById('proc-select')?.value;
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
