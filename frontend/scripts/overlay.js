// frontend/scripts/overlay.js
/**
 * Sobreposição de desempenho: mostra só os números escolhidos em Configurações, com
 * layout (vertical/horizontal), tamanho e transparência ajustáveis. Mede o próprio
 * tamanho e avisa o app, que posiciona a janela. Com ?edit=1, vira arrastável.
 */
(function () {
  const box = document.getElementById('osd');
  const editing = new URLSearchParams(location.search).get('edit') === '1';
  let s = {};
  let fps = null;
  let last = {};
  let lastSize = '';
  const FPS_HINT = { missing: 'sem PresentMon', admin: 'requer admin', error: 'erro', platform: '—' };

  const pct = (v) => (Number.isFinite(v) ? `${Math.round(v)}%` : '—');
  const temp = (v, warn, hot) => {
    if (!Number.isFinite(v)) return '';
    const cls = v >= hot ? 'hot' : v >= warn ? 'warn' : 'ok';
    return `<span class="c-osd--${cls}">${Math.round(v)}°C</span>`;
  };
  const row = (label, parts) => `<div class="c-osd__row"><span class="c-osd__label">${label}</span><span class="c-osd__value">${parts.filter(Boolean).join('') || '<span class="c-osd__muted">—</span>'}</span></div>`;

  function applyStyle() {
    const scale = Math.min(200, Math.max(60, Number(s.overlayScale) || 100)) / 100;
    // Mínimo de 20% para a sobreposição não sumir de vez
    const opacity = Math.min(100, Math.max(20, Number(s.overlayOpacity ?? 85))) / 100;
    box.style.setProperty('--osd-scale', scale);
    box.style.setProperty('--osd-opacity', opacity);
    box.classList.toggle('c-osd--horizontal', s.overlayLayout === 'horizontal');
    box.classList.toggle('c-osd--vertical', s.overlayLayout !== 'horizontal');
  }

  function render(m) {
    last = m || last;
    m = last;
    const rows = [];
    if (s.overlayFps) {
      if (fps && fps.available) rows.push(row('FPS', [Number.isFinite(fps.fps) ? `<span>${fps.fps}</span>` : '', Number.isFinite(fps.low1) ? `<span class="c-osd__muted">1% ${fps.low1}</span>` : '']));
      else rows.push(row('FPS', [fps ? `<span class="c-osd__muted">${FPS_HINT[fps.reason] || '—'}</span>` : '']));
    }
    if (s.overlayCpu || s.overlayCpuTemp) rows.push(row('CPU', [s.overlayCpu && `<span>${pct(m.cpu)}</span>`, s.overlayCpuTemp && temp(m.cpuTemp, 75, 88)]));
    if (s.overlayRam) rows.push(row('RAM', [`<span>${pct(m.ram)}</span>`, Number.isFinite(m.ramUsedGb) ? `<span class="c-osd__muted">${m.ramUsedGb} GB</span>` : '']));
    if (s.overlayGpu || s.overlayGpuTemp) rows.push(row('GPU', [s.overlayGpu && `<span>${pct(m.gpu)}</span>`, s.overlayGpuTemp && temp(m.gpuTemp, 75, 88)]));
    if (!rows.length) rows.push(row('CWU', ['<span class="c-osd__muted">nada selecionado</span>']));
    box.innerHTML = rows.join('');
    reportSize();
  }

  // Avisa o tamanho real (muda com layout, escala e linhas) para o app ajustar a janela
  function reportSize() {
    const r = document.body.getBoundingClientRect();
    const key = `${Math.ceil(r.width)}x${Math.ceil(r.height)}`;
    if (key === lastSize) return;
    lastSize = key;
    post('/api/overlay/size', { width: Math.ceil(r.width), height: Math.ceil(r.height) });
  }

  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).catch(() => {});
  }

  async function get(url) {
    const r = await fetch(url, { cache: 'no-store' });
    return (await r.json()).data;
  }

  async function tick() {
    try {
      const cfg = await get('/api/settings').catch(() => null);
      if (cfg) { s = cfg; applyStyle(); }
      const [snap, f] = await Promise.all([
        get('/api/monitor'),
        s.overlayFps ? get('/api/fps').catch(() => null) : null
      ]);
      fps = f;
      render(snap && snap.latest);
    } catch (e) { /* servidor ocupado: tenta na próxima */ }
  }

  if (editing) {
    document.body.classList.add('is-editing');
    const bar = document.createElement('div');
    bar.className = 'c-osd-edit';
    bar.innerHTML = '<span>Arraste para posicionar</span><button type="button" class="is-primary" id="osd-save">Salvar</button><button type="button" id="osd-cancel">Cancelar</button>';
    document.body.appendChild(bar);
    document.getElementById('osd-save').addEventListener('click', () => post('/api/overlay/save-position'));
    document.getElementById('osd-cancel').addEventListener('click', () => post('/api/overlay/cancel-edit'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') post('/api/overlay/save-position');
      if (e.key === 'Escape') post('/api/overlay/cancel-edit');
    });
  }

  new ResizeObserver(reportSize).observe(document.body);
  render({});
  tick();
  setInterval(tick, 1500);
})();
