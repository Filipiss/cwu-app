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
    document.getElementById('btn-update-pause')?.addEventListener('click', () => this.control('pause'));
    document.getElementById('btn-update-stop')?.addEventListener('click', () => this.control('stop'));
    document.getElementById('btn-update-resume')?.addEventListener('click', () => this.control('resume'));
    // O link "Baixar e instalar" fica dentro do texto do resultado da verificação
    document.getElementById('update-check-result')?.addEventListener('click', (e) => {
      if (e.target.closest('.js-update-start')) { e.preventDefault(); this.startDownload(); }
    });
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
    this.resumeWatching();
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
        const tag = v.blocked ? ` • ${this.t('indisponível nesta instalação')}` : (v.older ? '' : ` • ${this.t('mais nova')}`);
        return `<option value="${this.esc(v.version)}"${v.blocked ? ' disabled' : ''}>v${this.esc(v.version)}${date}${this.esc(tag)}</option>`;
      }).join('');
      // Instalação para todos os usuários: as versões antigas só instalam por usuário (criariam uma segunda cópia)
      const blockedHint = document.getElementById('rollback-blocked-hint');
      if (blockedHint) blockedHint.classList.toggle('u-hidden', !list.some(v => v.blocked));
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

  // ===== Download da atualização (pausar, parar e retomar) =====
  fmtBytes(b) {
    if (!b) return '0 MB';
    if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;
    return `${(b / 1024 ** 2).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
  },

  fmtEta(sec) {
    if (!sec && sec !== 0) return '';
    if (sec < 60) return `${this.t('faltam')} ${sec} s`;
    const m = Math.floor(sec / 60);
    return `${this.t('faltam')} ${m} min ${String(sec % 60).padStart(2, '0')} s`;
  },

  async startDownload() {
    this.showProgress();
    this.renderDownload({ status: 'preparing', version: this.latestVersion, totalBytes: 0, receivedBytes: 0, percent: 0, canPause: false, canStop: false, canResume: false });
    try { await API.downloadUpdate(this.latestVersion); } catch (e) {}
    this.watchDownload();
  },

  async control(action) {
    const call = { pause: 'pauseUpdate', stop: 'stopUpdate', resume: 'resumeUpdate' }[action];
    ['btn-update-pause', 'btn-update-stop', 'btn-update-resume'].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = true; });
    try {
      const d = (await API[call]()).data;
      if (d) this.renderDownload(d);
    } catch (e) {}
    this.watchDownload();
  },

  // Se o download já estava em andamento (ou pausado) quando a aba abriu, mostra o painel
  async resumeWatching() {
    let st;
    try { st = (await API.getUpdateStatus()).data; } catch (e) { return; }
    const d = st && st.download;
    if (!d || d.status === 'idle') return;
    this.latestVersion = d.version;
    this.showProgress();
    this.renderDownload(d);
    this.watchDownload();
  },

  showProgress() {
    document.getElementById('update-progress')?.classList.remove('u-hidden');
    document.getElementById('update-progress-actions')?.classList.remove('u-hidden');
  },

  // Consulta o andamento enquanto há algo acontecendo; parado ou pausado, para de consultar
  watchDownload() {
    clearInterval(this.updateTimer);
    const tick = async () => {
      let st;
      try { st = (await API.getUpdateStatus()).data; } catch (e) { return; }
      if (!st || !st.download) return;
      this.renderDownload(st.download);
      if (!['preparing', 'downloading', 'verifying'].includes(st.download.status)) clearInterval(this.updateTimer);
    };
    tick();
    this.updateTimer = setInterval(tick, 500);
  },

  renderDownload(d) {
    const $ = (id) => document.getElementById(id);
    const v = d.version || this.latestVersion || '';
    const texts = {
      preparing: `${this.t('Preparando o download da')} v${v}…`,
      downloading: `${this.t('Baixando a versão')} ${v}…`,
      paused: this.t('Download pausado.'),
      stopped: this.t('Download parado.'),
      verifying: this.t('Conferindo a integridade do arquivo…'),
      ready: this.t('Download concluído e verificado.'),
      error: d.error || this.t('Não foi possível baixar a atualização.')
    };
    if ($('update-progress-text')) $('update-progress-text').textContent = texts[d.status] || '';
    if ($('update-progress-pct')) $('update-progress-pct').textContent = `${d.percent || 0}%`;
    if ($('update-progress-fill')) $('update-progress-fill').style.width = `${d.percent || 0}%`;
    if ($('update-progress-bytes')) $('update-progress-bytes').textContent = d.totalBytes
      ? `${this.fmtBytes(d.receivedBytes)} ${this.t('de')} ${this.fmtBytes(d.totalBytes)}`
      : (d.receivedBytes ? this.fmtBytes(d.receivedBytes) : '');
    if ($('update-progress-speed')) $('update-progress-speed').textContent = d.status === 'downloading' && d.bytesPerSecond ? `${this.fmtBytes(d.bytesPerSecond)}/s` : '';
    if ($('update-progress-eta')) $('update-progress-eta').textContent = d.status === 'downloading' ? this.fmtEta(d.etaSeconds) : '';

    // Pausar e Parar só durante o download; Retomar só depois de pausar ou parar
    if ($('btn-update-pause')) $('btn-update-pause').disabled = !d.canPause;
    if ($('btn-update-stop')) $('btn-update-stop').disabled = !d.canStop;
    if ($('btn-update-resume')) $('btn-update-resume').disabled = !d.canResume;

    const hint = $('update-progress-hint');
    if (hint) {
      const msg = d.status === 'stopped' ? this.t('O que foi baixado foi descartado: Retomar começa o download do zero.')
        : d.status === 'paused' ? this.t('O que já foi baixado fica guardado: Retomar continua do mesmo ponto.')
        : d.status === 'error' ? this.t('Clique em Retomar para tentar de novo.') : '';
      hint.textContent = msg;
      hint.classList.toggle('u-hidden', !msg);
    }
    // Erro: Retomar vira "tentar de novo"
    if (d.status === 'error' && $('btn-update-resume')) {
      $('btn-update-resume').disabled = false;
      $('btn-update-resume').onclick = () => { this.startDownload(); };
    } else if ($('btn-update-resume')) {
      $('btn-update-resume').onclick = null;
    }

    const apply = $('btn-apply-update');
    const ready = d.status === 'ready';
    $('update-progress-actions')?.classList.toggle('u-hidden', ready);
    if (apply) { apply.classList.toggle('u-hidden', !ready); apply.disabled = false; }
    if (ready) this.setStatus('update-available', this.t('Atualização pronta. Clique em "Reiniciar e aplicar": o app fecha, atualiza e abre de novo.'));
  },

  async onApplyClick() {
    const btn = document.getElementById('btn-apply-update');
    if (btn) btn.disabled = true;
    this.setStatus('checking', this.t('Fechando o CWU App para aplicar a atualização. Ele abre de novo sozinho em alguns segundos.'));
    try { await API.installUpdate(); } catch (e) { /* o app já está fechando */ }
    // Se o instalador não pôde ser usado, o motivo aparece no estado
    setTimeout(async () => {
      try {
        const st = (await API.getUpdateStatus()).data;
        if (st && st.status === 'error') { this.setStatus('offline', st.error); if (btn) btn.disabled = false; }
      } catch (e) {}
    }, 2500);
  },

  // Volta de versão: só acompanha o progresso (o app fecha sozinho no fim)
  pollUpdate() {
    clearInterval(this.updateTimer);
    const text = document.getElementById('update-progress-text');
    document.getElementById('update-progress')?.classList.remove('u-hidden');
    document.getElementById('update-progress-actions')?.classList.add('u-hidden');
    this.updateTimer = setInterval(async () => {
      let st;
      try { st = (await API.getUpdateStatus()).data; } catch (e) { return; }
      const fill = document.getElementById('update-progress-fill');
      const pct = document.getElementById('update-progress-pct');
      if (fill) fill.style.width = `${st.percent || 0}%`;
      if (pct) pct.textContent = `${st.percent || 0}%`;
      if (text) text.textContent = st.status === 'rollback-ready'
        ? this.t('Instalando… o app fecha e abre de novo sozinho.')
        : `${this.t('Baixando a versão')} ${st.version}…`;
      if (st.status === 'error') {
        clearInterval(this.updateTimer);
        document.getElementById('update-progress')?.classList.add('u-hidden');
        this.setStatus('offline', st.error || this.t('Não foi possível baixar a versão escolhida.'));
        const rb = document.getElementById('btn-rollback');
        if (rb) rb.disabled = !document.getElementById('rollback-select')?.value;
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

      // Versão instalada: um link no próprio resultado já começa o download. Sem suporte (modo dev
      // ou exe portátil antigo), fica o botão que abre a página de download.
      let auto = false;
      if (d.updateAvailable) {
        try { auto = Boolean((await API.getUpdateStatus()).data.supported); } catch (e) {}
      }
      this.latestVersion = d.latestVersion;
      if (d.updateAvailable && auto) {
        const el = document.querySelector('#update-check-result .c-update-status__text');
        if (el) {
          el.textContent = `${d.message} `;
          const link = document.createElement('button');
          link.type = 'button';
          link.className = 'c-update-link js-update-start';
          link.textContent = `${this.t('Baixar e instalar a')} v${d.latestVersion}`;
          el.appendChild(link);
        }
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
