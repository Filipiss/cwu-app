// frontend/scripts/chatTopic.js
/**
 * Filtro local do Assistente: decide, sem gastar tokens, se a mensagem vai para a IA.
 *  - 'greeting'  → cumprimento/agradecimento: resposta pronta
 *  - 'offtopic'  → assunto claramente fora de hardware/software: resposta pronta
 *  - 'send'      → vai para a IA (que ainda pode recusar casos ambíguos)
 * Na dúvida, envia: o filtro só bloqueia quando não há nenhum termo técnico.
 */
(function (root) {
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const TECH = [
    'pc', 'computador', 'notebook', 'laptop', 'desktop', 'setup', 'hardware', 'software', 'cpu', 'processador',
    'gpu', 'placa', 'video', 'grafica', 'vram', 'ram', 'memoria', 'ssd', 'hd', 'hdd', 'nvme', 'disco', 'armazenamento',
    'fonte', 'psu', 'gabinete', 'cooler', 'water', 'pasta termica', 'temperatura', 'aquecendo', 'esquentando', 'overclock',
    'undervolt', 'bios', 'uefi', 'soquete', 'socket', 'chipset', 'placa mae', 'placa-mae', 'motherboard', 'upgrade',
    'windows', 'driver', 'drivers', 'sistema', 'formatar', 'formatacao', 'instalar', 'programa', 'aplicativo', 'app',
    'antivirus', 'virus', 'malware', 'atualizacao', 'atualizar', 'update', 'tela azul', 'travando', 'trava', 'lento',
    'lag', 'stutter', 'fps', 'frame', 'frames', 'jogo', 'jogos', 'game', 'games', 'gamer', 'jogar', 'cs2', 'cs:go', 'csgo',
    'counter', 'valorant', 'fortnite', 'lol', 'league', 'apex', 'warzone', 'minecraft', 'steam', 'epic', 'rocket league',
    'pubg', 'overwatch', 'dota', 'gta', 'sensibilidade', 'sens', 'dpi', 'crosshair', 'mira', 'resolucao', 'esticad',
    'stretched', 'graficos', 'config', 'configuracao', 'configuracoes', 'configurar', 'ajuste', 'otimizar', 'otimizacao',
    'desempenho', 'performance', 'benchmark', 'gargalo', 'bottleneck', 'mouse', 'teclado', 'keyboard', 'headset', 'fone',
    'microfone', 'monitor', 'hz', 'hertz', 'mousepad', 'controle', 'periferico', 'perifericos', 'webcam', 'cadeira gamer',
    'internet', 'ping', 'rede', 'wifi', 'wi-fi', 'roteador', 'cabo', 'ethernet', 'latencia', 'conexao', 'dns', 'nvidia',
    'geforce', 'rtx', 'gtx', 'amd', 'radeon', 'ryzen', 'intel', 'core i', 'arc', 'ddr4', 'ddr5', 'custo beneficio',
    'custo-beneficio', 'hdmi', 'displayport', 'usb', 'bluetooth', 'reflex', 'g-sync', 'freesync', 'vsync', 'dlss', 'fsr', 'directx', 'vulkan', 'cwu'
  ];

  const OFF = [
    'receita', 'cozinhar', 'bolo', 'comida', 'almoco', 'jantar', 'futebol', 'campeonato', 'brasileirao', 'time do',
    'politica', 'eleicao', 'presidente', 'governo', 'partido', 'religiao', 'deus', 'igreja', 'namorad', 'namoro',
    'relacionamento', 'crush', 'casamento', 'horoscopo', 'signo', 'piada', 'poema', 'poesia', 'letra da musica',
    'redacao', 'dever de casa', 'licao', 'prova de', 'historia do', 'geografia', 'biologia', 'quimica', 'fisica',
    'remedio', 'doenca', 'sintoma', 'dieta', 'emagrecer', 'academia', 'previsao do tempo', 'clima', 'horoscopo',
    'filme', 'novela', 'serie de tv', 'netflix', 'investimento', 'acoes', 'bitcoin', 'cripto', 'imposto', 'advogado'
  ];

  const GREET = /^(oi+|ola|opa|eae|e ai|eai|bom dia|boa tarde|boa noite|hey|hi|hello|obrigad[oa]|valeu|vlw|thanks|thank you|tmj|blz|beleza|ok|show)[\s!.?,]*$/;

  function hasTerm(text, list) {
    return list.some(t => (t.length <= 4 ? new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(text) : text.includes(t)));
  }

  function classify(message) {
    const text = norm(message).trim();
    if (!text) return 'empty';
    if (GREET.test(text)) return 'greeting';
    if (hasTerm(text, TECH)) return 'send';
    if (hasTerm(text, OFF)) return 'offtopic';
    return 'send';
  }

  /**
   * Resumo em texto do hardware lido pela aba System Specs. É exatamente isto que vai
   * junto com a pergunta (o usuário pode ver na própria aba). Sem nome, e-mail ou serial.
   */
  function buildContext(data) {
    if (!data || !data.specs) return '';
    const { specs: s, scores } = data;
    const sc = (k) => (scores && scores.components && scores.components[k] && scores.components[k].detected !== false ? ` (nota ${scores.components[k].score}/10)` : '');
    const lines = [];
    if (s.cpu && s.cpu.detected !== false) lines.push(`Processador: ${s.cpu.name}${s.cpu.cores ? `, ${s.cpu.cores} núcleos/${s.cpu.threads} threads` : ''}${s.cpu.clockGhz ? `, ${s.cpu.clockGhz} GHz` : ''}${sc('cpu')}`);
    (s.gpus || []).forEach((g, i) => {
      const parts = [g.name, g.vramGb ? `${g.vramGb} GB VRAM` : null, g.isDedicated ? 'dedicada' : 'integrada',
        g.driverVersion ? `driver ${g.driverVersion}${g.driverDate ? ` de ${g.driverDate}` : ''}` : null,
        g.isMicrosoftBasic ? 'SEM DRIVER (adaptador básico da Microsoft)' : null].filter(Boolean);
      lines.push(`Placa de vídeo${s.gpus.length > 1 ? ` ${i + 1}` : ''}: ${parts.join(', ')}${g === s.gpu ? sc('gpu') : ''}`);
      if (g.resolution) lines.push(`Monitor: ${g.resolution}${g.refreshRate ? ` @ ${g.refreshRate} Hz` : ''}`);
    });
    if (s.ram) lines.push(`Memória RAM: ${s.ram.totalGb} GB${s.ram.type ? ` ${s.ram.type}` : ''}${s.ram.speedMhz ? ` ${s.ram.speedMhz} MHz` : ''}${s.ram.slotsUsed ? `, ${s.ram.slotsUsed} pente(s)` : ''}${sc('ram')}`);
    (s.disks || []).forEach(d => lines.push(`Disco: ${d.model}, ${d.sizeGb} GB, ${d.driveType}${d.health && d.health !== 'Não detectado' ? `, saúde ${d.health}` : ''}`));
    if (s.motherboard && s.motherboard.detected) lines.push(`Placa-mãe: ${s.motherboard.manufacturer} ${s.motherboard.model}${s.motherboard.biosDate ? `, BIOS de ${s.motherboard.biosDate}` : ''}`);
    if (s.os) lines.push(`Sistema: ${s.os.caption}${s.os.build ? ` (build ${s.os.build})` : ''} ${s.os.architecture || ''}`.trim());
    if (scores && Number.isFinite(scores.overall)) lines.push(`Nota geral do CWU App: ${scores.overall}/10 (${scores.ratingTier || ''})`);
    return lines.join('\n').slice(0, 4000);
  }

  const api = { classify, normalize: norm, buildContext };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ChatTopic = api;
})(typeof window !== 'undefined' ? window : globalThis);
