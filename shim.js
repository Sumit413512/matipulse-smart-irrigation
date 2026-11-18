/* MatiPulse browser-only simulation engine.
   Faithfully ports the MVP's safety-policy decisions; localStorage is per browser.
   NO hardware actuation and NO server-side database or shared telemetry. */
(() => {
 'use strict';
 const NATIVE_FETCH=window.fetch.bind(window);
 const STORE='matipulse-demo-2026-v3';
 const defaultSettings={dry_threshold:35,wet_threshold:55,critical_threshold:20,rain_advisory_threshold:70,pulse_seconds:4,simulated_pump_flow_ml_min:120};
 const defaultReading={moisture:42,temperature:29,humidity:63,rain_probability:72,sensor_valid:true,tank_has_water:true,weather_fresh:true,emergency_stop:false,source:'simulation',weather_source:'scenario'};
 let db;
 try {db=JSON.parse(localStorage.getItem(STORE)||'null')}catch{db=null}
 if(!db||typeof db!=='object') db={settings:{...defaultSettings},reading:{...defaultReading},stop_latched:false,weather:null,events:[]};
 db.settings={...defaultSettings,...(db.settings||{})}; db.reading={...defaultReading,...(db.reading||{})};
 db.events=Array.isArray(db.events)?db.events.slice(0,500):[];
 db.weatherHistory=Array.isArray(db.weatherHistory)?db.weatherHistory.slice(-120):[];
 db.weatherObservations=Array.isArray(db.weatherObservations)?db.weatherObservations.slice(-200):[];
 const persist=()=>{try{localStorage.setItem(STORE,JSON.stringify(db))}catch(e){console.warn('Local scenario storage unavailable',e)}};
 const now=()=>new Date().toISOString();
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 function evaluate(r,s){
  if(db.stop_latched) return decision('EMERGENCY_STOP',false,'STOP','Emergency stop is latched; pump output is disabled.','safety');
  if(!r.sensor_valid||!Number.isFinite(r.moisture)||r.moisture<0||r.moisture>100) return decision('SENSOR_FAULT',false,'STOP','Soil sensor is unavailable or invalid; watering disabled.','safety');
  if(!r.tank_has_water) return decision('EMPTY_TANK',false,'STOP','Reservoir indicates no water; prevent dry running.','safety');
  if(r.moisture<s.critical_threshold) return decision('DRY_CRITICAL',true,'WATER','Soil critically dry; recommend short irrigation pulse and reassessment.','irrigation');
  if(r.moisture<s.dry_threshold) return decision('IRRIGATE',true,'WATER','Soil below dry threshold; recommend a short pulse, then re-check moisture.','irrigation');
  if(r.moisture>=s.wet_threshold) return decision('WAIT_WET',false,'WAIT','Wetness exceeds upper threshold; no irrigation necessary.','normal');
  if(r.weather_fresh&&r.rain_probability>=s.rain_advisory_threshold) return decision('WAIT_RAIN',false,'WAIT','Soil is not dry; rain probability is high. Continue monitoring.','weather');
  return decision('WAIT_OK',false,'WAIT','Soil wetness adequate; reassess at the next observation.','normal');
 }
 const decision=(code,pump_allowed,status,reason_en,category)=>({code,pump_allowed,status,reason_en,category});
 function effectiveReading(){const r={...db.reading,emergency_stop:!!db.stop_latched};if(r.weather_source==='MULTI_MODEL'){const age=Date.now()-Date.parse(db.weather?.updated_at||0);if(!(age>=0&&age<90*60*1000) || !db.weather?.safe_to_defer)r.weather_fresh=false;}return r;}
 const current=()=>({reading:effectiveReading(),decision:evaluate(effectiveReading(),db.settings),settings:{...db.settings},weather:db.weather,operating_mode:'SIMULATION',hardware_latest:null,physical_pump_connected:false,storage:'browser-local'});
 function record(kind,metadata={},estimated_ml=0){const s=current();db.events.unshift({created_utc:now(),kind,source:s.reading.source||'simulation',moisture:s.reading.moisture,temperature:s.reading.temperature,humidity:s.reading.humidity,rain_probability:s.reading.rain_probability,code:s.decision.code,reason:s.decision.reason_en,estimated_ml,data_json:JSON.stringify(metadata)});db.events=db.events.slice(0,500);persist()}
 function validInput(p){for(const [k,lo,hi] of [['moisture',0,100],['temperature',-20,70],['humidity',0,100],['rain_probability',0,100]]){if(!Number.isFinite(p[k])||p[k]<lo||p[k]>hi)throw error(422,`Invalid ${k}.`)} }
 function error(status,detail){const e=new Error(detail);e.status=status;return e}
 const sum=()=>({total_events:db.events.length,pulses:db.events.filter(e=>e.kind==='pulse').length,simulated_ml:Math.round(db.events.filter(e=>e.kind==='pulse').reduce((x,e)=>x+Number(e.estimated_ml||0),0)*10)/10,safety_events:db.events.filter(e=>e.code==='SENSOR_FAULT'||e.code==='EMPTY_TANK'||e.code==='EMERGENCY_STOP').length});
 async function handler(path,method,payload){const pathname=path.split('?')[0];
  if(pathname==='/api/health')return{ok:true,simulation:true,hardware_actuation_enabled:false,storage:'browser-local'};
  if(pathname==='/api/status')return current();
  if(pathname==='/api/events')return db.events.slice(0,clamp(Number(new URLSearchParams(path.split('?')[1]||'').get('limit'))||40,1,500));
  if(pathname==='/api/summary')return sum();
  if(pathname==='/api/settings'&&method==='GET')return {...db.settings};
  if(pathname==='/api/settings'&&method==='PUT'){
    const s={...payload};if(!(s.critical_threshold>=0&&s.critical_threshold<s.dry_threshold&&s.dry_threshold<s.wet_threshold&&s.wet_threshold<=100))throw error(422,'Require 0 ≤ critical < dry < wet ≤ 100.');
    if(!(s.rain_advisory_threshold>=0&&s.rain_advisory_threshold<=100&&s.pulse_seconds>=1&&s.pulse_seconds<=10&&s.simulated_pump_flow_ml_min>=1&&s.simulated_pump_flow_ml_min<=2000))throw error(422,'Invalid rain, pulse, or flow settings.');
    db.settings=s;persist();return current();
  }
  if(pathname==='/api/simulate'&&method==='POST'){
    validInput(payload);db.reading={...defaultReading,...payload,emergency_stop:db.stop_latched,source:'simulation',weather_source:'scenario'};record('decision',{provenance:'user-controlled browser simulation'});return current();
  }
  if(pathname==='/api/pulse'&&method==='POST'){
    const s=current();const secs=Number(payload?.seconds);if(!Number.isInteger(secs)||secs<1||secs>10)throw error(422,'Pulse must be 1–10 seconds.');
    if(!s.decision.pump_allowed){record('blocked_pulse',{seconds_requested:secs});throw error(409,'Pump pulse blocked by safety/irrigation rules. '+s.decision.reason_en)}
    const estimated_ml=Math.round(db.settings.simulated_pump_flow_ml_min*secs/60*100)/100;
    record('pulse',{duration_seconds:secs,note:'Synthetic soil response and estimated volume, no water measured'},estimated_ml);
    db.reading.moisture=Math.min(100,Math.round((db.reading.moisture+1.5*secs)*10)/10);persist();
    return{simulated:true,estimated_ml,simulated_wetness_after:db.reading.moisture,status:current()};
  }
  if(pathname==='/api/emergency-stop'&&method==='POST'){db.stop_latched=true;record('emergency_stop');return current()}
  if(pathname==='/api/reset-stop'&&method==='POST'){db.stop_latched=false;record('reset_stop');return current()}
  if(pathname==='/api/ml/demo')return{available:false,reason:'Experimental Random Forest requires Python research backend. Synthetic holdout MAE 1.627 (baseline 3.495); not field-validated.'};
  if(pathname==='/api/fault-check'&&method==='POST'){record('fault_verification',payload);return{ok:true,recorded:true}}
  if(pathname==='/api/weather/refresh'&&method==='POST'){
    const lat=Number(payload?.lat),lon=Number(payload?.lon);
    if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)throw error(422,'Valid latitude and longitude are required.');
    let result;
    try{result=await window.MatiPulseWeather.fetchComparisons(lat,lon,db.settings.rain_advisory_threshold,db.weatherObservations,NATIVE_FETCH)}
    catch(e){db.weather={error:'Multi-model forecast failed: '+e.message,available:false};db.reading.weather_fresh=false;db.reading.weather_source='MULTI_MODEL';persist();throw error(503,'Weather sources unavailable; local safety logic remains usable.');}
    db.weather={...result,fetched_utc:result.updated_at,source:'Multi-model weather comparison'};
    db.weatherHistory.push(db.weather); db.weatherHistory=db.weatherHistory.filter(f=>Date.now()-Date.parse(f.updated_at||0)<8*86400000).slice(-120);
    db.reading.rain_probability=result.available?result.rain_probability_next_3h:0;
    // No irrigation postponement on a single provider, a tie, or a stale forecast.
    db.reading.weather_fresh=!!result.safe_to_defer;
    db.reading.weather_source='MULTI_MODEL';
    record('weather_update',{forecast:db.weather});persist();return current();
  }
  if(pathname==='/api/weather/history'&&method==='GET'){
    const observed=new Set(db.weatherObservations.map(o=>o.hour));
    const hours=new Set();
    for(const f of db.weatherHistory){for(const h of (f.forecast_hours||[])){
      if(Date.parse(h+'Z')<Date.now()-60000 && Date.now()-Date.parse(h+'Z')<7*86400000 && !observed.has(h) &&
      f.sources?.filter(x=>x.hourly?.some(z=>z.time===h)).length>=2)hours.add(h);
    }}
    return{hours:Array.from(hours).sort().reverse().slice(0,30),skill:window.MatiPulseWeather.skillFromObservations(db.weatherObservations)};
  }
  if(pathname==='/api/weather/verify'&&method==='POST'){
    const hour=String(payload?.hour||''),mm=Number(payload?.measured_mm);
    const eligible=db.weatherHistory.filter(f=>f.forecast_hours?.includes(hour)).sort((a,b)=>Date.parse(a.updated_at)-Date.parse(b.updated_at));
    if(!eligible.length)throw error(422,'No saved forecast for the selected hour.');
    let obs;try{obs=window.MatiPulseWeather.recordObservation(db.weatherObservations,eligible[0],hour,mm)}
    catch(e){throw error(422,e.message)}
    db.weatherObservations.push(obs);db.weatherObservations=db.weatherObservations.slice(-200);
    record('rain_observation',{hour,mm,source:'user-entered measured rainfall'});
    // Refresh visible skill summary; re-fetch forecasts to update weight-sensitive consensus.
    if(db.weather?.sources)db.weather.skill=window.MatiPulseWeather.skillFromObservations(db.weatherObservations,db.weather.sources.filter(f=>f.status==='ok').map(f=>f.id));
    persist();return{saved:true,observation:obs,skill:window.MatiPulseWeather.skillFromObservations(db.weatherObservations)};
  }
  throw error(404,`Route not found: ${pathname}`);
 }
 window.fetch=async(input,options={})=>{
   const path=typeof input==='string'?input:input.url;
   if(!path.startsWith('/api/'))return NATIVE_FETCH(input,options);
   let payload;try{payload=options.body?JSON.parse(options.body):null}catch{return new Response(JSON.stringify({detail:'Invalid JSON'}),{status:400,headers:{'Content-Type':'application/json'}})}
   try {const data=await handler(path,options.method||'GET',payload);return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})}
   catch(e){return new Response(JSON.stringify({detail:e.message}),{status:e.status||500,headers:{'Content-Type':'application/json'}})}
 };
 function csvCell(v){const s=String(v??'');return '"'+s.replaceAll('"','""')+'"'}
 window.MatiPulseExportCSV=()=>{
  const columns=['created_utc','kind','source','moisture','temperature','humidity','rain_probability','code','reason','estimated_ml','data_json'];
  const csv=[columns.join(','),...db.events.slice().reverse().map(r=>columns.map(k=>csvCell(r[k])).join(','))].join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='matipulse_weather_decision_events.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),800);
 };
 window.MatiPulseDemo={get state(){return current()},get events(){return db.events.slice()},evaluate};
 persist();
})();
