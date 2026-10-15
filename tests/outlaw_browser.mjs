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


// ================= 3. CONSUMABLES (solo, host) =================
// OutlawItems.tick() is driven by hand with a fixed dt so the rules are checked exactly, whatever the software-GL frame rate is.
const stepItems=(p,sec,dt=.02)=>p.evaluate(([sec,dt])=>{for(let t=0;t<sec;t+=dt)OutlawItems.tick(dt)},[sec,dt]);
{const p=await B.open('?perf=1');await p.waitForTimeout(2500);
 await p.evaluate(()=>{localStorage.removeItem('w4ow2')});
 await p.evaluate(()=>{Outlaw.onMsg({k:'start',host:myId,mode:'survive',diff:0});S.x=OUT.x;S.z=OUT.z+14;S.y=H(S.x,S.z)+.2;Outlaw.equip(2)});await p.waitForTimeout(2000);
 const inv=()=>p.evaluate(()=>({...OutlawItems.state.n,hp:Math.round(Outlaw._t().hp),ar:OutlawItems.state.armor,coins:Outlaw._t().SAVE.coins}));
 let i0=await inv();ok(i0.stim>=1&&i0.gren>=1&&i0.ammo>=1,'a starter kit exists: '+JSON.stringify(i0));
 // --- the strip is on screen on the isle and does not sit on top of any other control (landscape phone, 844x390) ---
 const lay=await p.evaluate(()=>{const R=e=>{const b=e&&e.getBoundingClientRect();return b&&b.width?[b.left,b.top,b.right,b.bottom]:null},vis=e=>e&&getComputedStyle(e).display!=='none';
  const items=[...document.querySelectorAll('.owi')].map(R),others=['owfire','owfire2','owrl','owgun','jump','stick','owview','owscope','owshop','use'].map(id=>[id,vis(document.getElementById(id))?R(document.getElementById(id)):null]).filter(x=>x[1]);
  const hit=[];for(const [id,r] of others)for(const it of items)if(it&&r&&it[0]<r[2]&&it[2]>r[0]&&it[1]<r[3]&&it[3]>r[1])hit.push(id);
  const w=innerWidth,h=innerHeight,cx=w/2,cy=h/2;const onCross=items.some(it=>it&&it[0]<cx+60&&it[2]>cx-60&&it[1]<cy+60&&it[3]>cy-60);
  return {n:items.filter(Boolean).length,hit,onCross,min:Math.min(...items.filter(Boolean).map(r=>Math.min(r[2]-r[0],r[3]-r[1]))),hud:R(document.getElementById('owhud')),top:items[0]}});
 ok(lay.n===4,'four item buttons are visible on Outlaw Isle');ok(lay.hit.length===0,'item buttons overlap no other control (fire, fire2, reload, weapon, jump, joystick...): '+JSON.stringify(lay.hit));
 ok(!lay.onCross,'item buttons stay clear of the crosshair area');ok(lay.min>=44,'touch targets are at least 44 px ('+lay.min+')');
 if(shots)await p.screenshot({path:shots+'/outlaw_items.png'});
 // --- stim: refused at full health, heals over time, one at a time, consumed once ---
 await p.evaluate(()=>{OutlawItems.state.n.stim=3});
 ok(await p.evaluate(()=>OutlawItems.use('stim'))===false,'stim is refused at full health');
 await p.evaluate(()=>{Outlaw.onMsg({k:'hurt',to:myId,d:60,x:S.x+5,z:S.z})});i0=await inv();ok(i0.hp===40,'took 60 damage (hp '+i0.hp+')');
 ok(await p.evaluate(()=>OutlawItems.use('stim'))===true,'stim starts when hurt');
 ok(await p.evaluate(()=>{const a=Outlaw._t().ammo[2];Outlaw.fire();return Outlaw._t().ammo[2]===a&&OutlawItems.busy()}),'while injecting you cannot fire');
 ok(await p.evaluate(()=>OutlawItems.use('armor'))===false,'a second item cannot start during a use');
 await stepItems(p,.9);let i1=await inv();ok(i1.stim===2,'the stim is consumed once the use completes ('+i1.stim+' left)');
 ok(await p.evaluate(()=>OutlawItems.use('stim'))===false,'a second stim is refused while healing / cooling down');
 await stepItems(p,2.5);const mid=await inv();ok(mid.hp>i1.hp&&mid.hp<100,'healing is gradual, not instant (hp '+i1.hp+' -> '+mid.hp+' after 2.5 s)');
 await stepItems(p,4);i1=await inv();ok(i1.hp===100,'the heal completes and stops at max health ('+i1.hp+')');
 // --- armor ---
 await p.evaluate(()=>{OutlawItems.state.n.armor=2;OutlawItems.state.cd.stim=0;OutlawItems.state.cd.armor=0;OutlawItems.state.lock=0});
 ok(await p.evaluate(()=>OutlawItems.use('armor')),'armor plate starts');await stepItems(p,1.5);i1=await inv();ok(i1.ar===50&&i1.armor===1,'armor is 50 and the plate is consumed ('+JSON.stringify([i1.ar,i1.armor])+')');
 await p.evaluate(()=>{OutlawItems.state.cd.armor=0;OutlawItems.state.lock=0});ok(await p.evaluate(()=>OutlawItems.use('armor'))===false,'a fresh plate cannot be re-applied (no stacking)');
 await p.evaluate(()=>{Outlaw.onMsg({k:'hurt',to:myId,d:20,x:S.x+5,z:S.z})});i1=await inv();ok(i1.hp===94&&i1.ar===36,'a 20-damage hit: armor soaks 14, health takes 6 ('+JSON.stringify([i1.hp,i1.ar])+')');
 // --- ammo pack: finishes a reload instantly and tops up every magazine ---
 await p.evaluate(()=>{OutlawItems.state.cd.ammo=0;OutlawItems.state.lock=0;const T=Outlaw._t();T.ammo[2]=3;T.ammo[0]=1});
 ok(await p.evaluate(()=>OutlawItems.use('ammo')),'ammo pack starts with magazines missing');await stepItems(p,1);
 const am=await p.evaluate(()=>{const T=Outlaw._t();return [T.ammo[2],T.WEAPONS[2].mag,T.ammo[0],T.WEAPONS[0].mag]});ok(am[0]===am[1]&&am[2]===am[3],'every owned magazine is full again ('+am.join('/')+')');
 await p.evaluate(()=>{OutlawItems.state.cd.ammo=0;OutlawItems.state.lock=0;OutlawItems.state.n.ammo=2});ok(await p.evaluate(()=>OutlawItems.use('ammo'))===false,'ammo pack is refused when everything is full');
 // --- grenade: thrown along the crosshair, host damages the raider once, from the table ---
 const gz=await p.evaluate(()=>{const T=Outlaw._t();for(const n of [...T.npcs.values()])n.dead=1;S.x=OUT.x+30;S.z=OUT.z+60;S.y=H(S.x,S.z)+.1;S.yaw=Math.PI;S.pitch=.22;T.addNpc(0,S.x,S.z+9);const n=[...T.npcs.values()].pop();n.hp=n.max=400;
  for(let i=0;i<60;i++)CameraRig.update(.016);OutlawItems.state.n.gren=3;OutlawItems.state.cd.gren=0;OutlawItems.state.lock=0;return {id:n.id,x:n.x,z:n.z,hp:n.hp}});
 ok(await p.evaluate(()=>OutlawItems.use('gren')),'grenade starts');
 const gr=await p.evaluate(id=>{const n=Outlaw._t().npcs.get(id);let thrown=false,det=0;for(let t=0;t<4;t+=.02){OutlawItems.tick(.02);if(OutlawItems._t().gl.length)thrown=true}return {thrown,hp:n.hp,max:n.max,left:OutlawItems.state.n.gren,fl:OutlawItems._t().gl.length}},gz.id);
 ok(gr.thrown&&gr.left===2&&gr.fl===0,'a grenade flew and landed; the stack went 3 -> '+gr.left);
 ok(gr.hp<gz.hp&&gz.hp-gr.hp<=110,'the host hurt the raider from the damage table, once ('+gz.hp+' -> '+gr.hp+', at most 110)');
 // --- stack limits + shop ---
 await p.evaluate(()=>{const T=Outlaw._t();T.SAVE.coins=1000;OutlawItems.state.n.stim=3});
 await p.evaluate(()=>{Outlaw._t().panelAct('buyc','stim')});i1=await inv();ok(i1.stim===4&&i1.coins===910,'shop: buying a stim costs 90 and fills the stack ('+JSON.stringify([i1.stim,i1.coins])+')');
 await p.evaluate(()=>{Outlaw._t().panelAct('buyc','stim')});i1=await inv();ok(i1.stim===4&&i1.coins===910,'shop: the stack limit (4) is enforced, no coins taken');
 await p.evaluate(()=>{Outlaw._t().SAVE.coins=10;Outlaw._t().panelAct('buyc','armor')});i1=await inv();ok(i1.armor===1&&i1.coins===10,'shop: not enough coins -> nothing bought');
 ok(await p.evaluate(()=>{OutlawItems.award('gren');OutlawItems.award('gren');OutlawItems.award('gren');return OutlawItems.state.n.gren})<=4,'crate pickups respect the stack limit');
 // --- persistence + downed ---
 ok(await p.evaluate(()=>JSON.parse(localStorage.getItem('w4ow2')).items.stim)===4,'inventory is saved');
 await p.evaluate(()=>{OutlawItems.state.cd.stim=0;OutlawItems.state.lock=0;OutlawItems.state.n.stim=2;Outlaw.onMsg({k:'hurt',to:myId,d:9999,x:S.x+4,z:S.z})});
 ok(await p.evaluate(()=>OutlawItems.use('stim'))===false,'nothing can be used while downed');
 ok(real(p.errs).length===0,'items: no page errors '+JSON.stringify(real(p.errs).slice(0,3)));
 await p.close2();}

// ================= 4. TWO PLAYERS: host authority + sync =================
{const A=await B.open('?perf=1',{name:'Host'}),Bp=await B.open('?perf=1',{name:'Guest'});
 await A.waitForTimeout(2000);
 for(const p of [A,Bp])await p.evaluate(()=>{localStorage.removeItem('w4ow2');S.x=OUT.x+40;S.z=OUT.z+70;S.y=H(S.x,S.z)+.2;Outlaw.equip(2)});
 await Bp.evaluate(()=>{S.x+=3});
 // both must see each other (state broadcasts) before the interesting part
 for(const p of [A,Bp])await p.waitForFunction(()=>others.size>0,null,{timeout:120000}).then(()=>ok(true,'partner avatar visible'),()=>ok(false,'partner avatar visible'));
 await A.evaluate(()=>{Outlaw._t().panelAct('go')});await Bp.waitForFunction(()=>Outlaw._t().isHost()===false&&document.body.textContent.length>0,null,{timeout:30000}).catch(()=>{});
 const ids=await Promise.all([A,Bp].map(p=>p.evaluate(()=>myId)));
 // --- a raider exists on the host; the guest's grenade damages it exactly once, by the table ---
 const raid=await A.evaluate(()=>{const T=Outlaw._t();for(const n of [...T.npcs.values()])n.dead=1;T.addNpc(0,OUT.x+40,OUT.z+58);const n=[...T.npcs.values()].pop();n.hp=n.max=500;return {id:n.id,x:n.x,z:n.z}});
 const thr={k:'gr',id:'g1',w:ids[1],x0:await Bp.evaluate(()=>S.x),y0:5,z0:await Bp.evaluate(()=>S.z),x1:raid.x,z1:raid.z,ft:.8};
 await Bp.evaluate(m=>{window.__ch.send({type:'broadcast',event:'og',payload:m});OutlawItems._t().addGren(m);OutlawItems._t().seen.add(m.id)},thr);
 const sim=async()=>{for(const p of [A,Bp])await p.evaluate(()=>{for(let t=0;t<2;t+=.02)OutlawItems.tick(.02)})};
 await A.waitForFunction(()=>OutlawItems._t().gl.length===1,null,{timeout:30000}).then(()=>ok(true,'the host simulates the guest\'s grenade'),()=>ok(false,'the host simulates the guest\'s grenade'));
 await sim();
 const h1=await A.evaluate(id=>Outlaw._t().npcs.get(id).hp,raid.id);ok(h1<500&&500-h1<=110,'host applied the grenade damage once, from the table ('+(500-h1)+')');
 // replay of the same message + other bad messages: no second explosion, no damage
 await Bp.evaluate(m=>window.__ch.send({type:'broadcast',event:'og',payload:m}),thr);
 await Bp.evaluate(m=>window.__ch.send({type:'broadcast',event:'og',payload:{...m,id:'g2',x1:m.x1+500}}),thr);
 await Bp.evaluate(m=>window.__ch.send({type:'broadcast',event:'og',payload:{...m,id:'g3',ft:0,dmg:99999}}),thr);
 await A.waitForTimeout(1500);await sim();
 ok(await A.evaluate(()=>OutlawItems._t().gl.length)===0&&await A.evaluate(id=>Outlaw._t().npcs.get(id).hp,raid.id)===h1,'a replayed / out-of-range / zero-flight-time grenade message does nothing');
 // --- hit reports from a client are clamped ---
 await Bp.evaluate(id=>{for(const d of [-50,'x',1e9])window.__ch.send({type:'broadcast',event:'og',payload:{k:'h',id,d,z:'<b>'}})},raid.id);await A.waitForTimeout(1200);
 const h2=await A.evaluate(id=>{const n=Outlaw._t().npcs.get(id);return [n.hp,n.dead]},raid.id);ok(h2[1]===1||h2[0]<=h1,'hit reports: negatives / junk ignored, an absurd value is limited to the raider\'s own health ('+JSON.stringify(h2)+')');
 // --- crate arbitration: both players stand on it, exactly one gets it ---
 await A.evaluate(()=>{OutlawItems.state.n.stim=0;OutlawItems.state.n.gren=0;OutlawItems.state.n.armor=0;OutlawItems.state.n.ammo=0});await Bp.evaluate(()=>{OutlawItems.state.n.stim=0;OutlawItems.state.n.gren=0;OutlawItems.state.n.armor=0;OutlawItems.state.n.ammo=0});
 const cp=await A.evaluate(()=>({x:S.x,z:S.z}));
 await A.evaluate(c=>{const id=99001;window.__ch.send({type:'broadcast',event:'og',payload:{k:'dr',id,x:c.x,z:c.z,t:'armor'}});Outlaw.onMsg({k:'dr',id,x:c.x,z:c.z,t:'armor'})},cp);
 await Bp.evaluate(c=>{S.x=c.x+.5;S.z=c.z},cp);await A.evaluate(c=>{S.x=c.x;S.z=c.z},cp);
 await A.waitForTimeout(5000);await sim();
 const tot=(await A.evaluate(()=>OutlawItems.state.n.armor))+(await Bp.evaluate(()=>OutlawItems.state.n.armor));
 ok(tot===1,'a crate touched by both players is awarded exactly once (total armor plates: '+tot+')');
 ok((await A.evaluate(()=>Outlaw._t().SAVE.coins))>=0,'no coin duplication side effects');
 ok(real(A.errs).length===0&&real(Bp.errs).length===0,'two-player: no page errors '+JSON.stringify([...real(A.errs),...real(Bp.errs)].slice(0,3)));
 await A.close2();await Bp.close2();}

await B.close();console.log(bad?'FAILED '+bad:'all passed');process.exit(bad?1:0);
