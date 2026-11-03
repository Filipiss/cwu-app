// backend/src/services/competitiveService.js
// Ajustes "competitivos": não aumentam o FPS, mas reduzem input lag e deixam
// mira, imagem e conexão mais consistentes. Toda alteração é registrada e reversível.
const { runPowerShell } = require('../utils/powershell');
const db = require('../database/db');

const IS_ADMIN = `([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)`;

// GUIDs do powercfg (independentes do idioma do Windows)
const POWER = {
  ultimate: 'e9a42b02-d5df-448d-aa00-03f14749eb61',
  usbSub: '2a737441-1930-4402-8d77-b2bebba308a3',
  usbSelectiveSuspend: '48e6b7a6-50f5-4782-a5d4-53bb8f07e226'
};

// ---------------------------------------------------------------------------
// Monitores: taxa de atualização atual × máxima (Win32 EnumDisplaySettings)
// ---------------------------------------------------------------------------
const DISPLAY_TYPES = `
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class CwuDisplay {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra;
    public int dmFields; public int dmPositionX; public int dmPositionY;
    public int dmDisplayOrientation; public int dmDisplayFixedOutput;
    public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight;
    public int dmDisplayFlags; public int dmDisplayFrequency;
    public int dmICMMethod; public int dmICMIntent; public int dmMediaType; public int dmDitherType;
    public int dmReserved1; public int dmReserved2; public int dmPanningWidth; public int dmPanningHeight;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
  }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplayDevices(string dev, uint i, ref DISPLAY_DEVICE dd, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplaySettings(string dev, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int ChangeDisplaySettingsEx(string dev, ref DEVMODE dm, IntPtr hwnd, uint flags, IntPtr lParam);

  public class Display { public string name; public string monitor; public string adapter; public int width; public int height; public int current; public int[] rates; public bool primary; }

  static DEVMODE NewMode() { DEVMODE dm = new DEVMODE(); dm.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE)); return dm; }

  public static Display[] List() {
    var list = new List<Display>();
    for (uint i = 0; i < 16; i++) {
      DISPLAY_DEVICE dd = new DISPLAY_DEVICE(); dd.cb = Marshal.SizeOf(dd);
      if (!EnumDisplayDevices(null, i, ref dd, 0)) break;
      if ((dd.StateFlags & 1) == 0) continue; // só monitores ligados à área de trabalho
      DISPLAY_DEVICE mon = new DISPLAY_DEVICE(); mon.cb = Marshal.SizeOf(mon);
      string monName = EnumDisplayDevices(dd.DeviceName, 0, ref mon, 0) ? mon.DeviceString : "Monitor";
      DEVMODE cur = NewMode();
      if (!EnumDisplaySettings(dd.DeviceName, -1, ref cur)) continue;
      var rates = new SortedSet<int>();
      DEVMODE m = NewMode();
      for (int j = 0; EnumDisplaySettings(dd.DeviceName, j, ref m); j++) {
        if (m.dmPelsWidth == cur.dmPelsWidth && m.dmPelsHeight == cur.dmPelsHeight && m.dmBitsPerPel == cur.dmBitsPerPel && m.dmDisplayFrequency > 1) rates.Add(m.dmDisplayFrequency);
      }
      var d = new Display(); d.name = dd.DeviceName; d.monitor = monName; d.adapter = dd.DeviceString;
      d.width = cur.dmPelsWidth; d.height = cur.dmPelsHeight; d.current = cur.dmDisplayFrequency;
      d.rates = new List<int>(rates).ToArray(); d.primary = (dd.StateFlags & 4) != 0;
      list.Add(d);
    }
    return list.ToArray();
  }

  // Testa (CDS_TEST) e aplica (CDS_UPDATEREGISTRY) a nova taxa, mantendo a resolução
  public static int SetRate(string device, int hz) {
    DEVMODE cur = NewMode();
    if (!EnumDisplaySettings(device, -1, ref cur)) return -100;
    cur.dmDisplayFrequency = hz; cur.dmFields = 0x400000; // DM_DISPLAYFREQUENCY
    int test = ChangeDisplaySettingsEx(device, ref cur, IntPtr.Zero, 2, IntPtr.Zero);
    if (test != 0) return test;
    return ChangeDisplaySettingsEx(device, ref cur, IntPtr.Zero, 1, IntPtr.Zero);
  }
}
"@
`;

// ---------------------------------------------------------------------------
// Mouse: aceleração ("Aumentar precisão do ponteiro") e velocidade do ponteiro
// ---------------------------------------------------------------------------
const MOUSE_TYPES = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CwuMouse {
  [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW")] static extern bool SpiArray(uint a, uint b, int[] c, uint f);
  [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW")] static extern bool SpiGetInt(uint a, uint b, ref int c, uint f);
  [DllImport("user32.dll", EntryPoint = "SystemParametersInfoW")] static extern bool SpiSetInt(uint a, uint b, IntPtr c, uint f);
  public static int[] GetAccel() { int[] v = new int[3]; SpiArray(0x0003, 0, v, 0); return v; }
  public static bool SetAccel(int t1, int t2, int on) { return SpiArray(0x0004, 0, new int[] { t1, t2, on }, 3); }
  public static int GetSpeed() { int s = 0; SpiGetInt(0x0070, 0, ref s, 0); return s; }
  public static bool SetSpeed(int s) { return SpiSetInt(0x0071, 0, (IntPtr)s, 3); }
}
"@
`;

// Programas com overlay (camada desenhada por cima do jogo) e como desligar
const OVERLAYS = [
  { id: 'gamebar', processes: ['gamebar', 'gamebarftserver'], name: 'Xbox Game Bar', how: 'O CWU pode desligar o atalho Win+G e o overlay abaixo. Ou: Configurações › Jogos › Xbox Game Bar.' },
  { id: 'discord', processes: ['discord'], name: 'Discord', how: 'Discord › Configurações do usuário › Sobreposição do jogo › desative "Ativar sobreposição no jogo".' },
  { id: 'steam', processes: ['steam'], name: 'Steam', how: 'Steam › Configurações › Em jogo › desmarque "Ativar a Sobreposição Steam durante o jogo" (ou por jogo, nas Propriedades).' },
  { id: 'nvidia', processes: ['nvidia overlay', 'nvidia share'], name: 'Sobreposição NVIDIA (NVIDIA App / GeForce Experience)', how: 'NVIDIA App › Configurações › Recursos › desative "Sobreposição do NVIDIA". Mantenha se usa o medidor de latência ou o Instant Replay.' },
  { id: 'amd', processes: ['amdrssrcext', 'amdrsserv'], name: 'Sobreposição AMD Adrenalin', how: 'AMD Software › Configurações › Preferências › desative "Sobreposição no jogo".' },
  { id: 'rtss', processes: ['rtss'], name: 'RivaTuner Statistics Server (MSI Afterburner)', how: 'Útil para limitar FPS; se não usa o contador na tela, feche o RTSS antes de jogar.' },
  { id: 'overwolf', processes: ['overwolf'], name: 'Overwolf', how: 'Feche o Overwolf antes de partidas competitivas ou desative os apps de overlay dele.' },
  { id: 'medal', processes: ['medal'], name: 'Medal.tv', how: 'Medal › Configurações › desative o overlay/gravação contínua se não usa.' },
  { id: 'ea', processes: ['eadesktop'], name: 'EA app', how: 'EA app › Configurações › Aplicativo › desative "Ativar sobreposição durante o jogo".' },
  { id: 'ubisoft', processes: ['upc'], name: 'Ubisoft Connect', how: 'Ubisoft Connect › Configurações › Geral › desmarque "Ativar a sobreposição no jogo".' }
];

// ---------------------------------------------------------------------------
// Funções puras (testáveis)
// ---------------------------------------------------------------------------

// Lê "0x00000001" do powercfg /query: os dois últimos índices são CA (tomada) e CC (bateria)
function parsePowercfgIndexes(output) {
  const hex = String(output || '').match(/0x[0-9a-f]{8}/gi) || [];
  if (hex.length < 2) return null;
  const [ac, dc] = hex.slice(-2).map(h => parseInt(h, 16));
  return { ac, dc };
}

const parseGuid = (text) => {
  const m = String(text || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0].toLowerCase() : null;
};

// Estatísticas de ping: média, jitter (variação média entre respostas seguidas) e perda
function pingStats(samples) {
  const ok = samples.filter(v => typeof v === 'number' && v >= 0);
  const loss = samples.length ? Math.round(((samples.length - ok.length) / samples.length) * 100) : 100;
  if (!ok.length) return { avg: null, min: null, max: null, jitter: null, loss };
  const avg = ok.reduce((a, b) => a + b, 0) / ok.length;
  let diff = 0;
  for (let i = 1; i < ok.length; i++) diff += Math.abs(ok[i] - ok[i - 1]);
  return {
    avg: Math.round(avg),
    min: Math.min(...ok),
    max: Math.max(...ok),
    jitter: ok.length > 1 ? Math.round((diff / (ok.length - 1)) * 10) / 10 : 0,
    loss
  };
}

// Classifica a conexão para jogos competitivos
function rateConnection(stats) {
  if (stats.avg === null) return { level: 'bad', text: 'Sem resposta: verifique a conexão.' };
  if (stats.loss >= 2) return { level: 'bad', text: `Perda de pacotes de ${stats.loss}%: causa "teleportes" e tiros que não registram.` };
  if (stats.jitter > 15) return { level: 'warn', text: `Jitter alto (${stats.jitter} ms): o ping oscila, o que atrapalha mais que um ping alto e estável.` };
  if (stats.avg > 80) return { level: 'warn', text: `Ping médio de ${stats.avg} ms até a internet: alto para jogos competitivos.` };
  return { level: 'ok', text: `Conexão estável: ${stats.avg} ms de média, jitter de ${stats.jitter} ms e sem perda.` };
}

// Status do monitor: maior taxa disponível × atual
function analyzeDisplay(d) {
  const rates = (d.rates || []).filter(Number.isFinite);
  const max = rates.length ? Math.max(...rates) : d.current;
  return { ...d, max, belowMax: max > d.current + 1 };
}

const overlayMatch = (processNames) => {
  const running = new Set(processNames.map(n => String(n).toLowerCase()));
  return OVERLAYS.filter(o => o.processes.some(p => running.has(p)));
};

// ---------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------
class CompetitiveService {
  async getStatus() {
    if (process.platform !== 'win32') return { available: false, message: 'Disponível apenas no Windows.' };
    const res = await runPowerShell(`
$ErrorActionPreference = 'SilentlyContinue'
${DISPLAY_TYPES}
${MOUSE_TYPES}
$usb = (powercfg /query SCHEME_CURRENT ${POWER.usbSub} ${POWER.usbSelectiveSuspend}) -join ' '
[PSCustomObject]@{
  isAdmin = ${IS_ADMIN}
  displays = @([CwuDisplay]::List())
  accel = @([CwuMouse]::GetAccel())
  speed = [CwuMouse]::GetSpeed()
  processes = @(Get-Process | Select-Object -ExpandProperty ProcessName -Unique)
  gameBarOverlay = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\GameBar').UseNexusForGameBarEnabled
  activeScheme = (powercfg /getactivescheme) -join ' '
  schemes = (powercfg /list) -join ' '
  usb = $usb
  battery = [bool](Get-CimInstance Win32_Battery)
} | ConvertTo-Json -Depth 4 -Compress`, 30000);
    if (!res.success || !res.data) return { available: false, message: 'Não foi possível ler as configurações: ' + (res.error || res.raw || 'sem resposta') };
    const d = res.data;

    const displays = (Array.isArray(d.displays) ? d.displays : (d.displays ? [d.displays] : [])).map(analyzeDisplay);
    const accel = Array.isArray(d.accel) ? d.accel : [];
    const activeGuid = parseGuid(d.activeScheme);
    const ultimateGuid = (db.state.competitive || {}).ultimateGuid || null;
    const usb = parsePowercfgIndexes(d.usb);

    return {
      available: true,
      isAdmin: Boolean(d.isAdmin),
      isLaptop: Boolean(d.battery),
      displays,
      mouse: {
        accelerationOn: accel[2] === 1,
        speed: d.speed || null,          // 10 = 6/11 no painel = 1:1 (sem multiplicar)
        speedIsOneToOne: d.speed === 10
      },
      overlays: overlayMatch(Array.isArray(d.processes) ? d.processes : []),
      gameBarOverlayOn: d.gameBarOverlay !== 0,
      power: {
        ultimateActive: Boolean(ultimateGuid && activeGuid === ultimateGuid),
        activeGuid,
        usbSelectiveSuspendOn: usb ? usb.ac === 1 || usb.dc === 1 : null
      }
    };
  }

  // ---- Monitor ----
  async setRefreshRate({ device, hz }) {
    if (process.platform !== 'win32') return { success: false, message: 'Disponível apenas no Windows.' };
    const status = await this.getStatus();
    const display = (status.displays || []).find(x => x.name === device);
    if (!display) return { success: false, message: 'Monitor não encontrado (atualize a página).' };
    const target = Number(hz);
    if (!display.rates.includes(target)) return { success: false, message: 'Taxa não suportada por este monitor.' };
    const deviceB64 = Buffer.from(device, 'utf8').toString('base64');
    const res = await runPowerShell(`
$ErrorActionPreference = 'Stop'
${DISPLAY_TYPES}
$dev = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${deviceB64}'))
[PSCustomObject]@{ code = [CwuDisplay]::SetRate($dev, ${target}) } | ConvertTo-Json -Compress`, 20000);
    const code = res.success && res.data ? res.data.code : null;
    if (code !== 0) return { success: false, message: `O Windows recusou a mudança (código ${code}). Tente pelo painel da GPU ou verifique o cabo (HDMI antigo pode limitar a 60 Hz).` };
    this.log('display', `Monitor ${display.monitor}: ${display.current} Hz → ${target} Hz`, { device, hz: display.current });
    return { success: true, message: `${display.monitor} agora está em ${target} Hz.` };
  }

  // ---- Mouse ----
  async setMouseAcceleration({ enabled }) {
    if (typeof enabled !== 'boolean') return { success: false, message: 'Parâmetro inválido.' };
    const before = await this.getStatus();
    // Padrão do Windows quando ligada: limiares 6 e 10
    const res = await runPowerShell(`${MOUSE_TYPES}
[PSCustomObject]@{ ok = [CwuMouse]::SetAccel(${enabled ? '6, 10, 1' : '0, 0, 0'}) } | ConvertTo-Json -Compress`, 15000);
    if (!(res.success && res.data && res.data.ok)) return { success: false, message: 'Não foi possível alterar a aceleração do mouse.' };
    this.log('mouse_accel', `Aceleração do mouse ${enabled ? 'ativada' : 'desativada'}`, { enabled: before.mouse && before.mouse.accelerationOn });
    return { success: true, message: enabled ? 'Aceleração do mouse reativada.' : 'Aceleração desativada: o mesmo movimento da mão agora sempre move a mira na mesma distância.' };
  }

  async setMouseSpeed({ speed }) {
    const s = Number(speed);
    if (!Number.isInteger(s) || s < 1 || s > 20) return { success: false, message: 'Velocidade inválida.' };
    const before = await this.getStatus();
    const res = await runPowerShell(`${MOUSE_TYPES}
[PSCustomObject]@{ ok = [CwuMouse]::SetSpeed(${s}) } | ConvertTo-Json -Compress`, 15000);
    if (!(res.success && res.data && res.data.ok)) return { success: false, message: 'Não foi possível alterar a velocidade do ponteiro.' };
    this.log('mouse_speed', `Velocidade do ponteiro: ${before.mouse.speed} → ${s}`, { speed: before.mouse.speed });
    return { success: true, message: s === 10 ? 'Velocidade do ponteiro em 1:1 (6/11): o Windows não multiplica nem pula pixels.' : 'Velocidade do ponteiro alterada.' };
  }

  // ---- Overlays ----
  async setGameBarOverlay({ enabled }) {
    if (typeof enabled !== 'boolean') return { success: false, message: 'Parâmetro inválido.' };
    const before = await this.getStatus();
    const res = await runPowerShell(`$ErrorActionPreference='Stop'; try {
$k='HKCU:\\Software\\Microsoft\\GameBar'; if(!(Test-Path $k)){New-Item $k -Force|Out-Null}
New-ItemProperty $k -Name UseNexusForGameBarEnabled -Value ${enabled ? 1 : 0} -PropertyType DWord -Force|Out-Null
'{"ok":true}' } catch { '{"ok":false}' }`, 15000);
    if (!(res.success && res.data && res.data.ok)) return { success: false, message: 'Não foi possível alterar o Xbox Game Bar.' };
    this.log('gamebar', `Overlay do Xbox Game Bar (Win+G) ${enabled ? 'ativado' : 'desativado'}`, { enabled: before.gameBarOverlayOn });
    return { success: true, message: enabled ? 'Xbox Game Bar reativado.' : 'Overlay do Xbox Game Bar desativado (Win+G não abre mais por cima do jogo).' };
  }

  // ---- Energia ----
  async setUltimatePlan({ enabled }) {
    if (typeof enabled !== 'boolean') return { success: false, message: 'Parâmetro inválido.' };
    const state = db.state.competitive || (db.state.competitive = {});
    const status = await this.getStatus();

    if (!enabled) {
      const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const back = GUID_RE.test(state.previousScheme || '') ? state.previousScheme : '381b4222-f694-41f0-9685-ff5bb260df2e'; // Equilibrado
      await runPowerShell(`powercfg /setactive ${back}`, 10000);
      db.save();
      this.log('power_plan', 'Plano de energia restaurado', { enabled: true });
      return { success: true, message: 'Plano de energia anterior restaurado.' };
    }

    // Reaproveita o plano criado antes, se ainda existir (evita duplicar a cada clique)
    const schemes = await runPowerShell(`(powercfg /list) -join ' '`, 10000);
    const listText = schemes.raw || (schemes.data ? String(schemes.data) : '');
    let guid = /^[0-9a-f-]{36}$/i.test(state.ultimateGuid || '') && listText.toLowerCase().includes(state.ultimateGuid) ? state.ultimateGuid : null;
    if (!guid) {
      const dup = await runPowerShell(`(powercfg -duplicatescheme ${POWER.ultimate}) -join ' '`, 15000);
      guid = parseGuid(dup.raw || dup.data);
    }
    if (!guid) return { success: false, message: 'O Windows não criou o plano Desempenho Máximo (algumas edições não o oferecem).' };

    state.previousScheme = status.power ? status.power.activeGuid : null;
    state.ultimateGuid = guid;
    db.save();
    await runPowerShell(`powercfg /setactive ${guid}`, 10000);
    this.log('power_plan', 'Plano de energia: Desempenho Máximo', { enabled: false });
    return {
      success: true,
      message: 'Plano Desempenho Máximo ativo: a CPU não entra em estados de economia profundos, reduzindo picos de latência.' +
        (status.isLaptop ? ' Em notebook, isso gasta mais bateria: use na tomada.' : '')
    };
  }

  async setUsbSelectiveSuspend({ enabled }) {
    if (typeof enabled !== 'boolean') return { success: false, message: 'Parâmetro inválido.' };
    const before = await this.getStatus();
    const v = enabled ? 1 : 0;
    await runPowerShell(`powercfg /setacvalueindex SCHEME_CURRENT ${POWER.usbSub} ${POWER.usbSelectiveSuspend} ${v}; powercfg /setdcvalueindex SCHEME_CURRENT ${POWER.usbSub} ${POWER.usbSelectiveSuspend} ${v}; powercfg /setactive SCHEME_CURRENT`, 15000);
    this.log('usb_suspend', `Suspensão seletiva de USB ${enabled ? 'ativada' : 'desativada'}`, { enabled: before.power.usbSelectiveSuspendOn });
    return { success: true, message: enabled ? 'Suspensão seletiva de USB reativada.' : 'Suspensão seletiva de USB desativada: o Windows não desliga mais mouse/headset por economia.' };
  }

  // ---- Rede ----
  async networkTest() {
    if (process.platform !== 'win32') return { available: false, message: 'Disponível apenas no Windows.' };
    const res = await runPowerShell(`
$ErrorActionPreference = 'SilentlyContinue'
$targets = @('1.1.1.1', '8.8.8.8', '208.67.222.222')
$ping = New-Object System.Net.NetworkInformation.Ping
$results = foreach ($t in $targets) {
  $s = @(); for ($i = 0; $i -lt 20; $i++) { try { $r = $ping.Send($t, 1000); if ($r.Status -eq 'Success') { $s += [int]$r.RoundtripTime } else { $s += -1 } } catch { $s += -1 }; Start-Sleep -Milliseconds 100 }
  [PSCustomObject]@{ target = $t; samples = $s }
}
$adapters = @(Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
  $eee = (Get-NetAdapterAdvancedProperty -Name $_.Name -RegistryKeyword '*EEE').RegistryValue
  $pm = (Get-NetAdapterPowerManagement -Name $_.Name).AllowComputerToTurnOffDevice
  [PSCustomObject]@{ name = $_.Name; description = $_.InterfaceDescription; medium = [string]$_.NdisPhysicalMedium; speed = $_.LinkSpeed; eee = $(if ($eee) { [int]$eee[0] } else { $null }); powerSaving = [string]$pm }
})
[PSCustomObject]@{ isAdmin = ${IS_ADMIN}; results = @($results); adapters = $adapters } | ConvertTo-Json -Depth 4 -Compress`, 60000);
    if (!res.success || !res.data) return { available: false, message: 'Não foi possível testar a rede.' };

    const results = (Array.isArray(res.data.results) ? res.data.results : [res.data.results]).filter(Boolean).map(r => {
      const samples = Array.isArray(r.samples) ? r.samples : [r.samples];
      const stats = pingStats(samples.map(v => (v < 0 ? null : v)));
      return { target: r.target, ...stats };
    });
    // Resumo: média dos servidores que responderam, pior jitter e maior perda entre eles
    const answered = results.filter(r => r.avg !== null);
    const summaryStats = answered.length
      ? { avg: Math.round(answered.reduce((a, r) => a + r.avg, 0) / answered.length), jitter: Math.max(...answered.map(r => r.jitter || 0)), loss: Math.max(...results.map(r => r.loss)) }
      : { avg: null, jitter: null, loss: 100 };

    const adapters = (Array.isArray(res.data.adapters) ? res.data.adapters : (res.data.adapters ? [res.data.adapters] : [])).map(a => ({
      name: a.name,
      description: a.description,
      wifi: /802_11|wireless|wi-?fi/i.test(`${a.medium} ${a.description}`),
      speed: a.speed,
      eeeOn: a.eee === null || a.eee === undefined ? null : a.eee !== 0,
      powerSavingOn: /enabled/i.test(a.powerSaving) ? true : (/disabled/i.test(a.powerSaving) ? false : null)
    }));

    return { available: true, isAdmin: Boolean(res.data.isAdmin), results, summary: rateConnection(summaryStats), adapters };
  }

  async setAdapterPowerSaving({ adapter, setting, enabled }) {
    if (!['eee', 'powerSaving'].includes(setting) || typeof enabled !== 'boolean') return { success: false, message: 'Parâmetro inválido.' };
    const test = await this.networkTest();
    const a = (test.adapters || []).find(x => x.name === adapter);
    if (!a) return { success: false, message: 'Placa de rede não encontrada.' };
    if (!test.isAdmin) return { success: false, needsAdmin: true, message: 'Alterar a placa de rede exige administrador.' };
    const nameB64 = Buffer.from(adapter, 'utf8').toString('base64');
    const cmd = setting === 'eee'
      ? `Set-NetAdapterAdvancedProperty -Name $n -RegistryKeyword '*EEE' -RegistryValue ${enabled ? 1 : 0} -NoRestart:$false`
      : `Set-NetAdapterPowerManagement -Name $n -AllowComputerToTurnOffDevice ${enabled ? 'Enabled' : 'Disabled'}`;
    const res = await runPowerShell(`$ErrorActionPreference='Stop'
$n = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${nameB64}'))
try { ${cmd}; '{"ok":true}' } catch { [PSCustomObject]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress }`, 30000);
    if (!(res.success && res.data && res.data.ok)) return { success: false, message: 'A placa recusou a alteração: ' + ((res.data && res.data.error) || 'sem resposta') };
    const label = setting === 'eee' ? 'Energy Efficient Ethernet' : 'Economia de energia da placa';
    this.log('net_' + setting, `${label} ${enabled ? 'ativado' : 'desativado'} (${adapter})`, { adapter, setting, enabled: setting === 'eee' ? a.eeeOn : a.powerSavingOn });
    return { success: true, message: `${label} ${enabled ? 'ativado' : 'desativado'}. A conexão pode cair por alguns segundos enquanto a placa reinicia.` };
  }

  // ---- Registro e reversão ----
  log(kind, title, previous) {
    db.addUpdateLog({ type: 'competitive', title, category: 'Ajustes competitivos', details: 'Pode ser revertido aqui.', competitive: { kind, previous } });
  }

  async revert(item) {
    const c = item.competitive || {};
    const p = c.previous || {};
    switch (c.kind) {
      case 'display': return this.setRefreshRate({ device: p.device, hz: p.hz });
      case 'mouse_accel': return this.setMouseAcceleration({ enabled: Boolean(p.enabled) });
      case 'mouse_speed': return this.setMouseSpeed({ speed: p.speed || 10 });
      case 'gamebar': return this.setGameBarOverlay({ enabled: p.enabled !== false });
      case 'power_plan': return this.setUltimatePlan({ enabled: Boolean(p.enabled) });
      case 'usb_suspend': return this.setUsbSelectiveSuspend({ enabled: p.enabled !== false });
      case 'net_eee':
      case 'net_powerSaving': return this.setAdapterPowerSaving({ adapter: p.adapter, setting: p.setting, enabled: p.enabled !== false });
      default: return { success: false, message: 'Ajuste desconhecido.' };
    }
  }
}

module.exports = new CompetitiveService();
Object.assign(module.exports, { parsePowercfgIndexes, parseGuid, pingStats, rateConnection, analyzeDisplay, overlayMatch, OVERLAYS });
