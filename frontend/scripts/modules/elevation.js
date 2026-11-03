// frontend/scripts/modules/elevation.js
/**
 * Faixa "Algumas funções precisam de administrador" + botão para reabrir o app
 * com elevação (UAC). Aparece quando o app roda sem permissão e reaparece sempre
 * que uma ação responde "needsAdmin".
 */
const ElevationBanner = {
  isAdmin: null,

  async init() {
    document.getElementById('btn-admin-relaunch')?.addEventListener('click', () => this.relaunch());
    document.getElementById('btn-admin-dismiss')?.addEventListener('click', () => this.dismiss());

    try {
      const d = (await API.request('/api/system/elevation')).data || {};
      this.isAdmin = Boolean(d.isAdmin);
      if (d.supported && !d.isAdmin && !this.isDismissed()) this.show();
    } catch (e) { /* servidor indisponível: não mostra nada */ }
  },

  isDismissed() {
    try { return sessionStorage.getItem('cwu_admin_banner_dismissed') === '1'; } catch (e) { return false; }
  },

  show() {
    if (this.isAdmin) return;
    document.getElementById('admin-banner')?.classList.remove('u-hidden');
  },

  dismiss() {
    document.getElementById('admin-banner')?.classList.add('u-hidden');
    try { sessionStorage.setItem('cwu_admin_banner_dismissed', '1'); } catch (e) {}
  },

  async relaunch() {
    const btn = document.getElementById('btn-admin-relaunch');
    const text = document.getElementById('admin-banner-text');
    btn.disabled = true;
    if (text) text.textContent = 'Confirme a permissão na janela do Windows (UAC)…';
    try {
      const d = (await API.request('/api/system/relaunch-admin', { method: 'POST', body: '{}' })).data || {};
      if (!d.success) {
        App.showToast(d.message || 'Não foi possível reabrir como administrador.', 'warning', 7000);
        if (text) text.textContent = 'Algumas funções precisam de permissão de administrador.';
        btn.disabled = false;
        return;
      }
      if (text) text.textContent = 'Reabrindo como administrador… a página será recarregada sozinha.';
      // No modo navegador o servidor reinicia; esperamos ele voltar já elevado e recarregamos
      if (d.mode === 'server') this.waitForElevatedServer();
    } catch (e) {
      btn.disabled = false;
    }
  },

  waitForElevatedServer() {
    const started = Date.now();
    const tick = async () => {
      if (Date.now() - started > 60000) {
        const text = document.getElementById('admin-banner-text');
        if (text) text.textContent = 'O servidor não voltou. Verifique a nova janela do console aberta pelo Windows.';
        return;
      }
      try {
        const d = (await API.request('/api/system/elevation')).data || {};
        if (d.isAdmin) return location.reload();
      } catch (e) { /* ainda reiniciando */ }
      setTimeout(tick, 1000);
    };
    setTimeout(tick, 2500);
  }
};
