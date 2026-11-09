// frontend/scripts/modules/confirm.js
/**
 * Janela de confirmação no visual do app (substitui o confirm() do navegador).
 *   const ok = await Confirm.ask({ title, message, confirmLabel, danger });
 * Fecha com Esc ou clique fora (= cancelar); Enter confirma.
 */
const Confirm = {
  ask({ title = 'Confirmar ação', message = '', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false } = {}) {
    return new Promise((resolve) => {
      const previous = document.activeElement;
      const overlay = document.createElement('div');
      overlay.className = 'c-modal';
      overlay.innerHTML = `
        <div class="c-modal__box" role="alertdialog" aria-modal="true" aria-labelledby="c-modal-title" aria-describedby="c-modal-msg">
          <h3 class="c-modal__title" id="c-modal-title"></h3>
          <p class="c-modal__msg" id="c-modal-msg"></p>
          <div class="c-modal__actions">
            <button type="button" class="c-btn c-btn--secondary js-cancel"></button>
            <button type="button" class="c-btn ${danger ? 'c-btn--danger' : 'c-btn--primary'} js-ok"></button>
          </div>
        </div>`;
      overlay.querySelector('.c-modal__title').textContent = title;
      overlay.querySelector('.c-modal__msg').textContent = message;
      overlay.querySelector('.js-cancel').textContent = cancelLabel;
      overlay.querySelector('.js-ok').textContent = confirmLabel;

      const close = (value) => {
        document.removeEventListener('keydown', onKey, true);
        overlay.classList.remove('c-modal--open');
        setTimeout(() => overlay.remove(), 150);
        if (previous && previous.focus) previous.focus();
        resolve(value);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(false); }
        if (e.key === 'Tab') { // mantém o foco dentro da janela
          const btns = [...overlay.querySelectorAll('button')];
          const i = btns.indexOf(document.activeElement);
          e.preventDefault();
          btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
        }
      };
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
      overlay.querySelector('.js-cancel').addEventListener('click', () => close(false));
      overlay.querySelector('.js-ok').addEventListener('click', () => close(true));
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('c-modal--open'));
      overlay.querySelector('.js-ok').focus();
    });
  }
};

/**
 * Antes da primeira alteração de sistema da sessão, pergunta se o usuário quer
 * criar um ponto de restauração do Windows. Nunca cria sem perguntar.
 */
const RestorePoint = {
  KEY: 'cwu_restore_asked',

  async offer() {
    try { if (sessionStorage.getItem(this.KEY)) return; sessionStorage.setItem(this.KEY, '1'); } catch (e) {}
    const yes = await Confirm.ask({
      title: 'Você deseja criar um ponto de restauração?',
      message: 'Ele permite voltar o Windows ao estado de agora caso algo não saia como esperado. Leva até 1 minuto.\n\nVocê também pode criar um a qualquer momento em Logs › Histórico do CWU App.',
      confirmLabel: 'Criar ponto de restauração',
      cancelLabel: 'Agora não'
    });
    if (!yes) return;
    App.showToast('Criando ponto de restauração… pode levar até 1 minuto.', 'info', 6000);
    try {
      const d = (await API.createRestorePoint()).data || {};
      App.showToast(d.message || (d.ok ? 'Ponto de restauração criado.' : 'Não foi possível criar o ponto de restauração.'), d.ok ? 'success' : 'warning', 8000);
    } catch (e) {
      App.showToast('Erro ao criar ponto de restauração.', 'danger');
    }
  }
};
