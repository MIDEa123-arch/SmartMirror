#include <Arduino.h>
#include <DHTesp.h>
#include <WiFi.h>
#include <MQTT.h>
#include <esp_system.h>
#include <math.h>

// Chan dung voi diagram.json hien tai
constexpr int PIN_DHT = 15;
constexpr int PIN_PAGE_BUTTON = 32; // Nut nhan noi GPIO32 voi GND
constexpr int PIN_TRIG = 13;
constexpr int PIN_ECHO = 14;
constexpr int PIN_LED_MIRROR = 26;
constexpr int PIN_LED_FAN = 27;

// Nguong nhiet do bat/tat quat, don vi C
constexpr float FAN_ON_TEMP = 32.0f;
constexpr float FAN_OFF_TEMP = 30.0f;
// Chu ky doc cam bien va gui MQTT
constexpr unsigned long DHT_INTERVAL = 2000UL;
// Khoang cach bat/giu sang guong, don vi cm
constexpr float MIRROR_MIN_DISTANCE = 25.0f;
constexpr float MIRROR_MAX_DISTANCE = 60.0f;
// Chu ky phat xung kiem tra nguoi dung gan guong
constexpr unsigned long DISTANCE_INTERVAL = 250UL;
// Chong doi nut nhan
constexpr unsigned long BUTTON_DEBOUNCE = 40UL;
// Tat guong
constexpr unsigned long SLEEP_TIMEOUT = 120000UL;
// Chay lai ket noi
constexpr unsigned long WIFI_RETRY = 10000UL;
constexpr unsigned long MQTT_RETRY = 5000UL;

const char *WIFI_SSID = "Wokwi-GUEST";
const char *WIFI_PASSWORD = "";
const char *MQTT_SERVER = "broker.emqx.io";
constexpr int MQTT_PORT = 1883;

// Duong dan topic
const char *TOPIC_TEMP = "smartmirror/demo01/sensor/temperature";
const char *TOPIC_HUM = "smartmirror/demo01/sensor/humidity";
const char *TOPIC_PAGE = "smartmirror/demo01/event/page";
const char *TOPIC_CMD_MODE = "smartmirror/demo01/cmd/mode";
const char *TOPIC_CMD_FAN = "smartmirror/demo01/cmd/fan";
const char *TOPIC_CMD_LIGHT = "smartmirror/demo01/cmd/light";
const char *TOPIC_STATE_FAN = "smartmirror/demo01/state/fan";
const char *TOPIC_STATE_LIGHT = "smartmirror/demo01/state/light";
const char *TOPIC_STATE_ACTIVE = "smartmirror/demo01/state/active";
const char *TOPIC_STATE_MODE = "smartmirror/demo01/state/mode";
const char *TOPIC_STATUS = "smartmirror/demo01/status";

DHTesp dht;
WiFiClient wifiClient;
MQTTClient mqtt(256);
String pendingMode, pendingFan, pendingLight;
uint32_t pageSequence = 0;
char bootId[17];

float lastTemperature = NAN;
bool autoMode = true;
bool manualFan = false;
bool fanOn = false;
bool mirrorActive = false;
bool rawButtonPressed = false;
bool stableButtonPressed = false;
int desiredBrightness = 180; // Tu 0 den 255
int lastLedOutput = -1;

unsigned long lastActivityTime = 0;
unsigned long lastDhtRead = 0;
unsigned long lastDistanceRead = 0;
unsigned long buttonChangedAt = 0;
unsigned long lastWiFiAttempt = 0;
unsigned long lastMqttAttempt = 0;

// Chi gui MQTT khi dang ket noi Broker
void sendMQTT(const char *topic, const char *value, bool retained = false, int qos = 0)
{
  if (mqtt.connected())
    mqtt.publish(topic, value, retained, qos);
}

void sendNumber(const char *topic, int value, bool retained = false)
{
  char buffer[16];
  snprintf(buffer, sizeof(buffer), "%d", value);
  sendMQTT(topic, buffer, retained);
}

// Dieu khien quat: AUTO theo nhiet do, MANUAL theo lenh
void updateFan()
{
  bool nextFan = fanOn;
  if (!autoMode)
  {
    nextFan = manualFan;
  }
  else if (!isnan(lastTemperature))
  {
    if (lastTemperature >= FAN_ON_TEMP)
      nextFan = true;
    else if (lastTemperature <= FAN_OFF_TEMP)
      nextFan = false;
    // O 30-32 C giu nguyen trang thai quat
  }

  if (nextFan != fanOn)
  {
    fanOn = nextFan;
    digitalWrite(PIN_LED_FAN, fanOn ? HIGH : LOW);
    Serial.println(fanOn ? "Quat: BAT" : "Quat: TAT");
    sendMQTT(TOPIC_STATE_FAN, fanOn ? "ON" : "OFF", true);
  }
}

// LED trang PWM va trang thai giao dien guong
void updateMirrorLed()
{
  int output = mirrorActive ? desiredBrightness : 0;
  if (output == lastLedOutput)
    return;
  lastLedOutput = output;
  analogWrite(PIN_LED_MIRROR, output);
  sendNumber(TOPIC_STATE_LIGHT, output, true);
}

void setMirrorActive(bool active)
{
  if (mirrorActive == active)
    return;
  mirrorActive = active;
  Serial.println(active ? "Guong: ACTIVE" : "Guong: SLEEP");
  updateMirrorLed();
  sendMQTT(TOPIC_STATE_ACTIVE, active ? "ACTIVE" : "SLEEP", true);
}

// DHT22: doc va gui nhiet do, do am
void readDHT()
{
  TempAndHumidity data = dht.getTempAndHumidity();
  if (isnan(data.temperature) || isnan(data.humidity))
  {
    Serial.printf("Loi doc DHT22 tai GPIO%d: %s\n", PIN_DHT,
                  dht.getStatusString());
    return;
  }

  lastTemperature = data.temperature;
  Serial.printf("Nhiet do: %.1f C | Do am: %.1f %%\n",
                data.temperature, data.humidity);
  updateFan();

  if (mqtt.connected())
  {
    char buffer[16];
    snprintf(buffer, sizeof(buffer), "%.1f", data.temperature);
    sendMQTT(TOPIC_TEMP, buffer);
    snprintf(buffer, sizeof(buffer), "%.1f", data.humidity);
    sendMQTT(TOPIC_HUM, buffer);
  }
}

// Diem tich hop man hinh sau nay. Hien NEXT chi duoc xem o Node-RED Debug.
void requestNextPage()
{
  lastActivityTime = millis();
  Serial.println("Button: NEXT PAGE");
  if (!mqtt.connected())
  {
    Serial.println("NEXT khong gui: MQTT offline");
    return;
  }
  char payload[160];
  snprintf(payload, sizeof(payload),
           "{\"event\":\"NEXT\",\"bootId\":\"%s\",\"sequence\":%lu}",
           bootId, static_cast<unsigned long>(++pageSequence));
  if (!mqtt.publish(TOPIC_PAGE, payload, false, 1))
    Serial.println("NEXT chua duoc broker xac nhan; khong luu lenh cu");
}

void readPageButton()
{
  const unsigned long now = millis();
  const bool pressed = digitalRead(PIN_PAGE_BUTTON) == LOW;
  if (pressed != rawButtonPressed)
  {
    rawButtonPressed = pressed;
    buttonChangedAt = now;
  }

  if (now - buttonChangedAt < BUTTON_DEBOUNCE ||
      stableButtonPressed == rawButtonPressed)
    return;

  stableButtonPressed = rawButtonPressed;
  // Chi nhan canh nhan; giu nut khong lap. Nut khong danh thuc guong.
  // Do sang den khong anh huong den viec chuyen trang.
  if (stableButtonPressed && mirrorActive)
    requestNextPage();
}

// HC-SR04: do khoang cach de bat/giu sang guong
float readDistanceCm()
{
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  unsigned long duration = pulseIn(PIN_ECHO, HIGH, 25000UL);
  if (duration == 0)
    return -1.0f;
  return duration * 0.0343f / 2.0f;
}

void readPresenceDistance()
{
  const float distance = readDistanceCm();
  if (distance < 0)
    return; // Khong nhan duoc xung ECHO hop le

  const unsigned long now = millis();

  // Trong nguong khoang cach: co nguoi dang dung gan guong.
  // Neu cam bien huong vao vat can co dinh, guong se luon ACTIVE.
  if (distance >= MIRROR_MIN_DISTANCE && distance < MIRROR_MAX_DISTANCE)
  {
    lastActivityTime = now;
    setMirrorActive(true);
  }
}

// Nhan lenh MQTT tu Node-RED
// Callback chi luu lenh; khong publish long nhau khi dang cho PUBACK.
void mqttCallback(String &topic, String &message)
{
  if (message.length() > 32) return;
  if (topic == TOPIC_CMD_MODE) pendingMode = message;
  else if (topic == TOPIC_CMD_FAN) pendingFan = message;
  else if (topic == TOPIC_CMD_LIGHT) pendingLight = message;
}

void applyCommand(const String &receivedTopic, const String &message)
{
  if (receivedTopic == TOPIC_CMD_MODE)
  {
    if (message == "AUTO")
      autoMode = true;
    else if (message == "MANUAL")
      autoMode = false;
    else
      return;
    updateFan();
    sendMQTT(TOPIC_STATE_MODE, autoMode ? "AUTO" : "MANUAL", true);
  }
  else if (receivedTopic == TOPIC_CMD_FAN)
  {
    if (message == "ON")
      manualFan = true;
    else if (message == "OFF")
      manualFan = false;
    else
      return;
    if (!autoMode)
      updateFan();
  }
  else if (receivedTopic == TOPIC_CMD_LIGHT)
  {
    if (message.length() == 0 || message.length() > 3)
      return;

    for (unsigned int i = 0; i < message.length(); i++)
    {
      if (message[i] < '0' || message[i] > '9')
        return;
    }

    int value = message.toInt();

    if (value < 0 || value > 255)
      return;

    // Luu do sang tu Slider
    desiredBrightness = value;

    // Cap nhat LED trang tai GPIO26
    updateMirrorLed();
  }
}

// Ket noi mang: thu lai theo chu ky, khong co vong while vo han
void maintainConnections(unsigned long now)
{
  if (WiFi.status() != WL_CONNECTED)
  {
    if (now - lastWiFiAttempt >= WIFI_RETRY)
    {
      lastWiFiAttempt = now;
      Serial.println("Dang thu ket noi lai Wi-Fi...");
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD, 6);
    }
    return;
  }

  if (!mqtt.connected() && now - lastMqttAttempt >= MQTT_RETRY)
  {
    lastMqttAttempt = now;
    String clientId = "smartmirror-esp32-";
    clientId += WiFi.macAddress();
    clientId.replace(":", "");

    if (mqtt.connect(clientId.c_str()))
    {
      Serial.println("MQTT da ket noi");
      mqtt.subscribe(TOPIC_CMD_MODE, 1);
      mqtt.subscribe(TOPIC_CMD_FAN, 1);
      mqtt.subscribe(TOPIC_CMD_LIGHT, 1);
      sendMQTT(TOPIC_STATUS, "online", true);
      sendMQTT(TOPIC_STATE_MODE, autoMode ? "AUTO" : "MANUAL", true);
      sendMQTT(TOPIC_STATE_FAN, fanOn ? "ON" : "OFF", true);
      sendMQTT(TOPIC_STATE_ACTIVE, mirrorActive ? "ACTIVE" : "SLEEP", true);
      sendNumber(TOPIC_STATE_LIGHT, mirrorActive ? desiredBrightness : 0, true);
    }
    else
    {
      Serial.printf("MQTT loi: %d\n", mqtt.lastError());
    }
  }

  if (mqtt.connected())
    mqtt.loop();
}

void setup()
{
  Serial.begin(115200);
  pinMode(PIN_DHT, INPUT_PULLUP);
  dht.setup(PIN_DHT, DHTesp::DHT22);
  pinMode(PIN_PAGE_BUTTON, INPUT_PULLUP);
  // Giu nut luc khoi dong: can tha ra roi nhan lai.
  rawButtonPressed = digitalRead(PIN_PAGE_BUTTON) == LOW;
  stableButtonPressed = rawButtonPressed;
  buttonChangedAt = millis();
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_LED_MIRROR, OUTPUT);
  pinMode(PIN_LED_FAN, OUTPUT);
  digitalWrite(PIN_TRIG, LOW);
  digitalWrite(PIN_LED_FAN, LOW);
  updateMirrorLed();

  snprintf(bootId, sizeof(bootId), "%08lx%08lx",
           static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()));
  mqtt.begin(MQTT_SERVER, MQTT_PORT, wifiClient);
  mqtt.onMessage(mqttCallback);
  mqtt.setOptions(15, true, 1000);
  mqtt.setWill(TOPIC_STATUS, "offline", true, 1);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD, 6);
  lastWiFiAttempt = millis();
  lastActivityTime = millis();
  Serial.println("ESP32 da khoi dong");
}

void loop()
{
  unsigned long now = millis();
  maintainConnections(now);
  // Lenh dieu khien la gia tri dich: khi nhan nhanh, ap dung gia tri moi nhat.
  String mode = pendingMode, fan = pendingFan, light = pendingLight;
  pendingMode = pendingFan = pendingLight = "";
  if (mode.length()) applyCommand(TOPIC_CMD_MODE, mode);
  if (fan.length()) applyCommand(TOPIC_CMD_FAN, fan);
  if (light.length()) applyCommand(TOPIC_CMD_LIGHT, light);

  if (now - lastDhtRead >= DHT_INTERVAL)
  {
    lastDhtRead = now;
    readDHT();
  }

  if (now - lastDistanceRead >= DISTANCE_INTERVAL)
  {
    lastDistanceRead = now;
    readPresenceDistance();
  }

  // Doc nut sau khoang cach de dung trang thai ACTIVE moi nhat.
  readPageButton();

  // Doc lai thoi gian sau khi cam bien cap nhat lastActivityTime.
  // Dung 'now' dau vong lap co the gay tran phep tru unsigned.
  const unsigned long sleepCheckTime = millis();
  if (mirrorActive && sleepCheckTime - lastActivityTime >= SLEEP_TIMEOUT)
  {
    setMirrorActive(false);
  }
  delay(10);
}
