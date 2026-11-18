"""Testable safety-first controller. Wetness is a *relative calibrated index*, not VWC."""
from dataclasses import dataclass, asdict
from typing import Literal

DecisionCode = Literal['EMERGENCY_STOP', 'SENSOR_FAULT', 'EMPTY_TANK', 'DRY_CRITICAL', 'IRRIGATE', 'WAIT_RAIN', 'WAIT_WET', 'WAIT_OK']

@dataclass
class Settings:
    dry_threshold: float = 35.0
    wet_threshold: float = 55.0
    critical_threshold: float = 20.0
    rain_advisory_threshold: float = 70.0
    pulse_seconds: int = 4
    simulated_pump_flow_ml_min: float = 120.0

    def validate(self):
        if not 0 <= self.critical_threshold < self.dry_threshold < self.wet_threshold <= 100:
            raise ValueError('Require 0 ≤ critical < dry < wet ≤ 100.')
        if not 0 <= self.rain_advisory_threshold <= 100:
            raise ValueError('Rain threshold must be between 0 and 100.')
        if not 1 <= self.pulse_seconds <= 10:
            raise ValueError('Pulse must be 1–10 seconds.')
        if not 1 <= self.simulated_pump_flow_ml_min <= 2000:
            raise ValueError('Illustrative pump flow must be 1–2000 mL/min.')
        return self

@dataclass
class Reading:
    moisture: float = 42.0
    temperature: float = 29.0
    humidity: float = 63.0
    rain_probability: float = 72.0
    sensor_valid: bool = True
    tank_has_water: bool = True
    weather_fresh: bool = True
    emergency_stop: bool = False
    source: str = 'simulation'
    weather_source: str = 'scenario'

@dataclass
class Decision:
    code: DecisionCode
    pump_allowed: bool
    status: str
    reason_en: str
    category: str


def evaluate(r: Reading, s: Settings) -> Decision:
    """Safety overrides first; forecast never overrides critically dry soil."""
    s.validate()
    if r.emergency_stop:
        return Decision('EMERGENCY_STOP', False, 'STOP', 'Emergency stop is latched; pump output is disabled.', 'safety')
    if not r.sensor_valid or not 0 <= r.moisture <= 100:
        return Decision('SENSOR_FAULT', False, 'STOP', 'Soil sensor reading is missing or invalid; pump output is disabled.', 'safety')
    if not r.tank_has_water:
        return Decision('EMPTY_TANK', False, 'STOP', 'Reservoir empty or level switch indicates no water; pump output is disabled.', 'safety')
    if r.moisture < s.critical_threshold:
        return Decision('DRY_CRITICAL', True, 'WATER', 'Soil is critically dry; recommend a short controlled irrigation pulse, followed by reassessment.', 'irrigation')
    if r.moisture < s.dry_threshold:
        return Decision('IRRIGATE', True, 'WATER', 'Soil is below the dry threshold; recommend a short pulse, then re-check moisture.', 'irrigation')
    if r.moisture >= s.wet_threshold:
        return Decision('WAIT_WET', False, 'WAIT', 'Soil is at or above the upper wetness threshold; no watering needed.', 'normal')
    if r.weather_fresh and r.rain_probability >= s.rain_advisory_threshold:
        return Decision('WAIT_RAIN', False, 'WAIT', 'Soil is not dry; near-term rain probability is high. Continue monitoring.', 'weather')
    return Decision('WAIT_OK', False, 'WAIT', 'Soil moisture is adequate; reassess during the next monitoring cycle.', 'normal')


def as_dict(v):
    return asdict(v)
