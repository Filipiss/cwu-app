// backend/src/utils/scoreCalculator.js

/**
 * Calcula nota de 1.0 a 10.0 para cada componente e nota geral do sistema
 */
function calculateSystemScores({ cpu, gpu, ram, storage }) {
  const cpuScore = scoreCpu(cpu);
  const gpuScore = scoreGpu(gpu);
  const ramScore = scoreRam(ram);
  const storageScore = scoreStorage(storage);

  // Média ponderada voltada a uso geral e jogos
  const overall = (
    cpuScore.score * 0.30 +
    gpuScore.score * 0.35 +
    ramScore.score * 0.20 +
    storageScore.score * 0.15
  );

  return {
    overall: parseFloat(overall.toFixed(1)),
    ratingTier: getTierDescription(overall),
    components: {
      cpu: cpuScore,
      gpu: gpuScore,
      ram: ramScore,
      storage: storageScore
    }
  };
}

function getTierDescription(score) {
  if (score >= 9.0) return { label: 'Entusiasta / Top-Tier', color: '#10b981', summary: 'Excelente para jogos pesados em 4K e renderização profissional.' };
  if (score >= 8.0) return { label: 'Alta Performance', color: '#06b6d4', summary: 'Roda qualquer jogo atual em alta qualidade e multitarefa pesada.' };
  if (score >= 6.5) return { label: 'Intermediário Sólido', color: '#3b82f6', summary: 'Ótimo para jogos competitivos em 1080p e produtividade diária.' };
  if (score >= 5.0) return { label: 'Básico / Entrada', color: '#f59e0b', summary: 'Adequado para tarefas de escritório, estudos e jogos leves.' };
  return { label: 'Modesto / Requer Upgrade', color: '#ef4444', summary: 'Recomendado upgrade de hardware para melhor fluidez no Windows moderno.' };
}

function scoreCpu(cpu) {
  let score = 5.0;
  const name = (cpu?.name || '').toLowerCase();
  const cores = cpu?.cores || 2;
  const threads = cpu?.threads || 4;

  if (cores >= 16) score = 9.8;
  else if (cores >= 12) score = 9.4;
  else if (cores >= 8) score = 8.8;
  else if (cores >= 6) score = 8.0;
  else if (cores >= 4) score = threads >= 8 ? 7.4 : 6.0;
  else score = 4.5;

  // Ajuste por geração moderna
  if (name.includes('i9') || name.includes('ryzen 9')) score = Math.max(score, 9.5);
  if (name.includes('i7') || name.includes('ryzen 7')) score = Math.max(score, 8.8);
  if (name.includes('i5') || name.includes('ryzen 5')) score = Math.max(score, 7.8);
  if (name.includes('13th') || name.includes('14th') || name.includes('12th') || name.includes('7000') || name.includes('8000') || name.includes('9000')) {
    score += 0.3;
  }

  score = Math.min(10.0, Math.max(1.0, score));

  return {
    score: parseFloat(score.toFixed(1)),
    status: score >= 8.0 ? 'Excelente' : score >= 6.5 ? 'Bom' : 'Atenção',
    highlight: `${cores} Núcleos / ${threads} Threads`
  };
}

function scoreGpu(gpu) {
  let score = 5.0;
  const name = (gpu?.name || '').toLowerCase();
  const vramGb = gpu?.vramGb || 0;

  if (name.includes('4090') || name.includes('4080') || name.includes('7900 xtx')) score = 10.0;
  else if (name.includes('4070') || name.includes('3080') || name.includes('7900 xt') || name.includes('6950 xt')) score = 9.5;
  else if (name.includes('3070') || name.includes('4060 ti') || name.includes('6800') || name.includes('7800 xt')) score = 8.9;
  else if (name.includes('3060') || name.includes('4060') || name.includes('6700') || name.includes('7600')) score = 8.0;
  else if (name.includes('2060') || name.includes('3050') || name.includes('6600') || name.includes('1660')) score = 6.8;
  else if (name.includes('1050') || name.includes('rx 580') || name.includes('rx 570')) score = 5.5;
  else if (name.includes('intel') && (name.includes('uhd') || name.includes('hd graphics'))) score = 4.0;
  else if (name.includes('radeon graphics') || name.includes('vega')) score = 5.2;

  if (vramGb >= 16) score = Math.max(score, 9.2);
  else if (vramGb >= 10) score = Math.max(score, 8.5);

  score = Math.min(10.0, Math.max(1.0, score));

  return {
    score: parseFloat(score.toFixed(1)),
    status: score >= 8.0 ? 'Excelente' : score >= 6.0 ? 'Bom' : 'Básico',
    highlight: vramGb > 0 ? `${vramGb} GB VRAM` : (gpu?.name ? 'Vídeo Dedicado/Integrado' : 'Genérico')
  };
}

function scoreRam(ram) {
  let score = 5.0;
  const totalGb = ram?.totalGb || 8;

  if (totalGb >= 64) score = 10.0;
  else if (totalGb >= 32) score = 9.6;
  else if (totalGb >= 16) score = 8.5;
  else if (totalGb >= 8) score = 6.2;
  else score = 4.0;

  score = Math.min(10.0, Math.max(1.0, score));

  return {
    score: parseFloat(score.toFixed(1)),
    status: score >= 8.0 ? 'Excelente' : score >= 6.0 ? 'Suficiente' : 'Limitado',
    highlight: `${totalGb} GB Total`
  };
}

function scoreStorage(storage) {
  let score = 7.0;
  const isSsd = storage?.isSsd !== false;
  const isNvme = storage?.isNvme === true;

  if (isNvme) score = 9.8;
  else if (isSsd) score = 8.5;
  else score = 4.5; // HDD

  score = Math.min(10.0, Math.max(1.0, score));

  return {
    score: parseFloat(score.toFixed(1)),
    status: isNvme ? 'NVMe Ultra-Rápido' : (isSsd ? 'SSD Rápido' : 'HDD Tradicional'),
    highlight: storage?.driveType || (isNvme ? 'NVMe SSD' : 'SSD')
  };
}

module.exports = { calculateSystemScores };
