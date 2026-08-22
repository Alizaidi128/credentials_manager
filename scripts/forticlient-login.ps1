<#
  Drives FortiClient VPN login using mouse clicks + SendKeys.

  FortiClient VPN (standalone/free) renders its entire UI via Direct3D GPU
  compositing (window class Chrome_WidgetWin_1, child: Intermediate D3D Window).
  UIAutomation sees no controls inside it, so we use GetWindowRect to compute
  absolute screen positions from relative layout percentages, then simulate
  clicks and keystrokes.

  Layout percentages are calibrated from the FortiClient VPN standalone window
  (confirmed against live screenshot). The form is fixed-layout and centered
  regardless of window size.

  Tab order in the form: VPN Name select -> Username -> Password -> Connect.

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\forticlient-login.ps1 `
      -ClientPath "...\FortiClient.exe" `
      -VpnName "AMANA TAKAFUL_SLT" -Username "alice" -Password "s3cret"
#>
param(
  [Parameter(Mandatory=$true)]  [string]$ClientPath,
  [Parameter(Mandatory=$true)]  [string]$VpnName,
  [Parameter(Mandatory=$true)]  [string]$Username,
  [Parameter(Mandatory=$true)]  [string]$Password,
  [int]$LaunchSettleMs = 6000
)

Add-Type -AssemblyName System.Windows.Forms

Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class FC {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left, Top, Right, Bottom; }

  public delegate bool EP(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, int e);

  public static void Click(int x, int y) {
    SetCursorPos(x, y);   Thread.Sleep(80);
    mouse_event(0x0002, 0, 0, 0, 0);  // MOUSEEVENTF_LEFTDOWN
    Thread.Sleep(80);
    mouse_event(0x0004, 0, 0, 0, 0);  // MOUSEEVENTF_LEFTUP
    Thread.Sleep(80);
  }

  public static RECT WinRect(IntPtr h) { RECT r; GetWindowRect(h, out r); return r; }

  public static List<IntPtr> WinsForPids(int[] pids) {
    var pidSet = new System.Collections.Generic.HashSet<int>(pids);
    var list   = new List<IntPtr>();
    EnumWindows(delegate(IntPtr h, IntPtr lp) {
      uint p; GetWindowThreadProcessId(h, out p);
      if (pidSet.Contains((int)p)) list.Add(h);
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
'@

# ---- helpers ---------------------------------------------------------------

function Escape-SK([string]$s) {
  $s -replace '([+^%~(){}\[\]])', '{$1}'
}

function Click-Pct($hwnd, [double]$xp, [double]$yp) {
  $r = [FC]::WinRect($hwnd)
  $x = [int]($r.Left + ($r.Right  - $r.Left) * $xp)
  $y = [int]($r.Top  + ($r.Bottom - $r.Top ) * $yp)
  Write-Host "  click ($x,$y) = $([math]::Round($xp*100))% x $([math]::Round($yp*100))%"
  [FC]::Click($x, $y)
}

# ---- Step 1: find FortiClient processes ------------------------------------
# FortiClient (Electron) spawns many helper processes all named 'FortiClient'.
# NEVER launch a second instance -- Electron single-instance apps crash on
# double-launch.  Only launch if zero processes exist at all.

$fcPids = [int[]](
  Get-Process -Name 'FortiClient','FortiTray' -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty Id
)
if (-not $fcPids) { $fcPids = [int[]]@() }

if ($fcPids.Count -eq 0) {
  Write-Host 'FortiClient not running -- launching once and waiting...'
  Start-Process -FilePath $ClientPath
  Start-Sleep -Milliseconds $LaunchSettleMs
  $fcPids = [int[]](
    Get-Process -Name 'FortiClient','FortiTray' -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Id
  )
  if (-not $fcPids) { $fcPids = [int[]]@() }
  if ($fcPids.Count -eq 0) {
    Write-Host 'FAILED: FortiClient process not found after launch.'
    exit 1
  }
} else {
  Write-Host "FortiClient running ($($fcPids.Count) processes)."
}

# ---- Step 2: find the window (visible OR hidden/tray) ----------------------
# When FortiClient is minimised to tray its HWND still exists but
# IsWindowVisible returns false.  We accept any titled FortiClient window
# and use ShowWindow to bring it out of the tray.

$sb   = New-Object System.Text.StringBuilder 256
$hwnd = [IntPtr]::Zero

# First pass: prefer a visible window
foreach ($h in [FC]::WinsForPids($fcPids)) {
  [void][FC]::GetWindowText($h, $sb, 256)
  if ($sb.ToString() -match 'FortiClient' -and [FC]::IsWindowVisible($h)) {
    $hwnd = $h
    Write-Host "Found visible window: $h title='$($sb.ToString())'"
    break
  }
}

# Second pass: accept hidden window (tray-minimised)
if ([int64]$hwnd -eq 0) {
  foreach ($h in [FC]::WinsForPids($fcPids)) {
    [void][FC]::GetWindowText($h, $sb, 256)
    if ($sb.ToString() -match 'FortiClient') {
      $hwnd = $h
      Write-Host "Found hidden window: $h (tray) -- will restore."
      break
    }
  }
}

if ([int64]$hwnd -eq 0) {
  Write-Host 'FAILED: FortiClient is running but has no window to automate.'
  Write-Host 'Click the FortiClient tray icon to open its window, then retry.'
  exit 1
}

# Bring window to front.
# For a tray-hidden window we restore then show; for an already-visible window
# this is a no-op (SW_RESTORE on a visible window does nothing harmful).
$wasVisible = [FC]::IsWindowVisible($hwnd)
[FC]::ShowWindow($hwnd, 9)  | Out-Null   # SW_RESTORE (un-minimise)
[FC]::ShowWindow($hwnd, 5)  | Out-Null   # SW_SHOW
[FC]::SetForegroundWindow($hwnd) | Out-Null
# Give FortiClient time to re-render its D3D surface after un-hiding.
# A window that was already visible needs less time than one freshly restored.
$settleMs = if ($wasVisible) { 800 } else { 2500 }
Write-Host "Window shown -- settling $settleMs ms..."
Start-Sleep -Milliseconds $settleMs

# Verify window is now actually visible (Electron may re-hide it on focus)
if (-not [FC]::IsWindowVisible($hwnd)) {
  Write-Host 'Window is still hidden after ShowWindow -- trying one more time...'
  [FC]::ShowWindow($hwnd, 5)  | Out-Null
  [FC]::SetForegroundWindow($hwnd) | Out-Null
  Start-Sleep -Milliseconds 1500
}

if (-not [FC]::IsWindowVisible($hwnd)) {
  Write-Host 'FAILED: FortiClient window did not become visible.'
  Write-Host 'Click the FortiClient tray icon to open its window, then retry.'
  exit 1
}

Write-Host 'Window visible and in foreground.'

# ---- Step 3: select VPN Name from dropdown ---------------------------------
# Layout calibrated from FortiClient VPN standalone screenshot.
# The form is vertically centered in the white content area; percentages are
# relative to the total window rectangle (including title bar and blue header).
#
#  Approx layout in a ~1083x750 window:
#   y=67%  VPN Name select  (centre of the dropdown row)
#   y=72%  Username input
#   y=77%  Password input
#   y=88%  Connect button
#   x=54%  horizontal centre of all form fields

Write-Host "Selecting VPN tunnel '$VpnName'..."

# Click the VPN Name dropdown to focus and open it
Click-Pct $hwnd 0.54 0.67
Start-Sleep -Milliseconds 400

# The native Chromium <select> opens a popup listbox.
# We look for a new top-level popup window from any FortiClient PID.
$popupHwnd = [IntPtr]::Zero
$popupDl   = (Get-Date).AddSeconds(3)
while ([int64]$popupHwnd -eq 0 -and (Get-Date) -lt $popupDl) {
  Start-Sleep -Milliseconds 200
  foreach ($h in [FC]::WinsForPids($fcPids)) {
    [void][FC]::GetWindowText($h, $sb, 256)
    $t = $sb.ToString()
    # The select popup is a short untitled window -- not the main window
    if ($h -ne $hwnd -and [FC]::IsWindowVisible($h) -and ($t -eq '' -or $t -match 'Popup')) {
      $popupHwnd = $h
      Write-Host "  Select popup found: $h"
      break
    }
  }
}

if ([int64]$popupHwnd -ne 0) {
  # Popup is open -- try UIAutomation on it (native listbox IS accessible)
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  $popupRoot = $null
  try { $popupRoot = [System.Windows.Automation.AutomationElement]::FromHandle($popupHwnd) } catch {}

  $selected = $false
  if ($popupRoot) {
    $liCond = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::ListItem)
    $items = $popupRoot.FindAll([System.Windows.Automation.TreeScope]::Descendants, $liCond)
    foreach ($item in $items) {
      if ($item.Current.Name -eq $VpnName) {
        $sip = $null
        if ($item.TryGetCurrentPattern(
              [System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$sip)) {
          $sip.Select()
          $selected = $true
          Write-Host "  Selected '$VpnName' via UIAutomation."
        }
        break
      }
    }
  }

  if (-not $selected) {
    # Fallback: type first chars to jump to the option, then press Enter
    Write-Host "  UIAutomation select failed -- using keyboard type-ahead."
    $first = if ($VpnName.Length -gt 3) { $VpnName.Substring(0,3) } else { $VpnName }
    [System.Windows.Forms.SendKeys]::SendWait((Escape-SK $first))
    Start-Sleep -Milliseconds 300
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  }
} else {
  # No popup found -- dropdown may already be correct, or keyboard-only
  Write-Host "  No popup window detected -- using keyboard navigation."
  # Home -> type first chars to jump to the right item
  [System.Windows.Forms.SendKeys]::SendWait('{HOME}')
  Start-Sleep -Milliseconds 150
  $first = if ($VpnName.Length -gt 3) { $VpnName.Substring(0,3) } else { $VpnName }
  [System.Windows.Forms.SendKeys]::SendWait((Escape-SK $first))
  Start-Sleep -Milliseconds 300
}

Start-Sleep -Milliseconds 400

# ---- Step 4: fill Username -------------------------------------------------

Write-Host 'Filling Username...'
Click-Pct $hwnd 0.54 0.72
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait((Escape-SK $Username))
Start-Sleep -Milliseconds 300

# ---- Step 5: fill Password -------------------------------------------------

Write-Host 'Filling Password...'
Click-Pct $hwnd 0.54 0.77
Start-Sleep -Milliseconds 300
[System.Windows.Forms.SendKeys]::SendWait('^a')
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait((Escape-SK $Password))
Start-Sleep -Milliseconds 300

# ---- Step 6: click Connect -------------------------------------------------

Write-Host 'Clicking Connect...'
Click-Pct $hwnd 0.49 0.88
Start-Sleep -Milliseconds 500

# ---- Step 7: accept certificate popup if it appears -----------------------
# FortiClient may show an untrusted-certificate dialog. It appears as a new
# visible window from one of the FortiClient PIDs. Poll for 10s and click Yes.

Write-Host 'Watching for certificate dialog (10s)...'
$certDl      = (Get-Date).AddSeconds(10)
$certHandled = $false

while (-not $certHandled -and (Get-Date) -lt $certDl) {
  Start-Sleep -Milliseconds 600
  foreach ($h in [FC]::WinsForPids($fcPids)) {
    if ($h -eq $hwnd) { continue }
    [void][FC]::GetWindowText($h, $sb, 256)
    $t = $sb.ToString()
    if ([FC]::IsWindowVisible($h) -and ($t -match 'Certificate|Security Alert|Warning|Confirm')) {
      Write-Host "  Dialog found: '$t' -- clicking Yes/Accept."
      # Click right-center of dialog (typical Yes button position)
      $r = [FC]::WinRect($h)
      $bx = [int]($r.Left + ($r.Right - $r.Left) * 0.72)
      $by = [int]($r.Top  + ($r.Bottom - $r.Top) * 0.82)
      [FC]::SetForegroundWindow($h) | Out-Null
      Start-Sleep -Milliseconds 300
      [FC]::Click($bx, $by)
      $certHandled = $true
      break
    }
  }
}

Write-Host 'Done. Check the FortiClient window to confirm VPN is connected.'
