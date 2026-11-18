"""SQLite stores simulated and hardware readings with explicit provenance."""
import json
import os
import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from .policy import Settings

DB_PATH = Path(os.environ.get('MATIPULSE_DB', str(Path(__file__).resolve().parents[1] / 'data' / 'matipulse.sqlite3')))

def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')

def connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=5)
    con.row_factory = sqlite3.Row
    return con

def initialize():
    with connection() as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_utc TEXT NOT NULL, kind TEXT NOT NULL,
          source TEXT NOT NULL, moisture REAL, temperature REAL,
          humidity REAL, rain_probability REAL, code TEXT,
          reason TEXT NOT NULL, estimated_ml REAL NOT NULL DEFAULT 0,
          data_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        ''')
        if not con.execute("SELECT 1 FROM config WHERE key='settings'").fetchone():
            con.execute("INSERT INTO config(key,value) VALUES('settings',?)", (json.dumps(vars(Settings())),))

def load_settings():
    with connection() as con:
        row = con.execute("SELECT value FROM config WHERE key='settings'").fetchone()
    if not row:
        initialize()
        return Settings()
    return Settings(**json.loads(row['value'])).validate()

def save_settings(s):
    s.validate()
    with connection() as con:
        con.execute("INSERT OR REPLACE INTO config(key,value) VALUES('settings',?)", (json.dumps(vars(s)),))

def event(kind, reading, decision, extra=None, estimated_ml=0):
    payload = extra or {}
    with connection() as con:
        con.execute('''INSERT INTO events
           (created_utc,kind,source,moisture,temperature,humidity,rain_probability,code,reason,estimated_ml,data_json)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)''', (
            utcnow(), kind, reading.source, reading.moisture, reading.temperature,
            reading.humidity, reading.rain_probability, decision.code,
            decision.reason_en, estimated_ml, json.dumps(payload, ensure_ascii=False)
        ))

def history(limit=50):
    with connection() as con:
        rows=con.execute('SELECT * FROM events ORDER BY id DESC LIMIT ?', (limit,)).fetchall()
    return [dict(r) for r in rows]

def summary():
    with connection() as con:
        row=con.execute("""SELECT COUNT(*) total_events,
           COALESCE(SUM(CASE WHEN kind='pulse' AND source='simulation' THEN estimated_ml ELSE 0 END),0) simulated_ml,
           COALESCE(SUM(CASE WHEN kind='pulse' AND source='hardware' THEN estimated_ml ELSE 0 END),0) hardware_estimated_ml,
           COALESCE(SUM(CASE WHEN kind='pulse' THEN 1 ELSE 0 END),0) pulses,
           COALESCE(SUM(CASE WHEN code IN ('EMERGENCY_STOP','SENSOR_FAULT','EMPTY_TANK') THEN 1 ELSE 0 END),0) safety_events
           FROM events""").fetchone()
    return dict(row)
