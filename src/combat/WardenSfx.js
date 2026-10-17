// WARDEN SFX: small sample bank (assets/warden/sfx/*.mp3, ~120 KB total) on the shared WAudio context. Lazy: nothing is fetched until the first fight; play() returns false until a sample
// has decoded so the caller can fall back to its synth tone. Samples are pitch-jittered a little so repeated hits do not machine-gun.
// Globals used: WAudio.
const WardenSfx=(()=>{
  const NAMES=['strike','heavy','clash','whoosh','vo_fight','vo_prepare_yourself','vo_combo','vo_game_over','vo_flawless_victory','vo_winner','vo_sudden_death','vo_final_round'];
  const buf={};let started=false,voT=0;
  function load(){if(started)return;started=true;const a=WAudio.get();if(!a)return;
    for(const n of NAMES)fetch('assets/warden/sfx/'+n+'.mp3').then(r=>r.arrayBuffer()).then(b=>new Promise((ok,no)=>a.decodeAudioData(b,ok,no))).then(d=>{buf[n]=d}).catch(()=>{})}
  function play(n,vol,rate,opt){const a=WAudio.get(),b=buf[n];if(!a||!b||a.state!=='running')return false;
    if(n.startsWith('vo_')){const t=a.currentTime;if(t<voT)return true;voT=t+b.duration+.6}   // one voice line at a time, never stacked
    const s=a.createBufferSource(),g=a.createGain();s.buffer=b;s.playbackRate.value=(rate||1)*(opt&&opt.nojit?1:.94+Math.random()*.12);g.gain.value=vol===undefined?.7:vol;s.connect(g);g.connect(WAudio.out());s.start();return true}
  return{load,play,ready:n=>!!buf[n],_t:()=>({buf,started})}})();
if(typeof module!=='undefined')module.exports=WardenSfx;
