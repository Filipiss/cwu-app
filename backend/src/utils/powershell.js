// backend/src/utils/powershell.js
const { spawn } = require('child_process');

/**
 * Executa scripts do PowerShell de forma segura via stdin
 * Isso previne truncamento de quebras de linha (\n), aspas ou limite de caracteres do cmd.exe
 * @param {string} script
 * @param {number} timeoutMs
 * @returns {Promise<any>}
 */
function runPowerShell(script, timeoutMs = 15000) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve({ success: false, error: 'Sistema operacional não é Windows' });
    }

    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command', '-'
    ], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let isTimedOut = false;

    const timer = setTimeout(() => {
      isTimedOut = true;
      try { child.kill(); } catch (e) {}
      resolve({ success: false, error: 'Timeout ao executar script PowerShell' });
    }, timeoutMs);

    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });

    child.on('close', () => {
      clearTimeout(timer);
      if (isTimedOut) return;

      const trimmed = (stdout || '').trim();
      if (!trimmed) {
        return resolve({ success: true, data: null, stderr: stderr.trim() });
      }

      try {
        const parsed = JSON.parse(trimmed);
        return resolve({ success: true, data: parsed });
      } catch (parseErr) {
        // Se a saída não for JSON puro, retorna texto bruto
        return resolve({ success: true, raw: trimmed, parseError: parseErr.message });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, error: err.message });
    });

    // Envia script com codificação UTF-8
    child.stdin.write(`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n` + script + `\n`);
    child.stdin.end();
  });
}

module.exports = { runPowerShell };
