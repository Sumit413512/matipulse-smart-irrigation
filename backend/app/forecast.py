"""Optional forecast lookup. Never invent freshness or silently substitute weather."""
from datetime import datetime, timezone
import httpx

API = 'https://api.open-meteo.com/v1/forecast'

async def fetch_rain_probability(lat: float, lon: float):
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError('Invalid latitude or longitude.')
    async with httpx.AsyncClient(timeout=9.0) as client:
        res = await client.get(API, params={
            'latitude': lat, 'longitude': lon,
            'hourly': 'precipitation_probability',
            'forecast_hours': 6, 'timezone':'auto'
        })
        res.raise_for_status()
        data = res.json()
    values = data.get('hourly', {}).get('precipitation_probability', [])
    if len(values) < 3 or any(v is None for v in values[:3]):
        raise ValueError('Insufficient forecast data returned.')
    # Forecast probability is an advisory, NOT measured rainfall or a pump safety signal.
    return {
        'rain_probability_next_3h': round(max(float(v) for v in values[:3]), 1),
        'source': 'Open-Meteo',
        'fetched_utc': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'location': {'lat': lat, 'lon': lon},
        'interpretation': 'Maximum hourly precipitation probability over the next three forecast hours.'
    }
