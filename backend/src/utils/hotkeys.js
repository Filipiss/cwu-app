// backend/src/utils/hotkeys.js
// Atalhos globais personalizáveis (funcionam com o app em segundo plano e com jogos abertos).
// O registro de verdade é do Electron (globalShortcut): o electron-main.js entrega aqui a
// implementação com setImpl(). Sem o Electron (modo "npm start"), os atalhos ficam indisponíveis.
const db = require('../database/db');

const HOTKEYS = {
  overlay: { label: 'Mostrar ou esconder a sobreposição de desempenho', setting: 'hotkeyOverlay', default: 'Alt+I' },
  voice: { label: 'Ligar ou desligar os comandos de voz', setting: 'hotkeyVoice', default: 'Alt+H' }
};

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Super'];
const KEY_RE = /^([A-Z]|[0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Insert|Delete|Home|End|PageUp|PageDown|Up|Down|Left|Right|Num[0-9]|Plus|-|=|,|\.|\/|;|'|\[|\]|\\|`)$/;

/**
 * Normaliza e valida um atalho no formato do Electron ("Ctrl+Shift+K").
 * Exige pelo menos um modificador (Ctrl, Alt, Shift ou Super) e uma tecla. Devolve null se inválido.
 */
function normalize(accelerator) {
  const parts = String(accelerator || '').split('+').map(p => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return null;
  const alias = { control: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift', super: 'Super', meta: 'Super', win: 'Super', cmd: 'Super', command: 'Super' };
  const mods = [];
  let key = null;
  for (const raw of parts) {
    const mod = alias[raw.toLowerCase()];
    if (mod) {
      if (mods.includes(mod)) return null;
      mods.push(mod);
    } else {
      if (key) return null;
      key = raw.length === 1 ? raw.toUpperCase() : raw[0].toUpperCase() + raw.slice(1);
    }
  }
  if (!mods.length || !key || !KEY_RE.test(key)) return null;
  // Só Shift + tecla atrapalharia a digitação normal (Shift+A é "A" maiúsculo)
  if (mods.length === 1 && mods[0] === 'Shift') return null;
  mods.sort((a, b) => MODIFIERS.indexOf(a) - MODIFIERS.indexOf(b));
  return [...mods, key].join('+');
}

let impl = null;          // { apply(id, accelerator) -> boolean }
const registered = {};    // id -> boolean (se o Windows aceitou o atalho)

const current = (id) => normalize(db.getSettings()[HOTKEYS[id].setting]) || HOTKEYS[id].default;

module.exports = {
  HOTKEYS,
  normalize,
  current,
  setImpl(i) { impl = i; },
  setRegistered(id, ok) { registered[id] = Boolean(ok); },

  list() {
    return {
      supported: Boolean(impl),
      hotkeys: Object.entries(HOTKEYS).map(([id, h]) => ({
        id, label: h.label, accelerator: current(id), default: h.default, registered: registered[id] !== false
      }))
    };
  },

  /** Troca o atalho de uma função. Só grava se o Windows aceitar (não estiver em uso por outro programa). */
  set(id, accelerator) {
    if (!Object.prototype.hasOwnProperty.call(HOTKEYS, id)) return { success: false, message: 'Atalho desconhecido.' };
    const acc = normalize(accelerator);
    if (!acc) return { success: false, message: 'Atalho inválido. Use pelo menos uma tecla Ctrl, Alt ou Win junto com outra tecla.' };
    if (!impl) return { success: false, message: 'Os atalhos só funcionam no app (não no modo navegador).' };
    const other = Object.keys(HOTKEYS).find(k => k !== id && current(k) === acc);
    if (other) return { success: false, message: `${acc} já é o atalho de "${HOTKEYS[other].label}".` };
    if (acc === current(id) && registered[id] !== false) return { success: true, accelerator: acc, message: `O atalho já é ${acc}.` };
    if (!impl.apply(id, acc)) return { success: false, message: `${acc} está em uso por outro programa (ou é reservado pelo Windows). Escolha outra combinação.` };
    db.updateSettings({ [HOTKEYS[id].setting]: acc });
    registered[id] = true;
    return { success: true, accelerator: acc, message: `Atalho alterado para ${acc}.` };
  },

  reset(id) {
    if (!Object.prototype.hasOwnProperty.call(HOTKEYS, id)) return { success: false, message: 'Atalho desconhecido.' };
    return this.set(id, HOTKEYS[id].default);
  }
};
