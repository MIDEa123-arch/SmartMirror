param([int]$Port = 1881, [switch]$Lan, [switch]$ReloadFlow)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimePath = Join-Path $projectRoot '.runtime'
New-Item -ItemType Directory -Force $runtimePath | Out-Null
$modulePath = Join-Path $runtimePath 'node_modules'
$existingModules = Join-Path $env:USERPROFILE '.node-red\node_modules'
if (!(Test-Path (Join-Path $modulePath '@flowfuse\node-red-dashboard'))) {
    if (Test-Path (Join-Path $existingModules '@flowfuse\node-red-dashboard')) {
        if (!(Test-Path $modulePath)) { New-Item -ItemType Junction -Path $modulePath -Target $existingModules | Out-Null }
    } else {
        & npm.cmd install --prefix $runtimePath '@flowfuse/node-red-dashboard@1.34.0'
        if ($LASTEXITCODE -ne 0) { throw 'Dashboard installation failed' }
    }
}
Push-Location $projectRoot
try {
    if (!(Test-Path (Join-Path $projectRoot 'flows.json'))) { throw 'flows.json is missing; run node scripts/build-dashboard.cjs' }
    $runtimeFlow = Join-Path $runtimePath 'flows.json'
    if ($ReloadFlow -or !(Test-Path $runtimeFlow)) {
        Copy-Item -LiteralPath (Join-Path $projectRoot 'flows.json') -Destination $runtimeFlow
    }
    $previousBind = $env:SMARTMIRROR_HOST
    $env:SMARTMIRROR_HOST = if ($Lan) { '0.0.0.0' } else { '127.0.0.1' }
    Write-Host "Mirror: http://localhost:$Port/dashboard/guong"
    Write-Host "Controls: http://localhost:$Port/dashboard/guong-thong-minh"
    & node-red.cmd --no-telemetry --userDir $runtimePath --settings (Join-Path $projectRoot 'node-red\settings.cjs') --port $Port
} finally {
    $env:SMARTMIRROR_HOST = $previousBind
    Pop-Location
}
