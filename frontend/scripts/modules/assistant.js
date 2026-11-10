// frontend/scripts/modules/assistant.js
/**
 * Assistente: chat sobre hardware, software e jogos, com respostas personalizadas a
 * partir do hardware lido na aba System Specs. A IA (Gemini) roda numa Edge Function
 * do Supabase: o app nunca vê a chave da API. Exige login (limite diário por conta).
 */
const AssistantModule = {
  messages: [],      // { role: 'user' | 'model' | 'canned', text }
  busy: false,
  remaining: null,
  limit: null,
  context: '',

  REPLIES: {
    offtopic: 'Sou focado em hardware, software, configurações de jogos e indicação de periféricos e peças. Esse assunto foge do que eu consigo ajudar. Que tal perguntar algo sobre o seu PC?',
    greeting: 'Olá! Posso analisar o seu PC, sugerir upgrades, ajudar com configurações de jogos competitivos ou indicar periféricos com bom custo-benefício. O que você quer saber?'
  },

  SUGGESTIONS: [
    'Analise meu PC: pontos fortes e fracos',
    'Qual upgrade vale mais a pena no meu PC?',
    'Melhores configurações de vídeo para CS2',
    'Mouse custo-benefício para Valorant até R$ 250'
  ],

  icon(n) { return `<svg class="c-icon" aria-hidden="true"><use href="#i-${n}"></use></svg>`; },
  esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  t(s) { return typeof I18N !== 'undefined' ? I18N.t(s) : s; },
  // Os módulos são declarados com const: não ficam em window
  get specs() { return typeof SpecsModule !== 'undefined' ? SpecsModule : null; },

  init() {
    const form = document.getElementById('assistant-form');
    const input = document.getElementById('assistant-input');
    if (!form || !input) return;
    form.addEventListener('submit', (e) => { e.preventDefault(); this.send(input.value); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(input.value); }
    });
    input.addEventListener('input', () => this.autosize(input));
    document.getElementById('assistant-clear')?.addEventListener('click', () => { this.messages = []; this.renderMessages(); });
    document.getElementById('assistant-suggestions')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-suggestion]');
      if (b) this.send(b.textContent);
    });
    document.getElementById('assistant-context-toggle')?.addEventListener('click', () => this.toggleContext());
    document.querySelectorAll('[data-tab="assistant"]').forEach(el => el.addEventListener('click', () => this.refresh()));
    this.renderSuggestions();
    this.refresh();
  },

  autosize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; },

  // Estado de login e resumo do hardware (atualiza ao abrir a aba)
  async refresh() {
    const logged = typeof Account !== 'undefined' && Boolean(Account.session);
    document.getElementById('assistant-login')?.classList.toggle('u-hidden', logged);
    document.getElementById('assistant-chat')?.classList.toggle('u-hidden', !logged);
    if (!logged) return;
    let data = this.specs && this.specs.data;
    if (!data) {
      try { data = (await API.getSpecs()).data; if (this.specs && !this.specs.data) this.specs.data = data; } catch (e) {}
    }
    this.context = ChatTopic.buildContext(data);
    const pre = document.getElementById('assistant-context');
    if (pre) pre.textContent = this.context || this.t('O hardware ainda não foi lido. Abra a aba System Specs.');
    this.renderMessages();
    this.renderQuota();
  },

  toggleContext() {
    const pre = document.getElementById('assistant-context');
    const btn = document.getElementById('assistant-context-toggle');
    if (!pre) return;
    const open = pre.classList.toggle('u-hidden') === false;
    btn?.setAttribute('aria-expanded', String(open));
  },

  renderSuggestions() {
    const box = document.getElementById('assistant-suggestions');
    if (!box) return;
    box.innerHTML = this.SUGGESTIONS.map(s => `<button type="button" class="c-chip" data-suggestion="${this.esc(s)}">${this.esc(s)}</button>`).join('');
  },

  renderQuota() {
    const el = document.getElementById('assistant-quota');
    if (!el) return;
    el.textContent = this.remaining === null ? this.t('Limite de 20 mensagens por dia') : `${this.remaining} ${this.t('mensagens restantes hoje')}`;
  },

  async send(raw) {
    const input = document.getElementById('assistant-input');
    const text = String(raw || '').trim().slice(0, 1000);
    if (!text || this.busy) return;
    if (input) { input.value = ''; this.autosize(input); }

    const history = this.messages.filter(m => m.role === 'user' || m.role === 'model').map(m => ({ role: m.role, text: m.text })).slice(-10);
    this.messages.push({ role: 'user', text });

    // Respostas prontas: não chamam a IA nem gastam o limite
    const kind = ChatTopic.classify(text);
    if (kind === 'offtopic' || kind === 'greeting') {
      this.messages.push({ role: 'canned', text: this.t(this.REPLIES[kind]) });
      this.renderMessages();
      return;
    }

    this.busy = true;
    this.renderMessages(true);
    try {
      const res = await this.ask(text, history);
      if (res.offTopic) this.messages.push({ role: 'canned', text: this.t(this.REPLIES.offtopic) });
      else this.messages.push({ role: 'model', text: res.text });
    } catch (err) {
      this.messages.push({ role: 'error', text: err.message });
    } finally {
      this.busy = false;
      this.renderMessages();
      this.renderQuota();
      input?.focus();
    }
  },

  async ask(message, history) {
    const cfg = window.CWU_CONFIG || {};
    if (!(await Account.ensureFreshToken())) { this.refresh(); throw new Error(this.t('Sua sessão expirou. Entre novamente em Minha Conta.')); }
    let res;
    try {
      res = await fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/functions/v1/cwu-chat', {
        method: 'POST',
        headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${Account.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, specs: this.context, lang: (typeof I18N !== 'undefined' && I18N.lang) || 'pt-BR' })
      });
    } catch (e) {
      throw new Error(this.t('Sem conexão com o servidor do Assistente.'));
    }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (Number.isFinite(data.remaining)) this.remaining = data.remaining;
    if (Number.isFinite(data.limit)) this.limit = data.limit;
    if (res.ok) return data;
    const errors = {
      limit: 'Você atingiu o limite de mensagens de hoje. Volte amanhã!',
      unauthorized: 'Sua sessão expirou. Entre novamente em Minha Conta.',
      busy: 'O Assistente está sobrecarregado agora. Tente de novo em instantes.',
      not_configured: 'O Assistente ainda não foi configurado no servidor.'
    };
    throw new Error(this.t(errors[data.error] || 'Não foi possível obter a resposta. Tente de novo.'));
  },

  // Markdown mínimo e seguro: escapa tudo primeiro, depois aplica negrito, código e listas
  format(text) {
    const inline = (s) => this.esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
    const out = [];
    let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    String(text).split(/\r?\n/).forEach(line => {
      const ul = line.match(/^\s*[-*•]\s+(.*)$/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      const h = line.match(/^\s*#{1,6}\s+(.*)$/);
      if (ul || ol) {
        const tag = ul ? 'ul' : 'ol';
        if (list !== tag) { close(); out.push(`<${tag}>`); list = tag; }
        out.push(`<li>${inline((ul || ol)[1])}</li>`);
      } else {
        close();
        if (h) out.push(`<p class="c-chat__heading">${inline(h[1])}</p>`);
        else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
      }
    });
    close();
    return out.join('');
  },

  renderMessages(thinking = false) {
    const box = document.getElementById('assistant-messages');
    if (!box) return;
    document.getElementById('assistant-empty')?.classList.toggle('u-hidden', this.messages.length > 0);
    document.getElementById('assistant-suggestions')?.classList.toggle('u-hidden', this.messages.length > 0);
    box.innerHTML = this.messages.map(m => {
      if (m.role === 'user') return `<div class="c-chat__msg c-chat__msg--user">${this.esc(m.text).replace(/\n/g, '<br>')}</div>`;
      if (m.role === 'error') return `<div class="c-chat__msg c-chat__msg--error">${this.icon('triangle-alert')} ${this.esc(m.text)}</div>`;
      return `<div class="c-chat__msg c-chat__msg--bot" data-no-i18n>${this.format(m.text)}</div>`;
    }).join('') + (thinking ? `<div class="c-chat__msg c-chat__msg--bot c-chat__msg--thinking"><span class="u-spin">${this.icon('loader-circle')}</span> ${this.esc(this.t('Pensando…'))}</div>` : '');
    const send = document.getElementById('assistant-send');
    if (send) send.disabled = this.busy;
    box.scrollTop = box.scrollHeight;
  }
};
