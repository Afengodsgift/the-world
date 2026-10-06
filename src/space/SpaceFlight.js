// SpaceFlight: how flight scales with altitude. The existing flight model is untouched (it still produces the same normalised velocities);
// this module only decides how far those velocities carry you once you are above the clouds, so the climb to space takes about a minute
// instead of an hour, and how fast you fall back down. Below 900 m every function returns the original behaviour (multiplier 1, 48 m/s terminal).
//   moveMul(y)  : 1 below 900 m, then grows ~1 per 500 m of altitude (capped), so crossing the world and climbing keep the same *feel* at any scale
//   terminal(y) : fall speed limit: 48 m/s in the air, much higher in thin air (falling from orbit is a fall), eased back down as the air thickens
//   gravMul(y)  : falling accelerates faster where the air is thin
const SpaceFlight=(()=>{
  const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
  const CEIL=90000,MUL_MAX=120,G0=900;
  const moveMul=y=>y<=G0?1:1+Math.min(MUL_MAX-1,(y-G0)/500);
  const moveMulH=y=>Math.sqrt(moveMul(y));                       // sideways speed grows more gently than climb speed, so the world stays in view while you fly around up high
  const bound=y=>3300+Math.max(0,y-1500)*1.5;                    // the world's edge (3.3 km) opens up with altitude: 46 km at 30 km, 136 km at 90 km
  const terminal=y=>48+100*sm(900,2500,y)+750*sm(2500,16000,y);          // 48 m/s up to 900 m (unchanged); re-entry speeds up high, easing back as the air thickens
  const gravMul=y=>1+9*sm(3000,20000,y);
  // vertical distance moved this frame (m). Flight velocity is normalised (what the animations/camera expect); dives are capped by air density.
  function dy(vy,y,flying,dt){
    if(!flying)return vy*dt;
    let v=vy*moveMul(y);const T=terminal(y)*1.3;if(v<-T)v=-T;return v*dt}
  // one step of the non-flying fall (heavier on the way down, snappier jumps: unchanged below ~1.5 km)
  function fall(vy,y,dt){
    vy-=(vy<0?33:25)*dt*gravMul(y);
    const T=terminal(y);
    if(vy<-T)vy=T<=48.01?-T:Math.max(-T,vy+(-T-vy)*Math.min(1,dt*4));
    return vy}
  // landing effects never see more than a normal hard landing (there is no fall damage in this game)
  const landImpact=imp=>Math.min(imp,60);
  return {CEIL,moveMul,moveMulH,bound,terminal,gravMul,dy,fall,landImpact};
})();
if(typeof module!=='undefined')module.exports=SpaceFlight;
