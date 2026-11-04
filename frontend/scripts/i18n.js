// frontend/scripts/i18n.js
/**
 * Idioma do app. O português é o texto original da interface; para outro idioma,
 * o tradutor troca textos e atributos (placeholder, title, aria-label, data-label)
 * pelo dicionário, inclusive nos conteúdos criados depois (MutationObserver).
 * Textos sem tradução no dicionário continuam em português.
 */
const I18N = {
  KEY: 'cwu_language',
  ATTRS: ['placeholder', 'title', 'aria-label', 'data-label'],
  lang: 'pt-BR',
  dict: {},

  init() {
    try { this.lang = localStorage.getItem(this.KEY) || 'pt-BR'; } catch (e) {}
    document.documentElement.lang = this.lang;
    this.dict = (window.CWU_TRANSLATIONS || {})[this.lang] || {};
    if (!Object.keys(this.dict).length) return;
    this.translate(document.body);
    if (document.title) document.title = this.t(document.title);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') this.translateText(m.target);
        else if (m.type === 'attributes') this.translateAttr(m.target, m.attributeName);
        else m.addedNodes.forEach(n => this.translate(n));
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: this.ATTRS });
  },

  /** Traduz uma frase solta (para uso em código). */
  t(text) {
    const key = String(text).replace(/\s+/g, ' ').trim();
    return this.dict[key] || text;
  },

  translateText(node) {
    const raw = node.nodeValue;
    const key = raw.replace(/\s+/g, ' ').trim();
    const tr = key && this.dict[key];
    if (tr && tr !== key) node.nodeValue = raw.replace(raw.trim(), tr);
  },

  translateAttr(el, name) {
    const v = el.getAttribute && el.getAttribute(name);
    const tr = v && this.dict[v.replace(/\s+/g, ' ').trim()];
    if (tr && tr !== v) el.setAttribute(name, tr);
  },

  translate(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) return this.translateText(root);
    if (root.nodeType !== Node.ELEMENT_NODE || /^(SCRIPT|STYLE)$/.test(root.tagName)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) this.translateText(n);
    [root, ...root.querySelectorAll('*')].forEach(el => this.ATTRS.forEach(a => el.hasAttribute(a) && this.translateAttr(el, a)));
  },

  /** Troca o idioma e recarrega a interface já traduzida. */
  set(lang) {
    try { localStorage.setItem(this.KEY, lang); } catch (e) {}
    location.reload();
  }
};
