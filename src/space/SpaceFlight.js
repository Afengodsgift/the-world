// SpaceFlight: how flight scales with altitude. The existing flight model is untouched (it still produces the same normalised velocities);
// this module only decides how far those velocities carry you once you are above the clouds, so the climb to space takes about a minute
// instead of an hour, and how fast you fall back down. Below 900 m every function returns the original behaviour (multiplier 1, 48 m/s terminal).
//   moveMul(y)  : 1 below 900 m, then grows ~1 per 500 m of altitude (capped), so crossing the world and climbing keep the same *feel* at any scale
//   terminal(y) : fall speed limit: 48 m/s in the air, much higher in thin air (falling from orbit is a fall), eased back down as the air thickens
//   gravMul(y)  : falling accelerates faster where the air is thin
const SpaceFlight=(()=>{
  const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
  const CEIL=140000,MUL_MAX=300,G0=900;
  // approach assist: 1 = full altitude speed, 0 = normal flight speed. SpaceObjects eases it down near anything you can fly up to, so a 24 m satellite is
  // approachable at 118 km altitude (where full speed would be hundreds of times faster than normal). Smooth in distance, so there is no 'zone'.
  let assist=1;const setAssist=a=>{assist=a<0?0:a>1?1:a};
  const moveMulRaw=y=>y<=G0?1:1+Math.min(MUL_MAX-1,(y-G0)/500);               // altitude speed multiplier, ignoring the assist (use for other players)
  const moveMul=y=>{const b=moveMulRaw(y);return assist>=1?b:1+(b-1)*assist};
  const moveMulH=y=>Math.sqrt(moveMul(y));                       // sideways speed grows more gently than climb speed, so the world stays in view while you fly around up high
  const bound=y=>3300+Math.max(0,y-1500)*1.5;                    // the world's edge (3.3 km) opens up with altitude: 46 km at 30 km, 210 km at 140 km
  const terminal=y=>48+100*sm(900,2500,y)+750*sm(2500,16000,y)+1700*sm(16000,60000,y);          // 48 m/s up to 900 m (unchanged); re-entry speeds up high, easing back as the air thickens
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
  // Flight command from where you are looking. e = elevation of the view (neutralPitch - pitch), bm = boost multiplier, fwd = forward flight speed.
  // Inside the original look range (e in [-0.8, 0.35]) this is exactly the original clamp, so normal flight is unchanged. Looking further up/down
  // blends toward 'fly where you look': horizontal speed fades out and the climb/dive speed rises to the forward speed, so you can go straight up.
  function vertical(e,bm,fwd){
    let v=Math.max(-20*bm,Math.min(14*bm,e*40*bm)),h=1;
    if(e>.35){const t=sm(.35,1.2,e);v=14*bm+(fwd-14*bm)*t;h=Math.cos(t*Math.PI/2)}
    else if(e<-.8){const t=sm(.8,1.3,-e);v=-20*bm+(20*bm-fwd)*t;h=Math.cos(t*Math.PI/2)}
    return {v,h}}
  // landing effects never see more than a normal hard landing (there is no fall damage in this game)
  const landImpact=imp=>Math.min(imp,60);
  return {CEIL,moveMul,moveMulRaw,moveMulH,setAssist,bound,terminal,gravMul,dy,fall,vertical,landImpact};
})();
if(typeof module!=='undefined')module.exports=SpaceFlight;
