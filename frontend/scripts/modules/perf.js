// frontend/scripts/modules/perf.js
/**
 * Aba Performance: monitor em tempo real (CPU/GPU/RAM/disco + temperaturas),
 * ajustes de jogos do Windows, diagnóstico de RAM e programas da inicialização.
 */
const PerfModule = {
  timer: null,
  history: [],
  intervalMs: 1500,
  loaded: {},
  hoverIndex: {},

  init() {
    document.getElementById('btn-tweaks-refresh')?.addEventListener('click', () => this.loadTweaks());
    document.getElementById('btn-ram-refresh')?.addEventListener('click', () => this.loadRam());
    document.getElementById('btn-startup-refresh')?.addEventListener('click', () => this.loadStartup());

    document.getElementById('perf-tweaks-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.js-tweak-toggle');
      if (btn) this.setTweak(btn.dataset.id, btn.dataset.enable === '1', btn);
    });
    document.getElementById('perf-startup-list')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.js-startup-toggle');
      if (btn) this.toggleStartup(btn.dataset.id, btn.dataset.enable === '1', btn);
    });

    ['cpu', 'gpu', 'ram', 'disk'].forEach(key => this.bindHover(key));

    // Faz a consulta só enquanto a aba está aberta e a janela visível
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  },

  ensureLoaded(view) {
    if (this.loaded[view]) return;
    this.loaded[view] = true;
    if (view === 'tweaks') this.loadTweaks();
    else if (view === 'ram') this.loadRam();
    else if (view === 'startup') this.loadStartup();
  },

  isActive() {
    const panel = document.getElementById('tab-perf');
    return panel && panel.classList.contains('c-tab-panel--active') && !document.hidden;
  },

  async tick() {
    const status = document.getElementById('perf-monitor-status');
    if (!this.isActive()) {
      if (status) { status.textContent = 'Monitor pausado'; status.className = 'c-badge c-badge--neutral'; }
      return;
    }
    // Carrega o conteúdo de cada sub-aba só quando ela é aberta pela primeira vez
    const view = (typeof SubTabs !== 'undefined' && SubTabs.current.perf) || 'monitor';
    this.ensureLoaded(view);
    if (view !== 'monitor') {
      if (status) { status.textContent = 'Monitor pausado'; status.className = 'c-badge c-badge--neutral'; }
      return;
    }
    try {
      const res = await API.getMonitor();
      const d = res.data || {};
      if (!d.available) {
        if (status) status.textContent = d.message;
        return;
      }
      if (d.error && status) {
        status.textContent = 'Sensores com problema';
        status.className = 'c-badge c-badge--warning';
        status.title = d.error;
        if (!this.errorShown) { this.errorShown = true; App.showToast('Monitor: ' + d.error, 'warning', 10000); }
      } else if (status) {
        status.title = '';
        status.textContent = d.warmingUp ? `Iniciando sensores… ${d.secondsWaiting || 0}s` : 'Ao vivo';
        status.className = `c-badge ${d.warmingUp ? 'c-badge--neutral' : 'c-badge--success'}`;
      }
      if (d.latest) this.render(d.latest, d.history || []);
    } catch (err) {
      if (status) { status.textContent = 'Sem conexão com o servidor'; status.className = 'c-badge c-badge--danger'; }
    }
  },

  // Classifica temperatura com cor de status + texto (nunca só a cor)
  tempInfo(value, kind) {
    if (value === null || value === undefined) return null;
    // HD mecânico sofre acima de ~50 °C; SSD/NVMe trabalham bem até ~70 °C
    const limits = { hdd: [50, 60], ssd: [70, 80] };
    const [warn, hot] = limits[kind] || [75, 88];
    if (value >= hot) return { cls: 'hot', label: 'muito quente' };
    if (value >= warn) return { cls: 'warn', label: 'quente' };
    return { cls: 'ok', label: 'normal' };
  },

  tempHtml(value, kind) {
    const info = this.tempInfo(value, kind);
    if (!info) return '';
    return `<span class="c-perf-temp c-perf-temp--${info.cls}">${Math.round(value)} °C (${info.label})</span>`;
  },

  render(s, history) {
    this.history = history;
    const fmt = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`);

    this.setTile('cpu', fmt(s.cpu), s.cpuTemp !== null ? this.tempHtml(s.cpuTemp, 'cpu') + ' <span>aprox.</span>' : 'Temperatura indisponível');

    const vram = s.vramUsedMb ? ` • VRAM ${(s.vramUsedMb / 1024).toFixed(1)}/${(s.vramTotalMb / 1024).toFixed(0)} GB` : '';
    const power = s.gpuPowerW ? ` • ${Math.round(s.gpuPowerW)} W` : '';
    this.setTile('gpu', fmt(s.gpu), (s.gpuTemp !== null ? this.tempHtml(s.gpuTemp, 'gpu') : 'Temperatura só em GPUs NVIDIA') + vram + power);

    this.setTile('ram', fmt(s.ram), `${s.ramUsedGb} de ${s.ramTotalGb} GB em uso`);
    this.setTile('disk', fmt(s.disk), `Leitura ${s.diskReadMBs} MB/s • Escrita ${s.diskWriteMBs} MB/s`);

    ['cpu', 'gpu', 'ram', 'disk'].forEach(key => this.drawChart(key));
    this.renderTop(s.top || []);
    this.renderTemps(s);
  },

  setTile(key, value, subHtml) {
    const tile = document.getElementById(`perf-tile-${key}`);
    if (!tile) return;
    tile.querySelector('.js-perf-value').textContent = value;
    tile.querySelector('.js-perf-sub').innerHTML = subHtml || '&nbsp;';
  },

  // Linha do histórico (uma série, escala fixa 0–100%)
  drawChart(key) {
    const svg = document.querySelector(`#perf-tile-${key} .js-perf-chart`);
    if (!svg) return;
    const W = 300, H = 56, pad = 3;
    const values = this.history.map(h => h[key]);
    const n = values.length;
    if (n < 2) { svg.innerHTML = ''; return; }

    const x = (i) => (i / (n - 1)) * W;
    const y = (v) => H - pad - (Math.max(0, Math.min(100, v || 0)) / 100) * (H - pad * 2);
    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);

    let html = `<line class="c-perf-grid" x1="0" x2="${W}" y1="${y(50)}" y2="${y(50)}" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`;
    html += `<path class="c-perf-area" d="M0,${H} L${pts.join(' L')} L${W},${H} Z"/>`;
    html += `<polyline class="c-perf-line" points="${pts.join(' ')}" vector-effect="non-scaling-stroke"/>`;

    const hi = this.hoverIndex[key];
    if (hi !== undefined && hi < n) {
      html += `<line class="c-perf-cursor" x1="${x(hi)}" x2="${x(hi)}" y1="0" y2="${H}" vector-effect="non-scaling-stroke"/>`;
    }
    svg.innerHTML = html;
  },

  // Hover: mostra o valor do ponto sob o cursor no cabeçalho do painel
  bindHover(key) {
    const svg = document.querySelector(`#perf-tile-${key} .js-perf-chart`);
    const label = document.querySelector(`#perf-tile-${key} .js-perf-hover`);
    if (!svg || !label) return;
    svg.addEventListener('mousemove', (e) => {
      const n = this.history.length;
      if (n < 2) return;
      const rect = svg.getBoundingClientRect();
      const i = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1));
      this.hoverIndex[key] = Math.max(0, Math.min(n - 1, i));
      const point = this.history[this.hoverIndex[key]];
      const ago = Math.round((Date.now() - point.t) / 1000);
      label.textContent = point[key] === null ? '—' : `${Math.round(point[key])}% · há ${ago}s`;
      this.drawChart(key);
    });
    svg.addEventListener('mouseleave', () => {
      delete this.hoverIndex[key];
      label.textContent = '';
      this.drawChart(key);
    });
  },

  renderTop(top) {
    const box = document.getElementById('perf-top-list');
    if (!box) return;
    box.innerHTML = '';
    if (!top.length) { box.innerHTML = '<p class="u-text-muted">Nenhum dado.</p>'; return; }
    top.forEach(p => {
      const row = document.createElement('div');
      row.className = 'c-perf-row';
      row.style.padding = '6px 0';
      const main = document.createElement('div');
      main.className = 'c-perf-row__main';
      const name = document.createElement('span');
      name.textContent = `${p.name}.exe`;
      const bar = document.createElement('div');
      bar.className = 'c-perf-bar';
      const fill = document.createElement('div');
      fill.className = 'c-perf-bar__fill';
      fill.style.width = `${Math.min(100, p.cpu || 0)}%`;
      bar.appendChild(fill);
      main.append(name, bar);
      const val = document.createElement('span');
      val.className = 'u-font-mono';
      val.textContent = `${(p.cpu || 0).toFixed(1)}% · ${p.memMb || 0} MB`;
      row.append(main, val);
      box.appendChild(row);
    });
  },

  renderTemps(s) {
    const box = document.getElementById('perf-temps-list');
    if (!box) return;
    const rows = [
      ['Processador (ACPI)', s.cpuTemp, 'cpu', 'Sensor não exposto pela placa-mãe'],
      [s.gpuName || 'Placa de vídeo', s.gpuTemp, 'gpu', 'Disponível apenas em GPUs NVIDIA']
    ];
    (s.diskTemps || []).forEach(d => rows.push([d.name, d.temp, d.hdd ? 'hdd' : 'ssd', 'Execute como administrador']));

    box.innerHTML = '';
    rows.forEach(([name, temp, kind, missing]) => {
      const row = document.createElement('div');
      row.className = 'c-perf-row';
      row.style.padding = '6px 0';
      const label = document.createElement('span');
      label.textContent = name;
      const value = document.createElement('span');
      if (temp === null || temp === undefined) {
        value.className = 'u-text-muted';
        value.style.fontSize = '0.8rem';
        value.textContent = missing;
      } else {
        value.innerHTML = this.tempHtml(temp, kind);
      }
      row.append(label, value);
      box.appendChild(row);
    });
  },

  // ===== Ajustes de jogos =====
  async loadTweaks() {
    const box = document.getElementById('perf-tweaks-list');
    if (!box) return;
    box.innerHTML = '<p class="u-text-muted">Lendo configurações…</p>';
    try {
      const d = (await API.getTweaks()).data || {};
      if (!d.available) { box.textContent = d.message; return; }
      box.innerHTML = '';
      d.tweaks.forEach(t => {
        const row = document.createElement('div');
        row.className = 'c-perf-row';
        const main = document.createElement('div');
        main.className = 'c-perf-row__main';
        const title = document.createElement('strong');
        title.textContent = t.title;
        const state = document.createElement('span');
        state.className = `c-badge ${t.enabled === null ? 'c-badge--neutral' : (t.isRecommended ? 'c-badge--success' : 'c-badge--warning')}`;
        state.style.marginLeft = '8px';
        state.textContent = t.enabled === null ? 'Padrão do sistema' : (t.enabled ? 'Ativado' : 'Desativado');
        const desc = document.createElement('div');
        desc.className = 'c-perf-row__desc';
        desc.textContent = t.description + ` Recomendado: ${t.recommended ? 'ativado' : 'desativado'}.` + (t.needsAdmin ? ' Exige administrador.' : '') + (t.needsReboot ? ' Exige reiniciar.' : '');
        main.append(title, state, desc);

        const btn = document.createElement('button');
        const enable = t.enabled !== true;
        btn.className = `c-btn c-btn--sm js-tweak-toggle ${enable === t.recommended ? 'c-btn--primary' : 'c-btn--secondary'}`;
        btn.dataset.id = t.id;
        btn.dataset.enable = enable ? '1' : '0';
        btn.textContent = enable ? 'Ativar' : 'Desativar';
        row.append(main, btn);
        box.appendChild(row);
      });
    } catch (err) {
      box.textContent = 'Erro ao ler as configurações.';
    }
  },

  async setTweak(id, enabled, btn) {
    const title = btn.closest('.c-setting-row, .c-perf-row, div')?.querySelector('strong, .c-setting-row__title')?.textContent.trim();
    const ok = await Confirm.ask({
      title: `${btn.textContent.trim()}${title ? ' ' + title : ''}?`,
      message: 'A alteração fica registrada em Logs e pode ser desfeita.',
      confirmLabel: 'Confirmar'
    });
    if (!ok) return;
    await RestorePoint.offer();
    btn.disabled = true;
    try {
      const d = (await API.setTweak(id, enabled)).data || {};
      App.showToast(d.message, d.success ? 'success' : (d.needsAdmin ? 'warning' : 'danger'), 7000);
      if (d.success) await this.loadTweaks();
    } finally {
      btn.disabled = false;
    }
  },

  // ===== Diagnóstico de RAM =====
  async loadRam() {
    const box = document.getElementById('perf-ram-result');
    if (!box) return;
    box.innerHTML = '<p class="u-text-muted">Analisando pentes de memória…</p>';
    try {
      const d = (await API.getRamDiagnostic()).data || {};
      if (!d.available) { box.textContent = d.message; return; }
      box.innerHTML = '';

      const icon = { ok: '', info: '', warning: '' };
      d.issues.forEach(i => {
        const p = document.createElement('p');
        p.className = 'u-mt-xs';
        p.textContent = `${icon[i.level] || '•'} ${i.text}`;
        box.appendChild(p);
      });

      d.modules.forEach(m => {
        const row = document.createElement('div');
        row.className = 'c-perf-row';
        const left = document.createElement('span');
        left.textContent = `${m.slot}: ${m.capacityGb} GB ${d.type || ''}`;
        const right = document.createElement('span');
        right.className = 'u-text-muted';
        right.style.fontSize = '0.85rem';
        right.textContent = [m.manufacturer, m.partNumber, m.configuredMhz ? `${m.configuredMhz} MHz` : null, m.ratedMhz && m.ratedMhz !== m.configuredMhz ? `(nominal ${m.ratedMhz})` : null].filter(Boolean).join(' • ');
        row.append(left, right);
        box.appendChild(row);
      });
    } catch (err) {
      box.textContent = 'Erro ao analisar a memória.';
    }
  },

  // ===== Inicialização =====
  async loadStartup() {
    const box = document.getElementById('perf-startup-list');
    const summary = document.getElementById('perf-startup-summary');
    if (!box) return;
    box.innerHTML = '<p class="u-text-muted">Lendo programas de inicialização…</p>';
    try {
      const d = (await API.getStartup()).data || {};
      if (!d.available) { box.textContent = d.message; return; }
      if (summary) summary.textContent = `${d.enabledCount} de ${d.items.length} programas abrem com o Windows. Desativar acelera o boot; nada é apagado.${d.isAdmin ? '' : ' Itens "todos os usuários" exigem administrador.'}`;
      box.innerHTML = '';
      if (!d.items.length) { box.innerHTML = '<p class="u-text-muted">Nenhum programa na inicialização.</p>'; return; }

      d.items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'c-perf-row';
        const main = document.createElement('div');
        main.className = 'c-perf-row__main';
        const name = document.createElement('strong');
        name.textContent = item.name;
        const badge = document.createElement('span');
        badge.className = `c-badge ${item.enabled ? 'c-badge--success' : 'c-badge--neutral'}`;
        badge.style.marginLeft = '8px';
        badge.textContent = item.enabled ? 'Ativo' : 'Desativado';
        const desc = document.createElement('div');
        desc.className = 'c-perf-row__desc';
        desc.textContent = `${item.sourceLabel}${item.exe ? ' • ' + item.exe : ''}`;
        desc.title = item.command;
        main.append(name, badge, desc);

        const btn = document.createElement('button');
        btn.className = `c-btn c-btn--sm js-startup-toggle ${item.enabled ? 'c-btn--secondary' : 'c-btn--secondary'}`;
        btn.dataset.id = item.id;
        btn.dataset.enable = item.enabled ? '0' : '1';
        btn.textContent = item.enabled ? 'Desativar' : 'Ativar';
        row.append(main, btn);
        box.appendChild(row);
      });
    } catch (err) {
      box.textContent = 'Erro ao ler a inicialização.';
    }
  },

  async toggleStartup(id, enabled, btn) {
    btn.disabled = true;
    try {
      const d = (await API.toggleStartup(id, enabled)).data || {};
      App.showToast(d.message, d.success ? 'success' : (d.needsAdmin ? 'warning' : 'danger'), 7000);
      if (d.success) await this.loadStartup();
    } finally {
      btn.disabled = false;
    }
  }
};
