param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$brokerPath = Join-Path $projectRoot '.runtime\mosquitto'
$exe = Join-Path $brokerPath 'mosquitto.exe'
$config = Join-Path $brokerPath 'mosquitto.conf'
$stdout = Join-Path $brokerPath 'process.out.log'
$stderr = Join-Path $brokerPath 'process.err.log'
if (!(Test-Path $exe) -or !(Test-Path $config)) { throw 'Run scripts/setup-private-mqtt.cjs first.' }
$listener = Get-NetTCPConnection -LocalPort 8883 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener -and $Restart) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
    if (!$owner -or $owner.CommandLine -notlike "*$exe*" -or $owner.CommandLine -notlike "*$config*") {
        throw 'Port 8883 is used by another process; it was left running.'
    }
    Stop-Process -Id $listener.OwningProcess -Force
    Start-Sleep -Milliseconds 500
    $listener = $null
}
if (!$listener) {
    Start-Process -FilePath $exe -ArgumentList @('-c', $config) -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    for ($i=0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 250
        $listener = Get-NetTCPConnection -LocalPort 8883 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($listener) { break }
    }
}
if (!$listener) { Get-Content $stdout -Tail 20 -ErrorAction SilentlyContinue; Get-Content $stderr -Tail 20 -ErrorAction SilentlyContinue; throw 'Mosquitto did not open TLS port 8883.' }
Write-Host 'Private Mosquitto is listening on TLS port 8883.'
