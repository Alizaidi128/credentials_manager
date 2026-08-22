<#
  Diagnostic: dumps the UI Automation tree of the Windows taskbar's
  notification area (system tray), including the hidden-icons overflow
  flyout if it can be opened, so we can find the real Name/AutomationId of
  a specific tray icon (e.g. EasyConnect) without guessing.

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\inspect-tray.ps1
#>

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Dump-Tree($element, $depth, $maxDepth) {
  if ($null -eq $element -or $depth -gt $maxDepth) { return }
  $indent = "  " * $depth
  $ct = $element.Current.ControlType.ProgrammaticName
  $name = $element.Current.Name
  $autoId = $element.Current.AutomationId
  $className = $element.Current.ClassName
  $rect = $element.Current.BoundingRectangle
  Write-Host "$indent[$ct] Name='$name' AutomationId='$autoId' Class='$className' Rect=$rect"

  $children = $element.FindAll(
    [System.Windows.Automation.TreeScope]::Children,
    [System.Windows.Automation.Condition]::TrueCondition
  )
  foreach ($child in $children) {
    Dump-Tree $child ($depth + 1) $maxDepth
  }
}

$root = [System.Windows.Automation.AutomationElement]::RootElement
$trayCondition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ClassNameProperty, "Shell_TrayWnd"
)
$taskbar = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $trayCondition)

if ($null -eq $taskbar) {
  Write-Host "Could not find the taskbar (Shell_TrayWnd)."
  exit 1
}

Write-Host "=== Taskbar / visible tray icons ==="
Dump-Tree $taskbar 0 8

# Try the "Show hidden icons" overflow flyout too, in case EasyConnect's
# icon lives there instead of the always-visible tray.
$overflowCondition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::ClassNameProperty, "TopLevelWindowForOverflowXamlIsland"
)
$overflow = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $overflowCondition)
if ($overflow) {
  Write-Host ""
  Write-Host "=== Hidden-icons overflow flyout (already open) ==="
  Dump-Tree $overflow 0 8
} else {
  Write-Host ""
  Write-Host "(Hidden-icons overflow flyout not currently open - click the chevron on the taskbar first, then re-run this script, if EasyConnect's icon isn't shown above.)"
}
