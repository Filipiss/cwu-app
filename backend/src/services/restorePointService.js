// backend/src/services/restorePointService.js
// Cria um ponto de restauração do Windows antes de alterações de sistema.
// Limitações do próprio Windows: exige administrador, Proteção do Sistema ativa
// no disco C: e, por padrão, no máximo um ponto a cada 24 h.
const { runPowerShell } = require('../utils/powershell');

const SCRIPT = (description) => `
$ErrorActionPreference = 'SilentlyContinue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$before = Get-ComputerRestorePoint | Sort-Object SequenceNumber | Select-Object -Last 1
$err = $null
if ($isAdmin) {
  try { Checkpoint-Computer -Description '${description}' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop -WarningAction SilentlyContinue }
  catch { $err = $_.Exception.Message }
}
$after = Get-ComputerRestorePoint | Sort-Object SequenceNumber | Select-Object -Last 1
[PSCustomObject]@{
  isAdmin = $isAdmin
  created = ($after -and (-not $before -or $after.SequenceNumber -ne $before.SequenceNumber))
  lastDescription = $after.Description
  lastDate = if ($after) { $after.ConvertToDateTime($after.CreationTime).ToString('o') } else { $null }
  error = $err
} | ConvertTo-Json -Compress
`;

class RestorePointService {
  constructor() {
    this.sessionResult = null; // um ponto por sessão do app é suficiente
  }

  async create(reason = 'Alterações do CWU App') {
    if (process.platform !== 'win32') {
      return { ok: false, created: false, message: 'Pontos de restauração existem apenas no Windows.' };
    }
    // Só letras, números e espaços na descrição (vai dentro do script)
    const description = ('CWU App - ' + reason).replace(/[^\p{L}\p{N} .\-]/gu, '').slice(0, 60);
    const res = await runPowerShell(SCRIPT(description), 180000);
    const d = res.success && res.data ? res.data : null;

    if (!d) return { ok: false, created: false, message: 'Não foi possível consultar a Restauração do Sistema.' };
    if (!d.isAdmin) return { ok: false, created: false, needsAdmin: true, message: 'Ponto de restauração não criado: execute o CWU App como administrador.' };
    if (d.created) return { ok: true, created: true, message: 'Ponto de restauração criado.', date: d.lastDate };

    // Sem novo ponto: ou já existe um recente (limite de 24 h) ou a proteção está desligada
    const recentMs = d.lastDate ? Date.now() - new Date(d.lastDate).getTime() : Infinity;
    if (recentMs < 24 * 3600 * 1000) {
      return { ok: true, created: false, message: `Já existe um ponto de restauração recente (${new Date(d.lastDate).toLocaleString('pt-BR')}).`, date: d.lastDate };
    }
    return {
      ok: false,
      created: false,
      message: 'Não foi possível criar o ponto de restauração. Verifique se a Proteção do Sistema está ativada no disco C: (Painel de Controle › Sistema › Proteção do Sistema).',
      error: d.error
    };
  }

  // Usado antes da primeira alteração de sistema de cada sessão
  async ensureForSession(reason) {
    if (this.sessionResult && this.sessionResult.ok) return { ...this.sessionResult, reused: true };
    this.sessionResult = await this.create(reason);
    return this.sessionResult;
  }
}

module.exports = new RestorePointService();
