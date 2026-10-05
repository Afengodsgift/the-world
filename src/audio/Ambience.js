// Ambience: the world's sound, all SYNTHESISED (no audio files to download) on top of the shared WAudio context.
// Layers fade in/out with where you are and what the weather/time is:
//   ocean swell + shoreline surf (near water) | wind (altitude, storm, and FLIGHT/FALL SPEED) | crickets (night) | birds (daytime forest)
//   fountain (town square) | waterfall (floating island) | cave (rumble + echoing drips, muffles the outside) | underwater bed + muffle
//   one-shots: footsteps (grass / sand / stone / shallow water), jump, landing thud, water splash, swim strokes
// Rain + thunder stay in Environment.js (they already use WAudio).
// Cost: ~8 looping noise/osc sources total; levels are retargeted at 10 Hz. Everything is created lazily after the first tap (browser autoplay rule).
// Tuning knobs: the LEVEL constants in applyLevels() and the step/burst parameters in step()/land().
const Ambience=(()=>{
  const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)},cl=(v,a,b)=>v<a?a:v>b?b:v;
  const WF={x:SKY.x+Math.cos(2.35)*113,z:SKY.z+Math.sin(2.35)*113},CAVE={x:18,z:-88};   // sky-island waterfall (SkyIsland.js) and the cave mouth (index.html)
  const MASTER=3.2,SFX=2.6;   // measured with an analyser: raw layer levels peaked at ~0.03-0.14 (too quiet for phone speakers); MASTER lifts everything, SFX lifts the one-shot noise bursts (footsteps were peaking at 0.018)
  let A=null,bus=null,dripIn=null,nbuf=null,on=true,L={},lt=0,zt=0,Z={ocean:0,beach:0,forest:0,alt:0,town:0,cave:0},stepAcc=0,foot=0,nextBird=3,nextDrip=2,strokeT=0,lx=null,lz=null,prevSwim=false,lastLand=0;
  try{on=localStorage.getItem('w4amb')!=='0'}catch(e){}

  // ---------- graph helpers ----------
  const filt=(type,f,q)=>{const b=A.createBiquadFilter();b.type=type;b.frequency.value=f;if(q!==undefined)b.Q.value=q;return b};
  const gain=v=>{const g=A.createGain();g.gain.value=v;return g};
  const noise=()=>{const s=A.createBufferSource();s.buffer=nbuf;s.loop=true;s.start(0,Math.random()*3);return s};
  const lfo=(rate,depth,target)=>{const o=A.createOscillator();o.frequency.value=rate;const g=gain(depth);o.connect(g);g.connect(target);o.start();return o};
  const to=(param,v,tc)=>param.setTargetAtTime(v,A.currentTime,tc||.5);
  const pan=v=>{if(!A.createStereoPanner)return null;const p=A.createStereoPanner();p.pan.value=v;return p};

  function build(a){
    A=a;bus=gain(on?MASTER:0);bus.connect(WAudio.out());
    // 4 s of pink-ish noise, shared by every layer (each loop starts at a random offset so they don't phase together)
    const n=a.sampleRate*4|0;nbuf=a.createBuffer(1,n,a.sampleRate);const d=nbuf.getChannelData(0);let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for(let i=0;i<n;i++){const w=Math.random()*2-1;b0=.99886*b0+w*.0555179;b1=.99332*b1+w*.0750759;b2=.969*b2+w*.153852;b3=.8665*b3+w*.3104856;b4=.55*b4+w*.5329522;b5=-.7616*b5-w*.016898;d[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.11;b6=w*.115926}
    // ocean swell: low rumble breathing in and out, plus shoreline surf hiss
    {const s=noise(),f=filt('lowpass',650,.6),sw=gain(.55),lv=gain(0);s.connect(f);f.connect(sw);sw.connect(lv);lv.connect(bus);lfo(.09,.4,sw.gain);lfo(.14,.15,sw.gain);L.ocean=lv}
    {const s=noise(),f=filt('bandpass',1500,.7),sw=gain(.35),lv=gain(0);s.connect(f);f.connect(sw);sw.connect(lv);lv.connect(bus);lfo(.16,.3,sw.gain);lfo(.11,.1,sw.gain);L.surf=lv}
    // wind: band-passed noise with slow gusts; its centre frequency and level rise with speed
    {const s=noise(),f=filt('bandpass',420,.55),wg=gain(.6),lv=gain(0);s.connect(f);f.connect(wg);wg.connect(lv);lv.connect(bus);lfo(.07,.25,wg.gain);lfo(.19,.1,wg.gain);L.wind=lv;L.windF=f}
    // underwater bed
    {const s=noise(),f=filt('lowpass',240,.7),lv=gain(0);s.connect(f);f.connect(lv);lv.connect(bus);L.under=lv}
    // fountain trickle (town) and waterfall roar (sky island)
    {const s=noise(),f=filt('bandpass',3000,.9),wg=gain(.8),lv=gain(0);s.connect(f);f.connect(wg);wg.connect(lv);lv.connect(bus);lfo(.5,.12,wg.gain);L.fount=lv}
    {const s=noise(),f=filt('bandpass',1000,.35),lv=gain(0);s.connect(f);f.connect(lv);lv.connect(bus);L.fall=lv}
    // cave: low rumble + an echo line for the drips
    {const s=noise(),f=filt('lowpass',110,.7),lv=gain(0);s.connect(f);f.connect(lv);lv.connect(bus);L.cave=lv}
    {dripIn=gain(1);const dl=A.createDelay(1),fb=gain(.42),wet=gain(.55);dl.delayTime.value=.23;dripIn.connect(bus);dripIn.connect(dl);dl.connect(fb);fb.connect(dl);dl.connect(wet);wet.connect(bus)}
    // crickets: two detuned, fast-tremolo sines
    {const lv=gain(0);for(const [fr,tr] of [[4300,26],[4700,31]]){const o=A.createOscillator();o.frequency.value=fr;const t=gain(.5);o.connect(t);t.connect(lv);lfo(tr,.5,t.gain);o.start()}lv.connect(bus);L.cricket=lv}
  }

  // ---------- zones (5 Hz): what is around the player ----------
  function zones(c){
    const H=c.H,x=c.x,z=c.z,R=24;let w=0;for(let i=0;i<10;i++){const a=i*.6283;if(H(x+Math.cos(a)*R,z+Math.sin(a)*R)<-.2)w++}
    const h0=H(x,z),alt=Math.max(0,c.y-Math.max(0,c.gy)),wf=w/10,dTown=Math.hypot(x-TOWN.x,z-TOWN.z);
    Z.alt=sm(15,400,alt);Z.altM=alt;
    Z.ocean=cl(wf*1.7,0,1);Z.beach=cl(wf*1.4,0,1)*(1-sm(1.5,6,h0))*(1-sm(6,30,alt));
    Z.forest=cl(1-wf*3,0,1)*sm(2.5,6,h0)*(dTown<35?.3:1)*(1-sm(15,45,alt));
    Z.town=1-sm(3,26,dTown);Z.dFall=hf(c);
    const dc=Math.hypot(x-CAVE.x,z-CAVE.z);Z.cave=(1-sm(2,12,dc))*(alt<8?1:0);
  }
  function hf(c){const dy=Math.max(0,SKY.base-80-c.y,c.y-(SKY.base+5));return Math.hypot(c.x-WF.x,c.z-WF.z,dy)}

  // ---------- levels (10 Hz) ----------
  function applyLevels(c){
    const under=c.under||0,rain=c.rain||0,storm=c.storm||0,night=1-(c.dayF===undefined?1:c.dayF),cloud=c.cloud||0,alt=Z.altM||0;
    const sp=c.spd||0,sp01=cl(sp/70,0,1);
    const air=1/(1+alt/60);
    to(L.ocean.gain,(1-under)*Z.ocean*.30*air);
    to(L.surf.gain,(1-under)*Z.beach*.16);
    to(L.wind.gain,(1-under)*(1-cloud*.5)*(.05+.12*Z.alt+.10*storm+.06*rain+sp01*.5));
    to(L.windF.frequency,380+sp01*1500+Z.alt*300+storm*150,.3);
    to(L.under.gain,under*.2);
    to(L.fount.gain,(1-under)*Z.town*.10*(alt<10?1:0));
    to(L.fall.gain,(1-under)*(1-sm(8,75,Z.dFall))*.16);
    to(L.cave.gain,Z.cave*.09);
    to(L.cricket.gain,.020*sm(.3,1,night)*(1-rain)*cl(Z.forest+.4*(1-Z.ocean),0,1)*(alt<25?1:0)*(1-under));
    WAudio.setMuffle(Math.max(under,cloud*.25,Z.cave*.35));
  }

  // ---------- one-shots ----------
  function burst(type,f,q,vol,dur,att,pn){
    const t=A.currentTime,s=A.createBufferSource(),fl=filt(type,f,q),g=gain(0);s.buffer=nbuf;s.connect(fl);fl.connect(g);
    const p=pn?pan(pn):null;if(p){g.connect(p);p.connect(bus)}else g.connect(bus);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol*SFX,t+att);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    s.start(t,Math.random()*3,dur+.05);
  }
  function thump(f0,f1,vol,dur){const t=A.currentTime,o=A.createOscillator(),g=gain(0);o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+dur);o.connect(g);g.connect(bus);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.start(t);o.stop(t+dur+.02)}
  function surface(c){const h=c.H(c.x,c.z);if(h<.15)return 'water';if(Math.hypot(c.x-TOWN.x,c.z-TOWN.z)<24)return 'stone';return h<2.4?'sand':'grass'}
  function step(run,surf,side){
    const k=run?1.25:1,pn=side?.15:-.15;
    if(surf==='grass'){burst('bandpass',1800,.9,.055*k,.10,.008,pn);burst('lowpass',300,.7,.05*k,.07,.004)}
    else if(surf==='sand'){burst('lowpass',700,.6,.07*k,.14,.015,pn)}
    else if(surf==='stone'){burst('bandpass',2600,1.6,.05*k,.05,.003,pn);burst('lowpass',220,.7,.055*k,.05,.003)}
    else{burst('bandpass',1400,.8,.08*k,.22,.01,pn)}
  }
  function bird(f){   // a short phrase of 2-4 chirps; level scales with how forested the spot is
    const n=2+(Math.random()*3|0),f0=2200+Math.random()*1800,gap=.085+Math.random()*.05,vol=.03*f,pn=Math.random()*1.4-.7,t0=A.currentTime+.02;
    const p=pan(pn);
    for(let i=0;i<n;i++){const t=t0+i*gap,o=A.createOscillator(),g=gain(0);o.type='sine';o.frequency.setValueAtTime(f0*(1+i*.04),t);o.frequency.exponentialRampToValueAtTime(f0*(1.15+Math.random()*.3),t+.06);
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+.075);o.connect(g);if(p){g.connect(p);p.connect(bus)}else g.connect(bus);o.start(t);o.stop(t+.09)}
  }
  function drip(){const t=A.currentTime,o=A.createOscillator(),g=gain(0);o.frequency.setValueAtTime(1500+Math.random()*900,t);o.frequency.exponentialRampToValueAtTime(700,t+.07);o.connect(g);g.connect(dripIn);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.05,t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+.09);o.start(t);o.stop(t+.1)}

  // ---------- public ----------
  function update(dt,c){
    const a=WAudio.get();if(!a||a.state!=='running')return;            // wait for the first tap
    if(!A){try{build(a)}catch(e){A=null;return}}
    if(!on)return;
    if(lx!==null&&Math.hypot(c.x-lx,c.z-lz)>4)stepAcc=0;               // teleport: don't count the jump as walking
    const dist=lx===null?0:Math.hypot(c.x-lx,c.z-lz);lx=c.x;lz=c.z;
    zt-=dt;if(zt<=0){zt=.2;zones(c)}
    lt-=dt;if(lt<=0){lt=.1;applyLevels(c)}
    // footsteps follow the distance actually travelled (so they match the legs at any speed)
    if((c.st==='walk'||c.st==='run')&&c.grounded){stepAcc+=dist;const stride=c.st==='run'?1.75:1.2;if(stepAcc>=stride){stepAcc-=stride;foot^=1;step(c.st==='run',surface(c),foot)}}else if(c.st!=='walk'&&c.st!=='run')stepAcc=0;
    // swimming: a stroke splash every ~0.9 s while moving; a bigger splash when entering the water
    const swim=c.st==='swim';
    if(swim&&!prevSwim)burst('bandpass',1100,.5,.16,.5,.01),burst('lowpass',500,.6,.14,.4,.01);
    prevSwim=swim;
    if(swim){strokeT-=dt;if(strokeT<=0&&(c.spd||0)>.8){strokeT=.9;burst('bandpass',900,.6,.07,.35,.04,foot?.2:-.2);foot^=1}}
    // birds (day, forest), cave drips
    nextBird-=dt;if(nextBird<=0){nextBird=1.2+Math.random()*3.5/(.3+Z.forest);if(Z.forest>.15&&(c.dayF||0)>.3&&(c.rain||0)<.4)bird(Z.forest*(c.dayF||0)*(1-(c.rain||0)))}
    nextDrip-=dt;if(nextDrip<=0){nextDrip=.8+Math.random()*2.2;if(Z.cave>.2)drip()}
  }
  function jump(c){if(!A||!on)return;burst('bandpass',900,.6,.03,.12,.02)}
  function land(imp,c){
    if(!A||!on)return;const now=A.currentTime;if(now-lastLand<.15)return;lastLand=now;const v=cl((imp-3)/22,.05,.5),s=c?surface(c):'grass';
    thump(110,45,.16*v+.02,.16);
    if(s==='water')burst('bandpass',1200,.5,.3*v,.45,.01);else if(s==='sand')burst('lowpass',650,.6,.2*v,.2,.01);else burst('bandpass',s==='stone'?2200:1500,.9,.18*v,.14,.005);
  }
  function setOn(v){on=!!v;try{localStorage.setItem('w4amb',on?'1':'0')}catch(e){}if(A)to(bus.gain,on?MASTER:0,.15)}
  return {update,jump,land,step,setOn,isOn:()=>on,_zones:Z};
})();
