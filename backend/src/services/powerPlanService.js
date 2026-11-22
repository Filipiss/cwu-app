// backend/src/services/powerPlanService.js
// Plano de energia: só alterna entre os planos que o próprio Windows já tem.
// Nunca cria (duplica) planos. Usado pelo Boost e pelo Competitivo.
//
// Em PCs com Modern Standby (suspensão S0, comum em notebooks e PCs mais novos), a Microsoft
// só suporta o plano Equilibrado: forçar outro plano pode deixar o sistema instável (drivers de
// vídeo, chipset ou SSD travando). Nesses PCs o app não troca o plano e indica o "Modo de energia".
const { runPowerShell } = require('../utils/powershell');
const db = require('../database/db');

const HIGH = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';      // Alto desempenho (vem no Windows)
const BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e';  // Equilibrado (vem no Windows)
const GUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const POWER_MODE_HINT = 'Para mais desempenho, use Configurações › Sistema › Energia › Modo de energia › Melhor desempenho.';

// Modern Standby pela API do Windows (independe do idioma): byte 20 de SYSTEM_POWER_CAPABILITIES = AoAc
const STATUS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class CwuPwrCaps { [DllImport("powrprof.dll")] public static extern bool GetPwrCapabilities(byte[] caps); }
"@
$caps = New-Object byte[] 256
$ok = [CwuPwrCaps]::GetPwrCapabilities($caps)
[PSCustomObject]@{
  active = (powercfg /getactivescheme) -join ' '
  list = (powercfg /list) -join ' '
  modernStandby = [bool]($ok -and $caps[20])
} | ConvertTo-Json -Compress
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

/** Situação do plano a partir da leitura do Windows (pura, testável). */
function interpret(raw) {
  const plans = listGuids(raw && raw.list);
  const activeGuid = parseGuid(raw && raw.active);
  return {
    activeGuid,
    plans,
    modernStandby: Boolean(raw && raw.modernStandby),
    hasHigh: plans.includes(HIGH),
    highActive: activeGuid === HIGH
  };
}

/** Por que não dá para ligar o Alto desempenho, ou null se dá (pura, testável). */
function blockReason(st) {
  if (st.modernStandby) return `Este PC usa Modern Standby: nele o Windows só suporta o plano Equilibrado, e trocar de plano pode deixar o sistema instável. Nada foi alterado. ${POWER_MODE_HINT}`;
  if (!st.hasHigh) return `O plano "Alto desempenho" do Windows não está disponível neste PC. Nada foi alterado. ${POWER_MODE_HINT}`;
  return null;
}

/** Para qual plano voltar: o anterior, se ainda existir; senão o Equilibrado (pura, testável). */
function restoreTarget(previous, plans) {
  const p = String(previous || '').toLowerCase();
  return /^[0-9a-f-]{36}$/.test(p) && p !== HIGH && plans.includes(p) ? p : BALANCED;
}

class PowerPlanService {
  async status() {
    if (process.platform !== 'win32') return { available: false };
    const res = await runPowerShell(STATUS_SCRIPT, 20000);
    if (!res.success || !res.data) return { available: false };
    const st = interpret(res.data);
    return { available: true, ...st, blockReason: blockReason(st) };
  }

  async setActive(guid) {
    await runPowerShell(`powercfg /setactive ${guid}`, 15000);
    const after = await this.status();
    return after.available && after.activeGuid === guid;
  }

  /** Liga o Alto desempenho do Windows. Guarda o plano anterior para o Reverter. */
  async enableHigh() {
    if (process.platform !== 'win32') return { success: false, message: 'Disponível apenas no Windows.' };
    const st = await this.status();
    if (!st.available) return { success: false, message: 'Não foi possível ler o plano de energia atual. Nada foi alterado.' };
    if (st.blockReason) return { success: false, blocked: true, message: st.blockReason };
    if (st.highActive) return { success: true, already: true, previous: (db.state.powerPlan || {}).previous || BALANCED, message: 'O plano Alto desempenho já está ativo.' };

    const state = db.state.powerPlan || (db.state.powerPlan = {});
    state.previous = st.activeGuid;
    db.save();
    if (!(await this.setActive(HIGH))) {
      return { success: false, message: 'O Windows não ativou o plano Alto desempenho. Nada foi alterado.' };
    }
    return { success: true, previous: st.activeGuid, message: 'Plano Alto desempenho do Windows ativado.' };
  }

  /** Volta para o plano anterior (ou para o Equilibrado, se ele não existir mais). */
  async restore(previous) {
    if (process.platform !== 'win32') return { success: false, message: 'Disponível apenas no Windows.' };
    const st = await this.status();
    if (!st.available) return { success: false, message: 'Não foi possível ler os planos de energia.' };
    const target = restoreTarget(previous || (db.state.powerPlan || {}).previous, st.plans);
    if (st.activeGuid === target) return { success: true, message: 'O plano de energia anterior já está ativo.' };
    if (!(await this.setActive(target))) return { success: false, message: 'O Windows não voltou para o plano anterior.' };
    return { success: true, message: target === BALANCED ? 'Plano de energia Equilibrado restaurado.' : 'Plano de energia anterior restaurado.' };
  }
}

module.exports = new PowerPlanService();
Object.assign(module.exports, { HIGH, BALANCED, parseGuid, listGuids, interpret, blockReason, restoreTarget });
