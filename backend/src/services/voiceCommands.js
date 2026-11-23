// backend/src/services/voiceCommands.js
// O que cada comando de voz faz. Cada um usa a MESMA ação do botão correspondente no app
// (mesmas regras, mesmo registro em Logs), e devolve uma resposta curta para o usuário.
const db = require('../database/db');

const POSITION_REPLY = {
  'top-left': 'Sobreposição no canto superior esquerdo.',
  'top-center': 'Sobreposição no topo, no centro.',
  'top-right': 'Sobreposição no canto superior direito.',
  'bottom-left': 'Sobreposição no canto inferior esquerdo.',
  'bottom-center': 'Sobreposição embaixo, no centro.',
  'bottom-right': 'Sobreposição no canto inferior direito.'
};

async function run(cmd, voice) {
  switch (cmd.id) {
    case 'boost': {
      const r = await require('./boostService').runBoostOptimization('purge_standby');
      if (r.needsAdmin) return { ok: false, reply: 'O boost precisa do app aberto como administrador.' };
      return { ok: r.success !== false, reply: r.success !== false ? 'Boost executado.' : 'Não consegui executar o boost.' };
    }
    case 'overlay_on':
      db.events.emit('overlay-set', true);
      return { ok: true, reply: 'Sobreposição ligada.' };
    case 'overlay_off':
      db.events.emit('overlay-set', false);
      return { ok: true, reply: 'Sobreposição desligada.' };
    case 'overlay_position':
      if (!POSITION_REPLY[cmd.arg]) return { ok: false, reply: 'Posição desconhecida.' };
      db.updateSettings({ overlayPosition: cmd.arg });
      db.events.emit('overlay-set', true);
      return { ok: true, reply: POSITION_REPLY[cmd.arg] };
    case 'power_high': {
      const r = await require('./boostService').runBoostOptimization('power_plan');
      if (r.success === false) return { ok: false, reply: 'Não foi possível mudar o plano de energia. Veja o motivo no app.' };
      return { ok: true, reply: /Modo de energia/.test(r.message || '') ? 'Modo melhor desempenho ativado.' : 'Alto desempenho ativado.' };
    }
    case 'power_restore': {
      const r = await require('./boostService').runBoostOptimization('power_balanced');
      return { ok: r.success !== false, reply: r.success !== false ? 'Energia restaurada.' : 'Não consegui restaurar o plano de energia.' };
    }
    case 'open_app':
      db.events.emit('show-main-window');
      return { ok: true, reply: 'Abrindo o app.' };
    case 'voice_off':
      setTimeout(() => voice.stop(), 50);
      return { ok: true, reply: 'Comandos de voz desligados.' };
    default:
      return { ok: false, reply: 'Comando desconhecido.' };
  }
}

module.exports = { run, POSITION_REPLY };
