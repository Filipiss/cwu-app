// frontend/scripts/modules/specs.js
/**
 * Módulo de System Specs & Pontuação de Hardware
 */
const SpecsModule = {
  // Cor da faixa pela paleta do tema ativo (verde/acento/amarelo/vermelho)
  tierColor(scores) {
    const n = Number(scores.overall) || 0;
    if (n >= 8) return 'var(--color-success)';
    if (n >= 6.5) return 'var(--color-primary)';
    if (n >= 5) return 'var(--color-warning)';
    return 'var(--color-danger)';
  },

  data: null,

  async init() {
    this.bindEvents();
    await this.loadSpecs();
    this.loadDiskHealth();
  },

  async loadDiskHealth() {
    const box = document.getElementById('disk-health-list');
    if (!box) return;
    let d;
    try { d = (await API.request('/api/specs/disks')).data || {}; } catch (e) { d = { disks: [] }; }
    const esc = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    if (!d.disks || !d.disks.length) {
      box.innerHTML = `<p class="c-card__desc">${d.supported === false ? 'Disponível apenas no Windows.' : 'Não foi possível ler os discos.'}</p>`;
      return;
    }
    const badge = { good: ['success', 'Saudável'], warn: ['warning', 'Atenção'], bad: ['danger', 'Crítico'] };
    const fmtHours = (h) => h === null ? '—' : (h >= 24 * 365 ? `${(h / 8760).toFixed(1).replace('.', ',')} anos` : `${Math.round(h).toLocaleString('pt-BR')} h`);
    const missing = d.disks.every(x => x.lifeRemaining === null && x.temperature === null && x.powerOnHours === null);
    box.innerHTML = d.disks.map(x => {
      const [cls, label] = badge[x.status] || badge.good;
      const life = x.lifeRemaining;
      return `<div class="c-disk">
        <div class="c-disk__head">
          <div><div class="c-disk__name">${esc(x.model)}</div><div class="c-card__desc">${esc(x.type)}${x.sizeGb ? ' • ' + x.sizeGb + ' GB' : ''} • Windows: ${esc(x.health)}</div></div>
          <span class="c-badge c-badge--${cls}">${label}</span>
        </div>
        <div class="c-disk__life">
          <div class="c-disk__life-label"><span>Vida útil restante</span><strong>${life === null ? (x.type === 'HD' ? 'HDs não informam' : 'Não informado') : life + '%'}</strong></div>
          <div class="c-disk__bar"><span class="c-disk__bar-fill c-disk__bar-fill--${cls}" style="width:${life ?? 0}%"></span></div>
        </div>
        <div class="c-disk__stats">
          <div><span>Temperatura</span><strong>${x.temperature === null ? '—' : x.temperature + ' °C'}</strong></div>
          <div><span>Tempo ligado</span><strong>${fmtHours(x.powerOnHours)}</strong></div>
          <div><span>Erros sem correção</span><strong>${x.errors}</strong></div>
        </div>
        ${x.notes.length ? `<ul class="c-disk__notes">${x.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      </div>`;
    }).join('') + (missing && !d.isAdmin ? '<p class="c-card__desc">O Windows só libera desgaste, temperatura e horas ligado para administrador. Use "Reiniciar como administrador" para ver tudo.</p>' : '');
  },

  bindEvents() {
    const refreshBtn = document.getElementById('btn-refresh-specs');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.loadSpecs(true);
      });
    }
  },

  async loadSpecs(forceRefresh = false) {
    const container = document.getElementById('specs-container');
    const refreshBtn = document.getElementById('btn-refresh-specs');

    try {
      if (refreshBtn) {
        refreshBtn.classList.add('u-spin');
        refreshBtn.disabled = true;
      }

      if (!this.data || forceRefresh) {
        const res = await API.getSpecs();
        if (res.success) {
          this.data = res.data;
        }
      }

      this.render();
      if (forceRefresh) {
        App.showToast('Especificações e pontuações atualizadas!', 'success');
      }
    } catch (err) {
      console.error('Erro ao carregar specs:', err);
      App.showToast('Falha ao ler hardware do computador', 'danger');
    } finally {
      if (refreshBtn) {
        refreshBtn.classList.remove('u-spin');
        refreshBtn.disabled = false;
      }
    }
  },

  render() {
    if (!this.data) return;

    const { specs, scores } = this.data;

    // 1. Mostrador de Pontuação Geral (Overall Score)
    const scoreValEl = document.getElementById('overall-score-val');
    const tierBadgeEl = document.getElementById('overall-score-tier');
    const tierSummaryEl = document.getElementById('overall-score-summary');
    const gaugeProgress = document.getElementById('score-gauge-progress');

    if (scoreValEl) scoreValEl.textContent = scores.overall.toFixed(1);
    if (tierBadgeEl) {
      tierBadgeEl.textContent = scores.ratingTier.label;
      tierBadgeEl.style.backgroundColor = `color-mix(in srgb, ${this.tierColor(scores)} 14%, transparent)`;
      tierBadgeEl.style.color = this.tierColor(scores);
      tierBadgeEl.style.border = `1px solid color-mix(in srgb, ${this.tierColor(scores)} 40%, transparent)`;
    }
    if (tierSummaryEl) tierSummaryEl.textContent = scores.ratingTier.summary;

    // Animação da circunferência do SVG (raio 44, circunferência ~ 276.46)
    if (gaugeProgress) {
      const radius = 44;
      const circumference = 2 * Math.PI * radius;
      const percent = scores.overall / 10;
      const offset = circumference - (percent * circumference);
      gaugeProgress.style.strokeDasharray = `${circumference}`;
      gaugeProgress.style.strokeDashoffset = `${offset}`;
      gaugeProgress.style.stroke = this.tierColor(scores);
    }

    // 2. Renderizar Cards de Componentes
    this.renderComponentCard('cpu', {
      category: 'Processador (CPU)',
      name: specs.cpu.name,
      details: `${specs.cpu.cores} Núcleos / ${specs.cpu.threads} Threads • ${specs.cpu.clockGhz ? specs.cpu.clockGhz + ' GHz' : 'Clock Dinâmico'}`,
      score: scores.components.cpu.score,
      status: scores.components.cpu.status,
      icon: ''
    });

    this.renderComponentCard('gpu', {
      category: 'Placa de Vídeo (GPU)',
      name: specs.gpu.name,
      details: `${specs.gpu.vramGb > 0 ? specs.gpu.vramGb + ' GB VRAM • ' : ''}Driver: ${specs.gpu.driverVersion}`,
      score: scores.components.gpu.score,
      status: scores.components.gpu.status,
      icon: ''
    });

    this.renderComponentCard('ram', {
      category: 'Memória RAM',
      name: `${specs.ram.totalGb} GB ${specs.ram.type || "RAM"}${specs.ram.speedMhz ? " @ " + specs.ram.speedMhz + " MHz" : ""}`,
      details: `${specs.ram.freeGb} GB livres de ${specs.ram.usableGb || specs.ram.totalGb} GB utilizáveis${specs.ram.singleChannel ? " • 1 pente (canal simples)" : ""}`,
      score: scores.components.ram.score,
      status: scores.components.ram.status,
      icon: ''
    });

    this.renderComponentCard('storage', {
      category: 'Armazenamento Principal',
      name: specs.storage.driveType,
      details: `${specs.storage.model} • ${specs.storage.sizeGb} GB${specs.storage.health ? " • Saúde: " + specs.storage.health : ""}${(specs.disks || []).length > 1 ? " • +" + (specs.disks.length - 1) + " disco(s)" : ""}`,
      score: scores.components.storage.score,
      status: scores.components.storage.status,
      icon: ''
    });

    // 3. Informações da Placa-Mãe e Windows
    const boardEl = document.getElementById('spec-motherboard');
    const osEl = document.getElementById('spec-os');
    if (boardEl) boardEl.textContent = `${specs.motherboard.manufacturer} ${specs.motherboard.model}`;
    if (osEl) osEl.textContent = `${specs.os.caption} (${specs.os.architecture})`;
  },

  renderComponentCard(id, comp) {
    const nameEl = document.getElementById(`spec-${id}-name`);
    const detailsEl = document.getElementById(`spec-${id}-details`);
    const scoreEl = document.getElementById(`spec-${id}-score`);
    const progressEl = document.getElementById(`spec-${id}-progress`);

    if (nameEl) nameEl.textContent = comp.name;
    if (detailsEl) detailsEl.textContent = comp.details;
    if (scoreEl) {
      scoreEl.textContent = `${comp.score.toFixed(1)} / 10`;
      scoreEl.className = `c-badge c-badge--score ${comp.score >= 8 ? 'c-badge--success' : (comp.score >= 6 ? 'c-badge--info' : 'c-badge--warning')}`;
    }
    if (progressEl) {
      progressEl.style.width = `${(comp.score / 10) * 100}%`;
    }
  }
};
