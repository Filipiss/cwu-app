// frontend/scripts/modules/disks.js
/**
 * Performance › Discos: espaço nas unidades, limpeza de disco e vida útil (SMART).
 * Carrega só quando a sub-aba é aberta pela primeira vez (as leituras do SMART são lentas).
 */
const DisksModule = {
  loaded: false,
  cleanupItems: [],
  cleanupBusy: false,

  init() {
    document.getElementById('btn-cleanup-analyze')?.addEventListener('click', () => this.analyzeCleanup());
    document.getElementById('btn-volumes-refresh')?.addEventListener('click', () => this.loadVolumes());
    document.getElementById('btn-disk-health-refresh')?.addEventListener('click', () => this.loadDiskHealth());
  },

  load() {
    if (this.loaded) return;
    this.loaded = true;
    this.loadVolumes();
    this.loadDiskHealth();
  },

  esc(v) {
    return String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  },

  fmtBytes(b) {
    if (b === null || b === undefined) return '—';
    if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`;
    return `${Math.max(1, Math.round(b / 1024 ** 2)).toLocaleString('pt-BR')} MB`;
  },

  // ===== Espaço nas unidades =====
  async loadVolumes() {
    const box = document.getElementById('volume-list');
    if (!box) return;
    let d;
    try { d = (await API.request('/api/specs/volumes')).data || {}; } catch (e) { d = { volumes: [] }; }
    const esc = (v) => this.esc(v);
    if (!d.volumes || !d.volumes.length) {
      box.innerHTML = `<p class="c-card__desc">${d.supported === false ? 'Disponível apenas no Windows.' : 'Não foi possível ler as unidades.'}</p>`;
      return;
    }
    const badge = { good: ['success', 'Espaço ok'], warn: ['warning', 'Pouco espaço'], bad: ['danger', 'Quase cheia'] };
    const gb = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    box.innerHTML = d.volumes.map(v => {
      const [cls, label] = badge[v.status] || badge.good;
      const used = v.freePct === null ? 0 : Math.max(0, Math.min(100, 100 - v.freePct));
      // A limpeza só mexe em pastas da unidade do Windows: o atalho fica dentro do bloco dela
      const actions = v.system && v.status !== 'good' ? `<div class="c-disk__actions">
          <button class="c-btn c-btn--sm c-btn--primary js-volume-clean">Limpar agora</button>
          <button class="c-btn c-btn--sm c-btn--secondary js-volume-storage">Ver o que ocupa espaço</button>
        </div>` : '';
      return `<div class="c-disk">
        <div class="c-disk__head">
          <div><div class="c-disk__name">${esc(v.letter)}:${v.label ? ' ' + esc(v.label) : ''}</div><div class="c-card__desc">${v.system ? 'Unidade do Windows • ' : ''}${gb(v.sizeGb)} GB</div></div>
          <span class="c-badge c-badge--${cls}">${label}</span>
        </div>
        <div class="c-disk__life">
          <div class="c-disk__life-label"><span>Espaço livre</span><strong>${gb(v.freeGb)} GB (${v.freePct === null ? '—' : gb(v.freePct) + '%'})</strong></div>
          <div class="c-disk__bar"><span class="c-disk__bar-fill c-disk__bar-fill--${cls}" style="width:${used}%"></span></div>
        </div>
        ${v.notes.length ? `<ul class="c-disk__notes">${v.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        ${actions}
      </div>`;
    }).join('');

    box.querySelector('.js-volume-clean')?.addEventListener('click', (e) => this.quickClean(e.currentTarget));
    box.querySelector('.js-volume-storage')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const r = await API.runBoost('open_storage_settings');
        const msg = r && r.data && r.data.message;
        if (msg) App.showToast(msg, 'info', 8000);
      } catch (err) { /* o toast de erro já vem da API */ }
      finally { btn.disabled = false; }
    });
  },

  // "Limpar agora": mede e já pede a confirmação com os itens recomendados (os que vêm marcados)
  async quickClean(btn) {
    document.getElementById('cleanup-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (this.cleanupBusy) return App.showToast('A limpeza de disco já está medindo ou limpando. Aguarde terminar.', 'info');
    btn.disabled = true;
    btn.textContent = 'Medindo…';
    try {
      const ok = await this.analyzeCleanup();
      if (!ok) return;
      if (!this.selectedCleanup().length) return App.showToast('Nada recomendado para limpar agora. Veja os outros itens na Limpeza de disco.', 'info', 7000);
      btn.textContent = 'Limpando…';
      await this.runCleanup();
    } finally {
      if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Limpar agora'; }
    }
  },

  // ===== Vida útil dos discos =====
  async loadDiskHealth() {
    const box = document.getElementById('disk-health-list');
    if (!box) return;
    box.innerHTML = '<p class="c-card__desc">Lendo os discos…</p>';
    let d;
    try { d = (await API.request('/api/specs/disks')).data || {}; } catch (e) { d = { disks: [] }; }
    const esc = (v) => this.esc(v);
    if (!d.disks || !d.disks.length) {
      box.innerHTML = `<p class="c-card__desc">${d.supported === false ? 'Disponível apenas no Windows.' : 'Não foi possível ler os discos.'}</p>`;
      return;
    }
    const badge = { good: ['success', 'Saudável'], warn: ['warning', 'Atenção'], bad: ['danger', 'Crítico'] };
    const fmtHours = (h) => h === null ? '—' : (h >= 24 * 365 ? `${(h / 8760).toFixed(1).replace('.', ',')} anos` : `${Math.round(h).toLocaleString('pt-BR')} h`);
    const missing = d.disks.every(x => x.lifeRemaining === null && x.temperature === null && x.powerOnHours === null);
    box.innerHTML = d.disks.map(x => {
      const [cls, label] = badge[x.status] || badge.good;
      const life = x.lifeRemaining;
      return `<div class="c-disk">
        <div class="c-disk__head">
          <div><div class="c-disk__name">${esc(x.model)}</div><div class="c-card__desc">${esc(x.type)}${x.sizeGb ? ' • ' + x.sizeGb + ' GB' : ''} • Windows: ${esc(x.health)}</div></div>
          <span class="c-badge c-badge--${cls}">${label}</span>
        </div>
        <div class="c-disk__life">
          <div class="c-disk__life-label"><span>Vida útil restante</span><strong>${life === null ? (x.type === 'HD' ? 'HDs não informam' : 'Não informado') : life + '%'}</strong></div>
          <div class="c-disk__bar"><span class="c-disk__bar-fill c-disk__bar-fill--${cls}" style="width:${life ?? 0}%"></span></div>
        </div>
        <div class="c-disk__stats">
          <div><span>Temperatura</span><strong>${x.temperature === null ? '—' : x.temperature + ' °C'}</strong></div>
          <div><span>Tempo ligado</span><strong>${fmtHours(x.powerOnHours)}</strong></div>
          <div><span>Erros sem correção</span><strong>${x.errors}</strong></div>
        </div>
        ${x.notes.length ? `<ul class="c-disk__notes">${x.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      </div>`;
    }).join('') + (missing && !d.isAdmin ? '<p class="c-card__desc">O Windows só libera desgaste, temperatura e horas ligado para administrador. Use "Reiniciar como administrador" para ver tudo.</p>' : '');
  },

  // ===== Limpeza de disco =====
  async analyzeCleanup() {
    const box = document.getElementById('cleanup-list');
    const btn = document.getElementById('btn-cleanup-analyze');
    if (!box || this.cleanupBusy) return false;
    this.cleanupBusy = true;
    if (btn) btn.disabled = true;
    box.innerHTML = '<p class="c-card__desc">Medindo as pastas… pode levar até um minuto com caches grandes.</p>';
    try {
      const d = (await API.request('/api/cleanup/analyze')).data || {};
      if (!d.available) {
        box.innerHTML = '<p class="c-card__desc">Não foi possível medir as pastas.</p>';
        App.showToast('Não foi possível medir as pastas da limpeza de disco.', 'danger');
        return false;
      }
      this.cleanupItems = d.items;
      this.renderCleanup(d);
      return true;
    } catch (e) {
      box.innerHTML = '<p class="c-card__desc">Não foi possível medir as pastas.</p>';
      App.showToast('Não foi possível medir as pastas da limpeza de disco.', 'danger');
      return false;
    } finally {
      this.cleanupBusy = false;
      if (btn) btn.disabled = false;
    }
  },

  renderCleanup(d) {
    const box = document.getElementById('cleanup-list');
    const esc = (v) => this.esc(v);
    if (!d.items.length) { box.innerHTML = '<p class="c-card__desc">Nada relevante para limpar agora.</p>'; return; }
    const tag = (i) => [
      i.irreversible ? '<span class="c-badge c-badge--warning">Não dá para recuperar</span>' : '',
      i.blocked ? '<span class="c-badge c-badge--neutral">Exige administrador</span>' : ''
    ].join(' ');
    box.innerHTML = d.items.map(i => `
      <label class="c-check-row c-clean-row${i.blocked ? ' c-clean-row--blocked' : ''}">
        <input type="checkbox" class="js-clean-item" value="${esc(i.id)}"${i.checked ? ' checked' : ''}${i.blocked ? ' disabled' : ''}>
        <span class="c-check-row__text"><span><strong>${esc(i.title)}</strong> ${tag(i)}</span><span class="c-field__hint">${esc(i.description)}</span></span>
        <strong class="c-clean-row__size">${this.fmtBytes(i.bytes)}</strong>
      </label>`).join('') + `
      <div class="c-clean-footer">
        <span class="c-card__desc">Selecionado: <strong id="cleanup-selected">—</strong></span>
        <button class="c-btn c-btn--primary c-btn--sm" id="btn-cleanup-run">Limpar selecionados</button>
      </div>
      ${d.isAdmin ? '' : '<p class="c-field__hint">Pastas do sistema só podem ser medidas e limpas como administrador. Use "Reiniciar como administrador" para incluir esses itens.</p>'}`;
    const update = () => {
      const ids = this.selectedCleanup();
      const total = this.cleanupItems.filter(i => ids.includes(i.id)).reduce((s, i) => s + (i.bytes || 0), 0);
      document.getElementById('cleanup-selected').textContent = this.fmtBytes(total);
      document.getElementById('btn-cleanup-run').disabled = !ids.length;
    };
    box.querySelectorAll('.js-clean-item').forEach(cb => cb.addEventListener('change', update));
    document.getElementById('btn-cleanup-run').addEventListener('click', () => this.runCleanup());
    update();
  },

  selectedCleanup() {
    return [...document.querySelectorAll('#cleanup-list .js-clean-item:checked')].map(cb => cb.value);
  },

  async runCleanup() {
    const ids = this.selectedCleanup();
    if (!ids.length || this.cleanupBusy) return;
    const chosen = this.cleanupItems.filter(i => ids.includes(i.id));
    const risky = chosen.filter(i => i.irreversible || i.id === 'hibernation').map(i => i.title);
    const ok = await Confirm.ask({
      title: `Apagar ${this.fmtBytes(chosen.reduce((s, i) => s + (i.bytes || 0), 0))}?`,
      message: `${chosen.length} item(ns) selecionado(s). Arquivos em uso por programas abertos são mantidos: feche os jogos antes para limpar os caches de shaders por completo.${risky.length ? ` Atenção: ${risky.join(', ')} não pode ser desfeito.` : ''}`,
      confirmLabel: 'Limpar',
      danger: risky.length > 0
    });
    if (!ok) return;
    const btn = document.getElementById('btn-cleanup-run');
    this.cleanupBusy = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Limpando…'; }
    try {
      const r = (await API.request('/api/cleanup/run', { method: 'POST', body: JSON.stringify({ ids }) })).data || {};
      App.showToast(r.message || 'Limpeza concluída.', r.success ? 'success' : (r.needsAdmin ? 'warning' : 'danger'), 9000);
    } catch (e) {
      App.showToast('Erro ao limpar.', 'danger');
    } finally {
      this.cleanupBusy = false;
    }
    this.loadVolumes();
    this.analyzeCleanup();
  }
};
