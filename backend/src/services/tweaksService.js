// backend/src/services/tweaksService.js
// Ajustes reais de jogos do Windows (os mesmos de Configurações › Jogos / Vídeo)
// e diagnóstico de memória RAM (XMP/EXPO, canais, pentes).
const { runPowerShell } = require('../utils/powershell');
const db = require('../database/db');

const TWEAKS = {
  game_mode: {
    title: 'Modo de Jogo do Windows',
    description: 'Prioriza o jogo em foco e evita que o Windows Update instale drivers ou mostre notificações durante a partida.',
    recommended: true, needsAdmin: false, needsReboot: false
  },
  hags: {
    title: 'Agendamento de GPU acelerado por hardware (HAGS)',
    description: 'A própria placa de vídeo gerencia sua memória, reduzindo latência. Exige GPU compatível (GTX 10/RX 5000 ou mais novas) e é obrigatório para o DLSS Frame Generation.',
    recommended: true, needsAdmin: true, needsReboot: true
  },
  windowed_opt: {
    title: 'Otimizações para jogos em janela',
    description: 'Jogos DirectX 10/11 em janela ou tela cheia sem bordas passam a usar o modelo de apresentação moderno: menos latência e suporte a VRR. Windows 11.',
    recommended: true, needsAdmin: false, needsReboot: false
  },
  game_dvr: {
    title: 'Gravação em segundo plano (Xbox Game Bar)',
    description: 'Grava continuamente os últimos minutos de jogo para o recurso "gravar o que aconteceu". Consome GPU e disco o tempo todo; desligue se não usa.',
    recommended: false, needsAdmin: false, needsReboot: false
  }
};

const STATUS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
[PSCustomObject]@{
  isAdmin = $isAdmin
  build = [int](Get-CimInstance Win32_OperatingSystem).BuildNumber
  gameMode = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\GameBar').AutoGameModeEnabled
  hags = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers').HwSchMode
  dxSettings = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences').DirectXUserGlobalSettings
  historical = (Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR').HistoricalCaptureEnabled
} | ConvertTo-Json -Compress
`;

// Lê "Chave=1;Outra=0;" (formato do DirectXUserGlobalSettings)
function parseDxSettings(str) {
  const map = {};
  String(str || '').split(';').forEach(pair => {
    const [k, v] = pair.split('=');
    if (k && k.trim()) map[k.trim()] = (v || '').trim();
  });
  return map;
}

function serializeDxSettings(map) {
  return Object.entries(map).map(([k, v]) => `${k}=${v};`).join('');
}

// Converte os valores brutos do registro em ligado/desligado (null = padrão desconhecido)
function interpretStatus(raw) {
  const dx = parseDxSettings(raw.dxSettings);
  return {
    // Sem valor = ativado (padrão desde o Windows 10 1903)
    game_mode: raw.gameMode === null || raw.gameMode === undefined ? true : raw.gameMode === 1,
    // HwSchMode: 2 = ligado, 1 = desligado, ausente = padrão do driver/sistema
    hags: raw.hags === 2 ? true : (raw.hags === 1 ? false : null),
    windowed_opt: dx.SwapEffectUpgradeEnable === '1',
    // Sem valor = desligado no Windows 11 atual
    game_dvr: raw.historical === 1
  };
}

const DDR_JEDEC_MAX = { DDR4: 2666, DDR5: 4800 };
const MEMORY_TYPES = { 24: 'DDR3', 26: 'DDR4', 34: 'DDR5', 35: 'LPDDR5' };

// Analisa os pentes de memória e gera avisos acionáveis
function analyzeRam(modules, totalSlots) {
  const issues = [];
  if (!modules.length) return { modules: [], issues: [{ level: 'info', text: 'Não foi possível ler os pentes de memória.' }] };

  const type = MEMORY_TYPES[modules[0].smbiosType] || null;
  const speeds = modules.map(m => m.configuredMhz || m.ratedMhz || 0).filter(Boolean);
  const configured = speeds.length ? Math.min(...speeds) : 0;
  const rated = Math.max(0, ...modules.map(m => m.ratedMhz || 0));

  if (rated && configured && configured < rated - 50) {
    issues.push({ level: 'warning', text: `A memória está a ${configured} MHz, mas os pentes suportam ${rated} MHz. Ative o perfil XMP (Intel) ou EXPO/DOCP (AMD) na BIOS para ganhar desempenho de graça.` });
  } else if (type && DDR_JEDEC_MAX[type] && configured && configured <= DDR_JEDEC_MAX[type]) {
    issues.push({ level: 'info', text: `${type} a ${configured} MHz é a velocidade padrão (JEDEC). Se os seus pentes forem vendidos como mais rápidos (ex.: ${type === 'DDR4' ? '3200/3600' : '6000'} MHz), ative o XMP/EXPO na BIOS.` });
  } else if (configured) {
    issues.push({ level: 'ok', text: `Memória rodando a ${configured} MHz, perto da velocidade nominal.` });
  }

  if (modules.length === 1) {
    issues.push({ level: 'warning', text: `Só 1 pente instalado: a memória roda em canal simples (single channel), com cerca de metade da largura de banda. Adicionar um segundo pente igual melhora FPS, principalmente em vídeo integrado.${totalSlots > 1 ? ` A placa tem ${totalSlots} slots.` : ''}` });
  } else if (modules.length === 3) {
    issues.push({ level: 'warning', text: 'Número ímpar de pentes (3): parte da memória pode rodar em canal simples.' });
  }

  const capacities = new Set(modules.map(m => m.capacityGb));
  if (capacities.size > 1) issues.push({ level: 'warning', text: 'Pentes de tamanhos diferentes: o dual channel pode funcionar só em parte da memória.' });
  const parts = new Set(modules.map(m => m.partNumber).filter(Boolean));
  if (parts.size > 1) issues.push({ level: 'info', text: 'Pentes de modelos diferentes: se houver travamentos com XMP ativo, pode ser incompatibilidade entre eles.' });

  return { type, configuredMhz: configured || null, ratedMhz: rated || null, totalSlots: totalSlots || null, modules, issues };
}

class TweaksService {
  async getStatus() {
    if (process.platform !== 'win32') return { available: false, message: 'Disponível apenas no Windows.', tweaks: [] };
    const res = await runPowerShell(STATUS_SCRIPT, 15000);
    if (!res.success || !res.data) return { available: false, message: 'Não foi possível ler as configurações.', tweaks: [] };

    const state = interpretStatus(res.data);
    const isWin11 = (res.data.build || 0) >= 22000;
    return {
      available: true,
      isAdmin: Boolean(res.data.isAdmin),
      tweaks: Object.entries(TWEAKS)
        .filter(([id]) => id !== 'windowed_opt' || isWin11)
        .map(([id, t]) => ({ id, ...t, enabled: state[id], isRecommended: state[id] === t.recommended }))
    };
  }

  async set({ id, enabled }) {
    if (process.platform !== 'win32') return { success: false, message: 'Disponível apenas no Windows.' };
    if (!Object.prototype.hasOwnProperty.call(TWEAKS, id) || typeof enabled !== 'boolean') {
      return { success: false, message: 'Ajuste inválido.' };
    }
    const tweak = TWEAKS[id];
    const status = await this.getStatus();
    if (tweak.needsAdmin && !status.isAdmin) {
      return { success: false, needsAdmin: true, message: `"${tweak.title}" exige administrador.` };
    }
    const previous = (status.tweaks.find(t => t.id === id) || {}).enabled;


    const on = enabled ? 1 : 0;
    const scripts = {
      game_mode: `$k='HKCU:\\Software\\Microsoft\\GameBar'; if(!(Test-Path $k)){New-Item $k -Force|Out-Null}; New-ItemProperty $k -Name AutoGameModeEnabled -Value ${on} -PropertyType DWord -Force|Out-Null`,
      hags: `New-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name HwSchMode -Value ${enabled ? 2 : 1} -PropertyType DWord -Force|Out-Null`,
      game_dvr: `$k='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR'; if(!(Test-Path $k)){New-Item $k -Force|Out-Null}; New-ItemProperty $k -Name HistoricalCaptureEnabled -Value ${on} -PropertyType DWord -Force|Out-Null`
    };

    let script;
    if (id === 'windowed_opt') {
      // Preserva as outras chaves da string (ex.: VRROptimizeEnable, AutoHDREnable)
      const raw = await runPowerShell(`(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences' -ErrorAction SilentlyContinue).DirectXUserGlobalSettings | ConvertTo-Json -Compress`, 10000);
      const map = parseDxSettings(raw.success ? raw.data : '');
      map.SwapEffectUpgradeEnable = String(on);
      const value = serializeDxSettings(map).replace(/'/g, "''");
      script = `$k='HKCU:\\Software\\Microsoft\\DirectX\\UserGpuPreferences'; if(!(Test-Path $k)){New-Item $k -Force|Out-Null}; New-ItemProperty $k -Name DirectXUserGlobalSettings -Value '${value}' -PropertyType String -Force|Out-Null`;
    } else {
      script = scripts[id];
    }

    const res = await runPowerShell(`$ErrorActionPreference='Stop'; try { ${script}; '{"ok":true}' } catch { [PSCustomObject]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress }`, 15000);
    const d = res.success && res.data ? res.data : null;
    if (!d || !d.ok) return { success: false, message: 'Falha ao aplicar: ' + ((d && d.error) || res.error || 'sem resposta') };

    db.addUpdateLog({
      type: 'tweak',
      title: `${tweak.title}: ${enabled ? 'ativado' : 'desativado'}`,
      category: 'Ajustes de jogos do Windows',
      details: tweak.needsReboot ? 'Requer reinicialização para valer.' : 'Aplicado imediatamente.',
      tweakId: id,
      tweakPrevious: previous
    });

    return {
      success: true,
      message: `${tweak.title} ${enabled ? 'ativado' : 'desativado'}.${tweak.needsReboot ? ' Reinicie o PC para valer.' : ''}`
    };
  }

  async ramDiagnostic() {
    if (process.platform !== 'win32') return { available: false, message: 'Disponível apenas no Windows.' };
    const res = await runPowerShell(`
$ErrorActionPreference = 'SilentlyContinue'
[PSCustomObject]@{
  slots = (Get-CimInstance Win32_PhysicalMemoryArray | Measure-Object MemoryDevices -Sum).Sum
  modules = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, Speed, ConfiguredClockSpeed, Manufacturer, PartNumber, DeviceLocator, BankLabel, SMBIOSMemoryType)
} | ConvertTo-Json -Depth 3 -Compress`, 15000);
    if (!res.success || !res.data) return { available: false, message: 'Não foi possível ler a memória RAM.' };

    const list = Array.isArray(res.data.modules) ? res.data.modules : (res.data.modules ? [res.data.modules] : []);
    const modules = list.filter(m => m && m.Capacity).map(m => ({
      slot: [m.BankLabel, m.DeviceLocator].filter(Boolean).join(' / ') || 'Slot',
      capacityGb: Math.round(Number(m.Capacity) / 1024 ** 3),
      ratedMhz: m.Speed || null,
      configuredMhz: m.ConfiguredClockSpeed || null,
      manufacturer: (m.Manufacturer || '').trim() || null,
      partNumber: (m.PartNumber || '').trim() || null,
      smbiosType: m.SMBIOSMemoryType
    }));
    return { available: true, ...analyzeRam(modules, res.data.slots) };
  }
}

module.exports = new TweaksService();
module.exports.analyzeRam = analyzeRam;
module.exports.interpretStatus = interpretStatus;
module.exports.parseDxSettings = parseDxSettings;
module.exports.serializeDxSettings = serializeDxSettings;
