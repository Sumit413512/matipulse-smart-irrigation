/* MatiPulse soil-aware configuration and sensor-calibration math.
   Soil labels do not determine soil water-holding capacity or crop-specific targets.
   The browser simulator does not receive real sensor readings. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.MatiPulseSoil=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const TYPES=Object.freeze([
  {id:'black',name:'Black soil',description:'Often clay-rich with slower drainage, but properties differ by field. Measure this soil and select crop-specific thresholds; soil color alone cannot set a reliable watering schedule.'},
  {id:'red',name:'Red soil',description:'Texture and water retention vary widely across red soils. Some drain rapidly; others contain substantial clay. Calibrate this specific location before choosing watering limits.'},
  {id:'custom',name:'Other / custom soil',description:'For loam, sand, mixed soils, potting media and other locations. Create a profile from actual local calibration and crop needs rather than a generic preset.'}
 ]);
 const SOIL_IDS=new Set(TYPES.map(x=>x.id));
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 function assertSoilId(id){if(!SOIL_IDS.has(id))throw Error('Unknown soil type. Choose Black, Red or Other / custom.');return id;}
 function checkCalibration(dry_adc,wet_adc){
  if(!Number.isInteger(dry_adc)||!Number.isInteger(wet_adc)||dry_adc<0||dry_adc>4095||wet_adc<0||wet_adc>4095)
   throw Error('Dry and wet ADC reference values must be whole numbers from 0 to 4095.');
  if(Math.abs(dry_adc-wet_adc)<100)throw Error('Dry and wet reference values must differ by at least 100 ADC counts.');
  return {dry_adc,wet_adc};
 }
 function wetnessFromADC(adc,calibration){
  if(!calibration||calibration.dry_adc==null||calibration.wet_adc==null)throw Error('Save dry and wet ADC references for this soil first.');
  const {dry_adc,wet_adc}=checkCalibration(calibration.dry_adc,calibration.wet_adc);
  if(!Number.isInteger(adc)||adc<0||adc>4095)throw Error('Manual ADC input must be a whole number from 0 to 4095.');
  return Math.round(clamp(100*(adc-dry_adc)/(wet_adc-dry_adc),0,100)*10)/10;
 }
 function createProfiles(settings){
  return Object.fromEntries(TYPES.map(t=>[t.id,{id:t.id,name:t.name,settings:{...settings},calibration:null}]));
 }
 return Object.freeze({TYPES,assertSoilId,checkCalibration,wetnessFromADC,createProfiles});
});