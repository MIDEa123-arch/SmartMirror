#pragma once

// Copy this file to smartmirror_secrets.h for esp32dev-hardware.
// Use a private MQTT broker in the same trusted LAN as the ESP32 and Node-RED.
#define SMARTMIRROR_WIFI_SSID ""
#define SMARTMIRROR_WIFI_PASSWORD ""
#define SMARTMIRROR_MQTT_HOST ""
#define SMARTMIRROR_MQTT_PORT 1883
#define SMARTMIRROR_MQTT_USER ""
#define SMARTMIRROR_MQTT_PASSWORD ""

// GPIO19 drives the input of the backlight driver. Set to 0 for active-low logic.
#define SMARTMIRROR_BACKLIGHT_ACTIVE_HIGH 1
