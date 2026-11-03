// frontend/scripts/modules/softs.js
/**
 * Módulo de Softwares Pós-Formatação
 * Formato: Inicialmente em branco, busca em tempo real com sugestões dinâmicas por caractere,
 * filtros por categoria e listagem ordenada alfabeticamente (A-Z).
 */
const SoftsModule = {
  allSoftwares: [],
  currentCategory: null,
  currentQuery: '',

  async init() {
    this.bindEvents();
    await this.loadSoftwares();
  },

  bindEvents() {
    const searchInput = document.getElementById('soft-search-input');
    const clearBtn = document.getElementById('soft-search-clear');
    const categorySelect = document.getElementById('soft-category-select');

    // Busca a cada caractere digitado
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.currentQuery = e.target.value.trim().toLowerCase();
        if (clearBtn) {
          clearBtn.style.display = this.currentQuery ? 'block' : 'none';
        }
        this.updateSuggestions();
        this.filterAndRender();
      });

      // Tecla Escape limpa a busca
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.clearSearch();
        }
      });
    }

    // Botão Limpar Busca
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearSearch();
      });
    }

    // Filtro Dropdown de Categorias
    if (categorySelect) {
      categorySelect.addEventListener('change', (e) => {
        const val = e.target.value;
        this.currentCategory = val || null;
        this.filterAndRender();
      });
    }
  },

  async loadSoftwares() {
    try {
      const res = await API.getEssentialSoftwares();
      if (res.success && Array.isArray(res.data)) {
        this.allSoftwares = res.data;
      }
    } catch (err) {
      console.error('Erro ao buscar catálogo de softwares:', err);
    }
  },

  clearSearch() {
    const searchInput = document.getElementById('soft-search-input');
    const clearBtn = document.getElementById('soft-search-clear');
    const categorySelect = document.getElementById('soft-category-select');

    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    if (clearBtn) {
      clearBtn.style.display = 'none';
    }
    if (categorySelect) {
      categorySelect.value = '';
    }
    this.currentQuery = '';
    this.currentCategory = null;
    this.updateSuggestions();
    this.filterAndRender();
  },

  /**
   * Sistema de sugestão de busca dinâmica para cada caractere digitado
   */
  updateSuggestions() {
    const container = document.getElementById('soft-suggestions-container');
    if (!container) return;

    if (!this.currentQuery || this.currentQuery.length < 1) {
      container.innerHTML = '';
      return;
    }

    // Encontra termos que combinam com o que está sendo digitado
    const query = this.currentQuery;
    const matches = new Set();

    this.allSoftwares.forEach(sw => {
      // Combinação por nome
      if (sw.name.toLowerCase().includes(query)) {
        // Pega palavras-chave curtas ou nome do app
        const shortName = sw.name.split('(')[0].trim();
        matches.add(shortName);
      }
      // Combinação por tags adicionais
      if (Array.isArray(sw.tags)) {
        sw.tags.forEach(tag => {
          if (tag.toLowerCase().startsWith(query) || tag.toLowerCase().includes(query)) {
            matches.add(tag);
          }
        });
      }
    });

    const suggestions = Array.from(matches).slice(0, 8); // Top 8 sugestões rápidas

    if (suggestions.length === 0) {
      container.innerHTML = `<span class="c-suggestions-label">Nenhuma sugestão rápida encontrada</span>`;
      return;
    }

    container.innerHTML = `
      <span class="c-suggestions-label">Sugestões:</span>
      ${suggestions.map(s => `
        <button class="c-suggestion-pill js-suggestion-pill" data-value="${s}">
          <span>${s}</span> <svg class=c-icon aria-hidden=true><use href=#i-corner-down-left></use></svg>
        </button>
      `).join('')}
    `;

    // Clique na pílula preenche o input e filtra
    container.querySelectorAll('.js-suggestion-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const val = pill.dataset.value;
        const searchInput = document.getElementById('soft-search-input');
        const clearBtn = document.getElementById('soft-search-clear');
        if (searchInput) {
          searchInput.value = val;
          this.currentQuery = val.toLowerCase();
          if (clearBtn) clearBtn.style.display = 'block';
          this.updateSuggestions();
          this.filterAndRender();
        }
      });
    });
  },

  /**
   * Filtra por categoria e busca textual, ordenando estritamente em ordem alfabética (A-Z)
   */
  filterAndRender() {
    const container = document.getElementById('soft-results-container');
    const counterBadge = document.getElementById('soft-results-counter');
    if (!container) return;

    // Se a aba estiver no estado inicial (sem busca e sem filtro selecionado), mantém a tela limpa
    if (!this.currentCategory && !this.currentQuery) {
      container.innerHTML = `
        <div class="c-soft-empty-state" id="soft-initial-empty-state">
          <div class="c-soft-empty-state__icon"><svg class=c-icon aria-hidden=true><use href=#i-search></use></svg></div>
          <h3 class="c-soft-empty-state__title">Pesquise ou Escolha uma Categoria</h3>
          <p class="c-soft-empty-state__desc">
            Digite qualquer letra no campo de busca ou clique em uma das categorias acima para listar os programas disponíveis em ordem alfabética.
          </p>
        </div>
      `;
      if (counterBadge) counterBadge.classList.add('u-hidden');
      return;
    }

    let results = [...this.allSoftwares];

    // 1. Filtrar por Categoria
    if (this.currentCategory && this.currentCategory !== 'all') {
      results = results.filter(sw => sw.category === this.currentCategory);
    }

    // 2. Filtrar por Termo de Busca (Nome, Categoria ou Tags)
    if (this.currentQuery) {
      const q = this.currentQuery;
      results = results.filter(sw => {
        const inName = sw.name.toLowerCase().includes(q);
        const inCategory = (sw.categoryLabel || '').toLowerCase().includes(q);
        const inDesc = sw.description.toLowerCase().includes(q);
        const inTags = Array.isArray(sw.tags) && sw.tags.some(t => t.toLowerCase().includes(q));
        return inName || inCategory || inDesc || inTags;
      });
    }

    // 3. Ordenação rigorosa em Ordem Alfabética (A a Z)
    results.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

    // Atualiza contador
    if (counterBadge) {
      counterBadge.classList.remove('u-hidden');
      counterBadge.textContent = `${results.length} softwares encontrados (A-Z)`;
    }

    // Se nenhum resultado for encontrado
    if (results.length === 0) {
      container.innerHTML = `
        <div class="c-soft-empty-state">
          <div class="c-soft-empty-state__icon"><svg class=c-icon aria-hidden=true><use href=#i-ban></use></svg></div>
          <h3 class="c-soft-empty-state__title">Nenhum software encontrado</h3>
          <p class="c-soft-empty-state__desc">
            Não encontramos nenhum software com o termo "<strong>${this.escapeHtml(this.currentQuery)}</strong>". Tente buscar por palavras alternativas ou clique no botão de limpar.
          </p>
          <button class="c-btn c-btn--outline c-btn--sm u-mt-md" onclick="SoftsModule.clearSearch()">
            Limpar Filtros e Busca
          </button>
        </div>
      `;
      return;
    }

    // 4. Renderiza a lista alfabética
    container.innerHTML = `
      <div class="c-soft-list">
        ${results.map(item => `
          <div class="c-soft-item ${item.mustHave ? 'c-soft-item--highlight' : ''}">
            <div class="c-soft-item__info">
              <div class="c-soft-item__title-row">
                <span class="c-soft-item__name">${item.name}</span>
                <span class="c-badge c-badge--info">${item.categoryLabel || item.category}</span>
                ${item.mustHave ? '<span class="c-badge c-badge--danger"><svg class=c-icon aria-hidden=true><use href=#i-flame></use></svg> Obrigatório</span>' : ''}
                <span class="c-badge c-badge--neutral">${item.size}</span>
                ${typeof WingetModule !== 'undefined' ? WingetModule.renderItemControl(item.id) : ''}
              </div>
              <p class="c-soft-item__desc">${item.description}</p>
            </div>
            <div class="c-soft-item__actions">
              <a href="${item.officialUrl}" target="_blank" rel="noopener noreferrer" class="c-btn c-btn--outline c-btn--sm" title="Visitar site oficial">
                Portal
              </a>
              <a href="${item.downloadUrl}" target="_blank" rel="noopener noreferrer" class="c-btn c-btn--primary c-btn--sm" onclick="SoftsModule.onDownloadSoftware('${encodeURIComponent(item.name)}', '${encodeURIComponent(item.categoryLabel || item.category)}')" title="Baixar instalador oficial">
                Download Oficial <svg class=c-icon aria-hidden=true><use href=#i-download></use></svg>
              </a>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  async onDownloadSoftware(encodedName, encodedCategory) {
    const name = decodeURIComponent(encodedName);
    const category = decodeURIComponent(encodedCategory);
    try {
      await API.recordUpdate({
        type: 'software',
        title: name,
        category: category,
        previousVersion: 'Não instalado / Versão anterior',
        updatedVersion: 'Última Versão Oficial',
        details: `Instalador oficial de ${name} (${category}) baixado para instalação no Windows.`,
        revertAction: 'revert_software'
      });
      App.showToast(`Log registrado: Download de ${name} registrado no histórico de atualizações!`, 'info');
    } catch (err) {
      console.warn('Erro ao registrar log de software:', err);
    }
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
