#ifdef SMARTMIRROR_PANEL_S3
#include "mirror_display.h"
#include <ArduinoJson.h>
#include <math.h>
#include <sys/time.h>

bool readPanelTouch(int32_t &x, int32_t &y);
namespace {
HardwareSerial sensorUart(1);
String line;
bool overflow = false;
bool awake = false;
bool tracking = false;
int32_t firstX, lastX;
uint32_t lastState;

void sleepPanel()
{
  awake = false;
  tracking = false;
#ifdef SMARTMIRROR_HARDWARE_DEBUG
  DisplayStatus status{};
  status.debug = true;
  status.controllerConnected = false;
  showMirrorDisplay(0, status);
  setMirrorBacklight(180);
#else
  sleepMirrorDisplay();
#endif
}

void receiveLine()
{
  if (line == "S") { sleepPanel(); return; }
  if (line.startsWith("C")) { receiveMirrorContent(line.substring(1)); return; }
  if (!line.startsWith("D")) return;
  JsonDocument d;
  if (deserializeJson(d, line.c_str() + 1) || !d["bl"].is<uint8_t>() ||
      !d["page"].is<uint8_t>() || d["page"].as<int>() >= DISPLAY_PAGE_COUNT) return;
  const long utc = d["time"] | 0L;
  if (utc >= 1700000000 && utc <= 2140000000 && fabs(difftime(utc, time(nullptr))) > 2) {
    timeval clock = {utc, 0};
    settimeofday(&clock, nullptr);
  }
  lastState = millis();
  awake = true;
  DisplayStatus status{d["t"] | 0.f, d["h"] | 0.f, d["fresh"] | false,
                       d["lamp"] | false, d["online"] | false};
  status.debug = d["debug"] | false;
  status.distanceMm = d["mm"] | -1;
  status.lightRaw = d["ao"] | -1;
  status.dark = d["do"] | false;
  status.motion = d["pir"] | false;
  showMirrorDisplay(d["page"], status);
  setMirrorBacklight(d["bl"]);
}
}

void setup()
{
  Serial.begin(115200);
  sensorUart.setRxBufferSize(2048);
  sensorUart.begin(115200, SERIAL_8N1, 44, 43);
  line.reserve(DISPLAY_DATA_LIMIT + 1);
  beginMirrorDisplay();
#ifdef SMARTMIRROR_HARDWARE_DEBUG
  sleepPanel();
#endif
}

void loop()
{
  while (sensorUart.available()) {
    const char c = sensorUart.read();
    if (c == '\n') {
      if (!overflow) receiveLine();
      line = "";
      overflow = false;
    } else if (line.length() < DISPLAY_DATA_LIMIT + 1) line += c;
    else overflow = true;
  }
  if (awake && millis() - lastState >= 3000) sleepPanel();
  int32_t x, y;
  if (awake && readPanelTouch(x, y)) {
    if (!tracking) firstX = x;
    lastX = x;
    tracking = true;
  } else if (tracking) {
    if (abs(lastX - firstX) >= 70) sensorUart.write(lastX < firstX ? 0xA1 : 0xA2);
    tracking = false;
  }
  delay(5);
}
#endif
