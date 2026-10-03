const fs=require('fs'),vm=require('vm'),R='/home/claude/the-world/';
const rd=f=>fs.readFileSync(R+f,'utf8');
const three=(()=>{const P=require('path');for(const d of (process.env.NODE_PATH||'').split(P.delimiter).concat([P.join(__dirname,'node_modules')])){const f=P.join(d,'three','build','three.min.js');if(d&&fs.existsSync(f))return fs.readFileSync(f,'utf8')}throw new Error('three@0.147.0 not found: run `npm i three@0.147.0` and set NODE_PATH to its node_modules')})();
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
   rd('src/interaction/InteractionManager.js'),rd('src/core/Net.js'),rd('src/core/WorldState.js'),rd('src/core/Systems.js'),rd('src/world/Fx.js'),rd('src/world/Sites.js'),rd('src/core/Seeded.js'),rd('src/interaction/VerbAnims.js'),rd('src/data/interactables.js'),rd('src/data/puzzles.js'),rd('src/interaction/Link.js'),rd('src/interaction/Verbs.js'),rd('src/world/Vaults.js'),
   'this.scene=new THREE.Scene();this.__e={VerbAnims,Verbs,Vaults,Link,WS,Net,Interaction,H,ISL,CAMP,VERBS,VAULT,LOCS};'].join('\n');
  vm.runInContext(src,ctx);
  ctx.__e.Net.attach(chan);
  return Object.assign(ctx.__e,{ctx,EMO:ctx.EMO,log,chan,els,others,store,S:ctx.S,solids:ctx.solids,scene:ctx.scene});
}

module.exports={client,DB,vm};
