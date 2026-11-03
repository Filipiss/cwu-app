// frontend/scripts/modules/versions.js
/**
 * Novas Versões: versão instalada, verificação no GitHub e histórico (CHANGELOG.md).
 * A verificação roda sozinha na primeira vez que a aba é aberta.
 */
const VersionsModule = {
  data: null,
  checked: false,

  async init() {
    document.getElementById('btn-check-new-version')?.addEventListener('click', () => this.checkForUpdates());
    document.querySelectorAll('[data-tab="versions"]').forEach(el => el.addEventListener('click', () => {
      if (!this.checked) this.checkForUpdates();
    }));
    await this.loadVersionInfo();
    if (location.hash === '#versions') this.checkForUpdates();
  },

  icon(n) { return `<svg class="c-icon" aria-hidden="true"><use href="#i-${n}"></use></svg>`; },
  esc(v) { return String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },

  async loadVersionInfo() {
    try {
      const res = await API.getVersionInfo();
      this.data = res.data;
      this.render();
    } catch (err) {
      console.error('Erro ao buscar dados de versão:', err);
    }
  },

  render() {
    const d = this.data;
    if (!d) return;
    const versionEl = document.getElementById('current-app-version');
    const dateEl = document.getElementById('app-release-date');
    const tag = document.getElementById('sidebar-version-tag');
    if (versionEl) versionEl.textContent = `CWU App v${d.currentVersion}`;
    if (dateEl) dateEl.textContent = d.releaseDate ? `Versão instalada • lançada em ${d.releaseDate}` : 'Versão instalada';
    if (tag) tag.textContent = `v${d.currentVersion.split('.').slice(0, 2).join('.')}`;
    this.renderChangelog(d.changelog || []);
  },

  renderChangelog(entries) {
    const box = document.getElementById('app-changelog-container');
    if (!box) return;
    if (!entries.length) { box.innerHTML = '<p class="c-card__desc">Histórico indisponível.</p>'; return; }
    const sectionIcon = { 'Adicionado': 'plus', 'Corrigido': 'wrench', 'Alterado': 'shuffle' };
    box.innerHTML = entries.map(e => `
      <article class="c-changelog__entry">
        <header class="c-changelog__head">
          <h5 class="c-changelog__version">v${this.esc(e.version)}</h5>
          ${e.isCurrent ? '<span class="c-badge c-badge--success">Instalada</span>' : ''}
          <span class="c-changelog__date">${this.esc(e.dateLabel || '')}</span>
        </header>
        ${e.sections.map(s => `
          <div class="c-changelog__section">
            <div class="c-changelog__section-title">${this.icon(sectionIcon[s.title] || 'info')} ${this.esc(s.title)}</div>
            <ul class="c-changelog__list">${s.items.map(i => `<li>${this.esc(i)}</li>`).join('')}</ul>
          </div>`).join('')}
      </article>`).join('');
  },

  setStatus(status, text) {
    const el = document.getElementById('update-check-result');
    if (!el) return;
    const icons = { idle: 'info', checking: 'refresh-cw', 'up-to-date': 'circle-check', 'update-available': 'download', 'no-release': 'info', offline: 'wifi-off' };
    el.dataset.status = status;
    el.innerHTML = `<span class="c-update-status__icon ${status === 'checking' ? 'u-spin' : ''}">${this.icon(icons[status] || 'info')}</span><span class="c-update-status__text"></span>`;
    el.querySelector('.c-update-status__text').textContent = text;
  },

  async checkForUpdates() {
    const btn = document.getElementById('btn-check-new-version');
    const download = document.getElementById('btn-download-update');
    const notes = document.getElementById('update-release-notes');
    this.checked = true;
    if (btn) btn.disabled = true;
    this.setStatus('checking', 'Consultando a última versão publicada no GitHub…');
    try {
      const d = (await API.checkUpdate()).data || {};
      const when = new Date(d.checkedAt || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      this.setStatus(d.status || 'offline', `${d.message} Verificado às ${when}.`);

      // O botão de download só aparece quando existe uma versão mais nova
      if (download) {
        download.classList.toggle('u-hidden', !d.updateAvailable);
        if (d.updateAvailable) {
          download.href = d.downloadUrl;
          download.querySelector('span').textContent = `Baixar v${d.latestVersion}`;
        }
      }
      if (notes) {
        notes.classList.toggle('u-hidden', !(d.updateAvailable && d.releaseNotes));
        if (d.updateAvailable && d.releaseNotes) {
          notes.innerHTML = `<div class="c-callout__title">${this.icon('sparkles')} Novidades de ${this.esc(d.releaseName)}${d.releaseDate ? ' • ' + this.esc(d.releaseDate) : ''}</div><div class="c-release-notes"></div>`;
          // Notas do GitHub como texto puro (sem interpretar HTML vindo de fora)
          notes.querySelector('.c-release-notes').textContent = d.releaseNotes.replace(/^#+\s*/gm, '').replace(/\*\*/g, '');
        }
      }
    } catch (err) {
      this.setStatus('offline', 'Não foi possível consultar o servidor do CWU App.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }
};
