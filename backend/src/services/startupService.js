// backend/src/services/startupService.js
// Programas que iniciam com o Windows. Ativa/desativa pelo mesmo mecanismo do
// Gerenciador de Tarefas (Explorer\StartupApproved): nada é apagado, só marcado.
const { runPowerShell } = require('../utils/powershell');
const db = require('../database/db');

const APPROVED = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved';

// Cada origem e a chave StartupApproved correspondente
const SOURCES = {
  hkcu_run: { label: 'Registro (usuário)', hive: 'HKCU', approved: `HKCU:\\${APPROVED}\\Run`, needsAdmin: false },
  hklm_run: { label: 'Registro (todos os usuários)', hive: 'HKLM', approved: `HKLM:\\${APPROVED}\\Run`, needsAdmin: true },
  hklm_run32: { label: 'Registro 32 bits (todos)', hive: 'HKLM', approved: `HKLM:\\${APPROVED}\\Run32`, needsAdmin: true },
  user_folder: { label: 'Pasta Inicializar (usuário)', hive: 'HKCU', approved: `HKCU:\\${APPROVED}\\StartupFolder`, needsAdmin: false },
  common_folder: { label: 'Pasta Inicializar (todos)', hive: 'HKLM', approved: `HKLM:\\${APPROVED}\\StartupFolder`, needsAdmin: true }
};

const LIST_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
function Get-Approved($path, $name) {
  $v = (Get-ItemProperty -Path $path -Name $name).$name
  if ($v -is [byte[]] -and $v.Length -gt 0) { return [int]$v[0] } else { return $null }
}
function Read-Run($source, $path, $approved) {
  $p = Get-ItemProperty -Path $path
  if (-not $p) { return }
  $p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
    [PSCustomObject]@{ source = $source; name = $_.Name; command = [string]$_.Value; flag = (Get-Approved $approved $_.Name) }
  }
}
function Read-Folder($source, $folder, $approved) {
  Get-ChildItem -Path $folder -File | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object {
    [PSCustomObject]@{ source = $source; name = $_.Name; command = $_.FullName; flag = (Get-Approved $approved $_.Name) }
  }
}
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$items = @()
$items += Read-Run 'hkcu_run' 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' '${SOURCES.hkcu_run.approved}'
$items += Read-Run 'hklm_run' 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' '${SOURCES.hklm_run.approved}'
$items += Read-Run 'hklm_run32' 'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run' '${SOURCES.hklm_run32.approved}'
$items += Read-Folder 'user_folder' ([Environment]::GetFolderPath('Startup')) '${SOURCES.user_folder.approved}'
$items += Read-Folder 'common_folder' ([Environment]::GetFolderPath('CommonStartup')) '${SOURCES.common_folder.approved}'
[PSCustomObject]@{ isAdmin = $isAdmin; items = @($items) } | ConvertTo-Json -Depth 3 -Compress
`;

const makeId = (source, name) => Buffer.from(`${source}|${name}`, 'utf8').toString('base64');

// Primeiro byte do valor StartupApproved: bit 0 ligado = desativado (0x03, 0x07…)
const isEnabledFlag = (flag) => flag === null || flag === undefined || (flag & 1) === 0;

// Extrai o executável do comando para exibir algo legível
function exeFromCommand(command) {
  if (!command) return '';
  const quoted = command.match(/^"([^"]+)"/);
  const path = quoted ? quoted[1] : command.split(/\s+-|\s+\//)[0].trim();
  return path.split('\\').pop();
}

class StartupService {
  async list() {
    if (process.platform !== 'win32') {
      return { available: false, message: 'Disponível apenas no Windows.', items: [] };
    }
    const res = await runPowerShell(LIST_SCRIPT, 20000);
    if (!res.success || !res.data) {
      return { available: false, message: 'Não foi possível ler os programas de inicialização.', items: [] };
    }
    const raw = Array.isArray(res.data.items) ? res.data.items : (res.data.items ? [res.data.items] : []);
    const items = raw.filter(i => i && i.name && SOURCES[i.source]).map(i => ({
      id: makeId(i.source, i.name),
      name: i.name.replace(/\.lnk$/i, ''),
      rawName: i.name,
      source: i.source,
      sourceLabel: SOURCES[i.source].label,
      command: i.command,
      exe: exeFromCommand(i.command),
      enabled: isEnabledFlag(i.flag),
      needsAdmin: SOURCES[i.source].needsAdmin
    })).sort((a, b) => (b.enabled - a.enabled) || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

    return {
      available: true,
      isAdmin: Boolean(res.data.isAdmin),
      enabledCount: items.filter(i => i.enabled).length,
      items
    };
  }

  async toggle({ id, enabled }) {
    if (process.platform !== 'win32') return { success: false, message: 'Disponível apenas no Windows.' };
    if (typeof id !== 'string' || typeof enabled !== 'boolean') return { success: false, message: 'Parâmetros inválidos.' };

    // Só aceita itens que existem de verdade na lista atual (o id não é confiável sozinho)
    const current = await this.list();
    const item = current.items.find(i => i.id === id);
    if (!item) return { success: false, message: 'Programa de inicialização não encontrado (atualize a lista).' };
    if (item.needsAdmin && !current.isAdmin) {
      return { success: false, needsAdmin: true, message: `"${item.name}" vale para todos os usuários: abra o CWU App como administrador para alterar.` };
    }

    const nameB64 = Buffer.from(item.rawName, 'utf8').toString('base64');
    const script = `
$ErrorActionPreference = 'Stop'
$name = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${nameB64}'))
$path = '${SOURCES[item.source].approved}'
try {
  if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
  if (${enabled ? '$true' : '$false'}) {
    $bytes = [byte[]](2,0,0,0,0,0,0,0,0,0,0,0)
  } else {
    $bytes = [byte[]](3,0,0,0) + [BitConverter]::GetBytes([DateTime]::Now.ToFileTime())
  }
  New-ItemProperty -Path $path -Name $name -Value $bytes -PropertyType Binary -Force | Out-Null
  [PSCustomObject]@{ ok = $true } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
    const res = await runPowerShell(script, 15000);
    const d = res.success && res.data ? res.data : null;
    if (!d || !d.ok) return { success: false, message: 'Falha ao alterar: ' + ((d && d.error) || res.error || 'sem resposta') };

    db.addUpdateLog({
      type: 'startup',
      title: `${enabled ? 'Ativado' : 'Desativado'} na inicialização: ${item.name}`,
      category: 'Inicialização do Windows',
      details: `${item.sourceLabel} • ${item.command}`,
      startupId: item.id,
      startupEnabled: enabled
    });

    return {
      success: true,
      message: enabled
        ? `"${item.name}" voltará a abrir com o Windows.`
        : `"${item.name}" não abrirá mais com o Windows (vale a partir do próximo login).`
    };
  }
}

module.exports = new StartupService();
module.exports.isEnabledFlag = isEnabledFlag;
module.exports.exeFromCommand = exeFromCommand;
