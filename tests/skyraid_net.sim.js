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
    SKY:{x:-1900,z:2350,R:140,base:430},banner(){},H:()=>0,Outlaw:{coins:0,earn(c){this.coins+=c}},
    Net:{on:(t,f)=>{handlers[t]=f},emit:(t,d)=>{for(const c of bus.clients)if(c.id!==id)try{c.handlers[t]&&c.handlers[t](JSON.parse(JSON.stringify(d)),id)}catch(e){errs.push('handler '+e.message)}}},
    Systems:{add(){}}};
  if(partnerId)ctx.others.set(partnerId,{name:'P',group:{userData:{}}});
  vm.createContext(ctx);
  vm.runInContext(['src/ship/SkyRaidCore.js','src/ship/SkyRaidWorld.js','src/ship/SkyRaid.js'].map(f=>fs.readFileSync(R+f,'utf8')).join('\n')+';this.SR=SkyRaid;this.SC=SkyCore',ctx);
  const p={id,ctx,handlers,errs,SR:ctx.SR,SC:ctx.SC,doc,byId};bus.clients.push(p);ctx.SR.build();return p;
}
const clock={t:1000};
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
    A.SR.setInput(-Math.max(-1,Math.min(1,wrap(want-s.h)*2.2)),-Math.max(-1,Math.min(1,((m.y+45)-s.y)*.06)));
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
  for(let f=0;f<60*20;f++){clock.t+=1000/60;A.SR.setInput(0,0);A.SR.frame(1/60)}
  ok(A.errs.length===0,`solo: no controller errors (${A.errs[0]||''})`);
  ok(A.SR.state().run.t>15,'the simulation runs in real time');
  A.SR.leave(false);ok(!A.SR.locked()&&A.ctx.S.grounded,'leaving gives the avatar back');
}
process.exit(fails?1:0);
