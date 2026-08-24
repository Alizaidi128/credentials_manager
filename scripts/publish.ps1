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

# ── 1. Bump version in package.json ──────────────────────────────────────────
Write-Host "Bumping package.json to $Version..."
$pkg = Get-Content "$root\package.json" -Raw | ConvertFrom-Json
$pkg.version = $Version
$pkg | ConvertTo-Json -Depth 10 | Set-Content "$root\package.json" -Encoding UTF8
Write-Host "  Done."

# ── 2. Build installer ────────────────────────────────────────────────────────
Write-Host "Building installer..."
Set-Location $root
npm run release
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

# ── 3. Locate the built exe ───────────────────────────────────────────────────
$exeSpace = "$root\release\Vaultier Setup $Version.exe"
$exeDash  = "$root\release\Vaultier-Setup-$Version.exe"
if (Test-Path $exeSpace) {
  $exePath = $exeSpace
} elseif (Test-Path $exeDash) {
  $exePath = $exeDash
} else {
  throw "Exe not found in release\ for version $Version"
}

$bmSpace = "$root\release\Vaultier Setup $Version.exe.blockmap"
$bmDash  = "$root\release\Vaultier-Setup-$Version.exe.blockmap"
$bmPath  = if (Test-Path $bmDash) { $bmDash } elseif (Test-Path $bmSpace) { $bmSpace } else { $null }

# ── 4. Compute sha512 and size from actual exe ────────────────────────────────
Write-Host "Computing sha512..."
$bytes  = [System.IO.File]::ReadAllBytes($exePath)
$sha    = [System.Security.Cryptography.SHA512]::Create()
$hash   = [Convert]::ToBase64String($sha.ComputeHash($bytes))
$size   = $bytes.Length
Write-Host "  sha512 : $hash"
Write-Host "  size   : $size bytes"

# ── 5. Write latest.yml ───────────────────────────────────────────────────────
$date     = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$ymlPath  = "$root\release\latest.yml"
@"
version: $Version
files:
  - url: Vaultier-Setup-$Version.exe
    sha512: $hash
    size: $size
path: Vaultier-Setup-$Version.exe
sha512: $hash
releaseDate: '$date'
"@ | Set-Content $ymlPath -Encoding UTF8
Write-Host "  Written: $ymlPath"

# ── 6. Create GitHub release (or find existing draft) ────────────────────────
Write-Host "Creating GitHub release $tag..."
$releaseId = $null
try {
  $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$owner/$repo/releases/tags/$tag" -Headers $headers
  $releaseId = $existing.id
  Write-Host "  Found existing release id=$releaseId — deleting assets..."
  foreach ($asset in $existing.assets) {
    Invoke-RestMethod -Method Delete -Uri "https://api.github.com/repos/$owner/$repo/releases/assets/$($asset.id)" -Headers $headers | Out-Null
  }
} catch {
  $body = @{ tag_name = $tag; name = $Version; body = "$tag"; draft = $false; make_latest = "true" } | ConvertTo-Json
  $new = Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$owner/$repo/releases" -Headers $headers -ContentType "application/json" -Body $body
  $releaseId = $new.id
  Write-Host "  Created release id=$releaseId"
}

$uploadBase = "https://uploads.github.com/repos/$owner/$repo/releases/$releaseId/assets"

# ── 7. Upload assets ──────────────────────────────────────────────────────────
function Upload($filePath, $assetName) {
  $data = [System.IO.File]::ReadAllBytes($filePath)
  $url  = "${uploadBase}?name=$([uri]::EscapeDataString($assetName))"
  Write-Host "Uploading $assetName ($([math]::Round($data.Length/1MB,1)) MB)..."
  Invoke-RestMethod -Method Post -Uri $url -Headers ($headers + @{ "Content-Type" = "application/octet-stream" }) -Body $data | Out-Null
  Write-Host "  Done."
}

Upload $exePath "Vaultier-Setup-$Version.exe"
if ($bmPath) { Upload $bmPath "Vaultier-Setup-$Version.exe.blockmap" }
Upload $ymlPath "latest.yml"

# ── 8. Publish release ────────────────────────────────────────────────────────
Write-Host "Publishing release..."
Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$owner/$repo/releases/$releaseId" -Headers $headers -ContentType "application/json" -Body '{"draft":false,"make_latest":"true"}' | Out-Null

Write-Host ""
Write-Host "Released Vaultier $Version successfully."
