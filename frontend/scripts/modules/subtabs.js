// frontend/scripts/modules/subtabs.js
/**
 * Sub-abas reutilizáveis. Marcação:
 *   <div class="c-subtabs" role="tablist" data-group="perf">
 *     <button class="c-subtabs__tab js-subtab" data-group="perf" data-view="monitor">…</button>
 *   </div>
 *   <div class="c-subtab-panel js-subtab-panel" data-group="perf" data-view="monitor">…</div>
 * Ao trocar, dispara o evento "subtab:change" (detail: { group, view }) para os
 * módulos carregarem o conteúdo só quando a sub-aba é aberta.
 */
const SubTabs = {
  current: {},

  init() {
    document.addEventListener('click', (e) => {
      const tab = e.target.closest('.js-subtab');
      if (tab) this.show(tab.dataset.group, tab.dataset.view);
    });

    // Setas do teclado navegam entre as sub-abas (padrão de acessibilidade de tablist)
    document.addEventListener('keydown', (e) => {
      const tab = e.target.closest('.js-subtab');
      if (!tab || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const tabs = [...document.querySelectorAll(`.js-subtab[data-group="${tab.dataset.group}"]`)];
      const next = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      next.focus();
      this.show(next.dataset.group, next.dataset.view);
    });

    // Restaura a última sub-aba de cada grupo (ou a primeira)
    const groups = new Set([...document.querySelectorAll('.js-subtab')].map(t => t.dataset.group));
    groups.forEach(group => {
      let saved = null;
      try { saved = localStorage.getItem(`cwu_subtab_${group}`); } catch (e) {}
      const exists = saved && document.querySelector(`.js-subtab[data-group="${group}"][data-view="${saved}"]`);
      const first = document.querySelector(`.js-subtab[data-group="${group}"]`);
      this.show(group, exists ? saved : first.dataset.view, { silent: true });
    });
  },

  show(group, view, { silent = false } = {}) {
    document.querySelectorAll(`.js-subtab[data-group="${group}"]`).forEach(tab => {
      const active = tab.dataset.view === view;
      tab.classList.toggle('c-subtabs__tab--active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll(`.js-subtab-panel[data-group="${group}"]`).forEach(panel => {
      panel.classList.toggle('u-hidden', panel.dataset.view !== view);
    });
    this.current[group] = view;
    try { localStorage.setItem(`cwu_subtab_${group}`, view); } catch (e) {}
    if (!silent) document.dispatchEvent(new CustomEvent('subtab:change', { detail: { group, view } }));
  },

  is(group, view) {
    return this.current[group] === view;
  }
};
