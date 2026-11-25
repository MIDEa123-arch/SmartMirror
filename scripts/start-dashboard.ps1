param(
    [int]$Port = 1881,
    [string]$SerialPort,
    [switch]$ReloadFlow,
    [switch]$PrivateMqtt
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimePath = Join-Path $projectRoot '.runtime'
$tlsPath = Join-Path $runtimePath 'tls'
New-Item -ItemType Directory -Force $runtimePath | Out-Null
$modulePath = Join-Path $runtimePath 'node_modules'
$dashboardModule = Join-Path $modulePath '@flowfuse\node-red-dashboard'
$serialModule = Join-Path $modulePath 'node-red-node-serialport'
if (!(Test-Path $dashboardModule) -or !(Test-Path (Join-Path $modulePath 'selfsigned')) -or ($SerialPort -and !(Test-Path $serialModule))) {
    & npm.cmd install --prefix $runtimePath '@flowfuse/node-red-dashboard@1.34.0' 'node-red-node-serialport' 'selfsigned@5.5.0'
    if ($LASTEXITCODE -ne 0) { throw 'Required local Node-RED modules could not be installed.' }
}
& node.exe scripts/ensure-local-cert.cjs
if ($LASTEXITCODE -ne 0) { throw 'Local HTTPS certificate setup failed.' }
$tokenFile = Join-Path $runtimePath 'app-pairing-code.txt'
function New-LocalSecret {
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $bytes = New-Object byte[] 32
    $random.GetBytes($bytes)
    $random.Dispose()
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
if (!(Test-Path $tokenFile)) {
    $token = New-LocalSecret
    [IO.File]::WriteAllText($tokenFile, $token, [Text.Encoding]::ASCII)
} else {
    $token = [IO.File]::ReadAllText($tokenFile).Trim()
}
$editorPasswordFile = Join-Path $runtimePath 'editor-password.txt'
if (!(Test-Path $editorPasswordFile)) {
    [IO.File]::WriteAllText($editorPasswordFile, (New-LocalSecret), [Text.Encoding]::ASCII)
}
$editorPassword = [IO.File]::ReadAllText($editorPasswordFile).Trim()
$globalModules = (npm.cmd root -g).Trim()
$bcryptPath = Join-Path $globalModules 'node-red\node_modules\bcryptjs'
if (!(Test-Path $bcryptPath)) { throw 'Node-RED bcryptjs module was not found; install Node-RED globally before starting.' }

Push-Location $projectRoot
try {
    if ($SerialPort) { $env:SMARTMIRROR_SERIAL_PORT = $SerialPort } else { Remove-Item Env:\SMARTMIRROR_SERIAL_PORT -ErrorAction SilentlyContinue }
    $runtimeFlow = Join-Path $runtimePath 'flows.json'
    if ($PrivateMqtt) {
        if (!(Test-Path (Join-Path $runtimePath 'mosquitto\smartmirror-mqtt.json'))) { throw 'Run scripts/setup-private-mqtt.cjs first.' }
        $env:SMARTMIRROR_MQTT_MODE = 'private'
        $env:SMARTMIRROR_FLOW_OUTPUT = $runtimeFlow
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-private-mqtt.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'Private MQTT broker could not be started.' }
    } else {
        Remove-Item Env:\SMARTMIRROR_MQTT_MODE -ErrorAction SilentlyContinue
        Remove-Item Env:\SMARTMIRROR_FLOW_OUTPUT -ErrorAction SilentlyContinue
    }
    & node.exe scripts/build-dashboard.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Flow generation failed.' }
    if (!(Test-Path (Join-Path $projectRoot 'flows.json'))) { throw 'flows.json was not generated.' }
    if (!$PrivateMqtt -and ($ReloadFlow -or !(Test-Path $runtimeFlow))) {
        Copy-Item -LiteralPath (Join-Path $projectRoot 'flows.json') -Destination $runtimeFlow
    }
    $previousBind = $env:SMARTMIRROR_HOST
    $previousPort = $env:PORT
    $previousToken = $env:SMARTMIRROR_API_TOKEN
    $previousAdminPassword = $env:SMARTMIRROR_EDITOR_PASSWORD
    $previousBcryptPath = $env:SMARTMIRROR_BCRYPTJS_PATH
    $previousMqttMode = $env:SMARTMIRROR_MQTT_MODE
    $previousFlowOutput = $env:SMARTMIRROR_FLOW_OUTPUT
    $env:SMARTMIRROR_HOST = '127.0.0.1'
    $env:PORT = [string]$Port
    $env:SMARTMIRROR_API_TOKEN = $token
    $env:SMARTMIRROR_EDITOR_PASSWORD = $editorPassword
    $env:SMARTMIRROR_BCRYPTJS_PATH = $bcryptPath

    $adbCandidates = @(
        (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'),
        'D:\Download\platform-tools-latest-windows\platform-tools\adb.exe'
    )
    $adb = (Get-Command adb.exe -ErrorAction SilentlyContinue).Source
    if (!$adb) { $adb = $adbCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1 }
    if ($adb) {
        $devices = & $adb devices
        foreach ($line in ($devices | Select-Object -Skip 1)) {
            if ($line -match '^(\S+)\s+device$') {
                & $adb -s $Matches[1] reverse "tcp:$Port" "tcp:$Port" | Out-Null
                Write-Host "USB reverse ready for Android device $($Matches[1]) on port $Port."
            }
        }
    }

    Write-Host "Local secure service: https://127.0.0.1:$Port"
    Write-Host "App pairing code: $token"
    Write-Host "Optional editor sign-in: admin / $editorPassword"
    if ($SerialPort) { Write-Host "ESP32 USB/COM port: $SerialPort at 115200 baud." }
    else { Write-Host 'ESP32 serial bridge is off; use -SerialPort COMx when the ESP32 is connected by USB.' }
    Write-Host "Web fallback: https://127.0.0.1:$Port/dashboard/guong-thong-minh"
    Write-Host 'Keep this terminal open while using the phone app.'
    if ($PrivateMqtt) {
        $nodeRedPath = Join-Path $globalModules 'node-red\red.js'
        $runtimeLog = Join-Path $runtimePath 'node-red-private.log'
        $runtimeErr = Join-Path $runtimePath 'node-red-private.err'
        $nodeRedProcess = Start-Process -FilePath 'node.exe' -ArgumentList @($nodeRedPath,'--no-telemetry','--userDir',$runtimePath,'--settings',(Join-Path $projectRoot 'node-red\settings.cjs'),'--port',[string]$Port) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $runtimeLog -RedirectStandardError $runtimeErr -PassThru
        try {
            & node.exe scripts/deploy-private-mqtt-flow.cjs
            if ($LASTEXITCODE -ne 0) { throw 'Node-RED could not install the encrypted private broker credentials.' }
            Write-Host 'Private MQTT/TLS and calendar backend are running. Press Ctrl+C to stop Node-RED.'
            while (!$nodeRedProcess.HasExited) { Start-Sleep -Seconds 1 }
            Get-Content $runtimeLog -Tail 30 -ErrorAction SilentlyContinue
            Get-Content $runtimeErr -Tail 20 -ErrorAction SilentlyContinue
        } finally {
            if (!$nodeRedProcess.HasExited) { Stop-Process -Id $nodeRedProcess.Id -Force }
        }
    } else {
        & node-red.cmd --no-telemetry --userDir $runtimePath --settings (Join-Path $projectRoot 'node-red\settings.cjs') --port $Port
    }
} finally {
    $env:SMARTMIRROR_HOST = $previousBind
    $env:PORT = $previousPort
    $env:SMARTMIRROR_API_TOKEN = $previousToken
    $env:SMARTMIRROR_EDITOR_PASSWORD = $previousAdminPassword
    $env:SMARTMIRROR_BCRYPTJS_PATH = $previousBcryptPath
    $env:SMARTMIRROR_MQTT_MODE = $previousMqttMode
    $env:SMARTMIRROR_FLOW_OUTPUT = $previousFlowOutput
    Remove-Item Env:\SMARTMIRROR_SERIAL_PORT -ErrorAction SilentlyContinue
    Pop-Location
}
