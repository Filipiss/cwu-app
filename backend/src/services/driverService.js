// backend/src/services/driverService.js
const { runPowerShell } = require('../utils/powershell');
const db = require('../database/db');
const driverUpdates = require('./driverUpdates');

// Idade (em anos) a partir da qual sugerimos procurar um driver mais novo.
// Vídeo muda rápido; chipset/sistema raramente precisam de atualização.
const OUTDATED_YEARS = {
  'Placa de Vídeo': 1,
  'Rede / Wi-Fi': 3,
  'Áudio & Som': 4,
  'Controlador de Armazenamento': 4,
  'Dispositivo de Sistema': 5,
  'Dispositivo Não Reconhecido': 99
};

// Códigos do Gerenciador de Dispositivos (ConfigManagerErrorCode) mais comuns
const DEVICE_ERROR_CODES = {
  1: 'Dispositivo não configurado corretamente',
  3: 'Driver corrompido ou sem memória',
  10: 'Dispositivo não pode ser iniciado',
  12: 'Recursos insuficientes (conflito)',
  18: 'Reinstale o driver',
  19: 'Registro do driver corrompido',
  22: 'Dispositivo desativado',
  24: 'Dispositivo ausente ou desconectado',
  28: 'Driver não instalado',
  31: 'Windows não conseguiu carregar o driver',
  39: 'Driver ausente ou corrompido',
  43: 'Windows parou o dispositivo após falha',
  45: 'Dispositivo não está conectado',
  52: 'Assinatura digital do driver inválida'
};

function parseWmiDate(value) {
  if (!value) return null;
  if (typeof value === 'object') return parseWmiDate(value.value || value.DateTime);
  const m = String(value).match(/\/Date\((-?\d+)/);
  const d = m ? new Date(Number(m[1])) : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

class DriverService {
  async scanDrivers() {
    const catalog = db.getDriverCatalog();
    // Consultas online em paralelo com a leitura local (Windows Update é a mais lenta)
    const online = process.platform === 'win32'
      ? Promise.all([driverUpdates.windowsUpdateDrivers(), driverUpdates.nvidiaLatest()])
      : Promise.resolve([{ ok: false, updates: [] }, { ok: false }]);
    let detectedDrivers = [];
    let systemContext = {
      cpuName: '',
      hasNoIgpu: false,
      hasIntelGpu: false,
      hasNvidiaGpu: false,
      hasAmdGpu: false,
      isIntelPlatform: true,
      isAmdPlatform: false
    };

    if (process.platform === 'win32') {
      try {
        const psCommand = `
          [PSCustomObject]@{
            cpu = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -Property Name -First 1).Name
            gpus = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Select-Object -Property Name, DriverVersion, Status)
            board = (Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue | Select-Object -Property Manufacturer, Product)
            problemDevices = @(Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue | Where-Object { $_.ConfigManagerErrorCode -ne 0 -and $_.Name -ne $null } | Select-Object -Property Name, Manufacturer, DeviceID, ConfigManagerErrorCode -First 10)
            displayDrivers = @(Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object { $_.DeviceClass -eq 'DISPLAY' -and $_.DeviceName -ne $null } | Select-Object -Property DeviceName, Manufacturer, DriverVersion, DriverDate, DeviceClass, DeviceID)
            netDrivers = @(Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object { $_.DeviceClass -eq 'NET' -and $_.DeviceName -ne $null } | Select-Object -Property DeviceName, Manufacturer, DriverVersion, DriverDate, DeviceClass, DeviceID -First 6)
            mediaDrivers = @(Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object { $_.DeviceClass -eq 'MEDIA' -and $_.DeviceName -ne $null } | Select-Object -Property DeviceName, Manufacturer, DriverVersion, DriverDate, DeviceClass, DeviceID -First 6)
            scsiDrivers = @(Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object { $_.DeviceClass -eq 'SCSIADAPTER' -and $_.DeviceName -ne $null } | Select-Object -Property DeviceName, Manufacturer, DriverVersion, DriverDate, DeviceClass, DeviceID -First 4)
            systemDrivers = @(Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object { $_.DeviceClass -eq 'SYSTEM' -and $_.DeviceName -ne $null -and ($_.DeviceName -like '*Chipset*' -or $_.DeviceName -like '*Motherboard*' -or $_.DeviceName -like '*Power Engine*' -or $_.DeviceName -like '*Management Engine*' -or $_.DeviceName -like '*Thermal*') } | Select-Object -Property DeviceName, Manufacturer, DriverVersion, DriverDate, DeviceClass, DeviceID -First 8)
          } | ConvertTo-Json -Depth 4 -Compress
        `;

        const res = await runPowerShell(psCommand, 18000);
        if (res.success && res.data) {
          const raw = res.data;
          const cpuName = raw.cpu || '';
          const gpusList = Array.isArray(raw.gpus) ? raw.gpus : (raw.gpus ? [raw.gpus] : []);
          const boardName = ((raw.board && raw.board.Product) || '') + ' ' + ((raw.board && raw.board.Manufacturer) || '');

          // Analisa CPU e iGPU: processadores Intel linha F/KF e AMD sem gráficos integrados
          const isIntelFSeries = /\b(i[3579]-\d{4,5}k?f)\b/i.test(cpuName);
          const hasIntelVideoController = gpusList.some(g => /(intel|arc|iris|uhd|hd graphics)/i.test(g.Name || ''));
          const hasNvidiaVideoController = gpusList.some(g => /(nvidia|geforce|rtx|gtx)/i.test(g.Name || ''));
          const hasAmdVideoController = gpusList.some(g => /(radeon|rx|amd)/i.test(g.Name || ''));

          systemContext = {
            cpuName,
            hasNoIgpu: isIntelFSeries || (!hasIntelVideoController && (hasNvidiaVideoController || hasAmdVideoController)),
            hasIntelGpu: hasIntelVideoController,
            hasNvidiaGpu: hasNvidiaVideoController,
            hasAmdGpu: hasAmdVideoController,
            isIntelPlatform: /intel/i.test(cpuName) || /h610|b660|b760|z690|z790|h510|b460/i.test(boardName),
            isAmdPlatform: /amd|ryzen/i.test(cpuName) || /b450|b550|x570|b650|x670|a320|a520/i.test(boardName)
          };

          const rawList = [];

          // 1. Dispositivos com erro ou driver ausente no Gerenciador de Dispositivos (prioridade)
          const problemDevices = Array.isArray(raw.problemDevices) ? raw.problemDevices : (raw.problemDevices ? [raw.problemDevices] : []);
          problemDevices.forEach(p => {
            rawList.push({
              DeviceName: p.Name || 'Dispositivo Desconhecido',
              Manufacturer: p.Manufacturer || 'Desconhecido',
              DriverVersion: 'Não instalado',
              DeviceClass: 'UNKNOWN',
              isProblem: true,
              errorCode: p.ConfigManagerErrorCode,
              DeviceID: p.DeviceID
            });
          });

          // 2. Controladores de Vídeo (DISPLAY)
          const displayDrivers = Array.isArray(raw.displayDrivers) ? raw.displayDrivers : (raw.displayDrivers ? [raw.displayDrivers] : []);
          if (displayDrivers.length === 0 && gpusList.length > 0) {
            gpusList.forEach(g => {
              rawList.push({
                DeviceName: g.Name,
                Manufacturer: hasNvidiaVideoController ? 'NVIDIA' : (hasAmdVideoController ? 'AMD' : 'Intel'),
                DriverVersion: g.DriverVersion || '1.0.0.0',
                DeviceClass: 'DISPLAY'
              });
            });
          } else {
            rawList.push(...displayDrivers);
          }

          // 3. Rede (NET)
          const netDrivers = Array.isArray(raw.netDrivers) ? raw.netDrivers : (raw.netDrivers ? [raw.netDrivers] : []);
          rawList.push(...netDrivers);

          // 4. Áudio & Som (MEDIA)
          const mediaDrivers = Array.isArray(raw.mediaDrivers) ? raw.mediaDrivers : (raw.mediaDrivers ? [raw.mediaDrivers] : []);
          rawList.push(...mediaDrivers);

          // 5. Armazenamento (SCSIADAPTER)
          const scsiDrivers = Array.isArray(raw.scsiDrivers) ? raw.scsiDrivers : (raw.scsiDrivers ? [raw.scsiDrivers] : []);
          rawList.push(...scsiDrivers);

          // 6. Placa-Mãe / Chipset (SYSTEM)
          const systemDrivers = Array.isArray(raw.systemDrivers) ? raw.systemDrivers : (raw.systemDrivers ? [raw.systemDrivers] : []);
          rawList.push(...systemDrivers);

          detectedDrivers = rawList.map(item => this.mapPnpDriver(item, catalog, systemContext));
        }
      } catch (err) {
        console.warn('[DriverService] Erro ao ler PnP Signed Drivers:', err.message);
      }
    }

    // Sem leitura real não inventamos resultados: a interface mostra o aviso
    const scanAvailable = process.platform === 'win32' && detectedDrivers.length > 0;

    let updateCheck = { windowsUpdate: false, nvidia: false };
    if (detectedDrivers.length) {
      const [wu, nvidia] = await online;
      detectedDrivers = driverUpdates.applyUpdateInfo(detectedDrivers, { wu, nvidia });
      updateCheck = { windowsUpdate: wu.ok, nvidia: nvidia.ok, nvidiaLatest: nvidia.version || null };
    }

    const outdated = detectedDrivers.filter(d => d.status === 'outdated' || d.status === 'generic');
    const updated = detectedDrivers.filter(d => d.status === 'updated');

    const result = {
      timestamp: new Date().toISOString(),
      totalScanned: detectedDrivers.length,
      outdatedCount: outdated.length,
      updatedCount: updated.length,
      items: detectedDrivers,
      scanAvailable,
      message: scanAvailable ? null : 'Não foi possível ler os drivers deste computador (a varredura exige Windows).',
      systemContext,
      updateCheck
    };

    if (scanAvailable) db.addScanRecord({
      total: detectedDrivers.length,
      outdated: outdated.length,
      updated: updated.length
    });

    return result;
  }

  mapPnpDriver(raw, catalog, systemContext = {}) {
    const name = (raw.DeviceName || 'Dispositivo de Hardware').trim();
    const lowerName = name.toLowerCase();
    const manufacturer = (raw.Manufacturer || 'Fabricante Padrão').trim();
    const version = raw.DriverVersion || 'Desconhecida';
    const driverDate = parseWmiDate(raw.DriverDate);
    const ageYears = driverDate ? (Date.now() - driverDate.getTime()) / (365.25 * 24 * 3600 * 1000) : null;

    // Determina categoria legível
    let category = 'Dispositivo de Sistema';
    if (raw.DeviceClass === 'DISPLAY') category = 'Placa de Vídeo';
    else if (raw.DeviceClass === 'NET') category = 'Rede / Wi-Fi';
    else if (raw.DeviceClass === 'MEDIA') category = 'Áudio & Som';
    else if (raw.DeviceClass === 'SCSIADAPTER') category = 'Controlador de Armazenamento';
    else if (raw.DeviceClass === 'UNKNOWN' || raw.isProblem) category = 'Dispositivo Não Reconhecido';

    // Verifica se é driver genérico básico da Microsoft para vídeo ou problema real
    const isGenericDisplay = category === 'Placa de Vídeo' && (
      lowerName.includes('basic display') ||
      lowerName.includes('adaptador de vídeo básico') ||
      lowerName.includes('standard vga') ||
      manufacturer.toLowerCase().includes('microsoft')
    );

    const isProblemDevice = Boolean(raw.isProblem);

    // Tenta encontrar correspondente no catálogo oficial com VALIDAÇÃO ESTRITA DE CATEGORIA E HARDWARE
    const matchedCatalog = catalog.find(cat => {
      // 1. Filtro estrito de categoria
      if (category === 'Placa de Vídeo' && cat.category !== 'Placa de Vídeo') return false;
      if (category === 'Rede / Wi-Fi' && !cat.category.includes('Rede')) return false;
      if (category === 'Áudio & Som' && !cat.category.includes('Áudio')) return false;
      if (category === 'Dispositivo de Sistema' && !cat.category.includes('Chipset')) return false;
      if (category === 'Controlador de Armazenamento' && cat.category === 'Placa de Vídeo') return false;

      // 2. Proteção de Hardware: NUNCA associar Intel GPU se o processador for final F ou não tiver GPU Intel
      if (cat.id === 'intel-gpu' && (systemContext.hasNoIgpu || !systemContext.hasIntelGpu)) {
        return false;
      }
      if (cat.id === 'amd-gpu' && !systemContext.hasAmdGpu) {
        return false;
      }
      if (cat.id === 'amd-chipset' && !systemContext.isAmdPlatform) {
        return false;
      }
      if (cat.id === 'intel-chipset' && !systemContext.isIntelPlatform) {
        return false;
      }

      // 3. Correspondência por palavras-chave
      return cat.matchKeywords.some(kw => lowerName.includes(kw.toLowerCase()));
    });

    let status = 'updated';
    let statusText = 'Atualizado';
    let statusBadge = 'success';

    if (isProblemDevice) {
      status = 'generic';
      statusText = 'Driver Ausente / Erro no Windows';
      statusBadge = 'danger';
    } else if (isGenericDisplay) {
      status = 'generic';
      statusText = 'Driver Genérico da Microsoft (Instale o Oficial)';
      statusBadge = 'danger';
    } else if (ageYears !== null && ageYears > OUTDATED_YEARS[category] && !/microsoft/i.test(manufacturer)) {
      // Critério objetivo: data do driver instalado mais antiga que o limite da categoria
      status = 'outdated';
      statusText = `Driver de ${driverDate.getFullYear()} (há ${Math.floor(ageYears)} anos) — verifique atualização`;
      statusBadge = 'warning';
    } else {
      status = 'updated';
      statusText = matchedCatalog && category === 'Placa de Vídeo' ? 'Driver oficial instalado' : 'Operando normalmente';
      statusBadge = 'success';
    }

    if (isProblemDevice && raw.errorCode) {
      statusText += ` — ${DEVICE_ERROR_CODES[raw.errorCode] || 'Código de erro ' + raw.errorCode}`;
    }

    const explanation = this.generateExplanation(name, category, manufacturer, matchedCatalog);

    return {
      id: Buffer.from(name + category).toString('base64').substring(0, 16),
      name,
      category,
      manufacturer,
      currentVersion: version,
      driverDate: driverDate ? driverDate.toISOString() : null,
      hardwareId: raw.DeviceID || null,
      status,
      statusText,
      statusBadge,
      officialUrl: matchedCatalog ? matchedCatalog.officialUrl : `https://www.google.com/search?q=${encodeURIComponent(name + ' official driver download')}`,
      directDownload: (matchedCatalog && matchedCatalog.directDownload) ? matchedCatalog.directDownload : `https://www.catalog.update.microsoft.com/Search.aspx?q=${encodeURIComponent(name)}`,
      autoDetectUrl: matchedCatalog ? matchedCatalog.autoDetectUrl : null,
      description: explanation.role,
      details: {
        role: explanation.role,
        importance: explanation.importance,
        impact: explanation.impact
      }
    };
  }

  generateExplanation(name, category, manufacturer, matchedCatalog) {
    const lower = name.toLowerCase();

    if (matchedCatalog && matchedCatalog.description) {
      return {
        role: matchedCatalog.description,
        importance: 'Crítico para o desempenho do computador.',
        impact: 'Se desatualizado, pode causar lentidão, falhas em jogos e ausência de recursos avançados.'
      };
    }

    // Ventoinhas e refrigeração
    if (lower.includes('acpi fan') || lower.includes('cooler') || lower.includes('fan')) {
      return {
        role: 'Controla a velocidade e operação das ventoinhas conectadas à placa-mãe via protocolo ACPI do Windows.',
        importance: 'Essencial para a refrigeração do PC.',
        impact: 'Permite que o Windows aumente a rotação (RPM) automaticamente quando a CPU ou GPU esquentam durante jogos.'
      };
    }

    // Sensores de temperatura
    if (lower.includes('acpi thermal') || lower.includes('thermal zone')) {
      return {
        role: 'Módulo de leitura dos sensores térmicos integrados na placa-mãe e no processador.',
        importance: 'Segurança e prevenção de superaquecimento.',
        impact: 'Evita que os componentes queimem por excesso de calor, acionando o limite térmico (Thermal Throttling) quando necessário.'
      };
    }

    // Recursos da placa-mãe
    if (lower.includes('motherboard') || lower.includes('chipset') || lower.includes('system management bios')) {
      return {
        role: 'Reserva endereços de memória física, interrupções (IRQ) e canais de comunicação direta entre a BIOS e o barramento PCI Express.',
        importance: 'Fundamental para estabilidade do sistema.',
        impact: 'Garante que os discos, portas USB e placa de vídeo se comuniquem com a CPU na taxa máxima de transferência.'
      };
    }

    // Áudio virtual ou aprimoramento
    if (lower.includes('audio') || lower.includes('sound') || lower.includes('fxsound') || lower.includes('surround')) {
      return {
        role: 'Processador de som e equalização. Converte o sinal digital do jogo em som analógico para fones de ouvido e caixas de som.',
        importance: 'Experiência sonora e comunicação.',
        impact: 'Sem este driver, o som pode apresentar chiados, estalos, baixo volume ou ausência de microfone.'
      };
    }

    // Periféricos e barramentos de controle
    if (lower.includes('logitech') || lower.includes('nefarius') || lower.includes('gamepad') || lower.includes('bus')) {
      return {
        role: 'Barramento virtual que integra periféricos gamer (teclado, mouse com DPI ajustável e controles estilo Xbox/PlayStation).',
        importance: 'Essencial para resposta de comandos em jogos.',
        impact: 'Garante reconhecimento imediato e suporte a botões extras e iluminação RGB sem atraso (input lag).'
      };
    }

    // Controladores de armazenamento
    if (category === 'Controlador de Armazenamento' || lower.includes('scsi') || lower.includes('nvme') || lower.includes('sata')) {
      return {
        role: 'Controlador de comunicação de dados do SSD/HD com a memória RAM e o processador.',
        importance: 'Velocidade de leitura e carregamento.',
        impact: 'Impacta diretamente no tempo de boot do Windows e na velocidade de telas de carregamento (loading) de jogos pesados.'
      };
    }

    // Rede e Adaptadores virtuais
    if (category === 'Rede / Wi-Fi' || lower.includes('ethernet') || lower.includes('network') || lower.includes('hyper-v')) {
      return {
        role: 'Gerencia o tráfego de pacotes de dados da internet e conexões virtuais do computador.',
        importance: 'Estabilidade de ping e download.',
        impact: 'Drivers desatualizados podem causar perda de pacotes, oscilação de latência em partidas online e desconexões.'
      };
    }

    // Padrão amigável
    return {
      role: `Componente integrado de hardware (${category}) registrado no barramento do Windows por ${manufacturer}.`,
      importance: 'Importante para a integridade dos periféricos.',
      impact: 'Trabalha em segundo plano para que o Windows reconheça corretamente todos os recursos de hardware instalados.'
    };
  }

  async getOutdatedDrivers() {
    const catalog = db.getDriverCatalog();
    let specsData = null;
    try {
      const specsService = require('./specsService');
      specsData = await specsService.getSystemSpecs();
    } catch (e) {
      specsData = null;
    }

    const specs = (specsData && specsData.specs) ? specsData.specs : specsData;

    if (!specs || !specs.cpu) {
      return catalog;
    }

    const cpuName = specs.cpu.name || '';
    const gpuName = (specs.gpu && specs.gpu.name) || '';
    const boardModel = (specs.motherboard && (specs.motherboard.model + ' ' + specs.motherboard.manufacturer)) || '';

    const isIntelFSeries = /\b(i[3579]-\d{4,5}k?f)\b/i.test(cpuName);
    const hasIntelGpu = /(intel|arc|iris|uhd|hd graphics)/i.test(gpuName);
    const hasNvidiaGpu = /(nvidia|geforce|rtx|gtx)/i.test(gpuName);
    const hasAmdGpu = /(radeon|rx|amd)/i.test(gpuName);
    const isIntelPlatform = /intel/i.test(cpuName) || /h610|b660|b760|z690|z790|h510|b460/i.test(boardModel);
    const isAmdPlatform = /amd|ryzen/i.test(cpuName) || /b450|b550|x570|b650|x670|a320|a520/i.test(boardModel);

    const relevantCatalog = catalog.filter(cat => {
      // 1. Filtrar GPU por hardware real
      if (cat.id === 'intel-gpu') {
        // Se a CPU é linha F (sem iGPU) ou se não tem placa gráfica Intel física, esconde
        if (isIntelFSeries || !hasIntelGpu) return false;
      }
      if (cat.id === 'amd-gpu' && !hasAmdGpu) return false;
      if (cat.id === 'nvidia-gpu' && !hasNvidiaGpu) return false;

      // 2. Filtrar Chipset por plataforma real da placa-mãe / processador
      if (cat.id === 'amd-chipset' && !isAmdPlatform) return false;
      if (cat.id === 'intel-chipset' && !isIntelPlatform) return false;

      return true;
    });

    return relevantCatalog.map(cat => ({
      id: cat.id,
      name: cat.name,
      category: cat.category,
      manufacturer: cat.manufacturer,
      officialUrl: cat.officialUrl,
      directDownload: cat.directDownload,
      autoDetectUrl: cat.autoDetectUrl,
      description: cat.description
    }));
  }
}

module.exports = new DriverService();
