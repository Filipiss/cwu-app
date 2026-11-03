// backend/src/database/wingetCatalog.js
// Mapeia o id do catálogo de softwares → pacote(s) do winget.
// Valide com `npm run check-winget` (roda `winget show` para cada id).
// null = sem pacote confiável no winget (fica só o download oficial).
module.exports = {
  'vcredist-aio': ['Microsoft.VCRedist.2015+.x64', 'Microsoft.VCRedist.2015+.x86'],
  'directx-june2010': ['Microsoft.DirectX'],
  'dotnet-desktop': ['Microsoft.DotNet.DesktopRuntime.10'],
  'hwinfo': ['REALiX.HWiNFO'],
  'sharex': ['ShareX.ShareX'],
  'powertoys': ['Microsoft.PowerToys'],
  'windows-terminal': ['Microsoft.WindowsTerminal'],
  'brave-browser': ['Brave.Brave'],
  'google-chrome': ['Google.Chrome'],
  'firefox': ['Mozilla.Firefox'],
  'steam': ['Valve.Steam'],
  'epic-games': ['EpicGames.EpicGamesLauncher'],
  '7zip': ['7zip.7zip'],
  'rufus': ['Rufus.Rufus'],
  'revo-uninstaller': ['RevoUninstaller.RevoUninstaller'],
  'everything-search': ['voidtools.Everything'],
  'msi-afterburner': ['Guru3D.Afterburner', 'Guru3D.RTSS'],
  'furmark': ['Geeks3D.FurMark.2'],
  'discord': ['Discord.Discord'],
  'telegram': ['Telegram.TelegramDesktop'],
  'whatsapp-desktop': [{ id: '9NKSQGP7F2NH', source: 'msstore' }],
  'vlc-player': ['VideoLAN.VLC'],
  'obs-studio': ['OBSProject.OBSStudio'],
  'spotify': ['Spotify.Spotify'],
  'handbrake': ['HandBrake.HandBrake'],
  'vscode': ['Microsoft.VisualStudioCode'],
  'git-windows': ['Git.Git'],
  'notepad-plus-plus': ['Notepad++.Notepad++'],
  'qbittorrent': ['qBittorrent.qBittorrent'],
  'malwarebytes': ['Malwarebytes.Malwarebytes'],
  'cloudflare-warp': ['Cloudflare.Warp'],
  'bitwarden': ['Bitwarden.Bitwarden']
};
