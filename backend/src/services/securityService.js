// backend/src/services/securityService.js
// Triagem de processos em execução por heurísticas. Não é um antivírus: aponta
// processos com sinais suspeitos e recomenda verificar com um antivírus.
const { runPowerShell } = require('../utils/powershell');

// Processos do Windows e o local/pai esperados
const SYSTEM_BINARIES = {
  svchost: { dirs: ['system32', 'syswow64'], parent: 'services' },
  csrss: { dirs: ['system32'] },
  lsass: { dirs: ['system32'], parent: 'wininit' },
  services: { dirs: ['system32'], parent: 'wininit' },
  wininit: { dirs: ['system32'] },
  winlogon: { dirs: ['system32'] },
  smss: { dirs: ['system32'] },
  explorer: { dirs: ['windows'] },
  taskhostw: { dirs: ['system32'] },
  dllhost: { dirs: ['system32', 'syswow64'] },
  conhost: { dirs: ['system32'] },
  rundll32: { dirs: ['system32', 'syswow64'] },
  spoolsv: { dirs: ['system32'], parent: 'services' },
  dwm: { dirs: ['system32'] },
  ctfmon: { dirs: ['system32', 'syswow64'] },
  sihost: { dirs: ['system32'] },
  runtimebroker: { dirs: ['system32'] },
  searchindexer: { dirs: ['system32'] }
};

const DOC_EXTENSIONS = /\.(pdf|docx?|xlsx?|pptx?|txt|jpe?g|png|gif|mp4|mp3|zip|rar)\.(exe|scr|com|bat|cmd|pif)$/i;

// O que programas com cada sinal costumam fazer (explicação para o usuário)
const BEHAVIORS = {
  disguise: 'Malwares costumam usar o nome de processos do Windows para se esconder no Gerenciador de Tarefas e não levantar suspeita.',
  injection: 'Pode indicar que outro programa abriu ou se injetou nesse processo para agir com as permissões dele.',
  unsigned: 'Programas de empresas conhecidas geralmente têm assinatura digital; malwares quase nunca têm.',
  badSignature: 'Uma assinatura inválida pode significar que o arquivo foi alterado depois de publicado.',
  location: 'Malwares costumam se instalar em pastas temporárias ou do usuário, onde conseguem se gravar sem pedir permissão de administrador.',
  doubleExtension: 'Arquivos com extensão dupla enganam o usuário a abrir um programa achando que é um documento ou imagem.',
  network: 'Pode estar enviando seus dados para fora ou recebendo comandos de um servidor remoto.',
  miner: 'Mineradores de criptomoeda rodam escondidos usando seu processador, deixando o PC lento e mais quente.',
  persistence: 'Malwares costumam se configurar para abrir junto com o Windows e continuar ativos depois de reiniciar.',
  hidden: 'Alguns programas maliciosos se protegem para impedir que sejam inspecionados.'
};

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // Troca de duas letras vizinhas (scvhost × svchost) conta como 1 edição
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  }
  return dp[a.length][b.length];
}

// Normaliza leetspeak simples (svch0st → svchost) antes de comparar
const deLeet = (s) => s.replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/5/g, 's');

/**
 * Analisa a lista bruta de processos e devolve pontuação + motivos legíveis.
 * Pura (sem PowerShell) para poder ser testada.
 */
function analyzeProcesses(processes, env) {
  const lower = (s) => String(s || '').toLowerCase();
  const windir = lower(env.windir || 'c:\\windows');
  const userProfile = lower(env.userProfile);
  const byPid = new Map(processes.map(p => [p.pid, p]));

  const suspiciousDirs = [
    { path: lower(env.temp), label: 'pasta temporária (%TEMP%)' },
    { path: `${windir}\\temp`, label: 'pasta Windows\\Temp' },
    { path: userProfile && `${userProfile}\\downloads`, label: 'pasta Downloads' },
    { path: 'c:\\users\\public', label: 'pasta Pública' },
    { path: 'c:\\$recycle.bin', label: 'Lixeira' },
    { path: 'c:\\perflogs', label: 'pasta PerfLogs' }
  ].filter(d => d.path);
  const appData = lower(env.appData);         // ...\AppData\Roaming
  const localAppData = lower(env.localAppData);
  const programData = 'c:\\programdata';

  return processes.map(p => {
    const name = lower(p.name).replace(/\.exe$/, '');
    const path = lower(p.path);
    const dir = path.includes('\\') ? path.slice(0, path.lastIndexOf('\\')) : '';
    const reasons = [];
    let score = 0;
    const add = (points, text, behavior) => { score += points; reasons.push({ points, text, behavior: BEHAVIORS[behavior] }); };

    const sig = p.signature || {};
    const signed = sig.status === 'Valid';
    const signedByMicrosoft = signed && /microsoft/i.test(sig.signer || '');

    // 1. Disfarce de processo do sistema
    const expected = SYSTEM_BINARIES[name];
    if (expected && path) {
      const okDir = expected.dirs.some(d => d === 'windows' ? dir === windir : dir === `${windir}\\${d}`);
      if (!okDir) add(60, `Tem o nome de um processo do Windows (${name}.exe), mas roda fora da pasta do sistema`, 'disguise');
      if (expected.parent) {
        const parent = byPid.get(p.ppid);
        if (parent && lower(parent.name).replace(/\.exe$/, '') !== expected.parent) {
          add(25, `${name}.exe deveria ser aberto pelo ${expected.parent}.exe, mas foi aberto por ${parent.name}`, 'injection');
        }
      }
      if (okDir && !signedByMicrosoft && sig.status) add(40, 'Processo do sistema sem assinatura válida da Microsoft', 'disguise');
    } else if (name.length >= 4) {
      const lookalike = Object.keys(SYSTEM_BINARIES).find(sys => sys !== name && (levenshtein(deLeet(name), sys) <= 1 || deLeet(name) === sys));
      if (lookalike) add(55, `Nome muito parecido com o processo do Windows "${lookalike}.exe" (possível disfarce)`, 'disguise');
    }

    // 2. Assinatura digital
    if (path) {
      if (sig.status === 'NotSigned') add(20, 'Executável sem assinatura digital', 'unsigned');
      else if (sig.status && !signed && sig.status !== 'UnknownError') add(35, `Assinatura digital inválida (${sig.status})`, 'badSignature');
    }

    // 3. Local de execução
    const inDir = suspiciousDirs.find(d => dir === d.path || dir.startsWith(d.path + '\\'));
    if (inDir) add(30, `Executando a partir da ${inDir.label}`, 'location');
    else if (appData && dir === appData) add(25, 'Executando direto na raiz do AppData\\Roaming (local comum de malware)', 'location');
    else if (dir === programData) add(20, 'Executando direto na raiz do ProgramData', 'location');
    else if (localAppData && dir === localAppData) add(15, 'Executando direto na raiz do AppData\\Local', 'location');

    // 4. Extensão dupla
    if (DOC_EXTENSIONS.test(path)) add(50, 'Extensão dupla (ex.: arquivo.pdf.exe), truque clássico para enganar o usuário', 'doubleExtension');

    // 5. Combinações que aumentam o risco
    if (!signed && sig.status && p.connections > 0) add(15, `Sem assinatura e com ${p.connections} conexão(ões) de rede ativa(s)`, 'network');
    if (!signed && sig.status && p.cpu >= 25 && !p.hasWindow) add(20, `Sem assinatura, sem janela e usando ${Math.round(p.cpu)}% de CPU (padrão de minerador)`, 'miner');
    if (!signed && sig.status && p.inStartup) add(10, 'Sem assinatura e configurado para iniciar com o Windows', 'persistence');
    if (!path && p.pid > 4 && !expected) add(5, 'Não foi possível ler o caminho do executável (processo protegido ou sem permissão)', 'hidden');

    // Assinatura válida de editora conhecida reduz falsos positivos de local
    if (signed && score > 0 && score < 50) score = Math.max(0, score - 15);

    const level = score >= 60 ? 'high' : score >= 30 ? 'medium' : score >= 15 ? 'low' : 'ok';
    return {
      pid: p.pid,
      name: p.name,
      path: p.path || null,
      company: p.company || null,
      description: p.description || null,
      signer: sig.signer || null,
      signatureStatus: sig.status || null,
      connections: p.connections || 0,
      memoryMb: p.memoryMb || 0,
      cpu: p.cpu || 0,
      score,
      level,
      reasons: reasons.sort((a, b) => b.points - a.points).map(r => r.text),
      // Comportamentos típicos (sem repetir) para explicar ao usuário o que esse tipo de programa costuma fazer
      behaviors: [...new Set(reasons.map(r => r.behavior).filter(Boolean))]
    };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

const COLLECT_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$cores = [Environment]::ProcessorCount
# Uso de CPU em uma janela de ~1 s
$t1 = @{}; Get-Process | ForEach-Object { $t1[$_.Id] = $_.TotalProcessorTime.TotalMilliseconds }
Start-Sleep -Milliseconds 1000
$gp = @{}; Get-Process | ForEach-Object { $gp[$_.Id] = $_ }
$conn = @{}; Get-NetTCPConnection -State Established | Where-Object { $_.RemoteAddress -notmatch '^(127\\.|::1|0\\.0\\.0\\.0)' } | Group-Object OwningProcess | ForEach-Object { $conn[[int]$_.Name] = $_.Count }
# Executáveis que iniciam com o Windows (para cruzar com a lista)
$startup = @()
foreach ($k in 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run') {
  $p = Get-ItemProperty $k; if ($p) { $p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { $startup += ([string]$_.Value).ToLower() } }
}
$sigCache = @{}
$list = Get-CimInstance Win32_Process | ForEach-Object {
  $path = $_.ExecutablePath
  $sig = $null
  if ($path) {
    if (-not $sigCache.ContainsKey($path)) {
      $s = Get-AuthenticodeSignature -LiteralPath $path
      $sigCache[$path] = [PSCustomObject]@{ status = [string]$s.Status; signer = $(if ($s.SignerCertificate) { $s.SignerCertificate.GetNameInfo('SimpleName', $false) } else { $null }) }
    }
    $sig = $sigCache[$path]
  }
  $proc = $gp[[int]$_.ProcessId]
  $cpu = 0
  if ($proc -and $t1.ContainsKey($proc.Id)) { $cpu = [math]::Round((($proc.TotalProcessorTime.TotalMilliseconds - $t1[$proc.Id]) / 1000) * 100 / $cores, 1) }
  $vi = $null; if ($path) { $vi = (Get-Item -LiteralPath $path).VersionInfo }
  [PSCustomObject]@{
    pid = [int]$_.ProcessId
    ppid = [int]$_.ParentProcessId
    name = $_.Name
    path = $path
    memoryMb = [math]::Round($_.WorkingSetSize / 1MB)
    cpu = $cpu
    hasWindow = [bool]($proc -and $proc.MainWindowHandle -ne 0)
    connections = [int]$conn[[int]$_.ProcessId]
    inStartup = [bool]($path -and ($startup | Where-Object { $_.Contains($path.ToLower()) }))
    company = $(if ($vi) { $vi.CompanyName } else { $null })
    description = $(if ($vi) { $vi.FileDescription } else { $null })
    signature = $sig
  }
}
$defender = Get-MpComputerStatus
[PSCustomObject]@{
  isAdmin = $isAdmin
  env = [PSCustomObject]@{ windir = $env:windir; temp = $env:TEMP; userProfile = $env:USERPROFILE; appData = $env:APPDATA; localAppData = $env:LOCALAPPDATA }
  defender = $(if ($defender) { [PSCustomObject]@{ enabled = $defender.AntivirusEnabled; realTime = $defender.RealTimeProtectionEnabled; signaturesAge = $defender.AntivirusSignatureAge } } else { $null })
  processes = @($list)
} | ConvertTo-Json -Depth 4 -Compress
`;

class SecurityService {
  constructor() {
    this.lastScan = null; // processos da última varredura (para validar ações por PID)
  }

  async scanProcesses() {
    if (process.platform !== 'win32') return { available: false, message: 'Disponível apenas no Windows.' };
    const res = await runPowerShell(COLLECT_SCRIPT, 120000);
    if (!res.success || !res.data) return { available: false, message: 'Não foi possível ler os processos: ' + (res.error || 'sem resposta') };

    const raw = Array.isArray(res.data.processes) ? res.data.processes : [];
    let results = analyzeProcesses(raw.filter(p => p && p.pid), res.data.env || {});

    this.lastScan = { at: Date.now(), results };
    const count = (lvl) => results.filter(r => r.level === lvl).length;
    return {
      available: true,
      isAdmin: Boolean(res.data.isAdmin),
      scannedAt: new Date().toISOString(),
      total: results.length,
      summary: { high: count('high'), medium: count('medium'), low: count('low') },
      defender: res.data.defender || null,
      processes: results
    };
  }
}

module.exports = new SecurityService();
module.exports.analyzeProcesses = analyzeProcesses;
module.exports.levenshtein = levenshtein;
