#pragma once

#include <Arduino.h>

constexpr uint8_t DISPLAY_PAGE_COUNT = 3;
constexpr size_t DISPLAY_DATA_LIMIT = 640;

struct DisplayStatus
{
  float temperature;
  float humidity;
  bool sensorFresh;
  bool lampOn;
  bool online;
};

void beginMirrorDisplay();
void sleepMirrorDisplay();
void setMirrorBacklight(uint8_t brightness);
void showMirrorDisplay(uint8_t page, const DisplayStatus &status);
bool receiveMirrorContent(const String &payload);
