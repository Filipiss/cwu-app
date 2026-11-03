// frontend/scripts/modules/scan.js
/**
 * Módulo de Varredura de Drivers (Scan) com Dropdown Explicativo de Componentes
 */
const ScanModule = {
  scanResult: null,
  expandedRows: new Set(),

  init() {
    this.bindEvents();
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
        scanBtn.innerHTML = '<span>Escaneando Drivers...</span> <span class="u-spin">⏳</span>';
      }
      if (radarSweep) radarSweep.classList.remove('u-hidden');
      if (statusMsg) statusMsg.textContent = 'Examinando barramento PCI-e, controladores e assinaturas digitais do Windows...';

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

        if (statusMsg) {
          statusMsg.innerHTML = `Escaneamento concluído: <strong>${res.data.totalScanned}</strong> dispositivos examinados. <span class="u-text-danger">${res.data.outdatedCount} pendentes de atenção</span>. <span class="u-text-muted" style="margin-left: 8px;">(Dica: clique em qualquer dispositivo para entender o que ele faz)</span>`;
        }

        App.showToast(`Escaneamento de drivers finalizado! ${res.data.totalScanned} dispositivos verificados.`, 'info');
      }
    } catch (err) {
      console.error('Erro no escaneamento:', err);
      App.showToast('Erro ao escanear os drivers', 'danger');
    } finally {
      if (scanBtn) {
        scanBtn.disabled = false;
        scanBtn.innerHTML = '<span>Scannear Drivers</span> <span>🔍</span>';
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

    tbody.innerHTML = items.map(item => `
      <tr class="c-table__row c-table__row--clickable js-driver-row" data-id="${item.id}" title="Clique para ver o que este componente faz">
        <td class="c-table__td">
          <div class="c-driver-device">
            <span class="c-driver-device__chevron">▶</span>
            <div class="c-driver-device__info">
              <span class="c-driver-device__name">${item.name}</span>
              <span class="c-driver-device__category">${item.category}</span>
            </div>
          </div>
        </td>
        <td class="c-table__td u-text-muted">${item.manufacturer}</td>
        <td class="c-table__td u-font-mono">${item.currentVersion}</td>
        <td class="c-table__td">
          <span class="c-badge c-badge--${item.statusBadge}">
            ${item.status === 'updated' ? '✓' : '⚠️'} ${item.statusText}
          </span>
        </td>
        <td class="c-table__td u-text-right">
          <div class="o-flex o-flex--gap-xs" style="justify-content: flex-end; flex-wrap: wrap;">
            ${item.officialUrl ? `
              <a href="${item.officialUrl}" target="_blank" rel="noopener noreferrer" class="c-btn c-btn--outline c-btn--xs" title="Acessar portal oficial do fabricante">
                <span>Portal Oficial</span> ↗
              </a>
            ` : ''}
            ${(item.status !== 'updated' && item.directDownload) ? `
              <a href="${item.directDownload}" target="_blank" rel="noopener noreferrer" class="c-btn c-btn--primary c-btn--xs" onclick="ScanModule.onDownloadDriver('${item.id}')" title="Download direto do instalador/driver oficial">
                <span>Download Direto</span> ⬇
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
                💡 O que este componente faz no computador:
              </span>
              <p class="c-device-details__text">
                ${details.role}
              </p>

              <div style="margin-top: 8px;">
                <span class="c-device-details__label" style="color: var(--color-success);">
                  ⚡ Importância & Desempenho:
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
                  <a href="${item.officialUrl}" target="_blank" rel="noopener noreferrer" class="c-btn c-btn--outline c-btn--sm" title="Acessar portal oficial">
                    <span>Portal Oficial</span> ↗
                  </a>
                ` : ''}
                ${(item.status !== 'updated' && item.directDownload) ? `
                  <a href="${item.directDownload}" target="_blank" rel="noopener noreferrer" class="c-btn c-btn--primary c-btn--sm" onclick="ScanModule.onDownloadDriver('${item.id}')" title="Download direto do driver">
                    <span>Download Direto</span> ⬇
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
