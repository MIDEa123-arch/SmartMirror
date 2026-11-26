#ifdef SMARTMIRROR_PANEL_UART
#include "mirror_display.h"
#include <ArduinoJson.h>

static uint8_t backlight;
void beginMirrorDisplay() { Serial2.begin(115200, SERIAL_8N1, 16, 17); }
void setMirrorBacklight(uint8_t level) { backlight = level; }
void sleepMirrorDisplay() { Serial2.print("S\n"); }

void showMirrorDisplay(uint8_t page, const DisplayStatus &s)
{
  JsonDocument state;
  state["time"] = static_cast<long>(time(nullptr));
  state["page"] = page;
  state["bl"] = backlight;
  state["t"] = s.temperature;
  state["h"] = s.humidity;
  state["fresh"] = s.sensorFresh;
  state["lamp"] = s.lampOn;
  state["online"] = s.online;
  if (s.debug)
  {
    state["debug"] = true;
    state["mm"] = s.distanceMm;
    state["ao"] = s.lightRaw;
    state["do"] = s.dark;
    state["pir"] = s.motion;
  }
  Serial2.write('D');
  serializeJson(state, Serial2);
  Serial2.write('\n');
}

bool receiveMirrorContent(const String &payload)
{
  JsonDocument content;
  if (payload.length() > DISPLAY_DATA_LIMIT || deserializeJson(content, payload))
    return false;
  Serial2.write('C');
  serializeJson(content, Serial2);
  Serial2.write('\n');
  return true;
}
#endif
