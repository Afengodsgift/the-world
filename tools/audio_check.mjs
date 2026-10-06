// Measures the REAL Ambience/WAudio code in headless Chromium with an AnalyserNode (post-muffle) across scenes, and asserts how they should sound.
// Run (repo served at :8123, puppeteer-core + @sparticuz/chromium installed in cwd):  node tools/audio_check.mjs
import puppeteer from 'puppeteer-core';import chromium from '@sparticuz/chromium';
const PORT=process.env.PORT||8123;
const b=await puppeteer.launch({args:[...chromium.args,'--autoplay-policy=no-user-gesture-required','--no-sandbox'],executablePath:await chromium.executablePath(),headless:'shell'});
const pg=await b.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('http://localhost:'+PORT+'/tools/audio_harness.html');
const R=await pg.evaluate(async()=>{
  const H=(x,z)=>{const r=Math.hypot(x,z);return r<150?Math.min(6,(150-r)/6-.5):-6};
  const ctx=WAudio.get();await ctx.resume();const an=ctx.createAnalyser();an.fftSize=2048;an.smoothingTimeConstant=0;WAudio.tap(an);
  const td=new Float32Array(an.fftSize),fd=new Float32Array(an.frequencyBinCount),hz=ctx.sampleRate/an.fftSize;
  const base={x:0,y:6,z:0,gy:6,H,st:'idle',grounded:true,under:0,dayF:1,rain:0,storm:0,cloud:0,spd:0};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function measure(name,c,secs=3.2,extra){
    let t0=performance.now(),last=t0,rms=[],peak=0,band={lo:0,mid:0,hi:0,cr:0},nb=0;
    while(performance.now()-t0<secs*1000){const now=performance.now(),dt=(now-last)/1000;last=now;Ambience.update(dt,c);
      if(extra)extra(now-t0);
      if(now-t0>secs*1000-1000){an.getFloatTimeDomainData(td);let s=0;for(const v of td){s+=v*v;peak=Math.max(peak,Math.abs(v))}rms.push(Math.sqrt(s/td.length));
        an.getFloatFrequencyData(fd);const e=(lo,hi)=>{let s=0;for(let i=Math.floor(lo/hz);i<Math.min(fd.length,Math.ceil(hi/hz));i++)s+=Math.pow(10,fd[i]/10);return s};
        band.lo+=e(20,500);band.mid+=e(500,2000);band.hi+=e(2000,8000);band.cr+=e(4000,5000);nb++}
      await sleep(25)}
    const m=rms.reduce((a,b)=>a+b,0)/rms.length,db=v=>20*Math.log10(Math.max(v,1e-9)),pdb=v=>10*Math.log10(Math.max(v/nb,1e-20));
    return {name,rmsDb:db(m),peak,lo:pdb(band.lo),mid:pdb(band.mid),hi:pdb(band.hi),cr:pdb(band.cr)}}
  const out={};
  // footstep audibility: right after build (levels still ~0), a step must be clearly audible and not clipping
  Ambience.update(.016,base);await sleep(30);let sp=0;Ambience.step(false,'grass',0);Ambience.step(false,'sand',1);Ambience.step(true,'stone',0);Ambience.land(20,{x:0,z:0,H});
  {const t0=performance.now();while(performance.now()-t0<400){an.getFloatTimeDomainData(td);for(const v of td)sp=Math.max(sp,Math.abs(v));await sleep(10)}}out.stepPeak=sp;
  out.forestDay=await measure('forestDay',{...base});
  out.beach=await measure('beach',{...base,x:140,y:1.2,gy:1.2});
  out.seaSwim=await measure('seaSwim',{...base,x:400,y:-1,gy:-1,st:'swim',spd:1.5});
  out.under=await measure('under',{...base,x:400,y:-1,gy:-1,st:'swim',under:1});
  out.flySlow=await measure('flySlow',{...base,y:120,spd:12,st:'fly',grounded:false});
  out.flyBoost=await measure('flyBoost',{...base,y:120,spd:66,st:'fly',grounded:false});
  out.stormBoost=await measure('stormBoost',{...base,y:120,spd:70,st:'fly',grounded:false,rain:1,storm:1,dayF:.2});
  out.nightForest=await measure('nightForest',{...base,dayF:0});
  out.dayRainForest=await measure('dayRainForest',{...base,dayF:1,rain:.45});
  out.cave=await measure('cave',{...base,x:18,z:-88,y:6,gy:6});
  Ambience.setOn(false);await sleep(1200);out.off=await measure('off',{...base},1.8);
  out.ctxState=ctx.state;return out});
await b.close();
let bad=0;const ok=(c,m)=>{console.log((c?'ok   ':'FAIL ')+m);if(!c)bad++};const f=v=>v.toFixed(1);
for(const k of ['forestDay','beach','seaSwim','under','flySlow','flyBoost','stormBoost','nightForest','dayRainForest','cave','off']){const r=R[k];console.log('  '+k.padEnd(14),'rms',f(r.rmsDb).padStart(6),'dB  peak',r.peak.toFixed(2),' lo',f(r.lo).padStart(6),' mid',f(r.mid).padStart(6),' hi',f(r.hi).padStart(6),' 4-5k',f(r.cr).padStart(6))}
ok(R.ctxState==='running','audio context is running');
ok(R.stepPeak>.02&&R.stepPeak<.6,'footsteps + landing are audible and do not clip (peak '+R.stepPeak.toFixed(3)+')');
ok(R.off.rmsDb<-70,'ambience off => silence ('+f(R.off.rmsDb)+' dB)');
ok(R.beach.lo>R.forestDay.lo+3,'beach has more ocean (low band) than forest: '+f(R.beach.lo)+' vs '+f(R.forestDay.lo)+' dB');
ok(R.flyBoost.rmsDb>R.flySlow.rmsDb+4,'wind rises with flight speed: '+f(R.flySlow.rmsDb)+' -> '+f(R.flyBoost.rmsDb)+' dB');
ok(R.flyBoost.mid>R.flySlow.mid+4,'wind gets brighter with speed (mid band '+f(R.flySlow.mid)+' -> '+f(R.flyBoost.mid)+')');
ok(R.under.hi<R.seaSwim.hi-15,'underwater is muffled: high band '+f(R.seaSwim.hi)+' -> '+f(R.under.hi)+' dB');
ok(R.under.rmsDb>-60,'underwater still has a sound bed ('+f(R.under.rmsDb)+' dB)');
ok(R.nightForest.cr>R.dayRainForest.cr+3,'crickets at night (4-5 kHz): '+f(R.dayRainForest.cr)+' -> '+f(R.nightForest.cr)+' dB');
ok(R.cave.lo>R.forestDay.lo,'cave has a low rumble ('+f(R.cave.lo)+' vs '+f(R.forestDay.lo)+' dB)');
const maxPeak=Math.max(...['forestDay','beach','seaSwim','under','flySlow','flyBoost','stormBoost','nightForest','cave'].map(k=>R[k].peak));
ok(maxPeak<.6,'no clipping in the loudest scenes (max peak '+maxPeak.toFixed(2)+')');
ok(errs.length===0,'no page errors'+(errs.length?' -> '+errs[0]:''));
console.log(bad?bad+' FAIL':'all audio checks passed');process.exit(bad?1:0);
