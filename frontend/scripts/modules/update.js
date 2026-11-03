// frontend/scripts/modules/update.js
/**
 * Módulo de Atualizações Oficiais de Drivers
 */
const UpdateModule = {
  drivers: [],

  async init() {
    this.bindEvents();
    await this.loadDrivers();
  },

  bindEvents() {
    const filterBtns = document.querySelectorAll('.js-filter-driver');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        filterBtns.forEach(b => b.classList.remove('c-btn--primary'));
        filterBtns.forEach(b => b.classList.add('c-btn--secondary'));
        btn.classList.remove('c-btn--secondary');
        btn.classList.add('c-btn--primary');

        const category = btn.dataset.category;
        this.filterDrivers(category);
      });
    });
  },

  async loadDrivers() {
    const container = document.getElementById('update-drivers-list');
    try {
      const res = await API.getOutdatedDrivers();
      if (res.success) {
        this.drivers = res.data;
        this.render(this.drivers);
      }
    } catch (err) {
      console.error('Erro ao buscar lista de drivers para atualizar:', err);
      if (container) {
        container.innerHTML = `<div class="c-card u-text-center u-text-muted">Falha ao carregar lista de atualizações.</div>`;
      }
    }
  },

  filterDrivers(category) {
    if (!category || category === 'all') {
      this.render(this.drivers);
    } else {
      const filtered = this.drivers.filter(d => 
        (d.category || '').toLowerCase().includes(category.toLowerCase())
      );
      this.render(filtered);
    }
  },

  render(items) {
    const container = document.getElementById('update-drivers-list');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="c-card u-text-center">
          <p class="u-text-success u-font-bold">✓ Nenhum driver pendente nesta categoria.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="o-grid o-grid--2">
        ${items.map(item => `
          <div class="c-card">
            <div class="c-card__header">
              <div>
                <span class="c-badge c-badge--info u-mb-sm">${item.category}</span>
                <h3 class="c-card__title">${item.name}</h3>
                <span class="c-card__subtitle">${item.manufacturer}</span>
              </div>
            </div>
            <div class="c-card__body">
              <p class="u-mb-md">${item.description}</p>
              <div class="o-flex o-flex--between o-flex--gap-sm">
                <a href="${item.officialUrl}" target="_blank" rel="noopener noreferrer" class="c-btn c-btn--outline c-btn--sm" title="Página oficial do fornecedor">
                  <span>Portal Oficial</span> ↗
                </a>
                ${item.autoDetectUrl ? `
                  <a href="${item.autoDetectUrl}" target="_blank" rel="noopener noreferrer" class="c-btn c-btn--primary c-btn--sm" title="Instalador com auto-detecção">
                    <span>Instalador Auto-Detect</span> ⚡
                  </a>
                ` : `
                  <a href="${item.officialUrl}" target="_blank" rel="noopener noreferrer" class="c-btn c-btn--primary c-btn--sm">
                    <span>Baixar</span> ⬇
                  </a>
                `}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
};
