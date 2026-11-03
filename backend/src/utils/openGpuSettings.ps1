# backend/src/utils/openGpuSettings.ps1
param (
    [string]$Target = "nvidia" # 'nvidia' ou 'amd'
)

$result = @{
    target = $Target
    success = $false
    app = $null
    message = ""
}

try {
    if ($Target -eq "nvidia") {
        # 1. Tenta Painel de Controle NVIDIA UWP (Moderno)
        $pkg = Get-AppxPackage -Name "*NVIDIAControlPanel*" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($pkg) {
            Start-Process "shell:AppsFolder\$($pkg.PackageFamilyName)!NVIDIACorp.NVIDIAControlPanel" -ErrorAction SilentlyContinue
            $result.success = $true
            $result.app = "Painel de Controle NVIDIA"
            $result.message = "Painel de Controle NVIDIA aberto nas Configurações 3D!"
        } else {
            # 2. Tenta executáveis clássicos ou NVIDIA App
            $paths = @(
                "C:\Program Files\NVIDIA Corporation\Control Panel Client\nvcplui.exe",
                "C:\Windows\System32\nvcplui.exe",
                "C:\Program Files\NVIDIA Corporation\NVIDIA App\CEF\NVIDIA App.exe"
            )
            $found = $false
            foreach ($p in $paths) {
                if (Test-Path $p) {
                    Start-Process $p -ErrorAction SilentlyContinue
                    $result.success = $true
                    $result.app = "Painel NVIDIA"
                    $result.message = "Painel NVIDIA aberto com sucesso!"
                    $found = $true
                    break
                }
            }

            if (-not $found) {
                try {
                    Start-Process "shell:AppsFolder\NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj!NVIDIACorp.NVIDIAControlPanel" -ErrorAction SilentlyContinue
                    $result.success = $true
                    $result.app = "Painel de Controle NVIDIA"
                    $result.message = "Painel de Controle NVIDIA aberto!"
                } catch {
                    $result.message = "Nenhum aplicativo oficial da NVIDIA foi encontrado instalado."
                }
            }
        }
    } elseif ($Target -eq "amd") {
        $amdPaths = @(
            "C:\Program Files\AMD\CNext\CNext\RadeonSoftware.exe",
            "C:\Program Files\AMD\CNext\CNext\AMDSoftware.exe",
            "C:\Program Files\AMD\CNext\CNext\cncmd.exe"
        )

        $found = $false
        foreach ($p in $amdPaths) {
            if (Test-Path $p) {
                Start-Process -FilePath $p -ArgumentList "-open Gaming/Graphics"
                $result.success = $true
                $result.app = "AMD Software: Adrenalin Edition"
                $result.message = "AMD Software Adrenalin aberto na aba Gráficos / Jogos!"
                $found = $true
                break
            }
        }

        if (-not $found) {
            try {
                Start-Process "amd://"
                $result.success = $true
                $result.app = "AMD Software (Protocolo)"
                $result.message = "AMD Software iniciado!"
            } catch {
                $result.message = "Software AMD Software: Adrenalin Edition não foi encontrado nesta máquina (nenhuma GPU AMD detectada)."
            }
        }
    }
} catch {
    $result.message = $_.Exception.Message
}

$result | ConvertTo-Json -Compress
