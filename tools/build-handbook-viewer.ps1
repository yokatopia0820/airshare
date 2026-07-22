[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
& node (Join-Path $PSScriptRoot 'build-handbook-viewer-data.mjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'Handbook viewer data and evidence pages were updated.'
