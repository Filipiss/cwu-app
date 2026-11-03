// backend/src/services/elevationService.js
// Verifica se o app roda como administrador e o reabre com elevação (UAC).
// O relançamento é feito por um PowerShell elevado que espera 2 s antes de abrir
// a nova instância, dando tempo para a atual fechar (libera a porta 4321 e o
// bloqueio de instância única do Electron).
// Caminhos sempre no formato do Windows (também nos testes, que rodam em qualquer SO)
const path = require('path').win32;
const { runPowerShell } = require('../utils/powershell');

const IS_ADMIN = `([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)`;

let cachedIsAdmin = null;

// Decide qual executável reabrir, conforme o modo em que o app está rodando (pura, testável)
function buildRelaunchTarget({ isElectron, execPath, argv, cwd, portableExe, serverPath }) {
  if (isElectron) {
    // Portátil do electron-builder: o .exe original fica em PORTABLE_EXECUTABLE_FILE
    if (portableExe) return { exe: portableExe, args: [], cwd: path.dirname(portableExe) };
    return { exe: execPath, args: argv.slice(1), cwd };
  }
  // Modo "npm start": reabre o servidor Node numa nova janela de console
  return { exe: execPath, args: [path.basename(serverPath)], cwd: path.dirname(serverPath) };
}

// Script interno (roda já elevado): espera a instância atual fechar e abre a nova
function buildInnerScript(target) {
  const payload = Buffer.from(JSON.stringify(target), 'utf8').toString('base64');
  return [
    `$t = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json`,
    'Start-Sleep -Seconds 2',
    // O Start-Process do PowerShell 5 não põe aspas em argumentos com espaço: fazemos isso aqui
    'if ($t.args -and $t.args.Count -gt 0) { $a = ($t.args | ForEach-Object { [char]34 + $_ + [char]34 }) -join [char]32; Start-Process -FilePath $t.exe -ArgumentList $a -WorkingDirectory $t.cwd } ' +
    'else { Start-Process -FilePath $t.exe -WorkingDirectory $t.cwd }'
  ].join('\n');
}

class ElevationService {
  async status() {
    if (process.platform !== 'win32') return { isAdmin: false, supported: false };
    if (cachedIsAdmin === null) {
      const res = await runPowerShell(`[PSCustomObject]@{ isAdmin = ${IS_ADMIN} } | ConvertTo-Json -Compress`, 10000);
      cachedIsAdmin = Boolean(res.success && res.data && res.data.isAdmin);
    }
    return { isAdmin: cachedIsAdmin, supported: true, mode: process.versions.electron ? 'app' : 'server' };
  }

  async relaunchAsAdmin() {
    if (process.platform !== 'win32') return { success: false, message: 'Disponível apenas no Windows.' };
    const st = await this.status();
    if (st.isAdmin) return { success: false, message: 'O CWU App já está rodando como administrador.' };

    const target = buildRelaunchTarget({
      isElectron: Boolean(process.versions.electron),
      execPath: process.execPath,
      argv: process.argv,
      cwd: process.cwd(),
      portableExe: process.env.PORTABLE_EXECUTABLE_FILE || null,
      serverPath: path.resolve(__dirname, '../../server.js')
    });
    const encoded = Buffer.from(buildInnerScript(target), 'utf16le').toString('base64');

    // -Verb RunAs mostra o UAC. Se o usuário negar, o Start-Process lança erro e nada é fechado.
    const res = await runPowerShell(`
try {
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile','-WindowStyle','Hidden','-EncodedCommand','${encoded}' -ErrorAction Stop
  '{"ok":true}'
} catch {
  '{"ok":false}'
}`, 120000);

    if (!(res.success && res.data && res.data.ok)) {
      return { success: false, cancelled: true, message: 'Permissão de administrador não concedida. O CWU App continua aberto normalmente.' };
    }

    // Responde primeiro e só então encerra esta instância
    setTimeout(() => {
      if (process.versions.electron) {
        try { require('electron').app.quit(); } catch (e) { process.exit(0); }
      } else {
        process.exit(0);
      }
    }, 600);

    return { success: true, mode: st.mode, message: 'Reabrindo o CWU App como administrador…' };
  }
}

module.exports = new ElevationService();
module.exports.buildRelaunchTarget = buildRelaunchTarget;
module.exports.buildInnerScript = buildInnerScript;
