// backend/src/services/powerPlanService.js
// Desempenho de energia: só usa o que o próprio Windows já tem. Nunca cria (duplica) planos.
// Usado pelo Boost e pelo Competitivo.
//
// PC comum: troca para o plano "Alto desempenho" que vem no Windows.
// PC com Modern Standby (suspensão S0, comum em notebooks e PCs mais novos): o Windows só tem o
// plano Equilibrado e não oferece o Alto desempenho nem para o usuário. Forçar outro plano pode
// deixar o sistema instável. Nesses PCs o app liga o "Modo de energia: Melhor desempenho", do mesmo
// jeito que Configurações › Sistema › Energia faz (PowerSetActiveOverlayScheme), sem trocar de plano.
const { runPowerShell } = require('../utils/powershell');
const db = require('../database/db');

const HIGH = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';      // plano Alto desempenho (vem no Windows)
const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e';  // plano Equilibrado (vem no Windows)
// Modos de energia do Windows (dentro do plano Equilibrado)
const MODE_BEST_PERFORMANCE = 'ded574b5-45a0-4f42-8737-46345c09c238';
const MODE_BALANCED = '00000000-0000-0000-0000-000000000000';
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const GUID_ONLY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const PWR_TYPES = `
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class CwuPwr {
  [DllImport("powrprof.dll")] public static extern bool GetPwrCapabilities(byte[] caps);
  [DllImport("powrprof.dll")] public static extern uint PowerGetEffectiveOverlayScheme(out Guid g);
  [DllImport("powrprof.dll")] public static extern uint PowerSetActiveOverlayScheme(Guid g);
}
"@
`;

// Modern Standby pela API do Windows (independe do idioma): byte 20 de SYSTEM_POWER_CAPABILITIES = AoAc
const STATUS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
${PWR_TYPES}
$caps = New-Object byte[] 256
$ok = [CwuPwr]::GetPwrCapabilities($caps)
$mode = [Guid]::Empty
$modeRc = 1
try { $modeRc = [CwuPwr]::PowerGetEffectiveOverlayScheme([ref]$mode) } catch {}
[PSCustomObject]@{
  active = (powercfg /getactivescheme) -join ' '
  list = (powercfg /list) -join ' '
  modernStandby = [bool]($ok -and $caps[20])
  powerMode = $mode.ToString()
  powerModeSupported = ($modeRc -eq 0)
} | ConvertTo-Json -Compress
`;

const setModeScript = (guid) => `
$ErrorActionPreference = 'Stop'
${PWR_TYPES}
[PSCustomObject]@{ rc = [CwuPwr]::PowerSetActiveOverlayScheme([Guid]'${guid}') } | ConvertTo-Json -Compress
`;

/** Primeiro GUID do texto (pura, testável). */
function parseGuid(text) {
  const m = String(text || '').match(GUID_RE);
  return m ? m[0].toLowerCase() : null;
}

/** Todos os GUIDs de planos listados pelo "powercfg /list" (pura, testável). */
function listGuids(text) {
  return [...new Set((String(text || '').match(GUID_RE) || []).map(g => g.toLowerCase()))];
}

/**
 * Situação a partir da leitura do Windows (pura, testável).
 * method: 'plan' (troca para o Alto desempenho) | 'mode' (Modo de energia Melhor desempenho) | null
 * performanceActive: o desempenho máximo do método já está ligado
 */
function interpret(raw) {
  const plans = listGuids(raw && raw.list);
  const activeGuid = parseGuid(raw && raw.active);
  const modernStandby = Boolean(raw && raw.modernStandby);
  const powerMode = String((raw && raw.powerMode) || '').toLowerCase() || null;
  const powerModeSupported = Boolean(raw && raw.powerModeSupported);
  const hasHigh = plans.includes(HIGH);
  let method = null;
  if (modernStandby) method = powerModeSupported && activeGuid === BALANCED ? 'mode' : null;
  else if (hasHigh) method = 'plan';
  const performanceActive = method === 'mode' ? powerMode === MODE_BEST_PERFORMANCE : activeGuid === HIGH;
  return { activeGuid, plans, modernStandby, hasHigh, powerMode, powerModeSupported, method, performanceActive, highActive: performanceActive };
}

/** Por que não dá para ligar o desempenho máximo, ou null se dá (pura, testável). */
function blockReason(st) {
  if (st.method) return null;
  if (st.modernStandby) return 'Este PC usa Modern Standby e o Windows não deixou mudar o Modo de energia. Nada foi alterado. Mude manualmente em Configurações › Sistema › Energia › Modo de energia › Melhor desempenho.';
  return 'O plano "Alto desempenho" do Windows não está disponível neste PC. Nada foi alterado. Para mais desempenho, use Configurações › Sistema › Energia › Modo de energia › Melhor desempenho.';
}

/** Para qual plano voltar: o anterior, se ainda existir; senão o Equilibrado (pura, testável). */
function restoreTarget(previous, plans) {
  const p = String(previous || '').toLowerCase();
  return GUID_ONLY.test(p) && p !== HIGH && plans.includes(p) ? p : BALANCED;
}

/** Para qual Modo de energia voltar: o anterior, se for válido; senão o Equilibrado (pura, testável). */
function restoreModeTarget(previous) {
  const p = String(previous || '').toLowerCase();
  return GUID_ONLY.test(p) && p !== MODE_BEST_PERFORMANCE ? p : MODE_BALANCED;
}

class PowerPlanService {
  async status() {
    if (process.platform !== 'win32') return { available: false };
    const res = await runPowerShell(STATUS_SCRIPT, 20000);
    if (!res.success || !res.data) return { available: false };
    const st = interpret(res.data);
    return { available: true, ...st, blockReason: blockReason(st) };
  }

  async setPlan(guid) {
    await runPowerShell(`powercfg /setactive ${guid}`, 15000);
    const after = await this.status();
    return after.available && after.activeGuid === guid;
  }

  async setMode(guid) {
    await runPowerShell(setModeScript(guid), 15000);
    const after = await this.status();
    return after.available && after.powerMode === guid;
  }

  /** Liga o desempenho máximo que o Windows oferece neste PC. Guarda o anterior para o Reverter. */
  async enableHigh() {
    if (process.platform !== 'win32') return { success: false, message: 'Disponível apenas no Windows.' };
    const st = await this.status();
    if (!st.available) return { success: false, message: 'Não foi possível ler o plano de energia atual. Nada foi alterado.' };
    if (st.blockReason) return { success: false, blocked: true, message: st.blockReason };
    const state = db.state.powerPlan || (db.state.powerPlan = {});

    if (st.method === 'mode') {
      if (st.performanceActive) return { success: true, already: true, method: 'mode', message: 'O Modo de energia "Melhor desempenho" já está ativo.' };
      state.previousMode = st.powerMode;
      db.save();
      if (!(await this.setMode(MODE_BEST_PERFORMANCE))) {
        return { success: false, method: 'mode', message: 'O Windows não mudou o Modo de energia. Nada foi alterado.' };
      }
      return {
        success: true, method: 'mode',
        message: 'Modo de energia "Melhor desempenho" ativado. Este PC usa Modern Standby e não tem o plano Alto desempenho, então o app usou o modo equivalente das Configurações do Windows.'
      };
    }

    if (st.performanceActive) return { success: true, already: true, method: 'plan', message: 'O plano Alto desempenho já está ativo.' };
    state.previous = st.activeGuid;
    db.save();
    if (!(await this.setPlan(HIGH))) {
      return { success: false, method: 'plan', message: 'O Windows não ativou o plano Alto desempenho. Nada foi alterado.' };
    }
    return { success: true, method: 'plan', message: 'Plano Alto desempenho do Windows ativado.' };
  }

  /** Volta para o plano (ou Modo de energia) anterior. */
  async restore() {
    if (process.platform !== 'win32') return { success: false, message: 'Disponível apenas no Windows.' };
    const st = await this.status();
    if (!st.available) return { success: false, message: 'Não foi possível ler os planos de energia.' };
    const state = db.state.powerPlan || {};

    if (st.method === 'mode') {
      const target = restoreModeTarget(state.previousMode);
      if (st.powerMode === target) return { success: true, message: 'O Modo de energia anterior já está ativo.' };
      if (!(await this.setMode(target))) return { success: false, message: 'O Windows não voltou para o Modo de energia anterior.' };
      return { success: true, message: 'Modo de energia anterior restaurado.' };
    }

    const target = restoreTarget(state.previous, st.plans);
    if (st.activeGuid === target) return { success: true, message: 'O plano de energia anterior já está ativo.' };
    if (!(await this.setPlan(target))) return { success: false, message: 'O Windows não voltou para o plano anterior.' };
    return { success: true, message: target === BALANCED ? 'Plano de energia Equilibrado restaurado.' : 'Plano de energia anterior restaurado.' };
  }
}

module.exports = new PowerPlanService();
Object.assign(module.exports, {
  HIGH, BALANCED, MODE_BEST_PERFORMANCE, MODE_BALANCED,
  parseGuid, listGuids, interpret, blockReason, restoreTarget, restoreModeTarget
});
