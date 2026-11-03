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
  if (/hdd/i.test(d.mediaType)) return 'HD';
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

module.exports = { getDiskHealth, evaluateDisk };
