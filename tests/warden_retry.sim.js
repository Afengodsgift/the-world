// Asset retries: a download that fails once must not leave the fight silent / the boss invisible for the rest of the session (regression: models, weapons and sounds all stayed missing while combat kept running).
const fs=require('fs'),vm=require('vm'),R=__dirname+'/../';let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
(async()=>{
  const calls={},timers=[];
  const ctx={console,Math,performance:{now:()=>Date.now()},setTimeout:(f,ms)=>{timers.push([f,ms]);return timers.length},
    WAudio:{get:()=>({state:'running',currentTime:0,decodeAudioData:(b,okf)=>okf({duration:1}),createBufferSource:()=>({playbackRate:{},connect(){},start(){}}),createGain:()=>({gain:{},connect(){}})}),out:()=>({})},
    fetch:u=>{calls[u]=(calls[u]||0)+1;if(calls[u]===1)return Promise.reject(new Error('net'));if(/missing/.test(u))return Promise.resolve({ok:false,status:404});return Promise.resolve({ok:true,status:200,arrayBuffer:async()=>new ArrayBuffer(8)})}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(R+'src/combat/WardenSfx.js','utf8')+';this.S=WardenSfx',ctx);const S=ctx.S;
  S.load();await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
  ok(Object.keys(S._t().buf).length===0,'first attempt of every sample failed (nothing decoded yet)');
  ok(timers.length===12,'each of the 12 samples scheduled a retry ('+timers.length+')');
  for(let k=0;k<3;k++){const t=timers.splice(0);for(const [f] of t)f();for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r))}
  ok(Object.keys(S._t().buf).length===12,'all 12 samples arrive after the retry ('+Object.keys(S._t().buf).length+')');
  ok(S.play('strike',.5,1)===true,'and they play');
  // source checks for the other two loaders
  const pc=fs.readFileSync(R+'src/combat/PlayerCombat.js','utf8'),mx=fs.readFileSync(R+'src/combat/WardenMX.js','utf8');
  ok(/function glbLoad\(b,T,n\)/.test(pc)&&/glbLoad\(b,T,n\+1\)/.test(pc)&&/Math\.min\(8000/.test(pc),'model loads retry');
  ok(/const go=n=>new THREE\.GLTFLoader/.test(pc)&&/go\(n\+1\)/.test(pc),'weapon attaches retry');
  ok(/tryFetch\(file,6\)/.test(mx)&&/const load=\(\)=>fetchRole\(role,q\.av\)/.test(mx),'animation sets retry');
  process.exit(bad?1:0)})();
