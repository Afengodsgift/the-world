// Stadium Isle: the football pitch lives on its own bare island. Run: NODE_PATH=<three@0.147.0>/node_modules node tests/stadium.sim.js
const {client,vm}=require('./harness');
const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};let fails=0;
(async()=>{
  const A=client('a','Alex','STAD-TEST1');
  const g=n=>vm.runInContext(n,A.ctx);
  const I=g("ISL.find(i=>i.n==='Stadium Isle')");
  ok(!!I,'Stadium Isle exists');
  ok(I&&I.bare===true&&I.ded===true,'it is flagged bare (no rng draws, no vegetation) and dedicated');
  ok(g("ISL[ISL.length-1].n")==='Stadium Isle','it is the LAST island, so every existing island keeps its index');
  ok(g("PITCH.x")===I.x&&g("PITCH.z")===I.z,'the pitch sits at the island centre');
  ok(g("Math.hypot(PITCH.x,PITCH.z)")>1800,'the island is far from the main island ('+Math.round(g("Math.hypot(PITCH.x,PITCH.z)"))+' m)');
  const gap=Math.min(...g("ISL.filter(i=>i.n!=='Stadium Isle')").map(o=>Math.hypot(o.x-I.x,o.z-I.z)-o.R-I.R));
  ok(gap>700,'nearest other island is far away (edge-to-edge gap '+Math.round(gap)+' m)');
  // terrain: land under the pitch, flat, island has land all round, none of the main island's old flatten left
  const H=(x,z)=>A.H(x,z);let mn=1e9,mx=-1e9;
  for(let x=I.x-31;x<=I.x+31;x+=2)for(let z=I.z-20;z<=I.z+20;z+=2){const h=H(x,z);mn=Math.min(mn,h);mx=Math.max(mx,h)}
  ok(mx-mn<.02&&Math.abs(mn-g("PITCH.y"))<.05,'the playing field is perfectly flat at PITCH.y ('+mn.toFixed(2)+'..'+mx.toFixed(2)+')');
  let landAll=true;for(let a=0;a<12;a++){if(!(H(I.x+Math.cos(a*.5236)*120,I.z+Math.sin(a*.5236)*120)>.5))landAll=false}
  ok(landAll,'there is dry land 120 m out in every direction (room for stands and lights)');
  ok(Math.abs(H(-43,17)-2.55)>.05,'the main island no longer has a flattened pitch at its old spot');
  // other systems stay off the island
  A.Verbs.build();A.Vaults.build();
  const off=(x,z)=>Math.hypot(x-I.x,z-I.z)<I.R*1.2;
  ok(A.Verbs.camps().every(c=>!off(c.x,c.z)),'no camp on Stadium Isle ('+A.Verbs.camps().length+' camps)');
  ok(A.Vaults.vaults().every(v=>!off(v.x,v.z)),'no vault on Stadium Isle ('+A.Vaults.vaults().length+' vaults)');
  A.Events._setClock(()=>Date.now());let bad=0,n=0;const s0=Math.floor(Date.now()/A.EVENTS.slotMs);
  const opt={meteor:{rmin:30,rmax:170,clear:14},visitor:{rmin:25,rmax:175,clear:6},rings:{rmin:20,rmax:150,clear:8}};
  for(let s=s0;s<s0+250;s++){const e=A.Events.schedule(s);if(!e)continue;n++;const st=A.Events.site(e,opt[e.type]);if(st&&off(st.x,st.z))bad++}
  ok(bad===0,'no event ever lands on Stadium Isle ('+n+' events checked)');
  // the world map can fly you there, to the kick-off side
  ok(g("LOCS.some(l=>l.n==='Stadium Isle')")&&g("LOCS.some(l=>l.n==='Soccer Pitch')"),'both the island and the pitch are listed on the map');
  console.log(fails?'\n'+fails+' FAILED':'\nALL PASSED');process.exit(fails?1:0);
})().catch(e=>{console.error('CRASH',e);process.exit(2)});
