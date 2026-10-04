// WAudio: ONE shared AudioContext + master bus for the whole game.
// Before this, chime()/bonk()/sharkBite() each created a brand-new AudioContext per sound (leaks contexts, fails on iOS after ~6).
// Everything audio-related (one-shots, rain, and the upcoming ambience/wind/underwater layers) goes through get()/out().
// Browsers only allow audio after a user gesture, so the context is created lazily and resumed on the first tap/key.
const WAudio=(()=>{
  let ctx=null,master=null;
  function get(){
    if(ctx)return ctx;
    try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;
      ctx=new C();master=ctx.createGain();master.gain.value=1;master.connect(ctx.destination)}catch(e){ctx=null;master=null}
    return ctx;
  }
  function resume(){const a=get();if(a&&a.state==='suspended'){try{a.resume()}catch(e){}}return a}
  ['pointerdown','touchend','keydown'].forEach(ev=>addEventListener(ev,resume,{passive:true}));
  // iOS suspends audio when the tab is hidden; wake it when we come back
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ctx)resume()});
  return {get,resume,out:()=>{get();return master},ready:()=>!!ctx&&ctx.state==='running'};
})();
