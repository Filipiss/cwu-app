// backend/src/services/monitorService.js
// Monitor em tempo real. Em vez de abrir um PowerShell por leitura (caro e distorce
// o próprio uso de CPU), mantém UM processo PowerShell em loop que imprime uma linha
// JSON a cada intervalo. O processo para sozinho quando ninguém consulta por 30 s.
const { spawn } = require('child_process');
const os = require('os');

const INTERVAL_MS = 1500;
const IDLE_STOP_MS = 30000;
const HISTORY_SIZE = 60; // ~90 s de histórico para os gráficos

// Contadores via CIM (Win32_PerfFormattedData_*): nomes independentes do idioma do Windows
const LOOP_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$cores = [Environment]::ProcessorCount
$nvsmi = @("$env:ProgramFiles\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe", "$env:SystemRoot\\System32\\nvidia-smi.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
$diskTemps = @(); $tick = 0
while ($true) {
  $cpu = (Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
  $disk = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter "Name='_Total'"
  $gpuEngines = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine
  # Uso da GPU = maior engine (3D, cópia, vídeo…) somando por tipo, como o Gerenciador de Tarefas
  $gpuUsage = $null
  if ($gpuEngines) {
    $byType = @{}
    foreach ($e in $gpuEngines) {
      if ($e.Name -match 'engtype_(\\w+)') { $byType[$matches[1]] = [double]$byType[$matches[1]] + [double]$e.UtilizationPercentage }
    }
    if ($byType.Count) { $gpuUsage = [math]::Min(100, ($byType.Values | Measure-Object -Maximum).Maximum) }
  }
  $nv = $null
  if ($nvsmi) {
    $line = & $nvsmi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,clocks.gr --format=csv,noheader,nounits 2>$null | Select-Object -First 1
    if ($line) {
      $p = $line -split ',\\s*'
      $nv = [PSCustomObject]@{ name = $p[0]; temp = [double]$p[1]; usage = [double]$p[2]; memUsedMb = [double]$p[3]; memTotalMb = [double]$p[4]; powerW = $(try { [double]$p[5] } catch { $null }); clockMhz = $(try { [double]$p[6] } catch { $null }) }
    }
  }
  # Temperatura ACPI (aproximada; muitas placas não expõem) e de discos (a cada ~30 s)
  $acpi = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature | Select-Object -First 1
  $cpuTemp = if ($acpi -and $acpi.CurrentTemperature) { [math]::Round($acpi.CurrentTemperature / 10 - 273.15, 1) } else { $null }
  if ($tick % 20 -eq 0) {
    $diskTemps = @(Get-PhysicalDisk | ForEach-Object {
      $r = $_ | Get-StorageReliabilityCounter
      [PSCustomObject]@{ name = $_.FriendlyName; temp = $r.Temperature }
    })
  }
  $top = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.Name -notin '_Total','Idle' } |
    Sort-Object PercentProcessorTime -Descending | Select-Object -First 5 |
    ForEach-Object { [PSCustomObject]@{ name = ($_.Name -replace '#\\d+$',''); cpu = [math]::Round($_.PercentProcessorTime / $cores, 1); memMb = [math]::Round($_.WorkingSetPrivate / 1MB) } }
  [PSCustomObject]@{
    t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    cpu = $cpu
    cpuTemp = $cpuTemp
    diskBusy = [math]::Min(100, [double]$disk.PercentDiskTime)
    diskReadMBs = [math]::Round($disk.DiskReadBytesPersec / 1MB, 1)
    diskWriteMBs = [math]::Round($disk.DiskWriteBytesPersec / 1MB, 1)
    gpuUsage = $gpuUsage
    nvidia = $nv
    diskTemps = $diskTemps
    top = @($top)
  } | ConvertTo-Json -Depth 3 -Compress
  $tick++
  Start-Sleep -Milliseconds ${INTERVAL_MS}
}
`;

class MonitorService {
  constructor() {
    this.child = null;
    this.latest = null;
    this.history = [];
    this.lastPoll = 0;
    this.idleTimer = null;
    this.buffer = '';
    this.error = null;
  }

  ensureRunning() {
    this.lastPoll = Date.now();
    if (this.child || process.platform !== 'win32') return;

    this.error = null;
    this.child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', '-'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore']
    });
    this.child.stdout.on('data', (chunk) => this.onData(chunk));
    this.child.on('error', (err) => { this.error = err.message; this.child = null; });
    this.child.on('exit', () => { this.child = null; });
    this.child.stdin.write(LOOP_SCRIPT);
    this.child.stdin.end();

    clearInterval(this.idleTimer);
    this.idleTimer = setInterval(() => {
      if (Date.now() - this.lastPoll > IDLE_STOP_MS) this.stop();
    }, 5000);
  }

  onData(chunk) {
    this.buffer += chunk.toString('utf8');
    let idx;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line.startsWith('{')) continue;
      try {
        this.push(JSON.parse(line));
      } catch (e) { /* linha incompleta ou ruído do PowerShell */ }
    }
  }

  // Normaliza uma amostra e adiciona RAM (lida pelo Node, sem custo)
  push(raw) {
    const total = os.totalmem();
    const free = os.freemem();
    const nv = raw.nvidia || null;
    const sample = {
      t: raw.t || Date.now(),
      cpu: round(raw.cpu),
      cpuTemp: typeof raw.cpuTemp === 'number' && raw.cpuTemp > 0 && raw.cpuTemp < 120 ? raw.cpuTemp : null,
      ram: round(((total - free) / total) * 100),
      ramUsedGb: round((total - free) / 1024 ** 3, 1),
      ramTotalGb: round(total / 1024 ** 3, 1),
      gpu: nv && Number.isFinite(nv.usage) ? nv.usage : round(raw.gpuUsage),
      gpuTemp: nv && Number.isFinite(nv.temp) ? nv.temp : null,
      gpuName: nv ? nv.name : null,
      vramUsedMb: nv ? nv.memUsedMb : null,
      vramTotalMb: nv ? nv.memTotalMb : null,
      gpuPowerW: nv && Number.isFinite(nv.powerW) ? nv.powerW : null,
      gpuClockMhz: nv && Number.isFinite(nv.clockMhz) ? nv.clockMhz : null,
      disk: raw.diskBusy === null || raw.diskBusy === undefined ? null : Math.min(100, round(raw.diskBusy)),
      diskReadMBs: raw.diskReadMBs || 0,
      diskWriteMBs: raw.diskWriteMBs || 0,
      diskTemps: (Array.isArray(raw.diskTemps) ? raw.diskTemps : (raw.diskTemps ? [raw.diskTemps] : []))
        .filter(d => d && d.name).map(d => ({ name: d.name, temp: Number.isFinite(d.temp) && d.temp > 0 ? d.temp : null })),
      top: Array.isArray(raw.top) ? raw.top : (raw.top ? [raw.top] : [])
    };
    this.latest = sample;
    this.history.push({ t: sample.t, cpu: sample.cpu, ram: sample.ram, gpu: sample.gpu, disk: sample.disk });
    if (this.history.length > HISTORY_SIZE) this.history.shift();
  }

  snapshot() {
    if (process.platform !== 'win32') {
      return { available: false, message: 'Monitor disponível apenas no Windows.' };
    }
    this.ensureRunning();
    return {
      available: true,
      warmingUp: !this.latest,
      error: this.error,
      intervalMs: INTERVAL_MS,
      latest: this.latest,
      history: this.history
    };
  }

  stop() {
    clearInterval(this.idleTimer);
    this.idleTimer = null;
    if (this.child) {
      try { this.child.kill(); } catch (e) {}
      this.child = null;
    }
  }
}

function round(v, digits = 0) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return null;
  const f = 10 ** digits;
  return Math.round(Number(v) * f) / f;
}

const instance = new MonitorService();
process.on('exit', () => instance.stop());
module.exports = instance;
module.exports.MonitorService = MonitorService;
