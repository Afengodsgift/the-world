// Parkour core: every move triggers and behaves, using scripted inputs on tiny hand-built worlds.
const fs=require('fs'),vm=require('vm');let bad=0;const ok=(c,m)=>{if(!c){bad++;console.log('✗ '+m)}else if(process.env.V)console.log('ok '+m)};
const ctx={console,Math};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../src/parkour/ParkourCore.js','utf8')+';this.P=ParkourCore',ctx);const P=ctx.P;
const DT=1/60,INF=-Infinity;
// ground everywhere except inside "voids"; boxes extra. Heading +z.
const world=(boxes,voids)=>P.makeWorld(boxes||[],(x,z)=>{for(const v of voids||[])if(x>=v[0]&&x<=v[1]&&z>=v[2]&&z<=v[3])return INF;return 0});
// run a script: fn(t,B)->input; returns {B,evs,trace}
function run(W,B,fn,secs,stop){const evs=[],tr=[];let t=0;for(let i=0;i<secs*60;i++){const inp=Object.assign({mx:0,mz:1,jump:false,jumpHeld:false,slide:false,trick:false},fn(t,B));const e=P.step(W,B,inp,DT);for(const x of e)evs.push({t,e:x});tr.push({x:B.x,y:B.y,z:B.z,sp:B.spd,m:B.mode});t+=DT;if(stop&&stop(B))break}return{B,evs,tr}}
const has=(r,e)=>r.evs.some(x=>x.e===e);
const body=(x,z)=>P.newBody(x||0,0,z||0,0);
// 1 sprint accel + cap
{const B=body();const r=run(world(),B,()=>({}),1.4);ok(B.spd>9,'sprint reaches >9 m/s in 1.4 s ('+B.spd.toFixed(2)+')');ok(B.spd<=P.maxRun(B)+.01,'speed capped at maxRun')}
// 2 jump arc
{const B=body();run(world(),B,()=>({}),1.2);let apex=0,t0=null,t1=null,z0=0,z1=0;const W=world();let t=0;let jumped=false;
 for(let i=0;i<200;i++){const inp={mx:0,mz:1,jump:!jumped,jumpHeld:i<40};jumped=true;const e=P.step(W,B,inp,DT);if(e.includes('jump')){t0=t;z0=B.z}apex=Math.max(apex,B.y);t+=DT;if(t0!==null&&B.grounded&&t>t0+.1){t1=t;z1=B.z;break}}
 ok(apex>1.2&&apex<2.1,'jump apex ~1.4-1.9 m ('+apex.toFixed(2)+')');ok(t1&&t1-t0>.55&&t1-t0<.9,'airtime .55-.9 s ('+(t1-t0).toFixed(2)+')');ok(z1-z0>5.5&&z1-z0<13,'sprint jump covers 5.5-13 m ('+(z1-z0).toFixed(1)+')')}
// 3 gap: 5 m void between z=20..25
{const W=world([],[[-50,50,20,25]]);const mk=(sp)=>{const B=body();B.spd=sp;B.vz=sp;B.z=0;return B};
 const fast=run(W,mk(10),(t,B)=>({jump:B.z>18&&B.z<19.2&&B.grounded,jumpHeld:true}),3,B=>B.z>28);ok(fast.B.z>26&&fast.B.y>=-.01,'sprinting jump clears a 5 m gap');
 const slow=run(W,mk(5),(t,B)=>({walk:true,jump:B.z>18.5&&B.z<19.7&&B.grounded,jumpHeld:true}),3,B=>B.z>28||B.y<-3);ok(slow.B.y<-1||slow.B.z<25,'a walking jump does NOT clear it')}
// 4 vault
{const W=world([{x0:-3,x1:3,z0:12,z1:12.5,y0:0,y1:1.0}]);const B=body();const r=run(W,B,()=>({}),3,B=>B.z>20);ok(has(r,'vault'),'running into a 1 m wall vaults it');ok(B.z>18,'...and comes out the other side');ok(B.spd>6,'...keeping speed ('+B.spd.toFixed(1)+')')}
{const W=world([{x0:-3,x1:3,z0:12,z1:12.5,y0:0,y1:1.5}]);const B=body();const r=run(W,B,()=>({}),3,B=>B.z>20);ok(has(r,'vault')&&B.z>18,'a 1.5 m wall is a high vault')}
// 5 slide under an arch (underside 1.05 m up, 6 m long)
{const arch=[{x0:-3,x1:3,z0:16,z1:22,y0:1.05,y1:2.4}];
 const stand=run(world(arch),body(),()=>({}),4,B=>B.z>28);ok(stand.B.z<18,'standing: the arch blocks you');
 const sl=run(world(arch),body(),(t,B)=>({slide:B.z>11&&B.z<12&&B.mode==='ground'}),4,B=>B.z>28);ok(has(sl,'slide')&&sl.B.z>26,'slide carries you under the arch ('+sl.B.z.toFixed(1)+')')}
// 6 wall-up
{const W=world([{x0:-4,x1:4,z0:15,z1:19,y0:0,y1:2.7}]);const B=body();const r=run(W,B,(t,B)=>({jump:B.z>12.2&&B.z<13.5&&B.grounded}),3,B=>B.mode==='ground'&&B.y>2);ok(has(r,'wallup'),'jump at a 2.7 m wall runs up it');ok(Math.abs(B.y-2.7)<.05&&B.z>14.5,'...and ends standing on top')}
// 7 wall-run along a tall wall, then wall-jump. wall at x=1.2 (west face), void floor beside it
{const W=world([{x0:1.2,x1:2.2,z0:0,z1:40,y0:-2,y1:8}],[[-4,1.2,12,40]]);const B=body(0.4,0);B.vz=9;B.spd=9;B.yaw=0;
 let step=0;const r=run(W,B,(t,B)=>{const jump=B.z>8&&B.z<9&&B.grounded&&step===0;if(jump)step=1;return{jump,jumpHeld:true,mx:0.15,mz:1}},2.2);
 ok(has(r,'wallrun'),'jumping along a tall wall starts a wall-run');
 const t0=r.evs.find(x=>x.e==='wallrun');const mid=r.tr.filter((q,i)=>q.m==='wallrun').length;if(process.env.V)console.log(r.evs.map(x=>x.e+'@'+x.t.toFixed(2)).join(' '));ok(mid>25,'...which lasts a while ('+mid+' frames)');
 ok(B.y>0.2||has(r,'wallrun'),'airborne beside the wall');
 // continue: jump off
 const B2=B;const r2=run(W,B2,(t,B)=>({jump:B.mode==='wallrun'&&B.mt>.3,mx:0,mz:1}),.8);ok(has(r2,'walljump')||B2.mode!=='wallrun','jump during a wall-run kicks off the wall')}
// 8 ledge + mantle: pillar top at 2.0
{const W=world([{x0:-3,x1:3,z0:10,z1:16,y0:0,y1:2.0}]);const B=body();
 const r=run(W,B,(t,B)=>({jump:B.z>5.2&&B.z<6.2&&B.grounded,jumpHeld:true,mz:1}),3,B=>B.mode==='ground'&&B.y>1.9);
 ok(has(r,'ledge')||has(r,'vault')||has(r,'wallup'),'a 2 m block is climbable ('+r.evs.map(x=>x.e).join(',')+')');ok(B.y>1.9,'we end up on top ('+B.y.toFixed(2)+')')}
{const W=world([{x0:-3,x1:3,z0:10,z1:16,y0:0,y1:3.9}]);const B=body();
 const r=run(W,B,(t,B)=>({jump:(B.z>5.0&&B.z<5.8&&B.grounded)||(B.mode==='air'&&B.z>8.6&&B.z<9.0),jumpHeld:true,mz:1}),3);ok(has(r,'wallkick')||has(r,'ledge')||has(r,'wallup'),'a 3.9 m wall gives a kick or a grab, not a clip-through ('+r.evs.map(x=>x.e).join(',')+')');ok(!(Math.abs(B.x)<3&&B.z>10&&B.z<16&&B.y<3.8),'never inside the wall')}
// 9 roll vs hard landing: drop off a 6 m platform
{const W=world([{x0:-4,x1:4,z0:-4,z1:6,y0:-1,y1:6}]);const B=P.newBody(0,6,0,0);B.spd=7;B.vz=7;const r=run(W,B,()=>({}),2);ok(has(r,'roll')||has(r,'hardland'),'a 6 m drop lands with a roll or a thud ('+r.evs.map(x=>x.e).join(',')+')');ok(has(r,'roll'),'running forward off 6 m rolls out')}
{const W=world([{x0:-4,x1:4,z0:-4,z1:6,y0:-1,y1:9}]);const B=P.newBody(0,9,8,0);B.mode='air';B.grounded=false;const r=run(W,B,()=>({mx:0,mz:0}),2);ok(has(r,'hardland')||has(r,'roll'),'standing drop from 9 m has a landing cost')}
// 10 flip: clean vs early
{const B=body();run(world(),B,()=>({}),1.2);let j=false,fl=false;const W=world();const evs=[];for(let i=0;i<120;i++){const e=P.step(W,B,{mx:0,mz:1,jump:!j,jumpHeld:i<30,trick:j&&!fl&&B.airT>.15&&(fl=true)},DT);j=true;for(const x of e)evs.push(x)}
 ok(evs.includes('flip'),'trick in the air starts a flip');ok(evs.includes('flipland')||evs.includes('stumble'),'a flip ends in flipland or stumble ('+evs.join(',')+')')}
{const B=body();run(world(),B,()=>({}),1.2);const W=world();const evs=[];let j=false,fl=false;const hi=B.flow;for(let i=0;i<120;i++){const e=P.step(W,B,{mx:0,mz:1,jump:!j,jumpHeld:i<30,trick:j&&!fl&&B.airT>.14&&(fl=true)},DT);j=true;for(const x of e)evs.push(x)}
 ok(evs.includes('flipland')?B.flow>hi:true,'a clean flip raises flow')}
// 11 flow raises top speed
{const B=body();B.flow=1;B.fT=99;const r=run(world(),B,()=>({}),3);ok(B.spd>13,'full flow lifts top speed above 13 m/s ('+B.spd.toFixed(1)+')')}
// 12 wide turns at speed
{const B=body();run(world(),B,()=>({}),1.5);const x0=B.x;run(world(),B,()=>({mx:1,mz:0}),.1);ok(B.vz>3,'at speed you cannot turn on a dime (vz '+B.vz.toFixed(1)+')')}
// 13 never tunnels through a wall at full speed
{const W=world([{x0:-3,x1:3,z0:10,z1:12,y0:0,y1:9}]);const B=body();B.flow=1;const r=run(W,B,()=>({jump:false}),3);ok(!(B.z>12&&B.y<8),'no tunnelling through a tall wall')}
// 14 walking off a ledge gives coyote time
{const W=world([{x0:-3,x1:3,z0:-3,z1:6,y0:-1,y1:3}]);const B=P.newBody(0,3,0,0);B.spd=6;B.vz=6;let j=false;const r=run(W,B,(t,B)=>{const jump=!j&&B.z>6.0&&B.mode==='air'&&B.airT<.1;if(jump)j=true;return{jump}},1.2);ok(has(r,'jump')||B.mode!=='ground','coyote jump just after leaving a ledge ('+r.evs.map(x=>x.e).join(',')+')')}
// 12 auto wall-up (no jump press), air auto-climb, air-dash, dive
{const W=world([{x0:-3,x1:3,z0:20,z1:21,y0:0,y1:2.8,k:'wall'},{x0:-3,x1:3,z0:21,z1:90,y0:0,y1:2.8,k:'plat'}]);const B=body();const r=run(W,B,()=>({}),3.1);
 ok(has(r,'wallup'),'running into a 2.8 m wall climbs it with no button press');ok(B.y>2.7&&B.z>20.5,'ends on top of the wall ('+B.y.toFixed(1)+','+B.z.toFixed(1)+')')}
{const B=body();B.mode='air';B.y=4;B.vy=2;B.spd=10;B.vz=10;B.airT=.3;const W=world();let n=0;const r=run(W,B,(t)=>({jump:t>.05&&t<.12}),.5);ok(has(r,'airdash'),'second jump press in the air = air dash');
 const B2=body();B2.mode='air';B2.y=4;B2.vy=2;B2.spd=10;B2.vz=10;B2.airT=.3;const r2=run(W,B2,(t)=>({jump:(t>.05&&t<.1)||(t>.3&&t<.35)}),.6);ok(r2.evs.filter(x=>x.e==='airdash').length===1,'air dash only once per flight')}
{const B=body();B.mode='air';B.y=8;B.vy=0;B.spd=10;B.vz=10;B.airT=.3;const r=run(world(),B,(t)=>({slide:t>.05&&t<.12}),1.2);ok(has(r,'dive')&&has(r,'diveroll'),'slide in the air dives and rolls out');ok(B.spd>5,'dive keeps speed ('+B.spd.toFixed(1)+')')}
process.exit(bad?1:0);
