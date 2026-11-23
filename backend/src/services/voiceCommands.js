// backend/src/services/voiceCommands.js
// O que cada comando de voz faz. Cada um usa a MESMA ação do botão correspondente no app
// (mesmas regras, mesmo registro em Logs) e devolve uma resposta curta, falada e mostrada na tela.
// O que é irreversível (apagar arquivos na limpeza de disco) nunca roda direto pela voz:
// o app abre a tela e pede a confirmação de sempre.
const db = require('../database/db');

const POSITION_REPLY = {
  'top-left': 'Sobreposição no canto superior esquerdo.',
  'top-center': 'Sobreposição em cima, no centro.',
  'top-right': 'Sobreposição no canto superior direito.',
  'bottom-left': 'Sobreposição no canto inferior esquerdo.',
  'bottom-center': 'Sobreposição embaixo, no centro.',
  'bottom-right': 'Sobreposição no canto inferior direito.'
};

const ITEM_NAMES = {
  overlayFps: 'o FPS', overlayCpu: 'o uso da CPU', overlayGpu: 'o uso da GPU', overlayRam: 'a memória RAM',
  overlayCpuTemp: 'a temperatura da CPU', overlayGpuTemp: 'a temperatura da GPU'
};

const TWEAK_NAMES = {
  game_mode: 'Modo de Jogo', game_dvr: 'gravação em segundo plano', hags: 'agendamento de GPU',
  sysmain: 'SysMain', fast_startup: 'inicialização rápida', windowed_opt: 'otimização para jogos em janela'
};

const PAGE_NAMES = {
  specs: 'System Specs', scan: 'Drivers', softs: 'Softwares', boost: 'Boost', competitive: 'Competitivo', perf: 'Performance',
  disks: 'Discos', startup: 'Inicialização', logs: 'Logs', security: 'Segurança', settings: 'Configurações',
  versions: 'Novas Versões', account: 'Minha Conta', assistant: 'Assistente'
};

// Tela de cada página (aba e, quando houver, sub-aba)
const PAGE_TARGETS = {
  specs: ['specs'], scan: ['scan'], softs: ['softs'], boost: ['boost', 'boost', 'optimize'], competitive: ['boost', 'boost', 'competitive'],
  perf: ['perf', 'perf', 'monitor'], disks: ['perf', 'perf', 'disks'], startup: ['perf', 'perf', 'startup'], logs: ['logs'],
  security: ['security'], settings: ['settings', 'settings', 'prefs'], versions: ['versions'], account: ['account'], assistant: ['assistant']
};

const THEME_NAMES = { graphite: 'Grafite', frost: 'Névoa', indigo: 'Índigo' };
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const settings = () => db.getSettings();
const fmt = (n, d = 0) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: d });

function ui(voice, action) {
  db.events.emit('show-main-window');
  voice.pushUi(action);
}

function navigate(voice, page) {
  const [tab, group, view] = PAGE_TARGETS[page] || [page];
  ui(voice, { type: 'navigate', tab, group: group || null, view: view || null });
}

// Último dado do monitor em tempo real (liga o monitor e espera a primeira leitura, até ~6 s)
async function monitorSample() {
  const monitor = require('./monitorService');
  for (let i = 0; i < 30; i++) {
    const snap = monitor.snapshot();
    if (!snap.available) return null;
    if (snap.latest) return snap.latest;
    await new Promise(r => setTimeout(r, 200));
  }
  return null;
}

const boost = (actionId) => require('./boostService').runBoostOptimization(actionId);
const adminReply = 'Isso precisa do app aberto como administrador.';

async function run(cmd, voice) {
  const a = cmd.arg;
  switch (cmd.id) {
    // ----- Sobreposição
    case 'overlay_on': db.events.emit('overlay-set', true); return { ok: true, reply: 'Sobreposição ligada.' };
    case 'overlay_off': db.events.emit('overlay-set', false); return { ok: true, reply: 'Sobreposição desligada.' };
    case 'overlay_position':
      if (!POSITION_REPLY[a]) return { ok: false, reply: 'Posição desconhecida.' };
      db.updateSettings({ overlayPosition: a });
      db.events.emit('overlay-set', true);
      return { ok: true, reply: POSITION_REPLY[a] };
    case 'overlay_bigger':
    case 'overlay_smaller': {
      const now = Number(settings().overlayScale) || 100;
      const next = clamp(now + (cmd.id === 'overlay_bigger' ? 20 : -20), 60, 200);
      db.updateSettings({ overlayScale: next });
      db.events.emit('overlay-set', true);
      return { ok: true, reply: next === now ? `A sobreposição já está no tamanho ${cmd.id === 'overlay_bigger' ? 'máximo' : 'mínimo'}.` : `Sobreposição em ${next}% do tamanho.` };
    }
    case 'overlay_more_transparent':
    case 'overlay_less_transparent': {
      const now = Number(settings().overlayOpacity) || 85;
      const next = clamp(now + (cmd.id === 'overlay_more_transparent' ? -15 : 15), 20, 100);
      db.updateSettings({ overlayOpacity: next });
      db.events.emit('overlay-set', true);
      return { ok: true, reply: `Opacidade da sobreposição em ${next}%.` };
    }
    case 'overlay_layout':
      db.updateSettings({ overlayLayout: a === 'horizontal' ? 'horizontal' : 'vertical' });
      db.events.emit('overlay-set', true);
      return { ok: true, reply: a === 'horizontal' ? 'Sobreposição na horizontal.' : 'Sobreposição na vertical.' };
    case 'overlay_edit':
      db.events.emit('overlay-edit');
      return { ok: true, reply: 'Arraste a sobreposição e aperte Enter para salvar.' };
    case 'overlay_item_on':
    case 'overlay_item_off': {
      if (!ITEM_NAMES[a]) return { ok: false, reply: 'Item desconhecido.' };
      const on = cmd.id === 'overlay_item_on';
      db.updateSettings({ [a]: on });
      if (on) db.events.emit('overlay-set', true);
      return { ok: true, reply: `${on ? 'Mostrando' : 'Escondendo'} ${ITEM_NAMES[a]} na sobreposição.` };
    }

    // ----- Boost e limpeza
    case 'boost':
    case 'memory_clean': {
      const r = await boost(cmd.id === 'boost' ? 'purge_standby' : 'full_boost');
      if (r.needsAdmin) return { ok: false, reply: `${cmd.id === 'boost' ? 'O boost' : 'A limpeza da memória'} precisa do app aberto como administrador.` };
      if (r.success === false) return { ok: false, reply: 'Não consegui executar.' };
      const mb = Number(r.freedMemoryMb) || 0;
      return { ok: true, reply: mb > 0 ? `${cmd.id === 'boost' ? 'Boost executado' : 'Memória limpa'}: ${fmt(mb)} megas liberados.` : (cmd.id === 'boost' ? 'Boost executado.' : 'Memória limpa.') };
    }
    case 'temp_clean': {
      const r = await boost('temp_cleanup');
      return { ok: r.success !== false, reply: r.success !== false ? `Temporários limpos: ${fmt(Number(r.freedDiskMb) || 0)} megas liberados.` : 'Não consegui limpar os temporários.' };
    }
    case 'disk_analyze':
      navigate(voice, 'disks');
      voice.pushUi({ type: 'disk-analyze' });
      return { ok: true, reply: 'Analisando a limpeza de disco.' };
    case 'disk_clean':
      navigate(voice, 'disks');
      voice.pushUi({ type: 'disk-clean' });
      return { ok: true, reply: 'Medindo o que dá para limpar. Confirme na tela.' };

    // ----- Energia e ajustes
    case 'power_high': {
      const r = await boost('power_plan');
      if (r.success === false) return { ok: false, reply: 'Não foi possível mudar o plano de energia. Veja o motivo no app.' };
      return { ok: true, reply: /Modo de energia/.test(r.message || '') ? 'Modo melhor desempenho ativado.' : 'Alto desempenho ativado.' };
    }
    case 'power_restore': {
      const r = await boost('power_balanced');
      return { ok: r.success !== false, reply: r.success !== false ? 'Energia restaurada.' : 'Não consegui restaurar o plano de energia.' };
    }
    case 'telemetry_off':
    case 'telemetry_on': {
      const r = await boost(cmd.id === 'telemetry_off' ? 'telemetry_services' : 'telemetry_restore');
      if (r.needsAdmin) return { ok: false, reply: adminReply };
      return { ok: r.success !== false, reply: cmd.id === 'telemetry_off' ? 'Telemetria desativada.' : 'Telemetria restaurada.' };
    }
    case 'tweak_on':
    case 'tweak_off': {
      if (!TWEAK_NAMES[a]) return { ok: false, reply: 'Ajuste desconhecido.' };
      const on = cmd.id === 'tweak_on';
      const r = await require('./tweaksService').set({ id: a, enabled: on });
      if (r.needsAdmin) return { ok: false, reply: adminReply };
      if (!r.success) return { ok: false, reply: `Não consegui mudar ${TWEAK_NAMES[a]}.` };
      return { ok: true, reply: `${TWEAK_NAMES[a]} ${on ? 'ativado' : 'desativado'}.` };
    }
    case 'mouse_accel_off':
    case 'mouse_accel_on': {
      const r = await require('./competitiveService').setMouseAcceleration({ enabled: cmd.id === 'mouse_accel_on' });
      return { ok: r.success, reply: r.success ? `Aceleração do mouse ${cmd.id === 'mouse_accel_on' ? 'ativada' : 'desativada'}.` : 'Não consegui mudar a aceleração do mouse.' };
    }
    case 'monitor_max': {
      const comp = require('./competitiveService');
      const st = await comp.getStatus();
      const below = (st.displays || []).filter(d => d.belowMax);
      if (!st.available) return { ok: false, reply: 'Não consegui ler os monitores.' };
      if (!below.length) return { ok: true, reply: 'Os monitores já estão na taxa máxima.' };
      let done = 0;
      for (const d of below) { const r = await comp.setRefreshRate({ device: d.name, hz: d.max }); if (r.success) done += 1; }
      return { ok: done > 0, reply: done ? `Monitor na taxa máxima: ${below.map(d => d.max).join(' e ')} hertz.` : 'O Windows recusou a mudança de taxa.' };
    }
    case 'gamebar_off':
    case 'gamebar_on': {
      const r = await require('./competitiveService').setGameBarOverlay({ enabled: cmd.id === 'gamebar_on' });
      return { ok: r.success, reply: r.success ? `Xbox Game Bar ${cmd.id === 'gamebar_on' ? 'reativado' : 'desativado'}.` : 'Não consegui mudar o Xbox Game Bar.' };
    }
    case 'usb_suspend_off':
    case 'usb_suspend_on': {
      const r = await require('./competitiveService').setUsbSelectiveSuspend({ enabled: cmd.id === 'usb_suspend_on' });
      return { ok: r.success, reply: r.success ? `Suspensão seletiva de USB ${cmd.id === 'usb_suspend_on' ? 'ativada' : 'desativada'}.` : 'Não consegui mudar a suspensão de USB.' };
    }
    case 'restore_point': {
      const r = await require('./restorePointService').create('CWU App (comando de voz)');
      if (r && r.needsAdmin) return { ok: false, reply: adminReply };
      if (r && r.ok && !r.created) return { ok: true, reply: 'Já existe um ponto de restauração recente.' };
      return { ok: Boolean(r && r.ok), reply: r && r.ok ? 'Ponto de restauração criado.' : ((r && r.message) || 'Não consegui criar o ponto de restauração.') };
    }

    // ----- App
    case 'drivers_scan': navigate(voice, 'scan'); voice.pushUi({ type: 'drivers-scan' }); return { ok: true, reply: 'Verificando os drivers.' };
    case 'updates_check': navigate(voice, 'versions'); voice.pushUi({ type: 'updates-check' }); return { ok: true, reply: 'Procurando atualizações do app.' };
    case 'report_export': navigate(voice, 'specs'); voice.pushUi({ type: 'report-export' }); return { ok: true, reply: 'Gerando o relatório do PC.' };
    case 'theme': ui(voice, { type: 'theme', theme: a }); return { ok: true, reply: `Tema ${THEME_NAMES[a] || a}.` };
    case 'language': ui(voice, { type: 'language', lang: a }); return { ok: true, reply: a === 'en-US' ? 'Idioma inglês.' : 'Idioma português.' };
    case 'navigate': navigate(voice, a); return { ok: true, reply: `Abrindo ${PAGE_NAMES[a] || a}.` };
    case 'open_app': db.events.emit('show-main-window'); return { ok: true, reply: 'Abrindo o app.' };
    case 'hide_app': db.events.emit('hide-main-window'); return { ok: true, reply: 'App minimizado.' };
    case 'help': navigate(voice, 'settings'); voice.pushUi({ type: 'voice-help' }); return { ok: true, reply: 'Abri a lista de comandos de voz.' };

    // ----- Perguntas
    case 'info_cpu_temp':
    case 'info_gpu_temp':
    case 'info_cpu_usage':
    case 'info_gpu_usage':
    case 'info_ram': {
      const s = await monitorSample();
      if (!s) return { ok: false, reply: 'Não consegui ler os sensores agora.' };
      if (cmd.id === 'info_cpu_temp') return s.cpuTemp == null ? { ok: false, reply: 'Este PC não informa a temperatura da CPU.' } : { ok: true, reply: `A CPU está a ${fmt(s.cpuTemp)} graus.` };
      if (cmd.id === 'info_gpu_temp') return s.gpuTemp == null ? { ok: false, reply: 'Não consegui ler a temperatura da GPU.' } : { ok: true, reply: `A GPU está a ${fmt(s.gpuTemp)} graus.` };
      if (cmd.id === 'info_cpu_usage') return { ok: true, reply: `A CPU está em ${fmt(s.cpu)}% de uso.` };
      if (cmd.id === 'info_gpu_usage') return s.gpu == null ? { ok: false, reply: 'Não consegui ler o uso da GPU.' } : { ok: true, reply: `A GPU está em ${fmt(s.gpu)}% de uso.` };
      return { ok: true, reply: `Memória em ${fmt(s.ram)}%: ${fmt(s.ramUsedGb, 1)} de ${fmt(s.ramTotalGb, 1)} gigas.` };
    }
    case 'info_fps': {
      const f = await require('./fpsService').snapshot();
      if (!f.available) return { ok: false, reply: f.reason === 'admin' ? 'O FPS precisa do app como administrador.' : 'Não consegui ler o FPS.' };
      await new Promise(r => setTimeout(r, 1500));
      const g = await require('./fpsService').snapshot();
      return g.fps ? { ok: true, reply: `${g.app ? g.app.replace(/\.exe$/i, '') + ': ' : ''}${g.fps} FPS.` } : { ok: false, reply: 'Nenhum jogo está mostrando frames agora.' };
    }
    case 'info_disk_free': {
      const v = await require('./diskHealthService').getVolumes();
      const sys = (v.volumes || []).find(x => x.system) || (v.volumes || [])[0];
      if (!sys) return { ok: false, reply: 'Não consegui ler o espaço dos discos.' };
      return { ok: true, reply: `O disco ${sys.letter} tem ${fmt(sys.freeGb)} gigas livres, ${fmt(sys.freePct)}%.` };
    }

    // ----- Voz
    case 'voice_off':
      setTimeout(() => voice.stop(), 50);
      return { ok: true, reply: 'Comandos de voz desligados.' };
    default:
      return { ok: false, reply: 'Comando desconhecido.' };
  }
}

module.exports = { run, POSITION_REPLY, PAGE_TARGETS, TWEAK_NAMES, ITEM_NAMES };
