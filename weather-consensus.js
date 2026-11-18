/* MatiPulse multi-model weather analysis. Models are independent meteorological
   forecasts, but all are delivered by Open-Meteo; consensus != verified accuracy.
   All observations used for local scoring must be entered after the forecast hour. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.MatiPulseWeather=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const HOUR_MS=3600000;
 const DEFINITIONS=Object.freeze([
   {id:'ecmwf',label:'ECMWF IFS',organization:'European Centre for Medium-Range Weather Forecasts',endpoint:'https://api.open-meteo.com/v1/ecmwf',docs:'https://open-meteo.com/en/docs/ecmwf-api'},
   {id:'gfs',label:'NOAA GFS',organization:'US National Oceanic and Atmospheric Administration',endpoint:'https://api.open-meteo.com/v1/gfs',docs:'https://open-meteo.com/en/docs/gfs-api'},
   {id:'icon',label:'DWD ICON',organization:'German Weather Service',endpoint:'https://api.open-meteo.com/v1/dwd-icon',docs:'https://open-meteo.com/en/docs/dwd-api'}
 ]);
 const clamp=(v,a,b)=>Math.max(a,Math.min(v,b));
 const validP=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100;
 function targetHours(nowMs=Date.now(),count=3){
   const base=(Math.floor(nowMs/HOUR_MS)+1)*HOUR_MS;
   return Array.from({length:count},(_,i)=>new Date(base+i*HOUR_MS).toISOString().slice(0,16));
 }
 function parseProvider(def,body,hours){
   const hourly=body&&body.hourly||{},times=hourly.time||[],vals=hourly.precipitation_probability||[];
   const byTime=new Map(times.map((t,i)=>[String(t).slice(0,16),vals[i]]));
   const points=hours.map(t=>({time:t,probability:byTime.get(t)})).filter(x=>validP(x.probability));
   if(points.length<2)throw Error('Insufficient hourly probability data for selected time window');
   return {id:def.id,label:def.label,organization:def.organization,docs:def.docs,peak_hourly_probability:Math.max(...points.map(p=>p.probability)),hourly:points,status:'ok',hours_available:points.length};
 }
 function skillFromObservations(observations,modelIds=DEFINITIONS.map(d=>d.id)){
   const scores={};const weights={};const qualifying=[];
   modelIds.forEach(id=>{
    const pairs=(observations||[]).filter(o=>o&&o.sourceProbabilities&&validP(o.sourceProbabilities[id])&&(o.observed===0||o.observed===1));
    const n=pairs.length;
    const brier=n?pairs.reduce((a,o)=>a+Math.pow(o.sourceProbabilities[id]/100-o.observed,2),0)/n:null;
    const active=n>=20;
    scores[id]={count:n,brier_score:brier,active};
    if(active)qualifying.push(id);
   });
   // Do not use a mixture of learned and unevaluated scores; comparisons require
   // all participating models to have enough observations of the same outcome type.
   const learned=qualifying.length===modelIds.length && modelIds.length>=2;
   if(learned){
     const raw=modelIds.map(id=>1/(0.08+scores[id].brier_score));
     const total=raw.reduce((a,b)=>a+b,0);
     // Shrink learned weights toward equal weights; cap influence of one model.
     const shrunk=modelIds.map((id,i)=>0.5/modelIds.length + 0.5*raw[i]/total);
     modelIds.forEach((id,i)=>weights[id]=shrunk[i]);
   } else modelIds.forEach(id=>weights[id]=1/modelIds.length);
   return {learned,scores,weights,verification:'User-entered observed rainfall; not independently verified'};
 }
 function weightedMedian(items){
  const sorted=items.slice().sort((a,b)=>a.value-b.value);const total=sorted.reduce((s,a)=>s+a.weight,0);let soFar=0;
  for(const x of sorted){soFar+=x.weight;if(soFar>=total/2)return x.value;}
  return sorted[sorted.length-1].value;
 }
 function combine(forecasts,threshold=70,observations=[]){
  const good=forecasts.filter(f=>f.status==='ok'&&validP(f.peak_hourly_probability));
  const failed=forecasts.filter(f=>f.status!=='ok');
  if(!good.length)return {available:false,safe_to_defer:false,confidence:'unavailable',error:'No forecast model returned comparable probabilities.',sources:forecasts};
  const skill=skillFromObservations(observations,good.map(f=>f.id));
  const yes=good.filter(f=>f.peak_hourly_probability>=threshold);
  const yesWeight=yes.reduce((a,f)=>a+skill.weights[f.id],0);
  const spread=Math.max(...good.map(f=>f.peak_hourly_probability))-Math.min(...good.map(f=>f.peak_hourly_probability));
  const numeric=good.map(f=>({value:f.peak_hourly_probability,weight:skill.weights[f.id]}));
  const consensus=Math.round(weightedMedian(numeric));
  const weighted_mean=Math.round(good.reduce((a,f)=>a+f.peak_hourly_probability*skill.weights[f.id],0));
  const enough=good.length>=2;
  const majority=yes.length>good.length/2 || (good.length===2&&yes.length===2);
  const safe_to_defer=enough&&majority&&yesWeight>=0.6;
  return {
    available:true,sources:forecasts,available_count:good.length,failed_count:failed.length,
    rain_probability_next_3h:consensus,weighted_mean,probability_metric:'Peak one-hour precipitation probability among the next three forecast hours (NOT cumulative 3-hour probability)',
    threshold,yes_votes:yes.length,yes_weight:Number(yesWeight.toFixed(3)),total_votes:good.length,
    spread,confidence:!enough?'LOW — only one model':spread>35?'LOW — forecast disagreement':good.length===3&&spread<=15?'HIGH AGREEMENT':'MODERATE AGREEMENT',
    safe_to_defer,agreement:safe_to_defer?'Majority expects rain':'No trusted majority for rain',
    skill
  };
 }
 async function fetchComparisons(lat,lon,threshold,obs=[],fetcher,clock=Date.now()){
   if(!Number.isFinite(lat)||lat < -90||lat>90||!Number.isFinite(lon)||lon < -180||lon>180)throw Error('Latitude must be -90 to 90 and longitude -180 to 180');
   if(!Number.isFinite(threshold)||threshold<0||threshold>100)throw Error('Invalid rain advisory threshold');
   if(typeof fetcher!=='function')throw Error('Weather network function unavailable');
   const hours=targetHours(clock);
   const forecasts=await Promise.all(DEFINITIONS.map(async d=>{
     const url=new URL(d.endpoint);url.searchParams.set('latitude',String(lat));url.searchParams.set('longitude',String(lon));
     url.searchParams.set('hourly','precipitation_probability');url.searchParams.set('timezone','UTC');url.searchParams.set('forecast_hours','12');
     const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),9000);
     try {const res=await fetcher(url.toString(),{signal:controller.signal});
       if(!res.ok)throw Error('HTTP '+res.status);
       return parseProvider(d,await res.json(),hours);
     } catch(e){return {id:d.id,label:d.label,docs:d.docs,status:'unavailable',reason:String(e?.message||'Forecast unavailable').slice(0,140)};}
     finally{clearTimeout(timeout)}
   }));
   return {...combine(forecasts,threshold,obs),forecast_hours:hours,updated_at:new Date(clock).toISOString(),location:{lat,lon},sources_channel:'Open-Meteo API (three national weather forecasting models)'};
 }
 function recordObservation(store,forecast,hour,mm,nowMs=Date.now()){
   if(!forecast?.sources?.length)throw Error('Fetch a multi-model forecast before recording observations');
   if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(hour))throw Error('Select a valid forecast hour');
   const hourMs=Date.parse(hour+'Z');
   if(!Number.isFinite(hourMs)||hourMs>nowMs-60000||nowMs-hourMs>7*24*HOUR_MS)throw Error('Only elapsed forecast hours (within seven days) can be verified');
   if(!Number.isFinite(mm)||mm<0||mm>500)throw Error('Measured hourly precipitation must be between 0 and 500 mm');
   const probabilityPairs={};for(const f of forecast.sources){const p=f.hourly?.find(x=>x.time===hour)?.probability;if(validP(p))probabilityPairs[f.id]=p;}
   if(Object.keys(probabilityPairs).length<2)throw Error('At least two models must have forecast the same hour');
   const issuedAt=Date.parse(forecast.updated_at);
   if(!Number.isFinite(issuedAt)||issuedAt>=hourMs)throw Error('Only observations matched to earlier forecasts may be scored');
   if((store||[]).some(o=>o.hour===hour))throw Error('This forecast hour is already in the local evaluation log');
   return {hour,observed:mm>0.1?1:0,measured_mm:mm,sourceProbabilities:probabilityPairs,recorded_at:new Date(nowMs).toISOString(),provenance:'user-entered precipitation measurement'};
 }
 return Object.freeze({DEFINITIONS,targetHours,parseProvider,combine,skillFromObservations,fetchComparisons,recordObservation});
});
