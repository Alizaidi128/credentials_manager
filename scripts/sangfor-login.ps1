<#
  Drives Sangfor EasyConnect's login screen via simulated keystrokes, since
  the app exposes no UI Automation tree or real child windows to talk to
  directly (confirmed via inspect-window.ps1 / inspect-window-win32.ps1 —
  it renders its whole UI on one custom-drawn canvas).

  Assumes: EasyConnect is already showing its username/password screen
  (auto-navigated there after connecting to its last-used server URL), with
  the username field already focused/populated, and that pressing Tab moves
  focus to the password field, then Enter submits — all confirmed manually
  against the real app before writing this.

  Does NOT touch the username field (relies on EasyConnect's own
  remembered value) and cannot confirm actual VPN connection success —
  it can only report that the keystrokes were sent.

  Timing strategy
  ───────────────
  After the main window appears, EasyConnect makes a network request to its
  last-used VPN server URL to fetch and render the login form.  The duration
  of that request is network-dependent and cannot be detected by inspecting
  the process (the main thread stays idle while a background thread does the
  fetch).

  We use a two-phase wait:
    1. WaitForInputIdle — catches the initial window-open phase (fast).
    2. Pause 1 s so the URL fetch has time to START.
    3. WaitForInputIdle again — if the main thread was woken by UI updates
       from the background fetch it now waits for those to settle; if the
       fetch was entirely on a background thread this returns instantly.
    4. Sleep SettleDelayMs — a configurable static buffer that covers the
       remaining fetch time.  Set it to slightly longer than your VPN
       server's observed response time.  Default: 10 000 ms (10 s).

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\sangfor-login.ps1 `
      -ProcessName EasyConnect -Password "..." [-SettleDelayMs 10000]
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$ProcessName,
  [Parameter(Mandatory = $true)]
  [string]$Password,
  [int]$SettleDelayMs = 10000
)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class InputSim {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT {
        public int type;
        public KEYBDINPUT ki;
        public long padding; // pad union to the size Windows expects on x64
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    const int INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_KEYUP = 0x0002;
    const uint KEYEVENTF_UNICODE = 0x0004;
    const ushort VK_TAB = 0x09;
    const ushort VK_RETURN = 0x0D;

    static void SendOne(INPUT input) {
        SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
    }

    static INPUT Unicode(char c, bool up) {
        var input = new INPUT();
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = 0;
        input.ki.wScan = c;
        input.ki.dwFlags = KEYEVENTF_UNICODE | (up ? KEYEVENTF_KEYUP : 0);
        return input;
    }

    static INPUT Vk(ushort vk, bool up) {
        var input = new INPUT();
        input.type = INPUT_KEYBOARD;
        input.ki.wVk = vk;
        input.ki.dwFlags = up ? KEYEVENTF_KEYUP : 0;
        return input;
    }

    public static void TypeText(string text) {
        foreach (char c in text) {
            SendOne(Unicode(c, false));
            SendOne(Unicode(c, true));
            System.Threading.Thread.Sleep(20);
        }
    }

    public static void PressTab() {
        SendOne(Vk(VK_TAB, false));
        SendOne(Vk(VK_TAB, true));
    }

    public static void PressEnter() {
        SendOne(Vk(VK_RETURN, false));
        SendOne(Vk(VK_RETURN, true));
    }
}
"@

# ── Step 1: find the process ──────────────────────────────────────────────────
$proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) {
  Write-Host "no running process named '$ProcessName'."
  exit 1
}

# ── Step 2: wait for the main window handle (polls up to 15 s) ───────────────
# On a fresh launch the process exists before its window is created.
$windowDeadline = [DateTime]::Now.AddSeconds(15)
while ($proc.MainWindowHandle -eq [IntPtr]::Zero -and [DateTime]::Now -lt $windowDeadline) {
  Start-Sleep -Milliseconds 500
  $proc.Refresh()
}

if ($proc.MainWindowHandle -eq [IntPtr]::Zero) {
  Write-Host "no running process named '$ProcessName' with a visible window."
  exit 1
}

# ── Step 3: bring window to foreground ────────────────────────────────────────
[InputSim]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null  # SW_RESTORE
[InputSim]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null

# ── Step 4: phase-1 WaitForInputIdle — initial window render ─────────────────
$proc.WaitForInputIdle(5000) | Out-Null

# ── Step 5: pause so the URL fetch has time to START ─────────────────────────
# EasyConnect begins fetching the login page from the VPN server after the
# window is ready.  Without this gap the second WaitForInputIdle below would
# return immediately (before the fetch begins) because the process is still
# idle at that instant.
Start-Sleep -Milliseconds 1000

# ── Step 6: phase-2 WaitForInputIdle — URL fetch / render ────────────────────
# If EasyConnect's main thread processes the UI updates from the background
# URL fetch, this waits until those messages drain.  If the fetch is entirely
# on a background thread it returns instantly — SettleDelayMs covers the rest.
Write-Host "Waiting for EasyConnect to load the login form (up to $($SettleDelayMs / 1000) s)..."
$proc.WaitForInputIdle(([int]$SettleDelayMs)) | Out-Null

# ── Step 7: static settle buffer ─────────────────────────────────────────────
# Covers any remaining load time that WaitForInputIdle missed.
# This value equals SettleDelayMs so the total cap stays predictable.
Start-Sleep -Milliseconds $SettleDelayMs

# ── Step 8: send keystrokes ───────────────────────────────────────────────────
Write-Host "Sending keystrokes to EasyConnect login form..."
[InputSim]::PressTab()
Start-Sleep -Milliseconds 300
[InputSim]::TypeText($Password)
Start-Sleep -Milliseconds 300
[InputSim]::PressEnter()

Write-Host "Login keystrokes sent. Check the EasyConnect window to confirm the connection actually succeeded."
