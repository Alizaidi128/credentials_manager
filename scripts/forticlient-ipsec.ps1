param(
  [Parameter(Mandatory)][string]$TunnelName,
  [Parameter(Mandatory)][string]$Username,
  [Parameter(Mandatory)][string]$Password
)

$ErrorActionPreference = "Stop"

Write-Host "Connecting to '$TunnelName' via FortiClient COM API..."

try {
  $vpn = New-Object -ComObject "FCCOMInt.XVPN.1"
} catch {
  Write-Host "ERROR: Could not load FortiClient COM interface. Is FortiClient installed?"
  exit 1
}

$vpn.Connect($TunnelName)
Write-Host "Sending XAuth credentials..."
Start-Sleep -Seconds 2
$vpn.SendXAuthResponse($TunnelName, $Username, $Password, $false)
Write-Host "Polling for connection..."

for ($i = 1; $i -le 30; $i++) {
  Start-Sleep -Seconds 1
  if ($vpn.IsConnected($TunnelName)) {
    Write-Host "Connected to '$TunnelName'."
    exit 0
  }
  Write-Host "Waiting... ($i/30)"
}

Write-Host "ERROR: Tunnel '$TunnelName' did not come up within 30s."
exit 1
