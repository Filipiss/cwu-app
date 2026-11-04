// backend/src/services/driverUpdates.js
// Verificação REAL de atualização de drivers (antes era só pela idade do driver):
//  1. Windows Update: busca drivers pendentes para o hardware deste PC (catálogo da Microsoft).
//  2. NVIDIA: consulta a versão Game Ready mais recente no serviço oficial da NVIDIA
//     (o driver GeForce é unificado, então serve para qualquer placa GTX 900+ / RTX).
const { runPowerShell } = require('../utils/powershell');

const WU_SCRIPT = `
$ErrorActionPreference = 'Stop'
try {
  $session = New-Object -ComObject Microsoft.Update.Session
  $searcher = $session.CreateUpdateSearcher()
  $result = $searcher.Search("IsInstalled=0 and Type='Driver' and IsHidden=0")
  $list = @(foreach ($u in $result.Updates) {
    [PSCustomObject]@{
      title = $u.Title
      hardwareId = $u.DriverHardwareID
      manufacturer = $u.DriverManufacturer
      model = $u.DriverModel
      date = if ($u.DriverVerDate) { $u.DriverVerDate.ToString('yyyy-MM-dd') } else { $null }
    }
  })
  [PSCustomObject]@{ ok = $true; updates = $list } | ConvertTo-Json -Depth 3 -Compress
} catch {
  [PSCustomObject]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;

async function windowsUpdateDrivers() {
  if (process.platform !== 'win32') return { ok: false, updates: [] };
  const res = await runPowerShell(WU_SCRIPT, 150000);
  const d = res.success && res.data ? res.data : null;
  if (!d || !d.ok) return { ok: false, updates: [], error: (d && d.error) || res.error || 'sem resposta' };
  const list = Array.isArray(d.updates) ? d.updates : (d.updates ? [d.updates] : []);
  return { ok: true, updates: list.filter(u => u && u.hardwareId) };
}

// Chave de hardware comparável entre o Gerenciador de Dispositivos e o Windows Update
function hwKey(id) {
  const s = String(id || '').toUpperCase();
  const m = s.match(/VEN_[0-9A-F]{4}&DEV_[0-9A-F]{4}/) || s.match(/VID_[0-9A-F]{4}&PID_[0-9A-F]{4}/) || s.match(/ACPI\\[A-Z0-9]{4,8}/);
  return m ? m[0] : null;
}

// Windows "32.0.15.6094" -> NVIDIA "560.94"
function nvidiaVersionFromWindows(v) {
  const parts = String(v || '').split('.');
  if (parts.length < 4) return null;
  const digits = (parts[2] + parts[3]).replace(/\D/g, '');
  if (digits.length < 5) return null;
  const last5 = digits.slice(-5);
  return `${Number(last5.slice(0, 3))}.${last5.slice(3)}`;
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// Combinações psid/pfid de placas GeForce atuais (qualquer uma devolve o driver unificado)
const NVIDIA_PRODUCTS = [[120, 929], [127, 995], [131, 1066]];

async function nvidiaLatest(timeoutMs = 9000) {
  for (const [psid, pfid] of NVIDIA_PRODUCTS) {
    try {
      const url = 'https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php' +
        `?func=DriverManualLookup&psid=${psid}&pfid=${pfid}&osID=57&languageCode=1033&beta=0&isWHQL=1&dltype=-1&dch=1&upCRD=0&qnf=0&sort1=0&numberOfResults=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'CWU-App' } });
      if (!res.ok) continue;
      const j = await res.json();
      const info = j && j.IDS && j.IDS[0] && j.IDS[0].downloadInfo;
      if (info && /^\d+\.\d+$/.test(String(info.Version))) {
        return { ok: true, version: String(info.Version), url: info.DownloadURL ? decodeURIComponent(info.DownloadURL) : null, date: info.ReleaseDateTime || null };
      }
    } catch (e) { /* tenta a próxima combinação */ }
  }
  return { ok: false };
}

/**
 * Aplica o resultado das verificações online sobre a lista de drivers (função pura, testável).
 * Estados finais: generic (ausente/genérico), outdated (atualização disponível ou driver antigo),
 * updated (verificado) e unknown (não foi possível verificar).
 */
function applyUpdateInfo(drivers, { wu = { ok: false, updates: [] }, nvidia = { ok: false } } = {}) {
  const byKey = new Map();
  (wu.updates || []).forEach(u => { const k = hwKey(u.hardwareId); if (k) byKey.set(k, u); });

  return drivers.map(d => {
    if (d.status === 'generic') return d; // ausente ou genérico: já é o pior caso
    const out = { ...d };
    const isNvidia = out.category === 'Placa de Vídeo' && /nvidia|geforce|rtx|gtx/i.test(`${out.name} ${out.manufacturer}`);

    if (isNvidia && nvidia.ok) {
      const installed = nvidiaVersionFromWindows(out.currentVersion);
      if (installed && compareVersions(nvidia.version, installed) > 0) {
        return { ...out, status: 'outdated', statusBadge: 'warning', latestVersion: nvidia.version, updateSource: 'nvidia',
          statusText: `Atualização disponível: ${installed} → ${nvidia.version}`, directDownload: nvidia.url || out.directDownload };
      }
      if (installed) {
        return { ...out, status: 'updated', statusBadge: 'success', latestVersion: nvidia.version, updateSource: 'nvidia',
          statusText: `Versão mais recente (${installed})` };
      }
    }

    const upd = byKey.get(hwKey(out.hardwareId));
    if (upd) {
      return { ...out, status: 'outdated', statusBadge: 'warning', updateSource: 'windows-update', latestVersion: upd.date || null,
        statusText: `Atualização no Windows Update${upd.date ? ' (' + upd.date.split('-').reverse().join('/') + ')' : ''}`,
        updateTitle: upd.title };
    }

    if (out.status === 'outdated') {
      // Driver antigo, mas sem versão nova no Windows Update: pode existir no site do fabricante
      out.statusText = `${out.statusText.split(' — ')[0]} — confira no site do fabricante`;
      return out;
    }
    if (wu.ok) return { ...out, status: 'updated', statusBadge: 'success', updateSource: 'windows-update', statusText: 'Nenhuma atualização no Windows Update' };
    return { ...out, status: 'unknown', statusBadge: 'neutral', statusText: 'Sem erros (não foi possível consultar atualizações)' };
  });
}

module.exports = { windowsUpdateDrivers, nvidiaLatest, applyUpdateInfo, hwKey, nvidiaVersionFromWindows, compareVersions };
