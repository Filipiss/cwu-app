// frontend/scripts/modules/specs.js
/**
 * Módulo de System Specs & Pontuação de Hardware
 */
const SpecsModule = {
  data: null,

  async init() {
    this.bindEvents();
    await this.loadSpecs();
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
      tierBadgeEl.style.backgroundColor = `${scores.ratingTier.color}25`;
      tierBadgeEl.style.color = scores.ratingTier.color;
      tierBadgeEl.style.border = `1px solid ${scores.ratingTier.color}60`;
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
      gaugeProgress.style.stroke = scores.ratingTier.color;
    }

    // 2. Renderizar Cards de Componentes
    this.renderComponentCard('cpu', {
      category: 'Processador (CPU)',
      name: specs.cpu.name,
      details: `${specs.cpu.cores} Núcleos / ${specs.cpu.threads} Threads • ${specs.cpu.clockGhz ? specs.cpu.clockGhz + ' GHz' : 'Clock Dinâmico'}`,
      score: scores.components.cpu.score,
      status: scores.components.cpu.status,
      icon: '⚡'
    });

    this.renderComponentCard('gpu', {
      category: 'Placa de Vídeo (GPU)',
      name: specs.gpu.name,
      details: `${specs.gpu.vramGb > 0 ? specs.gpu.vramGb + ' GB VRAM • ' : ''}Driver: ${specs.gpu.driverVersion}`,
      score: scores.components.gpu.score,
      status: scores.components.gpu.status,
      icon: '🎮'
    });

    this.renderComponentCard('ram', {
      category: 'Memória RAM',
      name: `${specs.ram.totalGb} GB ${specs.ram.type || "RAM"}${specs.ram.speedMhz ? " @ " + specs.ram.speedMhz + " MHz" : ""}`,
      details: `${specs.ram.freeGb} GB livres de ${specs.ram.usableGb || specs.ram.totalGb} GB utilizáveis${specs.ram.singleChannel ? " • ⚠️ 1 pente (canal simples)" : ""}`,
      score: scores.components.ram.score,
      status: scores.components.ram.status,
      icon: '🧠'
    });

    this.renderComponentCard('storage', {
      category: 'Armazenamento Principal',
      name: specs.storage.driveType,
      details: `${specs.storage.model} • ${specs.storage.sizeGb} GB${specs.storage.health ? " • Saúde: " + specs.storage.health : ""}${(specs.disks || []).length > 1 ? " • +" + (specs.disks.length - 1) + " disco(s)" : ""}`,
      score: scores.components.storage.score,
      status: scores.components.storage.status,
      icon: '💾'
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
