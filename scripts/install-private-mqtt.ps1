$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimePath = Join-Path $projectRoot '.runtime'
$brokerPath = Join-Path $runtimePath 'mosquitto'
$installer = Join-Path $runtimePath 'mosquitto-installer.exe'
New-Item -ItemType Directory -Force $runtimePath | Out-Null

if (!(Test-Path (Join-Path $brokerPath 'mosquitto.exe'))) {
    if (!(Test-Path $installer)) {
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -Uri 'https://mosquitto.org/files/binary/win64/mosquitto-2.1.4-install-windows-x64.exe' -OutFile $installer
    }
    $process = Start-Process -FilePath $installer -ArgumentList @('/S',"/D=$brokerPath") -Wait -PassThru
    if ($process.ExitCode -ne 0 -or !(Test-Path (Join-Path $brokerPath 'mosquitto.exe'))) {
        throw 'Mosquitto installation failed. Re-run the official installer with Windows Administrator permission if prompted.'
    }
}

& npm.cmd install --prefix $runtimePath 'selfsigned@5.5.0'
if ($LASTEXITCODE -ne 0) { throw 'Could not install the certificate generation dependency.' }
Write-Host "Mosquitto and certificate tools are ready in $brokerPath. Next: node scripts/setup-private-mqtt.cjs <laptop-Wi-Fi-IPv4>"
