#pragma once

#include <Arduino.h>

constexpr uint8_t DISPLAY_PAGE_COUNT = 3;
constexpr size_t DISPLAY_DATA_LIMIT = 640;

struct DisplayStatus
{
  DisplayStatus(float temperature = 0, float humidity = 0, bool sensorFresh = false,
                bool lampOn = false, bool online = false)
      : temperature(temperature), humidity(humidity), sensorFresh(sensorFresh),
        lampOn(lampOn), online(online) {}

  float temperature;
  float humidity;
  bool sensorFresh;
  bool lampOn;
  bool online;
  bool debug = false;
  int distanceMm = -1;
  int lightRaw = -1;
  bool dark = false;
  bool motion = false;
  bool controllerConnected = true;
};

void beginMirrorDisplay();
void sleepMirrorDisplay();
void setMirrorBacklight(uint8_t brightness);
void showMirrorDisplay(uint8_t page, const DisplayStatus &status);
bool receiveMirrorContent(const String &payload);
