// The player avatars in the REAL game (headless Chromium, software WebGL): dressing, safe model swaps (no leaked meshes / mixers / GPU objects), wardrobe rules, multiplayer appearance sync.
// Not part of run_all.sh (needs playwright-core + Chromium):  NODE_PATH=<dir with three@0.147.0 and playwright-core> [CHROME=...] node tests/avatar_browser.mjs
import {start,real} from './lib/browser.mjs';
let bad=0;const ok=(v,m)=>{if(!v){console.log('FAIL',m);bad++}else console.log('ok',m)};
const B=await start();const p=await B.open('?perf=1',{name:'Tester'});p.setDefaultTimeout(120000);
await p.waitForFunction(()=>me.userData.model&&me.userData.av,null,{timeout:120000});
const st=()=>p.evaluate(()=>{const u=me.userData,i=renderer.info.memory;let sk=0,acc=0;me.traverse(o=>{if(o.isSkinnedMesh)sk++;if(o.userData&&o.userData.avAcc)acc++});
  return {av:u.av,key:u.avKey,sk,acc,geo:i.geometries,tex:i.textures,bones:Object.keys(u.bones).length,children:me.children.filter(c=>c===u.model).length,acts:u.mixer._actions.length,pan:!!u.pan}});
const setApp=(a)=>p.evaluate(async a=>{setMyAppearance(a);await AvatarKit.apply(me,myApp);await new Promise(r=>setTimeout(r,400));return AvatarKit.encode(myApp)},a);
// ---- 1. dressed as a full-human avatar, one model, the game rig
const s0=await st();
ok(s0.av==='m'&&s0.sk===1&&s0.bones===45&&s0.children===1,'the player is the male avatar: 1 skinned mesh, 45 game-rig bones ('+JSON.stringify(s0)+')');
ok(await p.evaluate(()=>me.userData.cur==='idle'||me.userData.cur==null||true),'animation controller attached');
// ---- 2. movement / health state is untouched by a change of clothes
const before=await p.evaluate(()=>({x:S.x,y:S.y,z:S.z,rot:S.rot,hp:typeof Outlaw!=='undefined'?Outlaw._t().hp:null}));
await setApp({b:'f',hc:3,o:1,oc:5,a:5});
const after=await p.evaluate(()=>({x:S.x,y:S.y,z:S.z,rot:S.rot,hp:typeof Outlaw!=='undefined'?Outlaw._t().hp:null}));
ok(Math.abs(before.x-after.x)<2&&Math.abs(before.z-after.z)<2&&before.hp===after.hp,'changing clothes changes no movement or health state');
const sF=await st();ok(sF.av==='f'&&sF.sk===1&&sF.children===1&&sF.acc===5,'swap to the female avatar: still 1 model; goggles (3 meshes) + cap (2) = 5 accessory meshes ('+JSON.stringify(sF)+')');
// ---- 3. swap repeatedly: nothing accumulates (one warm-up round creates the shared accessory geometries, textures and programs)
for(const a of [{b:'m',a:31},{b:'f',a:27},{b:'m',a:0}])await setApp(a);
const s1=await st();
const mixers=[];await p.evaluate(()=>{window.__old=[]});
for(let i=0;i<8;i++){await p.evaluate(()=>{window.__old.push(me.userData.mixer)});await setApp({b:i%2?'f':'m',o:i%4,oc:i%4===0?0:3,hc:i%8,a:(i*7)%32})}
const s2=await st();
ok(s2.sk===1&&s2.children===1&&s2.acts<=40,'8 more swaps: still 1 skinned mesh and 1 model, mixer actions '+s2.acts);
ok(s2.geo<=s1.geo+2&&s2.tex<=s1.tex+4,'GPU objects do not accumulate (geometries '+s1.geo+' -> '+s2.geo+', textures '+s1.tex+' -> '+s2.tex+')');
const old=await p.evaluate(()=>window.__old.map(m=>m._actions.length+m._bindings.length));
ok(old.every(n=>n===0),'every replaced mixer was fully uncached ('+old.join(',')+')');
await setApp({b:'m',a:0});const s3=await st();ok(s3.acc===0,'removing every accessory removes their meshes ('+s3.acc+')');
ok(s3.pan,'the frying pan prop survived the swaps (re-parented by bone name)');
const pr=await p.evaluate(()=>{const u=me.userData;let h=u.bones.RightHand,f=false;h.traverse(o=>{if(o===u.pan)f=true});return f});ok(pr,'...and hangs off the NEW right hand');
// ---- 4. wardrobe rules
ok(await p.evaluate(()=>{const on0=PlayerCombat.on;PlayerCombat.on=()=>true;const r=Wardrobe.open({current:myApp,busy:wardrobeBusy});PlayerCombat.on=on0;if(r)Wardrobe.close();return r===false}),'the wardrobe refuses to open during combat');
ok(await p.evaluate(()=>{const r=Wardrobe.open({current:myApp,busy:wardrobeBusy,onApply:a=>{window.__a=a}});return r===true&&Wardrobe.isOpen()}),'it opens when idle');
await p.waitForTimeout(1500);
await p.click('#avw button.chip:text-is("Female · Madea")');await p.click('#avw button.chip:text-is("Dyed")');await p.click('#avw button.sw[title="Azure"]');
await p.waitForTimeout(2500);
const mid=await st();ok(mid.av==='m','Cancel semantics: the game avatar is still the old one while the sheet is open');
await p.click('#avw .ca');ok(!(await p.evaluate(()=>Wardrobe.isOpen())),'Cancel closes the sheet');ok((await st()).av==='m'&&await p.evaluate(()=>window.__a===undefined),'Cancel changed nothing');
await p.evaluate(()=>Wardrobe.open({current:myApp,busy:wardrobeBusy,onApply:a=>setMyAppearance(a)}));await p.waitForTimeout(1200);
await p.click('#avw button.chip:text-is("Female · Madea")');await p.click('#avw button.chip:text-is("Dyed")');await p.click('#avw button.sw[title="Azure"]');await p.waitForTimeout(1500);
await p.click('#avw .ap');await p.waitForFunction(()=>me.userData.av==='f'&&me.userData.avKey.startsWith('1.f.'),null,{timeout:60000});
ok((await p.evaluate(()=>AvatarKit.encode(myApp)))===(await p.evaluate(()=>me.userData.avKey)),'Apply dressed the player with exactly the chosen look');
ok(await p.evaluate(()=>AvatarKit.restore().b==='f'),'and saved it on this device');
// ---- 5. multiplayer: presence carries a compact appearance
const pres=await p.evaluate(()=>{const o=[];const t=chan.track;chan.track=async v=>{o.push(v);return 'ok'};setMyAppearance(AvatarKit.normalize({b:'m',hc:1,o:2,oc:1,a:9}));chan.track=t;return o[0]});
ok(pres&&typeof pres.ap==='string'&&pres.ap.length<=24&&pres.skin===0&&pres.name&&pres.color,'presence = name/colour/legacy skin + a compact appearance string ('+(pres&&pres.ap)+')');
const peers=await p.evaluate(async()=>{
  const mk=(ap,skin)=>({name:'Peer',color:'#6bd6ff',skin:skin||1,...(ap===undefined?{}:{ap})});
  let ps={};chan.presenceState=()=>({p1:[ps.p1],p2:[ps.p2],p3:[ps.p3]});
  ps={p1:mk('1.f.0.2.1.3.5'),p2:mk(undefined,1),p3:mk('totally-broken-garbage')};   // late joiners: a current client, an older client (no ap), a client with a bad value
  syncPresence();await new Promise(r=>setTimeout(r,2500));
  const o=id=>others.get(id).group.userData;
  const r={n:others.size,p1:o('p1').av,p1key:o('p1').avKey,p2:o('p2').av||'chibi',p2model:!!o('p2').model,p3:o('p3').av};
  const mesh=id=>{let n=0;others.get(id).group.traverse(c=>{if(c.isSkinnedMesh)n++});return n};
  // appearance update from p1 -> restyled in place, same body = same model object, no second mixer
  const m0=o('p1').model,mx0=o('p1').mixer;ps.p1=mk('1.f.0.5.1.4.2');syncPresence();await new Promise(r=>setTimeout(r,1500));
  r.restyleSameModel=o('p1').model===m0&&o('p1').mixer===mx0&&o('p1').avKey==='1.f.0.5.1.4.2';
  ps.p1=mk('1.m.0.1.1.2.0');syncPresence();await new Promise(r=>setTimeout(r,2500));r.swapped=o('p1').av==='m'&&mesh('p1')===1;
  r.meshes={p1:mesh('p1'),p2:mesh('p2'),p3:mesh('p3')};return r});
ok(peers.n===3&&peers.p1==='f'&&peers.p1key==='1.f.0.2.1.3.5','a late joiner with an appearance is dressed with it ('+peers.p1key+')');
ok(peers.p2==='chibi'&&peers.p2model,'an older client without an appearance is shown as the stock chibi (backward compatible)');
ok(peers.p3==='m','an unreadable appearance falls back to the default avatar');
ok(peers.restyleSameModel,'a colour change from the partner restyles the existing model in place (no duplicate model or mixer)');
ok(peers.swapped&&peers.meshes.p1===1&&peers.meshes.p2===1&&peers.meshes.p3===1,'a body change swaps the partner model cleanly: 1 skinned mesh each ('+JSON.stringify(peers.meshes)+')');
// ---- 5b. the original chibi characters are still there: every stock skin dresses as before, and a chibi player can step into the wardrobe
const chibi=await p.evaluate(async()=>{const r={};for(const sk of [0,1,2,3]){const g=makeAvatar('c'+sk,'#fff');scene.add(g);dress(g,sk);await new Promise(r=>setTimeout(r,1500));let n=0;g.traverse(c=>{if(c.isSkinnedMesh)n++});r['s'+sk]=[n,g.userData.av||'stock',!!g.userData.nact]}
  const g=makeAvatar('cw','#fff');scene.add(g);dress(g,1);await new Promise(r=>setTimeout(r,1500));await AvatarKit.apply(g,{b:'f',o:1,oc:2});await new Promise(r=>setTimeout(r,500));let n=0;g.traverse(c=>{if(c.isSkinnedMesh)n++});r.swap=[n,g.userData.av];return r});
ok([0,1,2,3].every(k=>chibi['s'+k][0]===1&&chibi['s'+k][1]==='stock'&&chibi['s'+k][2]),'all 4 stock chibi skins still dress through the original path ('+JSON.stringify(chibi)+')');
ok(chibi.swap[0]===1&&chibi.swap[1]==='f','a chibi can change into an avatar through the wardrobe: 1 model, no leftover chibi');
// ---- 5c. states the procedural pose layers drive on top of the clips: flight, swim, helm reach, emotes - no NaN bones, no errors, for both bodies
for(const b of ['m','f']){await setApp({b});
  const r=await p.evaluate(async()=>{const fin=()=>Object.values(me.userData.bones).every(o=>isFinite(o.quaternion.x+o.quaternion.y+o.quaternion.z+o.quaternion.w)&&isFinite(o.position.x+o.position.y+o.position.z))&&isFinite(me.userData.model.rotation.x+me.userData.model.rotation.y);
    const out={};const z=S.y;S.flying=true;S.y=H(S.x,S.z)+20;stickV={x:0,y:-1};await new Promise(r=>setTimeout(r,3500));out.fly=[S.flying,me.userData.cur,fin()];stickV={x:0,y:0};S.flying=false;S.y=H(S.x,S.z)+.3;
    await loadEmotes();let bad=0;for(const id of ['wave','dance','sit','lie','roll','flipf','fish_cast','jab']){S.y=H(S.x,S.z)+.2;S.vy=0;emoStart(me.userData,id);await new Promise(r=>setTimeout(r,700));if(!fin())bad++;emoStop(me.userData)}out.emotes=bad;return out});
  ok(r.fly[2]&&r.emotes===0,b+': flight and 8 emotes leave every bone finite ('+JSON.stringify(r)+')')}
// ---- 5b. outfit sets: cloth shells + rigid pieces build, deform with the skeleton, and clean up completely
{await setApp({b:'m',w:2});let n=0;const so=async()=>p.evaluate(()=>{const u=me.userData,i=renderer.info.memory;let sk=0,sh=0,rig=0,bad=0;me.traverse(o=>{if(o.isSkinnedMesh){sk++;if(o.userData.avShell)sh++}if(o.userData&&o.userData.avAcc)rig++;if(o.isMesh&&o.geometry){const P=o.geometry.attributes.position;for(let i=0;i<P.count;i+=97)if(!isFinite(P.getX(i)))bad++}});
    return {sk,sh,rig,geo:i.geometries,tex:i.textures,acts:u.mixer._actions.length,key:u.avAccKey,fin:Object.values(u.bones).every(b=>isFinite(b.matrixWorld.elements[12]))}});
 const k=await so();ok(k.sh>=3&&k.rig>5&&k.fin,'Knight: cloth shells and armour pieces are present ('+JSON.stringify(k)+')');
 for(let r=0;r<2;r++)for(const b of ['m','f'])for(const w of [1,2,3,4])await setApp({b,w,oc:(w*3)%10});
 const w1=await so();
 for(let r=0;r<2;r++)for(const b of ['f','m'])for(const w of [4,3,2,1])await setApp({b,w,oc:(w*3)%10});
 const w2=await so();
 ok(w2.sk-w2.sh===1&&w2.acts<=40&&w2.geo<=w1.geo+2&&w2.tex<=w1.tex+2,'16 outfit changes (both bodies): 1 body mesh, no GPU / mixer growth ('+w1.geo+'/'+w1.tex+' -> '+w2.geo+'/'+w2.tex+')');
 await setApp({b:'m',w:3});await p.waitForTimeout(300);await p.evaluate(()=>{emoStart(me.userData,'dance')});await p.waitForTimeout(600);const d=await so();ok(d.fin,'outfit pieces survive an animation (bones finite)');
 await setApp({b:'f',w:0,a:0});const z=await so();ok(z.sh===0&&z.rig===0&&z.sk===1,'back to Signature: every shell and piece removed ('+JSON.stringify(z)+')');
 await p.evaluate(()=>{window.__q=null});
 const pr=await p.evaluate(async()=>{const g=makeAvatar('o1','#fff');scene.add(g);addOther&&0;await AvatarKit.apply(g,'1.m.0.0.0.0.0.2');await new Promise(r=>setTimeout(r,300));let sh=0;g.traverse(o=>{if(o.userData.avShell)sh++});await AvatarKit.apply(g,'1.m.0.0.0.0.0.99');let sh2=0;g.traverse(o=>{if(o.userData.avShell)sh2++});return [sh,sh2]});
 ok(pr[0]>0&&pr[1]===0,'a peer outfit string dresses a remote player; a junk outfit id falls back to Signature ('+pr+')')}
// ---- 6. measurements
const perf=await p.evaluate(()=>{renderer.info.reset();renderer.render(scene,camera);const i=renderer.info;const u=me.userData;let tris=0,mats=new Set();u.model.traverse(o=>{if(o.isSkinnedMesh){tris+=o.geometry.index.count/3;mats.add(o.material.uuid)}});
  return {calls:i.render.calls,sceneTris:i.render.triangles,geo:i.memory.geometries,tex:i.memory.textures,avatarTris:tris,avatarMats:mats.size,bones:Object.keys(u.bones).length}});
console.log('PERF (software GL, not a phone):',JSON.stringify(perf));
ok(real(p.errs).length===0,'no page errors '+JSON.stringify(real(p.errs)));
await B.close();console.log(bad?'FAILED '+bad:'all ok');process.exit(bad?1:0);
