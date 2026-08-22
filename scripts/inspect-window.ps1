<#
  One-time diagnostic tool: dumps the full UI Automation control tree of a
  running application's window(s) — control type, Name, AutomationId,
  ClassName — so we can write real UI-automation logic (fill fields, click
  buttons) against actual control identifiers instead of guessing them.

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\inspect-window.ps1 -ProcessName EasyConnect

  Run it AFTER the target window is showing the fields you want to inspect
  (e.g. once EasyConnect is asking for username/password), then paste the
  full output back.
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$ProcessName
)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$proc = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) {
  Write-Host "No running process named '$ProcessName' was found. Start it first, then re-run this script."
  exit 1
}

function Dump-Tree($element, $depth) {
  if ($null -eq $element) { return }
  $indent = "  " * $depth
  $ct = $element.Current.ControlType.ProgrammaticName
  $name = $element.Current.Name
  $autoId = $element.Current.AutomationId
  $className = $element.Current.ClassName
  $enabled = $element.Current.IsEnabled
  $value = ""
  try {
    $valuePattern = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    $value = " Value='$($valuePattern.Current.Value)'"
  } catch {}
  Write-Host "$indent[$ct] Name='$name' AutomationId='$autoId' Class='$className' Enabled=$enabled$value"

  $children = $element.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    [System.Windows.Automation.Condition]::TrueCondition
  )
  foreach ($child in $children) {
    Dump-Tree $child ($depth + 1)
  }
}

$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $proc.Id
)
$windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)

if ($windows.Count -eq 0) {
  Write-Host "No top-level window found for process '$ProcessName' (PID $($proc.Id)). Is it minimized to tray only?"
  exit 1
}

foreach ($win in $windows) {
  Write-Host "=== Window: '$($win.Current.Name)' ==="
  Dump-Tree $win 0
  Write-Host ""
}
