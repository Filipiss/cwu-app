const test = require('node:test');
const assert = require('node:assert/strict');
const { pickInstallable, parseYmlSha512 } = require('../src/services/rollbackService');

const repo = 'Filipiss/cwu-app';
const asset = (v, name) => ({ name, size: 100, browser_download_url: `https://github.com/${repo}/releases/download/v${v}/${name}` });
const rel = (v, extra = {}) => ({ tag_name: `v${v}`, published_at: '2026-11-12T10:00:00Z', assets: [asset(v, 'CWU-App-Setup.exe'), asset(v, 'latest.yml')], ...extra });

test('pickInstallable: só releases com instalador, sem a atual, da mais nova para a mais antiga', () => {
  const list = pickInstallable([
    rel('1.2.0'), rel('1.3.0'), rel('1.2.1'),
    { tag_name: 'v1.1.0', assets: [asset('1.1.0', 'CWU-App.exe')] }, // exe portátil antigo: fora
    rel('1.4.0', { prerelease: true }), rel('1.5.0', { draft: true })
  ], '1.3.0', repo);
  assert.deepEqual(list.map(r => r.version), ['1.2.1', '1.2.0']);
  assert.equal(list[0].date, '2026-11-12');
});

test('pickInstallable: recusa links fora do repositório', () => {
  const evil = rel('1.2.0');
  evil.assets[0].browser_download_url = 'https://exemplo.com/CWU-App-Setup.exe';
  assert.deepEqual(pickInstallable([evil], '1.3.0', repo), []);
});

test('parseYmlSha512: lê o código do nível de cima do latest.yml', () => {
  const yml = `version: 1.2.0
files:
  - url: CWU-App-Setup.exe
    sha512: AAAfilesBBB==
    size: 100
path: CWU-App-Setup.exe
sha512: Zm9vYmFyMTIz+/==
releaseDate: '2026-11-12T10:00:00.000Z'
`;
  assert.equal(parseYmlSha512(yml), 'Zm9vYmFyMTIz+/==');
  assert.equal(parseYmlSha512('version: 1'), null);
});
