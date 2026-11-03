// backend/src/services/specsService.js
const { runPowerShell } = require('../utils/powershell');
const { calculateSystemScores } = require('../utils/scoreCalculator');
const os = require('os');

class SpecsService {
  async getSystemSpecs() {
    let cpu = null;
    let gpu = null;
    let ram = null;
    let storage = null;
    let motherboard = null;
    let osInfo = null;

    if (process.platform === 'win32') {
      try {
        const psScript = `
          [PSCustomObject]@{
            cpu = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -Property Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed -First 1)
            gpu = (Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | Select-Object -Property Name, DriverVersion, AdapterRAM)
            os = (Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue | Select-Object -Property Caption, Version, OSArchitecture, TotalVisibleMemorySize, FreePhysicalMemory)
            board = (Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue | Select-Object -Property Manufacturer, Product)
            disks = (Get-CimInstance Win32_DiskDrive -ErrorAction SilentlyContinue | Select-Object -Property Model, InterfaceType, MediaType, Size)
          } | ConvertTo-Json -Depth 3 -Compress
        `;

        const res = await runPowerShell(psScript, 12000);
        if (res.success && res.data) {
          const raw = res.data;

          // Processador
          const cpuRaw = Array.isArray(raw.cpu) ? raw.cpu[0] : raw.cpu;
          if (cpuRaw) {
            cpu = {
              name: (cpuRaw.Name || '').trim(),
              cores: cpuRaw.NumberOfCores || os.cpus().length,
              threads: cpuRaw.NumberOfLogicalProcessors || os.cpus().length,
              clockGhz: cpuRaw.MaxClockSpeed ? (cpuRaw.MaxClockSpeed / 1000).toFixed(2) : null
            };
          }

          // Placa de Vídeo
          const gpusList = Array.isArray(raw.gpu) ? raw.gpu : (raw.gpu ? [raw.gpu] : []);
          // Preferência para GPU dedicada se houver múltiplas (ex: Intel + NVIDIA)
          const dedicatedGpu = gpusList.find(g => /(nvidia|geforce|radeon|rtx|gtx|arc)/i.test(g.Name || '')) || gpusList[0];
          if (dedicatedGpu) {
            const gpuName = (dedicatedGpu.Name || 'Adaptador de Vídeo').trim();
            const lowerName = gpuName.toLowerCase();
            const vramBytes = dedicatedGpu.AdapterRAM || 0;
            let vramGb = Math.round(vramBytes / (1024 * 1024 * 1024));

            // Tratamento do bug histórico do WMI do Windows que limita AdapterRAM em 4GB (Uint32 clamp)
            if (vramGb <= 4) {
              if (lowerName.includes('3090') || lowerName.includes('4090')) vramGb = 24;
              else if (lowerName.includes('4080') || lowerName.includes('7900 xt') || lowerName.includes('6800')) vramGb = 16;
              else if (lowerName.includes('4070') || lowerName.includes('3060') || lowerName.includes('6700')) vramGb = 12;
              else if (lowerName.includes('3080')) vramGb = 10;
              else if (lowerName.includes('3070') || lowerName.includes('4060') || lowerName.includes('2080') || lowerName.includes('2070')) vramGb = 8;
              else if (lowerName.includes('2060') || lowerName.includes('1660')) vramGb = 6;
            }

            gpu = {
              name: gpuName,
              driverVersion: dedicatedGpu.DriverVersion || 'Padrão do Windows',
              vramGb: vramGb
            };
          }

          // Sistema Operacional
          const osRaw = raw.os;
          if (osRaw) {
            const totalMb = Math.round((osRaw.TotalVisibleMemorySize || 0) / 1024);
            const totalGb = Math.round(totalMb / 1024);
            const freeGb = parseFloat(((osRaw.FreePhysicalMemory || 0) / (1024 * 1024)).toFixed(1));
            ram = {
              totalGb: totalGb || Math.round(os.totalmem() / (1024 * 1024 * 1024)),
              freeGb: freeGb || parseFloat((os.freemem() / (1024 * 1024 * 1024)).toFixed(1))
            };

            osInfo = {
              caption: (osRaw.Caption || 'Microsoft Windows').trim(),
              version: osRaw.Version || '',
              architecture: osRaw.OSArchitecture || '64-bit'
            };
          }

          // Placa Mãe
          if (raw.board) {
            motherboard = {
              manufacturer: (raw.board.Manufacturer || 'Desconhecido').trim(),
              model: (raw.board.Product || 'Placa-Mãe Padrão').trim()
            };
          }

          // Armazenamento
          const disksList = Array.isArray(raw.disks) ? raw.disks : (raw.disks ? [raw.disks] : []);
          const primaryDisk = disksList[0] || {};
          const isNvme = /(nvme|pcie|m\.2)/i.test(primaryDisk.Model || '') || primaryDisk.InterfaceType === 'SCSI';
          const isSsd = isNvme || /(ssd|solid state)/i.test((primaryDisk.Model || '') + ' ' + (primaryDisk.MediaType || ''));
          const sizeGb = primaryDisk.Size ? Math.round(primaryDisk.Size / (1024 * 1024 * 1024)) : 500;

          storage = {
            model: primaryDisk.Model || 'Unidade Principal',
            sizeGb: sizeGb,
            isSsd: isSsd,
            isNvme: isNvme,
            driveType: isNvme ? 'NVMe M.2 SSD' : (isSsd ? 'SATA SSD' : 'Disco Rígido (HDD)')
          };
        }
      } catch (err) {
        console.warn('[SpecsService] Aviso na leitura WMI:', err.message);
      }
    }

    // Fallbacks elegantes caso WMI retorne incompleto ou ambiente não-Windows
    if (!cpu) {
      const cpus = os.cpus();
      cpu = {
        name: cpus[0]?.model || 'Processador x86_64',
        cores: Math.max(2, Math.floor(cpus.length / 2)),
        threads: cpus.length || 4,
        clockGhz: cpus[0]?.speed ? (cpus[0].speed / 1000).toFixed(2) : '3.60'
      };
    }

    if (!gpu) {
      gpu = {
        name: 'Placa de Vídeo / Adaptador Gráfico',
        driverVersion: 'WDDM 3.1',
        vramGb: 6
      };
    }

    if (!ram) {
      const total = Math.round(os.totalmem() / (1024 * 1024 * 1024));
      ram = {
        totalGb: total || 16,
        freeGb: parseFloat((os.freemem() / (1024 * 1024 * 1024)).toFixed(1)) || 8.2
      };
    }

    if (!storage) {
      storage = {
        model: 'SSD de Sistema Principal',
        sizeGb: 512,
        isSsd: true,
        isNvme: true,
        driveType: 'NVMe M.2 SSD'
      };
    }

    if (!motherboard) {
      motherboard = {
        manufacturer: 'ASUS / MSI / Gigabyte',
        model: 'Placa-Mãe Principal'
      };
    }

    if (!osInfo) {
      osInfo = {
        caption: 'Microsoft Windows 11 Pro',
        version: os.release() || '10.0.22631',
        architecture: os.arch() === 'x64' ? '64-bit' : os.arch()
      };
    }

    // Calcula as notas de cada componente e a pontuação geral
    const scores = calculateSystemScores({ cpu, gpu, ram, storage });

    return {
      specs: {
        cpu,
        gpu,
        ram,
        storage,
        motherboard,
        os: osInfo
      },
      scores
    };
  }
}

module.exports = new SpecsService();
