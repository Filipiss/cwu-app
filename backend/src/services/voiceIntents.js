// backend/src/services/voiceIntents.js
// O que o usuário pode falar. Em vez de frases fixas, cada comando é uma sequência de PALAVRAS-CHAVE
// (cada uma com sinônimos) e qualquer coisa pode vir entre elas. Assim "Ei app, sobreposição no canto
// superior direito" e "Ei app, mudar a sobreposição para a direita em cima" viram o mesmo comando.
//
// Desta tabela saem duas coisas:
//   1. a gramática SRGS do reconhecedor do Windows (com coringas GARBAGE entre as palavras), sem internet;
//   2. o interpretador parseIntent(), que lê o texto reconhecido (e é usado nos testes).

const WAKE = ['ei app', 'hey app', 'ei aplicativo', 'oi app'];

// Sinônimos de cada palavra-chave (verbos no infinitivo, no imperativo e na 3ª pessoa)
const V = {
  overlay: ['sobreposição', 'overlay', 'hud'],
  on: ['ligar', 'ligue', 'liga', 'ativar', 'ative', 'ativa', 'mostrar', 'mostre', 'mostra', 'exibir', 'exiba', 'exibe', 'acender', 'acenda', 'reativar', 'reative'],
  off: ['desligar', 'desligue', 'desliga', 'desativar', 'desative', 'desativa', 'esconder', 'esconda', 'esconde', 'ocultar', 'oculte', 'oculta', 'tirar', 'tire', 'tira', 'sumir com'],
  right: ['direita', 'direito'],
  left: ['esquerda', 'esquerdo'],
  center: ['centro', 'meio', 'central'],
  top: ['cima', 'superior', 'topo', 'alto'],
  bottom: ['baixo', 'embaixo', 'inferior', 'rodapé'],
  bigger: ['maior', 'aumentar', 'aumente', 'aumenta', 'ampliar', 'amplie', 'amplia'],
  smaller: ['menor', 'diminuir', 'diminua', 'diminui', 'reduzir', 'reduza', 'reduz'],
  more: ['mais'],
  less: ['menos'],
  transparent: ['transparente', 'transparência', 'apagada', 'clarinha'],
  opaque: ['opaca', 'opaco', 'visível', 'sólida', 'forte', 'escura'],
  horizontal: ['horizontal', 'deitada', 'em linha', 'lado a lado'],
  vertical: ['vertical', 'em pé', 'em coluna', 'empilhada'],
  move: ['posicionar', 'posicione', 'posiciona', 'arrastar', 'arraste', 'arrasta', 'ajustar a posição', 'ajuste a posição'],
  fps: ['fps', 'quadros por segundo', 'frames'],
  cpu: ['cpu', 'processador'],
  gpu: ['gpu', 'placa de vídeo', 'placa de video', 'placa gráfica'],
  ram: ['ram', 'memória'],
  temperature: ['temperatura', 'temperaturas', 'calor'],
  run: ['executar', 'execute', 'executa', 'rodar', 'rode', 'roda', 'fazer', 'faça', 'faz', 'dar', 'dê', 'dá', 'iniciar', 'inicie', 'inicia', 'ativar', 'ative', 'ativa', 'ligar', 'ligue', 'liga', 'aplicar', 'aplique', 'aplica', 'mandar', 'manda'],
  boost: ['boost', 'booster', 'game booster', 'turbo', 'otimização', 'otimizar o pc'],
  clean: ['limpar', 'limpe', 'limpa', 'liberar', 'libere', 'libera', 'esvaziar', 'esvazie', 'esvazia', 'apagar', 'apague', 'apaga', 'fazer a limpeza', 'faça a limpeza', 'faz a limpeza'],
  memory: ['memória', 'ram', 'memória ram', 'standby'],
  temps: ['temporários', 'arquivos temporários', 'pasta temp', 'temp', 'lixo'],
  analyze: ['analisar', 'analise', 'analisa', 'verificar', 'verifique', 'verifica', 'medir', 'meça', 'mede', 'checar', 'cheque', 'checa'],
  disk: ['disco', 'discos', 'limpeza de disco', 'armazenamento', 'hd', 'ssd'],
  powerHigh: ['alto desempenho', 'desempenho máximo', 'melhor desempenho', 'modo desempenho', 'máximo desempenho', 'modo performance'],
  restore: ['restaurar', 'restaure', 'restaura', 'voltar', 'volte', 'volta', 'desfazer', 'desfaça', 'desfaz'],
  power: ['plano de energia', 'energia', 'equilibrado', 'plano anterior', 'modo de energia'],
  telemetry: ['telemetria', 'diagnóstico da microsoft', 'rastreamento'],
  gameMode: ['modo de jogo', 'modo jogo', 'game mode'],
  gameDvr: ['gravação em segundo plano', 'game dvr', 'gravação de jogo', 'gravação automática'],
  hags: ['agendamento de gpu', 'agendamento acelerado', 'hags'],
  sysmain: ['sysmain', 'superfetch', 'pré-carregamento'],
  fastStartup: ['inicialização rápida', 'fast startup', 'boot rápido'],
  windowedOpt: ['otimizações para jogos em janela', 'otimização de jogos em janela', 'jogos em janela'],
  mouseAccel: ['aceleração do mouse', 'aceleração do ponteiro', 'precisão do ponteiro'],
  monitor: ['monitor', 'tela', 'monitores'],
  maxHz: ['taxa máxima', 'hertz máximo', 'frequência máxima', 'máximo de hertz', 'taxa de atualização máxima', 'mais hertz'],
  gamebar: ['game bar', 'xbox game bar', 'barra de jogo', 'barra do xbox'],
  usbSuspend: ['suspensão seletiva', 'suspensão de usb', 'suspensão do usb', 'economia de usb'],
  scan: ['escanear', 'escaneie', 'escaneia', 'verificar', 'verifique', 'verifica', 'procurar', 'procure', 'procura', 'buscar', 'busque', 'busca', 'checar', 'cheque', 'checa', 'analisar', 'analise', 'analisa', 'atualizar', 'atualize'],
  drivers: ['drivers', 'driver'],
  updates: ['atualizações', 'atualização', 'versão nova', 'nova versão', 'update'],
  export: ['exportar', 'exporte', 'exporta', 'gerar', 'gere', 'gera', 'baixar', 'baixe', 'baixa', 'salvar', 'salve', 'salva'],
  report: ['relatório'],
  create: ['criar', 'crie', 'cria', 'fazer', 'faça', 'faz', 'gerar', 'gere', 'gera'],
  restorePoint: ['ponto de restauração'],
  theme: ['tema', 'visual', 'cor do app'],
  graphite: ['grafite', 'escuro', 'preto'],
  frost: ['névoa', 'claro', 'branco'],
  indigo: ['índigo', 'azul'],
  language: ['idioma', 'língua'],
  portuguese: ['português'],
  english: ['inglês'],
  open: ['abrir', 'abra', 'abre', 'ir para', 'vá para', 'vai para', 'vamos para', 'entrar em', 'entre em', 'entra em', 'acessar', 'acesse', 'acessa'],
  pageSpecs: ['especificações', 'specs', 'hardware', 'meu pc', 'system specs'],
  pageDrivers: ['drivers', 'aba de drivers'],
  pageSofts: ['programas', 'softwares', 'aplicativos', 'pós formatação'],
  pageBoost: ['boost'],
  pageCompetitive: ['competitivo', 'modo competitivo'],
  pagePerf: ['performance', 'monitor', 'desempenho'],
  pageDisks: ['discos', 'aba de discos'],
  pageStartup: ['inicialização', 'programas da inicialização'],
  pageLogs: ['logs', 'registros', 'erros', 'telas azuis'],
  pageSecurity: ['segurança', 'processos suspeitos'],
  pageSettings: ['configurações', 'preferências'],
  pageVersions: ['novas versões', 'versões', 'histórico de versões'],
  pageAccount: ['conta', 'minha conta', 'perfil'],
  pageAssistant: ['assistente', 'chat', 'inteligência artificial'],
  app: ['app', 'aplicativo', 'janela', 'cwu'],
  minimize: ['minimizar', 'minimize', 'minimiza', 'esconder', 'esconda', 'esconde', 'fechar a janela', 'feche a janela'],
  usage: ['uso', 'usando', 'consumo', 'porcentagem', 'ocupada', 'ocupado'],
  query: ['qual', 'quanto', 'quantos', 'quantas', 'me diga', 'me fala', 'fala', 'diga', 'como está', 'como tá'],
  free: ['livre', 'livres', 'sobrando', 'disponível'],
  space: ['espaço', 'disco', 'armazenamento', 'gigas'],
  stop: ['parar', 'pare', 'para', 'desligar', 'desligue', 'desliga', 'desativar', 'desative'],
  listen: ['de ouvir', 'ouvir', 'a escuta', 'escutar', 'comandos de voz', 'comando de voz', 'microfone'],
  help: ['ajuda', 'me ajuda', 'o que você faz', 'quais comandos', 'lista de comandos']
};

const POSITIONS = [
  ['top-left', 'left', 'top'], ['top-center', 'center', 'top'], ['top-right', 'right', 'top'],
  ['bottom-left', 'left', 'bottom'], ['bottom-center', 'center', 'bottom'], ['bottom-right', 'right', 'bottom']
];

const OVERLAY_ITEMS = [
  ['overlayFps', ['fps']], ['overlayCpu', ['cpu']], ['overlayGpu', ['gpu']], ['overlayRam', ['ram']],
  ['overlayCpuTemp', ['temperature', 'cpu']], ['overlayGpuTemp', ['temperature', 'gpu']]
];

const TWEAKS = [['game_mode', 'gameMode'], ['game_dvr', 'gameDvr'], ['hags', 'hags'], ['sysmain', 'sysmain'], ['fast_startup', 'fastStartup'], ['windowed_opt', 'windowedOpt']];

const PAGES = [
  ['specs', 'pageSpecs'], ['scan', 'pageDrivers'], ['softs', 'pageSofts'], ['boost', 'pageBoost'], ['competitive', 'pageCompetitive'],
  ['perf', 'pagePerf'], ['disks', 'pageDisks'], ['startup', 'pageStartup'], ['logs', 'pageLogs'], ['security', 'pageSecurity'],
  ['settings', 'pageSettings'], ['versions', 'pageVersions'], ['account', 'pageAccount'], ['assistant', 'pageAssistant']
];

// Cada intenção: { id, arg, seqs: [[palavra-chave, ...], ...] } — qualquer uma das sequências vale
const INTENTS = [];
const add = (id, arg, ...seqs) => INTENTS.push({ id, arg: arg === undefined ? null : arg, seqs });

// --- Sobreposição
add('overlay_on', null, ['on', 'overlay']);
add('overlay_off', null, ['off', 'overlay']);
for (const [pos, h, v] of POSITIONS) add('overlay_position', pos, ['overlay', h, v], ['overlay', v, h], [h, v, 'overlay'], [v, h, 'overlay']);
add('overlay_bigger', null, ['bigger', 'overlay'], ['overlay', 'bigger']);
add('overlay_smaller', null, ['smaller', 'overlay'], ['overlay', 'smaller']);
add('overlay_more_transparent', null, ['overlay', 'more', 'transparent'], ['more', 'transparent', 'overlay'], ['overlay', 'less', 'opaque']);
add('overlay_less_transparent', null, ['overlay', 'less', 'transparent'], ['less', 'transparent', 'overlay'], ['overlay', 'more', 'opaque'], ['more', 'opaque', 'overlay']);
add('overlay_layout', 'horizontal', ['overlay', 'horizontal'], ['horizontal', 'overlay']);
add('overlay_layout', 'vertical', ['overlay', 'vertical'], ['vertical', 'overlay']);
add('overlay_edit', null, ['move', 'overlay']);
for (const [key, words] of OVERLAY_ITEMS) {
  add('overlay_item_on', key, ['on', ...words, 'overlay'], ['on', 'overlay', ...words]);
  add('overlay_item_off', key, ['off', ...words, 'overlay'], ['off', 'overlay', ...words]);
}

// --- Boost e limpeza
add('boost', null, ['run', 'boost'], ['boost']);
add('memory_clean', null, ['clean', 'memory']);
add('temp_clean', null, ['clean', 'temps']);
add('disk_analyze', null, ['analyze', 'disk']);
add('disk_clean', null, ['clean', 'disk']);

// --- Energia e ajustes do Windows
add('power_high', null, ['on', 'powerHigh'], ['run', 'powerHigh']);
add('power_restore', null, ['restore', 'power'], ['off', 'powerHigh']);
add('telemetry_off', null, ['off', 'telemetry']);
add('telemetry_on', null, ['on', 'telemetry']);
for (const [tweak, word] of TWEAKS) {
  add('tweak_on', tweak, ['on', word]);
  add('tweak_off', tweak, ['off', word]);
}
add('mouse_accel_off', null, ['off', 'mouseAccel']);
add('mouse_accel_on', null, ['on', 'mouseAccel']);
add('monitor_max', null, ['monitor', 'maxHz'], ['maxHz', 'monitor']);
add('gamebar_off', null, ['off', 'gamebar']);
add('gamebar_on', null, ['on', 'gamebar']);
add('usb_suspend_off', null, ['off', 'usbSuspend']);
add('usb_suspend_on', null, ['on', 'usbSuspend']);
add('restore_point', null, ['create', 'restorePoint']);

// --- App: drivers, atualizações, relatório, tema, idioma, telas
add('drivers_scan', null, ['scan', 'drivers']);
add('updates_check', null, ['scan', 'updates']);
add('report_export', null, ['export', 'report']);
add('theme', 'graphite', ['theme', 'graphite']);
add('theme', 'frost', ['theme', 'frost']);
add('theme', 'indigo', ['theme', 'indigo']);
add('language', 'pt-BR', ['language', 'portuguese']);
add('language', 'en-US', ['language', 'english']);
for (const [page, word] of PAGES) add('navigate', page, ['open', word]);
add('open_app', null, ['open', 'app']);
add('hide_app', null, ['minimize', 'app']);

// --- Perguntas (o app responde falando)
add('info_cpu_temp', null, ['temperature', 'cpu']);
add('info_gpu_temp', null, ['temperature', 'gpu']);
add('info_cpu_usage', null, ['usage', 'cpu'], ['query', 'cpu']);
add('info_gpu_usage', null, ['usage', 'gpu'], ['query', 'gpu']);
add('info_ram', null, ['usage', 'memory'], ['query', 'memory'], ['memory', 'usage']);
add('info_fps', null, ['query', 'fps']);
add('info_disk_free', null, ['space', 'free'], ['free', 'space']);

// --- Voz
add('voice_off', null, ['stop', 'listen']);
add('help', null, ['help']);

// ---------------------------------------------------------------------------
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const tok = (s) => norm(s).split(' ').filter(Boolean);
const NV = Object.fromEntries(Object.entries(V).map(([k, list]) => [k, list.map(tok)]));
const WAKE_TOK = WAKE.map(tok);

// Procura a palavra-chave (qualquer sinônimo) a partir da posição "from". Devolve onde termina.
function findSlot(tokens, from, key) {
  let best = null;
  for (const syn of NV[key]) {
    for (let i = from; i + syn.length <= tokens.length; i++) {
      if (syn.every((w, j) => tokens[i + j] === w)) {
        if (!best || i < best.start || (i === best.start && syn.length > best.len)) best = { start: i, len: syn.length };
        break;
      }
    }
  }
  return best ? best.start + best.len : -1;
}

/**
 * Texto reconhecido → { id, arg } ou null (pura, testável).
 * Exige a palavra de ativação no começo; entre as palavras-chave pode vir qualquer coisa.
 * Se mais de um comando servir, ganha o mais específico (mais palavras-chave).
 */
function parseIntent(text) {
  let tokens = tok(text);
  const wake = WAKE_TOK.find(w => w.every((x, i) => tokens[i] === x));
  if (!wake) return null;
  tokens = tokens.slice(wake.length);
  // Nunca casa "ligar" dentro de "desligar" etc.: a busca é por palavra inteira
  let best = null;
  INTENTS.forEach((intent, order) => {
    for (const seq of intent.seqs) {
      let pos = 0;
      let ok = true;
      let words = 0;
      for (const key of seq) {
        const end = findSlot(tokens, pos, key);
        if (end < 0) { ok = false; break; }
        words += 1;
        pos = end;
      }
      if (!ok) continue;
      // Desempate: mais palavras-chave; depois a ordem da tabela
      if (!best || words > best.words) best = { id: intent.id, arg: intent.arg, words, order };
    }
  });
  return best ? { id: best.id, arg: best.arg } : null;
}

// ---------------------------------------------------------------------------
// Gramática SRGS para o reconhecedor do Windows (com GARBAGE entre as palavras-chave)
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function buildGrammar(lang = 'pt-BR') {
  const used = new Set();
  for (const it of INTENTS) for (const seq of it.seqs) seq.forEach(k => used.add(k));
  const slotRules = [...used].map(k =>
    `  <rule id="s_${k}"><one-of>${V[k].map(w => `<item>${xml(w)}</item>`).join('')}</one-of></rule>`).join('\n');
  const G = '<ruleref special="GARBAGE"/>';
  const alts = [];
  for (const it of INTENTS) {
    const tag = `${it.id}|${it.arg || ''}`;
    for (const seq of it.seqs) {
      alts.push(`<item>${G}${seq.map(k => `<ruleref uri="#s_${k}"/>${G}`).join('')}<tag>out.cmd="${xml(tag)}";</tag></item>`);
    }
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<grammar version="1.0" xml:lang="${lang}" root="cwu" tag-format="semantics/1.0" xmlns="http://www.w3.org/2001/06/grammar">
  <rule id="cwu" scope="public">
    <one-of>${WAKE.map(w => `<item>${xml(w)}</item>`).join('')}</one-of>
    <ruleref uri="#cmds"/><tag>out.cmd=rules.cmds.cmd;</tag>
  </rule>
  <rule id="cmds"><one-of>
    ${alts.join('\n    ')}
  </one-of></rule>
${slotRules}
</grammar>
`;
}

/** "id|arg" da gramática → { id, arg } (pura). */
function fromTag(tag) {
  const [id, arg] = String(tag || '').split('|');
  const intent = INTENTS.find(i => i.id === id && String(i.arg || '') === String(arg || ''));
  return intent ? { id: intent.id, arg: intent.arg } : null;
}

module.exports = { WAKE, V, INTENTS, POSITIONS, OVERLAY_ITEMS, TWEAKS, PAGES, parseIntent, buildGrammar, fromTag, norm };
