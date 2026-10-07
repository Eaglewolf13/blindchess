param([ValidateSet('dev', 'preview', 'check', 'assets', 'build', 'test:e2e', 'test:accounts', 'test:webkit')][string]$Task = 'dev')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $portableRoot = Join-Path (Split-Path -Parent $projectRoot) '.tools'
  $portableNode = Get-ChildItem -LiteralPath $portableRoot -Filter 'node-v*-win-x64' -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $portableNode) { throw 'Install Node.js 24 LTS, restart VS Code, and try again.' }
  $env:Path = $portableNode.FullName + ';' + $env:Path
}
if (-not (Test-Path -LiteralPath 'node_modules')) { throw 'Dependencies are missing. Run npm ci and npm run assets first.' }
if ($Task -eq 'preview') {
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
npm.cmd run $Task
exit $LASTEXITCODE
