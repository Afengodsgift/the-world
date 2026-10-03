const fs=require('fs'),vm=require('vm'),R='/home/claude/the-world/';
const rd=f=>fs.readFileSync(R+f,'utf8');
const three=fs.readFileSync('/tmp/t/node_modules/three/build/three.min.js','utf8');
// real H() from index.html
const idx=fs.readFileSync(R+'index.html','utf8');const hs=idx.indexOf('function H(x,z){');const he=idx.indexOf('\n}\n',hs)+3;const H_SRC=idx.slice(hs,he);
const kline=idx.match(/const K=2\.5;/)[0];
const DB={world_state:[],world_log:[]};
function table(n){return{select(){const q={f:[],o:null};const api={eq(c,v){q.f.push(r=>r[c]===v);return api},in(c,vs){q.f.push(r=>vs.includes(r[c]));return api},order(c){q.o=c;return api},then(res){let r=DB[n].filter(x=>q.f.every(f=>f(x)));if(q.o)r=r.slice().sort((a,b)=>a[q.o]<b[q.o]?-1:1);res({data:JSON.parse(JSON.stringify(r)),error:null})}};return api},
  upsert(rows,opt){return Promise.resolve().then(()=>{const cols=opt.onConflict.split(',');for(const r of rows){const i=DB[n].findIndex(x=>cols.every(c=>x[c]===r[c]));if(i<0)DB[n].push(JSON.parse(JSON.stringify(r)));else if(!opt.ignoreDuplicates)Object.assign(DB[n][i],JSON.parse(JSON.stringify(r)))}return{error:null}})}}}
const bus=[];
function stubEl(){const e={style:{},children:[],textContent:'',appendChild(c){this.children.push(c);return c},set innerHTML(v){},addEventListener(){},remove(){}};return e}
function client(id,name,room){
  const store={},els={};
  const log={banners:[],emotes:[],stops:[],chimes:0};
  const chan={handlers:{},on(t,o,f){this.handlers[o.event]=f},send(m){bus.forEach(c=>{if(c!==chan&&c.up)c.handlers[m.event]&&c.handlers[m.event]({payload:JSON.parse(JSON.stringify(m.payload))})})},up:true};bus.push(chan);
  const others=new Map();others.set(id==='a'?'b':'a',{group:{userData:{nm:id==='a'?'Bee':'Alex'}}});
  const ctx={console,setTimeout,clearTimeout,JSON,Date,Promise,Math,Map,Set,Array,Object,Number,String,Error,isFinite,
    localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=v},myId:id,sb:{from:table},roomCode:room,
    document:{createElement:()=>stubEl(),body:stubEl(),getElementById:()=>stubEl()},
    performance:{now:()=>Date.now()},requestAnimationFrame:()=>0,
    $:i=>els[i]||(els[i]=stubEl()),
    banner:(t,l)=>log.banners.push(l+': '+t),chime:()=>log.chimes++,
    EMO:{p:1,clips:{},def:{},menu:[{id:'wave'}]},AURL:'/assets/',fetch:u=>Promise.resolve({ok:true,json:()=>Promise.resolve(JSON.parse(fs.readFileSync(R+u.replace('/assets/','assets/'),'utf8')))}),loadEmotes:()=>Promise.resolve(),playEmote:e=>log.emotes.push(e),emoStop:q=>log.stops.push(1),
    others,AM:{},solids:[],S:{x:0,y:0,z:0,state:'idle',grounded:true,flying:false,hurt:0},me:{userData:{}}};
  vm.createContext(ctx);vm.runInContext(three,ctx);
  const src=[rd('src/utils/random.js'),rd('src/utils/math.js'),rd('src/data/islands.js'),kline,H_SRC,
   'const RING={x:64.3,z:89.5,R:12};let dash={start:null},srun={start:null};',
   rd('src/interaction/InteractionManager.js'),rd('src/core/Net.js'),rd('src/core/WorldState.js'),rd('src/core/Systems.js'),rd('src/world/Sites.js'),rd('src/interaction/VerbAnims.js'),rd('src/data/interactables.js'),rd('src/interaction/Verbs.js'),
   'this.scene=new THREE.Scene();this.__e={VerbAnims,Verbs,WS,Net,Interaction,H,ISL,CAMP,VERBS,LOCS};'].join('\n');
  vm.runInContext(src,ctx);
  ctx.__e.Net.attach(chan);
  return Object.assign(ctx.__e,{ctx,EMO:ctx.EMO,log,chan,els,others,store,S:ctx.S,solids:ctx.solids,scene:ctx.scene});
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let fails=0;
const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
function stand(c,x,z){c.S.x=x;c.S.z=z;c.S.y=c.H(x,z)+.1;c.S.state='idle';c.S.grounded=true;c.S.flying=false}
function step(c,n,dt){for(let i=0;i<n;i++){c.Verbs._frame(dt||.05,Date.now());c.Interaction.update()}}
(async()=>{
  const ROOM='TEST-ABCD';
  const A=client('a','Alex',ROOM),B=client('b','Bee',ROOM);
  // ---- placement
  A.Verbs.build();B.Verbs.build();
  const ca=A.Verbs.camps(),cb=B.Verbs.camps();
  console.log('camps:',ca.map(c=>c.name+' ('+c.x.toFixed(0)+','+c.z.toFixed(0)+')').join(' | '));
  const wantNames=['the main island',...A.ISL.filter(i=>!A.CAMP.skip.includes(i.n)).map(i=>i.n)];
  const missing=wantNames.filter(n=>!ca.some(c=>c.name===n));
  ok(missing.length===0,'every eligible island has a camp'+(missing.length?' (missing: '+missing.join(', ')+')':''));
  ok(ca.filter(c=>c.name==='the main island').length===2,'main island has 2 camps');
  ok(JSON.stringify(ca.map(c=>[c.id,+c.x.toFixed(3),+c.z.toFixed(3)]))===JSON.stringify(cb.map(c=>[c.id,+c.x.toFixed(3),+c.z.toFixed(3)])),'two clients derive IDENTICAL camps from the room seed');
  const D=client('d','Dee','OTHER-ROOM');D.Verbs.build();
  ok(JSON.stringify(D.Verbs.camps().map(c=>c.x.toFixed(2)))!==JSON.stringify(ca.map(c=>c.x.toFixed(2))),'different room -> different camp layout');
  ok(A.Verbs.items().every(i=>A.H(i.x,i.z)>0.5),'all interactables are on land');
  ok(A.Verbs.items().length===ca.length*3,'3 interactables per camp');
  // ---- boot WS
  await A.WS.init(ROOM,'Alex');await B.WS.init(ROOM,'Bee');A.Verbs.start();B.Verbs.start();
  // ---- verb animations load without touching the emote menu
  await A.VerbAnims.load();
  ok(['hammer','pickaxe','dig2','fish','fish_in'].every(n=>A.EMO.clips[n]&&A.EMO.clips[n].duration>0),'verb clips registered as real THREE AnimationClips');
  ok(A.EMO.def.dig2&&A.EMO.def.dig2.kind==='loop','verb defs registered');
  ok(A.EMO.menu.length===1,'emote menu untouched ('+A.EMO.menu.length+' entry)');
  // ---- single work flow
  const camp=ca.find(c=>c.name==='the main island'),itA=camp.items[0];
  stand(A,itA.x+1,itA.z+1);step(A,2);
  ok(A.Interaction.current()==='verb:dig','Use prompt appears near a dig mound (current='+A.Interaction.current()+')');
  ok(A.els.use.textContent.includes('Dig'),'prompt label is "'+A.els.use.textContent+'"');
  A.Interaction.use();step(A,2);await sleep(5);
  ok(A.log.emotes.includes('dig2'),'verb animation (dig2) requested via playEmote');
  let frames=0;while(!itA.done&&frames<400){step(A,1);frames++}
  ok(itA.done,'solo work completes ('+frames+' frames ~ '+(frames*.05).toFixed(1)+'s, expect ~2.8s)');
  ok(Math.abs(frames*.05-2.8)<.4,'duration matches data (ms:2800)');
  ok(A.WS.getSet('done').includes(itA.id),'WorldState has done id');
  ok(A.WS.getSet('loot').length===1,'loot recorded: '+A.WS.getSet('loot'));
  ok(A.WS.entries().some(e=>e.kind==='verb'&&e.key===itA.id&&e.data.text),'journal entry written: '+(A.WS.entries().find(e=>e.kind==='verb')||{data:{}}).data.text);
  await sleep(30);
  const itB=B.Verbs.items().find(i=>i.id===itA.id);
  ok(itB.done&&itB.vis.done.visible&&!itB.vis.todo.visible,'PARTNER sees the prop change live');
  ok(B.log.banners.some(b=>b.includes('Bee')===false&&b.includes('TOGETHER')),'partner gets a banner: '+B.log.banners.find(b=>b.includes('TOGETHER')));
  // ---- cancel + decay
  const itR=camp.items[1];stand(A,itR.x+1,itR.z+1);step(A,2);A.Interaction.use();step(A,30);
  ok(itR.prog>.3,'progress accumulates (prog='+itR.prog.toFixed(2)+')');
  A.S.x+=2;step(A,2);ok(!itR.done&&A.log.stops.length>0,'moving away cancels work and stops the animation');
  const p0=itR.prog;stand(A,itR.x+8,itR.z);step(A,20);ok(itR.prog<p0,'abandoned progress decays');
  // ---- co-op speed-up
  const itR2=itR;stand(A,itR2.x+1,itR2.z+1);stand(B,itR2.x-1,itR2.z-1);itR2.prog=0;
  step(A,2);step(B,2);A.Interaction.use();step(A,2);
  B.Interaction.use();step(B,2);await sleep(10);
  ok(A.els.use.textContent.length>0,'(partner working flag visible)');
  let f2=0;while(!itR2.done&&f2<400){step(A,1);step(B,1);f2++}
  ok(itR2.done,'co-op work completes');
  ok(f2*.05<2.4,'two players finish ~2x faster ('+(f2*.05).toFixed(1)+'s vs 3.6s solo)');
  ok(A.WS.getSet('done').includes(itR2.id)&&B.WS.getSet('done').includes(itR2.id),'both have state; no double-grant ('+A.WS.getSet('loot').length+' loot total expected 2)');
  ok(A.WS.getSet('loot').length===2,'loot set deduped across both clients');
  // ---- finish camp
  const itF=camp.items[2];stand(A,itF.x+1,itF.z+1);step(A,2);A.Interaction.use();step(A,2);let f3=0;while(!itF.done&&f3<400){step(A,1);f3++}
  ok(camp.cleared,'camp cleared when all 3 done');
  ok(A.WS.getSet('camps').includes(camp.id)&&A.WS.entries().some(e=>e.kind==='camp'),'camp recorded in state + journal');
  await sleep(30);const cB=B.Verbs.camps().find(c=>c.id===camp.id);ok(cB.cleared,'partner camp also cleared and lit');
  ok(!camp.beam.visible,'beacon turned off once restored');
  // ---- spotted + map
  ok(A.Verbs.places().length>0&&A.Verbs.places().every(p=>p.n.includes('main island')),'map only lists camps you have been near (main island so far)');
  const far=A.Verbs.camps().find(c=>c.name==='Ember Isle');stand(A,far.x+60,far.z);step(A,2);
  ok(far.seen&&A.WS.getSet('seen').includes(far.id),'getting within 140m spots the camp');
  ok(A.log.banners.some(b=>b.includes('SPOTTED')),'spot banner shown');
  ok(A.WS.entries().some(e=>e.kind==='spot'&&e.key===far.id),'spot journal entry');
  ok(A.Verbs.places().some(p=>p.n.includes('Ember')&&typeof p.y==='number'),'spotted camp appears on the map with a height');
  await sleep(30);ok(B.Verbs.places().some(p=>p.n.includes('Ember')),'partner also gets it on their map');
  // ---- persistence / late join
  await A.WS.flush();
  const C=client('c','Cy',ROOM);C.Verbs.build();await C.WS.init(ROOM,'Cy');C.Verbs.start();
  const cc=C.Verbs.camps().find(c=>c.id===camp.id);
  ok(cc.cleared&&cc.items.every(i=>i.done),'late joiner (fresh device) sees restored camp from DB');
  ok(C.log.banners.length===0,'restore on boot is silent (no banner spam)');
  ok(C.Verbs.places().some(p=>p.n.includes('Ember')),'late joiner has spotted camps on the map');
  // ---- loot determinism
  ok(JSON.stringify(A.WS.getSet('loot').sort())===JSON.stringify(B.WS.getSet('loot').sort()),'both clients agree on rewards');
  console.log('\ncamp positions (for map):',JSON.stringify(A.Verbs.places().slice(0,3)));
  console.log(fails?'\n'+fails+' FAILED':'\nALL PASSED');process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2)});
