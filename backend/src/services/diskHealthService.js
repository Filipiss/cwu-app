// backend/src/services/diskHealthService.js
// Vida útil e saúde dos discos (SSD, NVMe e HD) pelos contadores de confiabilidade
// do próprio Windows (Get-StorageReliabilityCounter, que lê o SMART do disco).
const { runPowerShell } = require('../utils/powershell');

const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$disks = @(Get-PhysicalDisk | ForEach-Object {
  $r = $_ | Get-StorageReliabilityCounter
  [PSCustomObject]@{
    model = $_.FriendlyName
    mediaType = [string]$_.MediaType
    busType = [string]$_.BusType
    spindle = $_.SpindleSpeed
    sizeBytes = [int64]$_.Size
    health = [string]$_.HealthStatus
    wear = $r.Wear
    temperature = $r.Temperature
    temperatureMax = $r.TemperatureMax
    powerOnHours = $r.PowerOnHours
    readErrors = $r.ReadErrorsUncorrected
    writeErrors = $r.WriteErrorsUncorrected
  }
})
[PSCustomObject]@{ isAdmin = $isAdmin; disks = $disks } | ConvertTo-Json -Depth 4 -Compress
`;

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function diskType(d) {
  if (/nvme/i.test(d.busType)) return 'NVMe';
  if (/ssd/i.test(d.mediaType)) return 'SSD';
  // Só SSD informa desgaste: se veio "Wear", não é HD, mesmo que o Windows erre o tipo
  if (num(d.wear) !== null) return 'SSD';
  // HD de verdade tem prato girando (RPM > 0); SSD informa 0. Sem RPM, não arrisca dizer que é HD.
  const rpm = num(d.spindle);
  if (rpm !== null && rpm > 0 && rpm < 4294967295) return 'HD';
  if (rpm === 0) return 'SSD';
  if (/hdd/i.test(d.mediaType) && rpm === null) return 'Disco';
  return 'Disco';
}

/** Transforma a leitura bruta de um disco num diagnóstico legível. */
function evaluateDisk(raw) {
  const type = diskType(raw);
  const wear = num(raw.wear);
  // "Wear" é o percentual já consumido da vida útil (0 = novo). HDs não informam.
  const lifeRemaining = wear === null || wear > 100 ? null : Math.max(0, 100 - wear);
  const errors = (num(raw.readErrors) || 0) + (num(raw.writeErrors) || 0);
  const temperature = num(raw.temperature) || null;
  const hours = num(raw.powerOnHours);

  let status = 'good';
  const notes = [];
  if (raw.health === 'Unhealthy') { status = 'bad'; notes.push('O Windows marcou o disco como com falhas. Faça backup agora.'); }
  else if (raw.health === 'Warning') { status = 'warn'; notes.push('O Windows indicou um alerta no disco. Faça backup e acompanhe.'); }
  if (lifeRemaining !== null && lifeRemaining <= 10) { status = 'bad'; notes.push('Vida útil quase no fim: planeje a troca.'); }
  else if (lifeRemaining !== null && lifeRemaining <= 30 && status === 'good') { status = 'warn'; notes.push('Mais de 70% da vida útil já foi usada.'); }
  if (errors > 0) { if (status === 'good') status = 'warn'; notes.push(`${errors} erro(s) de leitura/escrita sem correção registrados.`); }
  // HD esquenta acima de ~50 °C; SSD/NVMe trabalham bem até ~70 °C
  if (temperature !== null && temperature >= (type === 'HD' ? 55 : 70)) { if (status === 'good') status = 'warn'; notes.push(`Temperatura alta (${temperature} °C): verifique a ventilação.`); }

  return {
    model: raw.model || 'Disco sem nome',
    type,
    sizeGb: raw.sizeBytes ? Math.round(raw.sizeBytes / 1e9) : null,
    health: { Healthy: 'Saudável', Warning: 'Atenção', Unhealthy: 'Com falhas' }[raw.health] || 'Desconhecido',
    lifeRemaining,
    temperature,
    powerOnHours: hours,
    errors,
    status,
    notes
  };
}

async function getDiskHealth() {
  if (process.platform !== 'win32') return { supported: false, isAdmin: false, disks: [] };
  const res = await runPowerShell(SCRIPT, 30000);
  const d = res.success && res.data ? res.data : null;
  if (!d) return { supported: true, isAdmin: false, disks: [], error: res.error || 'Sem resposta do PowerShell' };
  const list = Array.isArray(d.disks) ? d.disks : (d.disks ? [d.disks] : []);
  return { supported: true, isAdmin: Boolean(d.isAdmin), disks: list.map(evaluateDisk) };
}

// ===== Espaço livre nas unidades (C:, D:, ...) =====
// SSD quase cheio fica bem mais lento para gravar, e no boot o Windows grava muito
// (paginação, logs, atualizações). Por isso o alerta é mais rígido na unidade do Windows.
const VOLUMES_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$sys = $env:SystemDrive.TrimEnd(':')
$vols = @(Get-Volume | Where-Object { $_.DriveLetter -and $_.DriveType -eq 'Fixed' -and $_.Size -gt 0 } | Sort-Object DriveLetter | ForEach-Object {
  [PSCustomObject]@{ letter = [string]$_.DriveLetter; label = $_.FileSystemLabel; sizeBytes = [int64]$_.Size; freeBytes = [int64]$_.SizeRemaining; system = ([string]$_.DriveLetter -eq $sys) }
})
[PSCustomObject]@{ volumes = $vols } | ConvertTo-Json -Depth 3 -Compress
`;

const FREE_WARN_PCT = 15;
const FREE_BAD_PCT = 10;

/** Avalia o espaço livre de uma unidade (pura, testável). */
function evaluateVolume(raw) {
  const size = num(raw.sizeBytes) || 0;
  const free = Math.max(0, Math.min(size, num(raw.freeBytes) || 0));
  const freePct = size ? Math.round((free / size) * 1000) / 10 : null;
  const freeGb = Math.round((free / 1024 ** 3) * 10) / 10;
  const system = Boolean(raw.system);
  let status = 'good';
  const notes = [];
  if (freePct !== null && freePct < FREE_BAD_PCT) {
    status = 'bad';
    notes.push(system
      ? 'Unidade do Windows quase cheia: o PC fica lento para ligar e abrir programas, e as atualizações podem falhar. Libere espaço para ter pelo menos 15% livres.'
      : 'Unidade quase cheia: libere espaço para ter pelo menos 15% livres.');
  } else if (freePct !== null && freePct < FREE_WARN_PCT) {
    status = 'warn';
    notes.push(system
      ? 'Pouco espaço na unidade do Windows: SSDs ficam mais lentos para gravar quando estão quase cheios.'
      : 'Pouco espaço livre nesta unidade.');
  }
  return {
    letter: String(raw.letter || '').slice(0, 1).toUpperCase(),
    label: raw.label || '',
    system,
    sizeGb: Math.round((size / 1024 ** 3) * 10) / 10,
    freeGb,
    freePct,
    status,
    notes
  };
}

async function getVolumes() {
  if (process.platform !== 'win32') return { supported: false, volumes: [] };
  const res = await runPowerShell(VOLUMES_SCRIPT, 20000);
  const d = res.success && res.data ? res.data : null;
  if (!d) return { supported: true, volumes: [], error: res.error || 'Sem resposta do PowerShell' };
  const list = Array.isArray(d.volumes) ? d.volumes : (d.volumes ? [d.volumes] : []);
  return { supported: true, volumes: list.filter(v => v && v.letter).map(evaluateVolume) };
}

module.exports = { getDiskHealth, evaluateDisk, getVolumes, evaluateVolume };
