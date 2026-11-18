/* Dedicated simulation for the proposed hardware fault-verification research concept. */
(() => {
 'use strict';
 document.addEventListener('DOMContentLoaded',()=>{
  const area=document.querySelector('#insights');if(!area)return;
  const block=document.createElement('section');block.className='fault-section panel';block.id='verification';
  block.innerHTML=`<div class="panel-overline">09 / PROPOSED RESEARCH FEATURE</div><h3>Water-delivery fault verification lab</h3>
  <p>This scenario models how a future flow sensor and soil-response measurements could distinguish normal delivery from blocked pipes and poor soil response. <strong>Simulated only; no hardware verification.</strong></p>
  <div class="fault-options">
   <button class="quick fault-preset" data-flow="180" data-gain="9">✓ Normal delivery</button>
   <button class="quick fault-preset" data-flow="0" data-gain="0">⊘ Blocked pipe</button>
   <button class="quick fault-preset" data-flow="160" data-gain="0">⚠ No soil response</button>
  </div>
  <div class="fault-input-grid">
   <label>Measured flow (simulated mL/min)<input id="flowObserved" type="range" min="0" max="350" step="5" value="180"><b id="flowNumber">180 mL/min</b></label>
   <label>Post-pulse soil wetness change (index units)<input id="soilGain" type="range" min="0" max="20" step="1" value="9"><b id="gainNumber">+9 index</b></label>
   <label>Expected flow threshold (mL/min)<input id="flowFloor" type="number" min="1" max="300" value="40"></label>
   <label>Minimum response threshold (index units)<input id="gainFloor" type="number" min="0" max="19" value="3"></label>
  </div>
  <div class="fault-result" id="faultResult"><strong>Ready to assess</strong><span>Choose a test preset and evaluate the simulated observation.</span></div>
  <button class="btn primary" id="checkDelivery">Evaluate delivery evidence <span>→</span></button>
  <p class="fault-note">Engineering hypothesis: a commanded pulse with insufficient flow suggests delivery failure; observed flow with poor soil response suggests an infiltration, sensor-position, or measurement issue. These categories need real-water validation.</p>`;
  area.parentNode.insertBefore(block,area);
  const $=id=>document.getElementById(id);
  function update(){ $('flowNumber').textContent=$('flowObserved').value+' mL/min';$('gainNumber').textContent='+'+$('soilGain').value+' index'}
  ['flowObserved','soilGain'].forEach(id=>$(id).addEventListener('input',update));
  document.querySelectorAll('.fault-preset').forEach(btn=>btn.addEventListener('click',()=>{$('flowObserved').value=btn.dataset.flow;$('soilGain').value=btn.dataset.gain;update();$('checkDelivery').click()}));
  $('checkDelivery').addEventListener('click',async()=>{
   const flow=Number($('flowObserved').value),gain=Number($('soilGain').value),minFlow=Number($('flowFloor').value),minGain=Number($('gainFloor').value);
   if(!Number.isFinite(minFlow)||minFlow<1||!Number.isFinite(minGain)||minGain<0){$('faultResult').textContent='Enter valid positive thresholds.';return}
   let label,comment,tone;
   if(flow<minFlow){label='FAULT FLAG — FLOW TOO LOW';comment='Pump command with insufficient observed flow. Check reservoir, pump power, and obstruction.';tone='error'}
   else if(gain<minGain){label='CHECK REQUIRED — POOR SOIL RESPONSE';comment='Flow appears present, but the monitored soil wetness has not increased enough. Investigate seepage, emitter placement, and sensor lag.';tone='warn'}
   else{label='SIMULATED DELIVERY VERIFIED';comment='Both modeled flow and wetness response exceed their selected thresholds.';tone='success'}
   $('faultResult').className='fault-result '+tone;$('faultResult').innerHTML='<strong>'+label+'</strong><span>'+comment+'</span>';
   try{await fetch('/api/fault-check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({flow,gain,minFlow,minGain,label,simulation:true})})}catch(e){console.warn('Local fault log not saved',e)}
  });
 });
})();
