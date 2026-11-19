const assert=require('node:assert/strict');
const soil=require('./soil-profiles.js');
const base={critical_threshold:20,dry_threshold:35,wet_threshold:55};
const profiles=soil.createProfiles(base);
assert.deepEqual(Object.keys(profiles),['black','red','custom']);
assert.equal(profiles.red.settings.dry_threshold,35);
assert.equal(profiles.black.settings.dry_threshold,35);
profiles.red.settings.dry_threshold=40;
assert.equal(profiles.black.settings.dry_threshold,35); // profile settings isolated
assert.equal(soil.assertSoilId('red'),'red');
assert.throws(()=>soil.assertSoilId('auto'),'Unknown soil type');
assert.deepEqual(soil.checkCalibration(3100,1300),{dry_adc:3100,wet_adc:1300});
assert.deepEqual(soil.checkCalibration(600,3400),{dry_adc:600,wet_adc:3400});
for(const values of [[200,200],[1400,1450],[-1,3000],[0,4100],[NaN,2000],[12.5,3000]])
 assert.throws(()=>soil.checkCalibration(...values));
assert.equal(soil.wetnessFromADC(3100,{dry_adc:3100,wet_adc:1300}),0);
assert.equal(soil.wetnessFromADC(2200,{dry_adc:3100,wet_adc:1300}),50);
assert.equal(soil.wetnessFromADC(1300,{dry_adc:3100,wet_adc:1300}),100);
assert.equal(soil.wetnessFromADC(4000,{dry_adc:3100,wet_adc:1300}),0);
assert.equal(soil.wetnessFromADC(0,{dry_adc:3100,wet_adc:1300}),100);
assert.equal(soil.wetnessFromADC(2000,{dry_adc:600,wet_adc:3400}),50);
assert.equal(soil.wetnessFromADC(100,{dry_adc:600,wet_adc:3400}),0);
assert.equal(soil.wetnessFromADC(4095,{dry_adc:600,wet_adc:3400}),100);
assert.throws(()=>soil.wetnessFromADC(2000,null));
assert.throws(()=>soil.wetnessFromADC(12.5,{dry_adc:3100,wet_adc:1300}));
assert.throws(()=>soil.wetnessFromADC(4096,{dry_adc:3100,wet_adc:1300}));
console.log('Soil profiles: calibration and settings tests passed.');