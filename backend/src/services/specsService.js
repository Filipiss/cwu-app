// backend/src/services/specsService.js
const { runPowerShell } = require('../utils/powershell');
const { calculateSystemScores } = require('../utils/scoreCalculator');
const os = require('os');

const GB = 1024 * 1024 * 1024;
const NOT_DETECTED = 'Não detectado';

const asArray = (v) => (Array.isArray(v) ? v : (v ? [v] : []));

// Tipos de memória SMBIOS (Win32_PhysicalMemory.SMBIOSMemoryType)
const SMBIOS_MEMORY_TYPES = { 20: 'DDR', 21: 'DDR2', 24: 'DDR3', 26: 'DDR4', 34: 'DDR5', 35: 'LPDDR5' };

// Coleta tudo em uma única chamada ao PowerShell (cada chamada custa ~0,5 s)
const SPECS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$gpuRegistry = @(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' |
  Where-Object { $_.DriverDesc } |
  Select-Object DriverDesc, @{n='VramBytes';e={ $_.'HardwareInformation.qwMemorySize' }})
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
[PSCustomObject]@{
  cpu = (Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed -First 1)
  gpus = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, DriverDate, AdapterRAM, CurrentHorizontalResolution, CurrentVerticalResolution, CurrentRefreshRate)
  gpuRegistry = $gpuRegistry
  os = (Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture, TotalVisibleMemorySize, FreePhysicalMemory, LastBootUpTime)
  board = (Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product)
  bios = (Get-CimInstance Win32_BIOS | Select-Object SMBIOSBIOSVersion, ReleaseDate)
  memory = @(Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity, ConfiguredClockSpeed, Speed, SMBIOSMemoryType, Manufacturer)
  disks = @(Get-PhysicalDisk | Select-Object FriendlyName, @{n='MediaType';e={[string]$_.MediaType}}, @{n='BusType';e={[string]$_.BusType}}, Size, @{n='HealthStatus';e={[string]$_.HealthStatus}})
  diskFallback = @(Get-CimInstance Win32_DiskDrive | Select-Object Model, InterfaceType, MediaType, Size)
  isAdmin = $isAdmin
} | ConvertTo-Json -Depth 4 -Compress
`;

class SpecsService {
  async getSystemSpecs() {
    let raw = null;
    let readError = null;

    if (process.platform === 'win32') {
      const res = await runPowerShell(SPECS_SCRIPT, 20000);
      if (res.success && res.data) raw = res.data;
      else readError = res.error || 'Falha ao ler dados do WMI';
    } else {
      readError = 'Leitura completa de hardware disponível apenas no Windows';
    }

    const specs = {
      cpu: this.parseCpu(raw),
      gpu: null,
      gpus: this.parseGpus(raw),
      ram: this.parseRam(raw),
      storage: null,
      disks: this.parseDisks(raw),
      motherboard: this.parseBoard(raw),
      os: this.parseOs(raw),
      isAdmin: Boolean(raw && raw.isAdmin)
    };

    // GPU principal: prefere a dedicada (NVIDIA/AMD/Intel Arc) quando houver mais de uma
    specs.gpu = specs.gpus.find(g => g.isDedicated) || specs.gpus[0] || {
      name: NOT_DETECTED, driverVersion: NOT_DETECTED, vramGb: 0, isDedicated: false, detected: false
    };

    // Disco principal: o maior SSD, senão o primeiro disco
    const ssds = specs.disks.filter(d => d.isSsd).sort((a, b) => b.sizeGb - a.sizeGb);
    specs.storage = ssds[0] || specs.disks[0] || {
      model: NOT_DETECTED, sizeGb: 0, isSsd: false, isNvme: false, driveType: NOT_DETECTED, health: NOT_DETECTED, detected: false
    };

    const scores = calculateSystemScores(specs);

    return {
      specs,
      scores,
      readError,
      collectedAt: new Date().toISOString()
    };
  }

  parseCpu(raw) {
    const c = raw && asArray(raw.cpu)[0];
    if (c && c.Name) {
      return {
        name: c.Name.trim(),
        cores: c.NumberOfCores || null,
        threads: c.NumberOfLogicalProcessors || null,
        clockGhz: c.MaxClockSpeed ? (c.MaxClockSpeed / 1000).toFixed(2) : null,
        detected: true
      };
    }
    // Node consegue ler o modelo e o número de threads em qualquer SO (dado real)
    const cpus = os.cpus();
    return {
      name: (cpus[0] && cpus[0].model) ? cpus[0].model.trim() : NOT_DETECTED,
      cores: null,
      threads: cpus.length || null,
      clockGhz: (cpus[0] && cpus[0].speed) ? (cpus[0].speed / 1000).toFixed(2) : null,
      detected: cpus.length > 0
    };
  }

  parseGpus(raw) {
    if (!raw) return [];
    const registry = asArray(raw.gpuRegistry);
    return asArray(raw.gpus).filter(g => g && g.Name).map(g => {
      const name = g.Name.trim();
      // AdapterRAM do WMI é limitado a 4 GB (uint32); o registro guarda o valor real (qwMemorySize)
      const reg = registry.find(r => (r.DriverDesc || '').trim() === name);
      let vramBytes = Number(reg && reg.VramBytes) || 0;
      if (!vramBytes) vramBytes = Number(g.AdapterRAM) || 0;
      const isMicrosoftBasic = /microsoft basic|adaptador de vídeo básico|standard vga/i.test(name);
      return {
        name,
        driverVersion: g.DriverVersion || NOT_DETECTED,
        driverDate: this.parseWmiDate(g.DriverDate),
        vramGb: vramBytes ? Math.round(vramBytes / GB) : 0,
        resolution: g.CurrentHorizontalResolution ? `${g.CurrentHorizontalResolution}x${g.CurrentVerticalResolution}` : null,
        refreshRate: g.CurrentRefreshRate || null,
        isDedicated: /(nvidia|geforce|radeon rx|rtx|gtx|arc a|arc b|radeon pro)/i.test(name),
        isMicrosoftBasic,
        detected: true
      };
    });
  }

  parseRam(raw) {
    const osRaw = raw && raw.os;
    const modules = raw ? asArray(raw.memory).filter(m => m && m.Capacity) : [];
    const totalBytes = osRaw && osRaw.TotalVisibleMemorySize ? osRaw.TotalVisibleMemorySize * 1024 : os.totalmem();
    const freeBytes = osRaw && osRaw.FreePhysicalMemory ? osRaw.FreePhysicalMemory * 1024 : os.freemem();
    const installedBytes = modules.reduce((sum, m) => sum + Number(m.Capacity || 0), 0);
    const first = modules[0] || {};
    return {
      totalGb: Math.round((installedBytes || totalBytes) / GB),
      usableGb: parseFloat((totalBytes / GB).toFixed(1)),
      freeGb: parseFloat((freeBytes / GB).toFixed(1)),
      speedMhz: first.ConfiguredClockSpeed || first.Speed || null,
      type: SMBIOS_MEMORY_TYPES[first.SMBIOSMemoryType] || null,
      slotsUsed: modules.length || null,
      // Um único pente roda em canal simples (single channel), o que reduz desempenho
      singleChannel: modules.length === 1,
      detected: true
    };
  }

  parseDisks(raw) {
    if (!raw) return [];
    const physical = asArray(raw.disks).filter(d => d && d.Size);
    if (physical.length > 0) {
      return physical.map(d => {
        const isNvme = /nvme/i.test(d.BusType || '') || /nvme/i.test(d.FriendlyName || '');
        const isSsd = isNvme || /ssd/i.test(d.MediaType || '') || /ssd/i.test(d.FriendlyName || '');
        const isHdd = /hdd/i.test(d.MediaType || '');
        return {
          model: (d.FriendlyName || 'Disco').trim(),
          sizeGb: Math.round(Number(d.Size) / GB),
          isSsd,
          isNvme,
          busType: d.BusType || null,
          driveType: isNvme ? 'NVMe SSD' : (isSsd ? 'SATA SSD' : (isHdd ? 'Disco Rígido (HDD)' : 'Tipo não identificado')),
          health: this.translateHealth(d.HealthStatus),
          detected: true
        };
      });
    }
    // Fallback: Win32_DiskDrive (não informa saúde nem tipo de mídia com precisão)
    return asArray(raw.diskFallback).filter(d => d && d.Size).map(d => {
      const isNvme = /nvme/i.test(d.Model || '');
      const isSsd = isNvme || /ssd|solid state/i.test(`${d.Model} ${d.MediaType}`);
      return {
        model: (d.Model || 'Disco').trim(),
        sizeGb: Math.round(Number(d.Size) / GB),
        isSsd,
        isNvme,
        busType: d.InterfaceType || null,
        driveType: isNvme ? 'NVMe SSD' : (isSsd ? 'SATA SSD' : 'Tipo não identificado'),
        health: NOT_DETECTED,
        detected: true
      };
    });
  }

  parseBoard(raw) {
    const b = raw && raw.board;
    const bios = raw && raw.bios;
    return {
      manufacturer: (b && b.Manufacturer ? b.Manufacturer.trim() : NOT_DETECTED),
      model: (b && b.Product ? b.Product.trim() : ''),
      biosVersion: bios && bios.SMBIOSBIOSVersion ? String(bios.SMBIOSBIOSVersion).trim() : null,
      biosDate: bios ? this.parseWmiDate(bios.ReleaseDate) : null,
      detected: Boolean(b && b.Manufacturer)
    };
  }

  parseOs(raw) {
    const o = raw && raw.os;
    if (o) {
      return {
        caption: (o.Caption || 'Microsoft Windows').trim(),
        version: o.Version || '',
        build: o.BuildNumber || null,
        architecture: o.OSArchitecture || '',
        lastBoot: this.parseWmiDate(o.LastBootUpTime),
        detected: true
      };
    }
    return {
      caption: `${os.type()} ${os.release()}`,
      version: os.release(),
      build: null,
      architecture: os.arch(),
      lastBoot: null,
      detected: false
    };
  }

  translateHealth(status) {
    const map = { Healthy: 'Saudável', Warning: 'Atenção', Unhealthy: 'Com falhas' };
    return map[status] || (status ? String(status) : NOT_DETECTED);
  }

  // ConvertTo-Json serializa datas como "/Date(1700000000000)/"
  parseWmiDate(value) {
    if (!value) return null;
    if (typeof value === 'string') {
      const m = value.match(/\/Date\((-?\d+)/);
      if (m) return new Date(Number(m[1])).toISOString();
    }
    if (typeof value === 'object') return this.parseWmiDate(value.value || value.DateTime);
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
}

module.exports = new SpecsService();
