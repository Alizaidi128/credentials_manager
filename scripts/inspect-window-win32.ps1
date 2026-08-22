<#
  Lower-level diagnostic: enumerates real Win32 child windows (via
  EnumChildWindows) of a process's main window, printing class name, window
  text, control ID, and screen position for each. This works even for apps
  where UI Automation reports zero children, since it talks to raw window
  handles rather than the accessibility tree.

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\inspect-window-win32.ps1 -ProcessName EasyConnect
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$ProcessName
)

$proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc -or $proc.MainWindowHandle -eq [IntPtr]::Zero) {
  Write-Host "No running process named '$ProcessName' with a visible main window was found."
  exit 1
}

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public static class Win32Inspect {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetDlgCtrlID(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    public static List<string> Dump(IntPtr root) {
        var results = new List<string>();
        EnumChildWindows(root, (hWnd, lParam) => {
            var cls = new StringBuilder(256);
            GetClassName(hWnd, cls, cls.Capacity);
            int len = GetWindowTextLength(hWnd);
            var txt = new StringBuilder(len + 1);
            GetWindowText(hWnd, txt, txt.Capacity + 1);
            int ctrlId = GetDlgCtrlID(hWnd).ToInt32();
            RECT r;
            GetWindowRect(hWnd, out r);
            bool visible = IsWindowVisible(hWnd);
            results.Add(string.Format("hwnd=0x{0:X} class='{1}' text='{2}' ctrlId={3} visible={4} rect=({5},{6})-({7},{8})",
                hWnd.ToInt64(), cls.ToString(), txt.ToString(), ctrlId, visible, r.Left, r.Top, r.Right, r.Bottom));
            return true;
        }, IntPtr.Zero);
        return results;
    }
}
"@

Write-Host "=== Child windows of '$($proc.MainWindowTitle)' (PID $($proc.Id)) ==="
$lines = [Win32Inspect]::Dump($proc.MainWindowHandle)
if ($lines.Count -eq 0) {
  Write-Host "(no child windows found)"
} else {
  $lines | ForEach-Object { Write-Host $_ }
}
