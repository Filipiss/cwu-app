// frontend/scripts/modules/account.js
/**
 * Minha Conta: login/cadastro (Supabase Auth via REST, sem bibliotecas) e
 * personalização da lista de programas pós-formatação, salva na nuvem.
 */
const Account = {
  session: null,          // { access_token, refresh_token, expires_at, user }
  suggested: null,        // Set de ids escolhidos pelo usuário (null = usar padrão)
  catalog: [],
  draft: null,
  STORAGE_KEY: 'cwu_session',

  get cfg() { return window.CWU_CONFIG || {}; },
  get configured() { return Boolean(this.cfg.supabaseUrl && this.cfg.supabaseAnonKey); },
  icon(n) { return `<svg class="c-icon" aria-hidden="true"><use href="#i-${n}"></use></svg>`; },
  esc(v) { return String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },

  async init() {
    this.bindForms();
    if (!this.configured) { this.render(); return; }
    try { this.session = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || 'null'); } catch (e) { this.session = null; }
    if (this.session) {
      const ok = await this.ensureFreshToken();
      if (ok) await this.loadPreferences();
    }
    this.render();
  },

  // ---------- Supabase REST ----------
  async call(path, { method = 'GET', body, auth = false, headers = {} } = {}) {
    const h = { apikey: this.cfg.supabaseAnonKey, 'Content-Type': 'application/json', ...headers };
    if (auth && this.session) h.Authorization = `Bearer ${this.session.access_token}`;
    const res = await fetch(this.cfg.supabaseUrl.replace(/\/$/, '') + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) throw new Error(this.translateError(data, res.status));
    return data;
  },

  translateError(d, status) {
    const msg = String((d && (d.msg || d.error_description || d.message || d.error)) || '');
    const map = [
      [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
      [/already registered|already exists/i, 'Este e-mail já tem uma conta. Entre com ele.'],
      [/email not confirmed/i, 'Confirme seu e-mail pelo link que enviamos antes de entrar.'],
      [/password should be at least|weak password/i, 'A senha precisa ter pelo menos 8 caracteres, com letras e números.'],
      [/rate limit|too many/i, 'Muitas tentativas seguidas. Aguarde alguns minutos.'],
      [/invalid email|unable to validate email/i, 'E-mail inválido.']
    ];
    const found = map.find(([re]) => re.test(msg));
    if (found) return found[1];
    if (status === 0 || !status) return 'Sem conexão com o servidor de contas.';
    return 'Não foi possível concluir. Tente de novo em instantes.';
  },

  saveSession(data) {
    this.session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      user: data.user
    };
    try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.session)); } catch (e) {}
  },

  clearSession() {
    this.session = null;
    this.suggested = null;
    try { localStorage.removeItem(this.STORAGE_KEY); } catch (e) {}
  },

  async ensureFreshToken() {
    if (!this.session) return false;
    if (Date.now() < this.session.expires_at - 60000) return true;
    try {
      this.saveSession(await this.call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: this.session.refresh_token } }));
      return true;
    } catch (e) {
      this.clearSession();
      return false;
    }
  },

  async loadPreferences() {
    try {
      const rows = await this.call(`/rest/v1/user_preferences?select=suggested_apps&user_id=eq.${encodeURIComponent(this.session.user.id)}`, { auth: true });
      this.suggested = rows && rows[0] ? new Set(rows[0].suggested_apps || []) : null;
    } catch (e) {
      this.suggested = null;
    }
  },

  async savePreferences(ids) {
    if (!(await this.ensureFreshToken())) throw new Error('Sua sessão expirou. Entre de novo.');
    await this.call('/rest/v1/user_preferences?on_conflict=user_id', {
      method: 'POST', auth: true,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { user_id: this.session.user.id, suggested_apps: [...ids], updated_at: new Date().toISOString() }
    });
    this.suggested = new Set(ids);
  },

  /** Usado por Softwares/winget: o programa está na lista pós-formatação? */
  isSuggested(sw) { return this.suggested ? this.suggested.has(sw.id) : Boolean(sw.mustHave); },

  // ---------- Formulários ----------
  bindForms() {
    document.getElementById('account-login-form')?.addEventListener('submit', (e) => { e.preventDefault(); this.login(e.target); });
    document.getElementById('account-signup-form')?.addEventListener('submit', (e) => { e.preventDefault(); this.signup(e.target); });
    document.getElementById('btn-account-forgot')?.addEventListener('click', () => this.forgot());
    document.getElementById('btn-account-logout')?.addEventListener('click', () => this.logout());
    document.getElementById('btn-account-save')?.addEventListener('click', () => this.saveDraft());
    document.getElementById('btn-account-reset')?.addEventListener('click', () => this.resetDraft());
    document.getElementById('account-apps-search')?.addEventListener('input', () => this.renderApps());
    document.querySelectorAll('.js-toggle-password').forEach(btn => btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
      btn.innerHTML = this.icon(show ? 'eye-off' : 'eye');
    }));
    document.getElementById('account-apps-list')?.addEventListener('change', (e) => {
      const box = e.target.closest('input[type="checkbox"][data-id]');
      if (!box || !this.draft) return;
      box.checked ? this.draft.add(box.dataset.id) : this.draft.delete(box.dataset.id);
      this.updateCounter();
    });
  },

  setFormMessage(id, text, type = 'danger') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.dataset.type = type;
    el.classList.toggle('u-hidden', !text);
  },

  async withBusy(form, fn) {
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try { await fn(); } finally { if (btn) btn.disabled = false; }
  },

  async login(form) {
    const email = form.email.value.trim();
    const password = form.password.value;
    this.setFormMessage('account-login-msg', '');
    await this.withBusy(form, async () => {
      try {
        this.saveSession(await this.call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
        await this.loadPreferences();
        form.reset();
        this.render();
        App.showToast('Bem-vindo de volta!', 'success');
      } catch (e) { this.setFormMessage('account-login-msg', e.message); }
    });
  },

  async signup(form) {
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    this.setFormMessage('account-signup-msg', '');
    if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      return this.setFormMessage('account-signup-msg', 'A senha precisa ter pelo menos 8 caracteres, com letras e números.');
    }
    if (password !== form.confirm.value) return this.setFormMessage('account-signup-msg', 'As senhas não são iguais.');
    await this.withBusy(form, async () => {
      try {
        const d = await this.call('/auth/v1/signup', { method: 'POST', body: { email, password, data: { display_name: name } } });
        form.reset();
        if (d && d.access_token) {
          this.saveSession(d);
          this.render();
          App.showToast('Conta criada!', 'success');
        } else {
          this.setFormMessage('account-signup-msg', 'Conta criada! Enviamos um link de confirmação para o seu e-mail.', 'success');
        }
      } catch (e) { this.setFormMessage('account-signup-msg', e.message); }
    });
  },

  async forgot() {
    const email = document.querySelector('#account-login-form [name="email"]')?.value.trim();
    if (!email) return this.setFormMessage('account-login-msg', 'Digite seu e-mail acima e clique de novo em "Esqueci minha senha".', 'info');
    try {
      await this.call('/auth/v1/recover', { method: 'POST', body: { email } });
      this.setFormMessage('account-login-msg', 'Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha.', 'success');
    } catch (e) { this.setFormMessage('account-login-msg', e.message); }
  },

  async logout() {
    try { await this.call('/auth/v1/logout', { method: 'POST', auth: true }); } catch (e) { /* sai localmente mesmo offline */ }
    this.clearSession();
    this.render();
    if (typeof SoftsModule !== 'undefined' && SoftsModule.filterAndRender) SoftsModule.filterAndRender();
    App.showToast('Você saiu da conta.', 'info');
  },

  // ---------- Tela ----------
  render() {
    const logged = Boolean(this.session);
    document.getElementById('account-guest')?.classList.toggle('u-hidden', logged || !this.configured);
    document.getElementById('account-user')?.classList.toggle('u-hidden', !logged);
    document.getElementById('account-unconfigured')?.classList.toggle('u-hidden', this.configured);
    this.renderNavLabel();
    if (!logged) return;

    const u = this.session.user || {};
    const name = (u.user_metadata && u.user_metadata.display_name) || (u.email || '').split('@')[0];
    document.getElementById('account-name').textContent = name;
    document.getElementById('account-email').textContent = u.email || '';
    document.getElementById('account-avatar').textContent = name.slice(0, 1).toUpperCase() || '?';
    const date = (v) => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('account-stat-confirmed', u.email_confirmed_at ? 'Confirmado' : 'Não confirmado');
    set('account-stat-created', date(u.created_at));
    set('account-stat-last', date(u.last_sign_in_at));
    set('account-stat-apps', this.suggested ? String(this.suggested.size) : 'Padrão (10)');
    this.openEditor();
  },

  renderNavLabel() {
    const el = document.querySelector('.js-nav-item[data-tab="account"] .c-nav__label');
    if (el) el.textContent = this.session ? 'Minha Conta' : 'Entrar';
  },

  async openEditor() {
    if (!this.catalog.length) {
      try { this.catalog = (await API.request('/api/software/essential')).data || []; } catch (e) { this.catalog = []; }
    }
    this.draft = new Set(this.suggested || this.catalog.filter(s => s.mustHave).map(s => s.id));
    this.renderApps();
  },

  resetDraft() {
    this.draft = new Set(this.catalog.filter(s => s.mustHave).map(s => s.id));
    this.renderApps();
  },

  async saveDraft() {
    const btn = document.getElementById('btn-account-save');
    if (btn) btn.disabled = true;
    try {
      await this.savePreferences(this.draft);
      App.showToast(`Lista salva: ${this.draft.size} programa(s) nas suas sugestões pós-formatação.`, 'success');
      const st = document.getElementById('account-stat-apps');
      if (st) st.textContent = String(this.draft.size);
      if (typeof SoftsModule !== 'undefined' && SoftsModule.filterAndRender) SoftsModule.filterAndRender();
    } catch (e) {
      App.showToast(e.message, 'danger');
    } finally { if (btn) btn.disabled = false; }
  },

  updateCounter() {
    const el = document.getElementById('account-apps-count');
    if (el) el.textContent = `${this.draft ? this.draft.size : 0} selecionado(s)`;
  },

  renderApps() {
    const box = document.getElementById('account-apps-list');
    if (!box || !this.draft) return;
    const q = (document.getElementById('account-apps-search')?.value || '').trim().toLowerCase();
    const items = this.catalog.filter(s => s.category && (!q || s.name.toLowerCase().includes(q)));
    const groups = {};
    items.forEach(s => { (groups[s.categoryLabel || s.category] = groups[s.categoryLabel || s.category] || []).push(s); });
    const names = Object.keys(groups);
    box.innerHTML = names.length ? names.map(g => `
      <div class="c-app-group">
        <div class="c-app-group__title">${this.esc(g)}</div>
        <div class="c-app-group__grid">
          ${groups[g].sort((a, b) => a.name.localeCompare(b.name)).map(s => `
            <label class="c-app-pick">
              <input type="checkbox" data-id="${this.esc(s.id)}" ${this.draft.has(s.id) ? 'checked' : ''}>
              <span class="c-app-pick__name">${this.esc(s.name)}</span>
            </label>`).join('')}
        </div>
      </div>`).join('') : '<p class="c-card__desc">Nenhum programa encontrado.</p>';
    this.updateCounter();
  }
};
