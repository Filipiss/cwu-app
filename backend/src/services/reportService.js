// backend/src/services/reportService.js
// Gera um relatório HTML autocontido (sem scripts externos) com specs, drivers e erros.
const os = require('os');
const config = require('../config');
const specsService = require('./specsService');
const driverService = require('./driverService');
const logsService = require('./logsService');

const esc = (v) => String(v === null || v === undefined ? '—' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const row = (label, value) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;

class ReportService {
  async buildHtml() {
    // As três leituras rodam em paralelo (cada uma é um processo PowerShell)
    const [specsData, drivers, logs] = await Promise.all([
      specsService.getSystemSpecs(),
      driverService.scanDrivers(),
      logsService.getSystemErrorLogs()
    ]);
    const { specs, scores } = specsData;
    const now = new Date();

    const diskRows = (specs.disks || []).map(d =>
      `<tr><td>${esc(d.model)}</td><td>${esc(d.driveType)}</td><td>${esc(d.sizeGb)} GB</td><td>${esc(d.health)}</td></tr>`).join('')
      || '<tr><td colspan="4">Não detectado</td></tr>';

    const gpuRows = (specs.gpus || []).map(g =>
      `<tr><td>${esc(g.name)}</td><td>${g.vramGb ? esc(g.vramGb + ' GB') : '—'}</td><td>${esc(g.driverVersion)}</td></tr>`).join('')
      || '<tr><td colspan="3">Não detectado</td></tr>';

    const pending = (drivers.items || []).filter(d => d.status !== 'updated');
    const driverRows = pending.map(d =>
      `<tr><td>${esc(d.name)}</td><td>${esc(d.category)}</td><td>${esc(d.currentVersion)}</td><td>${esc(d.statusText)}</td></tr>`).join('')
      || `<tr><td colspan="4">${drivers.scanAvailable ? 'Nenhum driver com problema 🎉' : esc(drivers.message)}</td></tr>`;

    const eventRows = (logs.events || []).slice(0, 25).map(e =>
      `<tr><td>${esc(e.severity)}</td><td>${esc(e.title)}${e.occurrences > 1 ? ` (×${e.occurrences})` : ''}</td><td>${esc(e.date)}</td><td>${esc(e.recommendation)}</td></tr>`).join('')
      || `<tr><td colspan="4">${esc(logs.message || 'Nenhum erro relevante.')}</td></tr>`;

    const comp = scores.components;
    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório CWU App — ${esc(os.hostname())}</title>
<style>
  :root { color-scheme: light dark; --b:#d0d7de; --m:#57606a; --a:#0969da; }
  body { font: 14px/1.5 system-ui, Segoe UI, sans-serif; max-width: 960px; margin: 24px auto; padding: 0 16px; }
  h1 { margin: 0 } h2 { margin-top: 32px; border-bottom: 2px solid var(--a); padding-bottom: 4px; }
  .muted { color: var(--m) } table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--b); vertical-align: top; }
  th { width: 220px; font-weight: 600 } .score { font-size: 32px; font-weight: 700; color: var(--a) }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
  .box { border: 1px solid var(--b); border-radius: 8px; padding: 10px; }
  @media print { body { margin: 0 } }
</style></head><body>
<h1>Relatório do computador</h1>
<p class="muted">${esc(os.hostname())} · gerado em ${esc(now.toLocaleString('pt-BR'))} pelo ${esc(config.appName)} v${esc(config.appVersion)}</p>

<h2>Nota geral</h2>
<p><span class="score">${esc(scores.overall)}</span> / 10 — ${esc(scores.ratingTier.label)}${scores.partial ? ' (parcial: alguns componentes não foram detectados)' : ''}</p>
<div class="grid">
  <div class="box"><b>CPU</b><br>${esc(comp.cpu.score)} · ${esc(comp.cpu.status)}</div>
  <div class="box"><b>GPU</b><br>${esc(comp.gpu.score)} · ${esc(comp.gpu.status)}</div>
  <div class="box"><b>RAM</b><br>${esc(comp.ram.score)} · ${esc(comp.ram.status)}</div>
  <div class="box"><b>Armazenamento</b><br>${esc(comp.storage.score)} · ${esc(comp.storage.status)}</div>
</div>

<h2>Hardware</h2>
<table>
  ${row('Processador', `${specs.cpu.name}${specs.cpu.cores ? ` (${specs.cpu.cores}C/${specs.cpu.threads}T)` : ''}`)}
  ${row('Memória RAM', `${specs.ram.totalGb} GB ${specs.ram.type || ''} ${specs.ram.speedMhz ? specs.ram.speedMhz + ' MHz' : ''} · ${specs.ram.slotsUsed || '?'} pente(s)`)}
  ${row('Placa-mãe', `${specs.motherboard.manufacturer} ${specs.motherboard.model}`)}
  ${row('BIOS', specs.motherboard.biosVersion ? `${specs.motherboard.biosVersion}${specs.motherboard.biosDate ? ' (' + new Date(specs.motherboard.biosDate).toLocaleDateString('pt-BR') + ')' : ''}` : null)}
  ${row('Sistema', `${specs.os.caption} ${specs.os.architecture} (build ${specs.os.build || specs.os.version})`)}
</table>
<h3>Placas de vídeo</h3>
<table><tr><th>Modelo</th><th>VRAM</th><th>Driver</th></tr>${gpuRows}</table>
<h3>Discos</h3>
<table><tr><th>Modelo</th><th>Tipo</th><th>Tamanho</th><th>Saúde</th></tr>${diskRows}</table>

<h2>Drivers que precisam de atenção (${pending.length})</h2>
<table><tr><th>Dispositivo</th><th>Categoria</th><th>Versão</th><th>Situação</th></tr>${driverRows}</table>

<h2>Erros do Windows — últimos ${esc(logs.periodDays)} dias</h2>
<p>${esc(logs.bsodCount)} tela(s) azul(is) · ${esc(logs.unexpectedShutdowns)} desligamento(s) inesperado(s) · ${esc((logs.minidumps || []).length)} minidump(s)</p>
<table><tr><th>Gravidade</th><th>Evento</th><th>Último</th><th>Recomendação</th></tr>${eventRows}</table>

<p class="muted" style="margin-top:32px">Relatório gerado localmente. Nenhum dado foi enviado para a internet.</p>
</body></html>`;
  }
}

module.exports = new ReportService();
