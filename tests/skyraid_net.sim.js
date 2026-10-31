// Sky Raid controller + net, end to end with two vm "phones" sharing a loopback Net: lobby invite -> accept -> go -> both begin; a bot flies the pilot seat on the
// host, the guest man the turret and mirrors the host's snapshots; shots land, the guest sees the same fortress, leaving ends it for both. DOM is faked.
// Also a solo raid with the AI crew mate. Catches silent exceptions in the controller (console.error is counted). Run: node tests/skyraid_net.sim.js
const fs=require('fs'),vm=require('vm'),R=require('path').join(__dirname,'..')+'/';
const THREE=require('three');
let fails=0;const ok=(c,m)=>{if(!c){fails++;console.log('FAIL',m)}else console.log('ok  ',m)};
const g2d=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:10}):k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
class El{getContext(){return g2d}constructor(t){this.tagName=t;this.className='';this._h='';this.children=[];this.style={};this.dataset={};this.ls={};this._q={};const self=this;this.classList={add:c=>{if(!self.className.split(' ').includes(c))self.className+=' '+c},remove:c=>{self.className=self.className.split(' ').filter(x=>x&&x!==c).join(' ')},toggle:(c,f)=>{f?self.classList.add(c):self.classList.remove(c)},contains:c=>self.className.split(' ').includes(c)}}
  set innerHTML(v){this._h=v}get innerHTML(){return this._h}set textContent(v){this._t=v}get textContent(){return this._t||''}
  appendChild(c){this.children.push(c);return c}remove(){}addEventListener(t,f){(this.ls[t]=this.ls[t]||[]).push(f)}setAttribute(){}
  querySelector(s){return this._q[s]||(this._q[s]=new El('q'))}get firstChild(){return null}set onclick(f){this._oc=f}}
const bus={clients:[]};
function phone(id,name,partnerId,clock){
  const handlers={},byId={};
  const doc={createElement:t=>new El(t),getElementById:i=>byId[i]||(byId[i]=new El('d')),body:new El('body'),head:new El('head')};
  const errs=[];
  const ctx={Math,Object,Number,JSON,Array,isFinite,Map,Float32Array,Set,String,Date,setTimeout:()=>0,clearTimeout(){},console:{log(){},warn(){},error:(...a)=>errs.push(a.join(' '))},THREE,document:doc,
    performance:{now:()=>clock.t},matchMedia:()=>({matches:true}),innerWidth:800,innerHeight:400,window:{},
    scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(65,2,.1,5000),S:{x:0,y:2,z:0,rot:0,vy:0,grounded:true,flying:false},me:null,others:new Map(),keys:{},entered:true,myId:id,myName:name,
    SKY:{x:-1900,z:2350,R:140,base:430},banner(){},H:()=>0,Outlaw:{coins:0,earn(c){this.coins+=c},coins_(){return this.coins},spend(c){if(this.coins<c)return false;this.coins-=c;return true}},
    Net:{on:(t,f)=>{handlers[t]=f},emit:(t,d)=>{for(const c of bus.clients)if(c.id!==id)try{c.handlers[t]&&c.handlers[t](JSON.parse(JSON.stringify(d)),id)}catch(e){errs.push('handler '+e.message)}}},
    Systems:{add(){}}};
  if(partnerId)ctx.others.set(partnerId,{name:'P',group:{userData:{}}});
  vm.createContext(ctx);
  vm.runInContext(['src/ship/SkyRaidCore.js','src/ship/SkyRaidWorld.js','src/ship/SkyRaid.js'].map(f=>fs.readFileSync(R+f,'utf8')).join('\n')+';this.SR=SkyRaid;this.SC=SkyCore',ctx);
  const p={id,ctx,handlers,errs,SR:ctx.SR,SC:ctx.SC,doc,byId};bus.clients.push(p);ctx.SR.build();return p;
}
const clock={t:1000},wrapA=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a};
// ---------- two players ----------
{
  const A=phone('a','A','b',clock),B=phone('b','B','a',clock);
  ok(A.errs.length===0&&B.errs.length===0,'both phones build with no errors');
  // the invite flow through the real handlers: A (host, pilot) invites, B accepts
  A.SR._t().begin;  // (exists)
  A.handlers.sky&&B.handlers.sky;
  // drive the lobby through the net messages exactly as the buttons would
  A.ctx.__open=A.SR.open;A.SR.open();
  const rid='r1';
  B.handlers.sky({k:'inv',rid,role:'pilot',name:'A'},'a');                       // B sees the invite (shows a prompt)
  const yes=B.doc.body.children.find(c=>c.className==='rl-inv');ok(!!yes,'the invited phone shows a join prompt');
  yes.querySelector('.rl-y').onclick&&0;
  // accept as the real button would: call its handler through the element we created
  const btn=yes.querySelector('.rl-y');ok(typeof btn._oc==='function','the Join button has a handler');btn._oc();
  // the host side normally holds pendingCfg from invite(); emulate via its own invite path
  const st=A.SR._t().ST;st.rid=rid;st.pendingCfg={role:'pilot',pid:'b'};
  B.SR._t().ST.joinCfg&&0;
  A.handlers.sky({k:'acc',rid},'b');
  ok(A.SR.locked()&&B.SR.locked(),'host and guest both entered the raid');
  ok(A.SR.state().host&&!B.SR.state().host&&A.SR.state().role==='pilot'&&B.SR.state().role==='gunner','roles: host pilots, guest man the turret');
  const SCa=A.SC;let kills0=0;
  for(let f=0;f<60*70;f++){
    clock.t+=1000/60;
    const ra=A.SR.state().run,rb=B.SR.state().run;if(!ra||!rb)break;
    const s=ra.ship,m=SCa.marker(ra)||{x:-1900,z:2350,y:490};let want=Math.atan2(m.x-s.x,m.z-s.z);const dist=Math.hypot(m.x-s.x,m.z-s.z);if(ra.state==='raid'&&dist<170)want+=Math.PI/2;
    const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a};
    A.SR.setInput(-Math.max(-1,Math.min(1,wrap(want-s.h)*2.2)),-Math.max(-1,Math.min(1,((m.y+45)-s.y)*.06)));   // the pilot works the arrow pad
    // guest aims at the nearest target in ITS mirrored run, holds fire
    const tg=B.SC.targets(rb).filter(q=>q.kind!=='shield').sort((a,b)=>Math.hypot(a.o.x-s.x,a.o.y-s.y,a.o.z-s.z)-Math.hypot(b.o.x-s.x,b.o.y-s.y,b.o.z-s.z))[0];
    if(tg){const ax=B.SR._t().aim,bs=rb.ship,dx=tg.o.x-bs.x,dy=tg.o.y-(bs.y+6),dz=tg.o.z-bs.z;ax.yaw=wrap(Math.atan2(dx,dz)-bs.h);ax.pit=Math.atan2(dy,Math.hypot(dx,dz));B.ctx.keys.Space=rb.heat<.85}
    A.SR.frame(1/60);B.SR.frame(1/60);
    if(ra.state==='win'||ra.state==='fail')break;
  }
  const ra=A.SR.state().run,rb=B.SR.state().run;
  ok(A.errs.length===0&&B.errs.length===0,`no controller errors on either phone (${A.errs.concat(B.errs).slice(0,2).join(' | ')})`);
  ok(ra.score.hits>0&&ra.score.turrets>0,`the guest's turret hits and kills things on the host (hits ${ra.score.hits}, turrets ${ra.score.turrets})`);
  ok(rb.score.hits===ra.score.hits||Math.abs(rb.score.hits-ra.score.hits)<=8,'the guest mirrors the score');
  const dd=Math.hypot(ra.ship.x-rb.ship.x,ra.ship.z-rb.ship.z);ok(dd<25,`guest ship is within ${dd.toFixed(1)} m of the host's`);
  ok(rb.stage===ra.stage||Math.abs(rb.stage-ra.stage)<=1,'both phones are on the same fortress');
  console.log(`     raid state ${ra.state}, stage ${ra.stage+1}, hull ${ra.ship.hull|0}, t=${ra.t.toFixed(0)}s`);
  B.SR.leave(true);ok(!B.SR.locked()&&!A.SR.locked(),'the guest leaving ends the raid for the host too');
}
// ---------- solo with the AI crew mate ----------
{
  const A=phone('s','S',null,clock);A.SR.open();A.SR._t().begin({seed:5,role:'pilot',host:true,partner:null});
  ok(A.SR.locked()&&A.SR.state().run&&A.SR.state().run.hasGunner===false,'solo raid starts with the AI crew mate');
  for(let f=0;f<60*20;f++){clock.t+=1000/60;A.SR.frame(1/60)}
  ok(A.errs.length===0,`solo: no controller errors (${A.errs[0]||''})`);
  ok(A.SR.state().run.t>15,'the simulation runs in real time');
  A.SR.leave(false);ok(!A.SR.locked()&&A.ctx.S.grounded,'leaving gives the avatar back');
}
// ---------- v2: seat swap, roll, missiles, free-look, perf settings ----------
{
  const A=phone('s2','S',null,clock);A.SR.open();const cam=A.ctx.camera,sc=A.ctx.scene;sc.fog=new THREE.Fog('#cfe3f2',150,1700);const far0=cam.far;
  A.SR._t().begin({seed:9,role:'pilot',host:true,partner:null});
  ok(cam.far<far0&&sc.fog.far<1700,'the raid trims the far plane and fog for speed');
  const T=A.SR._t(),run=()=>A.SR.state().run;
  const step=n=>{for(let f=0;f<n;f++){clock.t+=1000/60;A.SR.frame(1/60)}};
  step(30);
  // pad: pressing left turns the ship left (heading grows)
  const h0=run().ship.h;A.SR.setInput(-1,0);step(60);A.SR.setInput(0,0);ok(((run().ship.h-h0+Math.PI*3)%(Math.PI*2)-Math.PI)>.25,'the stick turns the ship left');
  // roll
  T.BTN.roll=true;step(3);ok(run().ship.rollT>0&&run().ship.inv>0,'ROLL gives the pilot a barrel roll with i-frames');
  const sh=A.SR._t().view();step(10);ok(Math.abs(sh.spin)>0,'and the ship visibly spins');step(60);
  // free look
  T.look.yaw=1.2;T.look.pit=.3;T.look.t=clock.t;step(5);const ly=T.look.yaw;ok(ly>1,'free-look holds while you drag');clock.t+=3000;step(180);ok(Math.abs(T.look.yaw)<.2,'and eases back behind the ship once you let go');
  // seat swap, solo: you become the gunner, an autopilot flies
  ok(run().hasGunner===false,'solo pilot: the crew mate guns');
  T.swapSeat();ok(A.SR.state().role==='gunner'&&run().hasGunner===true,'SWAP SEAT: you man the turret');
  const x0=run().ship.x,z0=run().ship.z;step(120);ok(Math.hypot(run().ship.x-x0,run().ship.z-z0)>20,'the autopilot flies the ship while you gun');
  const yawBefore=T.view().h+T.aim.yaw;step(60);ok(Math.abs(wrapA(T.view().h+T.aim.yaw-yawBefore))<.15,'the turret keeps pointing at the same spot while the ship turns');
  T.BTN.missile=true;T.aim.pit=.3;step(3);ok(run().msl.length>0||run().mCd>0,'MISSILES fire a homing salvo');
  clock.t+=3000;T.swapSeat();ok(A.SR.state().role==='pilot'&&run().hasGunner===false,'swap back: you fly, the crew mate guns');
  step(30);ok(A.errs.length===0,`no errors (${A.errs[0]||''})`);
  A.SR.leave(false);ok(cam.far===far0&&sc.fog.far===1700,'leaving restores the far plane and fog');
}
{ // co-op swap: the guest asks, the host flips both phones
  const A=phone('ca','A','cb',clock),B=phone('cb','B','ca',clock);A.SR.open();
  B.handlers.sky({k:'inv',rid:'rr',role:'pilot',name:'A'},'ca');B.doc.body.children.find(c=>c.className==='rl-inv').querySelector('.rl-y')._oc();
  const st=A.SR._t().ST;st.rid='rr';st.pendingCfg={role:'pilot',pid:'cb'};A.handlers.sky({k:'acc',rid:'rr'},'cb');
  const step=n=>{for(let f=0;f<n;f++){clock.t+=1000/60;A.SR.frame(1/60);B.SR.frame(1/60)}};step(60);
  ok(A.SR.state().role==='pilot'&&B.SR.state().role==='gunner','co-op starts: host pilot, guest gunner');
  B.SR._t().swapSeat();step(10);ok(A.SR.state().role==='gunner'&&B.SR.state().role==='pilot','guest presses SWAP SEAT: both phones trade seats');
  // the new pilot (guest) rolls: the host simulates it
  B.SR._t().BTN.roll=true;step(30);ok(A.SR.state().run.ship.rollCd>0||A.SR.state().run.ship.rollT>0,'the guest pilot\'s roll reaches the host simulation');
  clock.t+=3000;A.SR._t().swapSeat();step(10);ok(A.SR.state().role==='pilot'&&B.SR.state().role==='gunner','host presses SWAP SEAT: seats trade back');
  ok(A.errs.length===0&&B.errs.length===0,`co-op swap: no errors (${A.errs.concat(B.errs)[0]||''})`);
}
// ---------- v5: hangar ----------
{
  const A=phone('hg','H',null,clock);A.ctx.Outlaw.coins=1000;A.ctx.Outlaw.coins=function(){return 1000};   // coins() returns the wallet
  let wallet=1000;A.ctx.Outlaw.coins=()=>wallet;A.ctx.Outlaw.spend=c=>{if(wallet<c)return false;wallet-=c;return true};
  A.SR.open();const T=A.SR._t();T.openHangar();const sh=A.doc.body.children[A.doc.body.children.length-1];
  sh.ls.click[0]({target:{closest:()=>({classList:{contains:()=>false},dataset:{up:'hull'}})}});ok(T.UP.hull===1&&wallet===1000-150,'buying a hangar upgrade spends coins and levels it up');
  for(let i=0;i<10;i++){const s2=A.doc.body.children[A.doc.body.children.length-1];s2.ls.click[0]({target:{closest:()=>({classList:{contains:()=>false},dataset:{up:'hull'}})}})}
  ok(T.UP.hull<=5,'upgrades cap at level 5');
  T.begin({seed:4,role:'pilot',host:true,partner:null});ok(A.SR.state().run.ship.hullMax>Math.round(380*1.35),'the raid starts with the upgraded hull');A.SR.leave(false);ok(A.errs.length===0,`hangar: no errors (${A.errs[0]||''})`);
}
process.exit(fails?1:0);
