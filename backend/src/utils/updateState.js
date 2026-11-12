// backend/src/utils/updateState.js
// Estado da atualização automática, compartilhado entre o processo do Electron (que baixa e
// instala com o electron-updater) e a API local (que a aba "Novas Versões" consulta).
const state = {
  supported: false, // só na versão instalada (instalador); no modo dev ou no exe portátil, não
  status: 'idle',   // idle | checking | downloading | downloaded | none | error
  percent: 0,
  version: null,
  error: null
};

module.exports = {
  get: () => ({ ...state }),
  set: (patch) => Object.assign(state, patch)
};
