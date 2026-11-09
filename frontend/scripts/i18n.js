// frontend/scripts/i18n.js
/**
 * Idioma do app, trocado na hora (sem recarregar).
 * O português é o texto original da interface. Em outro idioma, o tradutor troca
 * textos e atributos (placeholder, title, aria-label, data-label) pelo dicionário,
 * inclusive nos conteúdos criados depois (MutationObserver). O texto original fica
 * guardado, então voltar para o português restaura tudo exatamente como era.
 */
const I18N = {
  KEY: 'cwu_language',
  ATTRS: ['placeholder', 'title', 'aria-label', 'data-label'],
  lang: 'pt-BR',
  dict: {},
  originalText: new WeakMap(),   // nó de texto -> texto original
  originalAttrs: new WeakMap(),  // elemento -> { atributo: valor original }
  originalTitle: null,

  init() {
    try { this.lang = localStorage.getItem(this.KEY) || 'pt-BR'; } catch (e) {}
    this.originalTitle = document.title;
    this.load(this.lang);
    this.translate(document.body);
    new MutationObserver((muts) => {
      if (!this.active()) return;
      for (const m of muts) {
        if (m.type === 'characterData') this.translateText(m.target);
        else if (m.type === 'attributes') this.translateAttr(m.target, m.attributeName);
        else m.addedNodes.forEach(n => this.translate(n));
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: this.ATTRS });
  },

  load(lang) {
    this.lang = lang;
    this.dict = (window.CWU_TRANSLATIONS || {})[lang] || {};
    document.documentElement.lang = lang;
    document.title = this.t(this.originalTitle || document.title);
  },

  active() { return Object.keys(this.dict).length > 0; },

  /** Traduz uma frase solta (para uso em código). */
  t(text) {
    const key = String(text).replace(/\s+/g, ' ').trim();
    return this.dict[key] || text;
  },

  translateText(node) {
    // Se o app escreveu um texto novo neste nó, ele passa a ser o original
    let original;
    if (this.originalText.has(node) && node.nodeValue === this.translatedOf(node)) original = this.originalText.get(node);
    else { this.originalText.delete(node); original = node.nodeValue; }
    const key = original.replace(/\s+/g, ' ').trim();
    const tr = key && this.dict[key];
    if (!tr || tr === key) return;
    this.originalText.set(node, original);
    const value = original.replace(original.trim(), tr);
    if (node.nodeValue !== value) node.nodeValue = value;
  },

  translatedOf(node) {
    const o = this.originalText.get(node);
    const tr = o && this.dict[o.replace(/\s+/g, ' ').trim()];
    return tr ? o.replace(o.trim(), tr) : o;
  },

  translateAttr(el, name) {
    if (!el.getAttribute) return;
    const store = this.originalAttrs.get(el) || {};
    const current = el.getAttribute(name);
    if (current == null) return;
    // Se o app trocou o atributo, o novo valor vira o original
    if (store[name] !== undefined && current !== this.t(store[name])) delete store[name];
    const original = store[name] !== undefined ? store[name] : current;
    const tr = this.dict[original.replace(/\s+/g, ' ').trim()];
    if (!tr) return;
    store[name] = original;
    this.originalAttrs.set(el, store);
    if (current !== tr) el.setAttribute(name, tr);
  },

  forEachNode(root, onText, onEl) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) return onText(root);
    if (root.nodeType !== Node.ELEMENT_NODE || /^(SCRIPT|STYLE)$/.test(root.tagName)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) onText(n);
    [root, ...root.querySelectorAll('*')].forEach(onEl);
  },

  translate(root) {
    if (!this.active()) return;
    this.forEachNode(root, n => this.translateText(n), el => this.ATTRS.forEach(a => el.hasAttribute(a) && this.translateAttr(el, a)));
  },

  /** Volta todos os textos para o original (português). */
  restore(root) {
    this.forEachNode(root, (n) => {
      if (this.originalText.has(n)) { n.nodeValue = this.originalText.get(n); this.originalText.delete(n); }
    }, (el) => {
      const store = this.originalAttrs.get(el);
      if (!store) return;
      Object.entries(store).forEach(([a, v]) => el.setAttribute(a, v));
      this.originalAttrs.delete(el);
    });
  },

  /** Troca o idioma na hora, com uma transição suave. */
  set(lang) {
    if (lang === this.lang) return;
    try { localStorage.setItem(this.KEY, lang); } catch (e) {}
    const main = document.querySelector('.o-app') || document.body;
    main.classList.add('u-lang-switching');
    setTimeout(() => {
      this.restore(document.body);
      this.load(lang);
      this.translate(document.body);
      main.classList.remove('u-lang-switching');
    }, 120);
  }
};
