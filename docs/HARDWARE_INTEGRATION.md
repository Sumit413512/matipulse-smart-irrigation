# MatiPulse | Hardware integration plan (design freeze v1)

**Status:** specified and coded, **not yet purchased, assembled, calibrated or verified**.

## Bill of materials (indicative India retail estimate, not a live quotation)

| Item | Qty | Budget (₹) | Note |
|---|---:|---:|---|
| ESP32 DevKit V1 (30-pin) | 1 | 350–500 | Original ESP32 with ADC1 GPIO34 |
| Capacitive soil moisture sensor (analog) | 1 | 80–180 | Check 3.3 V output compatibility |
| DHT11 temperature/humidity sensor | 1 | 60–110 | DHT22 optional upgrade |
| Mini 5 V low-voltage DC pump | 1 | 100–200 | No mains-voltage pump |
| Logic-level MOSFET pump-driver module, flyback protected | 1 | 80–180 | Confirm 3.3V control input, rated pump stall current |
| Float switch / water level cutoff | 1 | 60–120 | Required for safe automatic physical demo |
| 5 V power adapter, adequate pump current | 1 | 120–220 | Separate protected pump supply; common reference ground where appropriate |
| Tubing, wires, breadboard, mount, reservoir | 1 set | 250–400 | Do not route pump current through breadboard traces |
| **Indicative total** |  | **₹1,100–₹1,910** | Shipping and spare parts may increase actual cost |

**Purchase gate:** verify the pump stall current, MOSFET current rating, actual float-switch polarity, power supply current, flyback protection, and sensor operating voltages before ordering. Avoid buying incompatible relay modules.

## Pin mapping — ESP32 DevKit V1

| Signal | ESP32 | Electrical note |
|---|---|---|
| Capacitive sensor analog output | GPIO34 (ADC1) | 0–3.3 V ADC input only; NEVER exceed 3.3 V |
| DHT11 data | GPIO4 | Use suitable pull-up; check breakout design |
| MOSFET driver logic input | GPIO26 | Driver must reliably switch from 3.3 V logic |
| Tank float switch | GPIO27 | INPUT_PULLUP; switch-to-GND means water present |
| Ground reference | GND | Share ground for compatible low-voltage modules |
| ESP32 power | USB | Do NOT power pump from an ESP32 GPIO/3.3 V pin |
| Pump supply | Separate regulated 5 V | Pump negative switched via rated driver, with proper flyback diode |

A physical emergency-stop switch that removes pump power is strongly recommended. The web emergency stop is only for **simulation** and does not cut physical power. Never assume software is a substitute for an electrical disconnect.

## Wiring / integration sequence

1. Verify the pump **cannot** run when controller is off or booting; test with driver and pump isolated.
2. Connect the soil sensor to GPIO34. Record several dry and wet raw ADC readings; replace `RAW_DRY` and `RAW_WET` placeholders in firmware.
3. Wire DHT11 and confirm stable temperature/humidity serial output.
4. Wire float switch so it reports water presence correctly. Test empty/full and disconnected behavior.
5. Wire a low-voltage MOSFET driver and pump to a suitable rated supply. Confirm driver off at boot.
6. Keep `ENABLE_PUMP=false` while testing sensor faults and the float switch. Only then consider enabling the test pump, with physical supervision.
7. Program the Wi-Fi SSID, API URL to your laptop's local IPv4 address, and a unique device token.
8. Run the backend on your LAN only after setting `MATIPULSE_DEVICE_KEY` and explicitly binding it to the correct private-network address. Never expose the prototype server to the public internet.
9. Use serial logs and `/api/events` to demonstrate telemetry. The backend **never** remotely turns the pump on. Physical actuation follows firmware-local safeguards.
10. Run repeated water-on/empty-tank/sensor-fault/stop tests and record authentic results for your report.

## Safety / implementation limits

- Firmware currently has **no physical E-stop input**, only software timeouts, sensor validity checks, tank interlock, and the compile-time `ENABLE_PUMP` flag. Use a real power-cut switch before enabling a pump.
- Sensor calibration is essential. A wetness index is not an agronomic soil moisture percentage or volumetric water content.
- DHT11, float switches, and inexpensive soil sensors may fail. Prototype safety checks are not industrial-grade.
- No field water-saving estimates or agronomic benefit claims are justified until real experiments.
- No solar power, GPS, SMS gateway, disease recognition, or cloud account is included in the MVP. These are future extensions.
