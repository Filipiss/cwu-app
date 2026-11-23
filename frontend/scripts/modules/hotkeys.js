// frontend/scripts/modules/hotkeys.js
/**
 * Configurações › Preferências: atalhos personalizáveis e comandos de voz.
 * "Alterar" grava a próxima combinação de teclas (Esc cancela). O app só aceita se o Windows
 * deixar registrar (não pode estar em uso por outro programa).
 */
const HotkeysModule = {
  capturing: null,   // id do atalho sendo gravado
  voiceTimer: null,

  init() {
    document.getElementById('hotkeys-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-hotkey]');
      if (!btn) return;
      if (btn.dataset.op === 'change') this.startCapture(btn.dataset.hotkey, btn);
      else if (btn.dataset.op === 'reset') this.reset(btn.dataset.hotkey);
    });
    document.getElementById('btn-voice-toggle')?.addEventListener('click', () => this.toggleVoice());
    document.addEventListener('keydown', (e) => this.onKey(e), true);
    this.load();
    this.loadVoice();
    this.watchVoiceUi();
    // Atualiza o estado da voz enquanto a aba de configurações está aberta
    this.voiceTimer = setInterval(() => {
      const card = document.getElementById('voice-card');
      if (card && card.offsetParent && !document.hidden) this.loadVoice();
    }, 1500);
  },

  esc(v) { return String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },
  kbd(acc) { return String(acc).split('+').map(k => `<kbd class="c-kbd">${this.esc(k === 'Super' ? 'Win' : k)}</kbd>`).join('<span class="c-kbd__plus">+</span>'); },

  async load() {
    const box = document.getElementById('hotkeys-list');
    if (!box) return;
    let d;
    try { d = (await API.request('/api/hotkeys')).data || {}; } catch (e) { d = {}; }
    if (!d.hotkeys) { box.innerHTML = '<p class="c-field__hint">Não foi possível ler os atalhos.</p>'; return; }
    box.innerHTML = d.hotkeys.map(h => `
      <div class="c-hotkey-row">
        <div class="c-hotkey-row__text">
          <span>${this.esc(h.label)}</span>
          ${h.registered ? '' : '<span class="c-field__hint c-hotkey-row__warn">Em uso por outro programa: escolha outro atalho.</span>'}
        </div>
        <div class="c-hotkey-row__keys" id="hotkey-keys-${this.esc(h.id)}">${this.kbd(h.accelerator)}</div>
        <div class="c-hotkey-row__actions">
          <button type="button" class="c-btn c-btn--secondary c-btn--sm" data-hotkey="${this.esc(h.id)}" data-op="change"${d.supported ? '' : ' disabled'}>Alterar</button>
          ${h.accelerator !== h.default ? `<button type="button" class="c-btn c-btn--ghost c-btn--sm" data-hotkey="${this.esc(h.id)}" data-op="reset" title="Voltar para ${this.esc(h.default)}">Padrão</button>` : ''}
        </div>
      </div>`).join('') + (d.supported ? '' : '<p class="c-field__hint">Os atalhos funcionam só no app instalado (não no modo navegador).</p>');
  },

  startCapture(id, btn) {
    this.capturing = id;
    const keys = document.getElementById(`hotkey-keys-${id}`);
    if (keys) keys.innerHTML = '<span class="c-hotkey-row__capture">Pressione o novo atalho… (Esc cancela)</span>';
    btn.disabled = true;
  },

  // Monta o atalho no formato do Electron a partir da tecla apertada
  accelerator(e) {
    const code = e.code || '';
    let key = null;
    if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
    else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
    else if (/^Numpad[0-9]$/.test(code)) key = 'Num' + code.slice(6);
    else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) key = code;
    else key = { Space: 'Space', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }[code] || null;
    if (!key) return null;
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
    return mods.length ? [...mods, key].join('+') : null;
  },

  async onKey(e) {
    if (!this.capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { this.capturing = null; this.load(); return; }
    if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) return; // espera a tecla principal
    const acc = this.accelerator(e);
    if (!acc) {
      App.showToast(this.t('Use Ctrl, Alt ou Win junto com uma letra, número ou tecla F.'), 'warning');
      return;
    }
    const id = this.capturing;
    this.capturing = null;
    try {
      const r = (await API.request('/api/hotkeys/set', { method: 'POST', body: JSON.stringify({ id, accelerator: acc }) })).data || {};
      App.showToast(r.message || 'Atalho alterado.', r.success ? 'success' : 'warning', 7000);
    } catch (err) {
      App.showToast('Não foi possível alterar o atalho.', 'danger');
    }
    this.load();
  },

  async reset(id) {
    try {
      const r = (await API.request('/api/hotkeys/reset', { method: 'POST', body: JSON.stringify({ id }) })).data || {};
      App.showToast(r.message || 'Atalho restaurado.', r.success ? 'success' : 'warning', 6000);
    } catch (e) {}
    this.load();
  },

  t(x) { return typeof I18N !== 'undefined' ? I18N.t(x) : x; },

  // ===== Comandos de voz =====
  async loadVoice() {
    let d;
    try { d = (await API.request('/api/voice/status')).data || {}; } catch (e) { return; }
    const badge = document.getElementById('voice-status');
    const btn = document.getElementById('btn-voice-toggle');
    const err = document.getElementById('voice-error');
    const last = document.getElementById('voice-last');
    const labels = { off: ['neutral', 'Desligado'], starting: ['warning', 'Ligando…'], listening: ['success', 'Ouvindo'], error: ['danger', 'Erro'] };
    const [cls, label] = labels[d.status] || labels.off;
    if (badge) { badge.className = `c-badge c-badge--${cls}`; badge.textContent = label; }
    if (btn) {
      const on = d.status === 'listening' || d.status === 'starting';
      btn.querySelector('span').textContent = on ? 'Desligar comandos de voz' : 'Ligar comandos de voz';
      btn.classList.toggle('c-btn--primary', !on);
      btn.classList.toggle('c-btn--secondary', on);
      btn.disabled = d.supported === false;
    }
    if (err) { err.textContent = d.status === 'error' ? d.error || '' : ''; err.classList.toggle('u-hidden', d.status !== 'error'); }
    if (last) {
      last.classList.toggle('u-hidden', !d.last);
      if (d.last) last.textContent = `Último comando: "${d.last.phrase}" → ${d.last.reply}`;
    }
  },

  // ===== Ações de tela pedidas por comando de voz (abrir aba, analisar, tema…) =====
  uiSeq: null,

  watchVoiceUi() {
    const tick = async () => {
      let d;
      try { d = (await API.request(`/api/voice/ui?after=${this.uiSeq || 0}`)).data || {}; } catch (e) { return; }
      // Na primeira leitura, só marca onde está (não repete ações antigas)
      if (this.uiSeq === null) { this.uiSeq = d.seq || 0; return; }
      for (const a of d.actions || []) {
        this.uiSeq = Math.max(this.uiSeq, a.seq);
        try { await this.runVoiceUi(a); } catch (e) { console.error('[voz]', e); }
      }
    };
    tick();
    setInterval(tick, 1000);
  },

  async runVoiceUi(a) {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    switch (a.type) {
      case 'navigate':
        App.switchTab(a.tab);
        if (a.group && a.view && typeof SubTabs !== 'undefined') SubTabs.show(a.group, a.view);
        break;
      case 'disk-analyze':
        DisksModule.load();
        await wait(300);
        DisksModule.analyzeCleanup();
        break;
      case 'disk-clean':
        DisksModule.load();
        await wait(300);
        if (await DisksModule.analyzeCleanup()) {
          if (DisksModule.selectedCleanup().length) DisksModule.runCleanup();
          else App.showToast(this.t('Nada recomendado para limpar agora. Veja os outros itens na Limpeza de disco.'), 'info', 7000);
        }
        break;
      case 'drivers-scan':
        if (typeof ScanModule !== 'undefined') ScanModule.runScan();
        break;
      case 'updates-check':
        if (typeof VersionsModule !== 'undefined') VersionsModule.checkForUpdates();
        break;
      case 'report-export':
        document.getElementById('btn-export-report')?.click();
        break;
      case 'theme':
        if (['graphite', 'frost', 'indigo'].includes(a.theme)) { SettingsModule.setTheme(a.theme); SettingsModule.saveSettings(); }
        break;
      case 'language':
        if (['pt-BR', 'en-US'].includes(a.lang)) {
          SettingsModule.settings.language = a.lang;
          SettingsModule.saveSettings();
          I18N.set(a.lang);
          const sel = document.getElementById('setting-language-select');
          if (sel) sel.value = a.lang;
        }
        break;
      case 'voice-help':
        await wait(200);
        document.getElementById('voice-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
    }
  },

  async toggleVoice() {
    try { await API.request('/api/voice/toggle', { method: 'POST', body: '{}' }); } catch (e) {}
    setTimeout(() => this.loadVoice(), 300);
  }
};
