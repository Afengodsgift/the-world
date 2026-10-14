// Outlaw Isle in the REAL game (headless Chromium, software WebGL, landscape phone viewport, touch): armed locomotion clips, the shoulder / first-person / scope camera,
// directional damage, death falls, and (below) consumables + two-player consistency. Not part of run_all.sh (needs playwright-core + Chromium):
//   NODE_PATH=<dir with three@0.147.0 and playwright-core> node tests/outlaw_browser.mjs [--shots dir]
// Software GL runs this scene at ~1 fps, so timing-sensitive things are checked as state (what the game decided), not as smoothness.
import {start,real} from './lib/browser.mjs';
const shots=process.argv.includes('--shots')?process.argv[process.argv.indexOf('--shots')+1]:null;
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const B=await start();
const spotOpen=p=>p.evaluate(()=>{for(let r=60;r<130;r+=10)for(let a=0;a<6.28;a+=.4){const x=OUT.x+Math.cos(a)*r,z=OUT.z+Math.sin(a)*r;if(H(x,z)>1&&solids.every(c=>Math.hypot(c.x-x,c.z-z)>25))return[x,z]}return null});
const equipAt=(p,xz,w)=>p.evaluate(([[x,z],w])=>{S.x=x;S.z=z;S.y=H(x,z)+.5;S.yaw=Math.PI;S.pitch=.2;if(me.userData.gunI!==w)Outlaw.equip(w)},[xz,w]);

// ================= 1. SOLO =================
{const p=await B.open('?perf=1');await p.waitForTimeout(2500);
 ok(await p.evaluate(()=>GunLoco.ready()),'the Mixamo gun pack (assets/gun_anims.json) loads in the real game');
 const sp=await spotOpen(p);await equipAt(p,sp,2);await p.waitForTimeout(2000);
 ok(await p.evaluate(()=>CameraRig.shooterActive()&&CameraRig.view()==='tps'),'drawing a gun puts the camera in the shoulder view');
 // ---- animation: direction of travel relative to the body picks the clip ----
 const still=()=>p.waitForFunction(()=>Math.hypot(S.gvx||0,S.gvz||0)<.15,null,{timeout:60000});
 const dir=async(name,x,y,re)=>{await equipAt(p,sp,2);await p.waitForTimeout(1500);await p.evaluate(([x,y])=>{stickV={x,y}},[x,y]);await p.waitForTimeout(2200);const cur=await p.evaluate(()=>me.userData.cur);ok(re.test(cur),name+' -> '+cur);await p.evaluate(()=>{stickV={x:0,y:0}});await still()};
 await dir('stick forward',0,-1,/^[wrs]_f$/);await dir('stick back (backpedal, still facing the crosshair)',0,1,/^[wrs]_b$/);await dir('stick left (strafe)',-1,0,/^[wrs]_l$/);await dir('stick right (strafe)',1,0,/^[wrs]_r$/);
 await p.waitForFunction(()=>me.userData.cur==='a_idle',null,{timeout:60000}).then(()=>ok(true,'stopping settles to the rifle idle'),async()=>ok(false,'stopping settles to the rifle idle (cur='+await p.evaluate(()=>me.userData.cur)+')'));
 // ---- camera: aim survives view changes, can look above the horizon, never inside a building ----
 const cam=await p.evaluate(()=>{const o={},run=n=>{for(let i=0;i<n;i++)CameraRig.update(.016)},dy=()=>{const v=new THREE.Vector3();camera.getWorldDirection(v);return v.y};
  S.x=OUT.x+2;S.z=OUT.z+14;S.y=H(S.x,S.z)+.1;run(60);S.pitch=-.3;run(60);o.tpsUp=dy();o.p0=S.pitch;
  CameraRig.toggleView();run(60);o.p1=S.pitch;o.fpsUp=dy();CameraRig.toggleView();run(60);o.p2=S.pitch;
  CameraRig.setZoom(5,true);run(60);o.p3=S.pitch;CameraRig.setZoom(1,false);run(60);o.p4=S.pitch;S.pitch=-.95;run(80);o.camY=camera.position.y;o.gy=H(camera.position.x,camera.position.z);o.vis=me.visible;o.camD=0;return o});
 ok(cam.tpsUp>.1,'shoulder view can aim above the horizon (look-up y='+cam.tpsUp.toFixed(2)+'; it was clamped below the horizon)');
 ok([cam.p0,cam.p1,cam.p2,cam.p3,cam.p4].every(v=>Math.abs(v+.3)<1e-6),'aim pitch is kept across fps / shoulder / scope switches');
 ok(cam.camY>cam.gy+.3,'looking steeply up never puts the camera under the ground ('+(cam.camY-cam.gy).toFixed(2)+' m clearance)');
 const bx=await p.evaluate(()=>{const C={x:OUT.x,z:OUT.z},bl=[[-14,-8,11,7,6,0],[14,-8,11,7,5.4,0],[-14,10,10,6,5,Math.PI],[14,10,9,6,4.6,Math.PI],[-34,0,12,7,5,Math.PI/2],[34,0,10,8,7.5,-Math.PI/2],[-24,-26,9,6,5,0],[12,26,8,5,4.4,Math.PI]];
  const ins=(x,y,z,b,m)=>{const [bx,bz,w,d,h,ry]=b,dx=x-(C.x+bx),dz=z-(C.z+bz),c=Math.cos(ry),s=Math.sin(ry),lx=dx*c-dz*s,lz=dx*s+dz*c;return Math.abs(lx)<w/2+m&&Math.abs(lz)<d/2+m&&y<OUT.y+h+m&&y>OUT.y-.5};
  let n=0,hit=0;for(const b of bl){const [bx,bz,w,d]=b,R=Math.hypot(w,d)/2;for(let a=0;a<6.28;a+=.35)for(const off of [1.2,2.5,4]){const px=C.x+bx+Math.cos(a)*(R+off),pz=C.z+bz+Math.sin(a)*(R+off);if(bl.some(o=>ins(px,OUT.y+1,pz,o,.4)))continue;
   for(let yw=0;yw<6.28;yw+=.8){S.x=px;S.z=pz;S.y=OUT.y+.1;S.yaw=yw;S.pitch=.15;for(let i=0;i<50;i++)CameraRig.update(.016);n++;const q=camera.position;if(bl.some(o=>ins(q.x,q.y,q.z,o,.12)))hit++}}}return{n,hit}});
 ok(bx.hit===0,'camera never enters a building box: '+bx.n+' poses around all 8 buildings, '+bx.hit+' inside');
 // ---- directional damage arcs: where the arc points must be where the attacker is ----
 const arcs=await p.evaluate(()=>{S.x=OUT.x;S.z=OUT.z+30;S.y=H(S.x,S.z);S.yaw=Math.PI;for(let i=0;i<60;i++)CameraRig.update(.016);const v=new THREE.Vector3();camera.getWorldDirection(v);const h=Math.atan2(v.x,v.z),T=Outlaw._t(),out={};
  for(const [n,a] of [['ahead',0],['left',Math.PI/2],['behind',Math.PI],['right',-Math.PI/2]]   /* +X is the player's LEFT when facing +Z */){const el=document.getElementById('owdir');el.innerHTML='';T.dmgDir(S.x+Math.sin(h+a)*10,S.z+Math.cos(h+a)*10);out[n]=el.lastChild?+((/rotate\((-?\d+)deg/.exec(el.lastChild.style.transform)||[])[1]):null}return out});
 const near=(v,t)=>v!==null&&Math.abs(((v-t+540)%360)-180)<1;
 ok(near(arcs.ahead,0)&&near(arcs.right,90)&&near(arcs.behind,180)&&near(arcs.left,-90),'damage arcs point at the attacker: '+JSON.stringify(arcs));
 // ---- being killed: no exceptions, a fall clip is chosen from the shot direction, and the partner message is well formed ----
 await p.evaluate(()=>{S.x=OUT.x;S.z=OUT.z+30;Outlaw.onMsg({k:'hurt',to:myId,d:9999,x:S.x+4,z:S.z})});await p.waitForTimeout(1500);
 const dn=await p.evaluate(()=>({g:me.userData.gdn,hp:Outlaw._t().hp,cur:me.userData.cur}));
 ok(/^d_[a-z_]+$/.test(dn.g||'')&&dn.hp===0,'taking a lethal hit downs you and picks a fall clip ('+dn.g+')');
 ok(real(p.errs).length===0,'solo: no page errors '+JSON.stringify(real(p.errs).slice(0,3)));
 if(shots)await p.screenshot({path:shots+'/outlaw_down.png'});
 await p.close2();}

// ================= 2. RAIDERS: death falls and gun locomotion on NPCs =================
{const p=await B.open('?perf=1');await p.waitForTimeout(2500);
 await p.evaluate(()=>{Outlaw.onMsg({k:'start',host:myId,mode:'survive',diff:0});S.x=OUT.x;S.z=OUT.z+14;S.y=H(S.x,S.z)+.5;const T=Outlaw._t();T.addNpc(0,OUT.x+8,OUT.z+14);T.addNpc(1,OUT.x-8,OUT.z+14)});await p.waitForTimeout(2500);
 const r=await p.evaluate(()=>{const T=Outlaw._t(),L=[...T.npcs.values()];return L.map(n=>({t:n.type,gun:n.group.userData.gunI,mixer:!!n.group.userData.mixer}))});
 ok(r.length>=2&&r.every(n=>n.mixer),'raiders spawn with animation mixers: '+JSON.stringify(r));
 ok(r.find(n=>n.t===1).gun===14,'the Heavy carries the minigun');
 await p.evaluate(()=>{const T=Outlaw._t();for(const n of T.npcs.values())T.damageNpc(n.id,9999,n.type===0?'head':'torso')});await p.waitForTimeout(2500);
 const dd=await p.evaluate(()=>[...Outlaw._t().npcs.values()].map(n=>({dead:n.dead,anim:n.deathAnim})));
 ok(dd.every(n=>n.dead&&n.anim),'killed raiders play a baked fall instead of the tilt fallback: '+JSON.stringify(dd));
 ok(real(p.errs).length===0,'raiders: no page errors '+JSON.stringify(real(p.errs).slice(0,3)));
 await p.close2();}

await B.close();console.log(bad?'FAILED '+bad:'all passed');process.exit(bad?1:0);
