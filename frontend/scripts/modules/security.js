// frontend/scripts/modules/security.js
/**
 * Aba Segurança: escaneia os processos em execução e explica, em linguagem simples,
 * por que cada processo marcado pode ser malicioso e o que esse tipo costuma fazer.
 */
const SecurityModule = {
  init() {
    document.getElementById('btn-security-scan')?.addEventListener('click', () => this.scan());
  },

  async scan() {
    const btn = document.getElementById('btn-security-scan');
    const summary = document.getElementById('security-summary');
    const box = document.getElementById('security-results');
    if (!box) return;

    btn.disabled = true;
    btn.innerHTML = '<span>Escaneando…</span> <span class="u-spin"><svg class=c-icon aria-hidden=true><use href=#i-loader-circle></use></svg></span>';
    summary.textContent = 'Medindo CPU e GPU de cada processo por 5 segundos e lendo assinaturas, linhas de comando e conexões… isso pode levar até 45 segundos.';
    box.innerHTML = '';

    try {
      const d = (await API.scanSecurity()).data || {};
      if (!d.available) { summary.textContent = d.message; return; }

      const flagged = d.processes.filter(p => p.level === 'high' || p.level === 'medium');
      summary.textContent = flagged.length
        ? `${d.total} processos analisados: ${d.summary.high} com risco alto e ${d.summary.medium} com risco médio${d.summary.miners ? ` (${d.summary.miners} com sinais de mineração de criptomoedas)` : ''}.${d.isAdmin ? '' : ' Execute como administrador para analisar também os processos protegidos.'}`
        : `${d.total} processos analisados e nenhum apresentou sinais relevantes de comportamento malicioso.${d.isAdmin ? '' : ' Execute como administrador para uma análise mais completa.'}`;

      flagged.forEach(p => box.appendChild(this.renderProcess(p)));

      if (d.summary.low > 0) {
        const note = document.createElement('p');
        note.className = 'u-text-muted u-mt-md';
        note.style.fontSize = '0.85rem';
        note.textContent = `Outros ${d.summary.low} processos têm sinais leves (por exemplo, apenas sem assinatura digital), comuns em programas legítimos menores, e não foram listados.`;
        box.appendChild(note);
      }

      if (d.defender && d.defender.enabled === false) {
        const warn = document.createElement('p');
        warn.className = 'u-text-warning u-mt-md';
        warn.textContent = 'O Microsoft Defender está desativado neste PC. Se você não usa outro antivírus, ative-o em Segurança do Windows.';
        box.appendChild(warn);
      }
    } catch (err) {
      summary.textContent = 'Erro ao escanear os processos.';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Escanear novamente</span> <svg class=c-icon aria-hidden=true><use href=#i-search></use></svg>';
    }
  },

  renderProcess(p) {
    const card = document.createElement('div');
    card.className = 'c-card u-mb-md';
    card.style.borderLeft = `4px solid var(${p.level === 'high' ? '--color-danger' : '--color-warning'})`;

    const head = document.createElement('div');
    head.className = 'o-flex o-flex--gap-sm';
    head.style.cssText = 'align-items:center; flex-wrap:wrap;';
    const badge = document.createElement('span');
    badge.className = `c-badge c-badge--${p.level === 'high' ? 'danger' : 'warning'}`;
    badge.textContent = (p.level === 'high' ? 'Risco alto' : 'Risco médio') + (p.isMinerSuspect ? ' · Minerador' : '');
    const title = document.createElement('strong');
    title.textContent = `${p.name} (PID ${p.pid})`;
    head.append(badge, title);

    // Mensagem principal no formato pedido
    const msg = document.createElement('p');
    msg.className = 'u-mt-sm';
    msg.textContent = p.isMinerSuspect
      ? `O processo ${p.name} pode ser um minerador de criptomoedas escondido no seu PC.`
      : `O processo ${p.name} pode ser um processo malicioso.`;

    const why = document.createElement('p');
    why.className = 'u-mt-sm u-font-bold';
    why.textContent = 'Por que foi marcado:';
    const reasons = document.createElement('ul');
    reasons.style.cssText = 'margin:4px 0 0 20px;';
    p.reasons.forEach(r => { const li = document.createElement('li'); li.textContent = r; reasons.appendChild(li); });

    const does = document.createElement('p');
    does.className = 'u-mt-sm u-font-bold';
    does.textContent = 'O que esse tipo de programa costuma fazer:';
    const behaviors = document.createElement('ul');
    behaviors.style.cssText = 'margin:4px 0 0 20px;';
    p.behaviors.forEach(b => { const li = document.createElement('li'); li.textContent = b; behaviors.appendChild(li); });

    const rec = document.createElement('p');
    rec.className = 'u-mt-sm';
    rec.textContent = 'Recomendamos utilizar um antivírus (como o Microsoft Defender, já incluso no Windows, ou o Malwarebytes) para verificar e tentar eliminar este processo.';

    const details = document.createElement('p');
    details.className = 'u-text-muted u-mt-sm';
    details.style.cssText = 'font-size:0.8rem; word-break:break-all;';
    details.textContent = [
      p.path ? `Local: ${p.path}` : 'Local: não foi possível ler',
      p.company ? `Empresa: ${p.company}` : null,
      p.signer ? `Assinado por: ${p.signer}` : 'Sem assinatura digital',
      `${p.memoryMb} MB de RAM`,
      p.cpu ? `CPU ${Math.round(p.cpu)}%` : null,
      p.gpu ? `GPU ${Math.round(p.gpu)}%` : null,
      p.connections ? `${p.connections} conexão(ões) de rede` : null
    ].filter(Boolean).join(' • ');

    card.append(head, msg, why, reasons, does, behaviors, rec, details);
    return card;
  }
};
