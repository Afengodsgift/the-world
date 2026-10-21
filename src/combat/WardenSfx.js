// WARDEN SFX: small sample bank (assets/warden/sfx/*.mp3, ~120 KB total) on the shared WAudio context. Lazy: nothing is fetched until the first fight; play() returns false until a sample
// has decoded so the caller can fall back to its synth tone. Samples are pitch-jittered a little so repeated hits do not machine-gun.
// Globals used: WAudio.
const WardenSfx=(()=>{
  const NAMES=['strike','heavy','clash','whoosh','vo_fight','vo_prepare_yourself','vo_combo','vo_game_over','vo_flawless_victory','vo_winner','vo_sudden_death','vo_final_round'];
  const buf={};let started=false,voT=0;
  // a flaky connection must not leave the fight silent for the rest of the session: every sample is retried (3 tries with growing gaps), and play() re-requests a sample that is still missing (at most once every 6 s per sample)
  const retryAt={};
  function get(n,left){const a=WAudio.get();if(!a)return;retryAt[n]=performance.now()+6000;
    fetch('assets/warden/sfx/'+n+'.mp3').then(r=>{if(!r.ok)throw new Error('http '+r.status);return r.arrayBuffer()}).then(b=>new Promise((ok,no)=>a.decodeAudioData(b,ok,no))).then(d=>{buf[n]=d}).catch(()=>{if(left>0)setTimeout(()=>get(n,left-1),1500*(4-left))})}
  function load(){if(started)return;started=true;if(!WAudio.get())return;for(const n of NAMES)get(n,3)}
  function again(n){if(started&&!buf[n]&&NAMES.indexOf(n)>=0&&performance.now()>(retryAt[n]||0))get(n,2)}
  function play(n,vol,rate,opt){const a=WAudio.get(),b=buf[n];if(a&&!b)again(n);if(!a||!b||a.state!=='running')return false;
    if(n.startsWith('vo_')){const t=a.currentTime;if(t<voT)return true;voT=t+b.duration+.6}   // one voice line at a time, never stacked
    const s=a.createBufferSource(),g=a.createGain();s.buffer=b;s.playbackRate.value=(rate||1)*(opt&&opt.nojit?1:.94+Math.random()*.12);g.gain.value=vol===undefined?.7:vol;s.connect(g);g.connect(WAudio.out());s.start();return true}
  return{load,play,ready:n=>!!buf[n],_t:()=>({buf,started})}})();
if(typeof module!=='undefined')module.exports=WardenSfx;
