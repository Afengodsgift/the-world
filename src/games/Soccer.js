// Soccer: 1v1 on the pitch west of town (PITCH in data/islands.js), or solo practice.
//
//  - The HOST (whoever pressed "Kick off") simulates the ball and the match; the guest renders snapshots (15 Hz) and sends only its
//    kicks. Dribbling needs no messages: the host sees both players' positions and pushes the ball when someone runs into it.
//  - Kick: tap = pass, hold up to 0.7 s = full-power shot. The kick direction is where you face, nudged toward the opposing goal.
//  - Teams: host = BLUE (attacks the east goal), guest = RED (attacks the west goal). First to 5, or most goals at 3:00
//    (a tie plays on as a golden goal). Solo practice: any goal counts for you, no clock.
//  - Rules from DESIGN.md: new code never writes `S`; it talks through Net / Systems / Interaction, and tuning lives in data/soccer.js.
// Globals used at runtime: THREE, S, others, myId, H, PITCH, SOCCER, Net, Systems, Interaction, Fx, banner, chime, scene, WS (optional).
const Soccer=(()=>{
  const C=SOCCER,P=PITCH,BR=C.ball;
  const st={phase:'idle',host:null,solo:false,a:0,b:0,t:C.match.time,pt:0,pw:0,ts:0,golden:false,note:''};
  const ball={x:P.x,y:BR.r,z:P.z,vx:0,vy:0,vz:0};                    // y = height of the ball's CENTRE above the pitch surface
  const view={x:P.x,y:BR.r,z:P.z};                                    // what is drawn (guests smooth toward the extrapolated snapshot)
  let snap=null,mesh=null,hud=null,kickBtn=null,bar=null,built=false,charging=false,chargeT=0,sendT=0,lastSnapAt=0,hudKey='';
  const trk={},rings=[];
  const now=()=>(typeof performance!=='undefined'?performance.now():Date.now())/1000;
  const isHost=()=>st.host===myId;
  const partner=()=>[...others.entries()][0];
  const pname=()=>{const p=partner();return (p&&p[1].group.userData&&p[1].group.userData.nm)||'Partner'};
  const surf=()=>P.y;                                                 // pitch surface height (terrain is flattened to it)
  const ctr={x:P.x,z:P.z};
  const myTeam=()=>isHost()?'A':'B';
  const goalX=team=>P.x+(team==='A'?1:-1)*C.hw;                       // the goal a team ATTACKS (A -> east, B -> west)

  // ---------- sound (module-local; tiny) ----------
  let AC=null;const ac=()=>{try{AC=AC||new(window.AudioContext||webkitAudioContext)();if(AC.state==='suspended')AC.resume();return AC}catch(e){return null}};
  function tone(f0,f1,len,vol,type){const a=ac();if(!a)return;const o=a.createOscillator(),g=a.createGain(),t=a.currentTime;o.type=type||'sine';o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+len);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+len);o.connect(g);g.connect(a.destination);o.start();o.stop(t+len)}
  const thump=p=>tone(200+p*60,60,.09,.25+.15*p,'triangle');
  const horn=()=>{tone(330,300,.5,.2,'sawtooth');setTimeout(()=>tone(440,420,.5,.2,'sawtooth'),120)};

  // ---------- players (positions only; velocities estimated from movement) ----------
  function track(id,x,z,dt){
    const t=trk[id]||(trk[id]={x,z,vx:0,vz:0,cd:0});
    const d=Math.max(dt,.001);t.vx+=((x-t.x)/d-t.vx)*Math.min(1,dt*10);t.vz+=((z-t.z)/d-t.vz)*Math.min(1,dt*10);t.x=x;t.z=z;t.cd=Math.max(0,t.cd-dt);return t}
  function players(dt){
    const out=[],me_=track(myId,S.x,S.z,dt);
    out.push({id:myId,x:S.x,z:S.z,alt:S.y-H(S.x,S.z),vx:me_.vx,vz:me_.vz,team:myTeam(),t:me_});
    const p=partner();
    if(p&&!st.solo){const gp=p[1].group.position||{x:0,y:0,z:0},t=track(p[0],gp.x,gp.z,dt);
      out.push({id:p[0],x:gp.x,z:gp.z,alt:gp.y-H(gp.x,gp.z),vx:t.vx,vz:t.vz,team:myTeam()==='A'?'B':'A',t})}
    return out}

  // ---------- ball physics (host) ----------
  function phys(dt){
    const b=ball,r=BR.r;
    b.vy+=BR.g*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;
    if(b.y<=r){b.y=r;if(b.vy<-1.4)b.vy=-b.vy*BR.bounce;else b.vy=0;const k=Math.exp(-BR.roll*dt);b.vx*=k;b.vz*=k}
    else{const k=Math.exp(-BR.air*dt);b.vx*=k;b.vz*=k}
    const rx=b.x-P.x,rz=b.z-P.z,mh=C.goalW/2,passes=Math.abs(rz)<mh-r*.4&&b.y<C.goalH-r*.4;   // does the ball fit through the goal mouth?
    if(Math.abs(rx)<=C.hw){
      if(Math.abs(rz)>C.hh-r){b.z=P.z+Math.sign(rz)*(C.hh-r);b.vz=-b.vz*BR.wall}                // side walls
      if(Math.abs(rx)>C.hw-r&&!passes){b.x=P.x+Math.sign(rx)*(C.hw-r);b.vx=-b.vx*BR.wall}        // end walls (except the goal mouth)
    }else{                                                                                       // inside the net
      if(Math.abs(rz)>mh-r){b.z=P.z+Math.sign(rz)*(mh-r);b.vz=-b.vz*BR.wall*.5}
      if(b.y>C.goalH-r){b.y=C.goalH-r;if(b.vy>0)b.vy=-b.vy*.3}
      if(Math.abs(rx)>C.hw+C.goalD-r){b.x=P.x+Math.sign(rx)*(C.hw+C.goalD-r);b.vx*=-.25}
    }
    const sp=Math.hypot(b.vx,b.vz);if(sp>BR.maxSpeed){b.vx*=BR.maxSpeed/sp;b.vz*=BR.maxSpeed/sp}
  }
  // running into the ball pushes it ahead of you
  function touches(pl){
    const b=ball,dx=b.x-pl.x,dz=b.z-pl.z,d=Math.hypot(dx,dz)||1e-3;
    if(d>BR.r+C.touch.reach||pl.alt>1.6||b.y>1.5||pl.t.cd>0)return;
    const nx=dx/d,nz=dz/d,ps=Math.hypot(pl.vx,pl.vz),into=ps>.5?Math.max(0,(pl.vx*nx+pl.vz*nz)/ps):0;
    const push=Math.max(C.touch.minPush,ps*C.touch.carry*(.4+.6*into));
    b.vx=nx*push+pl.vx*.35;b.vz=nz*push+pl.vz*.35;if(b.vy<1)b.vy=.8;
    b.x=pl.x+nx*(BR.r+C.touch.reach+.02);b.z=pl.z+nz*(BR.r+C.touch.reach+.02);pl.t.cd=C.touch.cd;
  }
  function applyKick(v){ball.vx=v[0];ball.vy=v[1];ball.vz=v[2];thump(Math.min(1,Math.hypot(v[0],v[2])/C.kick.full))}

  // ---------- match flow (host) ----------
  function resetBall(){ball.x=ctr.x;ball.z=ctr.z;ball.y=BR.r;ball.vx=ball.vy=ball.vz=0}
  function startMatch(){
    st.host=myId;st.solo=!partner();st.a=st.b=0;st.t=C.match.time;st.golden=false;st.ts=Date.now();st.pt=0;st.pw=0;st.phase='kickoff';resetBall();
    Net.emit('soc',{k:'start',solo:st.solo});
    banner(st.solo?'Practice: score as many as you like':'You are BLUE: attack the east (red) goal','⚽ SOCCER');
  }
  function stopMatch(send){st.phase='idle';st.host=null;resetBall();hudKey='';if(send)Net.emit('soc',{k:'stop'})}
  function goal(team){
    if(st.solo)st.a++;else if(team==='A')st.a++;else st.b++;
    st.phase='goal';st.pt=C.match.goalPause;horn();
    Fx.burst(ball.x,surf()+2,ball.z,team==='A'?'#4aa3ff':'#ff5a5a',22);
    const msg=st.solo?'GOAL! '+st.a:'GOAL! '+(team==='A'?'Blue':'Red')+'  '+st.a+' – '+st.b;
    banner(msg,'⚽ SOCCER');Net.emit('soc',{k:'goal',team,a:st.a,b:st.b});
  }
  function finish(){
    const w=st.a===st.b?'Draw':st.a>st.b?'Blue wins':'Red wins';
    st.phase='over';st.pt=C.match.overPause;
    const mine=isHost()?st.a-st.b:st.b-st.a,res=st.solo?'Practice over: '+st.a+' goals':(mine>0?'You win! ':mine<0?partnerWins():'Draw ')+st.a+' – '+st.b;
    banner(res,'⚽ FULL TIME');Net.emit('soc',{k:'end',a:st.a,b:st.b,solo:st.solo});
    try{if(typeof WS!=='undefined'&&WS.log&&!st.solo)WS.log('soccer','m'+st.ts,{a:st.a,b:st.b})}catch(e){}
  }
  const partnerWins=()=>pname()+' wins ';

  function hostStep(dt){
    const pl=players(dt);
    if(st.phase==='kickoff'){
      st.pw+=dt;
      const here=pl.every(p=>Math.hypot(p.x-ctr.x,p.z-ctr.z)<C.match.startRange);
      if(here||st.pw>C.match.kickoffMax){if(st.pt<=0)st.pt=2.2;st.pt-=dt;if(st.pt<=0){st.phase='play';st.pw=0;banner('Kick off!','⚽ SOCCER')}}
      else{st.pt=0;st.note=!st.solo&&pl.length>1?'Waiting for everyone to reach the pitch…':'Head to the pitch!'}
      return}
    if(st.phase==='goal'){phys(dt);st.pt-=dt;
      if(st.pt<=0){if(!st.solo&&(st.a>=C.match.toWin||st.b>=C.match.toWin||(st.golden&&st.a!==st.b)))finish();else{resetBall();st.phase='kickoff';st.pt=1.6;st.pw=C.match.kickoffMax-4}}
      return}
    if(st.phase==='over'){st.pt-=dt;if(st.pt<=0)stopMatch(true);return}
    if(st.phase!=='play')return;
    for(const p of pl)touches(p);
    phys(dt);
    if(!st.solo){st.t=Math.max(0,st.t-dt);if(st.t<=0&&!st.golden){if(st.a!==st.b)finish();else{st.golden=true;banner('Golden goal!','⚽ SOCCER')}}}
    if(st.phase==='play'&&Math.abs(ball.x-P.x)>C.hw+.05){const east=ball.x>P.x;goal(st.solo?'A':east?'A':'B')}
  }

  // ---------- kicking ----------
  function kickVector(power){
    const rot=S.rot,gx=goalX(st.solo?'A':myTeam()),gdir=Math.atan2(gx-S.x,P.z-S.z);let a=rot,d=gdir-rot;d=Math.atan2(Math.sin(d),Math.cos(d));
    if(Math.abs(d)<C.kick.assist)a=rot+d*.6;                                   // aim help toward the goal you attack
    const sp=C.kick.tap+(C.kick.full-C.kick.tap)*power,lf=C.kick.loft+(C.kick.loftFull-C.kick.loft)*power;
    return [Math.sin(a)*sp,lf,Math.cos(a)*sp];
  }
  function tryKick(power){
    if(st.phase!=='play'&&st.phase!=='goal')return false;
    const b=isHost()?ball:view;if(Math.hypot(b.x-S.x,b.z-S.z)>C.kick.reach||S.y-H(S.x,S.z)>1.8)return false;
    const v=kickVector(power);
    if(isHost())applyKick(v);else{Net.emit('soc',{k:'kick',v:v.map(n=>+n.toFixed(2))});snap={x:view.x,y:view.y,z:view.z,vx:v[0],vy:v[1],vz:v[2],at:now()};thump(power)}
    return true;
  }
  function pressKick(){if(st.phase==='idle'||charging)return;charging=true;chargeT=0}
  function releaseKick(){if(!charging)return;charging=false;const p=Math.min(1,chargeT/C.kick.charge);if(bar)bar.hide();tryKick(p)}

  // ---------- networking ----------
  function onNet(d,from){
    if(!d)return;
    switch(d.k){
      case 'start':st.host=from;st.solo=!!d.solo;st.a=st.b=0;st.t=C.match.time;st.golden=false;st.phase='kickoff';snap=null;lastSnapAt=now();
        banner('Match on! You are RED: attack the west (blue) goal. Head to the pitch.','⚽ SOCCER');break;
      case 's':if(isHost())break;st.phase=d.p;st.a=d.a;st.b=d.b;st.t=d.t;st.golden=!!d.g;st.note=d.n||'';snap={x:d.x,y:d.y,z:d.z,vx:d.vx,vy:d.vy,vz:d.vz,at:now()};lastSnapAt=now();break;
      case 'goal':if(isHost())break;horn();Fx.burst(view.x,surf()+2,view.z,d.team==='A'?'#4aa3ff':'#ff5a5a',22);
        banner(d.team?(d.team==='A'?'Blue':'Red')+' scores  '+d.a+' – '+d.b:'GOAL!','⚽ SOCCER');break;
      case 'end':if(isHost())break;{const mine=d.b-d.a,res=d.solo?'Practice over':(mine>0?'You win! ':mine<0?pname()+' wins ':'Draw ')+d.b+' – '+d.a;banner(res,'⚽ FULL TIME')}break;
      case 'stop':st.phase='idle';st.host=null;hudKey='';break;
      case 'kick':{if(!isHost()||(st.phase!=='play'&&st.phase!=='goal'))break;const p=partner();if(!p)break;const gp=p[1].group.position||{x:0,z:0};
        if(Math.hypot(ball.x-gp.x,ball.z-gp.z)<C.kick.reach+1.2&&Array.isArray(d.v))applyKick(d.v);break}
    }
  }

  // ---------- visuals ----------
  function ballTexture(){
    try{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,128,128);g.fillStyle='#1b1b1f';
      for(const [x,y] of [[22,24],[84,18],[58,62],[110,66],[28,100],[88,108]]){g.beginPath();g.arc(x,y,13,0,6.283);g.fill()}
      return new THREE.CanvasTexture(c)}catch(e){return null}}
  function label(txt){
    try{const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');g.fillStyle='#14361f';g.fillRect(0,0,256,64);g.fillStyle='#fff';g.font='bold 40px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(txt,128,34);
      return new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),side:THREE.DoubleSide})}catch(e){return new THREE.MeshBasicMaterial({color:'#14361f'})}}
  function build(){
    if(built)return;built=true;
    const g=new THREE.Group();g.position.set(P.x,surf(),P.z);scene.add(g);
    const std=(c,o)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.95},o||{})),bas=(c,o)=>new THREE.MeshBasicMaterial(Object.assign({color:c},o||{}));
    const plane=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
    // grass stripes
    const N=8,sw=2*C.hw/N;for(let i=0;i<N;i++){const m=new THREE.Mesh(plane,std(i%2?'#58b252':'#4da84a',{polygonOffset:true,polygonOffsetFactor:-1}));m.scale.set(sw,1,2*C.hh);m.position.set(-C.hw+sw*(i+.5),.03,0);m.receiveShadow=true;g.add(m)}
    // markings
    const wm=bas('#ffffff'),line=(x1,z1,x2,z2,w)=>{const m=new THREE.Mesh(plane,wm),dx=x2-x1,dz=z2-z1;m.scale.set(Math.hypot(dx,dz)+(w||.14),1,w||.14);m.position.set((x1+x2)/2,.05,(z1+z2)/2);m.rotation.y=-Math.atan2(dz,dx);g.add(m)};
    const hw=C.hw,hh=C.hh;line(-hw,-hh,hw,-hh);line(-hw,hh,hw,hh);line(-hw,-hh,-hw,hh);line(hw,-hh,hw,hh);line(0,-hh,0,hh);
    const circ=new THREE.Mesh(new THREE.RingGeometry(4.5,4.65,48).rotateX(-Math.PI/2),wm);circ.position.y=.05;g.add(circ);
    const spot=new THREE.Mesh(new THREE.CircleGeometry(.25,16).rotateX(-Math.PI/2),wm);spot.position.y=.055;g.add(spot);
    for(const s of [-1,1]){const bx=s*(hw-5),bw=7.5;line(s*hw,-bw,bx,-bw);line(s*hw,bw,bx,bw);line(bx,-bw,bx,bw)}   // penalty-area style boxes
    // boards (visual; the physics walls are at hh / hw)
    const bm=std('#f1f0ea'),sm=std('#2f6fd0');
    for(const s of [-1,1]){const bd=new THREE.Mesh(new THREE.BoxGeometry(2*hw+1,.9,.3),bm);bd.position.set(0,.45,s*(hh+.35));bd.castShadow=true;g.add(bd);
      const st2=new THREE.Mesh(new THREE.BoxGeometry(2*hw+1,.25,.32),sm);st2.position.set(0,.75,s*(hh+.35));g.add(st2)}
    for(const e of [-1,1])for(const s of [-1,1]){const seg=hh-C.goalW/2,bd=new THREE.Mesh(new THREE.BoxGeometry(.3,.9,seg),bm);bd.position.set(e*(hw+.35),.45,s*(C.goalW/2+seg/2));bd.castShadow=true;g.add(bd)}
    // goals: posts, bar, nets. East goal belongs to RED (blue attacks it), west to BLUE.
    const netTex=(()=>{try{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.strokeStyle='rgba(255,255,255,.85)';x.lineWidth=2;for(let i=0;i<=64;i+=16){x.beginPath();x.moveTo(i,0);x.lineTo(i,64);x.stroke();x.beginPath();x.moveTo(0,i);x.lineTo(64,i);x.stroke()}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(4,2);return t}catch(e){return null}})();
    const netM=()=>new THREE.MeshBasicMaterial({color:'#ffffff',map:netTex,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false});
    for(const e of [-1,1]){
      const col=e>0?'#e04848':'#3a86e8',fm=std(col,{roughness:.5}),gx=e*hw,gd=C.goalD,gw=C.goalW,gh=C.goalH;
      for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,gh,10),fm);p.position.set(gx,gh/2,s*gw/2);p.castShadow=true;g.add(p);
        const bk=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,gh,8),fm);bk.position.set(gx+e*gd,gh/2,s*gw/2);g.add(bk);
        const side=new THREE.Mesh(new THREE.PlaneGeometry(gd,gh),netM());side.position.set(gx+e*gd/2,gh/2,s*gw/2);g.add(side)}
      const bar=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,gw,10).rotateX(Math.PI/2),fm);bar.position.set(gx,gh,0);g.add(bar);
      const back=new THREE.Mesh(new THREE.PlaneGeometry(gw,gh),netM());back.rotation.y=Math.PI/2;back.position.set(gx+e*gd,gh/2,0);g.add(back);
      const roof=new THREE.Mesh(new THREE.PlaneGeometry(gd,gw),netM());roof.rotation.x=Math.PI/2;roof.position.set(gx+e*gd/2,gh,0);g.add(roof);
    }
    // corner flags + floodlight poles
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,1.5,6),std('#ffffff'));pole.position.set(sx*hw,.75,sz*hh);g.add(pole);
      const fl=new THREE.Mesh(new THREE.PlaneGeometry(.5,.32),bas('#ffd24a',{side:THREE.DoubleSide}));fl.position.set(sx*hw+.25,1.35,sz*hh);g.add(fl);
      const lp=new THREE.Mesh(new THREE.CylinderGeometry(.12,.18,9,8),std('#6b6f78'));lp.position.set(sx*(hw+3),4.5,sz*(hh+3));lp.castShadow=true;g.add(lp);
      const lh=new THREE.Mesh(new THREE.BoxGeometry(1.2,.5,.6),bas('#fff6c8'));lh.position.set(sx*(hw+3),9.1,sz*(hh+3));g.add(lh)}
    // kick-off pad on the town side + sign
    const pad=new THREE.Mesh(new THREE.CylinderGeometry(2.4,2.6,.3,28),std('#3ddc84',{emissive:'#14a85a',emissiveIntensity:.5}));pad.position.set(0,.15,hh+5);g.add(pad);
    const sg=new THREE.Mesh(new THREE.PlaneGeometry(4.2,1.05),label('⚽ KICK OFF'));sg.position.set(0,3.4,hh+5);g.add(sg);g.userData.sign=sg;
    // ball
    mesh=new THREE.Mesh(new THREE.SphereGeometry(BR.r,20,16),new THREE.MeshStandardMaterial({color:'#ffffff',map:ballTexture(),roughness:.5}));mesh.castShadow=true;scene.add(mesh);
    // team rings under the players during a match
    for(const c of ['#4aa3ff','#ff5a5a']){const r=new THREE.Mesh(new THREE.RingGeometry(.5,.68,28).rotateX(-Math.PI/2),bas(c,{transparent:true,opacity:.85,side:THREE.DoubleSide}));r.visible=false;scene.add(r);rings.push(r)}
    // HUD + kick button
    // fallback look + position (theme.css / the landscape block in index.html override these: they use `html #id` / `body #id`)
    const css=document.createElement('style');css.textContent='#sochud{position:fixed;z-index:6;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 112px);padding:6px 14px;border-radius:14px;background:#000a;color:#fff;font:600 17px sans-serif;text-align:center;display:none;pointer-events:none;white-space:nowrap}'
      +'#sockick{position:fixed;z-index:5;right:18px;bottom:calc(env(safe-area-inset-bottom,0px) + 280px);width:72px;height:72px;border-radius:50%;border:0;background:#3ddc84cc;font-size:28px;display:none;touch-action:none;padding:0}'
      +'@media (orientation:landscape) and (pointer:coarse){#sochud{top:calc(var(--st,0px) + 92px)}}';(document.head||document.body).appendChild(css);
    hud=document.createElement('div');hud.id='sochud';document.body.appendChild(hud);
    kickBtn=document.createElement('button');kickBtn.id='sockick';kickBtn.textContent='🦶';document.body.appendChild(kickBtn);
    kickBtn.addEventListener('pointerdown',e=>{pressKick();e.preventDefault()});for(const ev of ['pointerup','pointercancel'])kickBtn.addEventListener(ev,()=>releaseKick());
    addEventListener('keydown',e=>{if(e.code==='KeyK'&&!e.repeat)pressKick()});addEventListener('keyup',e=>{if(e.code==='KeyK')releaseKick()});
    bar=Fx.bar(410);bar.hide();
    Net.on('soc',onNet);Systems.add('soccer',step);
  }

  // ---------- per-frame ----------
  function step(dt){
    if(!built)return;
    const near=Math.hypot(S.x-P.x,S.z-P.z)<230;
    if(mesh)mesh.visible=near;
    if(!near)return;
    if(st.phase!=='idle'){
      if(isHost()){hostStep(dt);sendT-=dt;if(sendT<=0){sendT=Math.max(sendT+1/C.net.rate,-.1);
        Net.emit('soc',{k:'s',x:+ball.x.toFixed(2),y:+ball.y.toFixed(2),z:+ball.z.toFixed(2),vx:+ball.vx.toFixed(2),vy:+ball.vy.toFixed(2),vz:+ball.vz.toFixed(2),a:st.a,b:st.b,t:Math.round(st.t),p:st.phase,g:st.golden?1:0,n:st.note})}
        view.x=ball.x;view.y=ball.y;view.z=ball.z}
      else if(snap){                                                           // guest: extrapolate the snapshot, ease the drawn ball toward it
        const age=Math.min(.25,now()-snap.at),px=snap.x+snap.vx*age,pz=snap.z+snap.vz*age,py=Math.max(BR.r,snap.y+snap.vy*age+.5*BR.g*age*age),k=1-Math.exp(-18*dt);
        view.x+=(px-view.x)*k;view.y+=(py-view.y)*k;view.z+=(pz-view.z)*k;
        if(now()-lastSnapAt>8){st.phase='idle';st.host=null;hudKey=''}         // host went away: drop the match
      }
      if(charging){chargeT+=dt;bar.show('Power',Math.min(1,chargeT/C.kick.charge))}
    }else{view.x=ctr.x;view.y=BR.r;view.z=ctr.z;snap=null}
    // draw the ball (rolls in the direction it moves)
    if(mesh){const px=mesh.position.x,pz=mesh.position.z;mesh.position.set(view.x,surf()+view.y,view.z);
      const dx=view.x-px,dz=view.z-pz,d=Math.hypot(dx,dz);if(d>1e-4&&d<5)mesh.rotateOnWorldAxis(new THREE.Vector3(dz/d,0,-dx/d),d/BR.r)}
    // team rings, HUD, button
    const active=st.phase!=='idle';
    if(kickBtn)kickBtn.style.display=active?'block':'none';
    if(active&&!st.solo){const me_=[S.x,S.z,myTeam()],p=partner();
      rings[0].visible=rings[1].visible=true;
      const setR=(r,x,z,team)=>{r.material.color.set(team==='A'?'#4aa3ff':'#ff5a5a');r.position.set(x,H(x,z)+.08,z)};
      setR(rings[0],S.x,S.z,myTeam());if(p){const gp=p[1].group.position||{x:0,z:0};setR(rings[1],gp.x,gp.z,myTeam()==='A'?'B':'A')}else rings[1].visible=false}
    else{for(const r of rings)r.visible=false}
    // scoreboard
    if(hud){let txt='';
      if(!active)txt='';
      else if(st.solo)txt='⚽ Practice · Goals '+st.a;
      else{const you=isHost()?st.a:st.b,her=isHost()?st.b:st.a,m=Math.floor(st.t/60),s=Math.floor(st.t%60);
        txt=(isHost()?'🔵 ':'🔴 ')+'You '+you+' – '+her+' '+pname()+(isHost()?' 🔴':' 🔵')+'  ·  '+(st.golden?'GOLDEN GOAL':m+':'+(s<10?'0':'')+s)}
      if(active&&st.phase==='kickoff'&&st.note)txt+='<br><small style="font-weight:400">'+st.note+'</small>';
      if(txt!==hudKey){hudKey=txt;hud.innerHTML=txt;hud.style.display=txt?'block':'none'}}
  }

  // ---------- interaction: the kick-off pad on the town side of the pitch ----------
  const padX=P.x,padZ=P.z+C.hh+5,nearPad=()=>Math.hypot(S.x-padX,S.z-padZ)<5;
  Interaction.register('soc-start','Kick off (soccer)',()=>built&&st.phase==='idle'&&nearPad(),startMatch);
  Interaction.register('soc-end','End match',()=>built&&st.phase!=='idle'&&nearPad(),()=>stopMatch(true));

  return {build,pos:{x:P.x,z:P.z},padPos:{x:padX,z:padZ},
    _s:st,_ball:ball,_view:view,_phys:phys,_players:players,_host:hostStep,_start:startMatch,_stop:stopMatch,_kick:tryKick,_kickVec:kickVector,_net:onNet,_step:step,_press:pressKick,_release:releaseKick,_setSnap:s=>{snap=s}};
})();
