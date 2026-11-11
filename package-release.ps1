<#
.SYNOPSIS
Empacota o módulo t20-compendios-completos para publicação via GitHub Releases.

.DESCRIPTION
Valida module.json e os arquivos declarados, cria uma cópia limpa em pasta temporária
(excluindo arquivos LOCK do LevelDB, .git, dist, docs e arquivos temporários) e gera
dist/t20-compendios-completos.zip e dist/module.json prontos para anexo em uma Release.
#>

[CmdletBinding()]
param(
  [string]$OutDir = "dist"
)

$ErrorActionPreference = "Stop"
$ModuleRoot = $PSScriptRoot
Set-Location $ModuleRoot

$manifestPath = Join-Path $ModuleRoot "module.json"
if (-not (Test-Path $manifestPath)) {
  throw "module.json não encontrado em $ModuleRoot"
}

$manifest = Get-Content -Path $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$moduleId = $manifest.id
$version = $manifest.version

if ([string]::IsNullOrWhiteSpace($moduleId) -or [string]::IsNullOrWhiteSpace($version)) {
  throw "module.json precisa definir 'id' e 'version'."
}

# Valida que todos os arquivos declarados em esmodules, styles e languages existem
$declaredPaths = @()
if ($manifest.esmodules) { $declaredPaths += $manifest.esmodules }
if ($manifest.styles) { $declaredPaths += $manifest.styles }
if ($manifest.languages) { $declaredPaths += ($manifest.languages | ForEach-Object { $_.path }) }

foreach ($relPath in $declaredPaths) {
  $fullPath = Join-Path $ModuleRoot $relPath
  if (-not (Test-Path $fullPath)) {
    throw "Arquivo declarado em module.json não encontrado: $relPath"
  }
}

$outFullDir = if ([System.IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $ModuleRoot $OutDir }
New-Item -ItemType Directory -Force -Path $outFullDir | Out-Null

$zipPath = Join-Path $outFullDir "$moduleId.zip"
$distManifestPath = Join-Path $outFullDir "module.json"

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
if (Test-Path $distManifestPath) { Remove-Item $distManifestPath -Force }

$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("t20-release-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

try {
  $includeFiles = @("module.json", "LICENSE", "README.md", "CHANGELOG.md", "DESIGN.md")
  foreach ($fileName in $includeFiles) {
    $srcFile = Join-Path $ModuleRoot $fileName
    if (Test-Path $srcFile) {
      Copy-Item -Path $srcFile -Destination (Join-Path $stageRoot $fileName) -Force
    }
  }

  $includeDirs = @("lang", "packs", "scripts", "styles", "templates")
  foreach ($dirName in $includeDirs) {
    $srcDir = Join-Path $ModuleRoot $dirName
    if (-not (Test-Path $srcDir)) {
      throw "Diretório obrigatório não encontrado: $dirName"
    }

    $destDir = Join-Path $stageRoot $dirName
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null

    Get-ChildItem -Path $srcDir -Recurse -Force | ForEach-Object {
      if ($_.Name -eq "LOCK" -or $_.Name -like "*.bak" -or $_.Name -eq "Thumbs.db" -or $_.Name -eq ".DS_Store") {
        return
      }
      $relative = $_.FullName.Substring($srcDir.Length).TrimStart('\', '/')
      $target = Join-Path $destDir $relative
      if ($_.PSIsContainer) {
        New-Item -ItemType Directory -Force -Path $target | Out-Null
      } else {
        $parent = Split-Path -Path $target -Parent
        if (-not (Test-Path $parent)) {
          New-Item -ItemType Directory -Force -Path $parent | Out-Null
        }
        Copy-Item -Path $_.FullName -Destination $target -Force
      }
    }
  }

  $lockHits = Get-ChildItem -Path $stageRoot -Recurse -Force -Filter "LOCK"
  if ($lockHits.Count -gt 0) {
    throw "Arquivos LOCK detectados no staging; remova/feche o Foundry antes de empacotar."
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stageRoot,
    $zipPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
  )

  Copy-Item -Path $manifestPath -Destination $distManifestPath -Force

  $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $entryCount = $archive.Entries.Count
    $hasRootManifest = $archive.Entries.FullName -contains "module.json"
  } finally {
    $archive.Dispose()
  }

  if (-not $hasRootManifest) {
    throw "Validação falhou: module.json não está na raiz de $zipPath"
  }

  $zipSizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
  Write-Host "Release empacotada com sucesso:" -ForegroundColor Green
  Write-Host "  Módulo : $moduleId v$version"
  Write-Host "  Zip    : $zipPath ($zipSizeMB MB, $entryCount arquivos)"
  Write-Host "  Manifesto: $distManifestPath"
} finally {
  if (Test-Path $stageRoot) {
    Remove-Item -Path $stageRoot -Recurse -Force
  }
}
