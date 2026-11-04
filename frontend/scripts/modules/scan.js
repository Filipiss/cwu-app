// frontend/scripts/modules/scan.js
/**
 * Módulo de Varredura de Drivers (Scan) com Dropdown Explicativo de Componentes
 */
const ScanModule = {
  scanResult: null,
  expandedRows: new Set(),
  // Padrão: problemas primeiro (ausentes, depois desatualizados, depois atualizados)
  sortKey: 'status',
  sortDir: 1,
  STATUS_ORDER: { generic: 0, outdated: 1, unknown: 2, updated: 3 },

  esc(v) { return String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },

  /** Ordena conforme a coluna clicada; o desempate é sempre o nome do dispositivo (A-Z). */
  sortItems(items) {
    const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');
    const notInstalled = (d) => (d.status === 'generic' || /não instalado|desconhecida/i.test(d.currentVersion) ? 0 : 1);
    const cmp = {
      name: byName,
      manufacturer: (a, b) => a.manufacturer.localeCompare(b.manufacturer, 'pt-BR') || byName(a, b),
      version: (a, b) => (notInstalled(a) - notInstalled(b)) || byName(a, b),
      status: (a, b) => ((this.STATUS_ORDER[a.status] ?? 9) - (this.STATUS_ORDER[b.status] ?? 9)) || byName(a, b)
    }[this.sortKey] || byName;
    return [...items].sort((a, b) => cmp(a, b) * this.sortDir);
  },

  setSort(key) {
    if (this.sortKey === key) this.sortDir *= -1; else { this.sortKey = key; this.sortDir = 1; }
    this.updateSortHeaders();
    if (this.scanResult && this.scanResult.items) this.renderTable(this.scanResult.items);
  },

  updateSortHeaders() {
    document.querySelectorAll('.js-driver-sort').forEach(b => {
      const active = b.dataset.sort === this.sortKey;
      b.classList.toggle('c-sort--active', active);
      b.querySelector('.c-sort__arrow').textContent = active ? (this.sortDir === 1 ? '▲' : '▼') : '';
      b.closest('th').setAttribute('aria-sort', active ? (this.sortDir === 1 ? 'ascending' : 'descending') : 'none');
    });
  },

  init() {
    this.bindEvents();
    document.querySelectorAll('.js-driver-sort').forEach(b => b.addEventListener('click', () => this.setSort(b.dataset.sort)));
    this.updateSortHeaders();
  },

  bindEvents() {
    const scanBtn = document.getElementById('btn-start-scan');
    if (scanBtn) {
      scanBtn.addEventListener('click', () => {
        this.runScan();
      });
    }

    // Delegação de eventos para clique nas linhas de dispositivos da tabela
    const tbody = document.getElementById('scan-drivers-tbody');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        // Ignora cliques que foram diretamente em botões de link
        if (e.target.closest('a') || e.target.closest('button')) {
          return;
        }

        const row = e.target.closest('.js-driver-row');
        if (row) {
          const deviceId = row.dataset.id;
          this.toggleDeviceDropdown(row, deviceId);
        }
      });
    }
  },

  async runScan() {
    const scanBtn = document.getElementById('btn-start-scan');
    const tableBody = document.getElementById('scan-drivers-tbody');
    const statusMsg = document.getElementById('scan-status-summary');
    const radarSweep = document.getElementById('scan-radar-sweep');

    try {
      if (scanBtn) {
        scanBtn.disabled = true;
        scanBtn.innerHTML = '<span>Escaneando Drivers...</span> <span class="u-spin"><svg class=c-icon aria-hidden=true><use href=#i-loader-circle></use></svg></span>';
      }
      if (radarSweep) radarSweep.classList.remove('u-hidden');
      if (statusMsg) statusMsg.textContent = 'Lendo os drivers instalados e consultando o Windows Update e a NVIDIA por versões novas… pode levar até 2 minutos.';

      this.expandedRows.clear();
      const res = await API.scanDrivers();
      if (res.success) {
        this.scanResult = res.data;
        this.renderTable(res.data.items);

        // Atualiza contadores
        const outdatedBadge = document.getElementById('sidebar-badge-drivers');
        if (outdatedBadge) {
          outdatedBadge.textContent = res.data.outdatedCount;
          outdatedBadge.className = `c-nav__badge ${res.data.outdatedCount > 0 ? 'c-badge--danger' : 'c-badge--success'}`;
        }

        if (res.data.scanAvailable === false) {
          if (statusMsg) statusMsg.textContent = res.data.message;
          const tb = document.getElementById('scan-drivers-tbody');
          if (tb) tb.innerHTML = '<tr><td colspan="5" class="u-text-center u-text-muted"></td></tr>';
          if (tb) tb.querySelector('td').textContent = res.data.message;
          App.showToast('Varredura indisponível neste sistema', 'warning');
          return;
        }

        if (statusMsg) {
          const uc = res.data.updateCheck || {};
          const sources = [uc.windowsUpdate ? 'Windows Update' : null, uc.nvidia ? `NVIDIA (mais recente: ${uc.nvidiaLatest})` : null].filter(Boolean);
          statusMsg.innerHTML = `Escaneamento concluído: <strong>${res.data.totalScanned}</strong> dispositivos examinados. <span class="u-text-danger">${res.data.outdatedCount} pendentes de atenção</span>.`
            + `<br><span class="u-text-muted">${sources.length ? 'Atualizações verificadas em: ' + sources.join(' e ') + '.' : 'Não foi possível consultar atualizações online (sem internet?). Os resultados usam só a data dos drivers.'} Clique em um dispositivo para ver o que ele faz.</span>`;
        }

        App.showToast(`Escaneamento de drivers finalizado! ${res.data.totalScanned} dispositivos verificados.`, 'info');
      }
    } catch (err) {
      console.error('Erro no escaneamento:', err);
      App.showToast('Erro ao escanear os drivers', 'danger');
    } finally {
      if (scanBtn) {
        scanBtn.disabled = false;
        scanBtn.innerHTML = '<span>Scannear Drivers</span> <span><svg class=c-icon aria-hidden=true><use href=#i-search></use></svg></span>';
      }
      if (radarSweep) radarSweep.classList.add('u-hidden');
    }
  },

  renderTable(items) {
    const tbody = document.getElementById('scan-drivers-tbody');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="u-text-center u-text-muted">Nenhum dispositivo encontrado.</td></tr>`;
      return;
    }

    const esc = (v) => this.esc(v);
    tbody.innerHTML = this.sortItems(items).map(item => `
      <tr class="c-table__row c-table__row--clickable js-driver-row" data-id="${item.id}" title="Clique para ver o que este componente faz">
        <td class="c-table__td">
          <div class="c-driver-device">
            <span class="c-driver-device__chevron"><svg class=c-icon aria-hidden=true><use href=#i-chevron-right></use></svg></span>
            <div class="c-driver-device__info">
              <span class="c-driver-device__name">${esc(item.name)}</span>
              <span class="c-driver-device__category">${esc(item.category)}</span>
            </div>
          </div>
        </td>
        <td class="c-table__td u-text-muted">${esc(item.manufacturer)}</td>
        <td class="c-table__td u-font-mono">${esc(item.currentVersion)}</td>
        <td class="c-table__td">
          <span class="c-badge c-badge--${esc(item.statusBadge)}">${esc(item.statusText)}</span>
        </td>
        <td class="c-table__td u-text-right">
          <div class="o-flex o-flex--gap-sm" style="justify-content: flex-end; flex-wrap: nowrap;">
            ${item.officialUrl ? `
              <a href="${item.officialUrl}" target="_blank" rel="noopener noreferrer" class="c-btn c-btn--secondary c-btn--xs" title="Acessar portal oficial do fabricante">
                <span>Portal Oficial</span> <svg class=c-icon aria-hidden=true><use href=#i-arrow-up-right></use></svg>
              </a>
            ` : ''}
            ${item.updateSource === 'windows-update' && item.status === 'outdated' ? `
              <button type="button" class="c-btn c-btn--primary c-btn--xs" data-action="driver-wu" title="${esc(item.updateTitle || 'Abrir o Windows Update')}">
                <span>Instalar pelo Windows Update</span> <svg class=c-icon aria-hidden=true><use href=#i-download></use></svg>
              </button>
            ` : ''}
            ${(item.status !== 'updated' && item.updateSource !== 'windows-update' && item.directDownload) ? `
              <a href="${item.directDownload}" target="_blank" rel="noopener noreferrer" class="c-btn c-btn--primary c-btn--xs" data-action="driver-download" data-arg="${item.id}" title="Download direto do instalador/driver oficial">
                <span>${item.updateSource === 'nvidia' ? 'Baixar driver NVIDIA' : 'Download Direto'}</span> <svg class=c-icon aria-hidden=true><use href=#i-download></use></svg>
              </a>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  },

  toggleDeviceDropdown(row, deviceId) {
    const nextRow = row.nextElementSibling;
    const isAlreadyOpen = nextRow && nextRow.classList.contains('c-table__dropdown-row');

    if (isAlreadyOpen) {
      // Fecha o dropdown se já estava aberto
      nextRow.remove();
      row.classList.remove('c-table__row--expanded');
      this.expandedRows.delete(deviceId);
      return;
    }

    // Localiza o item nos dados do scan
    const item = (this.scanResult?.items || []).find(d => d.id === deviceId);
    if (!item) return;

    const details = item.details || {
      role: item.description || 'Componente integrado do sistema operacional.',
      importance: 'Importante para estabilidade do computador.',
      impact: 'Trabalha em conjunto com o hardware para garantir a fluidez do Windows.'
    };

    // Cria a linha dropdown com colspan cobrindo todas as 5 colunas
    const dropdownRow = document.createElement('tr');
    dropdownRow.className = 'c-table__dropdown-row';
    dropdownRow.innerHTML = `
      <td colspan="5" style="padding: 0;">
        <div class="c-table__dropdown-content">
          <div class="c-device-details-grid">
            <div class="c-device-details__role-box">
              <span class="c-device-details__label">
                O que este componente faz no computador:
              </span>
              <p class="c-device-details__text">
                ${details.role}
              </p>

              <div style="margin-top: 8px;">
                <span class="c-device-details__label" style="color: var(--color-success);">
                  Importância & Desempenho:
                </span>
                <p class="c-device-details__subtext">
                  ${details.impact}
                </p>
              </div>
            </div>

            <div class="c-device-details__side-box">
              <span class="u-text-muted" style="font-size: 0.75rem; text-transform: uppercase;">Fabricante / Fornecedor</span>
              <span style="font-weight: 600; font-size: 0.85rem; color: var(--color-text-primary);">${item.manufacturer}</span>

              <span class="u-text-muted" style="font-size: 0.75rem; text-transform: uppercase; margin-top: 6px;">Versão do Driver Atual</span>
              <code style="display: inline-block;">${item.currentVersion}</code>

              <div class="o-flex o-flex--column o-flex--gap-xs" style="margin-top: 12px;">
                ${item.officialUrl ? `
                  <a href="${item.officialUrl}" target="_blank" rel="noopener noreferrer" class="c-btn c-btn--secondary c-btn--sm" title="Acessar portal oficial">
                    <span>Portal Oficial</span> <svg class=c-icon aria-hidden=true><use href=#i-arrow-up-right></use></svg>
                  </a>
                ` : ''}
                ${(item.status !== 'updated' && item.directDownload) ? `
                  <a href="${item.directDownload}" target="_blank" rel="noopener noreferrer" class="c-btn c-btn--primary c-btn--sm" data-action="driver-download" data-arg="${item.id}" title="Download direto do driver">
                    <span>Download Direto</span> <svg class=c-icon aria-hidden=true><use href=#i-download></use></svg>
                  </a>
                ` : ''}
              </div>
            </div>
          </div>
        </div>
      </td>
    `;

    // Insere logo abaixo da linha clicada
    row.after(dropdownRow);
    row.classList.add('c-table__row--expanded');
    this.expandedRows.add(deviceId);
  },

  async onDownloadDriver(deviceId) {
    const item = (this.scanResult?.items || []).find(d => d.id === deviceId);
    if (!item) return;

    try {
      await API.recordUpdate({
        type: 'driver',
        title: item.name,
        category: item.category,
        previousVersion: item.currentVersion,
        updatedVersion: 'Recomendada Oficial',
        details: `Instalador oficial do fabricante (${item.manufacturer}) baixado para ${item.name}.`,
        revertAction: 'revert_driver'
      });
      App.showToast(`Log registrado: Atualização iniciada para ${item.name}!`, 'info');
    } catch (err) {
      console.warn('Erro ao registrar log de driver:', err);
    }
  }
};
