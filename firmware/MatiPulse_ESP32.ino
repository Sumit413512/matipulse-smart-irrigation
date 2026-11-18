/*
  MATIPULSE — ESP32 firmware scaffold (UNTESTED ON PHYSICAL HARDWARE)
  For a 30-pin ESP32 DevKit v1. ESP32 Arduino core, DHT sensor library needed.
  DO NOT connect to a mains-voltage agricultural motor.
  SAFE DEFAULT: ENABLE_PUMP=false. Only enable after calibration, wiring inspection,
  MOSFET/flyback protection, float-switch confirmation, and dry-run testing.
  Local decisions do NOT depend on connectivity or remote commands.
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

// Replace before field use. Wi-Fi is optional; local control works without it.
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL = "http://192.168.1.10:8000/api/device/ingest";
const char* DEVICE_KEY = "SET_SERVER_AND_DEVICE_KEY";

constexpr int SOIL_PIN = 34;       // ADC1, compatible with Wi-Fi operation
constexpr int DHT_PIN = 4;         // DHT11 data
constexpr int TANK_PIN = 27;      // float switch wired to GND when water present
constexpr int PUMP_PIN = 26;      // MOSFET module 3.3V logic input
constexpr bool ENABLE_PUMP = false; // intentionally false for safe first build
constexpr int PUMP_ACTIVE_LEVEL = HIGH;
constexpr int PUMP_INACTIVE_LEVEL = LOW;

// PLACEHOLDER values. Measure actual ADC in dry soil and saturated soil.
constexpr int RAW_DRY = 3100;
constexpr int RAW_WET = 1300;
constexpr float CRITICAL_DRY = 20.0;
constexpr float START_BELOW = 35.0;
constexpr float STOP_AT = 55.0;
constexpr unsigned long SAMPLE_PERIOD_MS = 5000UL;
constexpr unsigned long PULSE_MS = 4000UL;     // maximum single on-pulse
constexpr unsigned long COOLDOWN_MS = 30000UL; // pump must cool between pulses
constexpr unsigned long MAX_TOTAL_PUMP_MS = 20000UL; // per boot safety cap

DHT dht(DHT_PIN,DHT11);
unsigned long lastSample=0, lastPulse=0, pulseStart=0, totalPump=0;
bool pumpOn=false, hasPulsed=false;

void pumpOff(){
  digitalWrite(PUMP_PIN,PUMP_INACTIVE_LEVEL);
  if(pumpOn){totalPump += (millis()-pulseStart);}
  pumpOn=false;
}
void pumpStart(){
  if(!ENABLE_PUMP || pumpOn || totalPump+PULSE_MS>MAX_TOTAL_PUMP_MS)return;
  pumpOn=true; pulseStart=millis(); lastPulse=millis(); hasPulsed=true;
  digitalWrite(PUMP_PIN,PUMP_ACTIVE_LEVEL);
}
float wetnessFromRaw(int raw){
  // Clamped index 0=dry, 100=wet; not actual volumetric water content.
  return constrain(100.0f * (float)(RAW_DRY-raw) / (float)(RAW_DRY-RAW_WET),0.0f,100.0f);
}
void sendTelemetry(float wetness,float temperature,float humidity,bool sensorOK,bool tankOK){
  if(WiFi.status()!=WL_CONNECTED)return;
  HTTPClient http;
  if(!http.begin(SERVER_URL))return;
  http.setTimeout(3000);
  http.addHeader("Content-Type","application/json");
  http.addHeader("X-Device-Key",DEVICE_KEY);
  String json="{\"moisture\":"+String(wetness,1)
    +",\"temperature\":"+String(temperature,1)
    +",\"humidity\":"+String(humidity,1)
    +",\"sensor_valid\":"+(sensorOK ? "true" : "false")
    +",\"tank_has_water\":"+(tankOK ? "true" : "false")+"}";
  int code=http.POST(json);
  Serial.printf("Telemetry HTTP: %d\n",code);
  http.end(); // Response is an advisory. Never accept a remote motor-on instruction.
}
void setup(){
  Serial.begin(115200);
  pinMode(PUMP_PIN,OUTPUT);
  digitalWrite(PUMP_PIN,PUMP_INACTIVE_LEVEL); // fail-safe boot value
  pinMode(TANK_PIN,INPUT_PULLUP);
  pinMode(SOIL_PIN,INPUT);
  dht.begin();
  WiFi.mode(WIFI_STA);
  if(String(WIFI_SSID)!="YOUR_WIFI_SSID"){
    WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
    unsigned long started=millis();
    while(WiFi.status()!=WL_CONNECTED && millis()-started<4500){delay(100);}
  }
  Serial.println("MatiPulse: pump DISABLED by default pending calibration/tests");
}
void loop(){
  unsigned long now=millis();
  if(pumpOn && now-pulseStart>=PULSE_MS)pumpOff();
  if(now-lastSample<SAMPLE_PERIOD_MS)return;
  lastSample=now;
  int raw=analogRead(SOIL_PIN);
  // Check for gross electrical faults only. Plausible but wrong sensor readings
  // must still be detected through calibration and additional fault testing.
  bool sensorOK = raw > 80 && raw < 4010 && RAW_DRY > RAW_WET;
  bool tankOK = digitalRead(TANK_PIN)==LOW; // check actual float switch polarity
  float t=dht.readTemperature(), h=dht.readHumidity();
  bool environmentOK = !isnan(t) && !isnan(h);
  float wet = wetnessFromRaw(raw);
  if(!sensorOK || !tankOK || !environmentOK || totalPump>=MAX_TOTAL_PUMP_MS || wet>=STOP_AT){
    pumpOff();
  }else if(wet < START_BELOW && !pumpOn && (!hasPulsed || now-lastPulse>=COOLDOWN_MS)){
    pumpStart();
  }
  // All telemetry is report-only. Even if the network is down, local safety applies.
  Serial.printf("Wet index=%.1f raw=%d temp=%.1f hum=%.1f tank=%d sensor=%d pump=%d\n",
    wet,raw,t,h,tankOK,sensorOK,pumpOn);
  if(environmentOK)sendTelemetry(wet,t,h,sensorOK,tankOK);
}
