import pytest
from fastapi.testclient import TestClient
from app import storage,main
from app.policy import Reading

@pytest.fixture()
def client(tmp_path,monkeypatch):
    monkeypatch.setattr(storage,'DB_PATH',tmp_path/'db.sqlite3')
    monkeypatch.delenv('MATIPULSE_DEVICE_KEY',raising=False)
    main.STATE.update({'reading':Reading(), 'hardware_latest':None,'weather':None,
                       'stop_latched':False,'pulses':0})
    with TestClient(main.app) as tc:
        yield tc

SCENE={'moisture':18,'temperature':27,'humidity':50,'rain_probability':0,
       'sensor_valid':True,'tank_has_water':True,'weather_fresh':False}

def test_simulation_then_pulse_and_history(client):
    assert client.get('/api/health').json()['hardware_actuation_enabled'] is False
    status=client.post('/api/simulate',json=SCENE)
    assert status.status_code==200
    assert status.json()['decision']['pump_allowed'] is True
    pulse=client.post('/api/pulse',json={'seconds':4})
    assert pulse.status_code==200
    assert pulse.json()['estimated_ml']==8
    assert pulse.json()['status']['reading']['moisture']==24
    history=client.get('/api/events').json()
    assert len(history)==2 and history[0]['kind']=='pulse'
    assert client.get('/api/summary').json()['simulated_ml']==8
    assert 'decision_code' in client.get('/api/export.csv').text

def test_emergency_stop_is_latched(client):
    client.post('/api/simulate',json=SCENE)
    assert client.post('/api/emergency-stop').json()['decision']['code']=='EMERGENCY_STOP'
    assert client.post('/api/pulse',json={'seconds':4}).status_code==409
    assert client.post('/api/simulate',json=SCENE).json()['decision']['code']=='EMERGENCY_STOP'
    assert client.post('/api/reset-stop').json()['decision']['pump_allowed'] is True

def test_empty_tank_sensor_fault_and_wet_lock(client):
    for override in [{'tank_has_water':False},{'sensor_valid':False},{'moisture':95}]:
        reading=dict(SCENE,**override)
        assert client.post('/api/simulate',json=reading).json()['decision']['pump_allowed'] is False
        assert client.post('/api/pulse',json={'seconds':5}).status_code==409

def test_settings_validation_and_persistence(client):
    settings=client.get('/api/settings').json()
    settings['dry_threshold']=40
    assert client.put('/api/settings',json=settings).status_code==200
    assert client.get('/api/settings').json()['dry_threshold']==40
    settings['wet_threshold']=20
    assert client.put('/api/settings',json=settings).status_code==422

def test_hardware_ingest_is_disabled_without_key(client):
    hardware={'moisture':33,'temperature':28,'humidity':61,
              'sensor_valid':True,'tank_has_water':True}
    assert client.post('/api/device/ingest',json=hardware).status_code==401

def test_hardware_ingest_is_authenticated_and_never_actuates(client,monkeypatch):
    monkeypatch.setenv('MATIPULSE_DEVICE_KEY','test-secret')
    hardware={'moisture':4,'temperature':29,'humidity':40,
              'sensor_valid':True,'tank_has_water':True}
    r=client.post('/api/device/ingest',json=hardware,headers={'X-Device-Key':'test-secret'})
    assert r.status_code==200
    assert r.json()['remote_pump_command']=='NONE'
    assert r.json()['advisory']=='DRY_CRITICAL'
    assert client.get('/api/status').json()['operating_mode']=='SIMULATION'

def test_static_ui_served(client):
    assert 'MatiPulse' in client.get('/').text
    assert 'MatiPulse' in client.get('/styles.css').text or 'stat-card' in client.get('/styles.css').text

def test_weather_success_is_advisory(client,monkeypatch):
    async def mocked_forecast(lat,lon):
        return {'rain_probability_next_3h':93.0,'source':'Open-Meteo',
                'fetched_utc':storage.utcnow(),'location':{'lat':lat,'lon':lon},
                'interpretation':'mock forecast for test'}
    monkeypatch.setattr(main,'fetch_rain_probability',mocked_forecast)
    res=client.post('/api/weather/refresh',json={'lat':18.5204,'lon':73.8567})
    assert res.status_code==200
    assert res.json()['reading']['weather_source']=='Open-Meteo'
    assert res.json()['reading']['rain_probability']==93.0
    assert res.json()['decision']['code']=='WAIT_RAIN'

def test_stale_forecast_does_not_affect_policy(client):
    from datetime import datetime,timezone,timedelta
    from dataclasses import replace
    main.STATE['reading']=replace(main.STATE['reading'],
        moisture=42,rain_probability=99,weather_source='Open-Meteo',weather_fresh=True)
    main.STATE['weather']={'fetched_utc':(datetime.now(timezone.utc)-timedelta(hours=4)).isoformat()}
    status=client.get('/api/status').json()
    assert status['reading']['weather_fresh'] is False
    assert status['decision']['code']=='WAIT_OK'
