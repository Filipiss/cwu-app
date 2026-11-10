const test = require('node:test');
const assert = require('node:assert/strict');
const { classify } = require('../../frontend/scripts/chatTopic');

test('chatTopic: perguntas técnicas vão para a IA', () => {
  for (const m of ['Analise meu PC', 'Qual upgrade vale mais a pena?', 'Melhor config de vídeo pro CS2',
    'mouse custo-benefício até 200 reais', 'meu jogo está travando', 'Placa de vídeo esquentando muito', 'ping alto no Valorant'])
    assert.equal(classify(m), 'send', m);
});
test('chatTopic: assuntos claramente fora do escopo têm resposta pronta', () => {
  for (const m of ['me passa uma receita de bolo', 'quem vai ganhar a eleição?', 'escreve um poema de amor', 'qual o meu signo?'])
    assert.equal(classify(m), 'offtopic', m);
});
test('chatTopic: termo técnico vence palavra fora do escopo', () => {
  assert.equal(classify('qual monitor bom para ver filme e jogar?'), 'send');
});
test('chatTopic: cumprimentos não gastam tokens', () => {
  for (const m of ['oi', 'Olá!', 'obrigado', 'valeu', 'bom dia']) assert.equal(classify(m), 'greeting', m);
});
test('chatTopic: ambíguo vai para a IA decidir', () => {
  assert.equal(classify('o que você acha disso?'), 'send');
});
test('chatTopic: siglas curtas não casam dentro de outras palavras', () => {
  assert.equal(classify('vou ao shopping comprar um vestido'), 'send'); // "pc"/"hd" não casam por acaso
  assert.equal(classify('sappc'), 'send');
  assert.equal(classify('receita com cabo hdmi'), 'send');
});
const { buildContext } = require('../../frontend/scripts/chatTopic');
test('buildContext: resume o hardware lido pelo app', () => {
  const ctx = buildContext({
    specs: {
      cpu: { name: 'AMD Ryzen 5 5600', cores: 6, threads: 12, clockGhz: '3.50', detected: true },
      gpu: null,
      gpus: [{ name: 'AMD Radeon RX 6600', vramGb: 8, isDedicated: true, driverVersion: '31.0', resolution: '1920x1080', refreshRate: 144 }],
      ram: { totalGb: 16, type: 'DDR4', speedMhz: 3200, slotsUsed: 2 },
      disks: [{ model: 'Kingston NV2', sizeGb: 500, driveType: 'NVMe SSD', health: 'Saudável' }],
      motherboard: { manufacturer: 'ASUS', model: 'B550M', detected: true },
      os: { caption: 'Microsoft Windows 11 Pro', build: '26100', architecture: '64 bits' }
    },
    scores: { overall: 7.4, ratingTier: 'Muito bom', components: { cpu: { score: 7, detected: true } } }
  });
  assert.match(ctx, /Ryzen 5 5600, 6 núcleos\/12 threads, 3.50 GHz \(nota 7\/10\)/);
  assert.match(ctx, /RX 6600, 8 GB VRAM, dedicada/);
  assert.match(ctx, /1920x1080 @ 144 Hz/);
  assert.match(ctx, /16 GB DDR4 3200 MHz, 2 pente/);
  assert.match(ctx, /Nota geral do CWU App: 7.4\/10/);
});
test('buildContext: sem dados devolve vazio', () => {
  assert.equal(buildContext(null), '');
});
