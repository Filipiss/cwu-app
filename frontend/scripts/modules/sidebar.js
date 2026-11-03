// frontend/scripts/modules/sidebar.js
/**
 * Menu lateral recolhível: botão no topo do menu ou Ctrl+B.
 * Recolhido, vira uma faixa só com ícones e mostra o nome de cada aba num balão.
 * O estado fica salvo; sem preferência salva, janelas estreitas começam recolhidas.
 */
const Sidebar = {
  KEY: 'cwu_sidebar_collapsed',

  init() {
    const app = document.querySelector('.o-app');
    const btn = document.getElementById('btn-sidebar-toggle');
    if (!app || !btn) return;

    let saved = null;
    try { saved = localStorage.getItem(this.KEY); } catch (e) {}
    const collapsed = saved === null ? window.innerWidth < 1100 : saved === '1';
    // Estado inicial sem animação (evita o menu "deslizar" ao abrir o app)
    app.classList.add('o-app--no-anim');
    this.apply(collapsed, false);
    requestAnimationFrame(() => requestAnimationFrame(() => app.classList.remove('o-app--no-anim')));

    btn.addEventListener('click', () => this.toggle());

    document.addEventListener('keydown', (e) => {
      // Ctrl+B (ou Cmd+B) alterna o menu, exceto quando digitando num campo
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b' && !typing) {
        e.preventDefault();
        this.toggle();
      }
    });

    // Itens do menu acessíveis pelo teclado (Enter/Espaço)
    document.querySelector('.c-nav')?.addEventListener('keydown', (e) => {
      const item = e.target.closest('.js-nav-item');
      if (item && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        item.click();
      }
    });
  },

  isCollapsed() {
    return document.querySelector('.o-app')?.classList.contains('o-app--nav-collapsed');
  },

  toggle() {
    this.apply(!this.isCollapsed(), true);
  },

  apply(collapsed, persist) {
    const app = document.querySelector('.o-app');
    const btn = document.getElementById('btn-sidebar-toggle');
    app.classList.toggle('o-app--nav-collapsed', collapsed);
    if (btn) {
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.setAttribute('aria-label', collapsed ? 'Expandir menu (Ctrl+B)' : 'Recolher menu (Ctrl+B)');
      btn.title = collapsed ? 'Expandir menu (Ctrl+B)' : 'Recolher menu (Ctrl+B)';
    }
    if (persist) {
      try { localStorage.setItem(this.KEY, collapsed ? '1' : '0'); } catch (e) {}
    }
  }
};
