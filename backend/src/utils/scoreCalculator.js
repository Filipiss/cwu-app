// backend/src/utils/scoreCalculator.js

/**
 * Calcula nota de 1.0 a 10.0 para cada componente e a nota geral do sistema.
 *
 * Critério (heurístico, documentado no README):
 *  - CPU: núcleos/threads + família (i3/i5/i7/i9, Ryzen 3/5/7/9) + geração recente
 *  - GPU: tabela de modelos por faixa de desempenho; VRAM como desempate
 *  - RAM: capacidade total, penalidade para canal simples (1 pente)
 *  - Armazenamento: NVMe > SATA SSD > HDD
 * Componentes não detectados ficam de fora da média (o peso é redistribuído).
 */
const WEIGHTS = { cpu: 0.30, gpu: 0.35, ram: 0.20, storage: 0.15 };

function calculateSystemScores({ cpu, gpu, ram, storage }) {
  const components = {
    cpu: scoreCpu(cpu),
    gpu: scoreGpu(gpu),
    ram: scoreRam(ram),
    storage: scoreStorage(storage)
  };

  let weighted = 0;
  let totalWeight = 0;
  for (const [key, comp] of Object.entries(components)) {
    if (comp.detected) {
      weighted += comp.score * WEIGHTS[key];
      totalWeight += WEIGHTS[key];
    }
  }
  const overall = totalWeight > 0 ? weighted / totalWeight : 0;

  return {
    overall: parseFloat(overall.toFixed(1)),
    ratingTier: getTierDescription(overall),
    partial: totalWeight < 0.999,
    components
  };
}

function notDetected() {
  return { score: 0, status: 'Não detectado', highlight: 'Leitura indisponível', detected: false };
}

function clamp(score) {
  return parseFloat(Math.min(10.0, Math.max(1.0, score)).toFixed(1));
}

function getTierDescription(score) {
  if (score >= 9.0) return { label: 'Entusiasta / Top-Tier', color: '#10b981', summary: 'Excelente para jogos pesados em 4K e renderização profissional.' };
  if (score >= 8.0) return { label: 'Alta Performance', color: '#06b6d4', summary: 'Roda jogos atuais em alta qualidade e multitarefa pesada.' };
  if (score >= 6.5) return { label: 'Intermediário Sólido', color: '#3b82f6', summary: 'Ótimo para jogos competitivos em 1080p e produtividade diária.' };
  if (score >= 5.0) return { label: 'Básico / Entrada', color: '#f59e0b', summary: 'Adequado para escritório, estudos e jogos leves.' };
  return { label: 'Modesto / Requer Upgrade', color: '#ef4444', summary: 'Recomendado upgrade de hardware para melhor fluidez no Windows moderno.' };
}

function scoreCpu(cpu) {
  if (!cpu || !cpu.detected) return notDetected();
  const name = (cpu.name || '').toLowerCase();
  const threads = cpu.threads || 0;
  const cores = cpu.cores || Math.max(1, Math.floor(threads / 2));

  let score;
  if (cores >= 16) score = 9.6;
  else if (cores >= 12) score = 9.2;
  else if (cores >= 8) score = 8.6;
  else if (cores >= 6) score = 7.8;
  else if (cores >= 4) score = threads >= 8 ? 7.0 : 5.8;
  else score = 4.0;

  if (/i9|ryzen 9|core ultra 9/.test(name)) score = Math.max(score, 9.3);
  else if (/i7|ryzen 7|core ultra 7/.test(name)) score = Math.max(score, 8.6);
  else if (/i5|ryzen 5|core ultra 5/.test(name)) score = Math.max(score, 7.6);
  else if (/celeron|pentium|athlon/.test(name)) score = Math.min(score, 4.5);

  // Gerações recentes (Intel 12ª+ / Core Ultra, Ryzen 7000+)
  if (/1[2-4]\d{3}|core ultra|ryzen \d \d?[789]\d{3}/.test(name)) score += 0.3;

  score = clamp(score);
  return {
    score,
    status: score >= 8.0 ? 'Excelente' : score >= 6.5 ? 'Bom' : 'Atenção',
    highlight: cpu.cores ? `${cpu.cores} Núcleos / ${cpu.threads} Threads` : `${threads} Threads`,
    detected: true
  };
}

// Ordem importa: o primeiro padrão que bater define a faixa
const GPU_TIERS = [
  [10.0, /5090|4090|5080|4080|7900 xtx/],
  [9.5, /5070 ti|4070 ti|3090|3080|7900 x|9070|6950|6900/],
  [9.0, /5070|4070|3070|7800 xt|6800/],
  [8.4, /5060|4060 ti|3060 ti|2080|7700|6750|6700|9060|arc b580|arc a770/],
  [7.8, /4060|3060|7600|6650|6600 xt|arc b570|arc a750/],
  [6.8, /2070|2060|1080|3050|6600|5700|arc a580/],
  [5.8, /1660|1070|1650|6500|5600|580|590|arc a380/],
  [4.8, /1060|1050|570|560|6400/],
  [5.0, /radeon\(tm\) graphics|radeon graphics|780m|680m|arc graphics|iris xe/],
  [3.5, /uhd|hd graphics|vega/]
];

function scoreGpu(gpu) {
  if (!gpu || gpu.detected === false) return notDetected();
  const name = (gpu.name || '').toLowerCase();
  const vramGb = gpu.vramGb || 0;

  if (gpu.isMicrosoftBasic) {
    return { score: 1.0, status: 'Sem driver', highlight: 'Driver genérico da Microsoft', detected: true };
  }

  let score = 5.0;
  const tier = GPU_TIERS.find(([, re]) => re.test(name));
  if (tier) score = tier[0];
  else if (vramGb >= 16) score = 9.0;
  else if (vramGb >= 10) score = 8.4;
  else if (vramGb >= 8) score = 7.5;

  score = clamp(score);
  return {
    score,
    status: score >= 8.0 ? 'Excelente' : score >= 6.0 ? 'Bom' : 'Básico',
    highlight: vramGb > 0 ? `${vramGb} GB VRAM` : (gpu.isDedicated ? 'Vídeo dedicado' : 'Vídeo integrado'),
    detected: true
  };
}

function scoreRam(ram) {
  if (!ram || !ram.detected || !ram.totalGb) return notDetected();
  const totalGb = ram.totalGb;

  let score;
  if (totalGb >= 64) score = 10.0;
  else if (totalGb >= 32) score = 9.5;
  else if (totalGb >= 16) score = 8.3;
  else if (totalGb >= 12) score = 7.0;
  else if (totalGb >= 8) score = 6.0;
  else score = 3.5;

  if (ram.singleChannel && totalGb >= 8) score -= 0.8;
  score = clamp(score);

  const parts = [`${totalGb} GB`];
  if (ram.type) parts.push(ram.type);
  if (ram.speedMhz) parts.push(`${ram.speedMhz} MHz`);

  return {
    score,
    status: score >= 8.0 ? 'Excelente' : score >= 6.0 ? 'Suficiente' : 'Limitado',
    highlight: parts.join(' • ') + (ram.singleChannel ? ' (canal simples)' : ''),
    detected: true
  };
}

function scoreStorage(storage) {
  if (!storage || storage.detected === false) return notDetected();
  let score;
  if (storage.isNvme) score = 9.8;
  else if (storage.isSsd) score = 8.3;
  else score = 4.5;

  if (storage.health && storage.health !== 'Saudável' && storage.health !== 'Não detectado') score = Math.min(score, 3.0);
  score = clamp(score);

  return {
    score,
    status: storage.isNvme ? 'NVMe Ultra-Rápido' : (storage.isSsd ? 'SSD Rápido' : 'HDD Tradicional'),
    highlight: storage.driveType,
    detected: true
  };
}

module.exports = { calculateSystemScores };
