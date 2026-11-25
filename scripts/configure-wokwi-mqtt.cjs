// Select the MQTT broker for the local Wokwi build. Rebuild esp32dev after changing it.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {X509Certificate} = require('node:crypto');

const root = path.resolve(__dirname, '..');
const header = path.join(root, 'include', 'smartmirror_wokwi_private.h');
const mode = process.argv[2];

if (mode === 'public') {
  fs.rmSync(header, {force: true});
  console.log('Wokwi build will use the public EMQX broker.');
} else if (mode === 'private') {
  const brokerDir = path.join(root, '.runtime', 'mosquitto');
  const {host, port, username, password} = JSON.parse(
    fs.readFileSync(path.join(brokerDir, 'smartmirror-mqtt.json'), 'utf8')
  );
  const certificate = new X509Certificate(fs.readFileSync(path.join(brokerDir, 'certs', 'server.crt')));
  const gatewayHost = 'host.wokwi.internal';
  if (!net.isIPv4(host) || port !== 8883 || !certificate.checkIP(host) ||
      !certificate.checkHost(gatewayHost) ||
      typeof username !== 'string' || !username || typeof password !== 'string' || !password) {
    throw new Error('Run setup-private-mqtt.cjs with the current laptop Wi-Fi IPv4 first.');
  }
  fs.writeFileSync(header, [
    '#pragma once',
    '#include "mosquitto_local_ca.h"',
    '#define SMARTMIRROR_MQTT_CA_CERT MOSQUITTO_LOCAL_CA_CERT',
    '#define SMARTMIRROR_WOKWI_MQTT_HOST ' + JSON.stringify(gatewayHost),
    '#define SMARTMIRROR_WOKWI_MQTT_USER ' + JSON.stringify(username),
    '#define SMARTMIRROR_WOKWI_MQTT_PASSWORD ' + JSON.stringify(password),
    '',
  ].join('\n'));
  console.log('Wokwi VS Code build will use the private Mosquitto broker at ' + gatewayHost + ':' + port);
} else {
  throw new Error('Usage: node scripts/configure-wokwi-mqtt.cjs private|public');
}
