// backend/src/utils/overlayLayout.js
// Posição da sobreposição de desempenho (sem depender do Electron, para testar).
// O tamanho vem da própria sobreposição, que mede o conteúdo (layout, escala e linhas escolhidas).

const POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right', 'custom'];
const MARGIN = 12;
const DEFAULT_SIZE = { width: 190, height: 108 };

// Quais linhas aparecem, a partir das configurações (FPS, CPU, RAM, GPU)
function overlayRows(s = {}) {
  return [
    s.overlayFps && 'fps',
    (s.overlayCpu || s.overlayCpuTemp) && 'cpu',
    s.overlayRam && 'ram',
    (s.overlayGpu || s.overlayGpuTemp) && 'gpu'
  ].filter(Boolean);
}

const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * @param s        configurações (overlayPosition, overlayX, overlayY)
 * @param workArea área útil da tela principal { x, y, width, height }
 * @param size     tamanho medido da sobreposição { width, height }
 */
function overlayBounds(s, workArea, size = DEFAULT_SIZE) {
  const pos = POSITIONS.includes(s.overlayPosition) ? s.overlayPosition : 'top-right';
  const width = Math.max(40, Math.round(size.width));
  const height = Math.max(20, Math.round(size.height));
  const { x: ax, y: ay, width: aw, height: ah } = workArea;
  let x, y;
  if (pos === 'custom') {
    // Posição livre: guardada em relação ao canto da área útil e mantida dentro da tela
    x = ax + clamp(Math.round(Number(s.overlayX) || 0), 0, aw - width);
    y = ay + clamp(Math.round(Number(s.overlayY) || 0), 0, ah - height);
  } else {
    x = pos.endsWith('left') ? ax + MARGIN
      : pos.endsWith('right') ? ax + aw - width - MARGIN
      : ax + Math.round((aw - width) / 2);
    y = pos.startsWith('top') ? ay + MARGIN : ay + ah - height - MARGIN;
  }
  return { x, y, width, height };
}

module.exports = { POSITIONS, overlayRows, overlayBounds };
