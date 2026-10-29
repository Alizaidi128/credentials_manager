param(
  [Parameter(Mandatory)][string]$Version,
  [Parameter(Mandatory)][string]$Token
)

$ErrorActionPreference = "Stop"
$owner = "Alizaidi128"
$repo  = "credentials_manager"
$tag   = "v$Version"
$headers = @{ Authorization = "Bearer $Token"; Accept = "application/vnd.github+json" }
$root  = Split-Path $PSScriptRoot -Parent

Write-Host "Bumping package.json to $Version..."
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
$pkgText = [System.IO.File]::ReadAllText("$root\package.json")
$pkgText = $pkgText -replace '"version":\s*"[^"]*"', """version"": ""$Version"""
[System.IO.File]::WriteAllText("$root\package.json", $pkgText, $utf8NoBom)
Write-Host "  Done."

Write-Host "Building installer..."
Set-Location $root
$env:GH_TOKEN = $Token   # lets electron-builder embed the token in app-update.yml
npm run release
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

$exeSpace = "$root\release\Vaultier Setup $Version.exe"
$exeDash  = "$root\release\Vaultier-Setup-$Version.exe"
if (Test-Path $exeSpace) {
  $exePath = $exeSpace
} elseif (Test-Path $exeDash) {
  $exePath = $exeDash
} else {
  throw "Exe not found in release\ for version $Version"
}

$bmDash  = "$root\release\Vaultier-Setup-$Version.exe.blockmap"
$bmSpace = "$root\release\Vaultier Setup $Version.exe.blockmap"
$bmPath  = if (Test-Path $bmDash) { $bmDash } elseif (Test-Path $bmSpace) { $bmSpace } else { $null }

Write-Host "Computing sha512..."
$bytes = [System.IO.File]::ReadAllBytes($exePath)
$sha   = [System.Security.Cryptography.SHA512]::Create()
$hash  = [Convert]::ToBase64String($sha.ComputeHash($bytes))
$size  = $bytes.Length
Write-Host "  sha512: $hash"
Write-Host "  size: $size"

$date    = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$ymlPath = "$root\release\latest.yml"
$ymlContent = "version: $Version`nfiles:`n  - url: Vaultier-Setup-$Version.exe`n    sha512: $hash`n    size: $size`npath: Vaultier-Setup-$Version.exe`nsha512: $hash`nreleaseDate: '$date'"
[System.IO.File]::WriteAllText($ymlPath, $ymlContent, $utf8NoBom)
Write-Host "  Written: $ymlPath"

Write-Host "Creating or finding GitHub release $tag..."
$releaseId = $null
try {
  $existing  = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/tags/$tag" -Headers $headers
  $releaseId = $existing.id
  Write-Host "  Found release id=$releaseId - removing old assets..."
  foreach ($asset in $existing.assets) {
    Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$owner/$repo/releases/assets/$($asset.id)" -Headers $headers | Out-Null
  }
} catch {
  $body = @{ tag_name = $tag; name = $Version; body = $tag; draft = $false } | ConvertTo-Json
  $new   = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$owner/$repo/releases" -Headers $headers -ContentType "application/json" -Body $body
  $releaseId = $new.id
  Write-Host "  Created release id=$releaseId"
}

$uploadBase = "https://uploads.github.com/repos/$owner/$repo/releases/$releaseId/assets"

function Upload-File {
  param([string]$FilePath, [string]$AssetName)
  $data     = [System.IO.File]::ReadAllBytes($FilePath)
  $url      = $uploadBase + "?name=" + [uri]::EscapeDataString($AssetName)
  $sizeMb   = [math]::Round($data.Length / 1048576, 1)
  Write-Host "Uploading $AssetName - $sizeMb MB..."
  Invoke-RestMethod -Method Post -Uri $url -Headers ($headers + @{ "Content-Type" = "application/octet-stream" }) -Body $data | Out-Null
  Write-Host "  Done."
}

Upload-File -FilePath $exePath -AssetName "Vaultier-Setup-$Version.exe"
if ($bmPath) { Upload-File -FilePath $bmPath -AssetName "Vaultier-Setup-$Version.exe.blockmap" }
Upload-File -FilePath $ymlPath -AssetName "latest.yml"

Write-Host "Publishing release..."
Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$owner/$repo/releases/$releaseId" -Headers $headers -ContentType "application/json" -Body '{"draft":false,"make_latest":"true"}' | Out-Null

Write-Host "Released Vaultier $Version successfully."
