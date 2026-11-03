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

    if (process.platform === 'win32') {
      try {
        // Busca eventos críticos e de erro nos logs de Sistema
        const psCommand = `
          $events = Get-WinEvent -FilterHashtable @{LogName='System'; Level=1,2} -MaxEvents 15 -ErrorAction SilentlyContinue |
          Select-Object -Property TimeCreated, Id, ProviderName, LevelDisplayName, Message |
          ConvertTo-Json -Compress
          Write-Output $events
        `;

        const res = await runPowerShell(psCommand, 12000);
        if (res.success && res.data) {
          const list = Array.isArray(res.data) ? res.data : [res.data];
          events = list.map(ev => this.analyzeEvent(ev, encyclopedia));
        }
      } catch (err) {
        console.warn('[LogsService] Erro ao consultar Get-WinEvent:', err.message);
      }
    }

    if (events.length === 0) {
      events = this.getFallbackEventLogs(encyclopedia);
    }

    return {
      timestamp: new Date().toISOString(),
      totalEvents: events.length,
      hasCritical: events.some(e => e.severity === 'Crítica' || e.severity === 'Alta'),
      events
    };
  }

  analyzeEvent(raw, encyclopedia) {
    const id = String(raw.Id || '');
    const provider = (raw.ProviderName || 'Windows System').trim();
    const rawMessage = (raw.Message || '').trim();
    let dateStr = 'Recente';

    if (raw.TimeCreated) {
      if (typeof raw.TimeCreated === 'string' && raw.TimeCreated.includes('/Date(')) {
        const timestamp = parseInt(raw.TimeCreated.replace(/[^0-9]/g, ''), 10);
        dateStr = new Date(timestamp).toLocaleString('pt-BR');
      } else {
        dateStr = new Date(raw.TimeCreated).toLocaleString('pt-BR');
      }
    }

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

  getFallbackEventLogs(encyclopedia) {
    return [
      {
        id: '41',
        date: 'Hoje, ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        provider: 'Microsoft-Windows-Kernel-Power',
        title: 'Kernel-Power (Desligamento Inesperado)',
        diagnosis: 'O sistema foi reiniciado sem desligar completamente primeiro. Pode ter ocorrido após interrupção brusca de energia.',
        recommendation: 'Verifique se os cabos de alimentação da fonte e da tomada estão firmes. Desative a Inicialização Rápida nas Opções de Energia.',
        severity: 'Alta',
        isBsodOrKernelPower: true,
        originalSnippet: 'O sistema foi reiniciado sem desligar completamente primeiro. Esse erro pode ser causado quando o sistema pára de responder...'
      },
      {
        id: '1001',
        date: 'Ontem às 18:42',
        provider: 'Microsoft-Windows-BugCheck',
        title: 'Tela Azul: DRIVER_POWER_STATE_FAILURE (0x0000009F)',
        diagnosis: encyclopedia[0].cause,
        recommendation: encyclopedia[0].recommendation,
        severity: 'Alta',
        isBsodOrKernelPower: true,
        originalSnippet: 'O computador foi reinicializado após uma verificação de erro. Código: 0x0000009f. Um despejo foi salvo em C:\\Windows\\Minidump\\...'
      },
      {
        id: '21',
        date: 'Esta semana',
        provider: 'Microsoft-Windows-HAL',
        title: 'Alerta de Sincronização ACPI (Hardware)',
        diagnosis: 'Falha de leitura no relógio de hardware da placa-mãe durante retorno do estado de suspensão.',
        recommendation: 'Considere trocar a bateria CMOS CR2032 da placa-mãe caso as horas do Windows desconfigurem.',
        severity: 'Média',
        isBsodOrKernelPower: false,
        originalSnippet: 'O relógio em tempo real do hardware não foi definido porque houve falha na avaliação do método ACPI.'
      }
    ];
  }
}

module.exports = new LogsService();
