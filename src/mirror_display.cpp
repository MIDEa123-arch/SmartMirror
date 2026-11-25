#include "mirror_display.h"

#include <ArduinoJson.h>
#include <TFT_eSPI.h>
#include <math.h>
#include <time.h>
#include "mirror_font.h"

#if __has_include("smartmirror_secrets.h")
#include "smartmirror_secrets.h"
#endif
#ifndef SMARTMIRROR_BACKLIGHT_ACTIVE_HIGH
#define SMARTMIRROR_BACKLIGHT_ACTIVE_HIGH 1
#endif

namespace
{
constexpr int BACKLIGHT_PIN = 19; // PWM to the TFT backlight input, never LED power.
constexpr int BACKLIGHT_OFF = SMARTMIRROR_BACKLIGHT_ACTIVE_HIGH ? 0 : 255;
constexpr time_t EARLIEST_TIME = 1700000000;
constexpr time_t LATEST_TIME = 2140000000;
constexpr unsigned long CONTENT_EXPIRY = 45000UL;
constexpr unsigned long CLOCK_EXPIRY = 24UL * 60 * 60 * 1000;
constexpr unsigned long WEATHER_EXPIRY_SECONDS = 30UL * 60;
constexpr uint8_t ROWS = 4;
constexpr uint8_t MAX_TASKS = 3;
constexpr uint16_t BACKGROUND = 0x08E3;
constexpr uint16_t PANEL = 0x1946;
constexpr uint16_t TEXT = 0xF77D;
constexpr uint16_t ACCENT = 0x86F6;
constexpr uint16_t MUTED = 0xBDF7;

struct Reminder
{
  String title;
  time_t at = 0;
};

struct Content
{
  time_t sentAt = 0;
  unsigned long receivedAt = 0;
  bool weatherReady = false;
  unsigned long weatherAge = 0;
  float weatherTemp = 0;
  int weatherHumidity = 0;
  int weatherCode = 0;
  String location;
  bool privateTasks = false;
  uint8_t taskCount = 0;
  Reminder tasks[MAX_TASKS];
};

TFT_eSPI screen;
Content content;
String renderedRows[ROWS];
String renderedFooter;
int renderedPage = -1;
int lastBacklight = BACKLIGHT_OFF;
bool displayAwake = false;

time_t currentTime(unsigned long now)
{
  const time_t systemTime = time(nullptr);
  if (systemTime >= EARLIEST_TIME)
    return systemTime;
  if (content.sentAt && now - content.receivedAt < CLOCK_EXPIRY)
    return content.sentAt + (now - content.receivedAt) / 1000;
  return 0;
}

String localDate(time_t utc, const char *format)
{
  if (!utc)
    return "Chờ đồng bộ giờ";
  const time_t vietnamTime = utc + 7 * 3600;
  struct tm parts;
  char result[24];
  if (!gmtime_r(&vietnamTime, &parts) || !strftime(result, sizeof(result), format, &parts))
    return "Chờ đồng bộ giờ";
  return result;
}

String fitText(String line, int width)
{
  if (screen.textWidth(line) <= width)
    return line;
  while (line.length() && screen.textWidth(line + "...") > width)
  {
    unsigned int end = line.length() - 1;
    while (end && (static_cast<uint8_t>(line[end]) & 0xC0) == 0x80)
      --end;
    line.remove(end);
  }
  return line + "...";
}

void renderPage(uint8_t page)
{
  static const char *titles[DISPLAY_PAGE_COUNT] = { "Tổng quan", "Thời tiết", "Lịch và nhắc việc" };
  screen.fillScreen(BACKGROUND);
  screen.fillRect(0, 0, screen.width(), 38, PANEL);
  screen.setTextColor(ACCENT, PANEL, true);
  screen.drawString(titles[page], 12, 8);
  screen.setTextDatum(TR_DATUM);
  screen.drawString(String(page + 1) + "/3", screen.width() - 12, 8);
  screen.setTextDatum(TL_DATUM);
}

void renderRows(const String (&rows)[ROWS], const String &footer, bool redraw)
{
  const int rowSpacing = (screen.height() - 74) / ROWS;
  for (uint8_t i = 0; i < ROWS; ++i)
  {
    if (!redraw && renderedRows[i] == rows[i])
      continue;
    renderedRows[i] = rows[i];
    const int top = 48 + i * rowSpacing;
    screen.fillRoundRect(10, top, screen.width() - 20, rowSpacing - 5, 5, PANEL);
    screen.setTextColor(TEXT, PANEL, true);
    screen.drawString(fitText(rows[i], screen.width() - 38), 18, top + 6);
  }
  if (redraw || renderedFooter != footer)
  {
    renderedFooter = footer;
    const int top = screen.height() - 25;
    screen.fillRect(0, top, screen.width(), 25, BACKGROUND);
    screen.setTextColor(MUTED, BACKGROUND, true);
    screen.drawString(fitText(footer, screen.width() - 22), 12, top);
  }
}

const char *weatherLabel(int code)
{
  if (code == 0) return "Trời quang";
  if (code <= 3) return "Có mây";
  if (code <= 48) return "Sương mù";
  if (code <= 57) return "Mưa phùn";
  if (code <= 67) return "Mưa";
  if (code <= 77) return "Tuyết";
  if (code <= 86) return "Mưa rào";
  return "Dông";
}

void fillWeather(String (&rows)[ROWS], String &footer, bool fresh, unsigned long elapsed)
{
  rows[0] = content.location.length() && fresh ? content.location : "Dữ liệu ngoài trời";
  if (!fresh)
    rows[1] = "Đang chờ Node-RED";
  else if (!content.weatherReady)
    rows[1] = "Chưa có dự báo";
  else if (content.weatherAge + elapsed / 1000 >= WEATHER_EXPIRY_SECONDS)
    rows[1] = "Dữ liệu thời tiết đã cũ";
  else
  {
    rows[1] = weatherLabel(content.weatherCode);
    rows[2] = "Nhiệt độ  " + String(content.weatherTemp, 1) + " °C";
    rows[3] = "Độ ẩm  " + String(content.weatherHumidity) + " %";
  }
  footer = "Chạm để đổi trang";
}

void fillReminders(String (&rows)[ROWS], String &footer, bool fresh, time_t utc)
{
  rows[0] = "Lịch hoạt động hôm nay";
  if (!fresh)
    rows[1] = "Đang chờ Node-RED";
  else if (!content.privateTasks)
    rows[1] = "Lịch chưa được chia sẻ";
  else
  {
    uint8_t row = 1;
    for (uint8_t i = 0; i < content.taskCount && row < ROWS; ++i)
    {
      const auto &task = content.tasks[i];
      if (utc && task.at < utc - 60)
        continue;
      rows[row++] = localDate(task.at, "%H:%M") + "  " + task.title;
    }
    if (row == 1)
      rows[1] = "Hôm nay chưa có hoạt động";
  }
  footer = "Vuốt trái / phải để đổi trang";
}
} // namespace

void beginMirrorDisplay()
{
  pinMode(BACKLIGHT_PIN, OUTPUT);
  digitalWrite(BACKLIGHT_PIN, BACKLIGHT_OFF ? HIGH : LOW);
  screen.init();
  screen.setRotation(1);
  screen.setTextWrap(false);
  screen.loadFont(MirrorFont);
  screen.writecommand(TFT_DISPOFF);
#ifdef SMARTMIRROR_WOKWI
  screen.fillScreen(TFT_BLACK);
#endif
}

void setMirrorBacklight(uint8_t brightness)
{
  const int level = displayAwake ? brightness : 0;
  const int output = SMARTMIRROR_BACKLIGHT_ACTIVE_HIGH ? level : 255 - level;
  if (output == lastBacklight)
    return;
  analogWrite(BACKLIGHT_PIN, output);
  lastBacklight = output;
}

void sleepMirrorDisplay()
{
  if (!displayAwake)
    return;
  displayAwake = false;
  setMirrorBacklight(0);
  screen.writecommand(TFT_DISPOFF);
#ifdef SMARTMIRROR_WOKWI
  screen.fillScreen(TFT_BLACK);
#endif
  renderedPage = -1;
}

void showMirrorDisplay(uint8_t page, const DisplayStatus &status)
{
  page %= DISPLAY_PAGE_COUNT;
  const unsigned long now = millis();
  const auto utc = currentTime(now);
  const auto elapsed = now - content.receivedAt;
  const bool fresh = content.sentAt && elapsed < CONTENT_EXPIRY;
  String rows[ROWS];
  String footer;
  if (page == 0)
  {
    rows[0] = localDate(utc, "%H:%M   %d/%m/%Y");
    rows[1] = status.sensorFresh
        ? "Trong phòng  " + String(status.temperature, 1) + " °C   " + String(status.humidity, 0) + " %"
        : "Trong phòng  -- °C   -- %";
    rows[2] = "Lịch hoạt động hôm nay";
    if (!fresh)
      rows[3] = "Đang tải lịch hôm nay";
    else if (!content.privateTasks)
      rows[3] = "Chưa nhận lịch hôm nay";
    else
    {
      rows[3] = "Không có hoạt động sắp tới";
      for (uint8_t i = 0; i < content.taskCount; ++i)
      {
        const auto &task = content.tasks[i];
        if (utc && task.at < utc - 60) continue;
        rows[3] = localDate(task.at, "%H:%M") + "  " + task.title;
        break;
      }
    }
    footer = status.online ? "Vuốt trái / phải để đổi trang" : "Ngoại tuyến  |  Vuốt để đổi trang";
  }
  else if (page == 1)
    fillWeather(rows, footer, fresh, elapsed);
  else
    fillReminders(rows, footer, fresh, utc);

  if (!displayAwake)
  {
    screen.writecommand(TFT_DISPON);
    displayAwake = true;
  }
  const bool redraw = renderedPage != page;
  if (redraw)
    renderPage(page);
  renderRows(rows, footer, redraw);
  renderedPage = page;
}

bool receiveMirrorContent(const String &payload)
{
  if (payload.length() > DISPLAY_DATA_LIMIT)
    return false;
  JsonDocument doc;
  if (deserializeJson(doc, payload.c_str(), payload.length(), DeserializationOption::NestingLimit(4)) ||
      (doc["v"] | 0) != 1)
    return false;
  const time_t sentAt = doc["time"] | 0L;
  const auto now = millis();
  const auto knownTime = time(nullptr);
  if (sentAt < EARLIEST_TIME || sentAt > LATEST_TIME ||
      (knownTime >= EARLIEST_TIME && (sentAt < knownTime - 45 || sentAt > knownTime + 60)))
    return false;

  Content next;
  next.sentAt = sentAt;
  next.receivedAt = now;
  const char *location = doc["location"] | "";
  if (strlen(location) <= 72)
    next.location = location;
  const JsonObjectConst weather = doc["weather"].as<JsonObjectConst>();
  const float temp = weather["temperature"] | NAN;
  const int humidity = weather["humidity"] | -1;
  const int code = weather["code"] | -1;
  const int age = weather["age"] | -1;
  if (isfinite(temp) && temp >= -100 && temp <= 70 && humidity >= 0 && humidity <= 100 &&
      code >= 0 && code <= 99 && age >= 0 && age <= 86400)
  {
    next.weatherTemp = temp;
    next.weatherHumidity = humidity;
    next.weatherCode = code;
    next.weatherAge = age;
    next.weatherReady = true;
  }
  next.privateTasks = doc["privateTasks"] | false;
  if (next.privateTasks)
  {
    for (JsonObjectConst task : doc["tasks"].as<JsonArrayConst>())
    {
      if (next.taskCount == MAX_TASKS)
        break;
      const time_t at = task["at"] | 0L;
      const char *title = task["title"] | "";
      if (at < sentAt - 60 || at > sentAt + 7 * 86400 || !title[0] || strlen(title) > 72)
        continue;
      auto &reminder = next.tasks[next.taskCount++];
      reminder.title = title;
      reminder.at = at;
    }
  }
  content = next;
  return true;
}
