# backend/src/utils/openManualSetting.ps1
param (
    [Parameter(Mandatory=$true)]
    [string]$Target
)

try {
    switch ($Target.ToLower()) {
        "nvidia" {
            $pkg = Get-AppxPackage -Name "*NVIDIAControlPanel*" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($pkg) {
                Start-Process "shell:AppsFolder\$($pkg.PackageFamilyName)!NVIDIACorp.NVIDIAControlPanel" -ErrorAction SilentlyContinue
            } else {
                $paths = @(
                    "C:\Program Files\NVIDIA Corporation\Control Panel Client\nvcplui.exe",
                    "C:\Windows\System32\nvcplui.exe",
                    "C:\Program Files\NVIDIA Corporation\NVIDIA App\CEF\NVIDIA App.exe"
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
                    Start-Process "shell:AppsFolder\NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj!NVIDIACorp.NVIDIAControlPanel" -ErrorAction SilentlyContinue
                }
            }
        }
        "amd" {
            $amdPaths = @(
                "C:\Program Files\AMD\CNext\CNext\RadeonSoftware.exe",
                "C:\Program Files\AMD\CNext\CNext\AMDSoftware.exe",
                "C:\Program Files\AMD\CNext\CNext\cncmd.exe"
            )
            $found = $false
            foreach ($p in $amdPaths) {
                if (Test-Path $p) {
                    Start-Process $p -ArgumentList "-open Gaming/Graphics" -ErrorAction SilentlyContinue
                    $found = $true
                    break
                }
            }
            if (-not $found) {
                Start-Process "amd://" -ErrorAction SilentlyContinue
            }
        }
        "taskmgr" {
            Start-Process explorer.exe -ArgumentList "taskmgr.exe"
        }
        "power" {
            Start-Process explorer.exe -ArgumentList "shell:::{025A5937-A6E2-4760-BC1E-58292EC1E05C}"
        }
        "telemetry" {
            Start-Process explorer.exe -ArgumentList "ms-settings:privacy-feedback"
        }
        "temp" {
            $tempPath = [System.IO.Path]::GetTempPath()
            Start-Process explorer.exe -ArgumentList "`"$tempPath`""
        }
        default {
            Write-Warning "Target não reconhecido: $Target"
        }
    }
    Write-Output "OK"
} catch {
    Write-Error $_.Exception.Message
}
