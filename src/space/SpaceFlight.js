// SpaceFlight: how flight scales with altitude. The existing flight model is untouched (it still produces the same normalised velocities);
// this module only decides how far those velocities carry you once you are above the clouds, so the climb to space takes about a minute
// instead of an hour, and how fast you fall back down. Below 900 m every function returns the original behaviour (multiplier 1, 48 m/s terminal).
//   moveMul(y)  : 1 below 900 m, then grows ~1 per 500 m of altitude (capped), so crossing the world and climbing keep the same *feel* at any scale
//   terminal(y) : fall speed limit: 48 m/s in the air, much higher in thin air (falling from orbit is a fall), eased back down as the air thickens
//   gravMul(y)  : falling accelerates faster where the air is thin
const SpaceFlight=(()=>{
  const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
  // Space is open out to 1,200 km from home (about 100x the world's width, ~15 s boosted). Beyond that 32-bit floats can no longer hold a skinned avatar together
  // (needs a floating origin: planned), so the limit is kept well inside the safe range.
  const CEIL=1.2e6,MUL_MAX=3000,G0=900,OPEN_Y=60000,LIM=1.2e6;
  // approach assist: 1 = full altitude speed, 0 = normal flight speed. SpaceObjects eases it down near anything you can fly up to, so a 24 m satellite is
  // approachable at 118 km altitude (where full speed would be hundreds of times faster than normal). Smooth in distance, so there is no 'zone'.
  let assist=1;const setAssist=a=>{assist=a<0?0:a>1?1:a};
  // Speed scales with how far out you are, so crossing space feels the same at 100 km and at 100,000 km. 'How far out' is your altitude, or half your
  // distance from the world's axis if that is larger, blended in only up in open space (30-70 km): inside the atmosphere funnel (rr <= 1.5 x altitude) the
  // second term never wins, so flight there is exactly as before, including low flight near the world's edge.
  const far=(y,rr)=>{const h=Math.max(y,(rr||0)*.5),w=sm(30000,70000,y);return y+(h-y)*w};
  const moveMulRaw=(y,rr)=>{const a=far(y,rr);return a<=G0?1:1+Math.min(MUL_MAX-1,(a-G0)/500)};   // ignoring the assist (use for other players)
  const moveMul=(y,rr)=>{const b=moveMulRaw(y,rr);return assist>=1?b:1+(b-1)*assist};
  // sideways speed: gentle (sqrt) in the atmosphere so the world stays in view while you fly around, full in space where there is nothing to bump into
  const moveMulH=(y,rr)=>{const m=moveMul(y,rr),t=sm(40000,110000,far(y,rr));return Math.sqrt(m)*(1-t)+m*t};                       // sideways speed grows more gently than climb speed, so the world stays in view while you fly around up high
  // The world's edge: 3.3 km on the ground, a cone that opens with altitude (91 km at 60 km), and no edge at all in open space.
  const bound=y=>y>=OPEN_Y?Infinity:3300+Math.max(0,y-1500)*1.5;
  // Keep the player inside the world's edge. Identical to the original hard clamp up to 1.5 km. Above it the only way to be outside the cone is to have
  // come down from open space: then the excess is shrunk in proportion to the descent (so you arrive at the cone's edge exactly as you reach 1.5 km), never a jump.
  function contain(S,dt){
    const y=S.y,rr=Math.hypot(S.x,S.z);
    if(y>=OPEN_Y){if(rr>LIM){const k=LIM/rr;S.x*=k;S.z*=k}return}
    const B=bound(y);if(rr<=B)return;
    let rn;
    if(y<=1500)rn=B;
    else{const ex=rr-B,need=Math.max(0,-(S._dy||0))/(y-1500+1),drift=Math.min(ex*(1-Math.exp(-dt*.5)),600*dt);   // descent-proportional, plus a slow (<= 600 m/s) drift if you hover out there
      rn=rr-Math.min(ex,Math.max(ex*Math.min(1,need),drift))}
    const k=rn/rr;S.x*=k;S.z*=k}

  const terminal=y=>48+100*sm(900,2500,y)+750*sm(2500,16000,y)+1700*sm(16000,60000,y);          // 48 m/s up to 900 m (unchanged); re-entry speeds up high, easing back as the air thickens
  const gravMul=y=>1+9*sm(3000,20000,y);
  // vertical distance moved this frame (m). Flight velocity is normalised (what the animations/camera expect); dives are capped by air density.
  function dy(vy,y,flying,dt,rr){
    if(!flying)return vy*dt;
    let v=vy*moveMul(y,rr);const T=terminal(y)*1.3;if(v<-T)v=-T;return v*dt}
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
  return {CEIL,OPEN_Y,moveMul,moveMulRaw,moveMulH,setAssist,bound,contain,terminal,gravMul,dy,fall,vertical,landImpact};
})();
if(typeof module!=='undefined')module.exports=SpaceFlight;
