// backend/src/services/logsService.js
const { runPowerShell } = require('../utils/powershell');
const db = require('../database/db');

class LogsService {
  getUpdateLogs() {
    const logs = db.getUpdateLogs();
    return {
      timestamp: new Date().toISOString(),
      total: logs.length,
      updatedCount: logs.filter(l => l.status === 'updated').length,
      revertedCount: logs.filter(l => l.status === 'reverted').length,
      logs
    };
  }

  async revertUpdate(id) {
    const logs = db.getUpdateLogs();
    const item = logs.find(l => l.id === id);
    if (!item) {
      return { success: false, message: 'Registro de alteração não encontrado.' };
    }

    if (item.status === 'reverted') {
      return { success: false, message: 'Esta alteração já foi revertida anteriormente.' };
    }

    // Executa a reversão real no sistema
    if (item.type === 'boost' && item.revertAction) {
      const boostService = require('./boostService');
      await boostService.runBoostOptimization(item.revertAction);
    } else if (item.type === 'driver') {
      // Abre Gerenciador de Dispositivos para reversão de driver ou executa comando
      if (process.platform === 'win32') {
        const { spawn } = require('child_process');
        spawn('explorer.exe', ['devmgmt.msc'], { detached: true, stdio: 'ignore' }).unref();
      }
    } else if (item.type === 'tweak' && item.tweakId) {
      const tweaksService = require('./tweaksService');
      // Volta ao estado anterior; se era 'padrão desconhecido' (null), desfaz o que foi aplicado
      const target = typeof item.tweakPrevious === 'boolean' ? item.tweakPrevious : !/: ativado$/.test(item.title);
      const r = await tweaksService.set({ id: item.tweakId, enabled: target });
      if (!r.success) return { success: false, message: r.message };
    } else if (item.type === 'startup' && item.startupId) {
      const startupService = require('./startupService');
      const r = await startupService.toggle({ id: item.startupId, enabled: !item.startupEnabled });
      if (!r.success) return { success: false, message: r.message };
    } else if (item.type === 'priority' && item.exeName) {
      const processService = require('./processService');
      const r = await processService.removePersistent(item.exeName);
      if (!r.success) return { success: false, message: r.message };
    } else if (item.type === 'software') {
      if (process.platform === 'win32') {
        const { spawn } = require('child_process');
        spawn('explorer.exe', ['appwiz.cpl'], { detached: true, stdio: 'ignore' }).unref();
      }
    }

    const updated = db.revertUpdateLog(id);
    return {
      success: true,
      message: `Alteração de "${item.title}" revertida com sucesso!`,
      item: updated
    };
  }

  recordUpdate(entry) {
    const created = db.addUpdateLog(entry);
    return {
      success: true,
      message: 'Log de atualização registrado.',
      item: created
    };
  }

  clearUpdateLogs() {
    db.clearUpdateLogs();
    return {
      success: true,
      message: 'Histórico de atualizações limpo com sucesso.'
    };
  }

  async getSystemErrorLogs() {
    const encyclopedia = db.getBsodEncyclopedia();
    let events = [];
    let minidumps = [];
    let readOk = false;

    if (process.platform === 'win32') {
      try {
        // Busca eventos críticos e de erro nos logs de Sistema
        // Últimos 30 dias: erros/críticos do Sistema + travamentos de aplicativos + lista de minidumps
        const psCommand = `
          $ErrorActionPreference = 'SilentlyContinue'
          $since = (Get-Date).AddDays(-30)
          $system = @(Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2; StartTime=$since} -MaxEvents 60)
          $apps = @(Get-WinEvent -FilterHashtable @{LogName='Application'; Id=1000,1002; StartTime=$since} -MaxEvents 20)
          $dumps = @(Get-ChildItem "$env:SystemRoot\\Minidump\\*.dmp" | Sort-Object LastWriteTime -Descending | Select-Object -First 10 Name, Length, LastWriteTime)
          [PSCustomObject]@{
            events = @(($system + $apps) | Sort-Object TimeCreated -Descending | Select-Object TimeCreated, Id, ProviderName, LevelDisplayName, Message)
            minidumps = $dumps
          } | ConvertTo-Json -Depth 3 -Compress
        `;

        const res = await runPowerShell(psCommand, 25000);
        if (res.success && res.data) {
          const list = Array.isArray(res.data.events) ? res.data.events : (res.data.events ? [res.data.events] : []);
          events = list.map(ev => this.analyzeEvent(ev, encyclopedia));
          const dumps = Array.isArray(res.data.minidumps) ? res.data.minidumps : (res.data.minidumps ? [res.data.minidumps] : []);
          minidumps = dumps.map(d => ({
            name: d.Name,
            sizeKb: Math.round((d.Length || 0) / 1024),
            date: this.formatDate(d.LastWriteTime)
          }));
          readOk = true;
        }
      } catch (err) {
        console.warn('[LogsService] Erro ao consultar Get-WinEvent:', err.message);
      }
    }

    // Agrupa eventos repetidos (mesmo ID e fonte) para não poluir a lista
    const grouped = [];
    const byKey = new Map();
    for (const ev of events) {
      const key = ev.id + '|' + ev.provider;
      if (byKey.has(key)) {
        byKey.get(key).occurrences += 1;
      } else {
        const item = { ...ev, occurrences: 1 };
        byKey.set(key, item);
        grouped.push(item);
      }
    }
    const severityOrder = { 'Crítica': 0, 'Alta': 1, 'Média': 2, 'Baixa': 3 };
    grouped.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

    return {
      timestamp: new Date().toISOString(),
      readAvailable: readOk,
      message: readOk ? (grouped.length ? null : 'Nenhum erro relevante nos últimos 30 dias.') : 'Não foi possível ler o Visualizador de Eventos (requer Windows).',
      periodDays: 30,
      minidumps,
      bsodCount: events.filter(e => e.id === '1001' && e.isBsodOrKernelPower).length,
      unexpectedShutdowns: events.filter(e => e.id === '41').length,
      totalEvents: events.length,
      events: grouped,
      hasCritical: events.some(e => e.severity === 'Crítica' || e.severity === 'Alta'),
      events
    };
  }

  analyzeEvent(raw, encyclopedia) {
    const id = String(raw.Id || '');
    const provider = (raw.ProviderName || 'Windows System').trim();
    const rawMessage = (raw.Message || '').trim();
    const dateStr = this.formatDate(raw.TimeCreated);

    let title = `Evento ID ${id} (${provider})`;
    let diagnosis = 'Registro de instabilidade ou advertência do sistema operacional.';
    let recommendation = 'Acompanhe se o evento se repete com frequência durante jogos ou tarefas pesadas.';
    let severity = 'Média';
    let isBsodOrKernelPower = false;

    // Detecção específica de Kernel-Power (ID 41 - Desligamento abrupto)
    if (id === '41' || provider.toLowerCase().includes('kernel-power')) {
      isBsodOrKernelPower = true;
      title = 'Kernel-Power (Desligamento Repentino / Queda de Energia)';
      diagnosis = 'O computador foi desligado ou reiniciado sem o encerramento correto do Windows. Isso acontece por queda de luz, estabilizador/nobreak desarmando, botão power pressionado ou corte de energia da fonte por proteção térmica.';
      recommendation = '1. Verifique se o cabo de energia está bem encaixado na fonte e na tomada.\n2. Evite usar estabilizadores antigos; use filtro de linha de qualidade (ex: Clamper).\n3. Se ocorrer durante jogos pesados, a fonte pode não estar suprindo a potência exigida pela placa de vídeo.';
      severity = 'Alta';
    } 
    // Detecção de BugCheck (ID 1001 - Tela Azul gravada em Minidump)
    else if (id === '1001' || provider.toLowerCase().includes('bugcheck')) {
      isBsodOrKernelPower = true;
      title = 'BugCheck (Registro Oficial de Tela Azul - BSOD)';
      
      // Procura códigos hexadecimais no texto (ex: 0x0000009f, 0x000000d1, etc)
      const matchedCode = encyclopedia.find(entry => rawMessage.toLowerCase().includes(entry.code.toLowerCase()));
      if (matchedCode) {
        title = `Tela Azul: ${matchedCode.name} (${matchedCode.code})`;
        diagnosis = matchedCode.cause;
        recommendation = matchedCode.recommendation;
        severity = matchedCode.severity;
      } else {
        diagnosis = 'O Windows registrou um despejo de memória (minidump) causado por uma parada fatal (Tela Azul).';
        recommendation = 'Atualize todos os drivers do computador e execute uma checagem de integridade de arquivos com "sfc /scannow" como administrador.';
        severity = 'Crítica';
      }
    }
    // Travamento / encerramento de aplicativo (log Application)
    else if (id === '1000' || id === '1002') {
      const appMatch = rawMessage.match(/^[^:\n]*:\s*([^\s,]+\.exe)/i) || rawMessage.match(/([\w.-]+\.exe)/i);
      const appName = appMatch ? appMatch[1] : 'aplicativo';
      title = id === '1000' ? `Falha de aplicativo: ${appName}` : `Aplicativo parou de responder: ${appName}`;
      diagnosis = id === '1000'
        ? 'O programa fechou sozinho por um erro interno (crash). Pode ser bug do próprio programa, runtime ausente ou driver de vídeo.'
        : 'O programa travou e o Windows o encerrou (Application Hang).';
      recommendation = 'Atualize o programa, instale os Visual C++ Redistributable e o driver de vídeo mais recente. Se acontecer só em jogos, teste sem overclock.';
      severity = 'Média';
    }
    // Disco com setores defeituosos / falhas de E/S
    else if (/^(7|51|153|129)$/.test(id) && /disk|stor|nvme/i.test(provider)) {
      title = 'Erro de leitura/escrita no disco';
      diagnosis = 'O Windows registrou falha de comunicação com uma unidade de armazenamento. Pode indicar cabo SATA ruim, setores defeituosos ou SSD com problema.';
      recommendation = 'Faça backup dos seus arquivos, verifique a saúde do disco (aba Specs) e rode "chkdsk /f" no Prompt como administrador.';
      severity = 'Alta';
    }
    // WHEA — erro de hardware reportado pelo processador
    else if (provider.toLowerCase().includes('whea')) {
      title = 'Erro de hardware (WHEA)';
      diagnosis = 'O processador ou o barramento PCIe reportou um erro de hardware. Comum com overclock/undervolt instável, XMP agressivo ou fonte insuficiente.';
      recommendation = 'Desative overclock/XMP para testar, atualize a BIOS e verifique temperaturas.';
      severity = 'Alta';
    }
    // Erros de Hardware HAL (ACPI / Relógio / Barramento)
    else if (provider.toLowerCase().includes('hal') || id === '21') {
      title = 'Alerta de Sincronização de Hardware (HAL ACPI)';
      diagnosis = 'Falha momentânea na comunicação entre a BIOS/placa-mãe e o relógio de tempo real do Windows durante a inicialização rápida.';
      recommendation = 'Atualizar a BIOS da placa-mãe para a versão estável mais recente e desativar a "Inicialização Rápida" no Painel de Controle de Energia.';
      severity = 'Média';
    }
    // DCOM / Serviços do Windows
    else if (provider.toLowerCase().includes('distributedcom') || id === '10010' || id === '10016') {
      title = 'Tempo Limite em Serviço DCOM';
      diagnosis = 'Um serviço em segundo plano do Windows demorou mais que o esperado para responder. Não causa tela azul nem instabilidade séria.';
      recommendation = 'Comportamento comum do Windows. Nenhuma ação urgente é necessária.';
      severity = 'Baixa';
    }

    return {
      id,
      date: dateStr,
      provider,
      title,
      diagnosis,
      recommendation,
      severity,
      isBsodOrKernelPower,
      originalSnippet: rawMessage.length > 250 ? rawMessage.substring(0, 250) + '...' : rawMessage
    };
  }

  formatDate(value) {
    if (!value) return 'Data desconhecida';
    if (typeof value === 'object') value = value.value || value.DateTime;
    const m = String(value).match(/\/Date\((-?\d+)/);
    const d = m ? new Date(Number(m[1])) : new Date(value);
    return isNaN(d.getTime()) ? 'Data desconhecida' : d.toLocaleString('pt-BR');
  }
}

module.exports = new LogsService();
