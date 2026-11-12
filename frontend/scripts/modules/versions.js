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
    document.getElementById('btn-apply-update')?.addEventListener('click', () => this.onApplyClick());
    document.getElementById('btn-rollback')?.addEventListener('click', () => this.onRollbackClick());
    document.getElementById('rollback-select')?.addEventListener('change', (e) => {
      const btn = document.getElementById('btn-rollback');
      if (btn) btn.disabled = !e.target.value;
    });
    document.querySelectorAll('[data-tab="versions"]').forEach(el => el.addEventListener('click', () => {
      if (!this.checked) this.checkForUpdates();
    }));
    await this.loadVersionInfo();
    this.loadRollbackVersions();
    if (location.hash === '#versions') this.checkForUpdates();
  },

  t(x) { return typeof I18N !== 'undefined' ? I18N.t(x) : x; },
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

  // Lista de versões para voltar: só aparece na versão instalada (com atualização automática)
  async loadRollbackVersions() {
    const card = document.getElementById('rollback-card');
    const select = document.getElementById('rollback-select');
    if (!card || !select) return;
    let supported = false;
    try { supported = Boolean((await API.getUpdateStatus()).data.supported); } catch (e) {}
    card.classList.toggle('u-hidden', !supported);
    if (!supported) return;
    try {
      const res = await API.listVersions();
      const list = (res.success && res.data) || [];
      if (!list.length) {
        select.innerHTML = `<option value="">${this.esc(this.t('Nenhuma outra versão disponível'))}</option>`;
        return;
      }
      select.innerHTML = `<option value="">${this.esc(this.t('Escolha uma versão'))}</option>` + list.map(v => {
        const date = v.date ? ` (${v.date.split('-').reverse().join('/')})` : '';
        const tag = v.older ? '' : ` • ${this.t('mais nova')}`;
        return `<option value="${this.esc(v.version)}">v${this.esc(v.version)}${date}${this.esc(tag)}</option>`;
      }).join('');
    } catch (e) {
      select.innerHTML = `<option value="">${this.esc(this.t('Sem conexão com o GitHub'))}</option>`;
    }
  },

  async onRollbackClick() {
    const select = document.getElementById('rollback-select');
    const version = select && select.value;
    if (!version) return;
    const ok = await Confirm.ask({
      title: `${this.t('Instalar a versão')} v${version}?`,
      message: this.t('O CWU App vai baixar o instalador dessa versão, conferir a integridade, fechar e abrir de novo já nela. Suas configurações são mantidas.'),
      confirmLabel: this.t('Instalar versão')
    });
    if (!ok) return;
    document.getElementById('btn-rollback').disabled = true;
    try { await API.rollbackTo(version); } catch (e) {}
    this.latestVersion = version;
    this.pollUpdate();
  },

  setApplyLabel(mode) {
    const btn = document.getElementById('btn-apply-update');
    if (!btn) return;
    btn.dataset.mode = mode;
    btn.querySelector('span').textContent = mode === 'install' ? this.t('Reiniciar e aplicar') : `${this.t('Atualizar para')} v${this.latestVersion || ''}`;
    btn.querySelector('use').setAttribute('href', mode === 'install' ? '#i-rotate-ccw' : '#i-download');
  },

  async onApplyClick() {
    const btn = document.getElementById('btn-apply-update');
    if (btn?.dataset.mode === 'install') {
      btn.disabled = true;
      this.setStatus('checking', 'Fechando o CWU App para aplicar a atualização. Ele abre de novo sozinho em alguns segundos.');
      try { await API.installUpdate(); } catch (e) { /* o app já está fechando */ }
      return;
    }
    if (btn) btn.disabled = true;
    try { await API.downloadUpdate(); } catch (e) {}
    this.pollUpdate();
  },

  // Acompanha o download feito pelo app (progresso, concluído ou erro)
  pollUpdate() {
    clearInterval(this.updateTimer);
    const box = document.getElementById('update-progress');
    const fill = document.getElementById('update-progress-fill');
    const pct = document.getElementById('update-progress-pct');
    const text = document.getElementById('update-progress-text');
    const btn = document.getElementById('btn-apply-update');
    box?.classList.remove('u-hidden');
    this.updateTimer = setInterval(async () => {
      let st;
      try { st = (await API.getUpdateStatus()).data; } catch (e) { return; }
      if (fill) fill.style.width = `${st.percent || 0}%`;
      if (pct) pct.textContent = `${st.percent || 0}%`;
      if (st.status === 'checking' && text) text.textContent = 'Preparando o download…';
      if ((st.status === 'rollback' || st.status === 'rollback-ready') && text) {
        text.textContent = st.status === 'rollback-ready'
          ? this.t('Instalando… o app fecha e abre de novo sozinho.')
          : `${this.t('Baixando a versão')} ${st.version}…`;
      }
      if (st.status === 'downloading' && text) text.textContent = `${this.t('Baixando a versão')} ${st.version || this.latestVersion}…`;
      if (st.status === 'downloaded') {
        clearInterval(this.updateTimer);
        if (text) text.textContent = 'Download concluído e verificado.';
        this.setApplyLabel('install');
        if (btn) btn.disabled = false;
        this.setStatus('update-available', 'Atualização pronta. Clique em "Reiniciar e aplicar": o app fecha, atualiza e abre de novo. Se preferir, ela é aplicada quando você sair do app.');
      }
      if (st.status === 'none' || st.status === 'error') {
        clearInterval(this.updateTimer);
        box?.classList.add('u-hidden');
        if (btn) btn.disabled = false;
        this.setStatus('offline', st.status === 'none'
          ? 'O instalador desta versão ainda não está disponível no GitHub. Tente de novo em alguns minutos.'
          : (st.error && /confere|verifica/i.test(st.error) ? st.error : 'Não foi possível baixar a atualização. Verifique a internet e tente de novo, ou baixe pela página da versão.'));
        const rb = document.getElementById('btn-rollback');
        if (rb) rb.disabled = !document.getElementById('rollback-select')?.value;
        const download = document.getElementById('btn-download-update');
        download?.classList.remove('u-hidden');
      }
    }, 700);
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

      // Versão instalada: "Atualizar agora" baixa e aplica sozinho. Sem suporte (modo dev ou exe
      // portátil antigo), fica o botão que abre a página de download.
      let auto = false;
      if (d.updateAvailable) {
        try { auto = Boolean((await API.getUpdateStatus()).data.supported); } catch (e) {}
      }
      const apply = document.getElementById('btn-apply-update');
      if (apply) {
        apply.classList.toggle('u-hidden', !(d.updateAvailable && auto));
        this.latestVersion = d.latestVersion;
        if (d.updateAvailable && auto) this.setApplyLabel('download');
      }
      if (download) {
        download.classList.toggle('u-hidden', !d.updateAvailable || auto);
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
