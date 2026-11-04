// backend/src/database/seedData.js

const DRIVER_CATALOG = [
  {
    id: 'nvidia-gpu',
    category: 'Placa de Vídeo',
    manufacturer: 'NVIDIA',
    name: 'NVIDIA GeForce Game Ready Driver',
    officialUrl: 'https://www.nvidia.com/pt-br/drivers/',
    autoDetectUrl: 'https://www.nvidia.com/pt-br/software/nvidia-app/',
    directDownload: 'https://www.nvidia.com/pt-br/drivers/',
    description: 'Driver essencial para placas GeForce RTX/GTX. Garante estabilidade, DLSS, reflex e desempenho em jogos recém-lançados.',
    matchKeywords: ['nvidia', 'geforce', 'rtx', 'gtx']
  },
  {
    id: 'amd-gpu',
    category: 'Placa de Vídeo',
    manufacturer: 'AMD',
    name: 'AMD Software: Adrenalin Edition',
    officialUrl: 'https://www.amd.com/pt/support/download/drivers.html',
    autoDetectUrl: 'https://www.amd.com/pt/support/download/drivers.html',
    directDownload: 'https://www.amd.com/pt/support/download/drivers.html',
    description: 'Driver oficial para placas Radeon RX (7000, 6000, 5000) e gráficos integrados Ryzen APU.',
    matchKeywords: ['radeon', 'rx 7', 'rx 6', 'rx 5', 'rx 4', 'vega', 'amd graphics', 'radeon rx']
  },
  {
    id: 'intel-gpu',
    category: 'Placa de Vídeo',
    manufacturer: 'Intel',
    name: 'Intel Arc & Iris Xe Graphics Driver',
    officialUrl: 'https://www.intel.com.br/content/www/br/pt/download-center/home.html',
    autoDetectUrl: 'https://www.intel.com.br/content/www/br/pt/support/detect.html',
    directDownload: 'https://www.intel.com.br/content/www/br/pt/download/785597/intel-arc-iris-xe-graphics-windows.html',
    description: 'Driver para placas dedicadas Intel Arc e gráficos integrados de processadores Core de 11ª a 14ª geração.',
    matchKeywords: ['intel arc', 'iris xe', 'uhd graphics', 'hd graphics', 'intel graphics', 'intel(r) hd', 'intel(r) uhd']
  },
  {
    id: 'amd-chipset',
    category: 'Chipset Placa-Mãe',
    manufacturer: 'AMD',
    name: 'AMD Chipset Drivers (AM4 / AM5)',
    officialUrl: 'https://www.amd.com/pt/support/download/drivers.html',
    autoDetectUrl: 'https://www.amd.com/pt/support/download/drivers.html',
    directDownload: 'https://www.amd.com/pt/support/download/drivers.html',
    description: 'Gerencia o barramento PCI Express, plano de energia AMD Ryzen Balanced e portas USB da placa-mãe.',
    matchKeywords: ['amd chipset', 'ryzen chipset', 'b450', 'b550', 'x570', 'b650', 'x670', 'a320', 'a520']
  },
  {
    id: 'intel-chipset',
    category: 'Chipset Placa-Mãe',
    manufacturer: 'Intel',
    name: 'Intel Chipset Device Software (INF Utility)',
    officialUrl: 'https://www.intel.com.br/content/www/br/pt/download/19347/chipset-inf-utility.html',
    autoDetectUrl: 'https://www.intel.com.br/content/www/br/pt/support/detect.html',
    directDownload: 'https://www.intel.com.br/content/www/br/pt/download/19347/chipset-inf-utility.html',
    description: 'Informa ao Windows os nomes corretos e rotas do barramento PCIe, SATA e controladores do processador Intel.',
    matchKeywords: ['intel chipset', 'h610', 'b660', 'b760', 'z690', 'z790', 'h510', 'b460', 'power engine', 'management engine']
  },
  {
    id: 'realtek-audio',
    category: 'Áudio',
    manufacturer: 'Realtek',
    name: 'Realtek High Definition Audio Codecs',
    officialUrl: 'https://www.realtek.com/',
    autoDetectUrl: 'https://www.realtek.com/',
    directDownload: null, // Realtek não tem link fixo por modelo: o app oferece o Windows Update / Catálogo da Microsoft
    description: 'Driver para o chip de áudio integrado na maioria das placas-mãe. Resolve chiados e falta de som.',
    matchKeywords: ['realtek audio', 'high definition audio', 'alc897', 'alc1220', 'alc887']
  },
  {
    id: 'realtek-lan',
    category: 'Rede Cabeada (LAN)',
    manufacturer: 'Realtek',
    name: 'Realtek PCIe GbE / 2.5GbE Ethernet Controller',
    officialUrl: 'https://www.realtek.com/',
    autoDetectUrl: 'https://www.realtek.com/',
    directDownload: null, // Realtek não tem link fixo por modelo: o app oferece o Windows Update / Catálogo da Microsoft
    description: 'Garante a velocidade máxima (1Gbps / 2.5Gbps) e estabilidade de ping na porta de rede Ethernet.',
    matchKeywords: ['realtek pcie', 'realtek ethernet', 'gbe family controller', '2.5gbe']
  },
  {
    id: 'intel-wifi',
    category: 'Rede Sem Fio (Wi-Fi / Bluetooth)',
    manufacturer: 'Intel',
    name: 'Intel Wireless Wi-Fi & Bluetooth Drivers',
    officialUrl: 'https://www.intel.com.br/content/www/br/pt/download/19351/windows-10-and-windows-11-wi-fi-drivers-for-intel-wireless-adapters.html',
    autoDetectUrl: 'https://www.intel.com.br/content/www/br/pt/support/detect.html',
    directDownload: 'https://www.intel.com.br/content/www/br/pt/download/19351/windows-10-and-windows-11-wi-fi-drivers-for-intel-wireless-adapters.html',
    description: 'Driver oficial para placas Wi-Fi 6, 6E e 7 (AX200, AX210, BE200) e Bluetooth.',
    matchKeywords: ['intel wi-fi', 'intel wireless', 'wi-fi 6', 'wi-fi 6e', 'wi-fi 7', 'ax200', 'ax201', 'ax210', 'ac 9560']
  }
];

const ESSENTIAL_SOFTWARES = [
  // --- RUNTIMES & WINDOWS ---
  {
    id: 'vcredist-aio',
    name: 'Visual C++ Redistributable All-in-One (2005-2022)',
    category: 'windows',
    categoryLabel: 'Windows & Runtimes',
    size: '~30 MB',
    mustHave: true,
    tags: ['c++', 'vcredist', 'dll', 'runtime', 'visual studio', 'msvcp140'],
    officialUrl: 'https://github.com/abbodi1406/vcredist/releases/latest',
    downloadUrl: 'https://github.com/abbodi1406/vcredist/releases/latest',
    description: 'Instala de uma só vez todas as bibliotecas Visual C++ x86/x64 (2005 até 2022). Evita erros de .dll ausente em jogos e instaladores.'
  },
  {
    id: 'directx-june2010',
    name: 'DirectX End-User Runtimes (June 2010)',
    category: 'windows',
    categoryLabel: 'Windows & Runtimes',
    size: '~95 MB',
    mustHave: true,
    tags: ['directx', 'dx9', 'dx10', 'dx11', 'd3dx9', 'jogos', 'games'],
    officialUrl: 'https://www.microsoft.com/en-us/download/details.aspx?id=8109',
    downloadUrl: 'https://download.microsoft.com/download/8/4/A/84A35BF1-DAFE-4AE8-82AF-AD2AE20B6B14/directx_Jun2010_redist.exe',
    description: 'Bibliotecas legadas do DirectX 9.0c, 10 e 11 indispensáveis para emuladores e jogos clássicos e modernos.'
  },
  {
    id: 'dotnet-desktop',
    name: '.NET Desktop Runtime 10 (x64)',
    category: 'windows',
    categoryLabel: 'Windows & Runtimes',
    size: '~55 MB',
    mustHave: true,
    tags: ['dotnet', '.net', 'c#', 'framework', 'runtime', 'microsoft'],
    officialUrl: 'https://dotnet.microsoft.com/download/dotnet/10.0',
    downloadUrl: 'https://dotnet.microsoft.com/download/dotnet/10.0/runtime',
    description: 'Ambiente de execução da Microsoft exigido por utilitários e softwares recentes para Windows.'
  },
  {
    id: 'powertoys',
    name: 'Microsoft PowerToys',
    category: 'windows',
    categoryLabel: 'Windows & Runtimes',
    size: '~250 MB',
    mustHave: false,
    tags: ['powertoys', 'microsoft', 'produtividade', 'janelas', 'ocr', 'atalhos'],
    officialUrl: 'https://github.com/microsoft/PowerToys',
    downloadUrl: 'https://github.com/microsoft/PowerToys/releases/latest',
    description: 'Conjunto oficial de utilitários da Microsoft para produtividade: FancyZones, PowerToys Run, redimensionador de imagens e pin de janelas.'
  },
  {
    id: 'windows-terminal',
    name: 'Windows Terminal',
    category: 'windows',
    categoryLabel: 'Windows & Runtimes',
    size: '~45 MB',
    mustHave: false,
    tags: ['terminal', 'powershell', 'cmd', 'wsl', 'bash', 'console'],
    officialUrl: 'https://github.com/microsoft/terminal',
    downloadUrl: 'https://github.com/microsoft/terminal/releases/latest',
    description: 'Terminal moderno e personalizável com suporte a abas, aceleração por GPU, PowerShell e WSL.'
  },

  // --- NAVEGADORES ---
  {
    id: 'brave-browser',
    name: 'Brave Browser',
    category: 'navegadores',
    categoryLabel: 'Navegadores',
    size: '~1.5 MB',
    mustHave: false,
    tags: ['brave', 'navegador', 'browser', 'bloqueador', 'ads', 'privacidade'],
    officialUrl: 'https://brave.com/',
    downloadUrl: 'https://laptop-updates.brave.com/latest/winx64',
    description: 'Navegador ultrarrápido com bloqueador nativo de anúncios, anti-rastreamento e foco em privacidade.'
  },
  {
    id: 'google-chrome',
    name: 'Google Chrome',
    category: 'navegadores',
    categoryLabel: 'Navegadores',
    size: '~1.3 MB',
    mustHave: false,
    mustHave: true,
    tags: ['chrome', 'google', 'browser', 'navegador', 'web'],
    officialUrl: 'https://www.google.com/chrome/',
    downloadUrl: 'https://dl.google.com/chrome/install/standalonesetup64.exe',
    description: 'O navegador mais utilizado do mundo, com sincronização completa de conta Google, extensões e estabilidade.'
  },
  {
    id: 'firefox',
    name: 'Mozilla Firefox',
    category: 'navegadores',
    categoryLabel: 'Navegadores',
    size: '~58 MB',
    mustHave: false,
    tags: ['firefox', 'mozilla', 'navegador', 'browser', 'open source', 'gecko'],
    officialUrl: 'https://www.mozilla.org/firefox/',
    downloadUrl: 'https://download.mozilla.org/?product=firefox-latest-ssl&os=win64&lang=pt-BR',
    description: 'Navegador de código aberto, independente de Chromium, com excelente proteção contra rastreamento.'
  },
  {
    id: 'opera-gx',
    name: 'Opera GX (Gaming Browser)',
    category: 'navegadores',
    categoryLabel: 'Navegadores',
    size: '~3.2 MB',
    mustHave: false,
    tags: ['opera', 'gx', 'gamer', 'jogos', 'browser', 'limitador ram', 'rgb'],
    officialUrl: 'https://www.opera.com/gx',
    downloadUrl: 'https://net.geo.opera.com/opera_gx/stable/windows',
    description: 'Navegador focado no público gamer com limitadores embutidos de CPU, RAM e uso de banda de internet.'
  },
  {
    id: 'tor-browser',
    name: 'Tor Browser',
    category: 'navegadores',
    categoryLabel: 'Navegadores',
    size: '~95 MB',
    mustHave: false,
    tags: ['tor', 'privacidade', 'onion', 'anonimato', 'darkweb', 'criptografia'],
    officialUrl: 'https://www.torproject.org/',
    downloadUrl: 'https://www.torproject.org/download/',
    description: 'Navegador projetado para anonimato máximo e navegação através da rede criptografada Tor.'
  },

  // --- GAMES & PLATAFORMAS ---
  {
    id: 'steam',
    name: 'Steam Client',
    category: 'games',
    categoryLabel: 'Games & Launchers',
    size: '~2.5 MB',
    mustHave: true,
    tags: ['steam', 'valve', 'jogos', 'games', 'loja', 'counter strike', 'dota'],
    officialUrl: 'https://store.steampowered.com/about/',
    downloadUrl: 'https://cdn.akamai.steamstatic.com/client/installer/SteamSetup.exe',
    description: 'A maior plataforma de distribuição de jogos para PC do mundo, com chat de voz, comunidade e mods.'
  },
  {
    id: 'epic-games',
    name: 'Epic Games Launcher',
    category: 'games',
    categoryLabel: 'Games & Launchers',
    size: '~160 MB',
    mustHave: false,
    tags: ['epic', 'fortnite', 'unreal', 'jogos gratis', 'launcher'],
    officialUrl: 'https://store.epicgames.com/',
    downloadUrl: 'https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/installer/download/EpicGamesLauncherInstaller.msi',
    description: 'Launcher da Epic Games, famosa pela distribuição de jogos gratuitos semanais e casa do Fortnite e Unreal Engine.'
  },
  {
    id: 'gog-galaxy',
    name: 'GOG Galaxy 2.0',
    category: 'games',
    categoryLabel: 'Games & Launchers',
    size: '~240 MB',
    mustHave: false,
    tags: ['gog', 'cd projekt', 'drm-free', 'witcher', 'cyberpunk', 'integrador'],
    officialUrl: 'https://www.gog.com/galaxy',
    downloadUrl: 'https://www.gog.com/galaxy',
    description: 'Plataforma para jogos livres de DRM que permite unificar bibliotecas de outras plataformas (Steam, Epic, Xbox).'
  },
  {
    id: 'ea-app',
    name: 'EA App (Eletronic Arts)',
    category: 'games',
    categoryLabel: 'Games & Launchers',
    size: '~15 MB',
    mustHave: false,
    tags: ['ea', 'origin', 'fifa', 'ea fc', 'battlefield', 'the sims', 'apex'],
    officialUrl: 'https://www.ea.com/ea-app',
    downloadUrl: 'https://origin-a.akamaihd.net/EA-Desktop-Client-Download/installer-releases/EAappInstaller.exe',
    description: 'Novo launcher oficial da Electronic Arts para jogos como EA FC (FIFA), Battlefield, Apex Legends e The Sims.'
  },
  {
    id: 'battle-net',
    name: 'Battle.net (Blizzard)',
    category: 'games',
    categoryLabel: 'Games & Launchers',
    size: '~5 MB',
    mustHave: false,
    tags: ['blizzard', 'battlenet', 'warzone', 'call of duty', 'world of warcraft', 'diablo', 'overwatch'],
    officialUrl: 'https://www.blizzard.com/apps/battle.net/desktop',
    downloadUrl: 'https://www.battle.net/download/getInstallerForGame?os=win&gameProgram=BATTLENET_APP&version=Live',
    description: 'Launcher oficial da Blizzard e Activision para Call of Duty Warzone, World of Warcraft, Diablo IV e Overwatch.'
  },
  {
    id: 'riot-client',
    name: 'Riot Games Client',
    category: 'games',
    categoryLabel: 'Games & Launchers',
    size: '~60 MB',
    mustHave: false,
    tags: ['riot', 'league of legends', 'lol', 'valorant', 'tft', 'vanguard'],
    officialUrl: 'https://www.riotgames.com/',
    downloadUrl: 'https://playvalorant.com/pt-br/download/',
    description: 'Gerenciador e inicializador dos títulos da Riot Games: League of Legends, VALORANT e Teamfight Tactics.'
  },
  {
    id: 'ubisoft-connect',
    name: 'Ubisoft Connect',
    category: 'games',
    categoryLabel: 'Games & Launchers',
    size: '~220 MB',
    mustHave: false,
    tags: ['ubisoft', 'uplay', 'assassins creed', 'rainbow six', 'far cry'],
    officialUrl: 'https://ubisoftconnect.com/',
    downloadUrl: 'https://ubisoftconnect.com/',
    description: 'Plataforma oficial da Ubisoft para gerenciamento de jogos como Rainbow Six Siege, Assassin\'s Creed e Far Cry.'
  },

  // --- UTILITÁRIOS & DESCOMPACTADORES ---
  {
    id: '7zip',
    name: '7-Zip (64-bit)',
    category: 'utilitarios',
    categoryLabel: 'Utilitários & Sistema',
    size: '~1.5 MB',
    mustHave: true,
    tags: ['7zip', 'zip', 'rar', 'descompactador', 'compactador', 'arquivo', '7z'],
    officialUrl: 'https://www.7-zip.org/',
    downloadUrl: 'https://www.7-zip.org/download.html',
    description: 'O descompactador mais leve, seguro e sem propagandas do mundo. Suporta 7z, RAR, ZIP, TAR, GZ e ISO.'
  },
  {
    id: 'winrar',
    name: 'WinRAR (64-bit)',
    category: 'utilitarios',
    categoryLabel: 'Utilitários & Sistema',
    size: '~3.5 MB',
    mustHave: false,
    tags: ['winrar', 'rar', 'zip', 'descompactador', 'rarlab'],
    officialUrl: 'https://www.win-rar.com/',
    downloadUrl: 'https://www.win-rar.com/download.html',
    description: 'Famoso compactador e descompactador de arquivos com alta taxa de compressão e recuperação de arquivos corrompidos.'
  },
  {
    id: 'rufus',
    name: 'Rufus (Criador de Pendrive Bootável)',
    category: 'utilitarios',
    categoryLabel: 'Utilitários & Sistema',
    size: '~1.4 MB',
    tags: ['rufus', 'pendrive', 'boot', 'iso', 'formatar', 'windows', 'linux', 'uefi'],
    officialUrl: 'https://rufus.ie/',
    downloadUrl: 'https://rufus.ie/',
    description: 'Ferramenta indispensável para criar pendrives inicializáveis do Windows 10/11 ou Linux sem limitações de TPM/Secure Boot.'
  },
  {
    id: 'revo-uninstaller',
    name: 'Revo Uninstaller Free',
    category: 'utilitarios',
    categoryLabel: 'Utilitários & Sistema',
    size: '~18 MB',
    mustHave: false,
    tags: ['revo', 'desinstalador', 'remover', 'limpeza', 'registro', 'sobras'],
    officialUrl: 'https://www.revouninstaller.com/',
    downloadUrl: 'https://www.revouninstaller.com/download-free-portable.php',
    description: 'Desinstala programas por completo, varrendo e apagando sobras de arquivos e chaves órfãs no Registro do Windows.'
  },
  {
    id: 'everything-search',
    name: 'Everything (Voidtools)',
    category: 'utilitarios',
    categoryLabel: 'Utilitários & Sistema',
    size: '~2.0 MB',
    tags: ['everything', 'busca', 'pesquisa', 'arquivos', 'rapido', 'localizar'],
    officialUrl: 'https://www.voidtools.com/',
    downloadUrl: 'https://www.voidtools.com/downloads/',
    description: 'Motor de busca local instantâneo que localiza qualquer arquivo no seu computador em milissegundos.'
  },
  {
    id: 'bleachbit',
    name: 'BleachBit',
    category: 'utilitarios',
    categoryLabel: 'Utilitários & Sistema',
    size: '~12 MB',
    mustHave: false,
    tags: ['bleachbit', 'limpeza', 'privacidade', 'cache', 'temporarios', 'open source'],
    officialUrl: 'https://www.bleachbit.org/',
    downloadUrl: 'https://www.bleachbit.org/download/windows',
    description: 'Limpador de sistema de código aberto que apaga rastros de navegação, caches ocultos e libera gigabytes de espaço em disco.'
  },

  // --- HARDWARE & DIAGNÓSTICO ---
  {
    id: 'msi-afterburner',
    name: 'MSI Afterburner + RivaTuner (RTSS)',
    category: 'hardware',
    categoryLabel: 'Hardware & Diagnóstico',
    size: '~55 MB',
    tags: ['msi', 'afterburner', 'fps', 'temperatura', 'overclock', 'rivatuner', 'rtss', 'gpu'],
    officialUrl: 'https://www.msi.com/Landing/afterburner/graphics-cards',
    downloadUrl: 'https://www.msi.com/Landing/afterburner/graphics-cards',
    description: 'O utilitário definitivo para monitorar FPS, temperatura e uso de CPU/GPU na tela durante jogos, além de controle de ventoinhas.'
  },
  {
    id: 'cpu-z',
    name: 'CPU-Z (CPUID)',
    category: 'hardware',
    categoryLabel: 'Hardware & Diagnóstico',
    size: '~3.5 MB',
    tags: ['cpuz', 'cpu-z', 'processador', 'memoria', 'clock', 'placa-mae', 'ram'],
    officialUrl: 'https://www.cpuid.com/softwares/cpu-z.html',
    downloadUrl: 'https://www.cpuid.com/softwares/cpu-z.html',
    description: 'Informa com máxima precisão o modelo exato da CPU, frequência em tempo real, timings de memória RAM e modelo da placa-mãe.'
  },
  {
    id: 'gpu-z',
    name: 'GPU-Z (TechPowerUp)',
    category: 'hardware',
    categoryLabel: 'Hardware & Diagnóstico',
    size: '~10 MB',
    tags: ['gpuz', 'gpu-z', 'placa de video', 'vram', 'temperatura', 'nvidia', 'amd'],
    officialUrl: 'https://www.techpowerup.com/gpuz/',
    downloadUrl: 'https://www.techpowerup.com/download/techpowerup-gpu-z/',
    description: 'Utilitário leve para identificar todos os detalhes da sua placa de vídeo: VRAM, clock de GPU, versão do BIOS e sensores térmicos.'
  },
  {
    id: 'hwmonitor',
    name: 'HWMonitor (CPUID)',
    category: 'hardware',
    categoryLabel: 'Hardware & Diagnóstico',
    size: '~2.8 MB',
    mustHave: false,
    tags: ['hwmonitor', 'temperaturas', 'voltagens', 'fans', 'sensores', 'consumo'],
    officialUrl: 'https://www.cpuid.com/softwares/hwmonitor.html',
    downloadUrl: 'https://www.cpuid.com/softwares/hwmonitor.html',
    description: 'Monitora em tempo real as voltagens da fonte, rotação das ventoinhas e temperaturas de todos os núcleos de CPU e GPU.'
  },
  {
    id: 'crystaldiskinfo',
    name: 'CrystalDiskInfo (Saúde do SSD/HD)',
    category: 'hardware',
    categoryLabel: 'Hardware & Diagnóstico',
    size: '~6.0 MB',
    tags: ['crystaldisk', 'ssd', 'nvme', 'hd', 'saude', 'smart', 'temperatura disco'],
    officialUrl: 'https://crystalmark.info/en/software/crystaldiskinfo/',
    downloadUrl: 'https://crystalmark.info/en/software/crystaldiskinfo/',
    description: 'Monitor de saúde S.M.A.R.T. para SSDs e HDDs. Alerta sobre setores defeituosos, temperatura e porcentagem de vida útil restante.'
  },
  {
    id: 'furmark',
    name: 'FurMark 2 (GPU Stress Test)',
    category: 'hardware',
    categoryLabel: 'Hardware & Diagnóstico',
    size: '~18 MB',
    mustHave: false,
    tags: ['furmark', 'benchmark', 'stress test', 'estabilidade', 'gpu', 'aquecimento'],
    officialUrl: 'https://geeks3d.com/furmark/',
    downloadUrl: 'https://geeks3d.com/furmark/',
    description: 'Teste de estresse térmico para verificar a estabilidade da placa de vídeo e diagnosticar possíveis desligamentos sob carga máxima.'
  },

  // --- COMUNICAÇÃO & CHAT ---
  {
    id: 'discord',
    name: 'Discord',
    category: 'comunicacao',
    categoryLabel: 'Comunicação',
    size: '~85 MB',
    mustHave: true,
    tags: ['discord', 'chat', 'voz', 'call', 'jogos', 'comunidade', 'streaming'],
    officialUrl: 'https://discord.com/',
    downloadUrl: 'https://discord.com/api/download?platform=win',
    description: 'O aplicativo de voz, vídeo e chat de texto mais utilizado por gamers e equipes no mundo.'
  },
  {
    id: 'telegram',
    name: 'Telegram Desktop',
    category: 'comunicacao',
    categoryLabel: 'Comunicação',
    size: '~45 MB',
    mustHave: false,
    tags: ['telegram', 'mensagens', 'chat', 'canais', 'arquivos', 'desktop'],
    officialUrl: 'https://desktop.telegram.org/',
    downloadUrl: 'https://telegram.org/dl/desktop/win64',
    description: 'Mensageiro ultrarrápido na nuvem com suporte a envio de arquivos grandes de até 2 GB e canais de notícias.'
  },
  {
    id: 'whatsapp-desktop',
    name: 'WhatsApp para Windows',
    category: 'comunicacao',
    categoryLabel: 'Comunicação',
    size: '~150 MB',
    mustHave: false,
    tags: ['whatsapp', 'zap', 'mensagens', 'chamadas', 'meta'],
    officialUrl: 'https://www.whatsapp.com/download',
    downloadUrl: 'https://www.whatsapp.com/download',
    description: 'Aplicativo nativo para Windows do mensageiro mais popular do Brasil, com chamadas de voz e vídeo.'
  },
  {
    id: 'teamspeak',
    name: 'TeamSpeak 3 Client',
    category: 'comunicacao',
    categoryLabel: 'Comunicação',
    size: '~90 MB',
    mustHave: false,
    tags: ['teamspeak', 'ts3', 'voz', 'baixa latencia', 'jogos antigos', 'rpg'],
    officialUrl: 'https://www.teamspeak.com/',
    downloadUrl: 'https://www.teamspeak.com/en/downloads/',
    description: 'Cliente de comunicação por voz de latência ultrabaixa com controle de permissões avançado por servidores privados.'
  },

  // --- MÍDIA, STREAMING & GRAVAÇÃO ---
  {
    id: 'vlc-player',
    name: 'VLC Media Player',
    category: 'midia',
    categoryLabel: 'Mídia & Áudio/Vídeo',
    size: '~42 MB',
    mustHave: true,
    tags: ['vlc', 'video', 'musica', 'player', 'mp4', 'mkv', 'avi', 'codecs'],
    officialUrl: 'https://www.videolan.org/vlc/',
    downloadUrl: 'https://get.videolan.org/vlc/last/win64/vlc-win64.exe',
    description: 'O reprodutor multimídia definitivo: roda qualquer formato de vídeo (MKV, MP4, AVI) sem precisar de codecs adicionais.'
  },
  {
    id: 'obs-studio',
    name: 'OBS Studio',
    category: 'midia',
    categoryLabel: 'Mídia & Áudio/Vídeo',
    size: '~130 MB',
    mustHave: false,
    tags: ['obs', 'gravar', 'stream', 'twitch', 'youtube', 'live', 'captura de tela'],
    officialUrl: 'https://obsproject.com/',
    downloadUrl: 'https://obsproject.com/download',
    description: 'Software profissional e gratuito para gravação de tela e transmissões ao vivo (Twitch, YouTube, Kick).'
  },
  {
    id: 'spotify',
    name: 'Spotify Desktop',
    category: 'midia',
    categoryLabel: 'Mídia & Áudio/Vídeo',
    size: '~85 MB',
    mustHave: false,
    tags: ['spotify', 'musica', 'podcast', 'streaming', 'audio', 'playlists'],
    officialUrl: 'https://www.spotify.com/',
    downloadUrl: 'https://download.scdn.co/SpotifySetup.exe',
    description: 'O maior serviço de streaming de músicas e podcasts do mundo com suporte a atalhos de mídia no teclado.'
  },
  {
    id: 'k-lite-codec-pack',
    name: 'K-Lite Mega Codec Pack',
    category: 'midia',
    categoryLabel: 'Mídia & Áudio/Vídeo',
    size: '~60 MB',
    mustHave: false,
    tags: ['klite', 'codecs', 'media player classic', 'mpc', 'audio', 'video'],
    officialUrl: 'https://codecguide.com/download_k-lite_codec_pack_mega.htm',
    downloadUrl: 'https://codecguide.com/download_k-lite_codec_pack_mega.htm',
    description: 'Coleção completa de filtros DirectShow e codecs VFW/ACM para reprodução e edição de qualquer arquivo de áudio e vídeo.'
  },
  {
    id: 'handbrake',
    name: 'HandBrake (Conversor de Vídeo)',
    category: 'midia',
    categoryLabel: 'Mídia & Áudio/Vídeo',
    size: '~22 MB',
    mustHave: false,
    tags: ['handbrake', 'conversor', 'video', 'comprimir', 'mp4', 'mkv', 'h264', 'hevc', 'av1'],
    officialUrl: 'https://handbrake.fr/',
    downloadUrl: 'https://handbrake.fr/downloads.php',
    description: 'Conversor de vídeo gratuito de código aberto com aceleração NVENC/AMF para compactar arquivos pesados sem perder qualidade.'
  },

  // --- DESENVOLVIMENTO & PRODUTIVIDADE ---
  {
    id: 'hwinfo',
    name: 'HWiNFO (Sensores e Monitoramento)',
    category: 'hardware',
    categoryLabel: 'Hardware & Diagnóstico',
    size: '~10 MB',
    mustHave: true,
    tags: ['hwinfo', 'sensores', 'temperatura', 'monitor', 'hardware', 'fps'],
    officialUrl: 'https://www.hwinfo.com/',
    downloadUrl: 'https://www.hwinfo.com/download/',
    description: 'Mostra todos os sensores do PC (temperaturas, clocks, tensões) e integra com o RivaTuner para exibir dados durante o jogo.'
  },
  {
    id: 'sharex',
    name: 'ShareX (Capturas de Tela e Gravação)',
    category: 'midia',
    categoryLabel: 'Mídia & Áudio/Vídeo',
    size: '~8 MB',
    mustHave: true,
    tags: ['sharex', 'print', 'captura', 'screenshot', 'gravar tela', 'gif'],
    officialUrl: 'https://getsharex.com/',
    downloadUrl: 'https://getsharex.com/downloads',
    description: 'Captura de tela, gravação em vídeo/GIF e upload, gratuito e de código aberto.'
  },
  {
    id: 'vscode',
    name: 'Visual Studio Code',
    category: 'dev',
    categoryLabel: 'Desenvolvimento & Código',
    size: '~95 MB',
    mustHave: false,
    tags: ['vscode', 'editor', 'codigo', 'programacao', 'javascript', 'python', 'microsoft'],
    officialUrl: 'https://code.visualstudio.com/',
    downloadUrl: 'https://code.visualstudio.com/sha/download?build=stable&os=win32-x64-user',
    description: 'O editor de código-fonte mais popular do mundo, leve, rápido e com milhares de extensões disponíveis.'
  },
  {
    id: 'git-windows',
    name: 'Git for Windows',
    category: 'dev',
    categoryLabel: 'Desenvolvimento & Código',
    size: '~62 MB',
    mustHave: false,
    tags: ['git', 'github', 'versionamento', 'bash', 'terminal', 'dev'],
    officialUrl: 'https://gitforwindows.org/',
    downloadUrl: 'https://github.com/git-for-windows/git/releases/latest',
    description: 'Sistema de controle de versão distribuído essencial para programadores, incluindo Git Bash e Git GUI.'
  },
  {
    id: 'notepad-plus-plus',
    name: 'Notepad++',
    category: 'dev',
    categoryLabel: 'Desenvolvimento & Código',
    size: '~4.5 MB',
    tags: ['notepad', 'notepad++', 'editor', 'texto', 'notas', 'rapido', 'substituir'],
    officialUrl: 'https://notepad-plus-plus.org/',
    downloadUrl: 'https://notepad-plus-plus.org/downloads/',
    description: 'Editor de texto e notas ultraleve que substitui com folga o Bloco de Notas padrão, com suporte a realce de sintaxe.'
  },
  {
    id: 'dbeaver',
    name: 'DBeaver Community',
    category: 'dev',
    categoryLabel: 'Desenvolvimento & Código',
    size: '~115 MB',
    mustHave: false,
    tags: ['dbeaver', 'sql', 'banco de dados', 'postgres', 'mysql', 'sqlite', 'database'],
    officialUrl: 'https://dbeaver.io/',
    downloadUrl: 'https://dbeaver.io/files/dbeaver-ce-latest-x86_64-setup.exe',
    description: 'Gerenciador universal de banco de dados com suporte nativo a SQLite, PostgreSQL, MySQL, SQL Server e Oracle.'
  },

  // --- SEGURANÇA, DOWNLOADS & REDE ---
  {
    id: 'qbittorrent',
    name: 'qBittorrent (64-bit)',
    category: 'utilitarios',
    categoryLabel: 'Utilitários',
    size: '~35 MB',
    tags: ['torrent', 'qbittorrent', 'download', 'p2p', 'sem anuncios', 'magnet'],
    officialUrl: 'https://www.qbittorrent.org/',
    downloadUrl: 'https://www.qbittorrent.org/download',
    description: 'O melhor cliente de torrent da atualidade: código aberto, sem anúncios, sem mineradores ocultos e extremamente veloz.'
  },
  {
    id: 'malwarebytes',
    name: 'Malwarebytes Free',
    category: 'seguranca',
    categoryLabel: 'Segurança & Rede',
    size: '~3.5 MB',
    mustHave: false,
    tags: ['antivirus', 'malware', 'malwarebytes', 'virus', 'adware', 'limpeza'],
    officialUrl: 'https://www.malwarebytes.com/',
    downloadUrl: 'https://www.malwarebytes.com/mwb-download/thankyou',
    description: 'Excelente ferramenta de remoção de malwares persistentes, spywares, adwares e malwares que o Windows Defender não removeu.'
  },
  {
    id: 'cloudflare-warp',
    name: 'Cloudflare WARP (1.1.1.1)',
    category: 'seguranca',
    categoryLabel: 'Segurança & Rede',
    size: '~65 MB',
    mustHave: false,
    tags: ['dns', 'cloudflare', '1.1.1.1', 'warp', 'vpn', 'velocidade', 'ping'],
    officialUrl: 'https://one.one.one.one/',
    downloadUrl: 'https://1111-releases.cloudflareclient.com/windows/Cloudflare_WARP_Release-x64.msi',
    description: 'Otimizador de DNS seguro da Cloudflare que reduz a latência da internet e criptografa a saída de dados da sua rede.'
  },
  {
    id: 'bitwarden',
    name: 'Bitwarden Password Manager',
    category: 'seguranca',
    categoryLabel: 'Segurança & Rede',
    size: '~90 MB',
    mustHave: false,
    tags: ['senhas', 'bitwarden', 'cofre', 'seguranca', 'login', 'criptografia'],
    officialUrl: 'https://bitwarden.com/',
    downloadUrl: 'https://vault.bitwarden.com/download/?app=desktop&platform=windows',
    description: 'Cofre de senhas de código aberto com criptografia de ponta a ponta para guardar suas contas e logins com segurança total.'
  }
];

const BSOD_ENCYCLOPEDIA = [
  {
    code: '0x0000009F',
    name: 'DRIVER_POWER_STATE_FAILURE',
    cause: 'Um driver de dispositivo não respondeu à transição de energia (suspensão, hibernação ou reinicialização).',
    recommendation: 'Atualize os drivers de Chipset, Wi-Fi e Placa de Vídeo. Verifique nas opções de energia do Windows se a inicialização rápida está desativada.',
    severity: 'Alta'
  },
  {
    code: '0x000000D1',
    name: 'DRIVER_IRQL_NOT_LESS_OR_EQUAL',
    cause: 'Um driver tentou acessar um endereço de memória inválido em um nível de interrupção (IRQL) inapropriado.',
    recommendation: 'Geralmente causado por drivers de rede, som ou antivírus de terceiros corrompidos. Reinstale os drivers limpos.',
    severity: 'Alta'
  },
  {
    code: '0x00000124',
    name: 'WHEA_UNCORRECTABLE_ERROR',
    cause: 'Erro de hardware físico irrecuperável detectado pela arquitetura de erros do Windows (WHEA).',
    recommendation: 'Indica superaquecimento, overclock instável na CPU/RAM ou voltagem incorreta da fonte de alimentação. Monitore temperaturas.',
    severity: 'Crítica'
  },
  {
    code: '0x0000003B',
    name: 'SYSTEM_SERVICE_EXCEPTION',
    cause: 'Uma rotina do sistema em modo kernel gerou uma exceção que o manipulador de erros não conseguiu tratar.',
    recommendation: 'Normalmente decorrente de arquivos corrompidos do Windows ou drivers gráficos incompatíveis. Execute sfc /scannow no prompt.',
    severity: 'Média'
  },
  {
    code: '0x0000000A',
    name: 'IRQL_NOT_LESS_OR_EQUAL',
    cause: 'Processo em modo kernel tentou acessar a memória sem a devida autorização.',
    recommendation: 'Pode ser módulo de memória RAM com defeito ou driver desatualizado. Execute o Diagnóstico de Memória do Windows.',
    severity: 'Alta'
  },
  {
    code: '0x0000007E',
    name: 'SYSTEM_THREAD_EXCEPTION_NOT_HANDLED',
    cause: 'Uma thread gerou uma exceção de software não capturada.',
    recommendation: 'Verifique se há espaço suficiente no disco C: e atualize a BIOS da placa-mãe.',
    severity: 'Média'
  },
  {
    code: '41',
    name: 'Kernel-Power (Event ID 41)',
    cause: 'O sistema foi reiniciado sem desligar completamente primeiro.',
    recommendation: 'Pode ter sido causado por interrupção de energia na tomada, botão liga/desliga pressionado ou fonte com oscilação de tensão.',
    severity: 'Alerta'
  }
];

module.exports = {
  DRIVER_CATALOG,
  ESSENTIAL_SOFTWARES,
  BSOD_ENCYCLOPEDIA
};
