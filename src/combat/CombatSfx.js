// WARDEN combat SFX. Plays on CombatCore events (start/hit/block/deflect/posturebreak/guardbreak).
// Prefers real files under assets/warden/sfx/ (Mixkit WAVs you dropped). Falls back to short
// synthesised bursts on the shared WAudio graph so combat never goes silent.
// Globals used at runtime: WAudio (optional).
const CombatSfx=(()=>{
  const BASE='assets/warden/sfx/';
  // logical name -> candidate filenames (first that loads wins)
  const MAP={
    whoosh:['whoosh.wav','mixkit-metal-hit-woosh-1485.wav','metal-hit-woosh.wav'],
    strike:['strike.wav','mixkit-metallic-sword-strike-2160.wav','metallic-sword-strike.wav'],
    impact:['impact.wav','mixkit-samurai-sword-impact-2789.wav','samurai-sword-impact.wav'],
    heavy:['heavy.wav','mixkit-heavy-sword-smashes-metal-2795.wav','heavy-sword-smashes-metal.wav'],
    block:['block.wav','shield-block.wav'],
    deflect:['deflect.wav','perfect-parry.wav']
  };
  let A=null,bus=null,bufs={},ready=false,on=true,nbuf=null;
  try{on=localStorage.getItem('w4csfx')!=='0'}catch(e){}

  function ensure(){
    if(A)return true;
    const a=typeof WAudio!=='undefined'&&WAudio.get?WAudio.get():null;
    if(!a||a.state!=='running')return false;
    A=a;bus=A.createGain();bus.gain.value=on?1:0;
    try{bus.connect(WAudio.out())}catch(e){bus.connect(A.destination)}
    // shared noise for synth fallback
    const n=A.sampleRate*1|0;nbuf=A.createBuffer(1,n,A.sampleRate);const d=nbuf.getChannelData(0);
    for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*.4;
    // fire-and-forget loads
    for(const k in MAP){
      (async()=>{
        for(const f of MAP[k]){
          try{
            const r=await fetch(BASE+f);if(!r.ok)continue;
            const ab=await r.arrayBuffer();bufs[k]=await A.decodeAudioData(ab.slice(0));break;
          }catch(e){}
        }
      })();
    }
    ready=true;return true;
  }

  function playBuf(name,vol,rate){
    const b=bufs[name];if(!b||!bus)return false;
    const t=A.currentTime,s=A.createBufferSource(),g=A.createGain();
    s.buffer=b;s.playbackRate.value=rate||(0.92+Math.random()*0.16);
    g.gain.value=(vol==null?0.7:vol);
    s.connect(g);g.connect(bus);s.start(t);return true;
  }

  // synth fallbacks (Ambience-style, short)
  function synthWhoosh(vol){
    if(!A||!bus||!nbuf)return;
    const t=A.currentTime,s=A.createBufferSource(),f=A.createBiquadFilter(),g=A.createGain();
    s.buffer=nbuf;s.loop=true;f.type='bandpass';f.frequency.setValueAtTime(2800,t);f.frequency.exponentialRampToValueAtTime(600,t+.18);
    f.Q.value=.8;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime((vol||.45)*.9,t+.02);g.gain.exponentialRampToValueAtTime(.001,t+.2);
    s.connect(f);f.connect(g);g.connect(bus);s.start(t);s.stop(t+.22);
  }
  function synthClang(vol,bright){
    if(!A||!bus)return;
    const t=A.currentTime,v=vol||.5;
    // metallic partials
    for(const [fr,d] of [[1800,.08],[2700,.06],[4200,.05],[900,.1]]){
      const o=A.createOscillator(),g=A.createGain();o.type='triangle';o.frequency.value=fr*(.95+Math.random()*.1);
      g.gain.setValueAtTime(v*(bright?0.35:0.22),t);g.gain.exponentialRampToValueAtTime(.001,t+d);
      o.connect(g);g.connect(bus);o.start(t);o.stop(t+d+.02);
    }
    // noise tick
    if(nbuf){const s=A.createBufferSource(),f=A.createBiquadFilter(),g=A.createGain();
      s.buffer=nbuf;f.type='highpass';f.frequency.value=2000;g.gain.setValueAtTime(v*.4,t);g.gain.exponentialRampToValueAtTime(.001,t+.06);
      s.connect(f);f.connect(g);g.connect(bus);s.start(t);s.stop(t+.08)}
  }
  function synthBlock(vol){
    if(!A||!bus)return;
    const t=A.currentTime,o=A.createOscillator(),g=A.createGain();
    o.type='square';o.frequency.setValueAtTime(220,t);o.frequency.exponentialRampToValueAtTime(90,t+.12);
    g.gain.setValueAtTime((vol||.4)*.5,t);g.gain.exponentialRampToValueAtTime(.001,t+.14);
    o.connect(g);g.connect(bus);o.start(t);o.stop(t+.16);
    synthClang(vol*.6,false);
  }
  function synthDeflect(vol){
    if(!A||!bus)return;
    const t=A.currentTime;
    for(const [fr,d] of [[3200,.05],[4800,.04],[1600,.07]]){
      const o=A.createOscillator(),g=A.createGain();o.type='sine';o.frequency.value=fr;
      g.gain.setValueAtTime((vol||.55)*.35,t);g.gain.exponentialRampToValueAtTime(.001,t+d);
      o.connect(g);g.connect(bus);o.start(t);o.stop(t+d+.02);
    }
  }

  function play(name,vol){
    if(!on||!ensure())return;
    if(playBuf(name,vol))return;
    // fallback
    if(name==='whoosh')synthWhoosh(vol);
    else if(name==='block')synthBlock(vol);
    else if(name==='deflect')synthDeflect(vol);
    else synthClang(vol,name==='impact'||name==='strike');
  }

  // CombatCore event → sound
  function event(e){
    if(!e||!e.t)return;
    switch(e.t){
      case'start':{
        const heavy=e.move==='heavy'||e.move==='cleave'||e.move==='slam';
        play('whoosh',heavy?.55:.4);
        break}
      case'hit':{
        const heavy=e.move==='heavy'||e.crit;
        play(heavy?'heavy':'impact',heavy?.75:.6);
        break}
      case'block':play('block',.55);break;
      case'deflect':play('deflect',.7);break;
      case'posturebreak':case'guardbreak':play('heavy',.8);play('deflect',.4);break;
      case'dead':play('impact',.5);break;
    }
  }

  function setOn(v){on=!!v;try{localStorage.setItem('w4csfx',on?'1':'0')}catch(e){}if(bus)bus.gain.setTargetAtTime(on?1:0,A?A.currentTime:0,.05)}
  return{event,play,setOn,isOn:()=>on,ensure}})();
if(typeof module!=='undefined')module.exports=CombatSfx;
