# backend/src/utils/setGpuLatency.ps1
param (
    [string]$Target = "nvidia", # 'nvidia' ou 'amd'
    [string]$Mode = "ultra"     # 'ultra' ou 'default'
)

$baseClass = "HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
$results = @{
    target = $Target
    mode = $Mode
    appliedKeys = @()
    success = $false
    error = $null
}

try {
    $subkeys = Get-ChildItem -Path $baseClass -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^\d{4}$' }

    if ($Target -eq "nvidia") {
        foreach ($key in $subkeys) {
            $props = Get-ItemProperty -Path $key.PSPath -ErrorAction SilentlyContinue
            if ($props.ProviderName -like "*NVIDIA*" -or $props.DriverDesc -like "*NVIDIA*" -or $props.DriverDesc -like "*GeForce*") {
                if ($Mode -eq "ultra") {
                    Set-ItemProperty -Path $key.PSPath -Name "LowLatencyMode" -Value 2 -Type DWord -Force
                    Set-ItemProperty -Path $key.PSPath -Name "PrerenderLimit" -Value 1 -Type DWord -Force
                    Set-ItemProperty -Path $key.PSPath -Name "D3D_OGL_MaxPrerenderedFrames" -Value 1 -Type DWord -Force
                } else {
                    Set-ItemProperty -Path $key.PSPath -Name "LowLatencyMode" -Value 0 -Type DWord -Force
                    Set-ItemProperty -Path $key.PSPath -Name "PrerenderLimit" -Value 0 -Type DWord -Force
                    Set-ItemProperty -Path $key.PSPath -Name "D3D_OGL_MaxPrerenderedFrames" -Value 0 -Type DWord -Force
                }
                $results.appliedKeys += $key.PSChildName
            }
        }
    } elseif ($Target -eq "amd") {
        foreach ($key in $subkeys) {
            $props = Get-ItemProperty -Path $key.PSPath -ErrorAction SilentlyContinue
            if ($props.ProviderName -like "*AMD*" -or $props.ProviderName -like "*Advanced Micro*" -or $props.DriverDesc -like "*Radeon*" -or $props.DriverDesc -like "*AMD*") {
                if ($Mode -eq "ultra") {
                    Set-ItemProperty -Path $key.PSPath -Name "AntiLag" -Value 1 -Type DWord -Force
                    Set-ItemProperty -Path $key.PSPath -Name "KMD_FRTC_AntiLag" -Value 1 -Type DWord -Force
                    Set-ItemProperty -Path $key.PSPath -Name "FlipQueueSize" -Value 1 -Type DWord -Force
                } else {
                    Set-ItemProperty -Path $key.PSPath -Name "AntiLag" -Value 0 -Type DWord -Force
                    Set-ItemProperty -Path $key.PSPath -Name "KMD_FRTC_AntiLag" -Value 0 -Type DWord -Force
                    Set-ItemProperty -Path $key.PSPath -Name "FlipQueueSize" -Value 3 -Type DWord -Force
                }
                $results.appliedKeys += $key.PSChildName
            }
        }
    }

    $results.success = $true
} catch {
    $results.error = $_.Exception.Message
}

$results | ConvertTo-Json -Compress
