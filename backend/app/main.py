"""MatiPulse PBL prototype API. No physical pump control is exposed over the API."""
import csv
import httpx
import io
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from dataclasses import asdict, replace
from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ConfigDict
from pathlib import Path
from .policy import Reading, Settings, evaluate
from . import storage
from .forecast import fetch_rain_probability

ROOT = Path(__file__).resolve().parents[1]
STATE = {'reading': Reading(), 'hardware_latest': None, 'weather': None, 'stop_latched': False, 'pulses': 0}

@asynccontextmanager
async def lifespan(app: FastAPI):
    storage.initialize()
    yield

app = FastAPI(title='MatiPulse — Explainable Irrigation API', version='0.1.0', lifespan=lifespan)

class SimInput(BaseModel):
    moisture: float = Field(ge=0,le=100)
    temperature: float = Field(ge=-20,le=70)
    humidity: float = Field(ge=0,le=100)
    rain_probability: float = Field(ge=0,le=100)
    sensor_valid: bool = True
    tank_has_water: bool = True
    weather_fresh: bool = False
    # User cannot clear a latched emergency via this endpoint.

class SettingsInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    dry_threshold: float = Field(ge=0,le=100)
    wet_threshold: float = Field(ge=0,le=100)
    critical_threshold: float = Field(ge=0,le=100)
    rain_advisory_threshold: float = Field(ge=0,le=100)
    pulse_seconds: int = Field(ge=1,le=10)
    simulated_pump_flow_ml_min: float = Field(gt=0,le=2000)

class PulseInput(BaseModel):
    seconds: int = Field(ge=1,le=10)

class ForecastInput(BaseModel):
    lat: float = Field(ge=-90,le=90)
    lon: float = Field(ge=-180,le=180)

class HardwareInput(BaseModel):
    moisture: float = Field(ge=0,le=100)
    temperature: float = Field(ge=-20,le=70)
    humidity: float = Field(ge=0,le=100)
    sensor_valid: bool
    tank_has_water: bool
    # Hardware messages have their own safety source; server never commands motor ON.


def effective_reading():
    r = replace(STATE['reading'], emergency_stop=STATE['stop_latched'])
    # A successful network request is NOT permanently fresh.
    if r.weather_source == 'Open-Meteo':
        weather = STATE.get('weather') or {}
        try:
            fetched = datetime.fromisoformat(weather['fetched_utc'])
            age = (datetime.now(timezone.utc) - fetched).total_seconds()
            if not (0 <= age <= 3 * 3600):
                r = replace(r, weather_fresh=False)
        except (KeyError, TypeError, ValueError):
            r = replace(r, weather_fresh=False)
    return r

def current():
    r=effective_reading()
    d=evaluate(r, storage.load_settings())
    return {'reading':asdict(r), 'decision':asdict(d), 'settings':asdict(storage.load_settings()),
            'weather': STATE['weather'], 'operating_mode':'SIMULATION',
            'hardware_latest':STATE['hardware_latest'], 'physical_pump_connected': False}

@app.get('/api/health')
def health():
    return {'ok':True,'version':'0.1.0','hardware_actuation_enabled':False,'simulation':True}

@app.get('/api/status')
def status():
    return current()

@app.get('/api/summary')
def summary():
    return storage.summary()

@app.get('/api/events')
def events(limit:int=Query(40,ge=1,le=500)):
    return storage.history(limit)

@app.post('/api/simulate')
def simulate(payload: SimInput):
    # scenario inputs explicitly labeled; this does not send data to a physical ESP32
    STATE['reading'] = Reading(**payload.model_dump(),
                               emergency_stop=STATE['stop_latched'],
                               source='simulation', weather_source='scenario')
    r = STATE['reading']
    d = evaluate(r, storage.load_settings())
    storage.event('decision',r,d,{'provenance':'user-controlled simulation'})
    return current()

@app.post('/api/pulse')
def pulse(payload: PulseInput):
    r = effective_reading()
    d = evaluate(r,storage.load_settings())
    if not d.pump_allowed:
        storage.event('blocked_pulse',r,d,{'seconds_requested':payload.seconds})
        raise HTTPException(409,'Pump pulse blocked by irrigation/safety rules. '+d.reason_en)
    flow=storage.load_settings().simulated_pump_flow_ml_min
    volume=round(flow * payload.seconds / 60, 2)
    # synthetic response solely for demonstration; NOT a physical soil model.
    next_moisture = min(100, round(r.moisture + 1.5 * payload.seconds, 1))
    storage.event('pulse',r,d,{'duration_seconds': payload.seconds,
                 'synthetic_response':'wetness_index += 1.5 per second',
                 'water_volume_basis':'user-configured illustrative pump flow'},volume)
    STATE['reading']=replace(r, moisture=next_moisture)
    STATE['pulses']+=1
    return {'simulated':True,'estimated_ml':volume,'simulated_wetness_after':next_moisture,
            'note':'Illustrative response, not a measured water volume or real pump actuation.',
            'status':current()}

@app.post('/api/emergency-stop')
def emergency_stop():
    STATE['stop_latched']=True
    r=replace(STATE['reading'],emergency_stop=True)
    storage.event('emergency_stop',r,evaluate(r,storage.load_settings()))
    return current()

@app.post('/api/reset-stop')
def reset_stop():
    STATE['stop_latched']=False
    r=replace(STATE['reading'],emergency_stop=False)
    storage.event('reset_stop',r,evaluate(r,storage.load_settings()))
    return current()

@app.get('/api/settings')
def get_settings():
    return asdict(storage.load_settings())

@app.put('/api/settings')
def update_settings(data: SettingsInput):
    s=Settings(**data.model_dump())
    try: s.validate()
    except ValueError as exc: raise HTTPException(422,str(exc))
    storage.save_settings(s)
    return current()

@app.post('/api/weather/refresh')
async def weather_refresh(data: ForecastInput):
    try:
        result=await fetch_rain_probability(data.lat,data.lon)
    except (ValueError,httpx.HTTPError) as exc:
        # leave last scenario unchanged and clearly flag API failure
        STATE['weather']={'error':str(exc),'fresh':False,'source':'unavailable'}
        STATE['reading']=replace(STATE['reading'], weather_fresh=False)
        raise HTTPException(503, f'Weather unavailable. Offline decision rules remain available: {exc}')
    STATE['weather']={**result,'fresh':True}
    STATE['reading']=replace(STATE['reading'],
       rain_probability=result['rain_probability_next_3h'],
       weather_fresh=True, weather_source='Open-Meteo')
    r=replace(STATE['reading'],emergency_stop=STATE['stop_latched'])
    storage.event('weather_update',r,evaluate(r,storage.load_settings()),{'forecast':result})
    return current()

@app.post('/api/device/ingest')
def ingest(data: HardwareInput, x_device_key: str | None=Header(None)):
    expected=os.getenv('MATIPULSE_DEVICE_KEY','')
    if not expected or x_device_key != expected:
        raise HTTPException(401,'Device ingest disabled or unauthorized. Set MATIPULSE_DEVICE_KEY on server.')
    r=Reading(moisture=data.moisture,temperature=data.temperature,humidity=data.humidity,
        sensor_valid=data.sensor_valid,tank_has_water=data.tank_has_water,
        weather_fresh=False,source='hardware',weather_source='none', emergency_stop=STATE['stop_latched'])
    d=evaluate(r,storage.load_settings())
    STATE['hardware_latest']={'reading':asdict(r),'decision':asdict(d),'received_utc':storage.utcnow()}
    storage.event('hardware_reading',r,d,{'control':'hardware safety rules run locally on ESP32'})
    # Reporting only. Never issue a network pump-on command.
    return {'received':True,'advisory':d.code,'remote_pump_command':'NONE',
            'local_firmware_safety_required':True}

@app.get('/api/export.csv')
def export_csv():
    rows=storage.history(500)
    out=io.StringIO()
    writer=csv.writer(out)
    writer.writerow(['timestamp_utc','kind','source','wetness_index','temperature_c','humidity_pct',
                     'rain_probability_pct','decision_code','reason','estimated_ml','metadata_json'])
    for row in reversed(rows):
        writer.writerow([row[k] for k in ('created_utc','kind','source','moisture','temperature',
                      'humidity','rain_probability','code','reason','estimated_ml','data_json')])
    return StreamingResponse(iter([out.getvalue()]),media_type='text/csv',
        headers={'Content-Disposition':'attachment; filename="matipulse_events.csv"'})

@app.get('/api/ml/demo')
def ml_demo():
    try:
        from joblib import load
        from numpy import array
        model_path=ROOT/'ml'/'synthetic_model.joblib'
        report_path=ROOT/'ml'/'metrics.json'
        if not model_path.exists() or not report_path.exists():
            return {'available':False,'reason':'Run python ml/train_synthetic.py first.'}
        import json
        report=json.loads(report_path.read_text())
        r=STATE['reading']
        # Model is trained only on synthetic examples. No hardware-based validity claims.
        model=load(model_path)
        prediction=float(model.predict(array([[r.moisture,r.temperature,r.humidity,
                                               r.rain_probability,0]],dtype=float))[0])
        return {'available':True,'prediction_next_hour_wetness_index':round(max(0,min(100,prediction)),1),
                'data_origin':'synthetic only', 'validated_on_real_sensors':False,
                'metrics':report, 'disclaimer':'Illustrative ML; never controls the pump.'}
    except Exception as exc:
        return {'available':False,'reason':str(exc)}

app.mount('/',StaticFiles(directory=str(ROOT/'web'),html=True),name='web')
