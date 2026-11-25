#pragma once

// Copy this file to smartmirror_secrets.h for esp32dev-hardware.
// Port 8883 requires TLS; the default CA is for broker.emqx.io.
#define SMARTMIRROR_WIFI_SSID ""
#define SMARTMIRROR_WIFI_PASSWORD ""
#define SMARTMIRROR_MQTT_HOST ""
#define SMARTMIRROR_MQTT_PORT 8883
#define SMARTMIRROR_MQTT_USER ""
#define SMARTMIRROR_MQTT_PASSWORD ""
// For another broker, set this to its root CA PEM string. Never disable validation.
// #define SMARTMIRROR_MQTT_CA_CERT "-----BEGIN CERTIFICATE-----\\n...\\n-----END CERTIFICATE-----\\n"

// GPIO19 drives the input of the backlight driver. Set to 0 for active-low logic.
#define SMARTMIRROR_BACKLIGHT_ACTIVE_HIGH 1
