// backend/src/services/cleanupService.js
// Limpeza de disco: mede e apaga só pastas conhecidas que o Windows, os drivers ou os
// programas recriam sozinhos (caches, temporários, downloads já instalados).
// Nada fora desta lista é tocado, e os ids pedidos pela API são validados contra ela.
// Primeiro mede (analyze), depois apaga o que o usuário marcou (clean).
const { runPowerShell } = require('../utils/powershell');
const db = require('../database/db');

// paths: expressões do PowerShell (expandidas lá, com as variáveis de ambiente do usuário)
const CATEGORIES = {
  nvidia_shader: {
    title: 'Cache de shaders da NVIDIA',
    description: 'Shaders já compilados pelos jogos. O driver recria o cache: nos primeiros minutos de cada jogo pode haver pequenas travadas enquanto ele é refeito.',
    kind: 'files', needsAdmin: false, checked: true,
    paths: ['$env:LOCALAPPDATA\\NVIDIA\\DXCache', '$env:LOCALAPPDATA\\NVIDIA\\GLCache', '$env:ProgramData\\NVIDIA Corporation\\NV_Cache']
  },
  amd_shader: {
    title: 'Cache de shaders da AMD',
    description: 'Shaders já compilados pelos jogos. O driver recria o cache: nos primeiros minutos de cada jogo pode haver pequenas travadas enquanto ele é refeito.',
    kind: 'files', needsAdmin: false, checked: true,
    paths: ['$env:LOCALAPPDATA\\AMD\\DxCache', '$env:LOCALAPPDATA\\AMD\\DxcCache', '$env:LOCALAPPDATA\\AMD\\VkCache', '$env:LOCALAPPDATA\\AMD\\GLCache']
  },
  intel_shader: {
    title: 'Cache de shaders da Intel',
    description: 'Shaders já compilados pelos jogos. O driver recria o cache quando precisar.',
    kind: 'files', needsAdmin: false, checked: true,
    paths: ['$env:LOCALAPPDATA\\Intel\\ShaderCache']
  },
  d3d_shader: {
    title: 'Cache de shaders do DirectX',
    description: 'Cache do próprio Windows para shaders de jogos e apps. É recriado sozinho.',
    kind: 'files', needsAdmin: false, checked: true,
    paths: ['$env:LOCALAPPDATA\\D3DSCache']
  },
  crash_dumps: {
    title: 'Despejos de travamento de programas',
    description: 'Cópias da memória salvas quando um programa trava. Só servem para desenvolvedores investigarem o erro.',
    kind: 'files', needsAdmin: false, checked: true,
    paths: ['$env:LOCALAPPDATA\\CrashDumps']
  },
  user_temp: {
    title: 'Arquivos temporários do usuário',
    description: 'Pasta %TEMP%. Arquivos em uso por programas abertos são mantidos.',
    kind: 'files', needsAdmin: false, checked: true,
    paths: ['$env:TEMP']
  },
  windows_temp: {
    title: 'Arquivos temporários do Windows',
    description: 'Pasta Temp do Windows. Arquivos em uso são mantidos.',
    kind: 'files', needsAdmin: true, checked: true,
    paths: ['$env:SystemRoot\\Temp']
  },
  wu_cache: {
    title: 'Downloads do Windows Update',
    description: 'Instaladores de atualizações já baixados. Se alguma atualização ainda estiver pendente, o Windows baixa de novo.',
    kind: 'files', needsAdmin: true, checked: true,
    paths: ['$env:SystemRoot\\SoftwareDistribution\\Download']
  },
  delivery_opt: {
    title: 'Cache da Otimização de Entrega',
    description: 'Pedaços de atualizações guardados para compartilhar com outros PCs. Não faz falta para o seu PC.',
    kind: 'delivery', needsAdmin: true, checked: true,
    paths: ['$env:SystemRoot\\ServiceProfiles\\NetworkService\\AppData\\Local\\Microsoft\\Windows\\DeliveryOptimization\\Cache']
  },
  error_reports: {
    title: 'Relatórios de erro do Windows',
    description: 'Relatórios de travamentos já enviados ou na fila para a Microsoft. Os erros continuam aparecendo em Logs › Erros do Windows.',
    kind: 'files', needsAdmin: true, checked: true,
    paths: ['$env:ProgramData\\Microsoft\\Windows\\WER\\ReportArchive', '$env:ProgramData\\Microsoft\\Windows\\WER\\ReportQueue', '$env:ProgramData\\Microsoft\\Windows\\WER\\Temp']
  },
  recycle_bin: {
    title: 'Lixeira',
    description: 'Esvazia a Lixeira de todas as unidades. Depois não dá para recuperar os arquivos.',
    kind: 'recycle', needsAdmin: false, checked: false, irreversible: true
  },
  hibernation: {
    title: 'Arquivo de hibernação',
    description: '',
    kind: 'hibernation', needsAdmin: true, checked: false
  },
  windows_old: {
    title: 'Instalação anterior do Windows (Windows.old)',
    description: 'Cópia da versão anterior do Windows, guardada depois de uma atualização grande. Depois de apagar, não dá mais para voltar para a versão anterior.',
    kind: 'previous', needsAdmin: true, checked: false, irreversible: true
  }
};

const HIBERNATION_TEXT = {
  off: {
    title: 'Arquivo de hibernação (sem uso)',
    description: 'A inicialização rápida está desligada, então este arquivo só serve para a opção "Hibernar" do menu Iniciar. Desligar a hibernação apaga o arquivo inteiro. Para ligar a inicialização rápida depois, use Performance › Ajustes (ela recria um arquivo reduzido).'
  },
  reduce: {
    title: 'Arquivo de hibernação (tipo completo)',
    description: 'A inicialização rápida está ligada e usa só uma parte deste arquivo. Mudar para o tipo reduzido corta o arquivo pela metade e mantém a inicialização rápida, mas tira a opção "Hibernar" do menu Iniciar.'
  }
};

const psList = (paths) => '@(' + paths.map(p => `"${p}"`).join(', ') + ')';

const COMMON = `
$ErrorActionPreference = 'SilentlyContinue'
function Measure-Paths($paths) {
  $t = [int64]0
  foreach ($p in $paths) { if (Test-Path -LiteralPath $p) { $t += [int64](Get-ChildItem -LiteralPath $p -Recurse -Force -File | Measure-Object Length -Sum).Sum } }
  $t
}
function Recycle-Paths() {
  @(Get-Volume | Where-Object { $_.DriveLetter -and $_.DriveType -eq 'Fixed' } | ForEach-Object { "$($_.DriveLetter):\\\`$Recycle.Bin" })
}
function Hiber-Bytes() {
  # O hiberfil.sys fica bloqueado pelo sistema: o tamanho vem da listagem da pasta, não do arquivo
  $h = Get-ChildItem -LiteralPath "$env:SystemDrive\\" -Force -File -Filter 'hiberfil.sys' | Select-Object -First 1
  if ($h) { [int64]$h.Length } else { [int64]0 }
}
`;

function measureExpr(id) {
  const c = CATEGORIES[id];
  if (c.kind === 'files' || c.kind === 'delivery') return `Measure-Paths ${psList(c.paths)}`;
  if (c.kind === 'recycle') return 'Measure-Paths (Recycle-Paths)';
  if (c.kind === 'hibernation') return 'Hiber-Bytes';
  if (c.kind === 'previous') return 'Measure-Paths @("$env:SystemDrive\\Windows.old")';
  return '[int64]0';
}

function analyzeScript() {
  const lines = Object.keys(CATEGORIES).map(id => `  ${id} = ${measureExpr(id)}`).join('\n');
  return `${COMMON}
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$power = Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Power'
[PSCustomObject]@{
  isAdmin = $isAdmin
  hiberboot = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power').HiberbootEnabled
  hiberFileType = $power.HiberFileType
  windowsOld = (Test-Path -LiteralPath "$env:SystemDrive\\Windows.old")
  bytes = [PSCustomObject]@{
${lines}
  }
} | ConvertTo-Json -Depth 4 -Compress
`;
}

/** O que fazer com o arquivo de hibernação (pura): 'off', 'reduce' ou null (nada a oferecer). */
function hibernationAction(raw) {
  const bytes = Number(raw && raw.bytes && raw.bytes.hibernation) || 0;
  if (bytes <= 0) return null;
  if (raw.hiberboot !== 1) return 'off';
  // HiberFileType: 2 = completo, 1 = reduzido
  if (raw.hiberFileType === 2) return 'reduce';
  return null;
}

/** Monta a lista mostrada ao usuário a partir da medição (pura, testável). */
function buildItems(raw) {
  const isAdmin = Boolean(raw && raw.isAdmin);
  const bytes = (raw && raw.bytes) || {};
  const hiber = hibernationAction(raw || {});
  const MIN_BYTES = 1024 * 1024; // menos de 1 MB não vale mostrar
  const items = [];
  for (const [id, c] of Object.entries(CATEGORIES)) {
    let size = Number(bytes[id]) || 0;
    let { title, description } = c;
    if (id === 'hibernation') {
      if (!hiber) continue;
      ({ title, description } = HIBERNATION_TEXT[hiber]);
      if (hiber === 'reduce') size = Math.round(size / 2); // o tipo reduzido tem cerca de metade do tamanho
    } else if (id === 'windows_old') {
      if (!raw || !raw.windowsOld) continue;
    } else if (size < MIN_BYTES && !(c.needsAdmin && !isAdmin)) {
      continue;
    }
    // Sem administrador, as pastas do sistema não podem nem ser medidas direito
    const blocked = c.needsAdmin && !isAdmin;
    items.push({
      id, title, description,
      bytes: blocked && size < MIN_BYTES ? null : size,
      needsAdmin: c.needsAdmin,
      blocked,
      irreversible: Boolean(c.irreversible),
      checked: c.checked && !blocked
    });
  }
  // Os itens que dá para limpar agora primeiro, do maior para o menor
  items.sort((a, b) => (a.blocked - b.blocked) || ((b.bytes || 0) - (a.bytes || 0)));
  return { isAdmin, items, totalBytes: items.filter(i => !i.blocked).reduce((s, i) => s + (i.bytes || 0), 0) };
}

/** Só ids conhecidos, sem repetição (pura). */
function validateIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter(id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(CATEGORIES, id)))];
}

function cleanCommand(id, hiber) {
  const c = CATEGORIES[id];
  if (c.kind === 'files') {
    return `foreach ($p in ${psList(c.paths)}) { if (Test-Path -LiteralPath $p) { Get-ChildItem -LiteralPath $p -Force | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force } } }`;
  }
  if (c.kind === 'delivery') {
    return `if (Get-Command Delete-DeliveryOptimizationCache) { Delete-DeliveryOptimizationCache -Force } else { foreach ($p in ${psList(c.paths)}) { Get-ChildItem -LiteralPath $p -Force | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force } } }`;
  }
  if (c.kind === 'recycle') return 'Clear-RecycleBin -Force';
  if (c.kind === 'hibernation') return hiber === 'reduce' ? 'powercfg /h /type reduced | Out-Null' : 'powercfg /hibernate off | Out-Null';
  if (c.kind === 'previous') {
    // Usa o próprio Limpeza de Disco do Windows ("Instalações anteriores do Windows"), que tem permissão sobre a pasta
    return `$k = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VolumeCaches\\Previous Installations'
if (Test-Path $k) {
  New-ItemProperty $k -Name StateFlags0077 -Value 2 -PropertyType DWord -Force | Out-Null
  Start-Process cleanmgr.exe -ArgumentList '/sagerun:77' -Wait -WindowStyle Hidden
  Remove-ItemProperty $k -Name StateFlags0077
}`;
  }
  return '';
}

const fmtGb = (b) => `${(b / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;

class CleanupService {
  async analyze() {
    if (process.platform !== 'win32') return { available: false, message: 'Disponível apenas no Windows.', items: [] };
    const res = await runPowerShell(analyzeScript(), 180000);
    if (!res.success || !res.data) return { available: false, message: 'Não foi possível medir as pastas.', items: [] };
    return { available: true, ...buildItems(res.data) };
  }

  async clean({ ids } = {}) {
    if (process.platform !== 'win32') return { success: false, message: 'Disponível apenas no Windows.' };
    const wanted = validateIds(ids);
    if (!wanted.length) return { success: false, message: 'Nenhum item válido selecionado.' };

    // Mede de novo na hora: decide a ação da hibernação e confere o administrador
    const before = await runPowerShell(analyzeScript(), 180000);
    if (!before.success || !before.data) return { success: false, message: 'Não foi possível medir as pastas.' };
    const isAdmin = Boolean(before.data.isAdmin);
    const hiber = hibernationAction(before.data);
    const run = wanted.filter(id => (!CATEGORIES[id].needsAdmin || isAdmin) && (id !== 'hibernation' || hiber) && (id !== 'windows_old' || before.data.windowsOld));
    const skippedAdmin = wanted.filter(id => CATEGORIES[id].needsAdmin && !isAdmin);
    if (!run.length) {
      return { success: false, needsAdmin: skippedAdmin.length > 0, message: skippedAdmin.length ? 'Os itens escolhidos exigem administrador.' : 'Nada para limpar.' };
    }

    const script = `${COMMON}
$out = [ordered]@{}
${run.map(id => `try { $null = & { ${cleanCommand(id, hiber)} } } catch {}
$out['${id}'] = ${measureExpr(id)}`).join('\n')}
[PSCustomObject]$out | ConvertTo-Json -Compress
`;
    const res = await runPowerShell(script, 30 * 60 * 1000);
    if (!res.success || !res.data) return { success: false, message: 'A limpeza não terminou: ' + (res.error || 'sem resposta do PowerShell') };

    const results = run.map(id => {
      const prev = Number(before.data.bytes[id]) || 0;
      const now = Number(res.data[id]) || 0;
      return { id, title: CATEGORIES[id].title, freedBytes: Math.max(0, prev - now), remainingBytes: now };
    });
    const freed = results.reduce((s, r) => s + r.freedBytes, 0);
    const kept = results.filter(r => r.remainingBytes > 1024 * 1024 && CATEGORIES[r.id].kind === 'files');

    db.addUpdateLog({
      type: 'cleanup',
      title: `Limpeza de disco: ${fmtGb(freed)} liberados`,
      category: 'Limpeza de disco',
      details: results.map(r => `${r.title}: ${fmtGb(r.freedBytes)}`).join(' • ')
    });

    let message = `Limpeza concluída: ${fmtGb(freed)} liberados.`;
    if (kept.length) message += ' Alguns arquivos estavam em uso e foram mantidos (feche jogos e programas e limpe de novo para tirar o resto).';
    if (skippedAdmin.length) message += ` ${skippedAdmin.length} item(ns) exigem administrador e não foram limpos.`;
    return { success: true, freedBytes: freed, results, needsAdmin: skippedAdmin.length > 0, message };
  }
}

module.exports = new CleanupService();
module.exports.CATEGORIES = CATEGORIES;
module.exports.buildItems = buildItems;
module.exports.hibernationAction = hibernationAction;
module.exports.validateIds = validateIds;
module.exports.analyzeScript = analyzeScript;
