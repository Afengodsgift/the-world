// GunLoco: armed locomotion picking (sector + gait with hysteresis, time-scale vs foot speed) and death-fall choice, on the REAL baked metadata (assets/gun_anims.json).
const fs=require('fs'),vm=require('vm'),THREE=require('three'),R=__dirname+'/../';
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const J=JSON.parse(fs.readFileSync(R+'assets/gun_anims.json','utf8'));
// ---- the data pack ----
const names=J.clips.map(x=>x.name);
const need=['a_idle'];for(const g of 'wrs')for(const d of ['f','fl','l','bl','b','br','r','fr'])need.push(g+'_'+d);need.push('d_front','d_front_hs','d_back','d_back_hs','d_right','d_crouch_hs');
ok(need.every(n=>names.includes(n)&&J.meta[n]),'all '+need.length+' expected clips + metadata are present');
ok(J.clips.every(x=>x.tracks.length>20&&x.duration>.3),'every clip has a full set of bone tracks');
ok(need.filter(n=>/^[wrs]_/.test(n)).every(n=>J.meta[n].spd>.8&&J.meta[n].loop),'every gait clip is a loop with a recorded planted-foot speed');
// pick() reads the module-private metadata, which load() fills: feed it the real pack through a stubbed fetch
const c2={Math,THREE,console,AURL:'',fetch:()=>Promise.resolve({ok:true,json:()=>Promise.resolve(J)})};vm.createContext(c2);
THREE.AnimationClip.parse=x=>({name:x.name});
vm.runInContext(fs.readFileSync(R+'src/character/GunLoco.js','utf8')+';this.GL=GunLoco',c2);
const G=c2.GL;
(async()=>{
  await G.load();ok(G.ready(),'load() parses the pack');
  const step=(q,vx,vz,fy,n,dt)=>{let r;for(let i=0;i<n;i++)r=G.pick(q,dt||1/60,vx/60,vz/60,Math.hypot(vx,vz),fy,1);return r};
  // body faces +Z (fy=0). +X is the avatar's LEFT.
  let q={};
  ok(step(q,0,0,0,10).name==='a_idle','standing still -> rifle idle');
  q={};ok(step(q,0,3,0,30).name==='r_f'||step(q,0,3,0,1).name==='r_f','3 m/s forward -> run forward');
  q={};ok(step(q,3,0,0,30).name.endsWith('_l'),'moving to +X (left) -> left strafe');
  q={};ok(step(q,-3,0,0,30).name.endsWith('_r'),'moving to -X (right) -> right strafe');
  q={};ok(step(q,0,-3,0,30).name.endsWith('_b'),'moving backwards while facing away -> backpedal clip');
  q={};ok(step(q,2.1,2.1,0,30).name.endsWith('_fl'),'forward-left diagonal');
  q={};ok(step(q,0,3,Math.PI,30).name.endsWith('_b'),'same travel with the body turned around -> backpedal (direction is body-relative)');
  // hysteresis: wobbling travel direction across a sector edge does not flip clips every frame
  q={};step(q,0,3,0,30);let flips=0,last=null;for(let i=0;i<120;i++){const a=(i%2?1:-1)*.02+Math.PI/8,r=G.pick(q,1/60,Math.sin(a)*3/60,Math.cos(a)*3/60,3,0,1);if(last&&r.name!==last)flips++;last=r.name}
  ok(flips<=1,'a direction jittering on a sector edge flips at most once ('+flips+')');
  // speed edge: 2.1 m/s boundary between walk and run
  q={};let gf=0,lg=null;for(let i=0;i<120;i++){const v=2.0+((i%2)?.08:-.08),r=G.pick(q,1/60,0,v/60,v,0,1);if(lg&&r.name!==lg)gf++;lg=r.name}
  ok(gf<=1,'speed jitter around the walk/run threshold does not flicker ('+gf+')');
  // ---- skating: the clip's planted-foot speed x time-scale must match the real speed ----
  let worst=0,worstAt=0;
  for(let v=.6;v<=9.01;v+=.3){q={};const r=step(q,0,v,0,60),m=J.meta[r.name],plant=m.spd*r.ts,err=Math.abs(plant-v)/v;if(err>worst){worst=err;worstAt=v}}
  console.log('   worst foot-speed error over 0.6..9 m/s forward: '+(worst*100).toFixed(0)+'% at '+worstAt.toFixed(1)+' m/s');
  ok(worst<.25,'forward clips stay within 25% of foot-planted speed from 0.6 to 9 m/s');
  // the speeds the player really moves at with a gun out on Outlaw Isle (6 and 12 m/s x ARMED_SPEED .75, stick-scaled)
  for(const v of [2.25,4.05,4.5,9]){q={};const r=step(q,0,v,0,60),m=J.meta[r.name],err=Math.abs(m.spd*r.ts-v)/v;ok(err<.25,'player speed '+v+' m/s -> '+r.name+' x'+r.ts.toFixed(2)+' ('+(err*100).toFixed(0)+'% off)')}
  // ---- death falls ----
  ok(G.deathClip(0,false,false)==='d_front','shot from the front -> falls backwards (front clip)');
  ok(G.deathClip(Math.PI,false,false)==='d_back','shot from behind -> back clip');
  ok(G.deathClip(0,true,false)==='d_front_hs'&&G.deathClip(Math.PI,true,false)==='d_back_hs','headshots use the headshot falls');
  ok(G.deathClip(-Math.PI/2,false,false)==='d_right','hit from the right side -> side fall');
  ok(G.deathClip(0,true,true)==='d_crouch_hs','crouched behind cover + headshot -> crouch fall');
  ok(typeof G.wrap==='function'&&Math.abs(G.wrap(3*Math.PI)-Math.PI)<1e-9||Math.abs(G.wrap(3*Math.PI)+Math.PI)<1e-9,'wrap() is exported (Outlaw.hurt/visuals use it)');
  ok(G.isLoco('w_f')&&G.isLoco('s_br')&&!G.isLoco('a_idle')&&!G.isLoco('d_front'),'isLoco only matches gait clips');
  console.log(bad?'FAILED '+bad:'all passed');process.exit(bad?1:0);
})();
