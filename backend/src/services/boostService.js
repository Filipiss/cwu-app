// backend/src/services/boostService.js
const os = require('os');
const { runPowerShell } = require('../utils/powershell');
const db = require('../database/db');

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
        description: 'Reduz a fila de pré-renderização para resposta imediata do monitor e menor input lag em jogos competitivos.<br><div style="margin-top:10px; padding:10px 12px; background: rgba(132, 204, 22, 0.1); border: 1px solid rgba(132, 204, 22, 0.3); border-radius: 6px; font-size: 0.85rem; line-height: 1.55;"><strong style="color: #84cc16;">📌 Passo a passo no Painel NVIDIA:</strong><br>1. Clique em <strong>Abrir Painel NVIDIA</strong>.<br>2. Na coluna à esquerda, selecione <strong>Gerenciar as configurações em 3D</strong>.<br>3. Na lista central, role até <strong>Modo de Baixa Latência</strong> e escolha <strong>Ultra</strong>.<br>4. Clique em <strong>Aplicar</strong> no canto inferior direito.</div>',
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

  async runBoostOptimization(actionId) {
    const freeMemBefore = os.freemem();
    let message = 'Otimização aplicada com sucesso!';
    let details = {};

    // 1. Esvaziar Standby List (RAMMap / ISLC) e Working Sets
    if (actionId === 'purge_standby' || actionId === 'ram_clean' || actionId === 'full_boost') {
      let trimmedCount = 0;
      let standbyPurged = false;

      if (process.platform === 'win32') {
        const psScript = `
          Add-Type @"
          using System;
          using System.Runtime.InteropServices;
          public class RamOptimizer {
              [DllImport("psapi.dll")]
              public static extern int EmptyWorkingSet(IntPtr hwProc);

              [DllImport("ntdll.dll")]
              public static extern UInt32 NtSetSystemInformation(int InfoClass, IntPtr Info, int Length);

              [DllImport("advapi32.dll", SetLastError = true)]
              public static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);

              [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
              public static extern bool LookupPrivilegeValue(string lpSystemName, string lpName, out long lpLuid);

              [DllImport("advapi32.dll", SetLastError = true)]
              public static extern bool AdjustTokenPrivileges(IntPtr TokenHandle, bool DisableAllPrivileges, ref TOKEN_PRIVILEGES NewState, int BufferLength, IntPtr PreviousState, IntPtr ReturnLength);

              [StructLayout(LayoutKind.Sequential, Pack = 1)]
              public struct TOKEN_PRIVILEGES {
                  public int PrivilegeCount;
                  public long Luid;
                  public int Attributes;
              }

              public static bool EnablePrivilege(string privilege) {
                  try {
                      IntPtr token;
                      if (!OpenProcessToken(System.Diagnostics.Process.GetCurrentProcess().Handle, 0x0020 | 0x0008, out token)) return false;
                      TOKEN_PRIVILEGES tp = new TOKEN_PRIVILEGES();
                      tp.PrivilegeCount = 1;
                      tp.Attributes = 0x00000002;
                      if (!LookupPrivilegeValue(null, privilege, out tp.Luid)) return false;
                      return AdjustTokenPrivileges(token, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
                  } catch { return false; }
              }

              public static bool PurgeStandbyList() {
                  try {
                      EnablePrivilege("SeProfileSingleProcessPrivilege");
                      EnablePrivilege("SeIncreaseQuotaPrivilege");
                      int cmd = 4;
                      GCHandle handle = GCHandle.Alloc(cmd, GCHandleType.Pinned);
                      UInt32 r = NtSetSystemInformation(80, handle.AddrOfPinnedObject(), 4);
                      handle.Free();
                      return r == 0;
                  } catch { return false; }
              }

              public static int TrimAllProcesses() {
                  int count = 0;
                  var currentId = System.Diagnostics.Process.GetCurrentProcess().Id;
                  foreach (var p in System.Diagnostics.Process.GetProcesses()) {
                      try {
                          if (p.Id == currentId || p.Id <= 4) continue;
                          var name = p.ProcessName.ToLower();
                          if (name.Contains("system") || name.Contains("idle")) continue;
                          EmptyWorkingSet(p.Handle);
                          count++;
                      } catch {}
                  }
                  return count;
              }
          }
"@ -ErrorAction SilentlyContinue

          $standby = [RamOptimizer]::PurgeStandbyList()
          $trimmed = [RamOptimizer]::TrimAllProcesses()

          [PSCustomObject]@{
              standbyPurged = $standby
              processesTrimmed = $trimmed
          } | ConvertTo-Json -Compress
        `;

        try {
          const res = await runPowerShell(psScript, 12000);
          if (res.success && res.data) {
            details = res.data;
            trimmedCount = res.data.processesTrimmed || 0;
            standbyPurged = Boolean(res.data.standbyPurged);
          }
        } catch (err) {
          console.warn('[BoostService] Erro ao executar limpeza de RAM:', err.message);
        }
      }

      const freeMemAfter = os.freemem();
      const freedBytes = Math.max(0, freeMemAfter - freeMemBefore);
      const freedMb = Math.round(freedBytes / (1024 * 1024));

      if (freedMb > 0) {
        message = `Memória otimizada! Foram liberados ${freedMb} MB de RAM física (${trimmedCount} processos descarregados${standbyPurged ? ' e Standby List purgada' : ''}).`;
      } else {
        message = `Processos examinados (${trimmedCount} verificados). O cache e os processos já estavam operando com consumo otimizado.`;
      }

      return {
        success: true,
        actionId,
        message,
        freedMemoryMb: freedMb,
        details
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

    // 4. Modo de Baixa Latência NVIDIA (Ultra / Padrão)
    if (actionId === 'nvidia_ultra' || actionId === 'nvidia_default') {
      const mode = actionId === 'nvidia_ultra' ? 'ultra' : 'default';

      if (!db.state.activeBoosts) {
        db.state.activeBoosts = {};
      }
      db.state.activeBoosts.nvidia_ultra = (mode === 'ultra');
      db.save();

      if (process.platform === 'win32') {
        const psScript = `
          $baseClass = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}"
          $results = @{ success = $false; applied = @() }
          try {
            $subkeys = Get-ChildItem -Path $baseClass -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^\\d{4}$' }
            foreach ($key in $subkeys) {
              $props = Get-ItemProperty -Path $key.PSPath -ErrorAction SilentlyContinue
              if ($props.ProviderName -like "*NVIDIA*" -or $props.DriverDesc -like "*NVIDIA*" -or $props.DriverDesc -like "*GeForce*") {
                if ("${mode}" -eq "ultra") {
                  Set-ItemProperty -Path $key.PSPath -Name "LowLatencyMode" -Value 2 -Type DWord -Force -ErrorAction SilentlyContinue
                  Set-ItemProperty -Path $key.PSPath -Name "PrerenderLimit" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
                } else {
                  Set-ItemProperty -Path $key.PSPath -Name "LowLatencyMode" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
                  Set-ItemProperty -Path $key.PSPath -Name "PrerenderLimit" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
                }
                $results.applied += $key.PSChildName
              }
            }
            $results.success = $true
          } catch {}

          # Abre diretamente o Painel de Controle da NVIDIA para sincronização de 3D
          $pkg = Get-AppxPackage -Name "*NVIDIAControlPanel*" -ErrorAction SilentlyContinue | Select-Object -First 1
          if ($pkg) {
            Start-Process "shell:AppsFolder\\$($pkg.PackageFamilyName)!NVIDIACorp.NVIDIAControlPanel" -ErrorAction SilentlyContinue
          } else {
            $paths = @(
              "C:\\Program Files\\NVIDIA Corporation\\Control Panel Client\\nvcplui.exe",
              "C:\\Windows\\System32\\nvcplui.exe",
              "C:\\Program Files\\NVIDIA Corporation\\NVIDIA App\\CEF\\NVIDIA App.exe"
            )
            $found = $false
            foreach ($p in $paths) {
              if (Test-Path $p) {
                Start-Process $p -ErrorAction SilentlyContinue
                $found = $true
                break
              }
            }
            if (-not $found) {
              Start-Process "shell:AppsFolder\\NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj!NVIDIACorp.NVIDIAControlPanel" -ErrorAction SilentlyContinue
            }
          }

          $results | ConvertTo-Json -Compress
        `;

        try {
          const res = await runPowerShell(psScript, 8000);
          if (res.success && res.data) {
            details = res.data;
          }
        } catch (e) {
          console.warn('[BoostService] Erro ao aplicar NVIDIA latency:', e.message);
        }
      }

      if (mode === 'ultra') {
        db.addUpdateLog({
          type: 'boost',
          title: 'Modo de Baixa Latência NVIDIA (Ultra)',
          category: 'GPU NVIDIA',
          details: 'Modo Ultra configurado. Painel NVIDIA aberto para sincronização em Gerenciar as configurações em 3D.',
          actionId: 'nvidia_ultra',
          revertAction: 'nvidia_default'
        });
      }

      message = mode === 'ultra'
        ? 'Painel NVIDIA aberto! Em "Gerenciar as configurações em 3D", confirme "Modo de Baixa Latência" como Ultra e clique em Aplicar.'
        : 'Modo de Latência NVIDIA restaurado para o padrão no CWU App.';

      return {
        success: true,
        actionId,
        message,
        freedMemoryMb: 0,
        details
      };
    }

    // 5. Modo de Baixa Latência AMD Radeon (Anti-Lag / Padrão)
    if (actionId === 'amd_antilag' || actionId === 'amd_default') {
      const mode = actionId === 'amd_antilag' ? 'ultra' : 'default';

      if (!db.state.activeBoosts) {
        db.state.activeBoosts = {};
      }
      db.state.activeBoosts.amd_antilag = (mode === 'ultra');
      db.save();

      if (process.platform === 'win32') {
        const psScript = `
          $baseClass = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}"
          $results = @{ success = $false; applied = @() }
          try {
            $subkeys = Get-ChildItem -Path $baseClass -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^\\d{4}$' }
            foreach ($key in $subkeys) {
              $props = Get-ItemProperty -Path $key.PSPath -ErrorAction SilentlyContinue
              if ($props.ProviderName -like "*AMD*" -or $props.ProviderName -like "*Advanced Micro*" -or $props.DriverDesc -like "*Radeon*" -or $props.DriverDesc -like "*AMD*") {
                if ("${mode}" -eq "ultra") {
                  Set-ItemProperty -Path $key.PSPath -Name "AntiLag" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
                  Set-ItemProperty -Path $key.PSPath -Name "FlipQueueSize" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
                } else {
                  Set-ItemProperty -Path $key.PSPath -Name "AntiLag" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
                  Set-ItemProperty -Path $key.PSPath -Name "FlipQueueSize" -Value 3 -Type DWord -Force -ErrorAction SilentlyContinue
                }
                $results.applied += $key.PSChildName
              }
            }
            $results.success = $true
          } catch {}

          # Abre AMD Software Adrenalin
          $amdPaths = @(
            "C:\\Program Files\\AMD\\CNext\\CNext\\RadeonSoftware.exe",
            "C:\\Program Files\\AMD\\CNext\\CNext\\AMDSoftware.exe",
            "C:\\Program Files\\AMD\\CNext\\CNext\\cncmd.exe"
          )
          foreach ($p in $amdPaths) {
            if (Test-Path $p) {
              Start-Process $p -ArgumentList "-open Gaming/Graphics" -ErrorAction SilentlyContinue
              break
            }
          }

          $results | ConvertTo-Json -Compress
        `;

        try {
          const res = await runPowerShell(psScript, 8000);
          if (res.success && res.data) {
            details = res.data;
          }
        } catch (e) {
          console.warn('[BoostService] Erro ao aplicar AMD latency:', e.message);
        }
      }

      if (mode === 'ultra') {
        db.addUpdateLog({
          type: 'boost',
          title: 'Modo de Baixa Latência AMD Radeon (Anti-Lag)',
          category: 'GPU AMD',
          details: 'Recurso Radeon Anti-Lag ativado no driver AMD para sincronização CPU-GPU.',
          actionId: 'amd_antilag',
          revertAction: 'amd_default'
        });
      }

      message = mode === 'ultra'
        ? 'Radeon Anti-Lag ativado no CWU App e AMD Software aberto!'
        : 'Radeon Anti-Lag restaurado para o padrão.';

      return {
        success: true,
        actionId,
        message,
        freedMemoryMb: 0,
        details
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
