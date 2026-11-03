// backend/src/services/processService.js
// Lista processos em execução e altera a prioridade de CPU.
// "Permanente" usa Image File Execution Options\<exe>\PerfOptions\CpuPriorityClass,
// mecanismo do próprio Windows que aplica a prioridade sempre que o .exe inicia.
const { runPowerShell } = require('../utils/powershell');
const db = require('../database/db');

// RealTime fica de fora de propósito: pode travar entrada de mouse/teclado e o próprio sistema
const PRIORITIES = {
  Idle: { label: 'Baixa', ifeo: 1 },
  BelowNormal: { label: 'Abaixo do normal', ifeo: 5 },
  Normal: { label: 'Normal', ifeo: 2 },
  AboveNormal: { label: 'Acima do normal', ifeo: 6 },
  High: { label: 'Alta', ifeo: 3 }
};

// Processos do sistema que não devem ter a prioridade alterada
const PROTECTED = new Set([
  'system', 'idle', 'smss', 'csrss', 'wininit', 'winlogon', 'services', 'lsass', 'lsaiso',
  'svchost', 'dwm', 'fontdrvhost', 'registry', 'memory compression', 'secure system', 'audiodg'
]);

const isValidExeName = (name) => /^[\w .()+\-]{1,100}\.exe$/i.test(name);

const LIST_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$persist = @{}
Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options' | ForEach-Object {
  $v = (Get-ItemProperty (Join-Path $_.PSPath 'PerfOptions')).CpuPriorityClass
  if ($v) { $persist[$_.PSChildName.ToLower()] = $v }
}
$list = Get-Process | Where-Object { $_.Id -gt 4 } | ForEach-Object {
  $prio = $null; try { $prio = [string]$_.PriorityClass } catch {}
  $path = $null; try { $path = $_.Path } catch {}
  [PSCustomObject]@{
    pid = $_.Id
    name = $_.ProcessName
    title = $_.MainWindowTitle
    memoryMb = [math]::Round($_.WorkingSet64 / 1MB)
    priority = $prio
    path = $path
  }
}
[PSCustomObject]@{ processes = @($list); persistent = $persist } | ConvertTo-Json -Depth 3 -Compress
`;

class ProcessService {
  async list() {
    if (process.platform !== 'win32') {
      return { available: false, message: 'Disponível apenas no Windows.', processes: [] };
    }
    const res = await runPowerShell(LIST_SCRIPT, 20000);
    if (!res.success || !res.data) {
      return { available: false, message: 'Não foi possível listar os processos.', processes: [] };
    }
    const raw = Array.isArray(res.data.processes) ? res.data.processes : (res.data.processes ? [res.data.processes] : []);
    const persistent = res.data.persistent || {};
    const ifeoToPriority = Object.fromEntries(Object.entries(PRIORITIES).map(([k, v]) => [v.ifeo, k]));

    // Agrupa por nome (Chrome/Discord abrem dezenas de processos): mostra o de maior memória
    const byName = new Map();
    for (const p of raw) {
      if (!p || !p.name || PROTECTED.has(p.name.toLowerCase())) continue;
      const key = p.name.toLowerCase();
      const cur = byName.get(key);
      if (!cur) {
        byName.set(key, { ...p, instances: 1, pids: [p.pid] });
      } else {
        cur.instances += 1;
        cur.pids.push(p.pid);
        if (p.memoryMb > cur.memoryMb) Object.assign(cur, { pid: p.pid, memoryMb: p.memoryMb, priority: p.priority || cur.priority });
        if (!cur.title && p.title) cur.title = p.title;
        if (!cur.path && p.path) cur.path = p.path;
      }
    }

    const processes = [...byName.values()].map(p => {
      const exe = `${p.name}.exe`;
      const persistedValue = persistent[exe.toLowerCase()];
      return {
        pid: p.pid,
        pids: p.pids,
        name: p.name,
        exe,
        title: p.title || '',
        memoryMb: p.memoryMb,
        instances: p.instances,
        priority: p.priority || null,           // null = sem permissão para ler (processo elevado)
        priorityLabel: p.priority && PRIORITIES[p.priority] ? PRIORITIES[p.priority].label : (p.priority || 'Sem acesso'),
        hasWindow: Boolean(p.title),
        persistentPriority: persistedValue ? (ifeoToPriority[persistedValue] || null) : null
      };
    }).sort((a, b) => (b.hasWindow - a.hasWindow) || (b.memoryMb - a.memoryMb));

    return {
      available: true,
      priorities: Object.entries(PRIORITIES).map(([value, v]) => ({ value, label: v.label })),
      processes
    };
  }

  async setPriority({ name, priority, persistent }) {
    if (process.platform !== 'win32') return { success: false, message: 'Disponível apenas no Windows.' };
    if (!Object.prototype.hasOwnProperty.call(PRIORITIES, priority)) return { success: false, message: 'Prioridade inválida.' };
    if (typeof name !== 'string' || !/^[\w .()+\-]{1,100}$/.test(name)) return { success: false, message: 'Nome de processo inválido.' };
    if (PROTECTED.has(name.toLowerCase())) return { success: false, message: 'Este é um processo do sistema e não pode ser alterado.' };

    const exe = `${name}.exe`;
    const label = PRIORITIES[priority].label;
    // Nome e prioridade já validados acima por regex/lista, seguros para o script
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$ok = 0; $fail = 0
Get-Process -Name '${name}' | ForEach-Object {
  try { $_.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${priority}; $ok++ } catch { $fail++ }
}
$persisted = $false
if (${persistent ? '$true' : '$false'} -and $isAdmin) {
  $key = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${exe}\\PerfOptions'
  try {
    New-Item -Path $key -Force -ErrorAction Stop | Out-Null
    New-ItemProperty -Path $key -Name 'CpuPriorityClass' -Value ${PRIORITIES[priority].ifeo} -PropertyType DWord -Force -ErrorAction Stop | Out-Null
    $persisted = $true
  } catch {}
}
[PSCustomObject]@{ isAdmin = $isAdmin; changed = $ok; failed = $fail; persisted = $persisted } | ConvertTo-Json -Compress
`;
    const res = await runPowerShell(script, 15000);
    const d = res.success && res.data ? res.data : null;
    if (!d) return { success: false, message: 'Falha ao executar o PowerShell.' };

    if (persistent && !d.isAdmin) {
      return { success: false, needsAdmin: true, message: 'Para deixar a prioridade permanente, abra o CWU App como administrador.' };
    }
    if (d.changed === 0 && !d.persisted) {
      return {
        success: false,
        needsAdmin: !d.isAdmin,
        message: d.failed > 0
          ? `Sem permissão para alterar ${exe}.${d.isAdmin ? ' O processo é protegido (ex.: anti-cheat).' : ' Tente abrir o CWU App como administrador.'}`
          : `${exe} não está em execução.`
      };
    }

    if (d.persisted) {
      db.addUpdateLog({
        type: 'priority',
        title: `Prioridade permanente: ${exe} → ${label}`,
        category: 'Prioridade de processos',
        details: `O Windows passa a iniciar ${exe} sempre com prioridade ${label} (Image File Execution Options).`,
        exeName: exe
      });
    }

    const parts = [];
    if (d.changed) parts.push(`${d.changed} processo(s) de ${exe} agora em prioridade ${label}`);
    if (d.persisted) parts.push('a prioridade será aplicada toda vez que ele abrir');
    if (d.failed) parts.push(`${d.failed} instância(s) sem permissão`);
    return { success: true, message: parts.join('; ') + '.', ...d };
  }

  // Remove a prioridade permanente (usado também pela reversão na aba Logs)
  async removePersistent(exe) {
    if (process.platform !== 'win32') return { success: false, message: 'Disponível apenas no Windows.' };
    if (!isValidExeName(exe)) return { success: false, message: 'Nome de executável inválido.' };
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$key = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\${exe}\\PerfOptions'
$removed = $false
if ($isAdmin -and (Test-Path $key)) {
  try { Remove-ItemProperty -Path $key -Name 'CpuPriorityClass' -ErrorAction Stop; $removed = $true } catch {}
}
[PSCustomObject]@{ isAdmin = $isAdmin; removed = $removed } | ConvertTo-Json -Compress
`;
    const res = await runPowerShell(script, 15000);
    const d = res.success && res.data ? res.data : {};
    if (!d.isAdmin) return { success: false, needsAdmin: true, message: 'Remover a prioridade permanente exige administrador.' };
    return { success: true, message: d.removed ? `${exe} volta a iniciar com prioridade normal.` : `${exe} não tinha prioridade permanente.` };
  }
}

module.exports = new ProcessService();
module.exports.PROTECTED = PROTECTED;
module.exports.PRIORITIES = PRIORITIES;
