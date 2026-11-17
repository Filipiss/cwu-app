// backend/src/utils/updateState.js
// Estado da atualização compartilhado entre o processo do Electron (que instala e volta de versão)
// e a API local (que a aba "Novas Versões" consulta). O download fica em updateDownloader.js.
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
