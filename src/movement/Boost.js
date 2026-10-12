// Boost: the charged boost, "brake, compress, RELEASE", as an explicit state machine layered ON TOP of the existing flight model.
// The flight model itself (inertia, steering, vertical command, banking) is untouched: this module only changes the speed multiplier, how fast
// speed builds/drops, and exposes a small view (charge / burst 0..1) for the camera, pose, effects, audio and HUD to read.
//
//   READY ──hold longer than tapT──> CHARGING ──release (charge >= minCharge)──> BURST ──> RECOVER ──> READY (after a short cooldown)
//     │ quick tap (< tapT) = the ORIGINAL boost toggle, unchanged         │ release too early = cancelled, no burst, tiny cooldown
//     └ landing / entering water / a hard hit cancels a charge            └ full charge held for fullHold, or held for maxHold: it fires by itself
//
// Forgiving by design: no stamina; you cannot get stuck charging (maxHold); after an auto-fire you must let go before charging again.
// Everything is in CFG so it can be tuned against real traversal distances (the island chain is ~6 km across).
const Boost=(()=>{
  const CFG={
    tapT:.18,            // s: shorter than this is a tap (toggles the old continuous boost)
    chargeT:1.05,        // s from first charging to full charge
    minCharge:.25,       // below this, releasing just cancels
    maxHold:2.0,         // s: held this long it fires by itself
    fullHold:.4,         // s at full charge before it fires by itself
    brake:.42,           // speed multiplier at full charge: you slow right down but keep steering
    brakeRate:5.5,       // 1/s: how hard you brake while charging (normal glide-out is 3.2)
    peakMul:[2.0,3.2],   // burst peak speed relative to normal boost (70 m/s): min charge .. full charge => 140 .. 224 m/s
    rise:.1,             // s: how sharp the launch is
    durMin:.5,durMax:1.15,   // s: burst length for min .. full charge
    recover:.7,          // s of recovery (boost level, then the normal glide-out)
    cooldown:.3,         // s before you can charge again
    upRate:14,           // 1/s: acceleration rate during the burst (normal flight is 4)
    hurtCancel:.3        // a hit this hard cancels a charge
  };
  const sm=x=>x<=0?0:x>=1?1:x*x*(3-2*x);
  const st={mode:'ready',pressed:false,hold:0,needRelease:false,charge:0,full:0,t:0,dur:1,peak:2,rec:0,cd:0,ev:0,launch:0};
  const view={charge:0,burst:0,mode:'ready',ev:0,launch:0};
  function reset(cd){st.mode='ready';st.charge=0;st.full=0;st.t=0;st.rec=0;st.cd=cd||0}
  function press(){if(st.pressed)return;st.pressed=true;st.hold=0}
  function release(S){
    if(!st.pressed)return;st.pressed=false;st.needRelease=false;
    if(st.mode==='charging'){if(st.charge>=CFG.minCharge)fire();else reset(.15)}
    else if(st.hold<CFG.tapT&&st.mode==='ready'&&S)S.boost=!S.boost}             // a quick tap is the original toggle
  function fire(){
    st.launch=st.charge;st.peak=CFG.peakMul[0]+(CFG.peakMul[1]-CFG.peakMul[0])*st.charge;st.dur=CFG.durMin+(CFG.durMax-CFG.durMin)*st.charge;
    st.mode='burst';st.t=0;st.charge=0;st.full=0;st.ev++;if(st.pressed)st.needRelease=true}
  const env=()=>st.t<CFG.rise?sm(st.t/CFG.rise):Math.pow(Math.max(0,1-(st.t-CFG.rise)/Math.max(1e-6,st.dur-CFG.rise)),2);
  function update(S,dt){
    if(!S.flying){if(st.mode!=='ready'||st.charge)reset(0)}
    else{
      if(st.cd>0)st.cd-=dt;
      if(st.pressed)st.hold+=dt;
      if(st.mode==='ready'){if(st.pressed&&!st.needRelease&&st.hold>=CFG.tapT&&st.cd<=0)st.mode='charging'}
      else if(st.mode==='charging'){
        const x=Math.min(1,(st.hold-CFG.tapT)/CFG.chargeT);st.charge=sm(x);
        if(x>=1)st.full+=dt;
        if((S.hurt||0)>CFG.hurtCancel)reset(.4);
        else if(st.full>=CFG.fullHold||st.hold>=CFG.maxHold)fire()}
      else if(st.mode==='burst'){st.t+=dt;if(st.t>=st.dur){st.mode='recover';st.rec=0}}
      else if(st.mode==='recover'){st.rec+=dt;if(st.rec>=CFG.recover)reset(CFG.cooldown)}}
    // the view other systems read (no allocation)
    view.mode=st.mode;view.charge=st.mode==='charging'?st.charge:0;view.ev=st.ev;view.launch=st.launch;
    view.burst=st.mode==='burst'?sm(Math.min(1,st.t/.12))*(1-.35*(st.t/st.dur)):st.mode==='recover'?.65*Math.pow(Math.max(0,1-st.rec/CFG.recover),1.5):0;
  }
  // speed multiplier applied to the flight target speed
  const speedMul=()=>st.mode==='charging'?1+(CFG.brake-1)*st.charge:st.mode==='burst'?1+(st.peak-1)*env():1;
  const driving=()=>st.mode==='burst';                              // the burst drives you forward even if the stick is idle
  const holdsBoost=()=>st.mode==='burst'||st.mode==='recover';       // counts as 'boosting' for FOV/pose/effects, and keeps the boost-level cruise through recovery
  const upRate=base=>st.mode==='burst'?CFG.upRate:base;
  const downRate=base=>st.mode==='charging'?CFG.brakeRate:base;
  return {CFG,state:st,view,press,release,update,speedMul,driving,holdsBoost,upRate,downRate,reset};
})();
if(typeof module!=='undefined')module.exports=Boost;
