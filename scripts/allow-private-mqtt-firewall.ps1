$ErrorActionPreference = 'Stop'
$ruleName = 'SmartMirror-Mosquitto-TLS-8883'
if (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) {
    Remove-NetFirewallRule -Name $ruleName
}
if (Get-Service -Name mosquitto -ErrorAction SilentlyContinue) {
    Stop-Service -Name mosquitto -Force -ErrorAction SilentlyContinue
    Set-Service -Name mosquitto -StartupType Manual
}
New-NetFirewallRule -Name $ruleName -DisplayName 'SmartMirror · Mosquitto TLS (local subnet)' `
    -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8883 `
    -RemoteAddress LocalSubnet -Profile Any | Out-Null
Write-Host 'Allowed MQTT/TLS 8883 from the directly connected local subnet only.'
