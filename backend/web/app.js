'use strict';
const $ = id => document.getElementById(id);
const API = '/api';
let state = null, settings = null, lastEvents = [];
const scenarioMap = {
  dry:{moisture:18,temperature:31,humidity:37,rain_probability:24,sensor_valid:true,tank_has_water:true,weather_fresh:true},
  wet:{moisture:78,temperature:26,humidity:68,rain_probability:26,sensor_valid:true,tank_has_water:true,weather_fresh:true},
  rain:{moisture:43,temperature:27,humidity:78,rain_probability:88,sensor_valid:true,tank_has_water:true,weather_fresh:true},
  fault:{moisture:25,temperature:29,humidity:54,rain_probability:18,sensor_valid:false,tank_has_water:true,weather_fresh:false},
  offline:{moisture:29,temperature:35,humidity:40,rain_probability:95,sensor_valid:true,tank_has_water:true,weather_fresh:false}
};
const translations = {
 en:{
   EMERGENCY_STOP:['STOP — Emergency override','Emergency stop is latched. Pump operation is disabled until explicitly reset.'],
   SENSOR_FAULT:['STOP — Invalid sensor','The soil sensor is unavailable or invalid. Watering is blocked for safety.'],
   EMPTY_TANK:['STOP — Reservoir empty','Water tank indicates no water. Preventing dry running.'],
   DRY_CRITICAL:['WATER — Critically dry soil','Soil is critically dry. A short, safeguarded irrigation pulse is recommended, then re-evaluate.'],
   IRRIGATE:['WATER — Soil below dry limit','The wetness index is below its configured threshold. Apply a short pulse and re-check.'],
   WAIT_RAIN:['WAIT — Rain is possible','Soil is not dry; a fresh advisory reports a high chance of rain. Reassess soon.'],
   WAIT_WET:['WAIT — Sufficiently wet','Soil meets or exceeds the upper wetness threshold. No watering needed.'],
   WAIT_OK:['WAIT — Adequate moisture','Soil wetness is adequate. Reassess at the next measurement.']},
 hi:{
   EMERGENCY_STOP:['बंद — आपातकालीन रोक','आपातकालीन रोक सक्रिय है। रीसेट करने तक पंप बंद रहेगा।'],
   SENSOR_FAULT:['बंद — सेंसर त्रुटि','मिट्टी के सेंसर का डेटा मान्य नहीं है। सुरक्षा के लिए सिंचाई बंद है।'],
   EMPTY_TANK:['बंद — पानी नहीं है','टंकी खाली है। पंप को सूखा चलने से रोका गया है।'],
   DRY_CRITICAL:['पानी दें — मिट्टी बहुत सूखी','मिट्टी बहुत सूखी है। थोड़ी देर पानी देकर फिर जाँचें।'],
   IRRIGATE:['पानी दें — नमी कम','मिट्टी में नमी निर्धारित सीमा से कम है। थोड़ी सिंचाई के बाद फिर जाँचें।'],
   WAIT_RAIN:['रुकें — बारिश संभव','नमी पर्याप्त है और ताज़ा पूर्वानुमान में बारिश की संभावना है।'],
   WAIT_WET:['रुकें — नमी अधिक','मिट्टी में पर्याप्त नमी है। अभी सिंचाई जरूरी नहीं है।'],
   WAIT_OK:['रुकें — नमी पर्याप्त','अभी मिट्टी में नमी पर्याप्त है। बाद में दोबारा जाँचें।']},
 mr:{
   EMERGENCY_STOP:['बंद — आपत्कालीन थांबा','आपत्कालीन थांबा सक्रिय आहे. रीसेट होईपर्यंत पंप बंद राहील.'],
   SENSOR_FAULT:['बंद — सेन्सर त्रुटी','मातीच्या सेन्सरची माहिती वैध नाही. सुरक्षिततेसाठी पाणी बंद आहे.'],
   EMPTY_TANK:['बंद — टाकी रिकामी','टाकीत पाणी नाही. पंप कोरडा चालू नये म्हणून बंद आहे.'],
   DRY_CRITICAL:['पाणी द्या — माती फार कोरडी','माती खूप कोरडी आहे. थोडावेळ पाणी देऊन पुन्हा तपासा.'],
   IRRIGATE:['पाणी द्या — ओलावा कमी','मातीतील ओलावा मर्यादेपेक्षा कमी आहे. थोडे पाणी देऊन पुन्हा तपासा.'],
   WAIT_RAIN:['थांबा — पावसाची शक्यता','मातीत ओलावा पुरेसा आहे आणि पावसाचा ताजा अंदाज आहे.'],
   WAIT_WET:['थांबा — माती ओलसर','मातीत पुरेसा ओलावा आहे. सध्या पाणी देण्याची गरज नाही.'],
   WAIT_OK:['थांबा — पुरेसा ओलावा','मातीत पुरेसा ओलावा आहे. नंतर पुन्हा तपासा.']}
};
function toast(message, error=false){const el=$('toast');el.textContent=message;el.className='toast visible'+(error?' error':'');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.className='toast',4100)}
async function request(path,method='GET',payload=null){
 const opts={method,headers:{}};
 if(payload!==null){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(payload)}
 let response;
 try{response=await fetch(API+path,opts)}catch(e){throw Error('Cannot reach backend. Start the server using start.sh or python -m uvicorn app.main:app --reload.')}
 if(!response.ok){let result;try{result=await response.json()}catch{}throw Error(typeof result?.detail==='string'?result.detail: `API error ${response.status}`)}
 return response.json();
}
function updateInputs(reading){
 const pairs={moisture:'moisture',rain_probability:'rain',temperature:'temp',humidity:'humidity'};
 Object.entries(pairs).forEach(([key,id])=>$(id).value=reading[key]);
 $('sensorValid').checked=reading.sensor_valid;$('tankHasWater').checked=reading.tank_has_water;$('weatherFresh').checked=reading.weather_fresh;
 updateSliderNumbers();
}
function updateSliderNumbers(){
 $('moistValue').textContent=$('moisture').value+' / 100';$('rainValue').textContent=$('rain').value+'%';
 $('tempValue').textContent=$('temp').value+'°C';$('humValue').textContent=$('humidity').value+'%';
}
function inputPayload(){return {
 moisture:Number($('moisture').value),temperature:Number($('temp').value),humidity:Number($('humidity').value),rain_probability:Number($('rain').value),
 sensor_valid:$('sensorValid').checked,tank_has_water:$('tankHasWater').checked,weather_fresh:$('weatherFresh').checked
}}
function putSettings(s){settings=s;const fields={criticalThreshold:'critical_threshold',dryThreshold:'dry_threshold',wetThreshold:'wet_threshold',rainThreshold:'rain_advisory_threshold',pulseSeconds:'pulse_seconds',pumpFlow:'simulated_pump_flow_ml_min'};Object.entries(fields).forEach(([el,key])=>$(el).value=s[key]);}
function displayStatus(data,updateControls=true){
 state=data;const {reading:r,decision:d}=data;
 if(updateControls)updateInputs(r);
 $('wetCard').textContent=r.moisture;$('tempCard').textContent=r.temperature;$('rainCard').textContent=r.rain_probability;
 $('stateCard').textContent=d.status;
 const chip=$('stateChip');chip.textContent=d.pump_allowed?'WATER RECOMMENDED':d.category==='safety'?'SAFETY LOCK ACTIVE':'NO WATER NEEDED';chip.className='status-chip '+(d.pump_allowed?'warn':d.category==='safety'?'stop':'');
 const lang=$('language').value, msg=translations[lang]?.[d.code]||translations.en[d.code];
 $('verdictHead').textContent=msg[0];$('verdictReason').textContent=msg[1];
 $('verdictIcon').textContent=d.pump_allowed?'↗':d.category==='safety'?'!':'✓';
 $('safetyText').textContent=d.category==='safety'?'⚠ Pump safety lock':'✓ Safety checks passed';
 $('forecastText').textContent=r.weather_fresh?'◷ Forecast advisory available':'⌁ Offline / no valid forecast';
 $('pulseBtn').disabled=!d.pump_allowed;
 $('pumpText').textContent=d.category==='safety'?'Pump safety lock':d.pump_allowed?'Irrigation recommended':'Pump standby';
 $('pumpDesc').textContent='Virtual actuation only — no motor connected';
 $('weatherBadge').textContent=r.weather_source==='Open-Meteo'?'LIVE API':'SCENARIO';
 $('inputMode').textContent=data.operating_mode==='SIMULATION'?'MOCK INPUTS':'HARDWARE';
 $('lastUpdated').textContent='Updated '+new Date().toLocaleTimeString();
 if(data.settings && !settings)putSettings(data.settings);
 if(data.weather){$('weatherResult').textContent=data.weather.error||`Open-Meteo · ${data.weather.rain_probability_next_3h}% peak hourly precipitation chance (next 3h) · fetched ${new Date(data.weather.fetched_utc).toLocaleString()}`;}
}
function chartDraw(events){
 const recorded=events.filter(e=>e.moisture!=null&&['decision','pulse','hardware_reading','weather_update'].includes(e.kind)).slice(0,30).reverse();
 const svg=$('wetnessChart');if(recorded.length<2){svg.innerHTML='<text x="315" y="87" text-anchor="middle" fill="#84978e" font-size="13">Record two scenarios to display the graph</text>';return;}
 const points=recorded.map((e,i)=>[28+(i*574/(recorded.length-1)),158-(e.moisture*1.36)]);
 const line=points.map(p=>p.join(',')).join(' '),area=`${points[0][0]},158 ${line} ${points[points.length-1][0]},158`;
 svg.innerHTML=`<defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#69caa0" stop-opacity=".22"/><stop offset="1" stop-color="#69caa0" stop-opacity="0"/></linearGradient></defs>`+
 [0,25,50,75,100].map(v=>`<line x1="25" y1="${158-v*1.36}" x2="615" y2="${158-v*1.36}" stroke="#ebf1eb" stroke-dasharray="4 5"/><text x="3" y="${162-v*1.36}" font-size="9" fill="#9aaea0">${v}</text>`).join('')+
 `<polygon points="${area}" fill="url(#chartFill)"/><polyline points="${line}" fill="none" stroke="#36aa7b" stroke-linejoin="round" stroke-linecap="round" stroke-width="3"/>`+
 points.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="#278d62"/>`).join('');
}
function logDraw(events){lastEvents=events;chartDraw(events);const body=$('logs');
 if(!events.length){body.innerHTML='<tr><td colspan="4">No events recorded yet</td></tr>';return;}
 body.innerHTML=events.slice(0,12).map(e=>`<tr><td>${escapeHtml(e.created_utc.slice(11,19))}</td><td>${escapeHtml(e.kind.replaceAll('_',' '))}</td><td>${e.moisture==null?'—':e.moisture+' / 100'}</td><td>${escapeHtml(e.code||'—')}</td></tr>`).join('');}
function escapeHtml(v){return String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
async function refreshExtras(){const [events,summary,ml]=await Promise.all([request('/events?limit=50'),request('/summary'),request('/ml/demo')]);logDraw(events);
 $('eventCount').textContent=summary.total_events;$('pulseCount').textContent=summary.pulses;
 $('waterUsed').textContent=Number(summary.simulated_ml).toFixed(1);$('safetyCount').textContent=summary.safety_events;
 if(ml.available){$('mlValue').textContent=ml.prediction_next_hour_wetness_index;$('mlNote').textContent=`Trained on synthetic data only. Test MAE: ${ml.metrics.model_mae.toFixed(2)} index points; naive baseline: ${ml.metrics.baseline_mae.toFixed(2)}. Not real-world validated; never controls the pump.`}
 else{$('mlValue').textContent='—';$('mlNote').textContent='Optional synthetic forecasting not available. '+(ml.reason||'No model trained.')} }
async function fullRefresh(){const s=await request('/status');displayStatus(s);putSettings(s.settings);await refreshExtras();$('serverDot').classList.add('online');$('apiStatus').textContent='Local API connected';}
async function act(task,success){try{const result=await task();if(result?.decision)displayStatus(result);else if(result?.status)displayStatus(result.status);await refreshExtras();if(success)toast(success);return result}catch(e){toast(e.message,true);return null}}
async function evaluateInputs(){return act(()=>request('/simulate','POST',inputPayload()),'Scenario evaluated and saved to the event log.')}
function useScene(name){const p=scenarioMap[name];if(!p)return;updateInputs(p);evaluateInputs()}
function hooks(){
 ['moisture','rain','temp','humidity'].forEach(id=>$(id).addEventListener('input',updateSliderNumbers));
 $('evaluateBtn').addEventListener('click',evaluateInputs);
 document.querySelectorAll('[data-scenario]').forEach(btn=>btn.addEventListener('click',()=>useScene(btn.dataset.scenario)));
 $('heroDry').addEventListener('click',()=>{useScene('dry');$('lab').scrollIntoView({behavior:'smooth',block:'start'})});
 $('pulseBtn').addEventListener('click',async()=>{
  const seconds=Number($('pulseSeconds').value)||settings?.pulse_seconds||4;
  await act(()=>request('/pulse','POST',{seconds}),`Simulated ${seconds}s pulse recorded. No physical water was delivered.`);
 });
 $('stopBtn').addEventListener('click',()=>act(()=>request('/emergency-stop','POST'),'Emergency stop latched. Simulated watering blocked.'));
 $('resetBtn').addEventListener('click',()=>act(()=>request('/reset-stop','POST'),'Emergency-stop latch cleared. Other safety checks remain active.'));
 $('language').addEventListener('change',()=>{if(state)displayStatus(state,false)});
 $('saveSettings').addEventListener('click',()=>{
  const payload={critical_threshold:Number($('criticalThreshold').value),dry_threshold:Number($('dryThreshold').value),wet_threshold:Number($('wetThreshold').value),rain_advisory_threshold:Number($('rainThreshold').value),pulse_seconds:Number($('pulseSeconds').value),simulated_pump_flow_ml_min:Number($('pumpFlow').value)};
  act(()=>request('/settings','PUT',payload),'Thresholds saved. Recalibrate before using real hardware.').then(result=>{if(result?.settings)putSettings(result.settings)});
 });
 $('getWeather').addEventListener('click',async()=>{
  const lat=Number($('lat').value),lon=Number($('lon').value);
  const result=await act(()=>request('/weather/refresh','POST',{lat,lon}),'Forecast fetched. This is an advisory, not measured rainfall.');
  if(!result)$('weatherResult').textContent='Forecast request failed. Local rules and manual scenarios are still available.';
 });
 $('exportBtn').addEventListener('click',()=>window.location.assign('/api/export.csv'));
 $('reloadBtn').addEventListener('click',()=>fullRefresh().catch(e=>toast(e.message,true)));
 document.querySelectorAll('.nav a').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.nav a').forEach(n=>n.classList.remove('active'));a.classList.add('active')}));
}
window.addEventListener('DOMContentLoaded',()=>{hooks();fullRefresh().catch(e=>{toast(e.message,true);$('apiStatus').textContent='API unavailable'})});
