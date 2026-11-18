import pytest
from app.policy import Reading, Settings, evaluate

@pytest.mark.parametrize('moisture,expected,allowed',[
  (10,'DRY_CRITICAL',True),(19.9,'DRY_CRITICAL',True),
  (20,'IRRIGATE',True),(34.9,'IRRIGATE',True),
  (35,'WAIT_RAIN',False),(54.9,'WAIT_RAIN',False),
  (55,'WAIT_WET',False),(95,'WAIT_WET',False)
])
def test_threshold_boundaries(moisture,expected,allowed):
    d=evaluate(Reading(moisture=moisture, rain_probability=88),Settings())
    assert (d.code,d.pump_allowed)==(expected,allowed)

@pytest.mark.parametrize('override,expected',[
    ({'emergency_stop':True},'EMERGENCY_STOP'),
    ({'sensor_valid':False},'SENSOR_FAULT'),
    ({'tank_has_water':False},'EMPTY_TANK'),
])
def test_safety_precedes_dryness(override,expected):
    d=evaluate(Reading(moisture=2,**override), Settings())
    assert d.code==expected and not d.pump_allowed

def test_stop_has_highest_priority():
    r=Reading(moisture=5,sensor_valid=False,tank_has_water=False,emergency_stop=True)
    assert evaluate(r,Settings()).code=='EMERGENCY_STOP'

def test_forecast_stale_or_dry_cannot_block_irrigation():
    assert evaluate(Reading(moisture=25,rain_probability=100),Settings()).pump_allowed
    assert evaluate(Reading(moisture=42,rain_probability=100,weather_fresh=False),Settings()).code=='WAIT_OK'

def test_boundaries_are_consistent():
    with pytest.raises(ValueError):Settings(critical_threshold=35,dry_threshold=35).validate()
    with pytest.raises(ValueError):Settings(dry_threshold=65,wet_threshold=55).validate()
