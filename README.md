# MatiPulse — Smart Irrigation Software

MatiPulse is an explainable, safety-first smart-irrigation project, with a public browser-based simulation, experimental multi-model rainfall consensus, a separate local Python API/research prototype, and preliminary ESP32 firmware.

**Current public site**: https://matipulse-smart-irrigation.vercel.app

## What is implemented

- Interactive browser simulation: soil wetness, forecast scenarios, safety-first decision messages, virtual pump operation, emergency-stop state, fault-injection lab and local browser event history.
- **Black-soil, red-soil and custom-soil profiles** with independent local irrigation thresholds and optional user-entered dry/wet ADC references. Profiles do not automatically classify soil or estimate plant-available water. The manual ADC input demonstrates calibration math; it does not read physical hardware.
- Weather forecast comparison from **ECMWF IFS, NOAA GFS and DWD ICON** via Open-Meteo, for one selected location and the same three-hour interval.
- Forecast consensus with missing-model handling, disagreement warnings and conservative rain-postponement advice.
- Optional **local** historical scoring after users record enough actual hourly rainfall observations. Model weights are neutral until 20 comparable recorded observations exist for each model.
- Separate local FastAPI + SQLite backend and synthetic Random Forest research prototype under `backend/`.
- Proposed ESP32 firmware under `firmware/` with actual pump actuation **disabled by default**; it is not validated on physical hardware.

**Important:** The hosted site is a *simulation*; no physical pump or soil sensor is connected. Forecast-model agreement does not prove forecast accuracy; prediction skill requires independent measured observations. The separate Python backend and ESP32 firmware do not yet consume the public site's soil profiles. Their physical-soil calibration is pending. The separate Python backend is not connected to the public static site and must not be published without authentication and security review.

## Run the public static site

From the root directory:

```bash
python -m http.server 8080
```

Open http://localhost:8080. No npm packages are required.

## Verify weather logic

```bash
node test_weather.js
node test_soil.js
```

## Run local Python API (optional)

```bash
cd backend
python -m pip install -r requirements.txt
python ml/train_synthetic.py
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
python -m pytest -q
```

The backend is a separate **local experimental implementation**, not the live site's API. The weather consensus code is currently in the browser version; porting that logic to the server is future integration work.

## Repository map

| Path | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js`, `shim.js` | Hosted dashboard and browser-only simulator |
| `soil-profiles.js` | Per-soil profiles, ADC calibration and relative wetness conversion |
| `test_soil.js` | Soil profile validation and conversion tests |
| `weather-consensus.js` | Multi-source rainfall forecast comparison and local calibration |
| `fault-lab.js` | Delivery-fault simulation interface |
| `test_weather.js` | Deterministic JavaScript tests |
| `backend/app/` | Local FastAPI, policy, storage and single-source forecast prototype |
| `backend/ml/` | Synthetic experiment scripts and model artifact |
| `backend/tests/` | Python API and policy tests |
| `backend/web/` | Older local backend UI, distinct from the current public site |
| `firmware/` | Preliminary ESP32 firmware (unverified) |
| `docs/` | Hardware integration and wiring design |

## Hosting

The root-level static files can be deployed on free Cloudflare Pages or Vercel. Hosting publishes the dashboard and simulated controls, not the Python server or physical device firmware.

Weather information is provided by Open-Meteo, with underlying numerical forecast models from ECMWF, NOAA and DWD. Consult Open-Meteo's terms (especially noncommercial conditions and attribution), and do not rely solely on remote forecasts for safety-critical irrigation.

## GitHub publishing

See `scripts/publish_to_github.sh` for optional GitHub CLI commands. The repository creator must authenticate in their own GitHub account; do not paste access tokens into issue comments, chats or source files.