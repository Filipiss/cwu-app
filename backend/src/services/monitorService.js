// backend/src/services/monitorService.js
// Monitor em tempo real. Em vez de abrir um PowerShell por leitura (caro e distorce
// o próprio uso de CPU), mantém UM processo PowerShell em loop que imprime uma linha
// JSON a cada intervalo. O processo para sozinho quando ninguém consulta por 30 s.
const { spawn } = require('child_process');
const os = require('os');

const INTERVAL_MS = 1500;
const IDLE_STOP_MS = 30000;
const HISTORY_SIZE = 60; // ~90 s de histórico para os gráficos
// Sensor ACPI "travado": em muitas placas (comum com AMD Ryzen) a zona térmica devolve
// sempre o mesmo valor (ex.: 27,8 °C). Se não variar nada por ~60 s enquanto o uso da
// CPU oscila, a leitura não é real e deixa de ser exibida.
const STUCK_SAMPLES = 40;
const STUCK_MIN_LOAD_SWING = 10;
// Processador ligado nunca fica abaixo da temperatura ambiente: abaixo disso a zona ACPI
// não está medindo a CPU (relatos de placas AMD travadas em 17 °C)
const CPU_TEMP_MIN_PLAUSIBLE = 25;

function isStuckSensor(samples) {
  if (samples.length < STUCK_SAMPLES) return false;
  const recent = samples.slice(-STUCK_SAMPLES);
  const temps = new Set(recent.map(s => s.temp));
  const loads = recent.map(s => s.cpu).filter(Number.isFinite);
  const swing = loads.length ? Math.max(...loads) - Math.min(...loads) : 0;
  return temps.size === 1 && swing >= STUCK_MIN_LOAD_SWING;
}

// Contadores via CIM (Win32_PerfFormattedData_*): nomes independentes do idioma do Windows
const LOOP_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$cores = [Environment]::ProcessorCount
$nvsmi = @("$env:ProgramFiles\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe", "$env:SystemRoot\\System32\\nvidia-smi.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
# Temperatura de GPU de qualquer fabricante (AMD, NVIDIA, Intel) pela mesma API do
# Gerenciador de Tarefas: D3DKMTQueryAdapterInfo(KMTQAITYPE_ADAPTERPERFDATA). Requer WDDM 2.4+.
$gpuApi = $false
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class CwuGpu {
  [DllImport("gdi32.dll")] static extern int D3DKMTEnumAdapters2(ref ENUM e);
  [DllImport("gdi32.dll")] static extern int D3DKMTQueryAdapterInfo(ref QUERY q);
  [DllImport("gdi32.dll")] static extern int D3DKMTCloseAdapter(ref uint h);
  [StructLayout(LayoutKind.Sequential)] struct ENUM { public uint Num; public IntPtr Adapters; }
  [StructLayout(LayoutKind.Sequential)] struct QUERY { public uint Adapter; public int Type; public IntPtr Data; public uint Size; }
  static int Query(uint h, int type, byte[] buf) {
    var pin = GCHandle.Alloc(buf, GCHandleType.Pinned);
    try { var q = new QUERY { Adapter = h, Type = type, Data = pin.AddrOfPinnedObject(), Size = (uint)buf.Length }; return D3DKMTQueryAdapterInfo(ref q); }
    finally { pin.Free(); }
  }
  // Retorna "temperatura|nome" do adaptador mais quente (iGPUs costumam reportar 0)
  public static string Read() {
    var e = new ENUM();
    if (D3DKMTEnumAdapters2(ref e) != 0 || e.Num == 0) return null;
    const int SIZE = 20; // D3DKMT_ADAPTERINFO
    IntPtr mem = Marshal.AllocHGlobal(SIZE * (int)e.Num);
    try {
      e.Adapters = mem;
      if (D3DKMTEnumAdapters2(ref e) != 0) return null;
      double best = 0; string name = null;
      for (int i = 0; i < e.Num; i++) {
        uint h = (uint)Marshal.ReadInt32(mem, i * SIZE);
        var perf = new byte[64]; // D3DKMT_ADAPTER_PERFDATA; Temperature (décimos de °C) no offset 56
        if (Query(h, 62, perf) == 0) {
          double t = BitConverter.ToUInt32(perf, 56) / 10.0;
          if (t > best && t < 150) {
            best = t;
            var reg = new byte[2080]; // D3DKMT_ADAPTERREGISTRYINFO; AdapterString é o 1º campo
            name = Query(h, 8, reg) == 0 ? System.Text.Encoding.Unicode.GetString(reg, 0, 520).Split('\\0')[0] : null;
          }
        }
        D3DKMTCloseAdapter(ref h);
      }
      return best > 0 ? best.ToString(System.Globalization.CultureInfo.InvariantCulture) + "|" + name : null;
    } finally { Marshal.FreeHGlobal(mem); }
  }
}
'@
  $gpuApi = $true
} catch {}
$diskTemps = @(); $top = @(); $tick = 0
$sw = [Diagnostics.Stopwatch]::new()
while ($true) {
  $sw.Restart()
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
  $gpuSensor = $null
  if ($gpuApi) {
    $g = try { [CwuGpu]::Read() } catch { $null }
    if ($g) { $gp = $g -split '\\|', 2; $gpuSensor = [PSCustomObject]@{ temp = [double]::Parse($gp[0], [Globalization.CultureInfo]::InvariantCulture); name = $gp[1] } }
  }
  # Temperatura ACPI (aproximada; muitas placas não expõem). Usa a zona mais quente,
  # já que a primeira costuma ser a do gabinete. O Node descarta leituras travadas.
  $zones = @(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature | Where-Object { $_.CurrentTemperature -gt 2732 })
  $cpuTemp = if ($zones.Count) { [math]::Round((($zones | Measure-Object CurrentTemperature -Maximum).Maximum) / 10 - 273.15, 1) } else { $null }
  if ($tick % 20 -eq 1) {
    $diskTemps = @(Get-PhysicalDisk | ForEach-Object {
      $r = $_ | Get-StorageReliabilityCounter
      [PSCustomObject]@{ name = $_.FriendlyName; temp = $r.Temperature; hdd = (($_.SpindleSpeed -gt 0) -and ($_.SpindleSpeed -lt 4294967295)) }
    })
  }
  if ($tick % 3 -eq 0) { $top = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.Name -notin '_Total','Idle' } |
    Sort-Object PercentProcessorTime -Descending | Select-Object -First 5 |
    ForEach-Object { [PSCustomObject]@{ name = ($_.Name -replace '#\\d+$',''); cpu = [math]::Round($_.PercentProcessorTime / $cores, 1); memMb = [math]::Round($_.WorkingSetPrivate / 1MB) } } }
  $json = [PSCustomObject]@{
    t = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    cpu = $cpu
    cpuTemp = $cpuTemp
    diskBusy = [math]::Min(100, [double]$disk.PercentDiskTime)
    diskReadMBs = [math]::Round($disk.DiskReadBytesPersec / 1MB, 1)
    diskWriteMBs = [math]::Round($disk.DiskWriteBytesPersec / 1MB, 1)
    gpuUsage = $gpuUsage
    nvidia = $nv
    gpuSensor = $gpuSensor
    diskTemps = $diskTemps
    top = @($top)
  } | ConvertTo-Json -Depth 3 -Compress
  # Marcadores delimitam cada amostra (imune a quebras de linha do console) e o flush envia na hora
  [Console]::Out.WriteLine('@@CWU@@' + $json + '@@END@@')
  [Console]::Out.Flush()
  $tick++
  $wait = ${INTERVAL_MS} - $sw.ElapsedMilliseconds
  if ($wait -gt 50) { Start-Sleep -Milliseconds $wait }
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
    this.cpuTempSamples = [];
    this.cpuTempStuck = false;
  }

  // Acompanha a leitura ACPI; uma vez marcada como travada, fica assim até reiniciar o app
  checkCpuTemp(temp, cpu) {
    if (temp === null) return null;
    if (this.cpuTempStuck) return null;
    this.cpuTempSamples.push({ temp, cpu });
    if (this.cpuTempSamples.length > STUCK_SAMPLES) this.cpuTempSamples.shift();
    if (isStuckSensor(this.cpuTempSamples)) { this.cpuTempStuck = true; return null; }
    return temp;
  }

  ensureRunning() {
    this.lastPoll = Date.now();
    if (this.child || process.platform !== 'win32') return;

    this.error = null;
    this.startedAt = Date.now();
    this.stderr = '';
    // -EncodedCommand (UTF-16LE em base64): o script chega inteiro, sem depender de linha em branco no stdin
    const encoded = Buffer.from(LOOP_SCRIPT, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.child = child;
    child.stdout.on('data', (chunk) => this.onData(chunk));
    child.stderr.on('data', (chunk) => { this.stderr = (this.stderr + chunk.toString('utf8')).slice(-2000); });
    child.on('error', (err) => { this.error = err.message; if (this.child === child) this.child = null; });
    child.on('exit', (code) => {
      if (this.child === child) this.child = null;
      if (code && !this.error) this.error = `PowerShell encerrou (código ${code}). ${this.stderr.trim().split(/\r?\n/).slice(-3).join(' ')}`;
    });

    clearInterval(this.idleTimer);
    this.idleTimer = setInterval(() => {
      if (Date.now() - this.lastPoll > IDLE_STOP_MS) return this.stop();
      // Watchdog: sem amostra há 15 s → reinicia e registra o motivo
      const lastSample = this.latest ? this.latest.receivedAt : this.startedAt;
      if (this.child && Date.now() - lastSample > 15000) {
        this.error = 'Os sensores pararam de responder; reiniciando. ' + this.stderr.trim().split(/\r?\n/).slice(-2).join(' ');
        this.latest = null;
        this.stop();
        this.ensureRunning();
      }
    }, 5000);
  }

  onData(chunk) {
    this.buffer += chunk.toString('utf8');
    let start;
    while ((start = this.buffer.indexOf('@@CWU@@')) >= 0) {
      const end = this.buffer.indexOf('@@END@@', start);
      if (end < 0) break; // amostra ainda chegando
      const json = this.buffer.slice(start + 7, end).replace(/[\r\n]/g, '');
      this.buffer = this.buffer.slice(end + 7);
      try {
        this.push(JSON.parse(json));
        this.error = null;
      } catch (e) { /* amostra corrompida: descarta */ }
    }
    if (this.buffer.length > 100000) this.buffer = this.buffer.slice(-20000);
  }

  // Normaliza uma amostra e adiciona RAM (lida pelo Node, sem custo)
  push(raw) {
    const total = os.totalmem();
    const free = os.freemem();
    const nv = raw.nvidia || null;
    const gs = raw.gpuSensor && Number.isFinite(raw.gpuSensor.temp) && raw.gpuSensor.temp > 0 ? raw.gpuSensor : null;
    const acpi = typeof raw.cpuTemp === 'number' && raw.cpuTemp >= CPU_TEMP_MIN_PLAUSIBLE && raw.cpuTemp < 120 ? raw.cpuTemp : null;
    const sample = {
      t: raw.t || Date.now(),
      cpu: round(raw.cpu),
      cpuTemp: this.checkCpuTemp(acpi, round(raw.cpu)),
      cpuTempStuck: this.cpuTempStuck,
      cpuIsAmd: /\bAMD\b|Ryzen|Threadripper|Athlon/i.test((os.cpus()[0] || {}).model || ''),
      ram: round(((total - free) / total) * 100),
      ramUsedGb: round((total - free) / 1024 ** 3, 1),
      ramTotalGb: round(total / 1024 ** 3, 1),
      gpu: nv && Number.isFinite(nv.usage) ? nv.usage : round(raw.gpuUsage),
      gpuTemp: nv && Number.isFinite(nv.temp) ? nv.temp : (gs ? round(gs.temp, 1) : null),
      gpuName: nv ? nv.name : (gs && gs.name ? gs.name : null),
      vramUsedMb: nv ? nv.memUsedMb : null,
      vramTotalMb: nv ? nv.memTotalMb : null,
      gpuPowerW: nv && Number.isFinite(nv.powerW) ? nv.powerW : null,
      gpuClockMhz: nv && Number.isFinite(nv.clockMhz) ? nv.clockMhz : null,
      disk: raw.diskBusy === null || raw.diskBusy === undefined ? null : Math.min(100, round(raw.diskBusy)),
      diskReadMBs: raw.diskReadMBs || 0,
      diskWriteMBs: raw.diskWriteMBs || 0,
      diskTemps: (Array.isArray(raw.diskTemps) ? raw.diskTemps : (raw.diskTemps ? [raw.diskTemps] : []))
        .filter(d => d && d.name).map(d => ({ name: d.name, temp: Number.isFinite(d.temp) && d.temp > 0 ? d.temp : null, hdd: d.hdd === true })),
      top: Array.isArray(raw.top) ? raw.top : (raw.top ? [raw.top] : [])
    };
    sample.receivedAt = Date.now();
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
      secondsWaiting: this.latest ? 0 : Math.round((Date.now() - (this.startedAt || Date.now())) / 1000),
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
module.exports.isStuckSensor = isStuckSensor;
