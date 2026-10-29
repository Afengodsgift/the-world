// LandWar: the ISLAND ASSAULT. Drop anchor off a pirate-held island, row ashore with your marines and fight a real land battle: cutlass men charge you, musketeers hold the line and shoot, the Captain's camp has a boss with a ground slam, and a second wave pours out of the jungle when the first breaks. Meanwhile pirate ships still hunt your anchored galleon.
//  - The FLEET HOST (lowest id) simulates every fighter (movement on the terrain, aggro, melee, muskets, slam) and streams 7 Hz snapshots on Net 'lw'; guests mirror them. Players hurt only themselves (victim-applies): the host sends {k:'hp',to,d}.
//  - Your guns and cutlass reach them through the same hooks as the pirates on enemy decks: LandWar.targets() (read by Crew.targets() for Outlaw.fire), Crew.hit(id) routes 'L…' ids here, LandWar.meleeTarget() for the slash.
//  - Allied MARINES (your landing party) are the same fighters on team 'a'; they fight the pirates and follow you. More row ashore every 35 s while the crew lives.
//  - Pure helpers for the tests (no THREE): plan, sizeOf, stats, stepFighter.
// Globals at runtime: THREE, scene, S, others, H, ISL, DOCK, Net, Systems, Interaction, Ship, Fleet, Crew, Deckhands, Fx, banner, myId, makeAvatar/dress/animate, Outlaw.
const LandWar=(()=>{
  const R=Math.random,clamp=(a,lo,hi)=>Math.max(lo,Math.min(hi,a)),wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const KIND={cut:{hp:70,spd:5.4,dmg:11,reach:2.0,cd:1.0,gun:-1,col:'#7a2f22',skin:0},mus:{hp:48,spd:3.9,dmg:10,reach:0,cd:1.9,gun:3,col:'#4a5a3a',skin:3},cap:{hp:420,spd:4.6,dmg:17,reach:2.6,cd:.9,gun:-1,col:'#c64bff',skin:2},mar:{hp:95,spd:5.0,dmg:14,reach:2.0,cd:.9,gun:-1,col:'#2f6a9a',skin:1},rif:{hp:70,spd:4.2,dmg:12,reach:0,cd:1.5,gun:3,col:'#3a7ab0',skin:1}};
  const CODE=['cut','mus','cap','mar','rif'];
  const CAP={live:12,slam:{every:9,r:5.5,warn:.9,dmg:30},aggro:70,sight:95};
  const W={on:false,beach:null,camp:null,total:0,spawned:0,queue:[],lvl:1,win:0,cap:false,t:0,wave:1,reinfT:20,beginT:0,nm:''};
  const F=new Map();let nextId=1,built=false,snT=0,decor=null,flagM=null,slamFx=[],atkEnd=0;
  const isHost=()=>typeof Fleet!=='undefined'&&Fleet.isHost();
  const send=p=>{try{Net.emit('lw',p)}catch(e){}};
  // ---------- pure ----------
  const sizeOf=lvl=>({total:Math.min(26,10+3*lvl),first:Math.min(8,5+lvl)});
  function stats(kind,lvl){const K=KIND[kind],m=kind==='mar'||kind==='rif'?1:1+.12*(lvl-1);return {hp:Math.round(K.hp*m),dmg:Math.round(K.dmg*(kind==='mar'||kind==='rif'?1:1+.06*(lvl-1)))}}
  // a landing: an island, the water to anchor in, the beach you land on and the camp inland (all checked against the real terrain)
  function plan(from,Hf,isls,rnd,P){
    P=P||{lo:500,hi:2300};rnd=rnd||R;const c=[];
    for(const I of isls){if(I.n==='Outlaw Isle')continue;const d=Math.hypot(I.x-from.x,I.z-from.z);if(d<P.lo||d>P.hi)continue;
      for(let k=0;k<10;k++){const a0=Math.atan2(from.x-I.x,from.z-I.z)+(k%2?1:-1)*Math.ceil(k/2)*.42,ux=Math.sin(a0),uz=Math.cos(a0);
        let sr=null;for(let r=I.R*1.5;r>0;r-=3){if(Hf(I.x+ux*r,I.z+uz*r)>.6){sr=r;break}}if(sr===null)continue;
        const at=q=>({x:I.x+ux*q,z:I.z+uz*q}),sh=at(sr),beach=at(sr-9),camp=at(sr-62);
        if(Hf(camp.x,camp.z)<1||Hf(beach.x,beach.z)<.4)continue;
        let an=null;for(let q=sr+24;q<=sr+120&&!an;q+=6){const t=at(q);if(Hf(t.x,t.z)>-3)continue;let deep=true;for(const [dx,dz] of [[22,0],[-22,0],[0,22],[0,-22]])if(Hf(t.x+dx,t.z+dz)>-2.4)deep=false;if(deep)an=t}
        if(!an)continue;
        let flat=true;for(let j=1;j<=6;j++){const q=at(sr-j*10),q0=at(sr-(j-1)*10);if(Math.abs(Hf(q.x,q.z)-Hf(q0.x,q0.z))>6)flat=false}if(!flat)continue;
        c.push({isl:I,n:I.n,anchor:{x:Math.round(an.x),z:Math.round(an.z)},beach:{x:Math.round(beach.x),z:Math.round(beach.z)},camp:{x:Math.round(camp.x),z:Math.round(camp.z)},shore:{x:Math.round(sh.x),z:Math.round(sh.z)}});break}}
    return c.length?c[Math.floor(rnd()*c.length)]:null}
  const gy=(x,z)=>typeof H==='function'?H(x,z):0;
  // one fighter's brain. ctx = {foes:[{x,z,id,down}], mates:[{x,z}], dt, now}. Moves f, returns an action {a:'swing'|'shoot'|'slam',tg} or null
  function stepFighter(f,ctx){
    const K=KIND[f.kind],dt=ctx.dt;f.cd-=dt;f.slamT=(f.slamT||0)-dt;if(f.dead)return null;
    let tg=null,td=1e9;for(const t of ctx.foes){if(t.down)continue;const d=Math.hypot(t.x-f.x,t.z-f.z);if(d<td){td=d;tg=t}}
    const alert=f.team==='a'||f.alert||W.alert;
    if(tg&&!f.alert&&td<CAP.aggro&&f.team==='e')f.alert=true;
    let wx=0,wz=0,spd=0,act=null;f.st=0;
    if(!tg||(!alert&&td>CAP.aggro)){                                              // idle: pirates mill about their post, marines stick to the nearest friend
      if(f.team==='a'&&ctx.lead){const d=Math.hypot(ctx.lead.x-f.x,ctx.lead.z-f.z);if(d>7){wx=ctx.lead.x-f.x;wz=ctx.lead.z-f.z;spd=K.spd*.85}}
      else if(f.post){f.wp=(f.wp||0)-dt;if(f.wp<=0){f.wp=2+R()*3;f.wt={x:f.post.x+(R()-.5)*8,z:f.post.z+(R()-.5)*8}}if(f.wt){const d=Math.hypot(f.wt.x-f.x,f.wt.z-f.z);if(d>1.2){wx=f.wt.x-f.x;wz=f.wt.z-f.z;spd=K.spd*.3}}}}
    else{
      const dx=tg.x-f.x,dz=tg.z-f.z,d=td||1;f.rot=Math.atan2(dx,dz);
      if(K.reach>0){                                                                // melee: run in and cut
        if(d>K.reach*.85){wx=dx;wz=dz;spd=K.spd*(f.kind==='cap'?1:1)}
        else if(f.cd<=0){f.cd=K.cd*(.9+R()*.3);act={a:'swing',tg,d:Math.round(K.dmg*f.dm*(.9+R()*.2))}}
        if(f.kind==='cap'&&f.slamT<=0&&d<12){f.slamT=CAP.slam.every;f.slam=CAP.slam.warn;act={a:'slam',x:tg.x,z:tg.z}}}
      else{                                                                         // muskets: hold 12-24 m, strafe, shoot
        if(d>24){wx=dx;wz=dz;spd=K.spd}else if(d<10){wx=-dx;wz=-dz;spd=K.spd*.8}else{f.sd=f.sd||(R()<.5?1:-1);wx=-dz*f.sd;wz=dx*f.sd;spd=K.spd*.35}
        if(f.cd<=0&&d<CAP.sight){f.cd=K.cd*(.8+R()*.5);act={a:'shoot',tg,d:Math.round(K.dmg*f.dm*(.85+R()*.3)),hit:R()<clamp(.55-d/85,.1,.5)}}}}
    if(f.slam>0){f.slam-=dt;spd=0}
    if(spd>0){const L=Math.hypot(wx,wz)||1,nx=f.x+wx/L*spd*dt,nz=f.z+wz/L*spd*dt;
      for(const m of ctx.mates){if(m===f||m.dead)continue;const ddx=nx-m.x,ddz=nz-m.z,dd=Math.hypot(ddx,ddz);if(dd<1.05&&dd>1e-3){wx+=ddx/dd*L*.8;wz+=ddz/dd*L*.8}}      // do not stack on each other
      const L2=Math.hypot(wx,wz)||1,mx=f.x+wx/L2*spd*dt,mz=f.z+wz/L2*spd*dt;
      if(gy(mx,mz)>.2){f.x=mx;f.z=mz;f.st=1}else if(gy(mx,f.z)>.2){f.x=mx;f.st=1}else if(gy(f.x,mz)>.2){f.z=mz;f.st=1}
      if(!(tg&&alert))f.rot=Math.atan2(wx,wz)}
    f.y=gy(f.x,f.z);return act}
  // ---------- host ----------
  function addFighter(kind,team,x,z,opt){
    const st=stats(kind,W.lvl),f=Object.assign({id:'L'+nextId++,kind,team,x,z,y:gy(x,z),rot:0,hp:st.hp,max:st.hp,dm:1,st:0,cd:1+R(),dead:0,deadT:0,alert:false,post:team==='e'?{x,z}:null},opt||{});
    f.dm=st.dmg/KIND[kind].dmg;F.set(f.id,f);return f}
  function begin(o){
    if(!isHost())return;clear();
    Object.assign(W,{on:true,beach:o.beach,camp:o.camp,lvl:o.lvl||1,nm:o.nm||'',t:0,win:0,cap:false,wave:1,reinfT:20,alert:false,beginT:0});
    const S_=sizeOf(W.lvl);W.total=S_.total+1;W.spawned=0;W.queue=[];
    // first garrison around the camp; the rest queue behind (the jungle wave) and the captain waits in the middle
    const cut=Math.ceil(S_.total*.55),mus=S_.total-cut;let n=0;
    const spot=(r)=>{for(let i=0;i<12;i++){const a=R()*6.283,d=3+R()*r,x=W.camp.x+Math.cos(a)*d,z=W.camp.z+Math.sin(a)*d;if(gy(x,z)>.5)return [x,z]}return [W.camp.x,W.camp.z]};
    for(let i=0;i<S_.first;i++){const k=i%3===2?'mus':'cut',p=spot(14);addFighter(k,'e',p[0],p[1]);n++}
    const capHp=KIND.cap.hp*(1+.25*(W.lvl-1)),p=spot(3),c=addFighter('cap','e',p[0],p[1]);c.hp=c.max=Math.round(capHp);W.spawned=n+1;
    for(let i=n;i<S_.total;i++)W.queue.push(i%3===2?'mus':'cut');
    addMarines(4);W.on=true;sendBegin();
    say('ISLAND ASSAULT! Go ashore and take '+(W.nm||'the island')+'. Marines, with me!','🏝 ASSAULT')}
  function addMarines(n){const b=W.beach;if(!b)return;for(let i=0;i<n;i++){const a=R()*6.283,x=b.x+Math.cos(a)*(3+i),z=b.z+Math.sin(a)*(3+i);if(gy(x,z)<.3)continue;addFighter(i%2?'rif':'mar','a',x,z)}}
  function say(t,l){send({k:'bn',t,l});try{banner(t,l)}catch(e){}}
  const sendBegin=()=>send({k:'b',bx:W.beach.x,bz:W.beach.z,cx:W.camp.x,cz:W.camp.z,l:W.lvl,n:W.nm,tot:W.total});
  const players=()=>{const a=[{id:myId,x:S.x,y:S.y,z:S.z,me:1,down:typeof Fleet!=='undefined'&&Fleet._me&&Fleet._me.down>0}];if(typeof others!=='undefined')for(const [id,o] of others)if(o.group)a.push({id,x:o.group.position.x,y:o.group.position.y,z:o.group.position.z});return a};
  const aliveE=()=>{let n=0;for(const f of F.values())if(f.team==='e'&&!f.dead)n++;return n};
  const aliveA=()=>{let n=0;for(const f of F.values())if(f.team==='a'&&!f.dead)n++;return n};
  const killed=()=>W.total-W.queue.length-aliveE();
  function hurtPlayer(to,d,x,z){if(String(to)===String(myId)){try{Fleet.hurtMe(d,x,z);S.hurt=Math.max(S.hurt||0,.25)}catch(e){}}else send({k:'hp',to,d,x,z})}
  function stepHost(dt){
    W.t+=dt;const P=players().filter(p=>!p.me||true),all=[...F.values()],E=all.filter(f=>f.team==='e'&&!f.dead),A=all.filter(f=>f.team==='a'&&!f.dead);
    const ashore=P.filter(p=>Math.hypot(p.x-W.beach.x,p.z-W.beach.z)<260&&gy(p.x,p.z)>.3&&!(p.me&&Ship.onDeck()));
    // reinforcements: the jungle wave comes when the first falls below half; marines row in
    const liveE=E.length;if(W.queue.length&&liveE<CAP.live-3){W.spawnT=(W.spawnT||0)-dt;if(W.spawnT<=0){W.spawnT=1.1;const k=W.queue.shift();if(W.wave===1&&liveE<=Math.ceil(sizeOf(W.lvl).first*.5)){W.wave=2;say('A second wave pours out of the jungle!','🏝 ASSAULT')}
        const a=R()*6.283,x=W.camp.x+Math.cos(a)*40,z=W.camp.z+Math.sin(a)*40,p=gy(x,z)>.5?[x,z]:[W.camp.x,W.camp.z];const f=addFighter(k,'e',p[0],p[1]);f.alert=true;W.spawned++}}
    W.reinfT-=dt;if(W.reinfT<=0){W.reinfT=35;if(A.length<4&&ashore.length)addMarines(1)}
    const lead=ashore.length?ashore[0]:null;
    for(const f of all){
      if(f.dead){f.deadT+=dt;if(f.deadT>12)F.delete(f.id);continue}
      const foes=[];
      if(f.team==='e'){for(const p of ashore)foes.push({x:p.x,z:p.z,id:p.id,down:p.down,p:1});for(const a of A)foes.push({x:a.x,z:a.z,id:a.id,f:a})}
      else for(const e of E)foes.push({x:e.x,z:e.z,id:e.id,f:e});
      const act=stepFighter(f,{dt,foes,mates:all,lead:f.team==='a'?lead:null});
      if(f.slam===undefined)f.slam=0;
      if(!act)continue;
      if(act.a==='swing'){send({k:'sw',id:f.id,tx:act.tg.x,tz:act.tg.z});applyHit(f,act.tg,act.d)}
      else if(act.a==='shoot'){send({k:'sh',id:f.id,tx:act.tg.x,tz:act.tg.z,h:act.hit?1:0});if(act.hit)applyHit(f,act.tg,act.d)}
      else if(act.a==='slam'){send({k:'sl',x:act.x,z:act.z,w:CAP.slam.warn});slamAt(f,act.x,act.z)}}
    snT-=dt;if(snT<=0){snT=.14;send({k:'s',a:[...F.values()].map(f=>[f.id,CODE.indexOf(f.kind),f.team==='a'?1:0,+f.x.toFixed(2),+f.y.toFixed(2),+f.z.toFixed(2),+f.rot.toFixed(2),Math.round(f.hp),f.dead?4:f.st,f.max])})}
    if(Math.floor(W.t)%3===0&&Math.floor((W.t-dt))%3!==0)sendBegin()}
  function applyHit(f,tg,d){if(tg.p||tg.id!==undefined&&!tg.f)hurtPlayer(tg.id,d,f.x,f.z);else if(tg.f&&!tg.f.dead){tg.f.hp-=d;if(tg.f.hp<=0){tg.f.dead=1;tg.f.deadT=0;if(tg.f.kind==='cap'){W.cap=true;say('The Captain is down!','🏝 ASSAULT')}}}}
  function slamAt(f,x,z){setTimeout(()=>{if(f.dead)return;for(const p of players()){if(p.down)continue;const d=Math.hypot(p.x-x,p.z-z);if(d<CAP.slam.r)hurtPlayer(p.id,Math.round(CAP.slam.dmg*(1-d/CAP.slam.r*.5)*f.dm),x,z)}
      for(const a of F.values())if(a.team==='a'&&!a.dead&&Math.hypot(a.x-x,a.z-z)<CAP.slam.r){a.hp-=22;if(a.hp<=0){a.dead=1;a.deadT=0}}},CAP.slam.warn*1000)}
  function hit(id,d,zone){
    if(!isHost()){send({k:'h',id,d,z:zone});const f=F.get(id);if(f)f.flash=.12;return}
    const f=F.get(id);if(!f||f.dead||f.team!=='e')return;f.hp-=d;f.flash=.12;f.alert=true;W.alert=true;
    if(f.hp<=0){f.dead=1;f.deadT=0;f.hp=0;send({k:'d',id});if(f.kind==='cap'){W.cap=true;say('The Captain is down!','🏝 ASSAULT')}}}
  function clear(){for(const f of F.values())dropVis(f);F.clear();W.queue.length=0;slamFx.length=0}
  function end(win){if(isHost())send({k:'e',w:win?1:0});W.on=false;clear();if(decor){scene.remove(decor);decor=null}}
  // ---------- network ----------
  function onNet(d,from){
    if(!d)return;
    switch(d.k){
      case 'b':{if(isHost())break;const was=W.on;Object.assign(W,{on:true,beach:{x:d.bx,z:d.bz},camp:{x:d.cx,z:d.cz},lvl:d.l,nm:d.n,total:d.tot});if(!was)buildDecor();break}
      case 's':{if(isHost())break;const seen=new Set();for(const r of d.a){const [id,k,tm,x,y,z,rot,hp,st,mx]=r;seen.add(id);let f=F.get(id);if(!f){f={id,kind:CODE[k],team:tm?'a':'e',x,y,z,rot,hp,max:mx,st,dead:0,deadT:0,dm:1};F.set(id,f)}
          f.snap=[x,y,z,rot];if(hp<f.hp)f.flash=.12;f.hp=hp;f.max=mx;f.st=st;if(st===4&&!f.dead){f.dead=1;f.deadT=0}}
        for(const [id,f] of [...F])if(!seen.has(id)){dropVis(f);F.delete(id)}break}
      case 'h':{if(isHost())hit(d.id,d.d,d.z);break}
      case 'hp':{if(String(d.to)===String(myId))hurtPlayer(myId,d.d,d.x,d.z);break}
      case 'sw':{const f=F.get(d.id);if(f){f.swing=.3;f.rot=Math.atan2(d.tx-f.x,d.tz-f.z)}break}
      case 'sh':{const f=F.get(d.id);if(f)shotFx(f,d.tx,gy(d.tx,d.tz)+1.2,d.tz,d.h);break}
      case 'sl':{slamWarn(d.x,d.z,d.w);break}
      case 'd':{const f=F.get(d.id);if(f&&!f.dead){f.dead=1;f.deadT=0}break}
      case 'bn':{if(!isHost())try{banner(d.t,d.l)}catch(e){}break}
      case 'e':{if(!isHost()){W.on=false;clear();if(decor){scene.remove(decor);decor=null}}break}}}
  // ---------- visuals ----------
  const haveVis=()=>typeof makeAvatar==='function'&&typeof THREE!=='undefined'&&typeof scene!=='undefined';
  function visual(f){
    if(f.g||!haveVis())return;const K=KIND[f.kind],sc=f.kind==='cap'?1.4:1;
    const g=makeAvatar(f.kind==='cap'?'Captain':f.team==='a'?'Marine':'Pirate',K.col);g.scale.setScalar(sc);g.userData.noTwist=true;g.traverse(o=>{if(o.isSprite){if(f.kind==='cap')o.scale.multiplyScalar(.55);else o.visible=false}});scene.add(g);f.g=g;f.group=g;f.sc=sc;
    try{dress(g,K.skin)}catch(x){}
    if(K.gun>=0&&typeof Outlaw!=='undefined'&&Outlaw.setGun)Outlaw.setGun(g,K.gun);
    const bar=new THREE.Group(),bg=new THREE.Mesh(new THREE.PlaneGeometry(1.1,.13),new THREE.MeshBasicMaterial({color:'#000',depthTest:false,transparent:true,opacity:.6})),fg=new THREE.Mesh(new THREE.PlaneGeometry(1.1,.13),new THREE.MeshBasicMaterial({color:f.team==='a'?'#4aa8ff':f.kind==='cap'?'#c64bff':'#ff4a4a',depthTest:false}));
    bg.renderOrder=10;fg.renderOrder=11;bar.add(bg,fg);bar.position.y=2.35;g.add(bar);f.bar=bar;f.fg=fg}
  function dropVis(f){if(f.g){try{scene.remove(f.g)}catch(e){}f.g=null;f.group=null}}
  function shotFx(f,tx,ty,tz,hit){
    try{Fx.burst(f.x+Math.sin(f.rot)*.7,f.y+1.4,f.z+Math.cos(f.rot)*.7,'#ffd27a',4)}catch(e){}if(f.g)f.g.userData.recoil=1;
    if(!haveVis())return;const a=new THREE.Vector3(f.x,f.y+1.4,f.z),b=new THREE.Vector3(tx,ty,tz),L=a.distanceTo(b);
    const m=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,1,4),new THREE.MeshBasicMaterial({color:hit?'#ff9a6a':'#fff3b0',transparent:true,opacity:.9}));m.position.copy(a).lerp(b,.5);m.scale.y=L;m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());scene.add(m);
    setTimeout(()=>{scene.remove(m);m.geometry.dispose();m.material.dispose()},110)}
  function slamWarn(x,z,w){
    if(!haveVis())return;const m=new THREE.Mesh(new THREE.RingGeometry(CAP.slam.r-.6,CAP.slam.r,36),new THREE.MeshBasicMaterial({color:'#ff3030',transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,gy(x,z)+.2,z);scene.add(m);slamFx.push({m,t:w})}
  function buildDecor(){
    if(!haveVis()||decor||!W.camp)return;decor=new THREE.Group();const c=W.camp;
    try{const pole=new THREE.Mesh(new THREE.CylinderGeometry(.1,.12,7,6),new THREE.MeshStandardMaterial({color:'#4a3018'})),fl=new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.3),new THREE.MeshBasicMaterial({color:'#101010',side:THREE.DoubleSide}));
      pole.position.set(c.x,gy(c.x,c.z)+3.5,c.z);fl.position.set(c.x+1.1,gy(c.x,c.z)+6.1,c.z);decor.add(pole,fl);flagM=fl;
      const cm=new THREE.MeshStandardMaterial({color:'#6b4a24'});for(let i=0;i<7;i++){const a=i*.9,d=5+(i%3)*2.2,b=new THREE.Mesh(new THREE.BoxGeometry(1.1,1,1.1),cm);b.position.set(c.x+Math.cos(a)*d,gy(c.x+Math.cos(a)*d,c.z+Math.sin(a)*d)+.5,c.z+Math.sin(a)*d);b.rotation.y=a;decor.add(b)}
      const bm=new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,1,10),new THREE.MeshStandardMaterial({color:'#6b3a1a'}));bm.position.set(c.x-4,gy(c.x-4,c.z+3)+.5,c.z+3);decor.add(bm)}catch(e){}
    scene.add(decor)}
  function frame(f,dt){
    if(!f.g)return;const g=f.g;g.position.set(f.x,f.y,f.z);let da=wrapA(f.rot-g.rotation.y);g.rotation.y+=da*Math.min(1,dt*12);
    if(f.kind!=='mus'&&f.kind!=='rif'&&g.userData.bones&&!f.sw){f.sw=1;try{Crew.sword(g,true)}catch(e){}}
    if(f.dead){f.deadT+=dt;const q=g.userData;if(f.bar)f.bar.visible=false;const k=Math.min(1,f.deadT/.45);g.rotation.x=-1.45*k;g.position.y=f.y+.12*k;if(f.deadT>9)g.visible=false;return}
    if(f.fg){f.fg.scale.x=Math.max(.001,f.hp/f.max);f.fg.position.x=-(1-f.fg.scale.x)*.55;try{f.bar.lookAt(camera.position)}catch(e){}f.bar.visible=Math.hypot(f.x-S.x,f.z-S.z)<45}
    const q=g.userData;if(f.swing>0){f.swing-=dt;if(f.swing+dt>.29)q.swing=1}
    try{animate(g,dt,f.st===1?'run':'idle')}catch(x){}}
  // ---------- per frame ----------
  function step(dt){
    if(!built||!W.on)return;const host=isHost();
    if(host){if(!W.beach){return}stepHost(dt)}
    else for(const f of F.values()){if(f.snap&&!f.dead){const k=1-Math.exp(-12*dt);f.x+=(f.snap[0]-f.x)*k;f.y+=(f.snap[1]-f.y)*k;f.z+=(f.snap[2]-f.z)*k;f.rot+=wrapA(f.snap[3]-f.rot)*k}}
    const vis=haveVis();for(const f of F.values()){if(vis){if(Math.hypot(f.x-S.x,f.z-S.z)<150)visual(f);else if(f.g&&f.dead)dropVis(f)}f.flash=Math.max(0,(f.flash||0)-dt);frame(f,dt)}
    for(let i=slamFx.length-1;i>=0;i--){const s=slamFx[i];s.t-=dt;s.m.material.opacity=.3+.4*Math.abs(Math.sin(s.t*14));if(s.t<=0){try{Fx.burst(s.m.position.x,s.m.position.y+.5,s.m.position.z,'#c8a060',12)}catch(e){}try{CameraRig.shake(.6)}catch(e){}scene.remove(s.m);s.m.geometry.dispose();s.m.material.dispose();slamFx.splice(i,1)}}
    if(flagM)flagM.rotation.y=Math.sin(Date.now()/400)*.25;
    hud()}
  let hudEl=null,hudKey='';
  function hud(){const t=W.on?'🏝 '+(W.nm||'ASSAULT')+' · pirates '+(host_alive())+' · marines '+aliveA():'';
    if(t!==hudKey){hudKey=t;if(hudEl){hudEl.textContent=t;hudEl.style.display=t?'block':'none'}}}
  const host_alive=()=>{let n=0;for(const f of F.values())if(f.team==='e'&&!f.dead)n++;return n+(isHost()?W.queue.length:0)};
  // ---------- interactions ----------
  const dB=()=>W.beach?Math.hypot(S.x-W.beach.x,S.z-W.beach.z):1e9;
  const shipD=()=>{const sp=Ship._ship;return W.beach?Math.hypot(sp.x-W.beach.x,sp.z-W.beach.z):1e9};
  function ashore(){if(!W.beach)return;const b=W.beach,a=R()*6.283;S.x=b.x+Math.cos(a)*2;S.z=b.z+Math.sin(a)*2;S.y=gy(S.x,S.z)+.1;S.vy=0;S._dk=null;try{Ship._release&&Ship._release()}catch(e){}banner('Ashore! Take the camp — your marines follow.','🏝 ASSAULT')}
  function backAboard(){try{Ship._board()}catch(e){}}
  Interaction.register('lw-ashore','🏝 Go ashore',()=>built&&W.on&&Ship.onDeck()&&shipD()<150,ashore);
  Interaction.register('lw-ship','⛵ Back to the ship',()=>built&&W.on&&!Ship.onDeck()&&dB()<70&&shipD()<150,backAboard);
  function build(){
    if(built)return;built=true;
    try{const css=document.createElement('style');css.textContent='#lwhud{position:fixed;z-index:6;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 66px);padding:5px 12px;border-radius:12px;background:#1a3a5acc;color:#fff;font:800 12px sans-serif;display:none;pointer-events:none;text-shadow:0 1px 2px #000}';
      (document.head||document.body).appendChild(css);hudEl=document.createElement('div');hudEl.id='lwhud';document.body.appendChild(hudEl)}catch(e){}
    try{if(typeof LockOn!=='undefined')LockOn.source('land',()=>{const a=[];if(!W.on)return a;for(const f of F.values())if(f.team==='e'&&!f.dead&&f.group&&f.group.visible)a.push({id:f.id,crew:1,x:f.x,y:f.y,z:f.z,lift:1.5,hp:f.hp,max:f.max,cap:f.kind==='cap'});return a})}catch(e){}
    Net.on('lw',onNet);Systems.add('landwar',step)}
  // pirates for Outlaw.fire() / Crew hooks
  const targets=()=>{const a=[];if(!W.on)return a;for(const f of F.values())if(f.team==='e'&&!f.dead&&f.group&&f.group.userData.bones&&f.group.visible)a.push(f);return a};
  function meleeTarget(x,y,z,fwd,reach){let b=null,bd=reach||3.6;for(const f of F.values()){if(f.dead||f.team!=='e')continue;const dx=f.x-x,dz=f.z-z,d=Math.hypot(dx,dz);if(d>bd||Math.abs(f.y-y)>2.6)continue;if(d>2.4&&Math.abs(wrapA(Math.atan2(dx,dz)-fwd))>1.9)continue;bd=d;b=f}return b?{id:b.id,x:b.x,y:b.y,z:b.z}:null}
  const near=()=>{if(!W.on)return false;for(const f of F.values())if(!f.dead&&f.team==='e'&&Math.hypot(f.x-S.x,f.z-S.z)<45)return true;return false};
  return {build,begin,end,hit,onNet,plan,sizeOf,stats,stepFighter,addFighter,targets,meleeTarget,near,owns:id=>String(id)[0]==='L',W,F,KIND,CAP,state:()=>W,alive:aliveE,allies:aliveA,killed,ashore,backAboard,_step:step,_clear:clear,_players:players};
})();
if(typeof module!=='undefined')module.exports=LandWar;
