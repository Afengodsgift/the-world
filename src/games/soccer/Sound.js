// SocSound: the tiny synthesized sounds of the football game (kick thump, goal horn). No audio files.
const SocSound=(()=>{
  let AC=null;const ac=()=>{try{AC=AC||new(window.AudioContext||webkitAudioContext)();if(AC.state==='suspended')AC.resume();return AC}catch(e){return null}};
  function tone(f0,f1,len,vol,type){const a=ac();if(!a)return;const o=a.createOscillator(),g=a.createGain(),t=a.currentTime;o.type=type||'sine';o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+len);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+len);o.connect(g);g.connect(a.destination);o.start();o.stop(t+len)}
  const thump=p=>tone(200+p*60,60,.09,.25+.15*p,'triangle');
  const horn=()=>{tone(330,300,.5,.2,'sawtooth');setTimeout(()=>tone(440,420,.5,.2,'sawtooth'),120)};

  return {thump,horn};
})();
