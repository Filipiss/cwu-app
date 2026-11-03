const test = require('node:test');
const assert = require('node:assert/strict');
const processService = require('../src/services/processService');

// As validações rodam antes de qualquer PowerShell; simulamos Windows para alcançá-las
Object.defineProperty(process, 'platform', { value: 'win32' });

test('prioridade Tempo real e valores estranhos são recusados', async () => {
  for (const priority of ['RealTime', 'constructor', '__proto__', '']) {
    const r = await processService.setPriority({ name: 'game', priority });
    assert.equal(r.success, false, priority);
  }
});

test('nomes com caracteres de injeção são recusados', async () => {
  for (const name of ["x'; Remove-Item C:\\", 'a$(calc)', '../evil', '']) {
    const r = await processService.setPriority({ name, priority: 'High' });
    assert.equal(r.message, 'Nome de processo inválido.', name);
  }
});

test('processos críticos do sistema são protegidos', async () => {
  for (const name of ['lsass', 'csrss', 'svchost', 'dwm']) {
    const r = await processService.setPriority({ name, priority: 'High' });
    assert.match(r.message, /processo do sistema/, name);
  }
});

test('remoção da prioridade fixa só aceita nomes de .exe simples', async () => {
  const r = await processService.removePersistent('..\\..\\Windows\\x.exe');
  assert.equal(r.success, false);
});
