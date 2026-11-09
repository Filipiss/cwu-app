// backend/src/services/boostService.js
const os = require('os');
const { runPowerShell } = require('../utils/powershell');
const db = require('../database/db');

// Script de memória: mede contadores, purga a Standby List e/ou esvazia working sets
const MEMORY_SCRIPT = (doPurge, doTrim) => `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CwuMem {
    [DllImport("psapi.dll")] public static extern bool EmptyWorkingSet(IntPtr hProcess);
    [DllImport("ntdll.dll")] public static extern int NtSetSystemInformation(int infoClass, ref int info, int length);
    [DllImport("ntdll.dll")] public static extern int RtlAdjustPrivilege(int privilege, bool enable, bool currentThread, out bool wasEnabled);
    public static int PurgeStandby() {
        bool was;
        RtlAdjustPrivilege(13, true, false, out was); // SeProfileSingleProcessPrivilege
        int cmd = 4; // MemoryPurgeStandbyList
        return NtSetSystemInformation(80, ref cmd, 4); // SystemMemoryListInformation
    }
    public static int TrimAll() {
        int count = 0;
        int self = System.Diagnostics.Process.GetCurrentProcess().Id;
        foreach (var p in System.Diagnostics.Process.GetProcesses()) {
            try { if (p.Id > 4 && p.Id != self && EmptyWorkingSet(p.Handle)) count++; } catch {}
        }
        return count;
    }
}
"@
function Get-Mem {
  $m = Get-CimInstance Win32_PerfRawData_PerfOS_Memory
  [PSCustomObject]@{
    standby = [double]$m.StandbyCacheNormalPriorityBytes + [double]$m.StandbyCacheReserveBytes + [double]$m.StandbyCacheCoreBytes
    free = [double]$m.FreeAndZeroPageListBytes
  }
}
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$before = Get-Mem
$purgeStatus = $null
$trimmed = 0
if (${doTrim ? '$true' : '$false'}) { $trimmed = [CwuMem]::TrimAll() }
if (${doPurge ? '$true' : '$false'} -and $isAdmin) { $purgeStatus = [CwuMem]::PurgeStandby() }
Start-Sleep -Milliseconds 300
$after = Get-Mem
[PSCustomObject]@{
  isAdmin = $isAdmin
  purgeStatus = $purgeStatus
  processesTrimmed = $trimmed
  standbyBefore = $before.standby
  standbyAfter = $after.standby
  freeBefore = $before.free
  freeAfter = $after.free
} | ConvertTo-Json -Compress
`;

class BoostService {
  async getBoostStatus() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usedPercent = Math.round((usedMem / totalMem) * 100);

    const activeBoosts = (db.state && db.state.activeBoosts) ? db.state.activeBoosts : {};
    let isNvidiaUltra = Boolean(activeBoosts.nvidia_ultra);
    let isAmdAntiLag = Boolean(activeBoosts.amd_antilag);

    if (process.platform === 'win32') {
      try {
        const checkScript = `
          [PSCustomObject]@{
            nvKey = (Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\000*" -ErrorAction SilentlyContinue | Where-Object { $_.DriverDesc -like "*NVIDIA*" -or $_.ProviderName -like "*NVIDIA*" } | Select-Object -Property LowLatencyMode, PrerenderLimit, DriverDesc -First 1)
            amdKey = (Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\000*" -ErrorAction SilentlyContinue | Where-Object { $_.DriverDesc -like "*Radeon*" -or $_.ProviderName -like "*AMD*" -or $_.ProviderName -like "*Advanced Micro*" } | Select-Object -Property AntiLag, FlipQueueSize, DriverDesc -First 1)
          } | ConvertTo-Json -Depth 2 -Compress
        `;
        const res = await runPowerShell(checkScript, 4000);
        if (res.success && res.data) {
          if (res.data.nvKey && ((res.data.nvKey.LowLatencyMode === 2) || (res.data.nvKey.PrerenderLimit === 1))) {
            isNvidiaUltra = true;
          }
          if (res.data.amdKey && ((res.data.amdKey.AntiLag === 1) || (res.data.amdKey.FlipQueueSize === 1))) {
            isAmdAntiLag = true;
          }
        }
      } catch (e) {}
    }

    const optimizations = [
      {
        id: 'nvidia_ultra',
        title: 'Modo de Baixa Latência NVIDIA (Ultra)',
        description: 'Reduz a fila de pré-renderização para menor input lag em jogos competitivos. Esta configuração fica no perfil do driver e só pode ser alterada pelo Painel NVIDIA; o CWU abre o painel e mostra o caminho.<br><div style="margin-top:10px; padding:10px 12px; background: rgba(132, 204, 22, 0.1); border: 1px solid rgba(132, 204, 22, 0.3); border-radius: 6px; font-size: 0.85rem; line-height: 1.55;"><strong style="color: #84cc16;">📌 Passo a passo no Painel NVIDIA:</strong><br>1. Clique em <strong>Abrir Painel NVIDIA</strong>.<br>2. Na coluna à esquerda, selecione <strong>Gerenciar as configurações em 3D</strong>.<br>3. Na lista central, role até <strong>Modo de Baixa Latência</strong> e escolha <strong>Ultra</strong>.<br>4. Clique em <strong>Aplicar</strong> no canto inferior direito.</div>',
        status: isNvidiaUltra ? 'active' : 'recommended',
        active: isNvidiaUltra,
        gpuType: 'nvidia',
        potentialGain: 'Input Lag Mínimo (Ultra)',
        btnLabel: isNvidiaUltra ? 'Ultra Configurado ✓' : 'Ativar Modo Ultra',
        manualAction: 'open_nvidia_settings',
        manualLabel: 'Abrir Painel NVIDIA',
        manualTooltip: 'Abre o Painel de Controle da NVIDIA diretamente para configurar o Modo de Baixa Latência'
      },
      {
        id: 'amd_antilag',
        title: 'Modo de Baixa Latência AMD Radeon (Anti-Lag)',
        description: 'Sincroniza o ritmo de trabalho da CPU com a GPU para cliques mais rápidos e redução do atraso de entrada.<br><div style="margin-top:10px; padding:10px 12px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; font-size: 0.85rem; line-height: 1.55;"><strong style="color: #f87171;">📌 Como ativar no AMD Software:</strong><br>1. Clique em <strong>Abrir AMD Software</strong>.<br>2. Acesse a aba <strong>Jogos</strong> › <strong>Gráficos</strong>.<br>3. Ative a opção <strong>Radeon Anti-Lag</strong>.</div>',
        status: isAmdAntiLag ? 'active' : 'ready',
        active: isAmdAntiLag,
        gpuType: 'amd',
        potentialGain: 'Input Lag Reduzido (Anti-Lag)',
        btnLabel: isAmdAntiLag ? 'Radeon Anti-Lag Ativado ✓' : 'Ativar Radeon Anti-Lag',
        manualAction: 'open_amd_settings',
        manualLabel: 'Abrir AMD Software',
        manualTooltip: 'Abre o AMD Software Adrenalin diretamente na aba de Gráficos / Jogos'
      },
      {
        id: 'purge_standby',
        title: 'Esvaziar Standby List (Estilo RAMMap / ISLC)',
        description: 'Chama a API nativa NtSetSystemInformation para zerar páginas de cache e arquivos em espera mantidos pelo Windows.',
        status: 'recommended',
        active: false,
        potentialGain: '~1.5 a 4 GB em cache de RAM',
        btnLabel: 'Zerar Standby List Agora'
      },
      {
        id: 'ram_clean',
        title: 'Descarregar Working Sets de Processos',
        description: 'Força todos os processos ociosos e navegadores em segundo plano a liberarem páginas de RAM via EmptyWorkingSet.<br><span style="display:inline-block; margin-top:8px; font-size:0.85rem; color: var(--color-text-muted, #94a3b8); line-height: 1.45;">📌 <strong>Como gerenciar manualmente:</strong> Pressione Ctrl + Shift + Esc › <strong>Gerenciador de Tarefas</strong> › Aba Processos / Detalhes para ver o consumo de memória.</span>',
        status: 'recommended',
        active: false,
        potentialGain: '~500 MB a 1.2 GB de RAM',
        btnLabel: 'Descarregar RAM Ociosa',
        manualAction: 'open_taskmgr',
        manualLabel: 'Mudar Manualmente',
        manualTooltip: 'Abre o Gerenciador de Tarefas do Windows'
      },
      {
        id: 'power_plan',
        title: 'Plano de Energia de Desempenho Máximo',
        description: 'Evita que os núcleos da CPU entrem em estados de economia C-State durante partidas de jogos competitivos.<br><span style="display:inline-block; margin-top:8px; font-size:0.85rem; color: var(--color-text-muted, #94a3b8); line-height: 1.45;">📌 <strong>Como ativar manualmente:</strong> Painel de Controle › Sistema e Segurança › <strong>Opções de Energia</strong> › Selecionar <strong>Alto Desempenho</strong>.</span>',
        status: 'ready',
        active: false,
        potentialGain: 'Latência de CPU reduzida',
        btnLabel: 'Ativar Plano Máximo',
        manualAction: 'open_power_settings',
        manualLabel: 'Mudar Manualmente',
        manualTooltip: 'Abre as Opções de Energia do Painel de Controle'
      },
      {
        id: 'telemetry_services',
        title: 'Suspensão de Telemetria e Diagnóstico Windows',
        description: 'Pausa temporariamente o envio de métricas para a Microsoft enquanto você joga.<br><span style="display:inline-block; margin-top:8px; font-size:0.85rem; color: var(--color-text-muted, #94a3b8); line-height: 1.45;">📌 <strong>Como desativar manualmente:</strong> Configurações do Windows › Privacidade e Segurança › <strong>Diagnóstico e Comentários</strong> › Desativar envio de dados opcionais.</span>',
        status: 'ready',
        active: false,
        potentialGain: 'Menos uso de disco e rede',
        btnLabel: 'Suspender Telemetria',
        manualAction: 'open_telemetry_settings',
        manualLabel: 'Mudar Manualmente',
        manualTooltip: 'Abre as Configurações de Privacidade e Diagnóstico do Windows'
      },
      {
        id: 'temp_cleanup',
        title: 'Limpeza de Arquivos Temporários (%TEMP%)',
        description: 'Exclui restos de arquivos de instaladores e cache acumulado na pasta temporária do Windows.<br><span style="display:inline-block; margin-top:8px; font-size:0.85rem; color: var(--color-text-muted, #94a3b8); line-height: 1.45;">📌 <strong>Como abrir manualmente:</strong> Pressione Win + R › Digite <strong>%temp%</strong> e aperte Enter para examinar ou apagar arquivos residuais.</span>',
        status: 'recommended',
        active: false,
        potentialGain: '~2 a 5 GB em disco',
        btnLabel: 'Limpar %TEMP%',
        manualAction: 'open_temp_folder',
        manualLabel: 'Mudar Manualmente',
        manualTooltip: 'Abre a pasta de arquivos temporários (%TEMP%) no Windows Explorer'
      }
    ];

    return {
      memory: {
        totalGb: Math.round(totalMem / (1024 * 1024 * 1024)),
        freeGb: parseFloat((freeMem / (1024 * 1024 * 1024)).toFixed(1)),
        usedGb: parseFloat((usedMem / (1024 * 1024 * 1024)).toFixed(1)),
        usedPercent
      },
      isBoostActive: isNvidiaUltra,
      optimizations
    };
  }

  // O ponto de restauração agora é oferecido ao usuário pela interface, antes da ação
  async runBoostOptimization(actionId) {
    return this.applyOptimization(actionId);
  }

  async applyOptimization(actionId) {
    const freeMemBefore = os.freemem();
    let message = 'Otimização aplicada com sucesso!';
    let details = {};

    // 1. Standby List (estilo RAMMap/ISLC) e Working Sets
    //    Medimos pelos contadores do Windows: os.freemem() já conta a Standby List
    //    como memória "disponível", então não serve para medir o ganho.
    if (actionId === 'purge_standby' || actionId === 'ram_clean' || actionId === 'full_boost') {
      if (process.platform !== 'win32') {
        return { success: false, actionId, message: 'Disponível apenas no Windows.', freedMemoryMb: 0 };
      }

      const doPurge = actionId !== 'ram_clean';
      const doTrim = actionId !== 'purge_standby';
      const res = await runPowerShell(MEMORY_SCRIPT(doPurge, doTrim), 30000);

      if (!res.success || !res.data) {
        return { success: false, actionId, message: 'Falha ao executar a otimização de memória: ' + (res.error || res.raw || 'sem resposta do PowerShell'), freedMemoryMb: 0 };
      }

      const d = res.data;
      const toMb = (b) => Math.round((Number(b) || 0) / (1024 * 1024));
      const standbyFreedMb = Math.max(0, toMb(d.standbyBefore) - toMb(d.standbyAfter));
      const freeGainMb = Math.max(0, toMb(d.freeAfter) - toMb(d.freeBefore));

      if (doPurge && !d.isAdmin) {
        return {
          success: false,
          actionId,
          needsAdmin: true,
          message: 'Limpar a Standby List exige privilégio de administrador. Feche o CWU App e abra-o com "Executar como administrador".',
          freedMemoryMb: 0
        };
      }

      if (doPurge && d.purgeStatus !== 0) {
        return {
          success: false,
          actionId,
          message: `O Windows recusou a limpeza da Standby List (NTSTATUS 0x${(d.purgeStatus >>> 0).toString(16).toUpperCase()}).`,
          freedMemoryMb: 0,
          details: d
        };
      }

      const parts = [];
      if (doPurge) parts.push(`Standby List: ${toMb(d.standbyBefore)} MB → ${toMb(d.standbyAfter)} MB (${standbyFreedMb} MB limpos)`);
      if (doTrim) parts.push(`${d.processesTrimmed} processos descarregados`);
      parts.push(`RAM livre: +${freeGainMb} MB`);

      return {
        success: true,
        actionId,
        message: parts.join(' • '),
        freedMemoryMb: doPurge ? standbyFreedMb : freeGainMb,
        details: d
      };
    }

    // 2. Limpeza de Temporários
    if (actionId === 'temp_cleanup') {
      let freedMb = 0;
      let skipped = 0;
      let ran = false;
      if (process.platform === 'win32') {
        // Mede o tamanho antes/depois; arquivos em uso são ignorados (e contados)
        const res = await runPowerShell(`
          $ErrorActionPreference = 'SilentlyContinue'
          $before = (Get-ChildItem -Path $env:TEMP -Recurse -Force -File | Measure-Object Length -Sum).Sum
          $failed = 0
          Get-ChildItem -Path $env:TEMP -Force | ForEach-Object {
            try { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop } catch { $failed++ }
          }
          $after = (Get-ChildItem -Path $env:TEMP -Recurse -Force -File | Measure-Object Length -Sum).Sum
          [PSCustomObject]@{ before = [double]$before; after = [double]$after; failed = $failed } | ConvertTo-Json -Compress
        `, 60000);
        if (res.success && res.data) {
          ran = true;
          freedMb = Math.max(0, Math.round(((res.data.before || 0) - (res.data.after || 0)) / (1024 * 1024)));
          skipped = res.data.failed || 0;
        }
      }
      return {
        success: ran,
        actionId,
        message: ran
          ? `Limpeza concluída: ${freedMb} MB liberados em disco.${skipped ? ` ${skipped} itens em uso foram mantidos.` : ''}`
          : 'Não foi possível limpar a pasta temporária neste sistema.',
        freedDiskMb: freedMb,
        freedMemoryMb: 0
      };
    }

    // 3. Plano de Energia Máximo / Equilibrado (Reversão)
    if (actionId === 'power_plan' || actionId === 'power_balanced') {
      if (process.platform === 'win32') {
        try {
          if (actionId === 'power_plan') {
            await runPowerShell(`powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61; powercfg -setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`, 5000);
          } else {
            // Reverte para Equilibrado (Balanced) padrão do Windows
            await runPowerShell(`powercfg -setactive 381b4222-f694-41f0-9685-ff5bb260df2e`, 5000);
          }
        } catch (e) {}
      }

      if (actionId === 'power_plan') {
        db.addUpdateLog({
          type: 'boost',
          title: 'Plano de Energia de Alto Desempenho',
          category: 'Energia Windows',
          details: 'Configurado plano de energia para Alto Desempenho no Windows.',
          actionId: 'power_plan',
          revertAction: 'power_balanced'
        });
      }

      return {
        success: true,
        actionId,
        message: actionId === 'power_plan' ? 'Plano de Alto Desempenho ativado no Windows!' : 'Plano de Energia restaurado para o padrão Equilibrado.',
        freedMemoryMb: 0
      };
    }

    // 4/5. Baixa latência NVIDIA / AMD
    //   O "Modo de baixa latência" da NVIDIA e o Anti-Lag da AMD ficam no perfil
    //   interno do driver, que só o painel do fabricante altera. Valores gravados
    //   na chave de classe do registro NÃO são lidos pelo driver. Por isso:
    //   o botão abre o painel oficial com o passo a passo.
    if (['nvidia_ultra', 'amd_antilag'].includes(actionId)) {
      const vendor = actionId.startsWith('nvidia') ? 'nvidia' : 'amd';

      if (process.platform !== 'win32') {
        return { success: false, actionId, message: 'Disponível apenas no Windows.', freedMemoryMb: 0 };
      }

      await this.runBoostOptimization(vendor === 'nvidia' ? 'open_nvidia_settings' : 'open_amd_settings');
      return {
        success: true,
        actionId,
        message: vendor === 'nvidia'
          ? 'Painel NVIDIA aberto: vá em "Gerenciar as configurações em 3D" › "Modo de baixa latência" › Ultra › Aplicar.'
          : 'AMD Software aberto: vá em Jogos › Gráficos e ative o Radeon Anti-Lag.',
        freedMemoryMb: 0
      };
    }

    // 6. Suspensão de Telemetria e Diagnóstico Windows (e Reversão)
    if (actionId === 'telemetry_services' || actionId === 'telemetry_restore') {
      if (process.platform === 'win32') {
        try {
          if (actionId === 'telemetry_services') {
            await runPowerShell(`Stop-Service -Name DiagTrack -Force -ErrorAction SilentlyContinue; Set-Service -Name DiagTrack -StartupType Disabled -ErrorAction SilentlyContinue`, 5000);
          } else {
            await runPowerShell(`Set-Service -Name DiagTrack -StartupType Automatic -ErrorAction SilentlyContinue; Start-Service -Name DiagTrack -ErrorAction SilentlyContinue`, 5000);
          }
        } catch (e) {}
      }

      if (actionId === 'telemetry_services') {
        db.addUpdateLog({
          type: 'boost',
          title: 'Suspensão de Telemetria e Diagnóstico Windows',
          category: 'Serviços Windows',
          details: 'Serviço de Experiências do Usuário Conectado e Telemetria (DiagTrack) suspenso e desativado.',
          actionId: 'telemetry_services',
          revertAction: 'telemetry_restore'
        });
      }

      return {
        success: true,
        actionId,
        message: actionId === 'telemetry_services'
          ? 'Serviço de Telemetria (DiagTrack) pausado com sucesso!'
          : 'Serviço de Telemetria restaurado para o padrão do Windows.',
        freedMemoryMb: 0
      };
    }

    // 7. Abrir Configurações Manuais no Windows ou Softwares de Fabricante
    const { spawn } = require('child_process');

    if (actionId === 'open_temp_folder') {
      if (process.platform === 'win32') {
        const tempDir = process.env.TEMP || os.tmpdir();
        spawn('explorer.exe', [tempDir], { detached: true, stdio: 'ignore' }).unref();
      }
      return { success: true, actionId, message: 'Pasta de Arquivos Temporários (%TEMP%) aberta no Explorer!', freedMemoryMb: 0 };
    }

    if (actionId === 'open_windows_update') {
      if (process.platform === 'win32') {
        spawn('cmd.exe', ['/c', 'start ms-settings:windowsupdate-optionalupdates'], { detached: true, stdio: 'ignore' }).unref();
      }
      return { success: true, actionId, message: 'Windows Update aberto em "Atualizações opcionais": marque o driver e clique em Baixar e instalar.', freedMemoryMb: 0 };
    }

    if (actionId === 'open_taskmgr') {
      if (process.platform === 'win32') {
        spawn('taskmgr.exe', [], { detached: true, stdio: 'ignore' }).unref();
      }
      return { success: true, actionId, message: 'Gerenciador de Tarefas do Windows aberto na tela!', freedMemoryMb: 0 };
    }

    if (actionId === 'open_power_settings') {
      if (process.platform === 'win32') {
        spawn('control.exe', ['/name', 'Microsoft.PowerOptions'], { detached: true, stdio: 'ignore' }).unref();
      }
      return { success: true, actionId, message: 'Opções de Energia do Painel de Controle abertas!', freedMemoryMb: 0 };
    }

    if (actionId === 'open_telemetry_settings') {
      if (process.platform === 'win32') {
        spawn('cmd.exe', ['/c', 'start ms-settings:privacy-feedback'], { detached: true, stdio: 'ignore' }).unref();
      }
      return { success: true, actionId, message: 'Configurações de Privacidade e Diagnóstico abertas!', freedMemoryMb: 0 };
    }

    if (actionId === 'open_nvidia_settings') {
      if (process.platform === 'win32') {
        const openScript = `
          $pkg = Get-AppxPackage -Name "*NVIDIAControlPanel*" -ErrorAction SilentlyContinue | Select-Object -First 1
          if ($pkg) {
            Start-Process "shell:AppsFolder\\$($pkg.PackageFamilyName)!NVIDIACorp.NVIDIAControlPanel" -ErrorAction SilentlyContinue
            exit 0
          }
          $paths = @(
            "C:\\Program Files\\NVIDIA Corporation\\Control Panel Client\\nvcplui.exe",
            "C:\\Windows\\System32\\nvcplui.exe",
            "C:\\Program Files\\NVIDIA Corporation\\NVIDIA App\\CEF\\NVIDIA App.exe"
          )
          foreach ($p in $paths) {
            if (Test-Path $p) {
              Start-Process $p -ErrorAction SilentlyContinue
              exit 0
            }
          }
          Start-Process "shell:AppsFolder\\NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj!NVIDIACorp.NVIDIAControlPanel" -ErrorAction SilentlyContinue
        `;
        runPowerShell(openScript, 6000).catch(() => {});
      }
      return {
        success: true,
        actionId,
        message: 'Painel NVIDIA aberto! Vá em "Gerenciar as configurações em 3D" > "Modo de Baixa Latência" > Ultra e clique em Aplicar.',
        freedMemoryMb: 0
      };
    }

    if (actionId === 'open_amd_settings') {
      if (process.platform === 'win32') {
        const amdScript = `
          $paths = @(
            "C:\\Program Files\\AMD\\CNext\\CNext\\RadeonSoftware.exe",
            "C:\\Program Files\\AMD\\CNext\\CNext\\AMDSoftware.exe",
            "C:\\Program Files\\AMD\\CNext\\CNext\\cncmd.exe"
          )
          foreach ($p in $paths) {
            if (Test-Path $p) {
              Start-Process $p -ArgumentList "-open Gaming/Graphics" -ErrorAction SilentlyContinue
              exit 0
            }
          }
          Start-Process "amd://" -ErrorAction SilentlyContinue
        `;
        runPowerShell(amdScript, 6000).catch(() => {});
      }
      return { success: true, actionId, message: 'AMD Software Adrenalin aberto na aba Gráficos / Jogos!', freedMemoryMb: 0 };
    }

    return {
      success: true,
      actionId,
      message,
      freedMemoryMb: 0
    };
  }

  runOptimization(actionId) {
    return this.runBoostOptimization(actionId);
  }
}

module.exports = new BoostService();
