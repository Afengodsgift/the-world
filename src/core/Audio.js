// WAudio: ONE shared AudioContext + master bus for the whole game.
// Before this, chime()/bonk()/sharkBite() each created a brand-new AudioContext per sound (leaks contexts, fails on iOS after ~6).
// Everything audio-related (one-shots, rain, and the upcoming ambience/wind/underwater layers) goes through get()/out().
// Browsers only allow audio after a user gesture, so the context is created lazily and resumed on the first tap/key.
const WAudio=(()=>{
  let ctx=null,master=null,lp=null;
  function get(){
    if(ctx)return ctx;
    try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;
      ctx=new C();master=ctx.createGain();master.gain.value=1;
      lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=20000;lp.Q.value=.5;   // 'world muffle' stage: underwater / inside clouds / in the cave
      master.connect(lp);lp.connect(ctx.destination)}catch(e){ctx=null;master=null;lp=null}
    return ctx;
  }
  function resume(){const a=get();if(a&&a.state==='suspended'){try{a.resume()}catch(e){}}return a}
  ['pointerdown','touchend','keydown'].forEach(ev=>addEventListener(ev,resume,{passive:true}));
  // iOS suspends audio when the tab is hidden; wake it when we come back
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ctx)resume()});
  // a: 0 = clear .. 1 = fully muffled (underwater). Smooth; affects EVERYTHING that goes through out().
  function setMuffle(a){if(!lp||!ctx)return;a=a<0?0:a>1?1:a;const t=ctx.currentTime;lp.frequency.setTargetAtTime(20000*Math.pow(420/20000,a),t,.15);master.gain.setTargetAtTime(1-.22*a,t,.15)}
  const tap=n=>{get();lp&&lp.connect(n)};   // connect an AnalyserNode/recorder AFTER the muffle stage (debug/tests)
  return {get,resume,setMuffle,tap,out:()=>{get();return master},ready:()=>!!ctx&&ctx.state==='running'};
})();
