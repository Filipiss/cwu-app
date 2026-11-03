# backend/src/utils/purgeStandby.ps1
# Script dedicado para esvaziamento da Standby List e Working Sets estilo Sysinternals RAMMap

$cSharpCode = @"
using System;
using System.Runtime.InteropServices;

public class RamMapCleaner {
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
        } catch {
            return false;
        }
    }

    public static bool PurgeStandbyList() {
        try {
            EnablePrivilege("SeProfileSingleProcessPrivilege");
            EnablePrivilege("SeIncreaseQuotaPrivilege");
            
            // Comando 4 = MemoryPurgeStandbyList (Esvazia o cache em espera mantendo programas ativos intactos)
            GCHandle handle4 = GCHandle.Alloc(4, GCHandleType.Pinned);
            UInt32 res4 = NtSetSystemInformation(80, handle4.AddrOfPinnedObject(), 4);
            handle4.Free();

            // Comando 5 = MemoryPurgeLowPriorityStandbyList
            GCHandle handle5 = GCHandle.Alloc(5, GCHandleType.Pinned);
            UInt32 res5 = NtSetSystemInformation(80, handle5.AddrOfPinnedObject(), 4);
            handle5.Free();

            return res4 == 0 || res5 == 0;
        } catch {
            return false;
        }
    }

    public static int EmptyAllWorkingSets() {
        // Desativado por padrão para evitar Page Fault Thrashing (travamento/lag do sistema)
        return 0;
    }
}
"@

try {
    Add-Type -TypeDefinition $cSharpCode -Language CSharp -ErrorAction SilentlyContinue
} catch {}

# Purga exclusivamente a Standby List (seguro, instantâneo e sem provocar lag em apps ativos)
$standbyPurged = [RamMapCleaner]::PurgeStandbyList()

[PSCustomObject]@{
    success = $true
    processesTrimmed = 0
    standbyPurged = $standbyPurged
} | ConvertTo-Json -Compress

