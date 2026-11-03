// Valida se todos os IDs do wingetCatalog existem: `npm run check-winget` (Windows)
const { spawnSync } = require('child_process');
const map = require('../src/database/wingetCatalog');

let failures = 0;
for (const [catalogId, pkgs] of Object.entries(map)) {
  if (!pkgs) { console.log(`-   ${catalogId}: sem pacote (só download manual)`); continue; }
  for (const p of pkgs) {
    const { id, source = 'winget' } = typeof p === 'string' ? { id: p } : p;
    const r = spawnSync('winget', ['show', '--id', id, '--exact', '--source', source, '--accept-source-agreements', '--disable-interactivity'], { encoding: 'utf8' });
    const ok = r.status === 0;
    if (!ok) failures++;
    console.log(`${ok ? 'OK ' : 'ERRO'} ${catalogId}: ${id}`);
  }
}
console.log(failures ? `\n${failures} ID(s) inválido(s).` : '\nTodos os IDs são válidos.');
process.exit(failures ? 1 : 0);
