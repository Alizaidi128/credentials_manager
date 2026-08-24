param(
  [Parameter(Mandatory)][string]$Version,
  [Parameter(Mandatory)][string]$Token
)

$owner = "Alizaidi128"
$repo  = "credentials_manager"
$tag   = "v$Version"
$headers = @{ Authorization = "Bearer $Token"; Accept = "application/vnd.github+json" }

Write-Host "Looking up release $tag..."
$release    = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/tags/$tag" -Headers $headers
$releaseId  = $release.id
$uploadBase = $release.upload_url -replace '\{.*\}', ''
Write-Host "Found release id=$releaseId"

foreach ($asset in $release.assets) {
  Write-Host "Deleting: $($asset.name)"
  Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$owner/$repo/releases/assets/$($asset.id)" -Headers $headers | Out-Null
}

function Upload-Asset([string]$filePath, [string]$assetName) {
  if (-not (Test-Path $filePath)) { Write-Error "Not found: $filePath"; return }
  $bytes = [System.IO.File]::ReadAllBytes($filePath)
  $url   = "${uploadBase}?name=$([uri]::EscapeDataString($assetName))"
  Write-Host "Uploading $assetName ($([math]::Round($bytes.Length/1MB,1)) MB)..."
  Invoke-RestMethod -Method Post -Uri $url -Headers ($headers + @{ "Content-Type" = "application/octet-stream" }) -Body $bytes | Out-Null
  Write-Host "  Done."
}

$dir = Join-Path $PSScriptRoot "..\release"
$exeDash  = Join-Path $dir "Vaultier-Setup-$Version.exe"
$exeSpace = Join-Path $dir "Vaultier Setup $Version.exe"
$exePath  = if (Test-Path $exeDash) { $exeDash } elseif (Test-Path $exeSpace) { $exeSpace } else { $null }
if (-not $exePath) { Write-Error "Exe not found in release\"; exit 1 }

$bmDash  = Join-Path $dir "Vaultier-Setup-$Version.exe.blockmap"
$bmSpace = Join-Path $dir "Vaultier Setup $Version.exe.blockmap"
$bmPath  = if (Test-Path $bmDash) { $bmDash } elseif (Test-Path $bmSpace) { $bmSpace } else { $null }

Upload-Asset $exePath "Vaultier-Setup-$Version.exe"
if ($bmPath) { Upload-Asset $bmPath "Vaultier-Setup-$Version.exe.blockmap" }
Upload-Asset "$dir\latest.yml" "latest.yml"

Write-Host "Publishing release..."
Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$owner/$repo/releases/$releaseId" -Headers $headers -ContentType "application/json" -Body '{"draft":false,"make_latest":"true"}' | Out-Null
Write-Host "Done. Release v$Version published."
