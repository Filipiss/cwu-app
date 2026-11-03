const test = require('node:test');
const assert = require('node:assert/strict');
const versions = require('../src/services/versionService');

test('lê versões, datas e seções do formato Keep a Changelog', () => {
  const md = `# Changelog\n\n## [1.1.0] - 2026-11-03\n### Adicionado\n- A\n- B\n### Corrigido\n- C\n\n## [1.0.0] - 2026-10-19\n- D\n`;
  const e = versions.parseChangelog(md);
  assert.equal(e.length, 2);
  assert.deepEqual(e[0], { version: '1.1.0', date: '2026-11-03', sections: [{ title: 'Adicionado', items: ['A', 'B'] }, { title: 'Corrigido', items: ['C'] }] });
  assert.deepEqual(e[1].sections, [{ title: 'Mudanças', items: ['D'] }], 'itens sem seção vão para "Mudanças"');
});

test('o CHANGELOG.md do projeto tem uma entrada para a versão instalada', () => {
  const info = versions.getVersionInfo();
  const current = info.changelog.find(e => e.isCurrent);
  assert.ok(current, `CHANGELOG.md sem a versão ${info.currentVersion}`);
  assert.match(info.releaseDate, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.equal(info.changelog.filter(e => e.isCurrent).length, 1, 'só uma versão marcada como instalada');
});
