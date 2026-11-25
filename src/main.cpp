#include <Arduino.h>
#include <DHTesp.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <MQTT.h>
#include <esp_system.h>
#include <math.h>
#include <time.h>
#ifndef SMARTMIRROR_WOKWI
#include <Preferences.h>
#include <WebServer.h>
#endif
#include "mirror_display.h"
#ifdef SMARTMIRROR_WOKWI
#include <Wire.h>
#include <Adafruit_FT6206.h>
Adafruit_FT6206 touchController;
#else
#include <XPT2046_Touchscreen.h>
XPT2046_Touchscreen touchController(16);
#endif
#include "emqx_public_ca.h"
#if !defined(SMARTMIRROR_WOKWI) && __has_include("mosquitto_local_ca.h")
#include "mosquitto_local_ca.h"
#endif

#if __has_include("smartmirror_secrets.h") && !defined(SMARTMIRROR_WOKWI)
#include "smartmirror_secrets.h"
#endif

#ifndef SMARTMIRROR_MQTT_CA_CERT
#if !defined(SMARTMIRROR_WOKWI) && defined(MOSQUITTO_LOCAL_CA_CERT)
#define SMARTMIRROR_MQTT_CA_CERT MOSQUITTO_LOCAL_CA_CERT
#else
#define SMARTMIRROR_MQTT_CA_CERT EMQX_PUBLIC_CA_CERT
#endif
#endif

// Chan dung voi diagram.json hien tai
constexpr int PIN_DHT = 15;
constexpr int PIN_PIR = 14;
constexpr int PIN_DISTANCE_TRIG = 13;
constexpr int PIN_DISTANCE_ECHO = 21; // ECHO qua mach chia ap
#ifdef SMARTMIRROR_WOKWI
constexpr unsigned long PIR_WARMUP = 0UL;
#else
constexpr unsigned long PIR_WARMUP = 60000UL;
#endif
constexpr int PIN_MIRROR_LAMP = 27; // GPIO chi dieu khien driver/MOSFET, khong cap den truc tiep
constexpr int PIN_LIGHT_ANALOG = 34; // ADC1, dung duoc khi Wi-Fi hoat dong
constexpr int PIN_LIGHT_DIGITAL = 33;
#ifdef SMARTMIRROR_WOKWI
constexpr int PIN_TOUCH_SDA = 32;
constexpr int PIN_TOUCH_SCL = 26;
#else
constexpr int PIN_TOUCH_MISO = 17; // T_DO cua XPT2046
#endif

// Chu ky doc cam bien va gui MQTT
constexpr unsigned long DHT_INTERVAL = 2000UL;
constexpr unsigned long DHT_STALE_TIMEOUT = 10000UL;
constexpr unsigned long DISTANCE_INTERVAL = 150UL;
constexpr unsigned long DISTANCE_STALE_TIMEOUT = 10000UL;
constexpr unsigned long ECHO_TIMEOUT = 25000UL;
constexpr int DISTANCE_MIN_MM = 20;
constexpr int DISTANCE_MAX_MM = 2000;
constexpr int DISTANCE_SENSOR_MAX_MM = 4000;
constexpr int DISTANCE_CONFIRM_SAMPLES = 3;
constexpr unsigned long MOTION_WINDOW = 3000UL;
constexpr unsigned long LIGHT_INTERVAL = 250UL;
constexpr unsigned long LIGHT_STALE_TIMEOUT = 2000UL;
constexpr int LIGHT_FALLBACK_PWM = 96;
constexpr int LAMP_FALLBACK_PWM = 128;
constexpr int LIGHT_MIN_AUTO_PWM = 35;
constexpr int LIGHT_BRIGHT_ADC = 550;
constexpr int LIGHT_DARK_ADC = 2500;
// Cu chi vuot ngang tren man hinh
constexpr int SWIPE_MIN_DELTA =
#ifdef SMARTMIRROR_WOKWI
    70;
#else
    550;
#endif
// Tat guong
constexpr unsigned long SLEEP_TIMEOUT = 30000UL;
// Chay lai ket noi
constexpr unsigned long WIFI_RETRY = 10000UL;
constexpr unsigned long MQTT_RETRY = 5000UL;
constexpr unsigned long HEARTBEAT_INTERVAL = 5000UL;
constexpr unsigned long DISPLAY_INTERVAL = 250UL;

#ifdef SMARTMIRROR_WOKWI
const char *WIFI_SSID = "Wokwi-GUEST";
const char *WIFI_PASSWORD = "";
const char *MQTT_SERVER = "broker.emqx.io";
constexpr int MQTT_PORT = 8883;
const char *MQTT_USER = "";
const char *MQTT_PASSWORD = "";
#else
#ifndef SMARTMIRROR_WIFI_SSID
#define SMARTMIRROR_WIFI_SSID ""
#define SMARTMIRROR_WIFI_PASSWORD ""
#define SMARTMIRROR_MQTT_HOST ""
#define SMARTMIRROR_MQTT_PORT 8883
#define SMARTMIRROR_MQTT_USER ""
#define SMARTMIRROR_MQTT_PASSWORD ""
#endif
char WIFI_SSID[33] = SMARTMIRROR_WIFI_SSID;
char WIFI_PASSWORD[65] = SMARTMIRROR_WIFI_PASSWORD;
char MQTT_SERVER[64] = SMARTMIRROR_MQTT_HOST;
int MQTT_PORT = SMARTMIRROR_MQTT_PORT;
char MQTT_USER[65] = SMARTMIRROR_MQTT_USER;
char MQTT_PASSWORD[65] = SMARTMIRROR_MQTT_PASSWORD;
#endif
const char *MQTT_CA_CERT = SMARTMIRROR_MQTT_CA_CERT;

// Duong dan topic
const char *TOPIC_TEMP = "smartmirror/demo01/sensor/temperature";
const char *TOPIC_HUM = "smartmirror/demo01/sensor/humidity";
const char *TOPIC_PAGE = "smartmirror/demo01/event/page";
const char *TOPIC_CMD_PAGE = "smartmirror/demo01/cmd/page";
const char *TOPIC_STATE_PAGE = "smartmirror/demo01/state/page";
const char *TOPIC_DISPLAY_CONTENT = "smartmirror/demo01/display/content";
const char *TOPIC_STATE_LAMP = "smartmirror/demo01/state/lamp";
const char *TOPIC_STATE_LIGHT = "smartmirror/demo01/state/light";
const char *TOPIC_STATE_LIGHT_SENSOR = "smartmirror/demo01/state/light-sensor";
const char *TOPIC_STATE_ACTIVE = "smartmirror/demo01/state/active";
const char *TOPIC_STATUS = "smartmirror/demo01/status";

DHTesp dht;
WiFiClientSecure mqttTlsClient;
MQTTClient mqtt(768);
bool mqttTransportReady = false;
String pendingContent;
String serialLineBuffer;
bool pendingContentFromSerial = false;
int pendingDisplayPage = -1;
uint8_t displayPage = 0;
uint32_t pageSequence = 0;
char bootId[17];

float lastTemperature = NAN;
float lastHumidity = NAN;
bool lampOn = false;
bool mirrorActive = false;
int distanceStreak = 0;
bool pirWasHigh = false;
bool pirWarmingUp = PIR_WARMUP != 0;
bool motionPending = false;
bool touchWasDown = false;
bool swipeTracking = false;
int touchStartX = 0;
int touchLastX = 0;
bool ambientAvailable = false;
bool clockStarted = false;
float filteredAmbient = 0;
int autoBrightness = LIGHT_FALLBACK_PWM;
int autoLampBrightness = 0;
int displayBrightness = -1;

unsigned long lastActivityTime = 0;
unsigned long lastDhtRead = 0;
unsigned long lastValidTemperatureAt = 0;
unsigned long lastDistanceRead = 0;
unsigned long lastDistanceSampleAt = 0;
unsigned long pirStartedAt = 0;
unsigned long lastMotionAt = 0;
unsigned long lastLightRead = 0;
unsigned long lastValidLightAt = 0;
unsigned long lastWiFiAttempt = 0;
unsigned long lastMqttAttempt = 0;
unsigned long mqttUnavailableAt = 0;
unsigned long wifiStartedAt = 0;
unsigned long mqttConnectedAt = 0;
unsigned long lastHeartbeatAt = 0;
unsigned long lastSerialHeartbeatAt = 0;
unsigned long lastDisplayRefresh = 0;

#ifndef SMARTMIRROR_WOKWI
Preferences networkPreferences;
WebServer setupServer(80);
bool setupPortalActive = false;
char setupPassword[12] = "";

void startNetworkSetupPortal()
{
  if (setupPortalActive) return;
  String suffix = WiFi.macAddress();
  suffix.replace(":", "");
  suffix = suffix.substring(max(0, static_cast<int>(suffix.length()) - 6));
  String apName = "SmartMirror-" + suffix;
  snprintf(setupPassword, sizeof(setupPassword), "SM%06lu!", static_cast<unsigned long>(esp_random() % 1000000UL));
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(apName.c_str(), setupPassword);
  setupServer.on("/", HTTP_GET, []() {
    setupServer.send(200, "text/html; charset=utf-8",
      "<!doctype html><html lang='vi'><meta name='viewport' content='width=device-width,initial-scale=1'>"
      "<title>Thiết lập gương</title><style>body{font:16px system-ui;max-width:460px;margin:32px auto;padding:0 18px;background:#eef5f4;color:#142522}"
      "input{box-sizing:border-box;width:100%;padding:12px;margin:6px 0 16px;border:1px solid #9cb4ae;border-radius:9px}button{padding:13px 18px;background:#126d5b;color:white;border:0;border-radius:9px}</style>"
      "<h2>Kết nối SmartMirror</h2><form method='post' action='/save'>"
      "<label>Tên Wi-Fi</label><input name='ssid' maxlength='32' required>"
      "<label>Mật khẩu Wi-Fi</label><input name='wifi' type='password' maxlength='64'>"
      "<label>Địa chỉ laptop chạy Mosquitto</label><input name='host' maxlength='63' placeholder='Ví dụ: 192.168.1.20' required>"
      "<label>Tên đăng nhập MQTT</label><input name='user' maxlength='64' value='smartmirror' required>"
      "<label>Mật khẩu MQTT</label><input name='pass' type='password' maxlength='64' required>"
      "<button type='submit'>Lưu và kết nối</button></form></html>");
  });
  setupServer.on("/save", HTTP_POST, []() {
    const String ssid=setupServer.arg("ssid"), wifi=setupServer.arg("wifi"), host=setupServer.arg("host");
    const String user=setupServer.arg("user"), pass=setupServer.arg("pass");
    if (!ssid.length() || ssid.length()>32 || !host.length() || host.length()>63 || !user.length() || user.length()>64 || !pass.length() || pass.length()>64 || wifi.length()>64) {
      setupServer.send(400,"text/plain; charset=utf-8","Thông tin chưa hợp lệ. Kiểm tra lại rồi gửi lại."); return;
    }
    networkPreferences.begin("sm-network",false);
    networkPreferences.putString("ssid",ssid); networkPreferences.putString("wifi",wifi);
    networkPreferences.putString("host",host); networkPreferences.putString("user",user); networkPreferences.putString("pass",pass);
    networkPreferences.end();
    setupServer.send(200,"text/html; charset=utf-8","<!doctype html><meta charset='utf-8'><h2>Đã lưu. Gương đang khởi động lại…</h2>");
    delay(700); ESP.restart();
  });
  setupServer.begin();
  setupPortalActive=true;
  Serial.printf("Wi-Fi/MQTT setup: ket noi Wi-Fi %s, mat khau %s; mo http://192.168.4.1\n",apName.c_str(),setupPassword);
}

void loadNetworkSettings()
{
  networkPreferences.begin("sm-network",true);
  if(networkPreferences.isKey("ssid")) networkPreferences.getString("ssid",WIFI_SSID,sizeof(WIFI_SSID));
  if(networkPreferences.isKey("wifi")) networkPreferences.getString("wifi",WIFI_PASSWORD,sizeof(WIFI_PASSWORD));
  if(networkPreferences.isKey("host")) networkPreferences.getString("host",MQTT_SERVER,sizeof(MQTT_SERVER));
  if(networkPreferences.isKey("user")) networkPreferences.getString("user",MQTT_USER,sizeof(MQTT_USER));
  if(networkPreferences.isKey("pass")) networkPreferences.getString("pass",MQTT_PASSWORD,sizeof(MQTT_PASSWORD));
  networkPreferences.end();
}
#endif

// Chi gui MQTT khi dang ket noi Broker
void sendMQTT(const char *topic, const char *value, bool retained = false, int qos = 0)
{
  if (mqtt.connected())
    mqtt.publish(topic, value, retained, qos);
  // Mirror status also travels over the laptop's USB serial bridge. MQTT remains
  // available for Wokwi and optional network operation.
  const char *prefix = "smartmirror/demo01/";
  if (strncmp(topic, prefix, strlen(prefix)) == 0)
  {
    Serial.print("@SMARTMIRROR|");
    Serial.print(topic + strlen(prefix));
    Serial.print('|');
    Serial.println(value);
  }
}

void sendNumber(const char *topic, int value, bool retained = false)
{
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%d", value);
  sendMQTT(topic, buffer, retained);
}

bool hasFreshTemperature()
{
  return isfinite(lastTemperature) &&
         millis() - lastValidTemperatureAt < DHT_STALE_TIMEOUT;
}

bool hasControlConnection()
{
  return WiFi.status() == WL_CONNECTED && mqtt.connected();
}

bool hasLocalConnection()
{
  return hasControlConnection() || millis() - lastSerialHeartbeatAt < 15000UL;
}

void sendSerialFrame(const char *topic, const char *value)
{
  const char *prefix = "smartmirror/demo01/";
  if (strncmp(topic, prefix, strlen(prefix)) != 0)
    return;
  Serial.print("@SMARTMIRROR|");
  Serial.print(topic + strlen(prefix));
  Serial.print('|');
  Serial.println(value);
}

void sendSerialHeartbeat()
{
  sendSerialFrame(TOPIC_STATUS, "online");
  sendSerialFrame(TOPIC_STATE_ACTIVE, mirrorActive ? "ACTIVE" : "SLEEP");
  sendSerialFrame(TOPIC_STATE_LAMP, lampOn ? "ON" : "OFF");
  char value[16];
  snprintf(value, sizeof(value), "%d", displayBrightness);
  sendSerialFrame(TOPIC_STATE_LIGHT, value);
  sendSerialFrame(TOPIC_STATE_LIGHT_SENSOR, ambientAvailable ? "OK" : "FALLBACK");
  snprintf(value, sizeof(value), "%u", displayPage);
  sendSerialFrame(TOPIC_STATE_PAGE, value);
  if (hasFreshTemperature())
  {
    snprintf(value, sizeof(value), "%.1f", lastTemperature);
    sendSerialFrame(TOPIC_TEMP, value);
    snprintf(value, sizeof(value), "%.1f", lastHumidity);
    sendSerialFrame(TOPIC_HUM, value);
  }
}

// Den guong la ngo ra rieng; gương ngủ thì ngắt đèn để giữ trạng thái an toàn.
void updateLampBrightness();

void setLamp()
{
  updateLampBrightness();
}

void updateLampBrightness()
{
  const int target = ambientAvailable ? autoLampBrightness : LAMP_FALLBACK_PWM;
  const int level = mirrorActive ? target : 0;
  const bool on = level > 0;
  analogWrite(PIN_MIRROR_LAMP, level);
  if (lampOn != on)
  {
    lampOn = on;
    Serial.println(lampOn ? "Den guong: BAT" : "Den guong: TAT");
    sendMQTT(TOPIC_STATE_LAMP, lampOn ? "ON" : "OFF", true);
  }
}

// Dieu khien do sang den nen TFT va bao trang thai len Dashboard.
void updateDisplayBrightness()
{
  const int output = mirrorActive ? (ambientAvailable ? autoBrightness : LIGHT_FALLBACK_PWM) : 0;
  if (output == displayBrightness)
    return;
  displayBrightness = output;
  setMirrorBacklight(static_cast<uint8_t>(displayBrightness));
  updateLampBrightness();
  sendNumber(TOPIC_STATE_LIGHT, output, true);
}

void readAmbientLight(unsigned long now)
{
  const int raw = analogRead(PIN_LIGHT_ANALOG);
  const bool dark = digitalRead(PIN_LIGHT_DIGITAL) == HIGH;
  // AO bi keo LOW va DO bi keo HIGH khi module bi rut. Cung bat loi chap
  // o hai dau ADC neu AO va DO mau thuan, van cho phep toi/sang cuc do.
  const bool valid = dark ? raw >= 24 : raw <= 4070;
  const bool hadRecentSample = ambientAvailable && now - lastValidLightAt < LIGHT_STALE_TIMEOUT;
  if (valid)
  {
    lastValidLightAt = now;
    filteredAmbient = hadRecentSample ? filteredAmbient + (raw - filteredAmbient) * 0.25f : raw;
    const int adc = constrain(static_cast<int>(filteredAmbient + 0.5f), LIGHT_BRIGHT_ADC, LIGHT_DARK_ADC);
    const int target = map(adc, LIGHT_DARK_ADC, LIGHT_BRIGHT_ADC, LIGHT_MIN_AUTO_PWM, 255);
    const int lampTarget = map(adc, LIGHT_BRIGHT_ADC, LIGHT_DARK_ADC, 0, 255);
    if (abs(lampTarget - autoLampBrightness) >= 4 || lampTarget == 0 || lampTarget == 255)
      autoLampBrightness = lampTarget;
    if (!hadRecentSample || abs(target - autoBrightness) >= 4 ||
        target == LIGHT_MIN_AUTO_PWM || target == 255)
      autoBrightness = target;
  }
  const bool previouslyAvailable = ambientAvailable;
  ambientAvailable = valid || hadRecentSample;
  updateDisplayBrightness();
  updateLampBrightness();
  if (previouslyAvailable != ambientAvailable)
    sendMQTT(TOPIC_STATE_LIGHT_SENSOR, ambientAvailable ? "OK" : "FALLBACK", true);
}

void setMirrorActive(bool active)
{
  if (mirrorActive == active)
    return;
  mirrorActive = active;
  if (active)
    displayPage = 0;
  else
    sleepMirrorDisplay();
  Serial.println(active ? "Guong: ACTIVE" : "Guong: SLEEP");
  setLamp();
  updateDisplayBrightness();
  sendMQTT(TOPIC_STATE_ACTIVE, active ? "ACTIVE" : "SLEEP", true);
  if (active)
    sendNumber(TOPIC_STATE_PAGE, displayPage);
}

// DHT22: doc va gui nhiet do, do am
void readDHT()
{
  TempAndHumidity data = dht.getTempAndHumidity();
  if (!isfinite(data.temperature) || data.temperature < -40 || data.temperature > 80 ||
      !isfinite(data.humidity) || data.humidity < 0 || data.humidity > 100)
  {
    Serial.printf("Loi doc DHT22 tai GPIO%d: %s\n", PIN_DHT,
                  dht.getStatusString());
    return;
  }

  lastTemperature = data.temperature;
  lastHumidity = data.humidity;
  lastValidTemperatureAt = millis();
  Serial.printf("Nhiet do: %.1f C | Do am: %.1f %%\n",
                data.temperature, data.humidity);
  if (mqtt.connected())
  {
    char buffer[16];
    snprintf(buffer, sizeof(buffer), "%.1f", data.temperature);
    sendMQTT(TOPIC_TEMP, buffer);
    snprintf(buffer, sizeof(buffer), "%.1f", data.humidity);
    sendMQTT(TOPIC_HUM, buffer);
  }
}

void requestPage(int direction)
{
  lastActivityTime = millis();
  displayPage = (displayPage + DISPLAY_PAGE_COUNT + direction) % DISPLAY_PAGE_COUNT;
  sendNumber(TOPIC_STATE_PAGE, displayPage);
  const char *eventName = direction > 0 ? "NEXT" : "PREV";
  Serial.printf("Touch: %s PAGE\n", eventName);
  if (!mqtt.connected())
  {
    Serial.println("Page event khong gui: MQTT offline");
    return;
  }
  char payload[160];
  snprintf(payload, sizeof(payload),
           "{\"event\":\"%s\",\"bootId\":\"%s\",\"sequence\":%lu}",
           eventName, bootId, static_cast<unsigned long>(++pageSequence));
  if (!mqtt.publish(TOPIC_PAGE, payload, false, 1))
    Serial.println("Page event chua duoc broker xac nhan");
}

void readPageTouch()
{
  bool down = false;
  int x = 0;
#ifdef SMARTMIRROR_WOKWI
  if (touchController.touched())
  {
    const TS_Point point = touchController.getPoint();
    down = true;
    x = point.y; // FT6206 ngang voi truc Y o rotation=1.
  }
#else
  if (touchController.touched())
  {
    const TS_Point point = touchController.getPoint();
    down = true;
    x = point.y; // XPT2046: truc ngang sau rotation=1, xem README de hieu chuan.
  }
#endif
  if (down && !touchWasDown)
  {
    touchStartX = x;
    touchLastX = x;
    swipeTracking = mirrorActive;
  }
  if (down)
    touchLastX = x;
  if (!down && touchWasDown && swipeTracking && mirrorActive)
  {
    const int delta = touchLastX - touchStartX;
    if (abs(delta) >= SWIPE_MIN_DELTA)
      requestPage(delta < 0 ? 1 : -1);
    swipeTracking = false;
  }
  touchWasDown = down;
}

int readDistanceMillimeters()
{
  digitalWrite(PIN_DISTANCE_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_DISTANCE_TRIG, LOW);

  const unsigned long echoUs = pulseIn(PIN_DISTANCE_ECHO, HIGH, ECHO_TIMEOUT);
  const int millimeters = (echoUs * 10 + 29) / 58; // 58 us cho moi cm, lam tron den mm
  return millimeters >= DISTANCE_MIN_MM && millimeters <= DISTANCE_SENSOR_MAX_MM
             ? millimeters : -1;
}

void readPresenceDistance()
{
  const int millimeters = readDistanceMillimeters();
  const unsigned long now = millis();
  if (millimeters < 0)
  {
    distanceStreak = 0;
    return;
  }
  if (now - lastDistanceSampleAt >= 3 * DISTANCE_INTERVAL)
    distanceStreak = 0;
  lastDistanceSampleAt = now;
  if (millimeters > DISTANCE_MAX_MM)
    distanceStreak = 0;
  else if (distanceStreak < DISTANCE_CONFIRM_SAMPLES)
    ++distanceStreak;
}

void readMotion(unsigned long now)
{
  const bool high = digitalRead(PIN_PIR) == HIGH;
  const bool rising = high && !pirWasHigh;
  pirWasHigh = high;
  if (pirWarmingUp)
  {
    if (now - pirStartedAt >= PIR_WARMUP)
      pirWarmingUp = false;
    return;
  }
  if (rising)
  {
    lastMotionAt = now;
    motionPending = true;
  }
}

void confirmPresence(unsigned long now)
{
  if (!motionPending)
    return;
  if (now - lastMotionAt > MOTION_WINDOW)
  {
    motionPending = false;
    return;
  }
  if (distanceStreak < DISTANCE_CONFIRM_SAMPLES ||
      now - lastDistanceSampleAt >= 2 * DISTANCE_INTERVAL)
    return;

  // Moi canh PIR chi duoc ghep voi mot lan xac nhan khoang cach.
  motionPending = false;
  lastActivityTime = now;
  setMirrorActive(true);
}

// Nhan lenh MQTT tu Node-RED
// Callback chi luu lenh; khong publish long nhau khi dang cho PUBACK.
void mqttCallback(String &topic, String &message)
{
  if (topic == TOPIC_DISPLAY_CONTENT)
  {
    if (message.length() <= DISPLAY_DATA_LIMIT)
    {
      pendingContent = message;
      pendingContentFromSerial = false;
    }
    return;
  }
  if (topic == TOPIC_CMD_PAGE)
  {
    if (message.length() == 1 && message[0] >= '0' && message[0] < '0' + DISPLAY_PAGE_COUNT)
      pendingDisplayPage = message[0] - '0';
    return;
  }
  (void)topic;
  (void)message;
}

// USB protocol: laptop sends `SMIRROR <JSON>\\n`; debug text is ignored.
// ESP32 returns telemetry as `@SMARTMIRROR|topic-tail|value\\n`.
void readLaptopSerial()
{
  while (Serial.available())
  {
    const char ch = static_cast<char>(Serial.read());
    if (ch == '\r')
      continue;
    if (ch != '\n')
    {
      if (serialLineBuffer.length() <= DISPLAY_DATA_LIMIT + 16)
        serialLineBuffer += ch;
      else
        serialLineBuffer = "!overflow";
      continue;
    }
    if (serialLineBuffer.startsWith("SMIRROR "))
    {
      const String content = serialLineBuffer.substring(8);
      if (content.length() > 0 && content.length() <= DISPLAY_DATA_LIMIT)
      {
        pendingContent = content;
        pendingContentFromSerial = true;
        lastSerialHeartbeatAt = millis();
      }
    }
    serialLineBuffer = "";
  }
}

// Ket noi mang: thu lai theo chu ky, khong co vong while vo han
void maintainConnections(unsigned long now)
{
  if (!WIFI_SSID[0])
#ifndef SMARTMIRROR_WOKWI
  {
    startNetworkSetupPortal();
    return;
  }
#else
    return;
#endif
  if (WiFi.status() != WL_CONNECTED)
  {
    if (now - lastWiFiAttempt >= WIFI_RETRY)
    {
      lastWiFiAttempt = now;
      Serial.println("Dang thu ket noi lai Wi-Fi...");
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD, 6);
    }
#ifndef SMARTMIRROR_WOKWI
    if (!setupPortalActive && wifiStartedAt && now - wifiStartedAt >= 45000UL)
      startNetworkSetupPortal();
#endif
    return;
  }

  if (!clockStarted)
  {
    clockStarted = true;
    configTime(0, 0, "time.google.com", "pool.ntp.org");
  }
  if (!MQTT_SERVER[0])
#ifndef SMARTMIRROR_WOKWI
  {
    startNetworkSetupPortal();
    return;
  }
#else
    return;
#endif
  if (!mqttTransportReady)
    return;

  if (!mqtt.connected())
  {
    if (!mqttUnavailableAt) mqttUnavailableAt = now ? now : 1;
#ifndef SMARTMIRROR_WOKWI
    if (!setupPortalActive && now - mqttUnavailableAt >= 45000UL)
      startNetworkSetupPortal();
#endif
  }
  else mqttUnavailableAt = 0;

  if (!mqtt.connected() && now - lastMqttAttempt >= MQTT_RETRY)
  {
    lastMqttAttempt = now;
    // TLS certificate validation needs a synchronized wall clock. Keep the
    // mirror sensors/serial path alive while NTP is unavailable, but fail closed
    // for MQTT rather than accepting an unverifiable broker certificate.
    if (time(nullptr) < 1700000000)
    {
      Serial.println("MQTT TLS attend la synchronisation NTP");
      return;
    }
    String clientId = "smartmirror-esp32-";
    clientId += WiFi.macAddress();
    clientId.replace(":", "");

    if (mqtt.connect(clientId.c_str(), MQTT_USER[0] ? MQTT_USER : nullptr,
                     MQTT_USER[0] ? MQTT_PASSWORD : nullptr))
    {
      mqttUnavailableAt = 0;
      Serial.println("MQTT da ket noi");
      mqtt.subscribe(TOPIC_CMD_PAGE, 1);
      mqtt.subscribe(TOPIC_DISPLAY_CONTENT);
      sendMQTT(TOPIC_STATE_LAMP, lampOn ? "ON" : "OFF", true);
      sendMQTT(TOPIC_STATE_ACTIVE, mirrorActive ? "ACTIVE" : "SLEEP", true);
      sendNumber(TOPIC_STATE_LIGHT, displayBrightness, true);
      sendMQTT(TOPIC_STATE_LIGHT_SENSOR, ambientAvailable ? "OK" : "FALLBACK", true);
      sendMQTT(TOPIC_STATUS, "online", true, 1);
      sendNumber(TOPIC_STATE_PAGE, displayPage);
    }
    else
    {
      Serial.printf("MQTT loi: %d\n", mqtt.lastError());
    }
  }

  if (mqtt.connected())
  {
    mqtt.loop();
    if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL)
    {
      lastHeartbeatAt = now;
      // Heartbeat doc lap voi DHT22 de den van dieu khien duoc khi cam bien loi.
      sendMQTT(TOPIC_STATUS, "online");
      sendNumber(TOPIC_STATE_PAGE, displayPage);
    }
  }
}

void setup()
{
  Serial.begin(115200);
#ifndef SMARTMIRROR_WOKWI
  loadNetworkSettings();
#endif
  pinMode(PIN_DHT, INPUT_PULLUP);
  dht.setup(PIN_DHT, DHTesp::DHT22);
#ifdef SMARTMIRROR_WOKWI
  Wire.begin(PIN_TOUCH_SDA, PIN_TOUCH_SCL);
  if (!touchController.begin(40)) Serial.println("Khong tim thay FT6206 touch");
#else
  SPI.begin(18, PIN_TOUCH_MISO, 23, 16);
  touchController.begin();
  touchController.setRotation(1);
#endif
  pinMode(PIN_PIR, INPUT_PULLDOWN);
  pirWasHigh = digitalRead(PIN_PIR) == HIGH;
  pirStartedAt = millis();
  pinMode(PIN_DISTANCE_TRIG, OUTPUT);
  digitalWrite(PIN_DISTANCE_TRIG, LOW);
  pinMode(PIN_DISTANCE_ECHO, INPUT);
  pinMode(PIN_MIRROR_LAMP, OUTPUT);
  pinMode(PIN_LIGHT_DIGITAL, INPUT_PULLUP);
  analogReadResolution(12);
  analogSetPinAttenuation(PIN_LIGHT_ANALOG, ADC_11db);
  digitalWrite(PIN_MIRROR_LAMP, LOW);
  beginMirrorDisplay();
  updateDisplayBrightness();

  snprintf(bootId, sizeof(bootId), "%08lx%08lx",
           static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()));
  if (MQTT_SERVER[0] && MQTT_CA_CERT[0])
  {
    mqttTlsClient.setCACert(MQTT_CA_CERT);
    mqtt.begin(MQTT_SERVER, MQTT_PORT, mqttTlsClient);
    mqttTransportReady = true;
  }
  else if (MQTT_SERVER[0])
  {
    Serial.println("MQTT TLS tat: chua cau hinh CA certificate");
  }
  mqtt.onMessage(mqttCallback);
  mqtt.setOptions(15, true, 1000);
  mqtt.setWill(TOPIC_STATUS, "offline", true, 1);
  WiFi.mode(WIFI_STA);
  if (WIFI_SSID[0])
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD, 6);
  lastWiFiAttempt = millis();
  wifiStartedAt = lastWiFiAttempt;
#ifndef SMARTMIRROR_WOKWI
  if (!WIFI_SSID[0] || !MQTT_SERVER[0]) startNetworkSetupPortal();
#endif
  lastActivityTime = millis();
  Serial.println("ESP32 da khoi dong");
}

void loop()
{
#ifndef SMARTMIRROR_WOKWI
  if (setupPortalActive) setupServer.handleClient();
#endif
  readLaptopSerial();
  const unsigned long serialTime = millis();
  if (serialTime - lastSerialHeartbeatAt >= HEARTBEAT_INTERVAL)
  {
    lastSerialHeartbeatAt = serialTime;
    sendSerialHeartbeat();
  }
  const unsigned long now = millis();
  readMotion(now);
  if (now - lastDistanceRead >= DISTANCE_INTERVAL)
  {
    lastDistanceRead = now;
    readPresenceDistance();
  }
  confirmPresence(millis());
  if (mirrorActive && distanceStreak >= DISTANCE_CONFIRM_SAMPLES)
    lastActivityTime = millis();
  maintainConnections(now);
  if (millis() - lastDhtRead >= DHT_INTERVAL)
  {
    readDHT();
    lastDhtRead = millis();
  }

  const unsigned long sensorTime = millis();
  if (sensorTime - lastLightRead >= LIGHT_INTERVAL)
  {
    lastLightRead = sensorTime;
    readAmbientLight(millis());
  }

  // Doc cam ung sau cam bien khoang cach de dung trang thai ACTIVE moi nhat.
  readPageTouch();

  // Doc lai thoi gian sau khi cam bien cap nhat lastActivityTime.
  // Dung 'now' dau vong lap co the gay tran phep tru unsigned.
  const unsigned long sleepCheckTime = millis();
  if (mirrorActive && (sleepCheckTime - lastActivityTime >= SLEEP_TIMEOUT ||
                       sleepCheckTime - lastDistanceSampleAt >= DISTANCE_STALE_TIMEOUT))
  {
    setMirrorActive(false);
  }
  if (pendingContent.length() && (pendingContentFromSerial || hasControlConnection()))
  {
    receiveMirrorContent(pendingContent);
  }
  if (hasControlConnection())
  {
    if (pendingDisplayPage >= 0 && mirrorActive)
    {
      displayPage = pendingDisplayPage;
      sendNumber(TOPIC_STATE_PAGE, displayPage);
    }
  }
  pendingContent = "";
  pendingContentFromSerial = false;
  pendingDisplayPage = -1;

  const auto displayTime = millis();
  if (mirrorActive && displayTime - lastDisplayRefresh >= DISPLAY_INTERVAL)
  {
    lastDisplayRefresh = displayTime;
    showMirrorDisplay(displayPage, {lastTemperature, lastHumidity, hasFreshTemperature(),
                                    lampOn, hasControlConnection()});
    setMirrorBacklight(static_cast<uint8_t>(displayBrightness));
  }
  delay(10);
}
