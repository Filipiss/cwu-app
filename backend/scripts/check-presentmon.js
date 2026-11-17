// backend/scripts/check-presentmon.js
// Roda antes do "npm run dist": sem o PresentMon em backend/bin, o instalador sairia sem o FPS
// da sobreposição (ela mostraria "sem PresentMon"). O .exe fica fora do git: veja backend/bin/README.md.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'bin');
let found = null;
try { found = fs.readdirSync(dir).find(f => /^presentmon.*\.exe$/i.test(f)); } catch (e) { /* pasta não existe */ }

if (!found) {
  console.error('\n[ERRO] PresentMon não encontrado em backend/bin.');
  console.error('O instalador sairia sem o FPS da sobreposição. Baixe o PresentMon (veja backend/bin/README.md),');
  console.error('coloque o PresentMon-<versão>-x64.exe em backend/bin e gere de novo.\n');
  process.exit(1);
}
console.log(`[ok] ${found} será incluído no instalador.`);
