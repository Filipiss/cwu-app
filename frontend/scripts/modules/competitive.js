// frontend/scripts/modules/competitive.js
/**
 * Boost Gamer › Competitivo: monitor, mouse, teste de polling, overlays,
 * energia, rede, guia de latência e mitos. Carrega quando a sub-aba abre.
 */
const CompetitiveModule = {
  status: null,
  loaded: false,

  init() {
    document.addEventListener('subtab:change', () => this.loadIfVisible());
    document.querySelectorAll('[data-tab="boost"]').forEach(el => el.addEventListener('click', () => setTimeout(() => this.loadIfVisible(), 0)));
    setTimeout(() => this.loadIfVisible(), 0);

    document.getElementById('btn-comp-network')?.addEventListener('click', () => this.runNetworkTest());

    // Todos os botões de ação da sub-aba usam data-action + data-* como parâmetros
    document.querySelector('[data-group="boost"][data-view="competitive"].js-subtab-panel')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.js-comp-action');
      if (btn) this.act(btn);
    });

    this.initPollingTest();
  },

  loadIfVisible() {
    const open = document.getElementById('tab-boost')?.classList.contains('c-tab-panel--active');
    if (open && SubTabs.is('boost', 'competitive') && !this.loaded) {
      this.loaded = true;
      this.load();
    }
  },

  icon(n) { return `<svg class="c-icon" aria-hidden="true"><use href="#i-${n}"></use></svg>`; },
  esc(v) { return String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },

  // Linha padrão: título + descrição à esquerda, selo de estado + botão à direita
  row({ title, desc, state, action }) {
    return `<div class="c-setting-row">
      <div class="c-setting-row__text">
        <div class="c-setting-row__title">${title}${state || ''}</div>
        ${desc ? `<div class="c-setting-row__desc">${desc}</div>` : ''}
      </div>
      ${action ? `<div class="c-setting-row__action">${action}</div>` : ''}
    </div>`;
  },

  badge(ok, okText, badText) {
    return ok
      ? `<span class="c-badge c-badge--success">${this.icon('check')} ${okText}</span>`
      : `<span class="c-badge c-badge--warning">${this.icon('triangle-alert')} ${badText}</span>`;
  },

  actionBtn(label, data, variant = 'primary') {
    const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${this.esc(v)}"`).join(' ');
    return `<button class="c-btn c-btn--${variant} c-btn--sm js-comp-action" ${attrs}><span>${this.esc(label)}</span></button>`;
  },

  async load() {
    try {
      const res = await API.request('/api/competitive');
      this.status = res.data || {};
    } catch (err) {
      this.status = { available: false, message: 'Erro ao consultar o servidor.' };
    }
    const d = this.status;
    if (!d.available) {
      ['comp-display-list', 'comp-mouse-list', 'comp-overlay-list', 'comp-power-list', 'comp-guide-body'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<p class="c-card__desc">${this.esc(d.message)}</p>`;
      });
      return;
    }
    this.renderDisplays(d);
    this.renderMouse(d);
    this.renderOverlays(d);
    this.renderPower(d);
    this.renderGuide(d);
  },

  renderDisplays(d) {
    const box = document.getElementById('comp-display-list');
    if (!box) return;
    if (!d.displays.length) { box.innerHTML = '<p class="c-card__desc">Nenhum monitor detectado.</p>'; return; }
    box.innerHTML = d.displays.map(m => this.row({
      title: `${this.esc(m.monitor)}${m.primary ? ' <span class="c-badge c-badge--neutral">Principal</span>' : ''}`,
      desc: `${m.width}×${m.height} • ${this.esc(m.adapter)} • taxas disponíveis: ${m.rates.join(', ')} Hz`,
      state: this.badge(!m.belowMax, `${m.current} Hz (máximo)`, `${m.current} Hz de ${m.max} Hz`),
      action: m.belowMax ? this.actionBtn(`Usar ${m.max} Hz`, { action: 'display', device: m.name, hz: m.max }) : ''
    })).join('') + `<p class="c-card__desc" style="margin-top:8px;">Se a taxa máxima não aparece, troque o cabo (HDMI 1.4 limita a 60 Hz em 1080p/1440p) ou use DisplayPort.</p>`;
  },

  renderMouse(d) {
    const box = document.getElementById('comp-mouse-list');
    if (!box) return;
    const m = d.mouse;
    box.innerHTML =
      this.row({
        title: 'Aceleração do mouse ("Aumentar precisão do ponteiro")',
        desc: 'Com aceleração, um movimento rápido anda mais que um lento: a memória muscular da mira não se forma.',
        state: this.badge(!m.accelerationOn, 'Desativada', 'Ativada'),
        action: m.accelerationOn
          ? this.actionBtn('Desativar', { action: 'mouse-accel', enabled: 'false' })
          : this.actionBtn('Reativar', { action: 'mouse-accel', enabled: 'true' }, 'secondary')
      }) +
      this.row({
        title: 'Velocidade do ponteiro no Windows',
        desc: 'O 6º nível (de 11) é 1:1: o Windows não multiplica o movimento nem pula pixels. Ajuste a sensibilidade pelo DPI do mouse e dentro do jogo.',
        state: this.badge(m.speedIsOneToOne, '1:1 (6/11)', `Nível ${m.speed ?? '?'} de 20`),
        action: m.speedIsOneToOne ? '' : this.actionBtn('Ajustar para 1:1', { action: 'mouse-speed', speed: 10 })
      });
  },

  renderOverlays(d) {
    const box = document.getElementById('comp-overlay-list');
    if (!box) return;
    const gameBar = this.row({
      title: 'Overlay do Xbox Game Bar (Win+G)',
      desc: 'Desligar não afeta o Modo de Jogo nem jogos do Game Pass.',
      state: this.badge(!d.gameBarOverlayOn, 'Desativado', 'Ativado'),
      action: d.gameBarOverlayOn
        ? this.actionBtn('Desativar', { action: 'gamebar', enabled: 'false' })
        : this.actionBtn('Reativar', { action: 'gamebar', enabled: 'true' }, 'secondary')
    });
    const others = d.overlays.filter(o => o.id !== 'gamebar');
    box.innerHTML = gameBar + (others.length
      ? others.map(o => this.row({ title: this.esc(o.name), desc: this.esc(o.how), state: '<span class="c-badge c-badge--neutral">Em execução</span>' })).join('')
      : `<p class="c-card__desc" style="margin-top:8px;">${this.icon('circle-check')} Nenhum outro programa com overlay em execução agora.</p>`);
  },

  renderPower(d) {
    const box = document.getElementById('comp-power-list');
    if (!box) return;
    const p = d.power;
    box.innerHTML =
      this.row({
        title: 'Plano de energia Desempenho Máximo',
        desc: 'Plano oculto do Windows que mantém a CPU pronta para responder, sem os atrasos de "acordar" núcleos.' + (d.isLaptop ? ' Em notebook, use na tomada.' : ''),
        state: this.badge(p.ultimateActive, 'Ativo', 'Inativo'),
        action: p.ultimateActive
          ? this.actionBtn('Restaurar anterior', { action: 'ultimate', enabled: 'false' }, 'secondary')
          : this.actionBtn('Ativar', { action: 'ultimate', enabled: 'true' })
      }) +
      this.row({
        title: 'Suspensão seletiva de USB',
        desc: 'Quando ligada, o Windows pode cortar a energia de portas USB ociosas, o que causa mouse ou headset "sumindo" por instantes.',
        state: p.usbSelectiveSuspendOn === null ? '<span class="c-badge c-badge--neutral">Desconhecido</span>' : this.badge(!p.usbSelectiveSuspendOn, 'Desativada', 'Ativada'),
        action: p.usbSelectiveSuspendOn
          ? this.actionBtn('Desativar', { action: 'usb-suspend', enabled: 'false' })
          : (p.usbSelectiveSuspendOn === false ? this.actionBtn('Reativar', { action: 'usb-suspend', enabled: 'true' }, 'secondary') : '')
      });
  },

  // Guia conforme a placa de vídeo detectada e a taxa do monitor principal
  renderGuide(d) {
    const box = document.getElementById('comp-guide-body');
    if (!box) return;
    const main = d.displays.find(m => m.primary) || d.displays[0] || { max: 60 };
    const adapter = (main.adapter || '').toLowerCase();
    const vendor = /nvidia|geforce|rtx|gtx/.test(adapter) ? 'nvidia' : /radeon|amd/.test(adapter) ? 'amd' : /intel|arc/.test(adapter) ? 'intel' : 'other';
    const cap = Math.max(30, (main.max || 60) - 3);

    const steps = {
      nvidia: [
        'Nos jogos que oferecem, ative o <strong>NVIDIA Reflex: Ligado + Boost</strong>. Ele substitui o "Modo de baixa latência" do painel nesses jogos.',
        'Nos jogos sem Reflex: Painel NVIDIA › Gerenciar as configurações em 3D › <strong>Modo de baixa latência: Ultra</strong>.',
        `Se o monitor tem G-SYNC/FreeSync: ative-o no painel, ligue o <strong>V-Sync no Painel NVIDIA</strong> (desligado no jogo) e limite o FPS a <strong>${cap}</strong> (3 abaixo de ${main.max} Hz). Com Reflex ativo, esse limite é aplicado automaticamente.`,
        'Sem G-SYNC/FreeSync: deixe o V-Sync desligado e, se a GPU passar de 95% de uso, limite o FPS um pouco abaixo do que o jogo alcança (GPU no limite aumenta a latência).'
      ],
      amd: [
        'AMD Software › Jogos › Gráficos › ative o <strong>Radeon Anti-Lag</strong> (ou <strong>Anti-Lag 2</strong>, nos jogos compatíveis).',
        `Com FreeSync: ative-o no monitor e no AMD Software e limite o FPS a <strong>${cap}</strong> com o <strong>Radeon Chill</strong> (mín. e máx. em ${cap}) ou pelo limitador do jogo.`,
        'Deixe o "Enhanced Sync" desligado se notar engasgos; V-Sync desligado no jogo.',
        'Se a GPU passar de 95% de uso, limite o FPS um pouco abaixo do que o jogo alcança: GPU no limite aumenta a latência.'
      ],
      intel: [
        'Intel Graphics Software › Jogos › ative o <strong>Intel XeLL</strong> nos jogos compatíveis e o <strong>Modo de baixa latência</strong> nos demais.',
        `Com VRR (Adaptive Sync): limite o FPS a <strong>${cap}</strong> pelo jogo ou pelo painel.`,
        'Se a GPU passar de 95% de uso, limite o FPS um pouco abaixo do que o jogo alcança.'
      ],
      other: [
        'Ative o modo de baixa latência do painel da sua placa de vídeo e a opção equivalente dentro do jogo (Reflex, Anti-Lag ou XeLL).',
        `Com VRR (G-SYNC/FreeSync): limite o FPS a ${cap} (3 abaixo da taxa do monitor).`
      ]
    };
    const common = [
      'Jogue em <strong>tela cheia exclusiva</strong> ou em janela sem bordas com as "Otimizações para jogos em janela" ligadas (aba Performance › Ajustes de jogos).',
      'Use <strong>cabo de rede</strong> em vez de Wi-Fi e feche downloads (Steam, Windows Update) durante partidas online.'
    ];
    const label = { nvidia: 'NVIDIA', amd: 'AMD Radeon', intel: 'Intel', other: 'sua placa' }[vendor];
    box.innerHTML = `<p class="c-card__desc" style="margin-top:0; margin-bottom:12px;">Detectado: <strong>${this.esc(main.adapter || 'placa de vídeo')}</strong> • monitor em até ${main.max || '?'} Hz</p>
      <div class="c-steps">${[...steps[vendor], ...common].map(t => `<div class="c-steps__item"><span>${t}</span></div>`).join('')}</div>
      <p class="c-card__desc" style="margin-top:12px;">Recomendações para ${label}. A NVIDIA e a AMD não permitem que programas de terceiros mudem essas opções com segurança, por isso o CWU mostra o caminho em vez de alterar sozinho.</p>`;
  },

  async act(btn) {
    const { action, ...params } = btn.dataset;
    const title = btn.closest('.c-setting-row')?.querySelector('.c-setting-row__title')?.textContent.trim();
    const ok = await Confirm.ask({
      title: `${btn.textContent.trim()}?`,
      message: `${title ? title + '\n\n' : ''}A alteração fica registrada em Logs e pode ser desfeita pelo mesmo botão.`,
      confirmLabel: 'Confirmar'
    });
    if (!ok) return;
    await RestorePoint.offer();
    const body = {};
    for (const [k, v] of Object.entries(params)) body[k] = v === 'true' ? true : v === 'false' ? false : (/^\d+$/.test(v) ? Number(v) : v);
    btn.disabled = true;
    try {
      const res = await API.request(`/api/competitive/${action}`, { method: 'POST', body: JSON.stringify(body) });
      const d = res.data || {};
      App.showToast(d.message || 'Concluído.', d.success ? 'success' : (d.needsAdmin ? 'warning' : 'danger'), 7000);
      if (d.success) await this.load();
    } catch (err) {
      App.showToast('Erro ao aplicar o ajuste.', 'danger');
    } finally {
      btn.disabled = false;
    }
  },

  async runNetworkTest() {
    const btn = document.getElementById('btn-comp-network');
    const box = document.getElementById('comp-network-result');
    if (!box) return;
    btn.disabled = true;
    box.innerHTML = `<p class="c-card__desc">Enviando 60 pacotes para 3 servidores… cerca de 10 segundos.</p>`;
    try {
      const d = (await API.request('/api/competitive/network')).data || {};
      if (!d.available) { box.innerHTML = `<p class="c-card__desc">${this.esc(d.message)}</p>`; return; }
      const lvl = { ok: 'success', warn: 'warning', bad: 'danger' }[d.summary.level];
      const names = { '1.1.1.1': 'Cloudflare', '8.8.8.8': 'Google', '208.67.222.222': 'OpenDNS' };
      const stats = d.results.map(r => `<div class="c-net-stat">
          <div class="c-net-stat__label">${names[r.target] || r.target}</div>
          <div class="c-net-stat__value">${r.avg === null ? '—' : r.avg + ' ms'}</div>
          <div class="c-net-stat__sub">jitter ${r.jitter ?? '—'} ms • perda ${r.loss}%</div>
        </div>`).join('');
      const adapters = d.adapters.map(a => this.row({
        title: `${this.icon(a.wifi ? 'wifi' : 'cable')} ${this.esc(a.name)} <span class="c-badge c-badge--neutral">${a.wifi ? 'Wi-Fi' : 'Cabo'} • ${this.esc(a.speed)}</span>`,
        desc: (a.wifi ? 'Wi-Fi tem mais variação de ping e perda de pacotes que cabo. Para partidas competitivas, prefira cabo. ' : '') + this.esc(a.description),
        action: [
          a.eeeOn ? this.actionBtn('Desligar Energy Efficient Ethernet', { action: 'adapter', adapter: a.name, setting: 'eee', enabled: 'false' }, 'secondary') : '',
          a.powerSavingOn ? this.actionBtn('Desligar economia de energia', { action: 'adapter', adapter: a.name, setting: 'powerSaving', enabled: 'false' }, 'secondary') : ''
        ].join('')
      })).join('');
      box.innerHTML = `
        <p class="u-mb-md"><span class="c-badge c-badge--${lvl}">${this.icon(d.summary.level === 'ok' ? 'check' : 'triangle-alert')} ${d.summary.level === 'ok' ? 'Boa' : d.summary.level === 'warn' ? 'Atenção' : 'Ruim'}</span> ${this.esc(d.summary.text)}</p>
        <div class="c-net-grid">${stats}</div>
        <div style="margin-top:16px;">${adapters || '<p class="c-card__desc">Nenhuma placa de rede ativa encontrada.</p>'}</div>
        <p class="c-card__desc" style="margin-top:8px;">O ping até o servidor do jogo depende da distância: escolha sempre o servidor/região mais próximo nas opções do jogo.</p>`;
    } catch (err) {
      box.innerHTML = '<p class="c-card__desc">Erro ao testar a rede.</p>';
    } finally {
      btn.disabled = false;
    }
  },

  // ===== Teste de polling rate =====
  // pointerrawupdate entrega cada relatório do mouse sem agrupar por quadro (Chromium/Electron).
  // Sem ele, contamos os eventos agrupados de cada pointermove (getCoalescedEvents).
  initPollingTest() {
    const area = document.getElementById('comp-polling-area');
    if (!area) return;
    const valueEl = document.getElementById('comp-polling-value');
    const hintEl = document.getElementById('comp-polling-hint');
    const RATES = [125, 250, 500, 1000, 2000, 4000, 8000];
    let windowStart = 0, count = 0, best = 0, lastEvent = 0, idleTimer = null;

    const onReport = (n) => {
      const now = performance.now();
      // Pausas na movimentação não contam: reinicia a janela se o mouse parou
      if (now - lastEvent > 100) { windowStart = now; count = 0; }
      lastEvent = now;
      count += n;
      const elapsed = now - windowStart;
      if (elapsed >= 250) {
        best = Math.max(best, (count / elapsed) * 1000);
        windowStart = now; count = 0;
        const snapped = RATES.reduce((a, b) => (Math.abs(Math.log(b / best)) < Math.abs(Math.log(a / best)) ? b : a));
        valueEl.textContent = `${snapped} Hz`;
        hintEl.textContent = `Medido: ~${Math.round(best)} relatórios/s. ${snapped >= 1000 ? 'Ótimo para jogos competitivos.' : snapped >= 500 ? 'Bom; 1000 Hz reduz ainda mais o atraso.' : 'Baixo: se o mouse suporta, aumente o polling para 1000 Hz no software do fabricante.'}`;
      }
      area.classList.add('c-polling--measuring');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => area.classList.remove('c-polling--measuring'), 400);
    };

    if ('onpointerrawupdate' in window) {
      area.addEventListener('pointerrawupdate', () => onReport(1));
    } else {
      area.addEventListener('pointermove', (e) => onReport(e.getCoalescedEvents ? Math.max(1, e.getCoalescedEvents().length) : 1));
    }
    area.addEventListener('pointerenter', () => { best = 0; valueEl.textContent = '…'; });
  }
};
